/**
 * Renders the Disclosure Pack to a real Word document.
 *
 * WHY OOXML BY HAND RATHER THAN A LIBRARY
 *
 * `docx` is not a dependency of this repo and adding one thirty minutes before
 * a client meeting is not a trade worth making. `jszip` already is, and a
 * `.docx` is a zip of six small XML parts. Writing them directly also buys the
 * thing a library would fight us on: the output has to match
 * `docs/Report/Okiru-ESG-Report-Template-Specification.docx` exactly — its page
 * setup, its hairline table rules, its cell margins, its teal — and those are
 * transcribed in `esgReportTheme.ts` straight from that file's own XML.
 *
 * WHAT IS DELIBERATE HERE
 *
 * - The DRAFT watermark is a real VML watermark in the header, repeated on
 *   every page, and it is emitted whenever the sign-off gate is unsatisfied.
 *   There is no parameter to suppress it (generation rule 2, no override).
 * - Document protection is written into `settings.xml`. The pack is a
 *   disclosure record; it is not meant to be edited after issue.
 * - Every page carries the version stamp in the footer (generation rule 5), so
 *   any printed page can be traced back to the extract that produced it.
 */
import JSZip from "jszip";
import type { EsgDocBlock } from "./esgReportDocument";
import { buildDisclosurePack, versionStamp } from "./esgReportDocument";
import type { EsgReportModel } from "./esgReportModel";
import {
  ESG_RAG_COLOR,
  ESG_REPORT_CELL_MARGIN,
  ESG_REPORT_COLORS as C,
  ESG_REPORT_FONT,
  ESG_REPORT_PAGE as PAGE,
  ESG_REPORT_SIZES as SZ,
  reportHeaderText,
} from "./esgReportTheme";

/* ─────────────────────────── XML primitives ────────────────────────────── */

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type RunOpts = {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  size?: number;
  caps?: boolean;
  spacing?: number;
};

function run(text: string, o: RunOpts = {}): string {
  const rPr =
    `<w:rPr>` +
    `<w:rFonts w:ascii="${ESG_REPORT_FONT}" w:hAnsi="${ESG_REPORT_FONT}" w:cs="${ESG_REPORT_FONT}"/>` +
    (o.bold ? `<w:b/><w:bCs/>` : "") +
    (o.italic ? `<w:i/><w:iCs/>` : "") +
    (o.caps ? `<w:caps/>` : "") +
    (o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : "") +
    `<w:color w:val="${o.color ?? C.ink}"/>` +
    `<w:sz w:val="${o.size ?? SZ.body}"/><w:szCs w:val="${o.size ?? SZ.body}"/>` +
    `</w:rPr>`;
  // Preserve the runs of spaces that separate stamp fragments.
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

type ParaOpts = RunOpts & {
  before?: number;
  after?: number;
  pageBreakBefore?: boolean;
  align?: "left" | "center" | "right";
  keepNext?: boolean;
  shading?: string;
  borderLeft?: string;
  indent?: number;
  lineRule?: number;
};

function para(text: string, o: ParaOpts = {}): string {
  const pPr =
    `<w:pPr>` +
    (o.pageBreakBefore ? `<w:pageBreakBefore/>` : "") +
    (o.keepNext ? `<w:keepNext/>` : "") +
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 120}"${o.lineRule ? ` w:line="${o.lineRule}" w:lineRule="auto"` : ""}/>` +
    (o.align && o.align !== "left" ? `<w:jc w:val="${o.align}"/>` : "") +
    (o.indent ? `<w:ind w:left="${o.indent}"/>` : "") +
    (o.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shading}"/>` : "") +
    (o.borderLeft
      ? `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${o.borderLeft}"/></w:pBdr>`
      : "") +
    `</w:pPr>`;
  return `<w:p>${pPr}${text ? run(text, o) : ""}</w:p>`;
}

/** An empty paragraph carrying only a bottom rule — the template's divider. */
function ruleLine(): string {
  return (
    `<w:p><w:pPr><w:spacing w:before="40" w:after="120"/>` +
    `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${C.rule}"/></w:pBdr>` +
    `</w:pPr></w:p>`
  );
}

function cell(text: string, widthTwips: number, o: RunOpts & { shading?: string } = {}): string {
  const tcPr =
    `<w:tcPr>` +
    `<w:tcW w:type="dxa" w:w="${Math.max(200, Math.round(widthTwips))}"/>` +
    (o.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shading}"/>` : "") +
    `<w:tcMar>` +
    `<w:top w:type="dxa" w:w="${ESG_REPORT_CELL_MARGIN.top}"/>` +
    `<w:left w:type="dxa" w:w="${ESG_REPORT_CELL_MARGIN.left + 60}"/>` +
    `<w:bottom w:type="dxa" w:w="${ESG_REPORT_CELL_MARGIN.bottom}"/>` +
    `<w:right w:type="dxa" w:w="${ESG_REPORT_CELL_MARGIN.right}"/>` +
    `</w:tcMar>` +
    `</w:tcPr>`;
  return `<w:tc>${tcPr}<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${run(text, o)}</w:p></w:tc>`;
}

/**
 * The template's table: no outer frame, one hairline between rows, a teal
 * header band. Column widths are the block's percentages resolved against the
 * usable text width, so a 14-column appendix still fits the page.
 */
function table(head: string[], rows: string[][], widthsPct?: number[], ragColumn = -1): string {
  const total = PAGE.contentTwips;
  const cols = head.length;
  const pcts =
    widthsPct && widthsPct.length === cols
      ? widthsPct
      : Array.from({ length: cols }, () => 100 / cols);
  const sum = pcts.reduce((a, x) => a + x, 0) || 100;
  const widths = pcts.map((p) => (p / sum) * total);

  const tblPr =
    `<w:tblPr>` +
    `<w:tblW w:type="dxa" w:w="${total}"/>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders>` +
    `<w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>` +
    `<w:insideH w:val="single" w:color="${C.rule}" w:sz="2"/><w:insideV w:val="none"/>` +
    `</w:tblBorders>` +
    `</w:tblPr>`;

  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${Math.round(w)}"/>`).join("")}</w:tblGrid>`;

  const headRow =
    `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>` +
    head
      .map((h, i) =>
        cell(h, widths[i], { bold: true, color: C.white, size: SZ.tableHead, shading: C.teal }),
      )
      .join("") +
    `</w:tr>`;

  const bodyRows = rows
    .map((r, ri) => {
      const zebra = ri % 2 === 1 ? C.tintFaint : undefined;
      return (
        `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
        Array.from({ length: cols }, (_, i) => {
          const v = r[i] ?? "";
          const isRag = i === ragColumn && ESG_RAG_COLOR[v];
          return cell(v, widths[i], {
            size: SZ.table,
            color: isRag ? ESG_RAG_COLOR[v] : C.ink,
            bold: Boolean(isRag),
            shading: zebra,
          });
        }).join("") +
        `</w:tr>`
      );
    })
    .join("");

  return `<w:tbl>${tblPr}${grid}${headRow}${bodyRows}</w:tbl>` + para("", { after: 160 });
}

/* ─────────────────────────── block rendering ───────────────────────────── */

function renderBlock(blk: EsgDocBlock, model: EsgReportModel): string {
  switch (blk.kind) {
    case "cover": {
      const out: string[] = [];
      out.push(para("", { after: 1400 }));
      out.push(
        para("OKIRU ESG INTELLIGENCE TOOLKIT", {
          color: C.teal,
          size: SZ.caption,
          bold: true,
          caps: true,
          spacing: 40,
          after: 200,
        }),
      );
      out.push(para(blk.title, { size: SZ.coverTitle, bold: true, color: C.inkStrong, after: 80 }));
      out.push(para(blk.subtitle, { size: SZ.coverSubtitle, color: C.teal, after: 240 }));
      out.push(ruleLine());
      out.push(
        table(
          ["", ""],
          blk.rows.map(([k, v]) => [k, v]),
          [28, 72],
        ).replace(
          // The cover key/value block has no header band in the template.
          /<w:tr><w:trPr><w:tblHeader\/><w:cantSplit\/><\/w:trPr>[\s\S]*?<\/w:tr>/,
          "",
        ),
      );
      if (model.meta.isDraft) {
        out.push(
          para(
            "DRAFT — this report has not been signed off by a named officer of the entity and may not be issued.",
            { color: C.alert, bold: true, size: SZ.body, before: 240, shading: C.tint },
          ),
        );
      }
      return out.join("");
    }
    case "h1":
      return (
        para(blk.text, {
          size: SZ.h1,
          bold: true,
          color: C.teal,
          before: blk.pageBreakBefore ? 0 : 320,
          after: 60,
          pageBreakBefore: blk.pageBreakBefore,
          keepNext: true,
        }) + ruleLine()
      );
    case "h2":
      return para(blk.text, { size: SZ.h2, bold: true, color: C.inkStrong, before: 240, after: 80, keepNext: true });
    case "h3":
      return para(blk.text, { size: SZ.h3, bold: true, color: C.tealBright, before: 180, after: 60, keepNext: true });
    case "p":
      return para(blk.text, { after: 140, lineRule: 264 });
    case "bullets":
      return blk.items.map((it) => para(`•   ${it}`, { indent: 200, after: 60, lineRule: 264 })).join("");
    case "numbered":
      return blk.items
        .map((it, i) => para(`${i + 1}.   ${it}`, { indent: 200, after: 60, lineRule: 264 }))
        .join("");
    case "callout":
      return (
        para(blk.label.toUpperCase(), {
          bold: true,
          caps: true,
          spacing: 30,
          color: C.teal,
          size: SZ.caption,
          shading: C.tint,
          borderLeft: C.teal,
          indent: 160,
          before: 160,
          after: 0,
        }) +
        para(blk.text, {
          shading: C.tint,
          borderLeft: C.teal,
          indent: 160,
          after: 180,
          lineRule: 264,
        })
      );
    case "table": {
      const ragIdx = blk.head.findIndex((h) => h === "RAG" || h === "Status");
      return (
        (blk.caption ? para(blk.caption, { color: C.muted, size: SZ.caption, italic: true, after: 60 }) : "") +
        table(blk.head, blk.rows, blk.widths, ragIdx)
      );
    }
    case "kv":
      return table(["", ""], blk.rows.map(([k, v]) => [k, v]), [30, 70]).replace(
        /<w:tr><w:trPr><w:tblHeader\/><w:cantSplit\/><\/w:trPr>[\s\S]*?<\/w:tr>/,
        "",
      );
    case "note":
      return para(blk.text, { color: C.muted, size: SZ.caption, italic: true, after: 160, lineRule: 264 });
    case "spacer":
      return para("", { after: 200 });
  }
}

/* ───────────────────────────── the package ─────────────────────────────── */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="${ESG_REPORT_FONT}" w:hAnsi="${ESG_REPORT_FONT}" w:cs="${ESG_REPORT_FONT}"/>
<w:color w:val="${C.ink}"/><w:sz w:val="${SZ.body}"/><w:szCs w:val="${SZ.body}"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

/**
 * `settings.xml` carries the lockdown. `readOnlyRecommended` prompts on open;
 * `documentProtection edit="readOnly" enforcement="1"` makes it stick. The
 * pack is a disclosure record — it is issued, not edited.
 */
const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:zoom w:percent="100"/>
<w:defaultTabStop w:val="720"/>
<w:documentProtection w:edit="readOnly" w:enforcement="1"/>
<w:writeProtection w:recommended="1"/>
<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>
</w:settings>`;

/** A real VML watermark, so DRAFT sits behind every page, not just the first. */
function draftWatermarkXml(): string {
  return (
    `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:pict>` +
    `<v:shape xmlns:v="urn:schemas-microsoft-com:vml" id="OkiruDraftWatermark" type="#_x0000_t136" ` +
    `style="position:absolute;margin-left:0;margin-top:0;width:520pt;height:150pt;rotation:315;z-index:-251654144;` +
    `mso-position-horizontal:center;mso-position-horizontal-relative:margin;` +
    `mso-position-vertical:center;mso-position-vertical-relative:margin" ` +
    `fillcolor="#${C.alert}" stroked="f" o:allowincell="f" xmlns:o="urn:schemas-microsoft-com:office:office">` +
    `<v:fill opacity=".18"/>` +
    `<v:textpath xmlns:v="urn:schemas-microsoft-com:vml" style="font-family:&quot;${ESG_REPORT_FONT}&quot;;font-weight:bold" string="DRAFT"/>` +
    `</v:shape></w:pict></w:r></w:p>`
  );
}

function headerXml(model: EsgReportModel): string {
  const m = model.meta;
  const text = reportHeaderText(m.entityName, m.reportTitle, m.reportVersion);
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    (m.isDraft ? draftWatermarkXml() : "") +
    `<w:p><w:pPr><w:spacing w:after="0"/>` +
    `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${C.rule}"/></w:pBdr>` +
    `</w:pPr>${run(text, { color: C.muted, size: SZ.footer, caps: true, spacing: 20 })}</w:p>` +
    `</w:hdr>`
  );
}

/** Generation rule 5 — the version stamp on every page, plus the page number. */
function footerXml(model: EsgReportModel): string {
  const stamp = versionStamp(model);
  const status = model.meta.isDraft ? "DRAFT — NOT FOR ISSUE" : "FINAL — APPROVED";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:spacing w:before="60" w:after="0"/>` +
    `<w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="${C.rule}"/></w:pBdr>` +
    `</w:pPr>` +
    run(status, { color: model.meta.isDraft ? C.alert : C.teal, size: SZ.footer, bold: true }) +
    run("   ·   ", { color: C.rule, size: SZ.footer }) +
    run(stamp, { color: C.muted, size: SZ.footer }) +
    `</w:p>` +
    `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0"/></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:ascii="${ESG_REPORT_FONT}" w:hAnsi="${ESG_REPORT_FONT}"/><w:color w:val="${C.muted}"/><w:sz w:val="${SZ.footer}"/></w:rPr>` +
    `<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `</w:p></w:ftr>`
  );
}

function docPropsCore(model: EsgReportModel): string {
  const m = model.meta;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(`${m.entityName} — ${m.reportTitle}`)}</dc:title>
<dc:subject>${esc(`ESG disclosure record for ${m.reportingPeriod}`)}</dc:subject>
<dc:creator>${esc(m.preparedBy)}</dc:creator>
<cp:keywords>${esc(`${m.generationReference}; ${m.toolkitVersion}; ${m.crossWalkVersion}; ${m.isDraft ? "DRAFT" : "FINAL"}`)}</cp:keywords>
<cp:category>ESG disclosure</cp:category>
<cp:contentStatus>${m.isDraft ? "Draft" : "Final"}</cp:contentStatus>
<dcterms:created xsi:type="dcterms:W3CDTF">${esc(m.generatedAt)}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${esc(m.generatedAt)}</dcterms:modified>
</cp:coreProperties>`;
}

const APP_PROPS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Okiru ESG Intelligence Toolkit</Application>
<Company>Okiru</Company>
</Properties>`;

function documentXml(blocks: EsgDocBlock[], model: EsgReportModel): string {
  const body = blocks.map((b) => renderBlock(b, model)).join("");
  const sectPr =
    `<w:sectPr>` +
    `<w:headerReference w:type="default" r:id="rId3"/>` +
    `<w:footerReference w:type="default" r:id="rId4"/>` +
    `<w:pgSz w:w="${PAGE.widthTwips}" w:h="${PAGE.heightTwips}" w:orient="portrait"/>` +
    `<w:pgMar w:top="${PAGE.marginTop}" w:right="${PAGE.marginRight}" w:bottom="${PAGE.marginBottom}" ` +
    `w:left="${PAGE.marginLeft}" w:header="${PAGE.headerTwips}" w:footer="${PAGE.footerTwips}" w:gutter="0"/>` +
    `<w:pgNumType/><w:docGrid w:linePitch="360"/>` +
    `</w:sectPr>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">` +
    `<w:body>${body}${sectPr}</w:body></w:document>`
  );
}

/** Build the `.docx` for a model. Returns a Blob ready to download. */
export async function renderEsgReportDocx(model: EsgReportModel): Promise<Blob> {
  const blocks = buildDisclosurePack(model);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", ROOT_RELS);
  const word = zip.folder("word")!;
  word.file("document.xml", documentXml(blocks, model));
  word.file("styles.xml", STYLES);
  word.file("settings.xml", SETTINGS);
  word.file("header1.xml", headerXml(model));
  word.file("footer1.xml", footerXml(model));
  word.folder("_rels")!.file("document.xml.rels", DOC_RELS);
  const props = zip.folder("docProps")!;
  props.file("core.xml", docPropsCore(model));
  props.file("app.xml", APP_PROPS);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}
