/**
 * A generated .pptx that PowerPoint refuses to open is worse than no export at
 * all — the failure lands in front of a client, not in CI. These tests exist to
 * make that failure land here instead.
 *
 * They check the package the way PowerPoint does: every part declared in
 * `[Content_Types].xml`, every relationship resolving to a part that exists,
 * every slide well-formed, ids in the ranges the format requires. They also
 * check the deck is the OKIRU deck — the embedded master, layout and theme must
 * still be byte-identical to the signed-off template.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildGoldenSections } from "../../../../../server/esgGoldenFixture";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { buildEsgReportModel } from "../esgReportModel";
import { buildBoardPack } from "../esgReportSlides";
import { renderEsgReportPptx } from "../esgReportPptx";
import { esgReportFilename } from "../esgReportDocument";
import { PPTX_SLIDE_LAYOUT_XML, PPTX_SLIDE_MASTER_XML, PPTX_THEME_XML } from "../esgReportPptxSkeleton";

const NOW = new Date("2026-09-09T08:00:00.000Z");

function workbook(overrides: Record<string, Record<string, unknown>> = {}): EsgWorkbookData {
  const sections = buildGoldenSections() as EsgWorkbookData["sections"];
  for (const [id, cells] of Object.entries(overrides)) {
    sections[id] = { cells: { ...(sections[id]?.cells ?? {}), ...cells } } as EsgWorkbookData["sections"][string];
  }
  return { companyId: "sg-consumer", sections, updatedAt: "2026-09-01T00:00:00.000Z" };
}

const model = (o?: Record<string, Record<string, unknown>>) =>
  buildEsgReportModel({ workbook: workbook(o), companyName: "SG Consumer", companyId: "sg-consumer", now: NOW });

const zipOf = async (o?: Record<string, Record<string, unknown>>) =>
  JSZip.loadAsync(await (await renderEsgReportPptx(model(o))).arrayBuffer());

/** Cheap well-formedness: every opened tag is closed, in order. */
function xmlIsBalanced(xml: string): boolean {
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml))) {
    const [, close, name, attrs, selfClose] = m;
    if (attrs.startsWith("?") || name.startsWith("?") || name.startsWith("!")) continue;
    if (selfClose) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

describe("the board pack", () => {
  it("lands inside the 12 to 18 slides the specification asks for", () => {
    const n = buildBoardPack(model()).length;
    expect(n).toBeGreaterThanOrEqual(12);
    expect(n).toBeLessThanOrEqual(18);
  });

  it("opens on a cover and ends on the basis of preparation", () => {
    const slides = buildBoardPack(model());
    expect(slides[0].cover).toBe(true);
    expect(slides[0].title).toBe("Sample Company");
    expect(slides[slides.length - 1].eyebrow).toBe("BASIS OF PREPARATION");
  });

  it("puts the decisions the board must take in the deck", () => {
    const slides = buildBoardPack(model());
    expect(slides.some((s) => s.eyebrow === "DECISIONS REQUIRED")).toBe(true);
  });

  it("states an omission rather than a blank when there are no emissions", () => {
    // A workbook with the activity grids stripped must still say something true.
    const bare = buildEsgReportModel({
      workbook: { companyId: "x", sections: { "company-reporting-setup": { cells: { entity: "Bare Co" } } }, updatedAt: NOW.toISOString() },
      companyName: "Bare Co",
      companyId: "x",
      now: NOW,
    });
    const climate = buildBoardPack(bare).find((s) => s.eyebrow === "CLIMATE");
    expect(climate).toBeTruthy();
    const text = JSON.stringify(climate);
    expect(text).toContain("does not currently collect");
    expect(text).not.toMatch(/undefined|NaN|\[object/);
  });

  it("carries the version stamp onto every slide", () => {
    for (const s of buildBoardPack(model())) {
      expect(s.footnote, `slide "${s.title}" has no footnote`).toBeTruthy();
    }
  });

  it("never emits a table row that does not match its header", () => {
    for (const s of buildBoardPack(model())) {
      for (const b of s.body) {
        if (b.kind !== "table") continue;
        if (b.widths) expect(b.widths.length).toBe(b.head.length);
        for (const r of b.rows) expect(r.length).toBe(b.head.length);
      }
    }
  });
});

describe("the pptx package", () => {
  it("contains every part PowerPoint requires", async () => {
    const zip = await zipOf();
    const slides = buildBoardPack(model()).length;
    const required = [
      "[Content_Types].xml",
      "_rels/.rels",
      "ppt/presentation.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/theme/theme1.xml",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      "docProps/core.xml",
      "docProps/app.xml",
      ...Array.from({ length: slides }, (_, i) => `ppt/slides/slide${i + 1}.xml`),
      ...Array.from({ length: slides }, (_, i) => `ppt/slides/_rels/slide${i + 1}.xml.rels`),
    ];
    for (const part of required) expect(zip.file(part), `missing ${part}`).not.toBeNull();
  });

  it("declares a content type for every part, and every declared part exists", async () => {
    const zip = await zipOf();
    const ct = await zip.file("[Content_Types].xml")!.async("string");
    for (const name of Object.keys(zip.files)) {
      if (zip.files[name].dir || name.endsWith(".rels") || name === "[Content_Types].xml") continue;
      const declared = ct.includes(`PartName="/${name}"`) || /Default Extension="xml"/.test(ct);
      expect(declared, `${name} has no content type`).toBe(true);
    }
    for (const m of ct.matchAll(/PartName="\/([^"]+)"/g)) {
      expect(zip.file(m[1]), `content types declares missing part ${m[1]}`).not.toBeNull();
    }
  });

  it("resolves every relationship target to a part that exists", async () => {
    const zip = await zipOf();
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith(".rels")) continue;
      const dir = name.replace(/_rels\/[^/]+$/, "");
      const xml = await zip.file(name)!.async("string");
      for (const m of xml.matchAll(/Target="([^"]+)"/g)) {
        const target = m[1];
        if (/^https?:/.test(target)) continue;
        // Resolve "../x/y.xml" against the owning part's directory.
        const parts = (dir + target).split("/");
        const resolved: string[] = [];
        for (const p of parts) {
          if (p === "..") resolved.pop();
          else if (p && p !== ".") resolved.push(p);
        }
        expect(zip.file(resolved.join("/")), `${name} -> ${target} is dangling`).not.toBeNull();
      }
    }
  });

  it("emits well-formed XML in every part", async () => {
    const zip = await zipOf();
    for (const name of Object.keys(zip.files)) {
      if (zip.files[name].dir) continue;
      if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
      const xml = await zip.file(name)!.async("string");
      expect(xmlIsBalanced(xml), `${name} is not balanced`).toBe(true);
    }
  });

  it("numbers slide ids from 256 and wires each to a real slide relationship", async () => {
    const zip = await zipOf();
    const pres = await zip.file("ppt/presentation.xml")!.async("string");
    const rels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string");
    const ids = [...pres.matchAll(/<p:sldId id="(\d+)" r:id="(rId\d+)"\/>/g)];
    expect(ids.length).toBe(buildBoardPack(model()).length);
    for (const [, id, rId] of ids) {
      // PowerPoint rejects a slide id below 256.
      expect(Number(id)).toBeGreaterThanOrEqual(256);
      expect(rels).toContain(`Id="${rId}"`);
    }
    // Ids must be unique, or the deck silently loses slides.
    expect(new Set(ids.map((x) => x[1])).size).toBe(ids.length);
    expect(pres).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
  });

  it("gives every shape on a slide a unique id, with 1 reserved for the tree root", async () => {
    const zip = await zipOf();
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slides.length).toBeGreaterThan(0);
    for (const name of slides) {
      const xml = await zip.file(name)!.async("string");
      const ids = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => Number(m[1]));
      expect(new Set(ids).size, `${name} has duplicate shape ids`).toBe(ids.length);
      expect(ids.filter((i) => i === 1).length, `${name} must use id 1 once, for the tree root`).toBe(1);
    }
  });

  it("keeps the embedded skeleton byte-identical to the signed-off deck", async () => {
    const zip = await zipOf();
    expect(await zip.file("ppt/theme/theme1.xml")!.async("string")).toBe(PPTX_THEME_XML);
    expect(await zip.file("ppt/slideMasters/slideMaster1.xml")!.async("string")).toBe(PPTX_SLIDE_MASTER_XML);
    expect(await zip.file("ppt/slideLayouts/slideLayout1.xml")!.async("string")).toBe(PPTX_SLIDE_LAYOUT_XML);
    // The skeleton is the real thing, not a stub. A master without a clrMap or
    // a theme without its three schemes is what makes PowerPoint ask to repair.
    expect(PPTX_SLIDE_MASTER_XML).toContain("<p:clrMap");
    expect(PPTX_SLIDE_MASTER_XML).toContain("<p:sldLayoutIdLst>");
    for (const scheme of ["<a:clrScheme", "<a:fontScheme", "<a:fmtScheme"]) {
      expect(PPTX_THEME_XML, `theme is missing ${scheme}`).toContain(scheme);
    }
  });
});

describe("the deck's format and content", () => {
  it("uses the Okiru palette and typeface pairing on generated slides", async () => {
    const zip = await zipOf();
    const cover = await zip.file("ppt/slides/slide1.xml")!.async("string");
    const content = await zip.file("ppt/slides/slide2.xml")!.async("string");
    expect(cover).toContain('val="101820"'); // the deck's dark cover ground
    expect(cover).toContain("Cambria"); // titles are Cambria, set per run
    expect(content).toContain('val="00647A"'); // the teal that titles every content slide
    expect(content).toContain('val="0091A8"'); // the eyebrow accent
    expect(content).toContain("Calibri"); // body is Calibri
    // Content slides sit on the deck's grid, not wherever the renderer felt like.
    expect(content).toContain('<a:off x="548640" y="310896"/>'); // eyebrow
    expect(content).toContain('<a:off x="548640" y="566928"/>'); // title
  });

  it("builds tables to the deck's own recipe wherever one appears", async () => {
    const zip = await zipOf();
    const names = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    const withTables: string[] = [];
    for (const nm of names) {
      const xml = await zip.file(nm)!.async("string");
      if (xml.includes("<a:tbl>")) withTables.push(xml);
    }
    // The board pack is mostly tables; if none rendered, the renderer is broken.
    expect(withTables.length).toBeGreaterThan(3);
    for (const xml of withTables) {
      expect(xml).toContain('val="D5DEE0"'); // 6350-wide hairline on every edge
      expect(xml).toContain('w="6350"');
      expect(xml).toContain('<a:solidFill><a:srgbClr val="00647A"/></a:solidFill></a:tcPr>'); // header band
      expect(xml).toContain('marL="91440" marR="91440" marT="45720" marB="45720"');
    }
  });

  it("carries the client's actual figures, not the template's", async () => {
    const m = model();
    const zip = await zipOf();
    const all = (
      await Promise.all(
        Object.keys(zip.files)
          .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
          .map((f) => zip.file(f)!.async("string")),
      )
    ).join("");
    expect(all).toContain("Sample Company");
    expect(all).toContain(m.meta.generationReference);
    // The emissions figure the spine computed must appear on a slide.
    const s12 = m.ghg.scope1And2.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(all).toContain(s12);
  });

  it("watermarks every slide while the sign-off gate is unsatisfied", async () => {
    const zip = await zipOf();
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    for (const name of slides) {
      expect(await zip.file(name)!.async("string"), `${name} is not watermarked`).toContain("<a:t>DRAFT</a:t>");
    }
  });

  it("drops the watermark once a named officer and a date are recorded", async () => {
    const zip = await zipOf({
      assumptions: { _signOffName: "A Ndlovu", _signOffRole: "Company Secretary", _signOffDate: "2026-09-09" },
    });
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    for (const name of slides) {
      expect(await zip.file(name)!.async("string")).not.toContain("<a:t>DRAFT</a:t>");
    }
  });

  it("escapes workbook text so an ampersand cannot break the package", async () => {
    const zip = await zipOf({ "company-reporting-setup": { entity: "Smith & Sons <Pty> Ltd" } });
    const cover = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(cover).toContain("Smith &amp; Sons &lt;Pty&gt; Ltd");
    expect(xmlIsBalanced(cover)).toBe(true);
  });

  it("names the file as a Board Pack, distinct from the Disclosure Pack", () => {
    const m = model();
    expect(esgReportFilename(m, "pptx")).toContain("ESG-Board-Pack");
    expect(esgReportFilename(m, "docx")).toContain("ESG-Disclosure-Pack");
  });
});
