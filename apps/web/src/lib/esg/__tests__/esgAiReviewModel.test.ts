/**
 * The ESG AI review's document rules, grounding and verifier. The model is
 * never called: replies are literal objects passed through the real checks.
 * Every name, site, figure and file here is invented.
 */
import { describe, expect, it } from "vitest";
import {
  ESG_AI_DECLINED_SECTION,
  ESG_UNITS,
  type EsgWorkbookLike,
} from "../esgAiReviewFill";
import {
  MAX_ESG_REVIEW_TARGETS,
  buildEsgAiReviewGrounding,
  buildEsgLibraryRuleFills,
  classifySupports,
  esgBillMonth,
  esgLibraryDocumentFromRun,
  figureFromQuote,
  parseEsgAiReviewReply,
  quoteInText,
  redactEsgText,
  verifyEsgAiReviewReply,
  type EsgLibraryDocument,
} from "../esgAiReviewModel";
import { writeEsgGridCells, type EsgGridRow } from "../esgGridRows";
import { ESG_PROVENANCE_SECTION, provenanceCells } from "../esgProvenance";

type Cells = Record<string, unknown>;
const workbook = (sections: Record<string, Cells>): EsgWorkbookLike => ({
  sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])),
});

/** Two sites, three months (Jan-24 … Mar-24), per site. */
const AXES = { eSites: "North\nSouth", eFirstMonth: "Jan-24", eMonthCount: 3 };

/** A stored library reading of one electricity bill. */
function bill(id: string, opts: { kwh?: number; mwh?: number; site?: string; start?: string; end?: string; extra?: Record<string, unknown> }): EsgLibraryDocument {
  const fields: Record<string, unknown> = {};
  const f = (v: unknown, snippet?: string) => ({ raw_value: v, normalized_value: v, data_type: "string", confidence: 0.9, source: { page: 1, table: null, text_snippet: snippet ?? null } });
  if (opts.kwh !== undefined) fields["energy.electricity_kwh"] = f(opts.kwh, `Consumption ${opts.kwh} kWh`);
  if (opts.mwh !== undefined) fields["energy.electricity_mwh"] = f(opts.mwh, `Consumption ${opts.mwh} MWh`);
  if (opts.site !== undefined) fields["energy.site_name"] = f(opts.site, `Supply address: ${opts.site}`);
  if (opts.start) fields["energy.billing_period_start"] = f(opts.start);
  if (opts.end) fields["energy.billing_period_end"] = f(opts.end);
  for (const [k, v] of Object.entries(opts.extra ?? {})) fields[k] = f(v, String(v));
  return esgLibraryDocumentFromRun({ id, filename: `${id}.pdf`, documentType: "Municipal bill" }, { extracted_fields: fields });
}

const policy = (id: string, sentences: string[]): EsgLibraryDocument =>
  esgLibraryDocumentFromRun(
    { id, filename: `${id}.pdf`, documentType: "Policy" },
    { extracted_fields: Object.fromEntries(sentences.map((s, i) => [`statement_${i}`, { raw_value: s, normalized_value: s, data_type: "string", confidence: 0.9, source: { page: i + 1, table: null, text_snippet: s } }])) },
  );

describe("documents as the review reads them", () => {
  it("keeps the bill's figure, unit, site and period, and removes ID numbers, e-mails and phones", () => {
    const doc = esgLibraryDocumentFromRun(
      { id: "d1", filename: "north-jan.pdf" },
      {
        extracted_fields: {
          "energy.electricity_kwh": { raw_value: "12 400", normalized_value: 12400, source: { page: 2, text_snippet: "Total consumption 12 400 kWh" } },
          "energy.site_name": { raw_value: "Plover Depot, 4 Example Road", normalized_value: "Plover Depot, 4 Example Road", source: {} },
          "energy.billing_period_start": { normalized_value: "2024-01-01", source: {} },
          "energy.billing_period_end": { normalized_value: "2024-01-31", source: {} },
          contact_email: { normalized_value: "accounts@example.test", source: {} },
          "customer.id_number": { normalized_value: "8001015009087", source: {} },
          notes: { normalized_value: "Queries: 011 555 0199 or billing@example.test, ref 9001015009081", source: {} },
        },
      },
    );
    expect(doc.bills).toEqual([
      expect.objectContaining({ prefix: "s2", value: 12400, unit: ESG_UNITS.kWh, site: "Plover Depot, 4 Example Road", periodStart: "2024-01-01", periodEnd: "2024-01-31", page: 2 }),
    ]);
    expect(doc.text).toContain("Total consumption 12 400 kWh");
    expect(doc.text).not.toMatch(/example\.test|8001015009087|9001015009081|011 555 0199/);
    expect(redactEsgText("call +27 82 555 0123")).toBe("call [phone removed]");
  });

  it("places a bill only when its period is one calendar month", () => {
    expect(esgBillMonth("2024-02-01", "2024-02-29")).toEqual({ iso: "2024-02-29", label: "Feb-24" });
    expect(esgBillMonth("2024-02-03", "2024-02-29")?.label).toBe("Feb-24");
    expect(esgBillMonth("2024-01-15", "2024-02-14")).toBeNull();
    expect(esgBillMonth("2024-02-06", "2024-02-29")).toBeNull();
    expect(esgBillMonth("2024-02-01", "2024-02-27")).toBeNull();
    expect(esgBillMonth(undefined, "2024-02-29")).toBeNull();
  });

  it("checks a quote word for word, and refuses fragments", () => {
    expect(quoteInText("Total  consumption 12 400 KWH", "x\nTotal consumption 12 400 kWh\ny")).toBe(true);
    expect(quoteInText("the", "the cat")).toBe(false);
    expect(quoteInText("Total consumption 99 kWh", "Total consumption 12 400 kWh")).toBe(false);
  });
});

describe("the free rules over filed documents", () => {
  it("fills a site's month from a one-month bill, converting MWh with the conversion stated", () => {
    const wb = workbook({ "e-data": { ...AXES } });
    const { proposals, questions } = buildEsgLibraryRuleFills(wb, [
      bill("north-jan", { kwh: 12400, site: "North depot", start: "2024-01-01", end: "2024-01-31" }),
      bill("south-feb", { mwh: 3.2, site: "South", start: "2024-02-01", end: "2024-02-29" }),
    ]);
    expect(questions).toEqual([]);
    expect(proposals.find((p) => p.key === "e-data!s2_C14")).toMatchObject({ value: "12400", kind: "read", rule: "bill", origin: "rules" });
    const south = proposals.find((p) => p.key === "e-data!s2_D15")!;
    expect(south).toMatchObject({ value: "3200", conversion: "3.2 MWh = 3 200 kWh (×1000)" });
  });

  it("asks about a bill that spans two months and never splits it", () => {
    const { proposals, questions } = buildEsgLibraryRuleFills(workbook({ "e-data": { ...AXES } }), [
      bill("north-span", { kwh: 9000, site: "North", start: "2024-01-15", end: "2024-02-14" }),
    ]);
    expect(proposals).toEqual([]);
    expect(questions[0].question).toMatch(/not one calendar month, so it was not split/);
  });

  it("leaves a figure outside the reporting months out, and says so", () => {
    const r = buildEsgLibraryRuleFills(workbook({ "e-data": { ...AXES } }), [
      bill("north-dec", { kwh: 9000, site: "North", start: "2024-12-01", end: "2024-12-31" }),
    ]);
    expect(r.proposals).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/outside your reporting year/);
  });

  it("checks a group statement against the sites, asking when they differ by more than 0.5%", () => {
    const wb = workbook({ "e-data": { ...AXES, s2_C14: 1000, s2_C15: 2000 } });
    const close = buildEsgLibraryRuleFills(wb, [bill("group-ok", { kwh: 3010, site: "Group total", start: "2024-01-01", end: "2024-01-31" })]);
    expect(close.questions).toEqual([]);
    expect(close.proposals).toEqual([]);
    const far = buildEsgLibraryRuleFills(wb, [bill("group-off", { kwh: 3200, site: "Group total", start: "2024-01-01", end: "2024-01-31" })]);
    expect(far.proposals).toEqual([]);
    expect(far.questions[0].question).toBe("Your sites add to 3 000 kWh for Jan-24; the group statement (group-off.pdf) says 3 200 kWh. Which is right?");
  });

  it("in company-wide mode, sums a month only when every site's bill is filed", () => {
    const wide = workbook({ "e-data": { ...AXES, eScope: "Company wide" } });
    const both = buildEsgLibraryRuleFills(wide, [
      bill("n-jan", { kwh: 1000, site: "North", start: "2024-01-01", end: "2024-01-31" }),
      bill("s-jan", { kwh: 2500, site: "South", start: "2024-01-01", end: "2024-01-31" }),
    ]);
    expect(both.proposals.find((p) => p.key === "e-data!s2_C14")).toMatchObject({ value: "3500", kind: "derived", rule: "sum" });
    const one = buildEsgLibraryRuleFills(wide, [bill("n-feb", { kwh: 1000, site: "North", start: "2024-02-01", end: "2024-02-29" })]);
    expect(one.proposals).toEqual([]);
    expect(one.notes.join(" ")).toMatch(/bills for 1 of 2 sites/);
  });

  it("asks when two bills disagree on the same cell", () => {
    const { proposals, questions } = buildEsgLibraryRuleFills(workbook({ "e-data": { ...AXES } }), [
      bill("a", { kwh: 1000, site: "North", start: "2024-01-01", end: "2024-01-31" }),
      bill("b", { kwh: 1100, site: "North", start: "2024-01-01", end: "2024-01-31" }),
    ]);
    expect(proposals).toEqual([]);
    expect(questions[0].question).toMatch(/1 000 \(a\.pdf\) or 1 100 \(b\.pdf\)/);
  });

  it("hands a bill whose site it cannot tell to the model, and never guesses on the fallback sites", () => {
    const unknown = bill("x", { kwh: 700, site: "Unit 9, Harbour Park", start: "2024-03-01", end: "2024-03-31" });
    const own = buildEsgLibraryRuleFills(workbook({ "e-data": { ...AXES } }), [unknown]);
    expect(own.unresolved).toHaveLength(1);
    expect(own.proposals).toEqual([]);
    // No sites stated: the grid's fallback depots are not this company's.
    const none = buildEsgLibraryRuleFills(workbook({ "e-data": { eFirstMonth: "Jan-24", eMonthCount: 3 } }), [unknown]);
    expect(none.unresolved).toEqual([]);
    expect(none.questions[0].question).toMatch(/Add your sites/);
  });
});

describe("grounding", () => {
  it("lists bills to place, governance answers, register choices, missing months and stated figures — and no driver names", () => {
    const placed = ["C14", "D14"].map((c, i) => ({ sectionId: "e-data", cellRef: `s2_${c}`, value: 100 + i, sourceFile: "north-q.pdf", documentId: "d9" }));
    const wb = workbook({
      "e-data": { ...AXES, s2_C14: 100, s2_D14: 101 },
      [ESG_PROVENANCE_SECTION]: provenanceCells(placed),
      fleet: writeEsgGridCells("fleet", [{ _id: "v1", reg: "AB 12 CD", model: "Electric delivery van" } as EsgGridRow]),
      "driver-debrief": writeEsgGridCells("driver-debrief", [{ _id: "t1", date: "2024-01-02", driver: "Person Alpha", vehicleReg: "AB 12 CD" } as EsgGridRow]),
    });
    const docs = [bill("unknown-site", { kwh: 700, site: "Unit 9, Harbour Park", start: "2024-03-01", end: "2024-03-31" }), policy("ethics", ["The board approved the code of ethics on 3 March."])];
    const rules = buildEsgLibraryRuleFills(wb, docs);
    const g = buildEsgAiReviewGrounding(wb, docs, { unresolved: rules.unresolved });
    const kinds = new Set(g.targets.map((t) => t.kind));
    expect(Array.from(kinds).sort()).toEqual(["classify", "difference", "policy", "site", "stated"]);
    expect(g.targets.find((t) => t.kind === "difference")?.cell).toBe("s2_E14");
    expect(g.text).toContain("Which site is this bill for?");
    expect(g.text).toContain("Electric delivery van");
    expect(g.text).not.toContain("Person Alpha");
    expect(g.text).not.toMatch(/s2_E14|\bB15\b/);
    expect(g.targets.length).toBeLessThanOrEqual(MAX_ESG_REVIEW_TARGETS);
  });

  it("asks nothing that needs documents when none are filed, and caps the open cells", () => {
    const g = buildEsgAiReviewGrounding(workbook({ "e-data": { ...AXES } }), []);
    expect(g.targets).toEqual([]);
    const many = buildEsgAiReviewGrounding(workbook({ "e-data": { ...AXES } }), [policy("p", ["Nothing here applies."])], { max: 5 });
    expect(many.targets).toHaveLength(5);
    expect(many.truncated).toBeGreaterThan(0);
  });
});

describe("verifying the model's answers", () => {
  const siteSetup = () => {
    const wb = workbook({ "e-data": { ...AXES } });
    const doc = bill("harbour", { kwh: 700, site: "Unit 9, Harbour Park", start: "2024-03-01", end: "2024-03-31" });
    const rules = buildEsgLibraryRuleFills(wb, [doc]);
    const g = buildEsgAiReviewGrounding(wb, [doc], { unresolved: rules.unresolved });
    const t = g.targets.find((x) => x.kind === "site")!;
    const d = g.documents.find((x) => x.doc === doc)!.id;
    return { wb, g, t, d };
  };

  it("places a bill at the site the model names, with a quote from that bill", () => {
    const { wb, g, t, d } = siteSetup();
    const out = verifyEsgAiReviewReply(wb, g, {
      fills: [{ target: t.id, value: "south", kind: "read", rule: "site", document: d, quote: "Unit 9, Harbour Park", reasoning: "Harbour Park is the South depot's address." }],
      questions: [],
    });
    expect(out.rejected).toBe(0);
    expect(out.proposals[0]).toMatchObject({ key: "e-data!s2_E15", value: "700", kind: "read", rule: "site", origin: "model" });
    expect(out.proposals[0].evidence[0]).toMatchObject({ type: "document", file: "harbour.pdf", quote: "Unit 9, Harbour Park" });
  });

  it("refuses a site off the list, an invented quote, and a quote from another document", () => {
    const { wb, g, t, d } = siteSetup();
    const out = verifyEsgAiReviewReply(wb, g, {
      fills: [
        { target: t.id, value: "East", kind: "read", document: d, quote: "Unit 9, Harbour Park", reasoning: "r" },
        { target: t.id, value: "South", kind: "read", document: d, quote: "Harbour Park East wing", reasoning: "r" },
        { target: t.id, value: "South", kind: "read", document: "D99", quote: "Unit 9, Harbour Park", reasoning: "r" },
      ],
      questions: [],
    });
    expect(out.proposals).toEqual([]);
    expect(out.rejected).toBe(3);
    expect(out.questions[0].question).toMatch(/which site is it for/);
  });

  it("takes a governance answer only with a sentence the policy really holds", () => {
    const wb = workbook({ "e-data": { ...AXES } });
    const doc = policy("ethics", ["The board approved the code of ethics on 3 March."]);
    const g = buildEsgAiReviewGrounding(wb, [doc]);
    const t = g.targets.find((x) => x.kind === "policy" && x.cell === "B15")!;
    const ok = verifyEsgAiReviewReply(wb, g, {
      fills: [{ target: t.id, value: "Yes", kind: "read", document: "D1", quote: "The board approved the code of ethics", reasoning: "Approved by the board." }],
      questions: [],
    });
    expect(ok.proposals[0]).toMatchObject({ key: "g-data!B15", value: "Yes", rule: "policy" });
    const bad = verifyEsgAiReviewReply(wb, g, {
      fills: [
        { target: t.id, value: "Yes", kind: "read", document: "D1", quote: "ethics", reasoning: "r" },
        { target: t.id, value: "Maybe", kind: "read", document: "D1", quote: "The board approved the code of ethics", reasoning: "r" },
      ],
      questions: [],
    });
    expect(bad.proposals).toEqual([]);
    expect(bad.rejected).toBe(2);
  });

  it("classifies only when the quote says the chosen option", () => {
    const target = { section: "iso-tracker", cell: "D5", label: "ISO tracker · x · Status", options: ["Fully Compliant", "Partially Compliant", "Gap", "Not Applicable"] };
    expect(classifySupports(target, "Partially Compliant", "audit found the site partially compliant")).toBe(true);
    expect(classifySupports(target, "Fully Compliant", "audit found the site partially compliant")).toBe(false);
    expect(classifySupports(target, "Gap", "cardboard")).toBe(false);
    const ifrs = { ...target, section: "ifrs", options: ["Disclosed", "Partially Disclosed", "Not Disclosed", "N/A"] };
    expect(classifySupports(ifrs, "Disclosed", "scope 3 not disclosed")).toBe(false);
    const ev = { section: "fleet", cell: "P4", label: "Fleet register · AB 12 CD · Electric (EV)", options: ["Yes", "No"] };
    expect(classifySupports(ev, "Yes", "electric delivery van")).toBe(true);
    expect(classifySupports(ev, "Yes", "diesel rigid truck")).toBe(false);
    expect(classifySupports(ev, "No", "diesel rigid truck")).toBe(true);
  });

  it("reads a stated figure only in the cell's own unit family, with any ×1000 stated", () => {
    expect(figureFromQuote("Prior year usage 1 450 MWh", 1_450_000, ESG_UNITS.kWh, "MWh to kWh")).toMatchObject({ value: 1_450_000 });
    expect(figureFromQuote("Prior year usage 1 450 MWh", 1_450_000, ESG_UNITS.kWh, undefined)).toEqual({ fail: "a ×1000 must be stated" });
    // Litres are never tonnes of CO₂e; kWh never a count.
    expect(figureFromQuote("Diesel 5 000 litres", 5000, ESG_UNITS.tCO2e, undefined)).toEqual({ fail: "the quote's unit is not this cell's" });
    expect(figureFromQuote("Usage 900 kWh", 900, ESG_UNITS.count, undefined)).toEqual({ fail: "the quote measures something else" });
    expect(figureFromQuote("Payroll R 1 200 000", 1_200_000, ESG_UNITS.R, undefined)).toMatchObject({ value: 1_200_000 });
    // A board share stored as a fraction: 40% is 0.4, said so.
    expect(figureFromQuote("40% of the board are women", 0.4, ESG_UNITS.fraction, "percent to fraction")).toMatchObject({ value: 0.4 });
    expect(figureFromQuote("Payroll R 1 200 000", 1_300_000, ESG_UNITS.R, undefined)).toEqual({ fail: "the figure is not in the quote" });
  });

  it("works out a single missing month from a stated annual total, and refuses a quarter", () => {
    const placed = ["C14", "D14"].map((c, i) => ({ sectionId: "e-data", cellRef: `s2_${c}`, value: [1000, 1200][i], sourceFile: "north-statement.pdf", documentId: "d1" }));
    const wb = workbook({ "e-data": { ...AXES, s2_C14: 1000, s2_D14: 1200 }, [ESG_PROVENANCE_SECTION]: provenanceCells(placed) });
    const doc = esgLibraryDocumentFromRun({ id: "d1", filename: "north-statement.pdf" }, {
      extracted_fields: {
        annual: { normalized_value: "Annual consumption 3 500 kWh", source: { text_snippet: "Annual consumption 3 500 kWh" } },
        quarter: { normalized_value: "Quarter total 3 500 kWh", source: { text_snippet: "Quarter total 3 500 kWh" } },
      },
    });
    const g = buildEsgAiReviewGrounding(wb, [doc]);
    const t = g.targets.find((x) => x.kind === "difference")!;
    expect(t.cell).toBe("s2_E14");
    const reply = (quote: string, value: string, evidence = t.context) => ({
      fills: [{ target: t.id, value, kind: "derived", rule: "difference", document: "D1", quote, evidence, reasoning: "The year less the other months." }],
      questions: [],
    });
    const ok = verifyEsgAiReviewReply(wb, g, reply("Annual consumption 3 500 kWh", "1300"));
    expect(ok.proposals[0]).toMatchObject({ key: "e-data!s2_E14", value: "1300", kind: "derived", rule: "difference" });
    expect(ok.proposals[0].evidence).toHaveLength(3);
    expect(verifyEsgAiReviewReply(wb, g, reply("Quarter total 3 500 kWh", "1300")).proposals).toEqual([]);
    expect(verifyEsgAiReviewReply(wb, g, reply("Annual consumption 3 500 kWh", "1400")).proposals).toEqual([]);
    expect(verifyEsgAiReviewReply(wb, g, reply("Annual consumption 3 500 kWh", "1300", t.context.slice(0, 1))).proposals).toEqual([]);
  });

  it("never lands on a cell typed into since, nor offers a value the user undid", () => {
    const wb = workbook({ "e-data": { ...AXES } });
    const doc = policy("ethics", ["The board approved the code of ethics on 3 March."]);
    const g = buildEsgAiReviewGrounding(wb, [doc]);
    const t = g.targets.find((x) => x.kind === "policy" && x.cell === "B15")!;
    const reply = { fills: [{ target: t.id, value: "Yes", kind: "read", document: "D1", quote: "The board approved the code of ethics", reasoning: "r" }], questions: [] };
    const typed = workbook({ "e-data": { ...AXES }, "g-data": { B15: "No" } });
    expect(verifyEsgAiReviewReply(typed, g, reply).proposals).toEqual([]);
    const declined = workbook({ "e-data": { ...AXES }, [ESG_AI_DECLINED_SECTION]: { "g-data!B15": "Yes" } });
    expect(verifyEsgAiReviewReply(declined, g, reply).proposals).toEqual([]);
  });

  it("reads a messy reply and treats an unknown target as rejected", () => {
    expect(parseEsgAiReviewReply('```json\n{"fills":[{"target":"T9"}],"questions":[]}\n```').fills).toHaveLength(1);
    expect(parseEsgAiReviewReply("no json")).toEqual({ fills: [], questions: [] });
    const g = buildEsgAiReviewGrounding(workbook({ "e-data": { ...AXES } }), []);
    expect(verifyEsgAiReviewReply(workbook({}), g, { fills: [{ target: "T9", value: "1" }], questions: [] }).rejected).toBe(1);
  });
});
