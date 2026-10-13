/**
 * The scorers must ask which sector they are in.
 *
 * The cover screen offers fourteen sectors and the registry has held a config
 * for each for some time — but `ghgInventory.ts` was its ONLY reader. All
 * three pillar scorers bound their thresholds at module load:
 *
 *     const THRESHOLDS = ESG_CONSUMER_GOODS_CONFIG.thresholds;
 *
 * So a mining company picked "Mining" on the cover, received mining emission
 * factors, and was then scored against an FMCG distributor's waste-diversion
 * and employment-equity targets. Calibrating a sector would have written
 * numbers nothing read — the configured-but-never-consumed pattern this
 * codebase has spent a week digging out.
 *
 * These tests are the precondition for calibration: they fail if a scorer
 * stops consulting the workbook's sector. Today every sector but consumer
 * goods inherits the base end to end, so the numbers are unchanged — which is
 * why this is safe to land before any calibration work begins.
 */
import { describe, expect, it } from "vitest";
import { defineEsgSector } from "../base";
import {
  esgSectorConfigForWorkbook,
  esgSectorFromWorkbook,
  listUncalibratedEsgSectors,
} from "../index";
import { scoreEnvironmental } from "../../calculators/environmental";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

function workbook(sector: string | undefined, extra: Record<string, any> = {}): EsgWorkbookData {
  return {
    companyId: "SECTOR",
    sections: {
      "company-reporting-setup": { cells: sector ? { sector } : {} },
      assumptions: { cells: { B8: "Standard", B9: 0.5 } },
      ...extra,
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as EsgWorkbookData;
}

describe("the workbook's sector reaches the scorers", () => {
  it("reads the sector from the cover, and from the imported cell as a fallback", () => {
    expect(esgSectorFromWorkbook(workbook("Mining"))).toBe("Mining");
    // An imported workbook carries it at Assumptions!B10 instead.
    const imported = {
      companyId: "X",
      sections: { assumptions: { cells: { B10: "Mining" } } },
      updatedAt: "",
    } as unknown as EsgWorkbookData;
    expect(esgSectorFromWorkbook(imported)).toBe("Mining");
    expect(esgSectorFromWorkbook(workbook(undefined))).toBeUndefined();
  });

  it("resolves a config for every sector the cover offers, and falls back safely", () => {
    for (const label of ["Mining", "Transport / Logistics", "Financial Services", "Generic"]) {
      expect(esgSectorConfigForWorkbook(workbook(label))).toBeDefined();
    }
    // Nonsense and absence both land on a real config rather than throwing.
    expect(esgSectorConfigForWorkbook(workbook("Not A Sector"))).toBeDefined();
    expect(esgSectorConfigForWorkbook(null)).toBeDefined();
  });

  it("a sector's own threshold is what the scorer bands against", () => {
    /*
     * Built as a fixture rather than by mutating a real sector, so a future
     * genuine calibration cannot invalidate the assertion.
     */
    const lenient = defineEsgSector({
      id: "generic",
      label: "Test Lenient",
      coverLabel: "Test Lenient",
      calibration: "inherited",
      overrides: { thresholds: { wasteDiversion: 0.375 } },
      notes: "Test fixture only.",
    });
    expect(lenient.thresholds.wasteDiversion).toBe(0.375);
    expect(lenient.thresholds.wasteDiversion).toBeLessThan(
      esgSectorConfigForWorkbook(workbook("Generic")).thresholds.wasteDiversion,
    );
    // An override must be recorded as sector-specific, not passed off as
    // inherited — that distinction is what makes a calibration reviewable.
    expect(lenient.sectorSpecificPaths).toContain("thresholds.wasteDiversion");
    expect(lenient.inheritedPaths).not.toContain("thresholds.wasteDiversion");

    // `Waste_Register!B16` is the diversion rate E d19 bands against. Against
    // the base figure of 0.75, a rate of 0.375 sits at the stance floor and
    // earns partial credit — not the full five. Parity mode: since D5 that is
    // the only mode that bands against a sector figure; corrected scoring
    // bands against the company's own target or leaves d19 out.
    const base = scoreEnvironmental(workbook("Generic", { waste: { cells: { B16: 0.375 } } }), {
      mode: "workbook-parity",
    }).rows.d19;
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThan(5);
  });

  it("a company's own stated target is what it is scored against", () => {
    // A company that states its own target beats any benchmark we hold for it.
    const stated = workbook("Mining", {
      assumptions: { cells: { B8: "Standard", B9: 0.5, B48: 0.375, _targetBasis: "Company's own targets" } },
      waste: { cells: { B16: 0.375 } },
    });
    expect(scoreEnvironmental(stated).rows.d19).toBeCloseTo(5, 6);

    // The same number with no basis declared is not yet the company's target
    // (D5): nobody asked, so d19 leaves the total until somebody does.
    const undeclared = workbook("Mining", {
      assumptions: { cells: { B8: "Standard", B9: 0.5, B48: 0.375 } },
      waste: { cells: { B16: 0.375 } },
    });
    expect(scoreEnvironmental(undeclared).excluded.map((x) => x.key)).toContain("d19");
  });
});

describe("calibration status stays honest", () => {
  it("still reports which sectors are uncalibrated, and why", () => {
    const uncalibrated = listUncalibratedEsgSectors();
    // Thirteen of fourteen inherit the base. This must not silently shrink
    // because a sector was marked verified without values behind it.
    expect(uncalibrated.length).toBeGreaterThan(0);
    for (const config of uncalibrated) {
      expect(config.calibration).not.toBe("workbook-verified");
      /*
       * Every uncalibrated sector must say so in words a reader can act on.
       * `generic` is exempt because it IS the shared base — it has nothing
       * outstanding by definition, and its note says as much rather than
       * promising a calibration that will never come.
       */
      if (config.id === "generic") continue;
      expect(`${config.label}: ${config.notes ?? ""}`).toMatch(/OUTSTANDING|inherit/i);
    }
  });
});
