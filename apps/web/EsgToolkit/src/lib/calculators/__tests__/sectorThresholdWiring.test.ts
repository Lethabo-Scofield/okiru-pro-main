/**
 * Proof that the environmental scorer takes its thresholds from the SECTOR
 * REGISTRY, and not from a constant bound at module load.
 *
 * WHY THIS NEEDS A MOCK RATHER THAN TWO REAL SECTORS
 *
 * Every sector currently inherits the base end to end. `consumer-goods` — the
 * only one marked `workbook-verified` — overrides `reporting`, `defaultSites`
 * and `defaultMonths`, and not a single threshold, because the base was lifted
 * from that very workbook. So no pair of real sectors has different numbers,
 * and a test comparing two of them would pass just as happily against a
 * hardcoded constant. That was checked, not assumed: deleting the sector
 * lookup and pasting the base values back left the behaviour-level tests
 * green.
 *
 * Mocking the registry is therefore the only way to make this assertion bite
 * today. It becomes redundant — and should be replaced by a real
 * sector-versus-sector comparison — the moment the first genuine calibration
 * lands.
 */
import { describe, expect, it, vi } from "vitest";
import { ESG_BASE_VALUES } from "../../esgConfig/base";

/** The base, with ONE threshold moved, so only that value can explain a change. */
const LENIENT_WASTE_TARGET = 0.375;

vi.mock("../../esgConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../esgConfig")>();
  return {
    ...actual,
    esgSectorConfigForWorkbook: vi.fn(() => ({
      ...ESG_BASE_VALUES,
      thresholds: { ...ESG_BASE_VALUES.thresholds, wasteDiversion: LENIENT_WASTE_TARGET },
    })),
  };
});

const { scoreEnvironmental } = await import("../environmental");
const esgConfig = await import("../../esgConfig");

function workbook(diversionRate: number, statedTarget?: number) {
  return {
    companyId: "WIRING",
    sections: {
      "company-reporting-setup": { cells: { sector: "Mining" } },
      assumptions: {
        cells: statedTarget == null
          ? { B8: "Standard", B9: 0.5 }
          : { B8: "Standard", B9: 0.5, B48: statedTarget },
      },
      waste: { cells: { B16: diversionRate } },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as never;
}

describe("environmental thresholds come from the sector registry", () => {
  it("consults the registry for the workbook it is scoring", () => {
    scoreEnvironmental(workbook(0.375));
    expect(esgConfig.esgSectorConfigForWorkbook).toHaveBeenCalled();
  });

  it("bands against the SECTOR's waste target, not the base one", () => {
    /*
     * `Waste_Register!B16` is the diversion rate `E d19` scores. Against the
     * real base target of 0.75, a rate of 0.375 sits exactly at the stance
     * floor and earns partial credit. Against the mocked sector target of
     * 0.375 the same rate meets the target outright and earns the full 5.
     *
     * A scorer that ignored the sector would return the partial figure, and
     * this would fail — which is the entire point of the file.
     */
    expect(ESG_BASE_VALUES.thresholds.wasteDiversion).toBe(0.75);
    expect(scoreEnvironmental(workbook(0.375)).rows.d19).toBeCloseTo(5, 6);
  });

  it("still lets an explicit Assumptions cell outrank the sector", () => {
    // A stated target of 0.9 is stricter than the mocked sector's 0.375, and
    // 0.375/0.9 is below the 0.5 stance floor, so nothing is earned.
    expect(scoreEnvironmental(workbook(0.375, 0.9)).rows.d19).toBe(0);
  });
});
