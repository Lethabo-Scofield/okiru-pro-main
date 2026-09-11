/**
 * Renders the Board Strategy Pack to a real PowerPoint file.
 *
 * Same construction as the Word renderer: jszip over hand-written OOXML, no new
 * dependency. The difference is that a .pptx is far less forgiving than a
 * .docx — a missing clrMap or a broken relationship gets the user "PowerPoint
 * found a problem with content", which is not a thing to discover in front of
 * a client. So the slide master, layout and theme are not authored here at all:
 * they are the signed-off deck's own parts, embedded verbatim in
 * `esgReportPptxSkeleton.ts`. This module authors only slides against them.
 *
 * Every coordinate below is in EMU and was measured off the real deck's
 * `ppt/slides/*.xml`, so a generated slide lands on the same grid as a
 * hand-made one: the eyebrow at x=548640 y=310896, the title beneath it in
 * Cambria teal, the content band from y=1400000 to y=5700000, and the muted
 * footnote pinned at y=5806440.
 */
import JSZip from "jszip";
import { buildBoardPack, type EsgSlide, type EsgSlideBody } from "./esgReportSlides";
import type { EsgReportModel } from "./esgReportModel";
import { ESG_REPORT_COLORS as C } from "./esgReportTheme";
import {
  PPTX_SLIDE_LAYOUT_XML,
  PPTX_SLIDE_MASTER_XML,
  PPTX_THEME_XML,
} from "./esgReportPptxSkeleton";

/* ── the deck's grid, in EMU, measured from the real slides ─────────────── */
const SLIDE_W = 12192000;
const SLIDE_H = 6858000;
const MARGIN_X = 548640;
const CONTENT_W = 11064240;
const EYEBROW_Y = 310896;
const TITLE_Y = 566928;
const TITLE_H = 713232;
const BODY_TOP = 1500000;
const BODY_BOTTOM = 5700000;
const FOOTNOTE_Y = 5806440;
const FOOTNOTE_H = 457200;

const TITLE_FACE = "Cambria";
const BODY_FACE = "Calibri";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type RunOpts = { sz: number; color: string; bold?: boolean; face?: string; italic?: boolean; spc?: number };

function run(text: string, o: RunOpts): string {
  const face = o.face ?? BODY_FACE;
  return (
    `<a:r><a:rPr lang="en-ZA" sz="${o.sz}"${o.bold ? ' b="1"' : ""}${o.italic ? ' i="1"' : ""}` +
    `${o.spc ? ` spc="${o.spc}"` : ""} dirty="0">` +
    `<a:solidFill><a:srgbClr val="${o.color}"/></a:solidFill>` +
    `<a:latin typeface="${face}"/><a:cs typeface="${face}"/>` +
    `</a:rPr><a:t>${esc(text)}</a:t></a:r>`
  );
}

function paragraph(runs: string, o: { align?: string; bullet?: boolean; spcBefore?: number } = {}): string {
  const pPr =
    `<a:pPr${o.align ? ` algn="${o.align}"` : ""} marL="${o.bullet ? 171450 : 0}" indent="${o.bullet ? -171450 : 0}">` +
    (o.spcBefore ? `<a:spcBef><a:spcPts val="${o.spcBefore}"/></a:spcBef>` : "") +
    (o.bullet ? `<a:buChar char="•"/>` : `<a:buNone/>`) +
    `</a:pPr>`;
  return `<a:p>${pPr}${runs}</a:p>`;
}

let shapeSeq = 1;
const nextId = () => ++shapeSeq;

/** A plain text box. `paras` is pre-built `<a:p>` markup. */
function textBox(x: number, y: number, cx: number, cy: number, paras: string, anchor = "t"): string {
  const id = nextId();
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="tx${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr>` +
    `<a:lstStyle/>${paras}</p:txBody></p:sp>`
  );
}

function rect(x: number, y: number, cx: number, cy: number, fill: string, geom = "rect", rot?: number): string {
  const id = nextId();
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="sh${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm${rot ? ` rot="${rot}"` : ""}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
  );
}

/**
 * A table, built to the deck's own recipe: 6350-wide D5DEE0 hairlines on every
 * edge, a solid 00647A header band with white bold text, and body cells in
 * 22282A — all measured off `slide2.xml`.
 */
function table(
  x: number,
  y: number,
  totalW: number,
  head: string[],
  rows: string[][],
  widthsPct?: number[],
): string {
  const id = nextId();
  const cols = head.length;
  const pcts = widthsPct && widthsPct.length === cols ? widthsPct : Array.from({ length: cols }, () => 100 / cols);
  const sum = pcts.reduce((a, b) => a + b, 0) || 100;
  const widths = pcts.map((p) => Math.round((p / sum) * totalW));

  // Rows have to fit the content band or PowerPoint spills them off the slide.
  const avail = BODY_BOTTOM - y;
  const headH = 320000;
  const bodyH = Math.max(180000, Math.min(400000, Math.floor((avail - headH) / Math.max(1, rows.length))));
  // Narrow columns need a smaller face, exactly as the deck's denser tables do.
  const sz = cols >= 7 ? 900 : cols >= 5 ? 1000 : 1200;

  const border = (edge: "lnL" | "lnR" | "lnT" | "lnB") =>
    `<a:${edge} w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="${C.rule}"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:${edge}>`;
  const borders = border("lnL") + border("lnR") + border("lnT") + border("lnB");

  const cell = (text: string, o: { header?: boolean }) =>
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>` +
    paragraph(run(text, { sz, color: o.header ? C.white : "22282A", bold: o.header })) +
    `</a:txBody>` +
    `<a:tcPr marL="91440" marR="91440" marT="45720" marB="45720" anchor="ctr">` +
    borders +
    (o.header ? `<a:solidFill><a:srgbClr val="${C.teal}"/></a:solidFill>` : "") +
    `</a:tcPr></a:tc>`;

  const headRow = `<a:tr h="${headH}">${head.map((h) => cell(h, { header: true })).join("")}</a:tr>`;
  const bodyRows = rows
    .map(
      (r) =>
        `<a:tr h="${bodyH}">${Array.from({ length: cols }, (_, i) => cell(r[i] ?? "", {})).join("")}</a:tr>`,
    )
    .join("");

  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="tbl${id}"/>` +
    `<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${totalW}" cy="${headH + bodyH * rows.length}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">` +
    `<a:tbl><a:tblPr/><a:tblGrid>${widths.map((w) => `<a:gridCol w="${w}"/>`).join("")}</a:tblGrid>` +
    headRow +
    bodyRows +
    `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  );
}

const ACCENT: Record<string, string> = { e: C.teal, s: "B07B2E", g: "6F5BD6", alert: C.alert };

/** The metric strip: evenly divided cards with a rule above each figure. */
function tiles(y: number, items: { label: string; value: string; note: string; accent?: string }[]): string {
  const gap = 182880;
  const w = Math.floor((CONTENT_W - gap * (items.length - 1)) / items.length);
  return items
    .map((t, i) => {
      const x = MARGIN_X + i * (w + gap);
      const colour = t.accent ? (ACCENT[t.accent] ?? C.teal) : C.teal;
      return (
        rect(x, y, w, 45720, colour) +
        textBox(
          x,
          y + 137160,
          w,
          320040,
          paragraph(run(t.label.toUpperCase(), { sz: 1000, color: C.muted, spc: 60 })),
        ) +
        textBox(x, y + 457200, w, 640080, paragraph(run(t.value, { sz: 3200, color: colour, bold: true, face: TITLE_FACE }))) +
        textBox(x, y + 1188720, w, 640080, paragraph(run(t.note, { sz: 1000, color: "22282A" })))
      );
    })
    .join("");
}

function renderBody(body: EsgSlideBody[], startY: number): string {
  let y = startY;
  const out: string[] = [];
  for (const b of body) {
    switch (b.kind) {
      case "tiles":
        out.push(tiles(y, b.tiles));
        y += 1920240;
        break;
      case "table": {
        out.push(table(MARGIN_X, y, CONTENT_W, b.head, b.rows, b.widths));
        const headH = 320000;
        const avail = BODY_BOTTOM - y;
        const bodyH = Math.max(180000, Math.min(400000, Math.floor((avail - headH) / Math.max(1, b.rows.length))));
        y += headH + bodyH * b.rows.length + 182880;
        break;
      }
      case "bullets": {
        const paras = b.items
          .map((it, i) => paragraph(run(it, { sz: 1400, color: "22282A" }), { bullet: true, spcBefore: i ? 600 : 0 }))
          .join("");
        const h = Math.min(BODY_BOTTOM - y, b.items.length * 480060);
        out.push(textBox(MARGIN_X, y, CONTENT_W, h, paras));
        y += h + 182880;
        break;
      }
      case "statement": {
        const h = Math.min(BODY_BOTTOM - y, 1600200);
        out.push(rect(MARGIN_X, y, 45720, h, C.teal));
        out.push(
          textBox(MARGIN_X + 228600, y, CONTENT_W - 228600, h, paragraph(run(b.text, { sz: 1500, color: "22282A" }))),
        );
        y += h + 182880;
        break;
      }
      case "split": {
        const w = Math.floor((CONTENT_W - 365760) / 2);
        [b.left, b.right].forEach((side, i) => {
          const x = MARGIN_X + i * (w + 365760);
          out.push(rect(x, y, w, 45720, i === 0 ? C.teal : C.tealBright));
          out.push(
            textBox(
              x,
              y + 137160,
              w,
              320040,
              paragraph(run(side.heading.toUpperCase(), { sz: 1000, color: C.muted, spc: 60 })),
            ),
          );
          out.push(
            textBox(
              x,
              y + 502920,
              w,
              BODY_BOTTOM - (y + 502920),
              side.items
                .map((it, k) => paragraph(run(it, { sz: 1300, color: "22282A" }), { bullet: true, spcBefore: k ? 600 : 0 }))
                .join(""),
            ),
          );
        });
        y = BODY_BOTTOM;
        break;
      }
    }
    if (y >= BODY_BOTTOM) break;
  }
  return out.join("");
}

/** Generation rule 2 — DRAFT on every slide, with no parameter to suppress it. */
function draftWatermark(): string {
  const id = nextId();
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="draft${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm rot="-1800000"><a:off x="1200000" y="2200000"/><a:ext cx="9800000" cy="2400000"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="none" anchor="ctr"/><a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-ZA" sz="14000" b="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="${C.alert}"><a:alpha val="11000"/></a:srgbClr></a:solidFill>` +
    `<a:latin typeface="${BODY_FACE}"/></a:rPr><a:t>DRAFT</a:t></a:r></a:p></p:txBody></p:sp>`
  );
}

function slideXml(slide: EsgSlide, isDraft: boolean): string {
  shapeSeq = 1;
  const shapes: string[] = [];

  if (slide.cover) {
    // The deck's cover: dark ground with two offset marque circles.
    shapes.push(rect(9052560, -1371600, 5120640, 5120640, C.teal, "ellipse"));
    shapes.push(rect(10424160, 4023360, 2377440, 2377440, C.tealBright, "ellipse"));
    // On the dark ground the kicker switches to the light teal, per the deck.
    shapes.push(
      textBox(
        MARGIN_X,
        1828800,
        8229600,
        274320,
        paragraph(run(slide.eyebrow, { sz: 1200, color: C.tealLight, bold: true, spc: 200 })),
      ),
    );
    shapes.push(
      textBox(MARGIN_X, 2286000, 8046720, 1737360, paragraph(run(slide.title, { sz: 4600, color: C.white, bold: true, face: TITLE_FACE }))),
    );
    const sub = slide.body.find((b) => b.kind === "bullets");
    if (sub && sub.kind === "bullets") {
      shapes.push(
        textBox(
          MARGIN_X,
          4114800,
          8046720,
          1188720,
          sub.items.map((it, i) => paragraph(run(it, { sz: 1400, color: i === 2 && isDraft ? "E08D80" : C.rule }), { spcBefore: i ? 500 : 0 })).join(""),
        ),
      );
    }
  } else {
    // The deck's kicker is bold with 200 units of tracking, not merely small —
    // measured off every one of its 23 content slides.
    shapes.push(
      textBox(
        MARGIN_X,
        EYEBROW_Y,
        CONTENT_W,
        256032,
        paragraph(run(slide.eyebrow.toUpperCase(), { sz: 1100, color: C.tealBright, bold: true, spc: 200 })),
      ),
    );
    shapes.push(
      textBox(MARGIN_X, TITLE_Y, CONTENT_W, TITLE_H, paragraph(run(slide.title, { sz: 2900, color: C.teal, bold: true, face: TITLE_FACE }))),
    );
    shapes.push(renderBody(slide.body, BODY_TOP));
  }

  if (slide.footnote) {
    shapes.push(
      textBox(
        MARGIN_X,
        FOOTNOTE_Y,
        CONTENT_W,
        FOOTNOTE_H,
        paragraph(run(slide.footnote.trim(), { sz: 900, color: slide.cover ? C.grey : C.muted })),
      ),
    );
  }

  if (isDraft) shapes.push(draftWatermark());

  const bg = slide.cover
    ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${C.inkStrong}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    : `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${C.white}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld>${bg}<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>` +
    `<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    shapes.join("") +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

/* ── package parts ──────────────────────────────────────────────────────── */

function contentTypes(slideCount: number): string {
  const slides = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    slides +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`
  );
}

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
  `</Relationships>`;

function presentationXml(slideCount: number): string {
  // Slide ids must be >= 256; rId1 is the master, so slides start at rId2.
  const ids = Array.from(
    { length: slideCount },
    (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`,
  ).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${ids}</p:sldIdLst>` +
    `<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>` +
    `</p:presentation>`
  );
}

function presentationRels(slideCount: number): string {
  const slides = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
  ).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
    slides +
    `<Relationship Id="rId${slideCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
    `</Relationships>`
  );
}

const MASTER_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>` +
  `</Relationships>`;

const LAYOUT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
  `</Relationships>`;

const SLIDE_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
  `</Relationships>`;

function coreProps(model: EsgReportModel): string {
  const m = model.meta;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(`${m.entityName} — ESG Board Strategy Pack`)}</dc:title>` +
    `<dc:creator>${esc(m.preparedBy)}</dc:creator>` +
    `<cp:keywords>${esc(`${m.generationReference}; ${m.toolkitVersion}; ${m.isDraft ? "DRAFT" : "FINAL"}`)}</cp:keywords>` +
    `<cp:contentStatus>${m.isDraft ? "Draft" : "Final"}</cp:contentStatus>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${esc(m.generatedAt)}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${esc(m.generatedAt)}</dcterms:modified>` +
    `</cp:coreProperties>`
  );
}

const APP_PROPS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
  `<Application>Okiru ESG Intelligence Toolkit</Application><Company>Okiru</Company></Properties>`;

/** Build the Board Strategy Pack .pptx for a model. */
export async function renderEsgReportPptx(model: EsgReportModel): Promise<Blob> {
  const slides = buildBoardPack(model);
  const zip = new JSZip();

  zip.file("[Content_Types].xml", contentTypes(slides.length));
  zip.folder("_rels")!.file(".rels", ROOT_RELS);

  const ppt = zip.folder("ppt")!;
  ppt.file("presentation.xml", presentationXml(slides.length));
  ppt.folder("_rels")!.file("presentation.xml.rels", presentationRels(slides.length));
  ppt.folder("theme")!.file("theme1.xml", PPTX_THEME_XML);

  const masters = ppt.folder("slideMasters")!;
  masters.file("slideMaster1.xml", PPTX_SLIDE_MASTER_XML);
  masters.folder("_rels")!.file("slideMaster1.xml.rels", MASTER_RELS);

  const layouts = ppt.folder("slideLayouts")!;
  layouts.file("slideLayout1.xml", PPTX_SLIDE_LAYOUT_XML);
  layouts.folder("_rels")!.file("slideLayout1.xml.rels", LAYOUT_RELS);

  const sldFolder = ppt.folder("slides")!;
  const sldRels = sldFolder.folder("_rels")!;
  slides.forEach((s, i) => {
    sldFolder.file(`slide${i + 1}.xml`, slideXml(s, model.meta.isDraft));
    sldRels.file(`slide${i + 1}.xml.rels`, SLIDE_RELS);
  });

  const props = zip.folder("docProps")!;
  props.file("core.xml", coreProps(model));
  props.file("app.xml", APP_PROPS);

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
}
