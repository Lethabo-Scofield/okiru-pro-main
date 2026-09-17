/* Builds `docs/security/Okiru_Security_and_POPIA_Disclosure.pdf` — the vendor
 * due-diligence pack we hand to a client's IT function.
 *
 * WHY EVERY LINE IN HERE WAS VERIFIED AGAINST THE LIVE SYSTEM
 *
 * A security disclosure is tested. The reader runs `nslookup`, asks for a
 * restore, requests the sub-processor list, and checks whether the region you
 * claimed is the region the resource is actually in. One overstatement and the
 * whole document is treated as marketing. So the content below was read off the
 * running cluster, the Azure resource graph, the deployed secrets' key names and
 * the source, on 16 September 2026 — not from memory or from intent.
 *
 * It states gaps as plainly as controls. A due-diligence reader who finds an
 * unlisted gap assumes there are others; a reader who sees the gaps listed with
 * owners and dates is being given something they can actually assess.
 *
 * Run: node docs/security/build_security_disclosure.cjs [outPath]
 */
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const { jsPDF } = require(path.join(REPO, "node_modules", "jspdf"));
const autoTable = require(path.join(REPO, "node_modules", "jspdf-autotable")).default;

const OUT =
  process.argv[2] || path.join(__dirname, "Okiru_Security_and_POPIA_Disclosure.pdf");
const CONTENT = require("./security_disclosure.json");

/* ── Okiru format tokens, same source as the report renderers ───────────── */
const C = {
  ink: [0x23, 0x28, 0x2a],
  inkStrong: [0x10, 0x18, 0x20],
  teal: [0x00, 0x64, 0x7a],
  tealBright: [0x00, 0x91, 0xa8],
  tealLight: [0x6f, 0xc7, 0xd6],
  muted: [0x5f, 0x6b, 0x6e],
  rule: [0xd5, 0xde, 0xe0],
  tint: [0xe9, 0xf3, 0xf5],
  tintFaint: [0xf4, 0xf8, 0xf9],
  white: [0xff, 0xff, 0xff],
  alert: [0xb0, 0x3a, 0x2e],
  amber: [0xb0, 0x7b, 0x2e],
};

const PAGE = { w: 612, h: 792, ml: 54, mr: 54, mt: 62, mb: 58 };
const CW = PAGE.w - PAGE.ml - PAGE.mr;

const doc = new jsPDF({ unit: "pt", format: [PAGE.w, PAGE.h], compress: true });
let y = PAGE.mt;

const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
const text_ = (c) => doc.setTextColor(c[0], c[1], c[2]);
const draw = (c) => doc.setDrawColor(c[0], c[1], c[2]);

function room(need) {
  if (y + need > PAGE.h - PAGE.mb) {
    doc.addPage();
    y = PAGE.mt;
  }
}

function write(s, o = {}) {
  const size = o.size || 9.5;
  const lh = o.lh || size * 1.36;
  const x = PAGE.ml + (o.indent || 0);
  doc.setFont("helvetica", o.style || "normal");
  doc.setFontSize(size);
  text_(o.color || C.ink);
  for (const line of doc.splitTextToSize(s, CW - (o.indent || 0))) {
    room(lh);
    doc.text(line, x, y + size * 0.85);
    y += lh;
  }
  y += o.after == null ? 5 : o.after;
}

function heading(kicker, title) {
  room(70);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  text_(C.tealBright);
  doc.text(kicker.toUpperCase(), PAGE.ml, y + 8);
  y += 15;
  write(title, { size: 14, style: "bold", color: C.teal, after: 3 });
  draw(C.teal);
  doc.setLineWidth(0.8);
  doc.line(PAGE.ml, y, PAGE.w - PAGE.mr, y);
  y += 10;
}

function table(head, rows, widths) {
  room(60);
  const colStyles = {};
  const sum = widths.reduce((a, b) => a + b, 0);
  widths.forEach((w, i) => {
    colStyles[i] = { cellWidth: (w / sum) * CW };
  });
  autoTable(doc, {
    head: [head],
    body: rows,
    startY: y,
    margin: { left: PAGE.ml, right: PAGE.mr, top: PAGE.mt, bottom: PAGE.mb },
    tableWidth: CW,
    columnStyles: colStyles,
    styles: {
      font: "helvetica",
      fontSize: 7.6,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: C.ink,
      lineColor: C.rule,
      lineWidth: { top: 0, bottom: 0.4, left: 0, right: 0 },
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: C.teal,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 7.6,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: C.tintFaint },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const v = String(d.cell.raw ?? "");
      if (v === "Open" || v === "High") {
        d.cell.styles.textColor = C.alert;
        d.cell.styles.fontStyle = "bold";
      } else if (v === "Medium" || v === "Partial") {
        d.cell.styles.textColor = C.amber;
        d.cell.styles.fontStyle = "bold";
      } else if (v === "In place" || v === "Yes") {
        d.cell.styles.textColor = C.teal;
        d.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 12;
}

function callout(label, body, tone = "teal") {
  const accent = tone === "alert" ? C.alert : tone === "amber" ? C.amber : C.teal;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(body, CW - 26);
  const h = 20 + lines.length * 12 + 8;
  room(h + 10);
  fill(C.tint);
  doc.rect(PAGE.ml, y, CW, h, "F");
  fill(accent);
  doc.rect(PAGE.ml, y, 3, h, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  text_(accent);
  doc.text(label.toUpperCase(), PAGE.ml + 13, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  text_(C.ink);
  let iy = y + 26;
  for (const l of lines) {
    doc.text(l, PAGE.ml + 13, iy);
    iy += 12;
  }
  y += h + 12;
}

/* ── cover ──────────────────────────────────────────────────────────────── */
fill(C.inkStrong);
doc.rect(0, 0, PAGE.w, 150, "F");
fill(C.teal);
doc.circle(PAGE.w - 34, 16, 60, "F");
fill(C.tealBright);
doc.circle(PAGE.w - 8, 112, 24, "F");
doc.setFont("helvetica", "bold");
doc.setFontSize(7.5);
text_(C.tealLight);
doc.text("OKIRU  ·  ESG INTELLIGENCE PLATFORM", PAGE.ml, 48);
doc.setFontSize(19);
text_(C.white);
doc.text(CONTENT.title, PAGE.ml, 80);
doc.setFont("helvetica", "normal");
doc.setFontSize(10);
text_(C.rule);
doc.text(CONTENT.subtitle, PAGE.ml, 102);
doc.setFontSize(8);
text_(C.tealLight);
doc.text(CONTENT.meta, PAGE.ml, 126);

y = 172;
for (const p of CONTENT.intro) write(p, { size: 10, after: 8 });
callout(CONTENT.verification.label, CONTENT.verification.body);

/* ── sections ───────────────────────────────────────────────────────────── */
for (const s of CONTENT.sections) {
  heading(s.kicker, s.title);
  for (const b of s.blocks) {
    if (b.kind === "p") write(b.text, { after: 7 });
    else if (b.kind === "table") table(b.head, b.rows, b.widths);
    else if (b.kind === "callout") callout(b.label, b.text, b.tone);
    else if (b.kind === "bullets")
      for (const it of b.items) write(`•   ${it}`, { indent: 10, after: 3 });
  }
}

/* ── footer ─────────────────────────────────────────────────────────────── */
const total = doc.getNumberOfPages();
for (let p = 1; p <= total; p += 1) {
  doc.setPage(p);
  draw(C.rule);
  doc.setLineWidth(0.6);
  doc.line(PAGE.ml, PAGE.h - PAGE.mb + 16, PAGE.w - PAGE.mr, PAGE.h - PAGE.mb + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  text_(C.muted);
  doc.text(CONTENT.stamp, PAGE.ml, PAGE.h - PAGE.mb + 28);
  doc.text(`${p} of ${total}`, PAGE.w - PAGE.mr, PAGE.h - PAGE.mb + 28, { align: "right" });
}

doc.setProperties({
  title: CONTENT.title,
  subject: CONTENT.subtitle,
  author: "Okiru",
  creator: "Okiru ESG Intelligence Platform",
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(doc.output("arraybuffer")));
console.log(`wrote ${OUT} (${total} pages)`);
