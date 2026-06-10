import { describe, it, expect } from "vitest";
import {
  getSection,
  getSectionGroupsForSector,
  getOrderedSectionKeysForSector,
  getCompanyInfoMetaFields,
  filterVisibleFinancialMetaFields,
  SECTIONS,
  SED_COLUMNS,
} from "../sections";

// MC + EE are now one combined spreadsheet for ALL sectors.
// The `employees` section is disabled in the UI (legacy data is still projected
// to scoring via the merge in projectWorkbookToClient).
describe("getSectionGroupsForSector — MC+EE is a single combined section for all sectors", () => {
  it("renders Management Control & EE as one flat section for non-TRANSPORT sectors", () => {
    for (const sector of ["RCOGP", "ICT", "FSC", "AGRI", "CONSTRUCTION", "", "unknown"]) {
      const groups = getSectionGroupsForSector(sector);
      // No more management-control-ee group key — replaced by a single flat entry.
      expect(groups.find((g) => g.key === "management-control-ee"), `sector=${sector} management-control-ee`).toBeUndefined();
      const mgmt = groups.find((g) => g.key === "management-control");
      expect(mgmt, `sector=${sector}`).toBeDefined();
      expect(mgmt!.isGroup, `sector=${sector} isGroup`).toBe(false);
      expect(mgmt!.sectionKeys, `sector=${sector} sectionKeys`).toEqual(["management-control"]);
      // The disabled `employees` section is NOT in the nav.
      expect(groups.find((g) => g.sectionKeys.includes("employees")), `sector=${sector} employees in nav`).toBeUndefined();
    }
  });

  it("renders Management Control & EE as one flat section for TRANSPORT too", () => {
    const groups = getSectionGroupsForSector("TRANSPORT");
    expect(groups.find((g) => g.key === "management-control-ee")).toBeUndefined();
    const mgmt = groups.find((g) => g.key === "management-control");
    expect(mgmt).toBeDefined();
    expect(mgmt!.isGroup).toBe(false);
    expect(mgmt!.sectionKeys).toEqual(["management-control"]);
    // employees is hidden in nav (disabled section).
    expect(groups.find((g) => g.sectionKeys.includes("employees"))).toBeUndefined();
  });

  it("is case-insensitive on the sector code", () => {
    const lower = getSectionGroupsForSector("transport");
    const mixed = getSectionGroupsForSector(" Transport ");
    expect(lower.find((g) => g.key === "management-control")).toBeDefined();
    expect(mixed.find((g) => g.key === "management-control")).toBeDefined();
  });

  it("management-control key is in nav for all sectors", () => {
    for (const sector of ["RCOGP", "TRANSPORT", "ICT", "", "unknown"]) {
      const keys = getOrderedSectionKeysForSector(sector);
      expect(keys, `sector=${sector}`).toContain("management-control");
    }
  });

  it("preserves the canonical section order (management-control between ownership and skills-development)", () => {
    const keys = getOrderedSectionKeysForSector("RCOGP");
    expect(keys).toEqual([
      "company-information",
      "financial-information",
      "ownership",
      "management-control",
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

  it("FSC management-control marks Senior/Middle/Junior as NOT AVAILABLE in guidance", () => {
    const mc = getSection("management-control", "FSC")!;
    expect(mc.description).toMatch(/NOT AVAILABLE/i);
    const designation = mc.columns!.find((c) => c.key === "designation")!;
    expect(designation.guidance).toMatch(/NOT AVAILABLE/i);
  });

  it("FSC company info hides combineExcoSenior toggle", () => {
    const meta = getCompanyInfoMetaFields("FSC");
    expect(meta.some((f) => f.key === "combineExcoSenior")).toBe(false);
    expect(meta.some((f) => f.key === "fscSubSector")).toBe(true);
  });

  it("FSC company info places fscSubSector after industrySector", () => {
    const meta = getCompanyInfoMetaFields("FSC");
    const sectorIdx = meta.findIndex((f) => f.key === "industrySector");
    const subIdx = meta.findIndex((f) => f.key === "fscSubSector");
    expect(subIdx).toBeGreaterThan(-1);
    expect(subIdx).toBe(sectorIdx + 1);
    expect(meta[subIdx].emphasis).toBe(true);
  });

  it("FSC Banks AFS fields live on afs-additions, not financial-information", () => {
    const fin = getSection("financial-information", "FSC", "Generic", "Banks")!;
    expect(fin.meta!.some((f) => f.key === "afsTransactionPointCoverage")).toBe(false);
    const afs = getSection("afs-additions", "FSC", "Generic", "Banks")!;
    expect(afs.enabled).toBe(true);
    expect(afs.meta!.some((f) => f.key === "afsTransactionPointCoverage")).toBe(true);
    const others = getSection("afs-additions", "FSC", "Generic", "Others")!;
    expect(others.enabled).toBe(false);
  });

  it("FSC reinsurer hides Additional CE bonus meta on SED section", () => {
    const withBonus = getSection("sed", "FSC", "Generic", "Others", false)!;
    const reinsurer = getSection("sed", "FSC", "Generic", "Others", true)!;
    expect(withBonus.meta!.some((f) => f.key === "ceBonusSpend")).toBe(true);
    expect(reinsurer.meta!.some((f) => f.key === "ceBonusSpend")).toBe(false);
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
  it("all sectors: MC+EE is one flat tab between Ownership and Skills Development", () => {
    for (const sector of ["RCOGP", "ICT", "FSC", "AGRI", "CONSTRUCTION", "TRANSPORT"]) {
      const groups = getSectionGroupsForSector(sector);
      const navShape = groups.map((g) => ({ label: g.label, isGroup: g.isGroup, keys: g.sectionKeys }));
      expect(navShape, `sector=${sector}`).toEqual([
        { label: "Company Information", isGroup: false, keys: ["company-information"] },
        { label: "Financial Information", isGroup: false, keys: ["financial-information"] },
        { label: "Ownership", isGroup: false, keys: ["ownership"] },
        { label: "Management Control & Employment Equity", isGroup: false, keys: ["management-control"] },
        { label: "Skills Development", isGroup: false, keys: ["skills-development"] },
        { label: "Procurement / Suppliers", isGroup: false, keys: ["procurement"] },
        { label: "Enterprise & Supplier Development", isGroup: false, keys: ["esd"] },
        { label: "Socio-Economic Development", isGroup: false, keys: ["sed"] },
      ]);
      // MC+EE flat section sits between Ownership and Skills Development.
      const idx = groups.findIndex((g) => g.key === "management-control");
      expect(groups[idx - 1].key, `sector=${sector} before`).toBe("ownership");
      expect(groups[idx + 1].key, `sector=${sector} after`).toBe("skills-development");
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

  it("navigation keys are identical across sectors so persisted workbooks stay compatible", () => {
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

describe("getSection — Skills Development QSE EAP meta", () => {
  it("hides eapProvince and eapYear for QSE scorecards", () => {
    const generic = getSection("skills-development", "RCOGP", "Generic");
    const qse = getSection("skills-development", "RCOGP", "QSE");
    expect(generic!.meta!.some((f) => f.key === "eapProvince")).toBe(true);
    expect(generic!.meta!.some((f) => f.key === "eapYear")).toBe(true);
    expect(qse!.meta!.some((f) => f.key === "eapProvince")).toBe(false);
    expect(qse!.meta!.some((f) => f.key === "eapYear")).toBe(false);
    expect(qse!.meta!.some((f) => f.key === "headcount")).toBe(true);
  });

  it("includes National in RCOGP Generic eapProvince options", () => {
    const generic = getSection("skills-development", "RCOGP", "Generic");
    const eapField = generic!.meta!.find((f) => f.key === "eapProvince");
    expect(eapField?.options).toContain("National");
  });

  it("hides EAP fields for ICT QSE", () => {
    const qse = getSection("skills-development", "ICT", "QSE");
    expect(qse!.meta!.some((f) => f.key === "eapProvince")).toBe(false);
    expect(qse!.meta!.some((f) => f.key === "eapYear")).toBe(false);
  });
});

describe("Financial Information — prior-year Leibrandt visibility", () => {
  it("hides prior-year fields when margin meets 25% of norm", () => {
    const section = getSection("financial-information", "RCOGP")!;
    const visible = filterVisibleFinancialMetaFields(section.meta!, {
      revenue: 10_000_000,
      npat: 500_000,
      industryNormPercent: 8,
    });
    const keys = visible.map((f) => f.key);
    expect(keys).not.toContain("priorYear1Revenue");
    expect(keys).toContain("industryNormPercent");
  });

  it("shows prior-year fields when margin is below 25% of norm", () => {
    const section = getSection("financial-information", "RCOGP")!;
    const visible = filterVisibleFinancialMetaFields(section.meta!, {
      revenue: 10_000_000,
      npat: 50_000,
      industryNormPercent: 8,
    });
    expect(visible.some((f) => f.key === "priorYear1Revenue")).toBe(true);
  });
});

describe("Financial Information — leviableAmount removed from meta", () => {
  it("FINANCIAL_META no longer exposes a separate leviableAmount field", () => {
    const section = getSection("financial-information")!;
    const keys = section.meta!.map((f) => f.key);
    expect(keys).not.toContain("leviableAmount");
    // Required source field used to derive leviable amount remains present.
    // Forecast financial fields are not collected — only actual figures.
    expect(keys).toContain("payroll");
    expect(keys).not.toContain("forecastPayroll");
  });
});

describe("FSC AFS Additions — separate pillar from Financial Information", () => {
  it("FSC Banks financial-information excludes AFS indicator fields", () => {
    const fin = getSection("financial-information", "FSC", "Generic", "Banks")!;
    const keys = fin.meta!.map((f) => f.key);
    expect(keys).not.toContain("afsTransactionPointCoverage");
    expect(keys).toContain("priorYearRevenue");
    expect(fin.label).toBe("Financial Information");
  });

  it("FSC Banks exposes AFS fields on the afs-additions section", () => {
    const afs = getSection("afs-additions", "FSC", "Generic", "Banks")!;
    expect(afs.enabled).toBe(true);
    expect(afs.label).toBe("AFS Additions");
    expect(afs.meta!.some((f) => f.key === "afsTransactionPointCoverage")).toBe(true);
  });

  it("FSC Others hides the afs-additions section", () => {
    const afs = getSection("afs-additions", "FSC", "Generic", "Others")!;
    expect(afs.enabled).toBe(false);
    expect(getOrderedSectionKeysForSector("FSC", "Others")).not.toContain("afs-additions");
  });

  it("FSC Banks nav inserts AFS Additions after Financial Information", () => {
    const keys = getOrderedSectionKeysForSector("FSC", "Banks");
    const finIdx = keys.indexOf("financial-information");
    expect(keys[finIdx + 1]).toBe("afs-additions");
  });
});
