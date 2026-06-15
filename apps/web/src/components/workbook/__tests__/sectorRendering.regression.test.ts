/**
 * Regression — sector-aware rendering.
 *
 * Pins:
 *  - MC and EE are now ONE combined flat section for ALL sectors (including
 *    TRANSPORT). The `employees` section is disabled and hidden from the nav;
 *    legacy data stored there is still projected to scoring.
 *  - SED's ICT-specific column is gated on sector === "ICT" and the underlying
 *    SED_COLUMNS array is never mutated.
 *  - Navigation keys are identical across sectors so persisted workbooks survive
 *    a sector switch.
 */
import { describe, expect, it } from "vitest";
import {
  getSection,
  getSectionGroupsForSector,
  getOrderedSectionKeysForSector,
  SECTIONS,
  SED_COLUMNS,
} from "../sections";

const ALL_SECTORS = [
  "RCOGP",
  "GENERIC",
  "ICT",
  "FSC",
  "MAC",
  "CONSTRUCTION",
  "AGRI",
  "PROPERTY",
  "TOURISM",
  "TRANSPORT",
];

describe("getSectionGroupsForSector — MC+EE is one combined flat section for all sectors", () => {
  it.each(ALL_SECTORS)("%s renders MC+EE as one flat section (not a parent group)", (sector) => {
    const groups = getSectionGroupsForSector(sector);
    // No more management-control-ee group key.
    expect(groups.find((g) => g.key === "management-control-ee"), `sector=${sector} group key`).toBeUndefined();
    const mgmt = groups.find((g) => g.key === "management-control");
    expect(mgmt, `sector=${sector} flat entry`).toBeDefined();
    expect(mgmt!.isGroup, `sector=${sector} isGroup`).toBe(false);
    expect(mgmt!.sectionKeys, `sector=${sector} sectionKeys`).toEqual(["management-control"]);
    // The disabled `employees` section is NOT in the nav for any sector.
    expect(groups.find((g) => g.sectionKeys.includes("employees")), `sector=${sector} employees in nav`).toBeUndefined();
  });
});

describe("getSectionGroupsForSector — order is consistent", () => {
  it("management-control sits between ownership and skills-development for all sectors", () => {
    for (const sector of ALL_SECTORS) {
      const groups = getSectionGroupsForSector(sector);
      const idx = groups.findIndex((g) => g.key === "management-control");
      expect(idx, `sector=${sector} index`).toBeGreaterThan(-1);
      expect(groups[idx - 1]?.key, `sector=${sector} before`).toBe("ownership");
      expect(groups[idx + 1]?.key, `sector=${sector} after`).toBe("skills-development");
    }
  });
});

describe("getSection('sed', sector) — ICT gating", () => {
  const ictBefore = [...SED_COLUMNS];

  it("includes ictSpecificInitiative for ICT", () => {
    const sec = getSection("sed", "ICT");
    expect(sec?.columns?.some((c) => c.key === "ictSpecificInitiative")).toBe(true);
  });

  it.each(["RCOGP", "FSC", "AGRI", "TRANSPORT", "CONSTRUCTION", "GENERIC"])(
    "excludes ictSpecificInitiative for %s",
    (sector) => {
      const sec = getSection("sed", sector);
      expect(sec?.columns?.some((c) => c.key === "ictSpecificInitiative")).toBe(false);
    },
  );

  it("never mutates the underlying SED_COLUMNS source array", () => {
    getSection("sed", "RCOGP");
    getSection("sed", "ICT");
    getSection("sed", "FSC");
    expect(SED_COLUMNS.length).toBe(ictBefore.length);
    expect(SED_COLUMNS.map((c) => c.key)).toEqual(ictBefore.map((c) => c.key));
  });
});

describe("Storage keys — stable across sector switches", () => {
  it("every sector exposes the same set of underlying section keys", () => {
    const reference = new Set(getOrderedSectionKeysForSector("RCOGP"));
    for (const sector of ALL_SECTORS) {
      const keys = new Set(getOrderedSectionKeysForSector(sector));
      expect(keys, `sector=${sector}`).toEqual(reference);
    }
  });

  it("storage keys are a subset of canonical SECTIONS keys", () => {
    const canonical = new Set(SECTIONS.map((s) => s.key));
    for (const sector of ALL_SECTORS) {
      for (const k of getOrderedSectionKeysForSector(sector)) {
        expect(canonical.has(k), `${sector}::${k}`).toBe(true);
      }
    }
  });
});
