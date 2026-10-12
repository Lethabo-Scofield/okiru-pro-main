/**
 * "Disagreements between documents" counts only what a person must settle.
 *
 * A real pack showed 30 here; most were one document rounding to the Rand,
 * the same value written two ways, or notes on how readings were joined.
 * Names and figures below are invented.
 */
import { describe, expect, it } from "vitest";
import { onlyRounding, sameValue, sortReconciliationFlags, type ReconciliationFlag } from "../reconciliationNotes";
import { parserExtractionsToWorkbook, type ParserExtraction } from "../parserToWorkbook";

const supplierTable = (sourceFile: string, rows: Array<Record<string, unknown>>): ParserExtraction => ({
  documentId: "sheet_table__esd",
  sourceFile,
  element: "ESD",
  values: [{ field: "supplier_rows", value: rows }],
});

const flag = (note: string, extra: Partial<ReconciliationFlag> = {}): ReconciliationFlag => ({ sourceFile: "Supplier", note, ...extra });

describe("sameValue", () => {
  it("treats one value written two ways as the same", () => {
    expect(sameValue("51%", 0.51)).toBe(true);
    expect(sameValue("0.4967", "49.67%")).toBe(true);
    expect(sameValue("R 12 500,00", 12500)).toBe(true);
    expect(sameValue("(2 400)", -2400)).toBe(true);
    expect(sameValue("2025-03-31", "31/03/2025")).toBe(true);
    expect(sameValue("31 March 2025", "2025-03-31")).toBe(true);
    expect(sameValue("Top Management", "top management")).toBe(true);
  });

  it("does not call different values the same", () => {
    expect(sameValue(12500, 12500.4)).toBe(false);
    expect(sameValue("51%", 0.49)).toBe(false);
    expect(sameValue("2025-03-31", "2025-04-30")).toBe(false);
    expect(sameValue("Top Management", "Senior Management")).toBe(false);
    expect(sameValue("", "")).toBe(false);
  });
});

describe("onlyRounding", () => {
  it("is a difference under R1 between two figures", () => {
    expect(onlyRounding(12500, 12500.4)).toBe(true);
    expect(onlyRounding("12 499.60", 12500)).toBe(true);
    expect(onlyRounding(12500, 12501.5)).toBe(false);
    expect(onlyRounding(1200000, 400000)).toBe(false);
    expect(onlyRounding("Level 1", "Level 2")).toBe(false);
  });

  it("never mixes a percentage with a plain figure", () => {
    expect(onlyRounding("50%", 50.4)).toBe(false);
  });

  it("never calls two percentages rounding", () => {
    expect(onlyRounding("51%", "50.5%")).toBe(false);
  });
});

describe("sortReconciliationFlags", () => {
  it("counts only real disagreements; folds rounding, same-value, blanks and joining notes", () => {
    const sorted = sortReconciliationFlags([
      flag("spend 12,500 vs 12,500.40", { values: [12500, 12500.4], column: "spend" }),
      flag("share 51% vs 0.51", { values: ["51%", 0.51] }),
      flag("date blank vs filled", { values: ["", "2025-03-31"] }),
      flag("spend 1,200,000 vs 400,000", { values: [1200000, 400000] }),
      flag("level Top vs Senior", { values: ["Top Management", "Senior Management"] }),
      flag("a group certificate is taken as this supplier's", { kind: "linked" }),
      flag("two identical rows collapsed", { kind: "collapsed" }),
      flag("level worked out from the job title", { kind: "worked-out" }),
      flag("a finding without the two values"),
    ]);
    expect(sorted.disagreements.map((f) => f.note)).toEqual([
      "spend 1,200,000 vs 400,000",
      "level Top vs Senior",
      "a finding without the two values",
    ]);
    expect(sorted.rounding).toHaveLength(1);
    expect(sorted.sameValue).toHaveLength(2);
    expect(sorted.notes).toHaveLength(3);
  });

  it("applies the R1 tolerance only to Rand columns", () => {
    const sorted = sortReconciliationFlags([
      flag("shareholding 51 vs 50.5", { values: [51, 50.5], column: "shareholding" }),
      flag("fraction 0.51 vs 0.26", { values: [0.51, 0.26], column: "economicInterest" }),
      flag("level 1 vs 1.5", { values: [1, 1.5], column: "bbbeeLevel" }),
      flag("spend with no column 100 vs 100.4", { values: [100, 100.4] }),
      flag("salary 30,000 vs 30,000.20", { values: [30000, 30000.2], column: "salary" }),
    ]);
    expect(sorted.disagreements.map((f) => f.note)).toEqual([
      "shareholding 51 vs 50.5",
      "fraction 0.51 vs 0.26",
      "level 1 vs 1.5",
      "spend with no column 100 vs 100.4",
    ]);
    expect(sorted.rounding.map((f) => f.note)).toEqual(["salary 30,000 vs 30,000.20"]);
  });

  it("never folds a finding where both rows were kept", () => {
    const sorted = sortReconciliationFlags([
      flag("two readings disagree on spend. Both rows are kept", { values: [12500, 12500.4], column: "spend", rowsKept: true }),
    ]);
    expect(sorted.disagreements).toHaveLength(1);
    expect(sorted.rounding).toHaveLength(0);
  });

  it("says a repeated note once", () => {
    const twice = flag("spend 1,200,000 vs 400,000", { values: [1200000, 400000] });
    expect(sortReconciliationFlags([twice, { ...twice }]).disagreements).toHaveLength(1);
  });
});

describe("the linking step's findings carry what the sorting needs", () => {
  it("one schedule rounding to the Rand is rounding; a different figure is a disagreement", () => {
    const result = parserExtractionsToWorkbook([
      supplierTable("Gathering.xlsx › Procurement", [
        { supplier_name: "Kestrel Brakes", claimed_spend_ex_vat: 14000 },
        { supplier_name: "Heron Fuel", claimed_spend_ex_vat: 1200000 },
      ]),
      supplierTable("Spend schedule.xlsx › Procurement", [
        { supplier_name: "Kestrel Brakes", claimed_spend_ex_vat: 14000.35 },
        { supplier_name: "Heron Fuel", claimed_spend_ex_vat: 400000 },
      ]),
    ]);
    const spend = result.reconciliation.filter((f) => f.section === "procurement" && !f.kind);
    expect(spend.length).toBeGreaterThanOrEqual(2);
    for (const finding of spend) expect(finding.values).toHaveLength(2);

    const sorted = sortReconciliationFlags(
      result.reconciliation.map((f) => ({ sourceFile: f.entity, note: f.message, kind: f.kind, values: f.values, column: f.column })),
    );
    expect(sorted.disagreements.map((f) => f.sourceFile)).toEqual(["Heron Fuel"]);
    expect(sorted.rounding.map((f) => f.sourceFile)).toEqual(["Kestrel Brakes"]);
  });

  it("two readings of one document that differ by cents keep both rows and stay a disagreement", () => {
    const result = parserExtractionsToWorkbook([
      supplierTable("Spend schedule.xlsx › Procurement", [{ supplier_name: "Kestrel Brakes", claimed_spend_ex_vat: 12500 }]),
      supplierTable("Spend schedule.xlsx › Procurement", [{ supplier_name: "Kestrel Brakes", claimed_spend_ex_vat: 12500.4 }]),
    ]);
    const kept = result.reconciliation.filter((f) => /Both rows are kept/.test(f.message));
    expect(kept.length).toBeGreaterThan(0);
    for (const finding of kept) expect(finding.rowsKept).toBe(true);
    const sorted = sortReconciliationFlags(
      result.reconciliation.map((f) => ({ sourceFile: f.entity, note: f.message, kind: f.kind, values: f.values, column: f.column, rowsKept: f.rowsKept })),
    );
    expect(sorted.rounding).toHaveLength(0);
    expect(sorted.disagreements.some((f) => /Both rows are kept/.test(f.note))).toBe(true);
  });

  it("marks identical rows folded into one as a note, not a disagreement", () => {
    const result = parserExtractionsToWorkbook([
      {
        documentId: "sed__schedule",
        sourceFile: "SED.xlsx › Social Development",
        element: "SED",
        values: [{ field: "sed_rows", value: [{ beneficiary_name: "Youth Centre", amount: 5000 }, { beneficiary_name: "Youth Centre", amount: 5000 }] }],
      },
    ]);
    const collapsed = result.reconciliation.filter((f) => /identical/.test(f.message));
    expect(collapsed.length).toBeGreaterThan(0);
    for (const finding of collapsed) expect(finding.kind).toBe("collapsed");
  });
});
