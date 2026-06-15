import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractBeeGatheringBuffer,
  isBeeGatheringWorkbook,
  mapExtractedToWorkbookSections,
  normalizeSectorDeterministic,
} from "../excelImport";
import { projectWorkbookToClient } from "../../../server/workbookRoutes";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { calculateManagementScore } from "@toolkit/lib/calculators/management";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateEsdScore, calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import {
  calculateTransportQseEmploymentEquity,
  calculateTransportQseManagement,
} from "@toolkit/lib/calculators/transport";
import { getSectorConfig } from "../../../../api/pipeline/sectorConfig";
import type { CalculatorConfig } from "../../../shared/schema";
import * as XLSX from "xlsx";

function transportQseCalculatorConfig(): CalculatorConfig {
  const sc = getSectorConfig("TRANSPORT", "QSE");
  const t = sc.targets || {};
  const own = t.ownership || {};
  const mc = t.managementControl || {};
  const ee = t.employmentEquity || {};
  const sk = t.skills || {};
  const pr = t.procurement || {};
  const esd = t.esd || {};
  const sed = t.sed || {};
  const pc = sc.pillarConfigs || {};
  return {
    totalMaxPoints: sc.totalMaxPoints,
    ownership: {
      votingRightsMax: own.votingRightsMaxPts,
      womenBonusMax: own.womenVotingMaxPts,
      economicInterestMax: own.economicInterestMaxPts,
      netValueMax: own.netValueMaxPts,
      targetEconomicInterest: own.economicInterestTarget,
      subMinNetValue: 0,
      votingRightsTarget: own.votingRightsTarget,
      womenVotingTarget: own.womenVotingTarget,
      womenEIMax: own.womenEIMaxPts,
      womenEITarget: own.womenEITarget,
      newEntrantsMax: own.newEntrantsMaxPts,
      designatedGroupsMax: own.economicInterestDesignatedGroupMaxPts ?? 3,
      designatedGroupsTarget: own.economicInterestDesignatedGroupTarget ?? 0.03,
    },
    management: {
      boardBlackTarget: mc.boardBlackTarget,
      boardBlackPoints: mc.boardBlackMaxPts,
      boardWomenTarget: mc.boardBWTarget,
      boardWomenPoints: mc.boardBWMaxPts,
      execBlackTarget: mc.execBlackTarget,
      execBlackPoints: mc.execBlackMaxPts,
      execWomenTarget: mc.execBWTarget,
      execWomenPoints: mc.execBWMaxPts,
    },
    managementControl: { maxPoints: pc.managementControl?.maxPoints ?? 27 },
    employmentEquity: { maxPoints: pc.employmentEquity?.maxPoints ?? 27 },
    skills: {
      generalMax: sk.learningProgrammesMaxPts,
      bursaryMax: sk.bursaryMaxPts,
      overallTarget: sk.overallSpendPercent,
      bursaryTarget: sk.bursarySpendPercent,
      subMinThreshold: 0,
    },
    procurement: {
      baseMax: pr.allSuppliersMaxPts,
      bonusMax: 0,
      tmpsTarget: 0,
      subMinThreshold: 0,
      blackOwnedThreshold: pr.bo51Target,
      allSuppliersTarget: pr.allSuppliersTarget,
      allSuppliersMaxPts: pr.allSuppliersMaxPts,
    },
    esd: {
      supplierDevMax: esd.sdMaxPts,
      enterpriseDevMax: esd.edMaxPts,
      supplierDevTarget: (esd.sdPercent ?? 2) / 100,
      enterpriseDevTarget: (esd.edPercent ?? 1) / 100,
    },
    sed: { maxPoints: sed.maxPts, npatTarget: (sed.spendPercent ?? 1) / 100 },
    discounting: { dropLevels: 1, maxDropLevel: 8 },
    pillarConfigs: {
      ownership: { maxPoints: pc.ownership?.maxPoints ?? 28 },
      managementControl: { maxPoints: pc.managementControl?.maxPoints ?? 27 },
      employmentEquity: { maxPoints: pc.employmentEquity?.maxPoints ?? 27 },
      skillsDevelopment: { maxPoints: pc.skillsDevelopment?.maxPoints ?? 25, chooseOneGroup: pc.skillsDevelopment?.chooseOneGroup },
      preferentialProcurement: { maxPoints: pc.preferentialProcurement?.maxPoints ?? 25, chooseOneGroup: pc.preferentialProcurement?.chooseOneGroup },
      enterpriseDevelopment: { maxPoints: pc.enterpriseDevelopment?.maxPoints ?? 25, chooseOneGroup: pc.enterpriseDevelopment?.chooseOneGroup },
      socioEconomicDevelopment: { maxPoints: pc.socioEconomicDevelopment?.maxPoints ?? 25, chooseOneGroup: pc.socioEconomicDevelopment?.chooseOneGroup },
    },
    benefitFactors: [],
    industryNorms: [],
  };
}

const RCOGP_GENERIC_CONFIG: CalculatorConfig = {
  totalMaxPoints: 120,
  ownership: {
    votingRightsMax: 4,
    womenBonusMax: 2,
    economicInterestMax: 4,
    netValueMax: 8,
    targetEconomicInterest: 0.25,
    subMinNetValue: 3.2,
  },
  management: {
    boardBlackTarget: 0.5,
    boardBlackPoints: 2,
    boardWomenTarget: 0.25,
    boardWomenPoints: 1,
    execBlackTarget: 0.5,
    execBlackPoints: 2,
    execWomenTarget: 0.25,
    execWomenPoints: 1,
    disabledTarget: 0.02,
    execBWTarget: 0.25,
    execBWMaxPts: 1,
  },
  managementControl: {
    maxPoints: 19,
    subMinimumPercent: 0,
    boardBlackTarget: 0.5,
    boardBlackMaxPts: 2,
    boardBWTarget: 0.25,
    boardBWMaxPts: 1,
    execBlackTarget: 0.5,
    execBlackMaxPts: 2,
    execBWTarget: 0.25,
    execBWMaxPts: 1,
    otherExecBlackTarget: 0.6,
    otherExecBlackMaxPts: 2,
    otherExecBWTarget: 0.3,
    otherExecBWMaxPts: 1,
    seniorMaxPts: 2,
    seniorBWMaxPts: 1,
    middleMaxPts: 2,
    middleBWMaxPts: 1,
    juniorMaxPts: 1,
    juniorBWMaxPts: 1,
    disabledTarget: 0.02,
    disabledMaxPts: 2,
  },
  employmentEquity: { maxPoints: 0, disabledTarget: 0.02, disabledMaxPts: 2 },
  skills: {
    generalMax: 6,
    bursaryMax: 4,
    overallTarget: 3.5,
    bursaryTarget: 2.5,
    subMinThreshold: 10,
    learningProgrammesMaxPts: 6,
    bursaryMaxPts: 4,
    disabledLearningMaxPts: 4,
    learnershipsMaxPts: 6,
    absorptionMaxPts: 5,
    learnershipTargetPercent: 5,
    absorptionTargetPercent: 2.5,
    overallSpendPercent: 3.5,
    bursarySpendPercent: 2.5,
    disabledSpendPercent: 0.3,
  },
  procurement: {
    baseMax: 27,
    bonusMax: 2,
    tmpsTarget: 0,
    subMinThreshold: 10.8,
    blackOwnedThreshold: 0.5,
    blackWomenThreshold: 0.3,
    allSuppliersTarget: 0.8,
    allSuppliersMaxPts: 5,
    qseTarget: 0.15,
    qseMaxPts: 3,
    emeTarget: 0.15,
    emeMaxPts: 4,
    bo51Target: 0.5,
    bo51MaxPts: 11,
    bwo30Target: 0.12,
    bwo30MaxPts: 4,
    dgTarget: 0.02,
    dgMaxPts: 2,
  },
  esd: {
    supplierDevMax: 10,
    enterpriseDevMax: 5,
    supplierDevTarget: 0.02,
    enterpriseDevTarget: 0.01,
  },
  sed: { maxPoints: 5, npatTarget: 0.01 },
  discounting: { dropLevels: 1, maxDropLevel: 8 },
  pillarConfigs: {
    ownership: { maxPoints: 25, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0 },
    skillsDevelopment: { maxPoints: 25, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 29, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 7, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5 },
    yesInitiative: { maxPoints: 0 },
  },
  benefitFactors: [],
  industryNorms: [],
};

const fixturePath = resolve(
  process.cwd(),
  "../../docs/BEE Information Gathering File - Thandanani Transport.xlsm",
);

const lakeTradingPath = resolve(process.cwd(), "../../docs/Lake Trading Test.xlsx");

describe("excelImport — Thandanani Transport fixture", () => {
  const buffer = readFileSync(fixturePath).buffer;

  it("detects BEE gathering workbook format", () => {
    const wb = XLSX.read(buffer, { type: "array" });
    expect(isBeeGatheringWorkbook(wb)).toBe(true);
  });

  it("extracts company, financials, and ownership totals", () => {
    const result = extractBeeGatheringBuffer(buffer);
    expect(result.isBeeGatheringFormat).toBe(true);
    expect(result.data.companyName).toBe("Thandanani Transport");
    expect(result.data.sector).toBe("TRANSPORT");
    expect(result.data.revenue).toBe(10_826_271);
    expect(result.data.npat).toBe(-27_124);
    expect(result.data.payroll).toBe(2_753_331);
    expect(result.data.totalProcurement).toBe(4_674_995);
    expect(result.data.blackOwnership).toBe(100);
    expect(result.data.financialYearEnd).toBe("2025-02-28");
    expect(result.data.scorecardType).toBe("QSE");
    expect(result.mappedSheets.length).toBeGreaterThan(10);
    expect(result.extractedFieldCount).toBeGreaterThanOrEqual(20);
  });

  it("extracts extended BEE pillar fields from Thandanani file", () => {
    const result = extractBeeGatheringBuffer(buffer);
    const { data, fieldConfidences } = result;

    expect(data.leviableAmount).toBe(2_124_744);
    expect(data.skillsSpend).toBe(0);
    expect(data.learnershipCount).toBe(0);
    expect(data.esdContributions).toBe(0);
    expect(data.sedContributions).toBe(0);
    expect(data.empowermentFinancing).toBe(0);
    expect(data.beeCompliantSpend).toBe(0);
    expect(data.yesEmployees).toBe(0);
    expect(data.yesAbsorbed).toBe(0);

    expect(data.topMgmtBlackPercent).toBe(100);
    expect(data.seniorMgmtEEBlackPercent).toBe(100);
    expect(data.boardBlackPercent).toBe(100);
    expect(data.boardWomenPercent).toBe(0);
    expect(data.seniorMgmtBlackPercent).toBe(100);

    expect(fieldConfidences.companyName).toBe("high");
    expect(fieldConfidences.revenue).toBe("high");
    expect(fieldConfidences.blackOwnership).toBe("high");
    expect(fieldConfidences.topMgmtBlackPercent).toBe("high");

    expect(result.ownershipChainTiers.length).toBeGreaterThan(0);
    expect(result.ownershipChainTiers[0]?.entityName).toBe("Thandanani Packers and Hauliers");
    expect(result.ownershipChainTiers[0]?.blackVotingRights).toBe(100);
  });

  it("maps extracted data into workbook sections", () => {
    const extraction = extractBeeGatheringBuffer(buffer);
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const sections = mapExtractedToWorkbookSections(
      extraction.data,
      wb,
      extraction.ownershipChainTiers,
    );

    expect(sections["company-information"]?.meta?.companyName).toBe("Thandanani Transport");
    expect(sections["company-information"]?.meta?.industrySector).toBe("TRANSPORT");
    expect(sections["company-information"]?.meta?.scorecardType).toBe("QSE");
    expect(sections["financial-information"]?.meta?.revenue).toBe(10_826_271);
    expect(sections.ownership?.rows?.length).toBeGreaterThan(0);
    expect(sections.employees?.rows?.length).toBeGreaterThan(0);

    const firstSh = sections.ownership?.rows?.[0] as Record<string, unknown> | undefined;
    expect(Number(firstSh?.blackOwnership)).toBeGreaterThan(0);
  });

  it("scores Thandanani Transport QSE at ~58-68 / 107 after import", () => {
    const extraction = extractBeeGatheringBuffer(buffer);
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const sections = mapExtractedToWorkbookSections(
      extraction.data,
      wb,
      extraction.ownershipChainTiers,
    );
    const projection = projectWorkbookToClient({
      companyId: "thandanani-import-test",
      ownerOrganizationId: null,
      ownerUserId: "test",
      sections,
      updatedAt: new Date().toISOString(),
    } as any);

    const cfg = transportQseCalculatorConfig();
    expect(cfg.totalMaxPoints).toBe(107);
    expect(cfg.pillarConfigs?.ownership?.maxPoints).toBe(28);

    const own = calculateOwnershipScore(
      {
        id: "",
        clientId: "",
        shareholders: projection.shareholders as any,
        companyValue: 0,
        outstandingDebt: 0,
        yearsHeld: 5,
      } as any,
      cfg,
    );
    const mc = calculateTransportQseManagement(
      { id: "", clientId: "", employees: projection.employees as any },
      cfg,
    );
    const ee = calculateTransportQseEmploymentEquity(
      { id: "", clientId: "", employees: projection.employees as any },
      cfg,
      "Gauteng",
    );

    const total = own.total + mc.score + ee.score;
    // eslint-disable-next-line no-console
    console.log("[SCORING-TRACE] Thandanani Transport QSE:", {
      ownership: `${own.total} / ${cfg.pillarConfigs?.ownership?.maxPoints}`,
      managementControl: `${mc.score} / ${mc.maxPoints}`,
      employmentEquity: `${ee.score} / ${ee.maxPoints}`,
      total: `${total} / ${cfg.totalMaxPoints}`,
    });

    expect(own.total).toBeCloseTo(28, 0);
    expect(mc.maxPoints).toBe(27);
    expect(ee.maxPoints).toBe(27);
    expect(ee.score).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(40);
    // Upper bound raised from 70 → 80 (2026-06-11): the per-demographic MC model
    // rewards an EAP-matched workforce more than the old aggregate model (which
    // penalised against inflated per-level targets), lifting this diverse QSE to ~73.
    expect(total).toBeLessThan(80);
  });

  it("maps Lake Trading Test.xlsx into supplier, ESD, and SED detail rows", () => {
    const buffer = readFileSync(lakeTradingPath).buffer;
    const extraction = extractBeeGatheringBuffer(buffer);
    expect(extraction.isBeeGatheringFormat).toBe(true);
    expect(extraction.data.totalProcurement).toBeCloseTo(133_730_345.99, 0);
    expect(extraction.data.esdContributions).toBeGreaterThan(0);

    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const sections = mapExtractedToWorkbookSections(
      extraction.data,
      wb,
      extraction.ownershipChainTiers,
    );

    expect(sections.suppliers?.rows?.length).toBe(2);
    expect(sections.esd?.rows?.length).toBe(2);
    expect(sections.sed?.rows?.length).toBe(1);
    expect(Number((sections.sed?.rows?.[0] as Record<string, unknown>)?.amount)).toBe(27_500);
    expect(sections["skills-development"]?.rows?.length).toBe(0);

    const sh = sections.ownership?.rows?.[0] as Record<string, unknown>;
    expect(sh?.shareholderName).toBe("Lake Family Trust");
    expect(Number(sh?.blackOwnership)).toBe(100);
    expect(sh?.isNewEntrant).toBe(true);

    const eme = sections.suppliers?.rows?.find(
      (r) => String((r as Record<string, unknown>).supplierName).includes("EME"),
    ) as Record<string, unknown>;
    expect(Number(eme?.spend)).toBeCloseTo(133_696_348.45, 0);
    expect(eme?.bbbeeLevel).toBe("1");

    const wbData = {
      companyId: "lake-import-test",
      ownerOrganizationId: null,
      ownerUserId: "test",
      sections,
      updatedAt: new Date().toISOString(),
    };
    const projection = projectWorkbookToClient(wbData as any);
    const own = calculateOwnershipScore(
      {
        id: "",
        clientId: "",
        shareholders: projection.shareholders as any,
        companyValue: 50_000_000,
        outstandingDebt: 0,
        yearsHeld: 3,
      } as any,
      RCOGP_GENERIC_CONFIG,
    );
    const mc = calculateManagementScore(
      { id: "", clientId: "", employees: projection.employees as any },
      RCOGP_GENERIC_CONFIG,
      "Gauteng",
    );
    const proc = calculateProcurementScore(
      {
        id: "",
        clientId: "",
        tmps: projection.financials.tmps,
        suppliers: projection.suppliers as any,
      } as any,
      RCOGP_GENERIC_CONFIG,
    );
    const esd = calculateEsdScore(
      {
        id: "",
        clientId: "",
        contributions: projection.esdContributions as any,
        graduationBonus: false,
        jobsCreatedBonus: false,
      } as any,
      projection.financials.npat,
      RCOGP_GENERIC_CONFIG,
    );
    const sed = calculateSedScore(
      {
        id: "",
        clientId: "",
        contributions: projection.sedContributions as any,
      } as any,
      projection.financials.npat,
      RCOGP_GENERIC_CONFIG,
    );
    const total = own.total + mc.total + proc.total + esd.sdTotal + esd.edTotal + sed.total;
    expect(total).toBeCloseTo(62.17, 1); // per-demographic MC (was 63.56 under aggregate MC)
  });

  it("normalizes sector labels deterministically", () => {
    expect(normalizeSectorDeterministic("Transport")).toBe("TRANSPORT");
    expect(normalizeSectorDeterministic("Financial Services")).toBe("FSC");
    expect(normalizeSectorDeterministic("Retail / RCOGP")).toBe("RCOGP");
    expect(normalizeSectorDeterministic("retail")).toBe("RCOGP");
    expect(normalizeSectorDeterministic("Information and Communication Technology")).toBe("ICT");
    expect(normalizeSectorDeterministic("Unknown Sector XYZ")).toBeUndefined();
  });
});
