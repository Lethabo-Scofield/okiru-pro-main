/**
 * The export has one job: produce a document a client can open, from real
 * workbook data, in the Okiru template format, with the lockdown intact.
 *
 * These tests run the real SG Consumer golden fixture through the real spine
 * and the real renderers. They assert against the specification's own rules —
 * that nothing renders empty, that the sign-off gate holds, that every claim
 * carries evidence, that emissions never come from the mixed-unit L75 block —
 * rather than against a snapshot, because a snapshot would lock in whatever
 * the code happened to do on the day it was written.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildGoldenSections } from "../../../../../server/esgGoldenFixture";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { buildEsgReportModel } from "../esgReportModel";
import { buildDisclosurePack, esgReportFilename } from "../esgReportDocument";
import { renderEsgReportDocx } from "../esgReportDocx";

const NOW = new Date("2026-09-09T08:00:00.000Z");

function goldenWorkbook(overrides: Record<string, Record<string, unknown>> = {}): EsgWorkbookData {
  const sections = buildGoldenSections() as EsgWorkbookData["sections"];
  for (const [id, cells] of Object.entries(overrides)) {
    sections[id] = { cells: { ...(sections[id]?.cells ?? {}), ...cells } } as EsgWorkbookData["sections"][string];
  }
  return { companyId: "sg-consumer", sections, updatedAt: "2026-09-01T00:00:00.000Z" };
}

const model = () =>
  buildEsgReportModel({
    workbook: goldenWorkbook(),
    companyName: "SG Consumer",
    companyId: "sg-consumer",
    now: NOW,
  });

describe("the report spine", () => {
  it("populates metrics from the workbook rather than shipping an empty register", () => {
    const m = model();
    expect(m.metrics.length).toBeGreaterThan(30);
    expect(m.coverage.populated).toBeGreaterThan(0);
    expect(m.coverage.populated + m.coverage.omitted).toBe(m.coverage.total);
  });

  it("takes emissions from the inventory, not the mixed-unit L75 summary block", () => {
    const m = model();
    // `E_Data!L75:L84` sums litres, kWh and kL under a tCO2e label, giving a
    // figure roughly a thousand times the real one. A report that quoted it
    // would be indefensible, so the guard is on the order of magnitude.
    expect(m.ghg.scope1And2).toBeGreaterThan(0);
    expect(m.ghg.scope1And2).toBeLessThan(100_000);
    const headline = m.metrics.find((x) => x.metricName.startsWith("Scope 1 + 2"));
    expect(headline?.value).toBeCloseTo(Number(m.ghg.scope1And2.toFixed(2)), 2);
  });

  it("gives every metric the full section-5 record", () => {
    for (const x of model().metrics) {
      expect(x.metricId).toMatch(/^[A-Z]/);
      expect(x.boundary).toBeTruthy();
      expect(x.sourceSystem).toBeTruthy();
      expect(x.sourceOwner).toBeTruthy();
      expect(x.calculationMethod).toBeTruthy();
      expect(x.frameworkRefs.length).toBeGreaterThan(0);
      expect(["Green", "Amber", "Red", "Grey"]).toContain(x.ragStatus);
    }
  });

  it("renders a reasoned omission — never a blank — wherever a figure is absent", () => {
    for (const x of model().metrics.filter((y) => y.value == null)) {
      expect(x.omissionCode).toBeTruthy();
      expect(x.commentary).toBeTruthy();
      expect(String(x.commentary)).not.toMatch(/undefined|null|\[object/);
    }
  });

  it("turns every omission into a gap and a roadmap action", () => {
    const m = model();
    for (const x of m.metrics.filter((y) => y.omissionCode)) {
      expect(m.gaps.some((g) => g.metric === x.metricName)).toBe(true);
      expect(m.roadmap.some((r) => r.metric === x.metricName)).toBe(true);
    }
    for (const g of m.gaps) {
      expect(g.owner).toBeTruthy();
      expect(g.costBand).toBeTruthy();
      expect(g.targetClose).toBeTruthy();
      expect(m.roadmap.some((r) => r.roadmapRef === g.roadmapRef)).toBe(true);
    }
  });

  it("blocks a claim that carries no evidence, and pairs factual claims with a figure", () => {
    const m = model();
    for (const c of m.claims) {
      expect(c.evidenceIds.length).toBeGreaterThan(0);
      for (const ev of c.evidenceIds) {
        expect(m.evidence.some((e) => e.evidenceId === ev)).toBe(true);
      }
      if (c.tier === "A" || c.tier === "C") expect(c.pairedMetricIds.length).toBeGreaterThan(0);
    }
  });

  it("shows suppression in the disclosure index instead of dropping the row", () => {
    const m = model();
    expect(m.disclosureIndex.length).toBe(m.metrics.length);
    for (const row of m.disclosureIndex.filter((r) => r.status === "Omitted")) {
      expect(row.omissionReason).not.toBe("—");
    }
  });

  it("computes a weighted data quality index across the rated metrics", () => {
    const m = model();
    expect(m.dataQualityIndex).not.toBeNull();
    expect(m.dataQualityIndex!).toBeGreaterThanOrEqual(1);
    expect(m.dataQualityIndex!).toBeLessThanOrEqual(5);
  });
});

describe("the sign-off gate", () => {
  it("holds the report in DRAFT until a named officer and a date are recorded", () => {
    expect(model().meta.isDraft).toBe(true);
  });

  it("releases only when both the name and the date are present", () => {
    const nameOnly = buildEsgReportModel({
      workbook: goldenWorkbook({ assumptions: { _signOffName: "A Ndlovu" } }),
      companyName: "SG Consumer",
      companyId: "sg-consumer",
      now: NOW,
    });
    expect(nameOnly.meta.isDraft).toBe(true);

    const signed = buildEsgReportModel({
      workbook: goldenWorkbook({
        assumptions: { _signOffName: "A Ndlovu", _signOffRole: "Company Secretary", _signOffDate: "2026-09-09" },
      }),
      companyName: "SG Consumer",
      companyId: "sg-consumer",
      now: NOW,
    });
    expect(signed.meta.isDraft).toBe(false);
  });
});

describe("the document structure", () => {
  it("follows the template's section order, front matter through appendices", () => {
    const headings = buildDisclosurePack(model())
      .filter((b) => b.kind === "h1")
      .map((b) => (b as { text: string }).text);
    expect(headings).toEqual([
      "About this report",
      "How to use this report",
      "Disclosure index",
      "Section 1 — Executive summary",
      "Section 2 — Operating and regulatory context",
      "Section 3 — Governance",
      "Section 4 — Materiality",
      "Section 5 — Strategy and value creation",
      "Section 6 — Environmental performance",
      "Section 7 — Social performance",
      "Section 8 — Governance metrics",
      "Section 9 — Metrics, targets and performance",
      "Section 10 — Gap register and assurance readiness",
      "Section 11 — Roadmap",
      "Appendix A — Methodology",
      "Appendix B — Emission factors and sources",
      "Appendix C — Metric register (Data Book extract)",
      "Appendix D — Framework index",
      "Appendix E — Restatements",
      "Appendix F — Evidence register",
      "Appendix G — Glossary",
      "Appendix H — Legal and disclaimers",
    ]);
  });

  it("gives every table a header and a row count that matches its column count", () => {
    for (const blk of buildDisclosurePack(model())) {
      if (blk.kind !== "table") continue;
      expect(blk.head.length).toBeGreaterThan(0);
      if (blk.widths) expect(blk.widths.length).toBe(blk.head.length);
      for (const row of blk.rows) expect(row.length).toBe(blk.head.length);
    }
  });

  it("carries the mandatory provenance paragraph verbatim", () => {
    const text = buildDisclosurePack(model())
      .filter((b) => b.kind === "callout")
      .map((b) => (b as { text: string }).text)
      .join(" ");
    expect(text).toContain("Okiru has not independently verified the underlying data");
  });
});

describe("the Word rendering", () => {
  it("produces a package Word can open, with the parts it requires", async () => {
    const blob = await renderEsgReportDocx(model());
    expect(blob.size).toBeGreaterThan(8_000);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/settings.xml",
      "word/header1.xml",
      "word/footer1.xml",
      "word/_rels/document.xml.rels",
      "docProps/core.xml",
    ]) {
      expect(zip.file(part), `missing part ${part}`).not.toBeNull();
    }
  });

  it("writes the template's own page setup and palette, not a default", async () => {
    const zip = await JSZip.loadAsync(await (await renderEsgReportDocx(model())).arrayBuffer());
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain('w:w="12240" w:h="15840"');
    expect(doc).toContain('w:top="1440"');
    expect(doc).toContain('w:val="00647A"'); // the Okiru teal
    expect(doc).toContain('w:color="D5DEE0"'); // the hairline row rule
    expect(doc).toContain('w:ascii="Calibri"');
  });

  it("locks the file and watermarks it while it is unsigned", async () => {
    const zip = await JSZip.loadAsync(await (await renderEsgReportDocx(model())).arrayBuffer());
    const settings = await zip.file("word/settings.xml")!.async("string");
    expect(settings).toContain('w:edit="readOnly"');
    expect(settings).toContain('w:enforcement="1"');
    const header = await zip.file("word/header1.xml")!.async("string");
    expect(header).toContain('string="DRAFT"');
  });

  it("drops the watermark once the report is signed off", async () => {
    const signed = buildEsgReportModel({
      workbook: goldenWorkbook({
        assumptions: { _signOffName: "A Ndlovu", _signOffRole: "Company Secretary", _signOffDate: "2026-09-09" },
      }),
      companyName: "SG Consumer",
      companyId: "sg-consumer",
      now: NOW,
    });
    const zip = await JSZip.loadAsync(await (await renderEsgReportDocx(signed)).arrayBuffer());
    const header = await zip.file("word/header1.xml")!.async("string");
    expect(header).not.toContain('string="DRAFT"');
  });

  it("escapes workbook text so an ampersand in an entity name cannot break the package", async () => {
    const m = buildEsgReportModel({
      workbook: goldenWorkbook({ "company-reporting-setup": { entity: "Smith & Sons <Pty> Ltd" } }),
      companyName: "Smith & Sons",
      companyId: "smith",
      now: NOW,
    });
    const zip = await JSZip.loadAsync(await (await renderEsgReportDocx(m)).arrayBuffer());
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("Smith &amp; Sons &lt;Pty&gt; Ltd");
    expect(doc).not.toContain("Smith & Sons <Pty>");
  });

  it("stamps every page with the version and the generation reference", async () => {
    const m = model();
    const zip = await JSZip.loadAsync(await (await renderEsgReportDocx(m)).arrayBuffer());
    const footer = await zip.file("word/footer1.xml")!.async("string");
    expect(footer).toContain(m.meta.generationReference);
    expect(footer).toContain("DRAFT — NOT FOR ISSUE");
  });
});

describe("the entity name", () => {
  it("takes the workbook's own Cover entity over the client record's name", () => {
    // The Cover sheet is what the client typed and what the disclosure is made
    // in the name of. A client record renamed in the CRM must not silently
    // change the legal entity a signed-off report was issued for.
    expect(model().meta.entityName).toBe("Sample Company");
  });

  it("falls back to the client record when the workbook states no entity", () => {
    const sections = goldenWorkbook().sections;
    delete (sections["company-reporting-setup"].cells as Record<string, unknown>).entity;
    const m = buildEsgReportModel({
      workbook: { companyId: "sg-consumer", sections, updatedAt: "2026-09-01T00:00:00.000Z" },
      companyName: "SG Consumer",
      companyId: "sg-consumer",
      now: NOW,
    });
    expect(m.meta.entityName).toBe("SG Consumer");
  });
});

describe("the filename", () => {
  it("carries the entity, the state and the generation reference", () => {
    const m = model();
    expect(esgReportFilename(m, "docx")).toBe(
      `Sample-Company-ESG-Disclosure-Pack-DRAFT-${m.meta.generationReference}.docx`,
    );
  });
});
