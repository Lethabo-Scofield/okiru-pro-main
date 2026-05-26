import { describe, it, expect } from "vitest";
import {
  getSection,
  getSectionGroupsForSector,
  getOrderedSectionKeysForSector,
  SECTIONS,
  SED_COLUMNS,
} from "../sections";

describe("getSectionGroupsForSector — Management Control & Employment Equity grouping", () => {
  it("groups Management Control and Employees under a single parent for non-TRANSPORT sectors", () => {
    for (const sector of ["RCOGP", "ICT", "FSC", "AGRI", "CONSTRUCTION", "", "unknown"]) {
      const groups = getSectionGroupsForSector(sector);
      const mgmtGroup = groups.find((g) => g.key === "management-control-ee");
      expect(mgmtGroup, `sector=${sector}`).toBeDefined();
      expect(mgmtGroup!.isGroup).toBe(true);
      expect(mgmtGroup!.label).toBe("Management Control & Employment Equity");
      expect(mgmtGroup!.sectionKeys).toEqual(["management-control", "employees"]);
      expect(groups.find((g) => g.key === "management-control" && !g.isGroup)).toBeUndefined();
      expect(groups.find((g) => g.key === "employees" && !g.isGroup)).toBeUndefined();
    }
  });

  it("renders Management Control and Employees as separate top-level sections for TRANSPORT", () => {
    const groups = getSectionGroupsForSector("TRANSPORT");
    expect(groups.find((g) => g.key === "management-control-ee")).toBeUndefined();
    const mgmt = groups.find((g) => g.key === "management-control");
    const employees = groups.find((g) => g.key === "employees");
    expect(mgmt).toBeDefined();
    expect(mgmt!.isGroup).toBe(false);
    expect(mgmt!.sectionKeys).toEqual(["management-control"]);
    expect(employees).toBeDefined();
    expect(employees!.isGroup).toBe(false);
    expect(employees!.sectionKeys).toEqual(["employees"]);
  });

  it("is case-insensitive on the sector code", () => {
    const lower = getSectionGroupsForSector("transport");
    const mixed = getSectionGroupsForSector(" Transport ");
    expect(lower.find((g) => g.key === "management-control")).toBeDefined();
    expect(mixed.find((g) => g.key === "management-control")).toBeDefined();
  });

  it("preserves storage keys for both branches (no breaking changes to persisted workbooks)", () => {
    const tKeys = getOrderedSectionKeysForSector("TRANSPORT");
    const oKeys = getOrderedSectionKeysForSector("RCOGP");
    expect(tKeys).toContain("management-control");
    expect(tKeys).toContain("employees");
    expect(oKeys).toContain("management-control");
    expect(oKeys).toContain("employees");
    // Same set of underlying section keys regardless of sector.
    expect([...tKeys].sort()).toEqual([...oKeys].sort());
  });

  it("preserves the canonical section order around the grouping", () => {
    const keys = getOrderedSectionKeysForSector("RCOGP");
    expect(keys).toEqual([
      "company-information",
      "financial-information",
      "ownership",
      "management-control",
      "employees",
      "skills-development",
      "procurement",
      "esd",
      "sed",
    ]);
  });
});

describe("getSection — SED ICT-Specific column visibility", () => {
  it("includes the ICT-Specific column when sector is ICT", () => {
    const section = getSection("sed", "ICT");
    expect(section).toBeDefined();
    expect(section!.columns!.some((c) => c.key === "ictSpecificInitiative")).toBe(true);
  });

  it("hides the ICT-Specific column for every non-ICT sector", () => {
    for (const sector of ["RCOGP", "FSC", "AGRI", "TRANSPORT", "CONSTRUCTION", "", "unknown"]) {
      const section = getSection("sed", sector);
      expect(section, `sector=${sector}`).toBeDefined();
      expect(
        section!.columns!.some((c) => c.key === "ictSpecificInitiative"),
        `sector=${sector}`,
      ).toBe(false);
    }
  });

  it("does not mutate the underlying SED_COLUMNS export", () => {
    const beforeKeys = SED_COLUMNS.map((c) => c.key);
    getSection("sed", "RCOGP");
    getSection("sed", "ICT");
    const afterKeys = SED_COLUMNS.map((c) => c.key);
    expect(afterKeys).toEqual(beforeKeys);
    expect(beforeKeys).toContain("ictSpecificInitiative");
  });

  it("is case-insensitive on the sector code", () => {
    expect(getSection("sed", "ict")!.columns!.some((c) => c.key === "ictSpecificInitiative")).toBe(true);
    expect(getSection("sed", " Ict ")!.columns!.some((c) => c.key === "ictSpecificInitiative")).toBe(true);
  });

  it("returns the section unchanged when no sector is supplied (back-compat)", () => {
    const section = getSection("sed");
    expect(section).toBeDefined();
    expect(section!.columns!.some((c) => c.key === "ictSpecificInitiative")).toBe(true);
  });

  it("leaves non-SED sections untouched regardless of sector", () => {
    const mc1 = getSection("management-control", "ICT");
    const mc2 = getSection("management-control", "TRANSPORT");
    expect(mc1!.columns!.map((c) => c.key)).toEqual(mc2!.columns!.map((c) => c.key));
  });
});

/**
 * Page-contract tests: these mirror the exact composition InformationRequest's
 * WorkbookView performs (sectorCode → sectionGroups → renderSectionNav order,
 * sectorCode → getSection(key, sectorCode) → columns passed to SpreadsheetGrid).
 * We avoid spinning up jsdom + RTL by asserting the structured inputs the page
 * derives — if these are correct, the rendered nav and grid columns are correct.
 */
describe("InformationRequest WorkbookView — page composition contract", () => {
  it("TRANSPORT page nav: separate Management Control and Employees top-level tabs", () => {
    const groups = getSectionGroupsForSector("TRANSPORT");
    const navShape = groups.map((g) => ({ label: g.label, isGroup: g.isGroup, keys: g.sectionKeys }));
    expect(navShape).toEqual([
      { label: "Company Information", isGroup: false, keys: ["company-information"] },
      { label: "Financial Information", isGroup: false, keys: ["financial-information"] },
      { label: "Ownership", isGroup: false, keys: ["ownership"] },
      { label: "Management Control", isGroup: false, keys: ["management-control"] },
      { label: "Employees", isGroup: false, keys: ["employees"] },
      { label: "Skills Development", isGroup: false, keys: ["skills-development"] },
      { label: "Procurement / Suppliers", isGroup: false, keys: ["procurement"] },
      { label: "Enterprise & Supplier Development", isGroup: false, keys: ["esd"] },
      { label: "Socio-Economic Development", isGroup: false, keys: ["sed"] },
    ]);
  });

  it("non-TRANSPORT page nav: MC+EE collapsed under one parent (used by both sidebar header and mobile chip)", () => {
    for (const sector of ["RCOGP", "ICT", "FSC", "AGRI", "CONSTRUCTION"]) {
      const groups = getSectionGroupsForSector(sector);
      const mgmt = groups.find((g) => g.key === "management-control-ee");
      expect(mgmt, `sector=${sector}`).toBeDefined();
      expect(mgmt!.isGroup).toBe(true);
      expect(mgmt!.sectionKeys).toEqual(["management-control", "employees"]);
      // Order: parent group sits between Ownership and Skills Development.
      const idx = groups.findIndex((g) => g.key === "management-control-ee");
      expect(groups[idx - 1].key).toBe("ownership");
      expect(groups[idx + 1].key).toBe("skills-development");
    }
  });

  it("SED grid columns passed to SpreadsheetGrid: ICT column present only for ICT", () => {
    // Mirrors the page line:
    //   columns={getSection(activeSection.key, sectorCode)?.columns}
    const ictCols = getSection("sed", "ICT")!.columns!.map((c) => c.key);
    const rcogpCols = getSection("sed", "RCOGP")!.columns!.map((c) => c.key);
    const transportCols = getSection("sed", "TRANSPORT")!.columns!.map((c) => c.key);
    expect(ictCols).toContain("ictSpecificInitiative");
    expect(rcogpCols).not.toContain("ictSpecificInitiative");
    expect(transportCols).not.toContain("ictSpecificInitiative");
    // All other SED columns are identical across sectors.
    expect(rcogpCols).toEqual(ictCols.filter((k) => k !== "ictSpecificInitiative"));
    expect(transportCols).toEqual(rcogpCols);
  });

  it("storage keys are identical across sectors so persisted workbooks stay compatible", () => {
    const keysFor = (s: string) => getOrderedSectionKeysForSector(s).sort();
    const baseline = keysFor("RCOGP");
    for (const sector of ["ICT", "FSC", "AGRI", "TRANSPORT", "CONSTRUCTION", ""]) {
      expect(keysFor(sector), `sector=${sector}`).toEqual(baseline);
    }
  });
});

/**
 * Categorical-input audit: every column in sections.ts whose key suggests a
 * categorical / enumerated value must declare `type: "select"` (or be a
 * boolean / number, etc.). This guards against regression to free-text inputs
 * for fields like race, gender, B-BBEE level, enterprise size, contribution
 * type, province, etc.
 */
describe("Categorical column audit — sections.ts uses Selects for enumerated fields", () => {
  const CATEGORICAL_KEY_PATTERNS = [
    /^race$/,
    /^gender$/,
    /^designation$/,
    /^categoryCode$/,
    /^bbbeeLevel$/,
    /^enterpriseType$/,
    /^contributionType$/,
    /^esdCategory$/,
    /^province$/,
    /^currentSize$/,
    /^sizeAtFirstProcurement$/,
    /^measuredUnder$/,
  ];

  it("every categorical column across all sections is a Select with options", () => {
    const offenders: string[] = [];
    for (const section of SECTIONS) {
      if (!section.columns) continue;
      for (const col of section.columns) {
        if (CATEGORICAL_KEY_PATTERNS.some((p) => p.test(col.key))) {
          if (col.type !== "select" || !col.options || col.options.length === 0) {
            offenders.push(`${section.key}.${col.key} (type=${col.type})`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Financial Information — leviableAmount removed from meta", () => {
  it("FINANCIAL_META no longer exposes a separate leviableAmount field", () => {
    const section = getSection("financial-information")!;
    const keys = section.meta!.map((f) => f.key);
    expect(keys).not.toContain("leviableAmount");
    // Required source fields used to derive leviable amount remain present.
    expect(keys).toContain("payroll");
    expect(keys).toContain("forecastPayroll");
  });
});
