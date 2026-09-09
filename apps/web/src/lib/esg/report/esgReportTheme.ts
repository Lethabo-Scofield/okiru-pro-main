/**
 * The Okiru report format, extracted from the template documents themselves.
 *
 * These are not colours somebody liked. Every value below was read out of
 * `docs/Report/Okiru-ESG-Report-Template-Specification.docx` and `.pptx` — the
 * OOXML run properties, table borders, cell margins, page setup and theme
 * palette of the documents the client already signed off. Generated output
 * that sits next to the specification has to be indistinguishable from it, so
 * the tokens are transcribed rather than approximated, and both renderers
 * (DOCX and PDF) read from this one file.
 *
 * Provenance, so a future change can be checked against the source:
 *   page       word/document.xml  <w:sectPr> pgSz 12240x15840, pgMar 1440/1300
 *   body ink   word/document.xml  most frequent <w:color> = 23282A
 *   heading    word/document.xml  <w:color w:val="00647A"> on section headings
 *   rules      word/document.xml  <w:tblBorders> insideH single D5DEE0 sz 2
 *   cell pad   word/document.xml  <w:tcMar> top/bottom 110, right 130, left 0
 *   fills      word/document.xml  <w:shd w:fill> = 00647A, F4F8F9, E9F3F5
 *   accents    ppt/slides/*.xml   00647A, 0091A8, 6FC7D6, 5F6B6E, B03A2E
 *   typeface   word/styles.xml    Calibri throughout
 *   header     word/header1.xml   "OKIRU ESG Intelligence Toolkit · ..."
 */

/** Hex without the leading `#` — the form OOXML wants. */
export const ESG_REPORT_COLORS = {
  /** Body copy. */
  ink: "23282A",
  /** Strong ink, used for figures and cover type. */
  inkStrong: "101820",
  /** Section headings, table header fill, rules that carry emphasis. */
  teal: "00647A",
  /** Secondary accent — sub-headings, chart series 2. */
  tealBright: "0091A8",
  /** Light accent — highlight bars. */
  tealLight: "6FC7D6",
  /** Labels, captions, table header text on a light fill. */
  muted: "5F6B6E",
  /** Hairline rules between table rows. */
  rule: "D5DEE0",
  /** Zebra fill. */
  tintFaint: "F4F8F9",
  /** Callout and legend fill. */
  tint: "E9F3F5",
  white: "FFFFFF",
  /** Reserved for RAG red and the DRAFT watermark. */
  alert: "B03A2E",
  amber: "B07B2E",
  green: "3E7A55",
  grey: "9AACB2",
} as const;

/** RAG cell fills, so the status reads at a glance in both renderings. */
export const ESG_RAG_COLOR: Record<string, string> = {
  Green: ESG_REPORT_COLORS.green,
  Amber: ESG_REPORT_COLORS.amber,
  Red: ESG_REPORT_COLORS.alert,
  Grey: ESG_REPORT_COLORS.grey,
};

export const ESG_REPORT_FONT = "Calibri";

/** Twips (1/20 pt) — the unit OOXML page setup uses. */
export const ESG_REPORT_PAGE = {
  widthTwips: 12240,
  heightTwips: 15840,
  marginTop: 1440,
  marginRight: 1440,
  marginBottom: 1300,
  marginLeft: 1440,
  headerTwips: 708,
  footerTwips: 708,
  /** Usable text width = page width less both margins. */
  get contentTwips() {
    return this.widthTwips - this.marginLeft - this.marginRight;
  },
} as const;

/** Half-points — the unit `<w:sz>` uses. Divide by 2 for points. */
export const ESG_REPORT_SIZES = {
  coverTitle: 56,
  coverSubtitle: 32,
  h1: 32,
  h2: 26,
  h3: 22,
  body: 20,
  table: 17,
  tableHead: 17,
  caption: 16,
  footer: 15,
} as const;

/** Cell padding in twips, transcribed from the template's `<w:tcMar>`. */
export const ESG_REPORT_CELL_MARGIN = { top: 110, bottom: 110, left: 0, right: 130 } as const;

/** The running header, verbatim from `word/header1.xml`, with the title bound. */
export function reportHeaderText(entityName: string, reportTitle: string, version: string): string {
  return `OKIRU ESG Intelligence Toolkit · ${entityName} — ${reportTitle} v${version}`;
}

/* ── PDF units. jsPDF works in points; the same tokens, converted once. ── */

const TWIPS_PER_PT = 20;
export const PDF_PAGE = {
  widthPt: ESG_REPORT_PAGE.widthTwips / TWIPS_PER_PT,
  heightPt: ESG_REPORT_PAGE.heightTwips / TWIPS_PER_PT,
  marginTopPt: ESG_REPORT_PAGE.marginTop / TWIPS_PER_PT,
  marginRightPt: ESG_REPORT_PAGE.marginRight / TWIPS_PER_PT,
  marginBottomPt: ESG_REPORT_PAGE.marginBottom / TWIPS_PER_PT,
  marginLeftPt: ESG_REPORT_PAGE.marginLeft / TWIPS_PER_PT,
} as const;

/** `"00647A"` to `[0, 100, 122]` — jsPDF takes RGB triples. */
export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}
