/* Builds `docs/esg/Okiru_ESG_Open_Questions.pdf` — the questionnaire we send an
 * ESG expert.
 *
 * WHY A FILLABLE PDF RATHER THAN A DOCUMENT
 *
 * The point of this artefact is to come BACK with answers. A Word document
 * invites the reader to restructure it; a printed PDF invites them to write
 * somewhere we cannot read. So every question here carries a real AcroForm
 * text field: the expert types straight into the file in any PDF reader, saves,
 * and returns it. The questions themselves are locked.
 *
 * WHAT BELONGS IN IT
 *
 * Only questions a DEVELOPER CANNOT ANSWER. Every item is a place where the
 * code has to make an ESG judgement it has no basis for — a band threshold
 * nobody signed off, an emission factor with no cited source, a field whose
 * unit is ambiguous, a rule that only makes sense for a road-freight
 * distributor. Bugs do not go in here; we fix those ourselves.
 *
 * Run: node docs/esg/spec-generator/build_esg_questionnaire.cjs [outPath]
 */
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..", "..");
const { jsPDF } = require(path.join(REPO, "node_modules", "jspdf"));

const OUT = process.argv[2] || path.join(REPO, "docs", "esg", "Okiru_ESG_Open_Questions.pdf");

/* ── Okiru format tokens, same source as the report renderers ───────────── */
const C = {
  ink: [0x23, 0x28, 0x2a],
  inkStrong: [0x10, 0x18, 0x20],
  teal: [0x00, 0x64, 0x7a],
  tealBright: [0x00, 0x91, 0xa8],
  muted: [0x5f, 0x6b, 0x6e],
  rule: [0xd5, 0xde, 0xe0],
  tint: [0xe9, 0xf3, 0xf5],
  white: [0xff, 0xff, 0xff],
  alert: [0xb0, 0x3a, 0x2e],
};

// AcroForm colours go through jsPDF`s colour parser, which wants a CSS hex
// string, not the RGB triples the drawing API takes. Passing an array here
// throws inside putPages and silently drops every form field.
const HEX = { ink: "#23282A" };

// US Letter in points, 1in margins — the template's own page setup.
const PAGE = { w: 612, h: 792, ml: 54, mr: 54, mt: 54, mb: 58 };
const CONTENT_W = PAGE.w - PAGE.ml - PAGE.mr;

const SEVERITY_LABEL = {
  blocker: "Blocks scoring",
  important: "Affects the score",
  "nice-to-have": "Improves the report",
};

/* ── the questions ──────────────────────────────────────────────────────── */
const QUESTIONNAIRE = require("./esg_questions.json");

/* ── rendering ──────────────────────────────────────────────────────────── */
const doc = new jsPDF({ unit: "pt", format: [PAGE.w, PAGE.h], compress: true });
let y = PAGE.mt;
let fieldSeq = 0;

const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
const setText = (c) => doc.setTextColor(c[0], c[1], c[2]);
const setDraw = (c) => doc.setDrawColor(c[0], c[1], c[2]);

function room(need) {
  if (y + need > PAGE.h - PAGE.mb) {
    doc.addPage();
    y = PAGE.mt;
    return true;
  }
  return false;
}

function write(s, o = {}) {
  const size = o.size || 9.5;
  const lh = o.lh || size * 1.32;
  const x = PAGE.ml + (o.indent || 0);
  const w = (o.width || CONTENT_W) - (o.indent || 0);
  doc.setFont("helvetica", o.style || "normal");
  doc.setFontSize(size);
  setText(o.color || C.ink);
  const lines = doc.splitTextToSize(s, w);
  for (const line of lines) {
    room(lh);
    doc.text(line, x, y + size * 0.85);
    y += lh;
  }
  y += o.after == null ? 4 : o.after;
}

function rule(color = C.rule) {
  room(8);
  setDraw(color);
  doc.setLineWidth(0.6);
  doc.line(PAGE.ml, y + 2, PAGE.w - PAGE.mr, y + 2);
  y += 8;
}

/** A multiline text field the expert types into. This is the whole point. */
function answerBox(name, heightPt) {
  room(heightPt + 6);
  setFill(C.tint);
  doc.rect(PAGE.ml, y, CONTENT_W, heightPt, "F");
  setFill(C.tealBright);
  doc.rect(PAGE.ml, y, 2.5, heightPt, "F");

  const field = new doc.AcroFormTextField();
  field.Rect = [PAGE.ml + 6, y + 4, CONTENT_W - 12, heightPt - 8];
  field.fieldName = name;
  field.multiline = true;
  field.fontSize = 9;
  field.color = HEX.ink;
  doc.addField(field);

  y += heightPt + 9;
}

/* ── cover ──────────────────────────────────────────────────────────────── */
setFill(C.inkStrong);
doc.rect(0, 0, PAGE.w, 132, "F");
setFill(C.teal);
doc.circle(PAGE.w - 40, 18, 62, "F");
setFill(C.tealBright);
doc.circle(PAGE.w - 12, 104, 26, "F");

doc.setFont("helvetica", "bold");
doc.setFontSize(7.5);
setText([0x6f, 0xc7, 0xd6]);
doc.text("OKIRU  ·  ESG INTELLIGENCE TOOLKIT", PAGE.ml, 46);
doc.setFontSize(21);
setText(C.white);
doc.text("ESG methodology — open questions", PAGE.ml, 76);
doc.setFont("helvetica", "normal");
doc.setFontSize(10);
setText(C.rule);
doc.text("The judgement calls our system cannot make on its own", PAGE.ml, 96);

y = 152;

write(
  "Everything below is a point where the toolkit has to make an ESG judgement and has no proper basis for it — a threshold nobody has signed off, a factor with no cited source, a field whose unit is ambiguous, or a rule that only holds for a road-freight distributor. These are not software bugs; we fix those ourselves. They are the places where we need your ruling before the number we publish can be defended.",
  { size: 10, after: 8 },
);
write(
  "Please type straight into the shaded boxes and send the file back — every box is an editable form field. Short answers are fine; one or two sentences each is usually enough. Where the honest answer is \"it depends on the company\", say what it depends ON, because that is the rule we need to code.",
  { size: 10, after: 12 },
);

// Who is answering.
room(64);
setDraw(C.rule);
doc.setLineWidth(0.6);
doc.rect(PAGE.ml, y, CONTENT_W, 52);
doc.setFont("helvetica", "bold");
doc.setFontSize(7.5);
setText(C.muted);
doc.text("ANSWERED BY", PAGE.ml + 10, y + 16);
doc.text("DATE", PAGE.ml + CONTENT_W / 2 + 10, y + 16);
["respondent_name", "respondent_date"].forEach((nm, i) => {
  const f = new doc.AcroFormTextField();
  f.Rect = [PAGE.ml + 10 + i * (CONTENT_W / 2), y + 22, CONTENT_W / 2 - 24, 20];
  f.fieldName = nm;
  f.fontSize = 10;
  f.color = HEX.ink;
  doc.addField(f);
});
y += 68;

/* ── sections ───────────────────────────────────────────────────────────── */
let n = 0;
for (const section of QUESTIONNAIRE.sections) {
  room(96);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setText(C.tealBright);
  room(14);
  doc.text(section.kicker.toUpperCase(), PAGE.ml, y + 8);
  y += 16;
  write(section.title, { size: 14, style: "bold", color: C.teal, after: 2 });
  if (section.blurb) write(section.blurb, { size: 9, color: C.muted, after: 6 });
  rule(C.teal);

  for (const q of section.questions) {
    n += 1;
    const boxH = q.boxHeight || 46;
    // Keep the question and its answer box together.
    const need = 14 + 30 + boxH + 14;
    room(need);

    // number + severity
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    setText(C.teal);
    doc.text(`Q${n}`, PAGE.ml, y + 9);
    const sev = SEVERITY_LABEL[q.severity] || "";
    if (sev) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      setText(q.severity === "blocker" ? C.alert : C.muted);
      doc.text(sev.toUpperCase(), PAGE.w - PAGE.mr, y + 9, { align: "right" });
    }
    y += 14;

    write(q.question, { size: 10.5, style: "bold", color: C.inkStrong, indent: 22, after: 3 });
    if (q.context) {
      write(`Today: ${q.context}`, { size: 8.5, color: C.muted, indent: 22, after: 6 });
    }
    answerBox(`q${n}`, boxH);
  }
}

/* ── closing ────────────────────────────────────────────────────────────── */
room(120);
y += 4;
write("Anything we have not asked", { size: 14, style: "bold", color: C.teal, after: 2 });
write(
  "If something in the toolkit is wrong in a way these questions do not reach — a calculation that does not match practice, a metric that should not be scored at all, an omission that matters more than the ones listed — please say so here.",
  { size: 9, color: C.muted, after: 8 },
);
answerBox("anything_else", 90);

/* ── footer on every page ───────────────────────────────────────────────── */
const total = doc.getNumberOfPages();
for (let p = 1; p <= total; p += 1) {
  doc.setPage(p);
  setDraw(C.rule);
  doc.setLineWidth(0.6);
  doc.line(PAGE.ml, PAGE.h - PAGE.mb + 16, PAGE.w - PAGE.mr, PAGE.h - PAGE.mb + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  setText(C.muted);
  doc.text(QUESTIONNAIRE.stamp, PAGE.ml, PAGE.h - PAGE.mb + 28);
  doc.text(`${p} of ${total}`, PAGE.w - PAGE.mr, PAGE.h - PAGE.mb + 28, { align: "right" });
}

doc.setProperties({
  title: "Okiru ESG — methodology open questions",
  subject: "Questions for an ESG expert: thresholds, factors, formats and generality",
  author: "Okiru",
  creator: "Okiru ESG Intelligence Toolkit",
});

fs.writeFileSync(OUT, Buffer.from(doc.output("arraybuffer")));
console.log(`wrote ${OUT}  (${n} questions, ${total} pages)`);
