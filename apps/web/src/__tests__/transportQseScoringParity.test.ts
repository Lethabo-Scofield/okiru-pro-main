/**
 * The B-BBEE scoring logic exists twice — the Toolkit calculators clients see
 * and apps/api/pipeline/rules (the copy /api/calculate runs). On the same
 * inputs they must give the same Transport QSE points. Each case here was a
 * drift: Senior pooled into top management (api only), ownership fulfilment
 * scored as new entrants, the ESOP bonus scored from black women, procurement
 * on raw spend with excluded lines counted, and a fixed quartet of elements
 * instead of the best four. (Invented company.)
 */
import { describe, expect, it } from "vitest";
import { TRANSPORT_QSE_CALCULATOR_CONFIG as CFG } from "@toolkit/lib/sectors/transport-qse";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateTransportQseManagement } from "@toolkit/lib/calculators/transport";
import { calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import { TRANSPORT_QSE } from "../../../api/pipeline/sectorConfig";
import { calculateAllPillars, electTransportQseBestFour } from "../../../api/pipeline/rules/pillarCalculators";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const any = (v: unknown) => v as any;

const shareholders = [
  { id: "a", name: "Sipho Ndlovu", ownershipType: "shareholder", blackOwnership: 1, blackWomenOwnership: 0, shares: 90, shareValue: 0, isDesignatedGroup: false, votingRightsPercent: 0.9, economicInterestPercent: 0.9, outstandingDebt: 0 },
  { id: "b", name: "Staff Share Trust", ownershipType: "ESOP / Employee Share Scheme", blackOwnership: 0.8, blackWomenOwnership: 0.4, shares: 10, shareValue: 0, isDesignatedGroup: false, votingRightsPercent: 0.1, economicInterestPercent: 0.1, outstandingDebt: 0 },
];
const employees = [
  { id: "1", name: "Sipho Ndlovu", race: "African", gender: "Male", designation: "Executive Director", isDisabled: false },
  { id: "2", name: "Lerato Khumalo", race: "African", gender: "Female", designation: "Senior", isDisabled: false },
  { id: "3", name: "Pieter Smit", race: "White", gender: "Male", designation: "Middle", isDisabled: false },
];
const suppliers = [
  { id: "s1", name: "Quarry Tools", spend: 400_000, beeLevel: 1, blackOwnership: 0.6, blackWomenOwnership: 0.1, enterpriseType: "generic" },
  { id: "s2", name: "Kestrel Insure", spend: 300_000, beeLevel: 5, blackOwnership: 0.2, blackWomenOwnership: 0, enterpriseType: "generic", isEmpoweringSupplier: false },
  { id: "s3", name: "Vehicle Finance Loan", spend: 900_000, beeLevel: 1, blackOwnership: 0.3, blackWomenOwnership: 0, enterpriseType: "generic" },
];
const tmps = 3_000_000;
const sed = [{ beneficiary: "Hilltop Creche", type: "grant", amount: 20_000, category: "sed" }];
const npat = 1_000_000;

const apiInputs = {
  employees: employees.map((e) => ({ ...e, isForeign: false })),
  shareholders: shareholders.map((s) => ({ ...s, yearsHeld: 0 })),
  suppliers,
  contributions: sed,
  trainingPrograms: [],
  financials: { revenue: 20_000_000, npat, leviableAmount: 0, tmps, headcount: 3, companyValue: 0, outstandingDebt: 0, yearsHeld: 0 },
  province: "Gauteng",
};

describe("Transport QSE — web Toolkit and api pipeline agree", () => {
  // Element by element, with these four measured.
  const api = calculateAllPillars(TRANSPORT_QSE, any({
    ...apiInputs,
    transportQseMeasuredElements: ["ownership", "managementControl", "preferentialProcurement", "socioEconomicDevelopment"],
  }));

  it("ownership: fulfilment from a stated nil debt, ESOP bonus from scheme economic interest", () => {
    const web = calculateOwnershipScore(any({ shareholders, companyValue: 0, outstandingDebt: 0, yearsHeld: 0 }), CFG);
    expect(web.ownershipFulfilment).toBe(1);
    expect(api.ownership.score).toBeCloseTo(web.total, 2);
  });

  it("management control: a black woman at Senior is not top management when an executive exists", () => {
    const web = calculateTransportQseManagement(any({ employees }), CFG);
    expect(web.score).toBe(25);
    expect(api.managementControl.score).toBeCloseTo(web.score, 2);
  });

  it("procurement: recognised spend, excluded lines out, a stated non-empowering supplier out", () => {
    const web = calculateProcurementScore(any({ id: "", clientId: "", tmps, suppliers }), CFG);
    // 400k x 1.35 recognised = 540k against 40% of 3m = 1.2m -> 11.25
    expect(web.total).toBeCloseTo(11.25, 2);
    expect(api.procurement.score).toBeCloseTo(web.total, 2);
  });

  it("socio-economic development agrees", () => {
    const web = calculateSedScore(any({ id: "", clientId: "", contributions: sed }), npat, CFG);
    expect(api.socioEconomicDevelopment.score).toBeCloseTo(web.total, 2);
  });

  it("with no elected four, the api measures the best four — not a fixed quartet", () => {
    // No training programmes: Skills scores 0, and the old fixed quartet
    // (Ownership, MC, EE, Skills) measured the entity on it anyway.
    const elected = calculateAllPillars(TRANSPORT_QSE, any(apiInputs));
    const four = electTransportQseBestFour(TRANSPORT_QSE, any(apiInputs));
    expect(four).toHaveLength(4);
    expect(four).not.toContain("skillsDevelopment");
    expect(elected.skillsDevelopment.maxPoints).toBe(0);
    const oldQuartet = calculateAllPillars(TRANSPORT_QSE, any({
      ...apiInputs,
      transportQseMeasuredElements: ["ownership", "managementControl", "employmentEquity", "skillsDevelopment"],
    }));
    expect(elected.totalPoints).toBeGreaterThan(oldQuartet.totalPoints);
    const scoreOf: Record<string, number> = {
      ownership: elected.ownership.score,
      managementControl: elected.managementControl.score,
      employmentEquity: elected.employmentEquity.score,
      preferentialProcurement: elected.procurement.score,
      socioEconomicDevelopment: elected.socioEconomicDevelopment.score,
      enterpriseDevelopment: elected.enterpriseDevelopment.score,
    };
    expect(elected.totalPoints).toBeCloseTo(four.reduce((s, e) => s + (scoreOf[e] ?? 0), 0), 2);
  });
});
