import { describe, it, expect } from "vitest";
import {
  validateWorkbook,
  validateWorkbookForSubmit,
  isCriticalWorkbookIssue,
  validateScorecardTypeForSector,
  aggregateWorkbookValidation,
  formatValidationIssueLine,
} from "../workbookValidation";
import {
  getScorecardTypeOptions,
  resolveScorecardTypeForSector,
} from "../sections";

const validFinancialMeta = {
  revenue: 1_000_000,
  npat: 100_000,
  payroll: 500_000,
  industryNormPercent: 6,
};

const validCompanyMeta = {
  companyName: "Test Co",
  industrySector: "RCOGP",
  scorecardType: "Generic",
};

describe("validateWorkbook", () => {
  it("requires TMPS when procurement rows have spend", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": { meta: validFinancialMeta },
      procurement: {
        rows: [
          {
            _id: "r1",
            supplierName: "Acme",
            currentSize: "QSE",
            spend: 50_000,
          },
        ],
      },
    });
    expect(issues.some((i) => i.field === "tmps")).toBe(true);
  });

  it("rejects invalid sector codes in company meta", () => {
    const issues = validateWorkbook({
      "company-information": {
        meta: { companyName: "Test Co", industrySector: "INVALID", scorecardType: "Generic" },
      },
      "financial-information": { meta: validFinancialMeta },
    });
    expect(issues.some((i) => i.field === "industrySector")).toBe(true);
  });

  it("requires scorecardType when sector is set", () => {
    const issues = validateWorkbook({
      "company-information": {
        meta: { companyName: "Test Co", industrySector: "RCOGP" },
      },
      "financial-information": { meta: validFinancialMeta },
    });
    expect(issues.some((i) => i.field === "scorecardType")).toBe(true);
  });

  it("rejects scorecardType incompatible with sector", () => {
    const issues = validateWorkbook({
      "company-information": {
        meta: { companyName: "Test Co", industrySector: "FSC", scorecardType: "QSE" },
      },
      "financial-information": { meta: validFinancialMeta },
    });
    expect(issues.some((i) => i.field === "scorecardType")).toBe(true);
  });

  it("accepts valid RCOGP Generic company meta", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": { meta: validFinancialMeta },
    });
    expect(issues).toHaveLength(0);
  });

  it("accepts actual-only financial meta", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": {
        meta: {
          revenue: 1_000_000,
          npat: 100_000,
          payroll: 500_000,
          industryNormPercent: 6,
        },
      },
    });
    expect(issues).toHaveLength(0);
  });

  it("does not require industryNormPercent on financial meta", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": {
        meta: {
          revenue: 1_000_000,
          npat: 100_000,
          payroll: 500_000,
        },
      },
    });
    expect(issues.some((i) => i.field === "industryNormPercent")).toBe(false);
  });

  it("requires payroll when skills rows are present (leviable amount derived as 1% of payroll)", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": {
        meta: {
          ...validFinancialMeta,
          payroll: "",
        },
      },
      "skills-development": {
        rows: [
          {
            _id: "s1",
            programName: "Learnership",
            categoryCode: "B",
            learnerName: "Jane Doe",
            race: "African",
            gender: "Female",
            courseCost: 5000,
          },
        ],
      },
    });
    expect(issues.some((i) => i.field === "payroll")).toBe(true);
  });

  it("accepts actual payroll when skills rows are present", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": {
        meta: {
          revenue: 1_000_000,
          npat: 100_000,
          payroll: 500_000,
        },
      },
      "skills-development": {
        rows: [
          {
            _id: "s1",
            programName: "Learnership",
            categoryCode: "B",
            learnerName: "Jane Doe",
            race: "African",
            gender: "Female",
            courseCost: 5000,
          },
        ],
      },
    });
    expect(issues.some((i) => i.field === "payroll")).toBe(false);
  });

  it("requires NPAT when ESD rows are present", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": {
        meta: {
          ...validFinancialMeta,
          npat: "",
        },
      },
      esd: {
        rows: [
          {
            _id: "e1",
            supplierName: "Beneficiary",
            currentBlackOwnership: 100,
            currentSize: "EME",
            contributionDescription: "Grant",
            contributionType: "Grant Contribution",
            amount: 10_000,
          },
        ],
      },
    });
    expect(issues.some((i) => i.field === "npat")).toBe(true);
  });

  it("accepts actual NPAT when ESD rows are present", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": {
        meta: {
          revenue: 1_000_000,
          npat: 100_000,
          payroll: 500_000,
        },
      },
      esd: {
        rows: [
          {
            _id: "e1",
            supplierName: "Beneficiary",
            currentBlackOwnership: 100,
            currentSize: "EME",
            contributionDescription: "Grant",
            contributionType: "Grant Contribution",
            amount: 10_000,
          },
        ],
      },
    });
    expect(issues.some((i) => i.field === "npat")).toBe(false);
  });

  it("rejects ownership voting rights sum over 100%", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": { meta: validFinancialMeta },
      ownership: {
        rows: [
          { _id: "o1", shareholderName: "A", votingRights: 60 },
          { _id: "o2", shareholderName: "B", votingRights: 50 },
        ],
      },
    });
    expect(issues.some((i) => i.field === "votingRights")).toBe(true);
  });

  it("validateWorkbookForSubmit allows empty pillar sections", () => {
    const issues = validateWorkbookForSubmit({
      "company-information": { meta: validCompanyMeta },
      "financial-information": { meta: { revenue: 1_000_000, npat: 100_000, payroll: 500_000 } },
    });
    expect(issues).toHaveLength(0);
  });

  it("validateWorkbookForSubmit ignores incomplete pillar rows when company+financials ok", () => {
    const full = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": { meta: { revenue: 1_000_000, npat: 100_000, payroll: 500_000 } },
      ownership: {
        rows: [{ _id: "o1", shareholderName: "Partial row only" }],
      },
      esd: {
        rows: [{ _id: "e1", supplierName: "Incomplete" }],
      },
    });
    const critical = validateWorkbookForSubmit({
      "company-information": { meta: validCompanyMeta },
      "financial-information": { meta: { revenue: 1_000_000, npat: 100_000, payroll: 500_000 } },
      ownership: {
        rows: [{ _id: "o1", shareholderName: "Partial row only" }],
      },
      esd: {
        rows: [{ _id: "e1", supplierName: "Incomplete" }],
      },
    });
    expect(full.length).toBeGreaterThan(critical.length);
    expect(critical).toHaveLength(0);
  });

  it("isCriticalWorkbookIssue flags company identity only — pillar/financial gaps are advisory", () => {
    expect(
      isCriticalWorkbookIssue({
        sectionKey: "ownership",
        sectionLabel: "Ownership",
        field: "shareholderName",
        message: "Required",
      }),
    ).toBe(false);
    expect(
      isCriticalWorkbookIssue({
        sectionKey: "financial-information",
        sectionLabel: "Financial Information",
        field: "npat",
        message: "NPAT is required when ESD or SED rows are present",
      }),
    ).toBe(false);
    expect(
      isCriticalWorkbookIssue({
        sectionKey: "company-information",
        sectionLabel: "Company Information",
        field: "companyName",
        message: "Company Name: Required",
      }),
    ).toBe(true);
  });
});

describe("validateScorecardTypeForSector", () => {
  it("returns allowed options per sector", () => {
    expect(getScorecardTypeOptions("RCOGP")).toEqual(["Generic", "QSE"]);
    expect(getScorecardTypeOptions("CONSTRUCTION")).toEqual(["QSE", "Contractor", "BEP"]);
    expect(getScorecardTypeOptions("FSC")).toEqual(["Generic"]);
  });

  it("accepts construction BEP", () => {
    expect(validateScorecardTypeForSector("CONSTRUCTION", "BEP")).toBeNull();
  });

  it("rejects QSE for AGRI", () => {
    expect(validateScorecardTypeForSector("AGRI", "QSE")).toMatch(/Use one of/);
  });
});

describe("validateWorkbook — sector-aware meta", () => {
  it("requires FSC sub-sector when sector is FSC", () => {
    const issues = validateWorkbook({
      "company-information": {
        meta: { companyName: "Bank Co", industrySector: "FSC", scorecardType: "Generic" },
      },
      "financial-information": { meta: validFinancialMeta },
    });
    expect(issues.some((i) => i.field === "fscSubSector")).toBe(true);
  });

  it("FSC CE spend meta is advisory when sed section is present", () => {
    const issues = validateWorkbookForSubmit({
      "company-information": {
        meta: {
          companyName: "FSC Co",
          industrySector: "FSC",
          scorecardType: "Generic",
          fscSubSector: "Others",
        },
      },
      "financial-information": { meta: validFinancialMeta },
      sed: { meta: {}, rows: [] },
    });
    expect(issues.some((i) => i.field === "ceSpend")).toBe(false);
    const all = validateWorkbook({
      "company-information": {
        meta: {
          companyName: "FSC Co",
          industrySector: "FSC",
          scorecardType: "Generic",
          fscSubSector: "Others",
        },
      },
      "financial-information": { meta: validFinancialMeta },
      sed: { meta: {}, rows: [] },
    });
    expect(all.some((i) => i.field === "ceSpend")).toBe(true);
  });

  it("aggregateWorkbookValidation groups issues with row numbers", () => {
    const aggregate = aggregateWorkbookValidation({
      "company-information": { meta: validCompanyMeta },
      "financial-information": { meta: validFinancialMeta },
      "management-control": {
        rows: [
          { _id: "r1", name: "Jane", surname: "Doe", race: "", gender: "Female", designation: "" },
          { _id: "r2", name: "John", surname: "Smith", race: "African", gender: "", designation: "Senior Manager" },
        ],
      },
    });
    expect(aggregate.totalIssues).toBeGreaterThan(0);
    const mc = aggregate.sections.find((s) => s.sectionKey === "management-control");
    expect(mc).toBeDefined();
    expect(mc!.issues.some((i) => i.rowNumber === 1 || i.rowNumber === 2)).toBe(true);
    const line = mc!.issues.find((i) => i.rowNumber === 1);
    if (line) {
      expect(formatValidationIssueLine(line)).toContain("Row 1");
    }
  });
});

describe("resolveScorecardTypeForSector", () => {
  it("keeps valid scorecard type when sector changes within same option set", () => {
    expect(resolveScorecardTypeForSector("RCOGP", "QSE")).toBe("QSE");
    expect(resolveScorecardTypeForSector("ICT", "Generic")).toBe("Generic");
  });

  it("auto-selects Generic when sector allows only Generic", () => {
    expect(resolveScorecardTypeForSector("FSC", "QSE")).toBe("Generic");
    expect(resolveScorecardTypeForSector("AGRI", "")).toBe("Generic");
  });

  it("clears invalid scorecard type when multiple options remain", () => {
    expect(resolveScorecardTypeForSector("RCOGP", "Contractor")).toBe("");
    expect(resolveScorecardTypeForSector("CONSTRUCTION", "Generic")).toBe("");
  });
});
