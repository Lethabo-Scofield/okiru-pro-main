/**
 * "Put it here" (B7): a figure the documents did not place for want of a site
 * or a month carries the one question that places it, a person's answer puts
 * it in the workbook, and evidence no cell needs is kept apart from both.
 */
import { describe, expect, it } from "vitest";
import {
  applyEsgParserResult,
  esgChoiceCell,
  esgManualPlacements,
  withEsgManualPlacement,
  type EsgParserCaseLike,
} from "@/components/esg/esgParserInjection";
import { buildEsgDocumentReview } from "@/components/esg/esgDocumentReview";
import { esgWorkbookAxisState } from "@/lib/esg/esgCaseAxes";
import { ESG_DEFAULT_MONTHS } from "@/components/esg-workbook/esgDefaults";

const AXES = { depots: ["ALDER", "BKT", "DRN", "FENWICK", "GH"], months: ESG_DEFAULT_MONTHS };

/** A bill whose site the workbook does not know, read as the parser hands it back. */
function billCase(site: string, periodEnd: string, kwh: number): EsgParserCaseLike {
  const file = "BKT JULY 2025.pdf";
  return {
    status: "resolved",
    ai_entities: {
      extractions: [
        {
          documentId: "ghg_energy__municipal_electricity_bill",
          sourceFile: file,
          element: "GHG_ENERGY",
          values: [
            { field: "site_name", value: site, sourceFile: file },
            { field: "billing_period_end", value: periodEnd, sourceFile: file },
            { field: "electricity_kwh", value: kwh, sourceFile: file },
            { field: "utility_account_number", value: "900000001", sourceFile: file },
          ],
        },
      ],
      calculator: {
        entries: [],
        rows: [
          {
            grid: "esg_monthly_rows",
            cells: {
              "monthly.measure": "energy.electricity_kwh",
              "monthly.site": site,
              "monthly.period_end": periodEnd,
              "monthly.value": kwh,
              "monthly.field": "electricity_kwh",
              "monthly.context": "site_name,billing_period_end",
            },
            sourceFiles: [file],
          },
        ],
      },
    },
  } as EsgParserCaseLike;
}

const ADDRESS = "1 EXAMPLE STREET, SAMPLE INDUSTRIA";

describe("a figure held for want of a site", () => {
  it("carries the question that places it, and its site and period follow it", () => {
    const injection = applyEsgParserResult(billCase(ADDRESS, "2025-08-31", 87_412.6), { axes: AXES });
    const figure = injection.unplaced.find((u) => u.field === "electricity_kwh")!;
    expect(figure.choice).toMatchObject({
      kind: "monthly",
      prefix: "s2",
      measure: "Electricity",
      value: 87_412.6,
      unit: "kWh",
      needs: ["site"],
      month: "D", // Aug-25, the second month of the reporting year
      statedSite: ADDRESS,
    });
    const context = injection.unplaced.filter((u) => u.field === "site_name" || u.field === "billing_period_end");
    expect(context.map((u) => u.partOf)).toEqual([figure.choice!.id, figure.choice!.id]);
    // The account number is evidence: no cell in the workbook holds it.
    expect(injection.unplaced.find((u) => u.field === "utility_account_number")?.rejection).toBe("no_workbook_home");
  });

  it("asks nothing of a bill outside the reporting year — that is not this year's figure", () => {
    const injection = applyEsgParserResult(billCase(ADDRESS, "2024-08-31", 90_000), { axes: AXES });
    expect(injection.unplaced.find((u) => u.field === "electricity_kwh")?.choice).toBeUndefined();
  });

  it("asks which month a bill ending just before the year is booked in — the company's call, not ours", () => {
    // 29 May – 26 Jun 2025, the month before Jul-25: a client may book it as July.
    const injection = applyEsgParserResult(billCase(ADDRESS, "2025-06-26", 31_864.42), { axes: AXES });
    const figure = injection.unplaced.find((u) => u.field === "electricity_kwh")!;
    expect(figure.choice).toMatchObject({ needs: ["site", "month"], value: 31_864.42 });
    expect(figure.choice!.month).toBeUndefined();
    expect(figure.reason).toMatch(/2025-06, just outside the reporting year .* say which month your company books it in/);
  });

  it("asks nothing about a zero — no water on an electricity bill is not a figure to place", () => {
    const injection = applyEsgParserResult(billCase(ADDRESS, "2025-08-31", 0), { axes: AXES });
    expect(injection.unplaced.find((u) => u.field === "electricity_kwh")?.choice).toBeUndefined();
  });

  it("asks once about a figure read twice, and one answer places both readings", () => {
    const once = billCase(ADDRESS, "2025-08-31", 31_864.42);
    const twice = billCase(`At ${ADDRESS} / Erf 10001`, "2025-08-31", 31_864.42);
    const parsed = {
      ...once,
      ai_entities: {
        extractions: [...once.ai_entities!.extractions!, ...twice.ai_entities!.extractions!],
        calculator: { entries: [], rows: [...once.ai_entities!.calculator!.rows!, ...twice.ai_entities!.calculator!.rows!] },
      },
    } as EsgParserCaseLike;
    const held = applyEsgParserResult(parsed, { axes: AXES });
    const ids = held.unplaced.filter((u) => u.choice).map((u) => u.choice!.id);
    expect(new Set(ids).size).toBe(1);
    const [doc] = buildEsgDocumentReview({ parserCase: parsed, injection: held, uploadNames: ["BKT JULY 2025.pdf"] });
    expect(doc.unplaced.filter((v) => v.ask)).toHaveLength(1);

    const answered = withEsgManualPlacement(parsed, ids[0], { sectionId: "e-data", cellRef: "s2_D15", value: 31_864.42, where: "BKT, Aug-25" });
    const placed = applyEsgParserResult(answered, { axes: AXES });
    expect(placed.unplaced.filter((u) => u.field === "electricity_kwh")).toEqual([]);
  });
});

describe("a person's answer", () => {
  it("names the cell only once every question is answered", () => {
    const { unplaced } = applyEsgParserResult(billCase(ADDRESS, "2025-08-31", 1), { axes: AXES });
    const choice = unplaced.find((u) => u.choice)!.choice!;
    expect(esgChoiceCell(choice, {})).toBeNull();
    // BKT is the second site (row 15); August is column D.
    expect(esgChoiceCell(choice, { siteRow: 1 })).toEqual({ sectionId: "e-data", cellRef: "s2_D15" });
  });

  it("puts the figure in the workbook, moves it and its site and period to placed, and can be taken back", () => {
    const parsed = billCase(ADDRESS, "2025-08-31", 87_412.6);
    const choice = applyEsgParserResult(parsed, { axes: AXES }).unplaced.find((u) => u.choice)!.choice!;
    const answered = withEsgManualPlacement(parsed, choice.id, { sectionId: "e-data", cellRef: "s2_D15", value: choice.value, where: "BKT, Aug-25" });

    const injection = applyEsgParserResult(answered, { axes: AXES });
    expect(injection.patches["e-data"].cells.s2_D15).toBe(87_412.6);
    expect(injection.placed.filter((p) => p.cellRef === "s2_D15").map((p) => p.field).sort()).toEqual([
      "billing_period_end",
      "electricity_kwh",
      "site_name",
    ]);
    expect(injection.unplaced.map((u) => u.field)).toEqual(["utility_account_number"]);
    expect(injection.answered).toEqual([expect.objectContaining({ field: "electricity_kwh", placement: expect.objectContaining({ where: "BKT, Aug-25" }) })]);
    expect(injection.figuresPlaced).toBe(1);

    // Undo: the case forgets the answer, and the figure is held again.
    const undone = withEsgManualPlacement(answered, choice.id, null);
    expect(esgManualPlacements(undone)).toEqual([]);
    expect(applyEsgParserResult(undone, { axes: AXES }).patches["e-data"]?.cells.s2_D15).toBeUndefined();
  });

  it("records the months it was placed on, so the workbook keeps reading it in the same place", () => {
    const parsed = billCase(ADDRESS, "2025-08-31", 500);
    // The company named its sites; its reporting months are still open, so
    // they come from the documents — and must be written with the figure.
    const workbook = esgWorkbookAxisState({ eSites: "ALDER\nBKT" });
    const held = applyEsgParserResult(parsed, { workbook });
    const choice = held.unplaced.find((u) => u.choice)!.choice!;
    expect(held.patches["e-data"]?.cells.eFirstMonth).toBeUndefined();

    const cell = esgChoiceCell(choice, { siteRow: 1 })!;
    const answered = withEsgManualPlacement(parsed, choice.id, { ...cell, value: 500, where: "BKT" });
    const cells = applyEsgParserResult(answered, { workbook }).patches["e-data"].cells;
    expect(cells[cell.cellRef]).toBe(500);
    expect(cells.eFirstMonth).toBeDefined();
  });
});

describe("the review", () => {
  it("asks where a held figure goes, keeps evidence apart, and counts what needs a person", () => {
    const parsed = billCase(ADDRESS, "2025-08-31", 87_412.6);
    const injection = applyEsgParserResult(parsed, { axes: AXES });
    const [doc] = buildEsgDocumentReview({ parserCase: parsed, injection, uploadNames: ["BKT JULY 2025.pdf"] });

    const question = doc.unplaced.find((v) => v.ask)!;
    expect(question.label).toBe("Electricity");
    expect(question.ask!.prompt).toBe(`Which of your sites is this — the document says “${ADDRESS}”?`);
    expect(question.ask!.fields[0].options.map((o) => o.label)).toEqual(AXES.depots);
    // The figure's site and period are not listed again beside it.
    expect(doc.unplaced.some((v) => /site name|billing period/i.test(v.label))).toBe(false);
    expect(doc.unplaced.find((v) => /account/i.test(v.label))?.evidence).toBe(true);
    expect(doc.state).toBe("needs-look");
    expect(doc.problems[0].headline).toBe("1 figure from this document needs you to say where it goes.");
    expect(doc.summary).toBe("0 placed · 4 read · 1 to place · 1 kept as evidence");
  });

  it("shows an answered figure where it went, with the question kept for undo", () => {
    const parsed = billCase(ADDRESS, "2025-08-31", 87_412.6);
    const choice = applyEsgParserResult(parsed, { axes: AXES }).unplaced.find((u) => u.choice)!.choice!;
    const answered = withEsgManualPlacement(parsed, choice.id, { sectionId: "e-data", cellRef: "s2_D15", value: choice.value, where: "BKT, Aug-25" });
    const injection = applyEsgParserResult(answered, { axes: AXES });
    const [doc] = buildEsgDocumentReview({ parserCase: answered, injection, uploadNames: ["BKT JULY 2025.pdf"] });
    expect(doc.unplaced.find((v) => v.answered)).toMatchObject({ label: "Electricity", answered: "BKT, Aug-25", ask: { id: choice.id } });
    expect(doc.state).toBe("read");
  });
});
