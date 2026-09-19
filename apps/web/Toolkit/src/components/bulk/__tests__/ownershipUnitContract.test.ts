/**
 * Bulk upload and manual entry must store ownership in the same unit.
 *
 * They did not. The manual form converts on the way in —
 * `blackOwnership: formState.blackOwnership / 100` — so a hand-typed supplier
 * was stored as a FRACTION. The bulk importer's `pct()` returned a PERCENTAGE
 * while its own docstring promised a fraction, so the same spreadsheet column
 * arrived a hundred times larger.
 *
 * The grid showed it plainly ("4079%", "10000%"), but the damage was in the
 * scoring, not the display: every threshold in Preferential Procurement is a
 * fraction test. `sup.blackOwnership >= 0.51` is TRUE for a supplier stored as
 * `5` — so a 5%-black-owned supplier cleared the ≥51% black-owned line, both
 * black-women lines and designated group. The score moved up, in the company's
 * favour, which is the direction a verification agency looks at hardest.
 *
 * The units are genuinely mixed across the codebase and that is deliberate:
 * `Contribution.blackBenefitPercent` is documented "0-100%" and the API parser
 * converts into that unit. So the contract is per-field, and this file is where
 * it is written down.
 */
import { describe, expect, it } from "vitest";
import { BULK_IMPORT_SPECS, type ParsedRow } from "../bulkImportSpecs";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from "@toolkit/lib/sectors/rcogp-generic";
import type { Supplier } from "@toolkit/lib/types";

const supplierFrom = (row: ParsedRow): Supplier =>
  BULK_IMPORT_SPECS.procurement.toEntity(row as ParsedRow);

const shareholderFrom = (row: ParsedRow) =>
  BULK_IMPORT_SPECS.ownership.toEntity(row as ParsedRow) as {
    blackOwnership: number;
    blackWomenOwnership: number;
  };

describe("supplier ownership is stored as a fraction", () => {
  it("reads a percentage column as a fraction", () => {
    expect(supplierFrom({ supplierName: "A", currentBlackOwnership: 51 }).blackOwnership).toBe(0.51);
    expect(supplierFrom({ supplierName: "B", currentBlackOwnership: 100 }).blackOwnership).toBe(1);
  });

  it("reads a column already written as a fraction the same way", () => {
    expect(supplierFrom({ supplierName: "C", currentBlackOwnership: 0.51 }).blackOwnership).toBe(0.51);
  });

  it("keeps a small holding small", () => {
    // The whole bug in one number: 5 meant 5%, and 5 >= 0.51 passed everything.
    expect(supplierFrom({ supplierName: "D", currentBlackOwnership: 5 }).blackOwnership).toBe(0.05);
  });
});

describe("the thresholds a wrong unit would have cleared", () => {
  it("does not count a 5% black-owned supplier as ≥51% black owned", () => {
    const supplier = supplierFrom({
      supplierName: "Barely Black Holdings",
      spend: 1_000_000,
      bbbeeLevel: "4",
      currentBlackOwnership: 5,
      currentSize: "Generic",
      empoweringSupplier: "Yes",
    });
    expect(supplier.blackOwnership).toBeLessThan(0.51);

    const result = calculateProcurementScore(
      { id: "p", clientId: "c", tmps: 1_000_000, suppliers: [supplier] },
      RCOGP_GENERIC_CALCULATOR_CONFIG,
    );
    expect(result.rawStats.spendAllBlackOwned).toBe(0);
  });

  it("still counts a genuinely 51% black-owned supplier", () => {
    const supplier = supplierFrom({
      supplierName: "Genuinely Black Holdings",
      spend: 1_000_000,
      bbbeeLevel: "4",
      currentBlackOwnership: 51,
      currentSize: "Generic",
      empoweringSupplier: "Yes",
    });

    const result = calculateProcurementScore(
      { id: "p", clientId: "c", tmps: 1_000_000, suppliers: [supplier] },
      RCOGP_GENERIC_CALCULATOR_CONFIG,
    );
    expect(result.rawStats.spendAllBlackOwned).toBe(1_000_000);
  });
});

describe("shareholder ownership uses the same fraction", () => {
  it("reads a black shareholder as wholly black-owned, as 1 not 100", () => {
    const sh = shareholderFrom({
      shareholderName: "N Khumalo",
      race: "African",
      gender: "Female",
      shareholding: 34,
    });
    expect(sh.blackOwnership).toBe(1);
    expect(sh.blackWomenOwnership).toBe(1);
  });

  it("reads a stated percentage as a fraction", () => {
    const sh = shareholderFrom({ shareholderName: "Trust", blackOwnership: 45 });
    expect(sh.blackOwnership).toBe(0.45);
  });
});

/**
 * The exception, written down so the next person does not "fix" it.
 *
 * SED weights a contribution by how much reaches black beneficiaries, and that
 * field is a percentage out of 100 by its own type comment. Folding it into the
 * fraction helper would divide every SED contribution's benefit by a hundred.
 */
describe("SED black benefit stays a percentage out of 100", () => {
  it("reads 100 as 100, not as 1", () => {
    const c = BULK_IMPORT_SPECS.sed.toEntity({
      beneficiaryName: "Rural Schools Trust",
      amount: 180_000,
      contributionType: "Bursaries",
      percentBenefitingBlack: 100,
    } as ParsedRow) as { blackBenefitPercent?: number };
    expect(c.blackBenefitPercent).toBe(100);
  });

  it("reads a fraction up into a percentage", () => {
    const c = BULK_IMPORT_SPECS.sed.toEntity({
      beneficiaryName: "Clinic",
      amount: 95_000,
      contributionType: "Donation",
      percentBenefitingBlack: 0.85,
    } as ParsedRow) as { blackBenefitPercent?: number };
    expect(c.blackBenefitPercent).toBe(85);
  });
});

/**
 * The other half of the incident: twenty suppliers, R9.0m of recognised spend,
 * and a pillar scoring 0.00 because TMPS came back as 0 — with nothing on the
 * page saying why.
 */
describe("a schedule with no denominator says so", () => {
  const suppliers = [
    supplierFrom({ supplierName: "Alpha", spend: 400_000, bbbeeLevel: "1", currentSize: "Generic" }),
    supplierFrom({ supplierName: "Beta", spend: 600_000, bbbeeLevel: "2", currentSize: "QSE" }),
  ];

  it("reports a missing TMPS as a coverage gap rather than scoring 0 in silence", () => {
    const result = calculateProcurementScore(
      { id: "p", clientId: "c", tmps: 0, suppliers },
      RCOGP_GENERIC_CALCULATOR_CONFIG,
    );

    expect(result.total).toBe(0);
    const note = (result.coverageNotes ?? []).join(" ");
    expect(note).toMatch(/Total Measured Procurement Spend is not set/i);
    expect(note).toContain("2 suppliers");
    // The schedule total, however en-ZA chooses to space its thousands.
    expect(note.replace(/[\s ]/g, "")).toContain("R1000000");
  });

  it("stays a gap, not a misplacement — dataFlags is for a figure that is wrong, not absent", () => {
    const result = calculateProcurementScore(
      { id: "p", clientId: "c", tmps: 0, suppliers },
      RCOGP_GENERIC_CALCULATOR_CONFIG,
    );
    expect(result.dataFlags).toEqual([]);
  });

  it("says nothing when TMPS is present", () => {
    const result = calculateProcurementScore(
      { id: "p", clientId: "c", tmps: 1_000_000, suppliers },
      RCOGP_GENERIC_CALCULATOR_CONFIG,
    );
    expect((result.coverageNotes ?? []).join(" ")).not.toMatch(/not set/i);
    expect(result.total).toBeGreaterThan(0);
  });
});
