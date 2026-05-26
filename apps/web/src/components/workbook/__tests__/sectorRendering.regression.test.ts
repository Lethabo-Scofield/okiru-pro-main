/**
 * Regression — sector-aware rendering (Task #3).
 *
 * Pins:
 *  - TRANSPORT splits MC and EE; every other sector merges them under
 *    "management-control-ee".
 *  - SED's ICT-specific column is gated on sector === "ICT" and the underlying
 *    SED_COLUMNS array is never mutated.
 *  - Storage keys are identical across sectors so persisted workbooks survive
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

const NON_TRANSPORT_SECTORS = [
  "RCOGP",
  "GENERIC",
  "ICT",
  "FSC",
  "MAC",
  "CONSTRUCTION",
  "AGRI",
  "PROPERTY",
  "TOURISM",
];

describe("getSectionGroupsForSector — non-Transport sectors merge MC + EE", () => {
  it.each(NON_TRANSPORT_SECTORS)("%s renders MC+EE as one parent with two children", (sector) => {
    const groups = getSectionGroupsForSector(sector);
    const merged = groups.find((g) => g.key === "management-control-ee");
    expect(merged, `sector=${sector}`).toBeDefined();
    expect(merged!.isGroup).toBe(true);
    expect(merged!.sectionKeys).toEqual(["management-control", "employees"]);
    expect(groups.find((g) => g.key === "management-control" && !g.isGroup)).toBeUndefined();
    expect(groups.find((g) => g.key === "employees" && !g.isGroup)).toBeUndefined();
  });
});

describe("getSectionGroupsForSector — TRANSPORT splits MC and EE", () => {
  it("returns Management Control and Employees as separate top-level groups", () => {
    const groups = getSectionGroupsForSector("TRANSPORT");
    expect(groups.find((g) => g.key === "management-control-ee")).toBeUndefined();
    const mgmt = groups.find((g) => g.key === "management-control");
    const ee = groups.find((g) => g.key === "employees");
    expect(mgmt?.isGroup).toBe(false);
    expect(ee?.isGroup).toBe(false);
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
    for (const sector of [...NON_TRANSPORT_SECTORS, "TRANSPORT"]) {
      const keys = new Set(getOrderedSectionKeysForSector(sector));
      expect(keys, `sector=${sector}`).toEqual(reference);
    }
  });

  it("storage keys are a subset of canonical SECTIONS keys", () => {
    const canonical = new Set(SECTIONS.map((s) => s.key));
    for (const sector of [...NON_TRANSPORT_SECTORS, "TRANSPORT"]) {
      for (const k of getOrderedSectionKeysForSector(sector)) {
        expect(canonical.has(k), `${sector}::${k}`).toBe(true);
      }
    }
  });
});
