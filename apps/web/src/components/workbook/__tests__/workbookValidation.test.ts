import { describe, it, expect } from "vitest";
import {
  validateWorkbook,
  validateScorecardTypeForSector,
} from "../workbookValidation";
import {
  getScorecardTypeOptions,
  resolveScorecardTypeForSector,
} from "../sections";

const validFinancialMeta = {
  revenue: 1_000_000,
  npat: 100_000,
  payroll: 500_000,
  forecastRevenue: 1_100_000,
  forecastNpat: 110_000,
  forecastPayroll: 550_000,
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

  it("requires forecast payroll when skills rows are present", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": {
        meta: {
          ...validFinancialMeta,
          forecastPayroll: "",
          payroll: "",
          leviableAmount: "",
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
    expect(issues.some((i) => i.field === "forecastPayroll")).toBe(true);
  });

  it("requires forecast NPAT when ESD rows are present", () => {
    const issues = validateWorkbook({
      "company-information": { meta: validCompanyMeta },
      "financial-information": {
        meta: {
          ...validFinancialMeta,
          forecastNpat: "",
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
    expect(issues.some((i) => i.field === "forecastNpat")).toBe(true);
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
