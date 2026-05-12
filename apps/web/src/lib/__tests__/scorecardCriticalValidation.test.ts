import { describe, it, expect } from "vitest";
import { validateScorecardCriticalInputs } from "../scorecardCriticalValidation";
import type { FoundationData } from "@/components/build/FoundationStep";
import type { BuildPillarsData } from "@/components/build/BuildPillarsStep";
import { EMPTY_CLIENT_INFO } from "@/components/build/ClientInformationForm";
import { EMPTY_FINANCIALS } from "@/components/build/FinancialsForm";

const emptyOwnershipPillars = (): BuildPillarsData["ownership"] => ({
  id: "",
  clientId: "",
  shareholders: [],
  companyValue: 0,
  outstandingDebt: 0,
  yearsHeld: 0,
});

function baseFoundation(overrides?: Partial<FoundationData["financials"]>): FoundationData {
  return {
    clientInfo: { ...EMPTY_CLIENT_INFO },
    financials: {
      ...EMPTY_FINANCIALS,
      totalRevenue: 1_000_000,
      npat: 100_000,
      ...overrides,
    },
  };
}

function basePillars(ownership?: Partial<BuildPillarsData["ownership"]>): BuildPillarsData {
  return {
    ownership: { ...emptyOwnershipPillars(), ...ownership },
    management: { id: "", clientId: "", employees: [] },
    employmentEquity: { id: "", clientId: "", employees: [] },
    skills: { id: "", clientId: "", leviableAmount: 0, trainingPrograms: [] },
    procurement: { id: "", clientId: "", tmps: 0, suppliers: [] },
    esd: { id: "", clientId: "", contributions: [], graduationBonus: false, jobsCreatedBonus: false },
    sed: { id: "", clientId: "", contributions: [] },
    yes: {
      id: "",
      clientId: "",
      totalEmployees: 0,
      candidates: [],
      yesYouthEnrolled: 0,
      yesBlackYouthCount: 0,
      yesBlackYouthPercentage: 0,
      yesAbsorbedCount: 0,
      yesAbsorptionRate: 0,
      totalYesCost: 0,
    },
  };
}

describe("validateScorecardCriticalInputs", () => {
  it("requires revenue and NPAT always", () => {
    const f = baseFoundation({ totalRevenue: 0, npat: 0, deemedNpat: 0 });
    const errs = validateScorecardCriticalInputs(f, basePillars());
    expect(errs.some((e) => e.includes("Revenue"))).toBe(true);
    expect(errs.some((e) => e.includes("NPAT"))).toBe(true);
  });

  it("accepts deemed NPAT instead of NPAT", () => {
    const f = baseFoundation({ npat: 0, deemedNpat: 50_000 });
    const errs = validateScorecardCriticalInputs(f, basePillars());
    expect(errs.some((e) => e.includes("NPAT"))).toBe(false);
  });

  it("requires ownership when scope is empty / full card", () => {
    const f = baseFoundation();
    const errs = validateScorecardCriticalInputs(f, basePillars({ shareholders: [] }));
    expect(errs.some((e) => e.includes("Ownership"))).toBe(true);
  });

  it("requires ownership when employmentEquity is in scope", () => {
    const f = baseFoundation();
    const errs = validateScorecardCriticalInputs(f, basePillars({ shareholders: [] }), ["employmentEquity"]);
    expect(errs.some((e) => e.includes("Ownership"))).toBe(true);
  });

  it("skips ownership validation when scoped pillars omit ownership and employmentEquity", () => {
    const f = baseFoundation();
    const errs = validateScorecardCriticalInputs(f, basePillars({ shareholders: [] }), ["skills"]);
    expect(errs.some((e) => e.includes("Ownership"))).toBe(false);
  });

  it("still requires ownership when ownership is explicitly scoped", () => {
    const f = baseFoundation();
    const errs = validateScorecardCriticalInputs(f, basePillars({ shareholders: [] }), ["ownership"]);
    expect(errs.some((e) => e.includes("Ownership"))).toBe(true);
  });
});
