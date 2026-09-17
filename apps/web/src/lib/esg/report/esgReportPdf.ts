/**
 * Renders the Disclosure Pack to PDF — the same block list the DOCX renderer
 * consumes, so the two cannot drift apart.
 *
 * `jspdf` and `jspdf-autotable` are already dependencies of apps/web. autoTable
 * handles the one genuinely hard part of a report this dense: a fourteen-column
 * appendix table that has to break across pages and repeat its header band.
 *
 * The lockdown here is real PDF encryption, not a UI convention: an owner
 * password is set and the permission set is reduced to printing. A recipient
 * can read and print the disclosure record; they cannot edit it, and they
 * cannot lift the content out to re-present it under another cover.
 *
 * The DRAFT watermark is drawn on EVERY page after layout, from the page count
 * jsPDF reports — the same no-override rule the DOCX applies.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { EsgDocBlock } from "./esgReportDocument";
import { buildDisclosurePack, versionStamp } from "./esgReportDocument";
import type { EsgReportModel } from "./esgReportModel";
import {
  ESG_RAG_COLOR,
  ESG_REPORT_COLORS as C,
  PDF_PAGE as P,
  hexToRgb,
  reportHeaderText,
} from "./esgReportTheme";

const FONT = "helvetica"; // jsPDF's metric-compatible stand-in for Calibri.

type Cursor = { y: number };

function ensureRoom(doc: jsPDF, cur: Cursor, needed: number): void {
  if (cur.y + needed > P.heightPt - P.marginBottomPt) {
    doc.addPage();
    cur.y = P.marginTopPt;
  }
}

function text(
  doc: jsPDF,
  cur: Cursor,
  s: string,
  opts: {
    size?: number;
    color?: string;
    style?: "normal" | "bold" | "italic";
    after?: number;
    before?: number;
    indent?: number;
    lineHeight?: number;
    maxWidth?: number;
  } = {},
): void {
  const size = opts.size ?? 10;
  const lh = opts.lineHeight ?? size * 1.32;
  const indent = opts.indent ?? 0;
  const width = (opts.maxWidth ?? P.widthPt - P.marginLeftPt - P.marginRightPt) - indent;
  doc.setFont(FONT, opts.style ?? "normal");
  doc.setFontSize(size);
  doc.setTextColor(...hexToRgb(opts.color ?? C.ink));
  const lines = doc.splitTextToSize(s, width) as string[];
  cur.y += opts.before ?? 0;
  for (const line of lines) {
    ensureRoom(doc, cur, lh);
    doc.text(line, P.marginLeftPt + indent, cur.y + size * 0.85);
    cur.y += lh;
  }
  cur.y += opts.after ?? 4;
}

function hrule(doc: jsPDF, cur: Cursor, color: string = C.rule): void {
  ensureRoom(doc, cur, 8);
  doc.setDrawColor(...hexToRgb(color));
  doc.setLineWidth(0.6);
  doc.line(P.marginLeftPt, cur.y + 2, P.widthPt - P.marginRightPt, cur.y + 2);
  cur.y += 8;
}

function renderTable(
  doc: jsPDF,
  cur: Cursor,
  head: string[],
  rows: string[][],
  widthsPct: number[] | undefined,
  ragColumn: number,
): void {
  const usable = P.widthPt - P.marginLeftPt - P.marginRightPt;
  const pcts =
    widthsPct && widthsPct.length === head.length
      ? widthsPct
      : Array.from({ length: head.length }, () => 100 / head.length);
  const sum = pcts.reduce((a, x) => a + x, 0) || 100;
  const columnStyles: Record<number, { cellWidth: number }> = {};
  pcts.forEach((p, i) => {
    columnStyles[i] = { cellWidth: (p / sum) * usable };
  });

  // Dense appendix tables need a smaller face or they wrap into unreadable
  // columns. The threshold is where the template's own tables stop fitting.
  const fontSize = head.length >= 11 ? 5.4 : head.length >= 8 ? 6.2 : 7.4;

  autoTable(doc, {
    head: [head],
    body: rows.length ? rows : [head.map(() => "—")],
    startY: cur.y + 2,
    margin: { left: P.marginLeftPt, right: P.marginRightPt, top: P.marginTopPt, bottom: P.marginBottomPt },
    tableWidth: usable,
    columnStyles,
    styles: {
      font: FONT,
      fontSize,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      textColor: hexToRgb(C.ink),
      lineColor: hexToRgb(C.rule),
      lineWidth: { top: 0, bottom: 0.4, left: 0, right: 0 },
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: hexToRgb(C.teal),
      textColor: hexToRgb(C.white),
      fontStyle: "bold",
      fontSize,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: hexToRgb(C.tintFaint) },
    // The RAG column is the one place colour carries meaning rather than style.
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== ragColumn) return;
      const v = String(data.cell.raw ?? "");
      const c = ESG_RAG_COLOR[v];
      if (c) {
        data.cell.styles.textColor = hexToRgb(c);
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  cur.y = (finalY ?? cur.y) + 10;
}

function renderBlock(doc: jsPDF, cur: Cursor, blk: EsgDocBlock, model: EsgReportModel): void {
  switch (blk.kind) {
    case "cover": {
      cur.y = P.marginTopPt + 150;
      text(doc, cur, "OKIRU ESG INTELLIGENCE TOOLKIT", { size: 8, color: C.teal, style: "bold", after: 12 });
      text(doc, cur, blk.title, { size: 28, color: C.inkStrong, style: "bold", after: 2 });
      text(doc, cur, blk.subtitle, { size: 16, color: C.teal, after: 12 });
      hrule(doc, cur, C.teal);
      cur.y += 6;
      renderTable(doc, cur, ["", ""], blk.rows.map(([k, v]) => [k, v]), [28, 72], -1);
      if (model.meta.isDraft) {
        text(
          doc,
          cur,
          "DRAFT — this report has not been signed off by a named officer of the entity and may not be issued.",
          { size: 9, color: C.alert, style: "bold", before: 10 },
        );
      }
      doc.addPage();
      cur.y = P.marginTopPt;
      return;
    }
    case "h1": {
      if (blk.pageBreakBefore && cur.y > P.marginTopPt + 4) {
        doc.addPage();
        cur.y = P.marginTopPt;
      } else {
        cur.y += 12;
      }
      ensureRoom(doc, cur, 40);
      text(doc, cur, blk.text, { size: 15, color: C.teal, style: "bold", after: 2 });
      hrule(doc, cur);
      return;
    }
    case "h2":
      ensureRoom(doc, cur, 36);
      text(doc, cur, blk.text, { size: 12, color: C.inkStrong, style: "bold", before: 8, after: 4 });
      return;
    case "h3":
      ensureRoom(doc, cur, 28);
      text(doc, cur, blk.text, { size: 10, color: C.tealBright, style: "bold", before: 6, after: 3 });
      return;
    case "p":
      text(doc, cur, blk.text, { size: 9.5, after: 7 });
      return;
    case "bullets":
      for (const it of blk.items) text(doc, cur, `•   ${it}`, { size: 9.5, indent: 12, after: 3 });
      cur.y += 4;
      return;
    case "numbered":
      blk.items.forEach((it, i) => text(doc, cur, `${i + 1}.   ${it}`, { size: 9.5, indent: 12, after: 3 }));
      cur.y += 4;
      return;
    case "callout": {
      const usable = P.widthPt - P.marginLeftPt - P.marginRightPt;
      doc.setFont(FONT, "normal");
      doc.setFontSize(9.5);
      const bodyLines = doc.splitTextToSize(blk.text, usable - 24) as string[];
      const boxH = 18 + bodyLines.length * 12.5 + 8;
      ensureRoom(doc, cur, boxH + 8);
      doc.setFillColor(...hexToRgb(C.tint));
      doc.rect(P.marginLeftPt, cur.y, usable, boxH, "F");
      doc.setFillColor(...hexToRgb(C.teal));
      doc.rect(P.marginLeftPt, cur.y, 3, boxH, "F");
      const inner: Cursor = { y: cur.y + 6 };
      doc.setFont(FONT, "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...hexToRgb(C.teal));
      doc.text(blk.label.toUpperCase(), P.marginLeftPt + 12, inner.y + 6);
      inner.y += 14;
      doc.setFont(FONT, "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...hexToRgb(C.ink));
      for (const line of bodyLines) {
        doc.text(line, P.marginLeftPt + 12, inner.y + 8);
        inner.y += 12.5;
      }
      cur.y += boxH + 10;
      return;
    }
    case "table": {
      if (blk.caption) text(doc, cur, blk.caption, { size: 8, color: C.muted, style: "italic", after: 1 });
      const ragIdx = blk.head.findIndex((h) => h === "RAG" || h === "Status");
      renderTable(doc, cur, blk.head, blk.rows, blk.widths, ragIdx);
      return;
    }
    case "kv":
      renderTable(doc, cur, ["", ""], blk.rows.map(([k, v]) => [k, v]), [30, 70], -1);
      return;
    case "note":
      text(doc, cur, blk.text, { size: 8.5, color: C.muted, style: "italic", after: 8 });
      return;
    case "spacer":
      cur.y += 12;
      return;
  }
}

/** Header rule, footer stamp, page number and (when unsigned) the watermark. */
function decoratePages(doc: jsPDF, model: EsgReportModel): void {
  const total = doc.getNumberOfPages();
  const stamp = versionStamp(model);
  const headerText = reportHeaderText(model.meta.entityName, model.meta.reportTitle, model.meta.reportVersion);
  const status = model.meta.isDraft ? "DRAFT — NOT FOR ISSUE" : "FINAL — APPROVED";

  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);

    // Watermark first, so page content sits over it.
    if (model.meta.isDraft) {
      const gs = (doc as unknown as { GState?: (o: { opacity: number }) => unknown }).GState;
      const setG = (doc as unknown as { setGState?: (s: unknown) => void }).setGState;
      if (gs && setG) setG.call(doc, gs.call(doc, { opacity: 0.12 }));
      doc.setFont(FONT, "bold");
      doc.setFontSize(96);
      doc.setTextColor(...hexToRgb(C.alert));
      doc.text("DRAFT", P.widthPt / 2, P.heightPt / 2, { align: "center", angle: 38, baseline: "middle" });
      if (gs && setG) setG.call(doc, gs.call(doc, { opacity: 1 }));
    }

    if (p > 1) {
      doc.setFont(FONT, "normal");
      doc.setFontSize(7);
      doc.setTextColor(...hexToRgb(C.muted));
      doc.text(headerText.toUpperCase(), P.marginLeftPt, P.marginTopPt - 14);
      doc.setDrawColor(...hexToRgb(C.rule));
      doc.setLineWidth(0.6);
      doc.line(P.marginLeftPt, P.marginTopPt - 9, P.widthPt - P.marginRightPt, P.marginTopPt - 9);
    }

    const footY = P.heightPt - P.marginBottomPt + 22;
    doc.setDrawColor(...hexToRgb(C.rule));
    doc.setLineWidth(0.6);
    doc.line(P.marginLeftPt, footY - 10, P.widthPt - P.marginRightPt, footY - 10);
    doc.setFont(FONT, "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...hexToRgb(model.meta.isDraft ? C.alert : C.teal));
    doc.text(status, P.marginLeftPt, footY);
    doc.setFont(FONT, "normal");
    doc.setTextColor(...hexToRgb(C.muted));
    doc.text(stamp, P.marginLeftPt + doc.getTextWidth(status) + 8, footY);
    doc.text(`${p} of ${total}`, P.widthPt - P.marginRightPt, footY, { align: "right" });
  }
}

export type PdfLockdown = {
  /** Owner password. Without one, "locked" would be a label rather than a lock. */
  ownerPassword: string;
};

/**
 * Build the locked PDF. `ownerPassword` restricts the document to printing;
 * there is no user password, so the recipient opens it without a prompt and
 * still cannot edit, copy or re-assemble it.
 */
export function renderEsgReportPdf(model: EsgReportModel, lock: PdfLockdown): Blob {
  const doc = new jsPDF({
    unit: "pt",
    format: [P.widthPt, P.heightPt],
    orientation: "portrait",
    compress: true,
    encryption: {
      ownerPassword: lock.ownerPassword,
      userPermissions: ["print"],
    },
  });

  doc.setProperties({
    title: `${model.meta.entityName} — ${model.meta.reportTitle}`,
    subject: `ESG disclosure record for ${model.meta.reportingPeriod}`,
    author: model.meta.preparedBy,
    keywords: `${model.meta.generationReference}, ${model.meta.toolkitVersion}, ${model.meta.isDraft ? "DRAFT" : "FINAL"}`,
    creator: "Okiru ESG Intelligence Toolkit",
  });

  const blocks = buildDisclosurePack(model);
  const cur: Cursor = { y: P.marginTopPt };
  for (const blk of blocks) renderBlock(doc, cur, blk, model);
  decoratePages(doc, model);

  return doc.output("blob");
}
