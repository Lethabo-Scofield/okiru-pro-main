import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyExtractedOwnershipToRows,
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
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from "@toolkit/lib/sectors/transport-qse";
import type { CalculatorConfig } from "../../../shared/schema";
import * as XLSX from "xlsx";

// Single source of truth: the production derivation the store scores with. The
// hand-rolled copy this replaced had drifted (no electiveGroupSizes, and no
// chooseOneGroup on ownership/MC/EE — the very fields the Transport QSE
// any-four-of-seven total depends on).
function transportQseCalculatorConfig(): CalculatorConfig {
  return TRANSPORT_QSE_CALCULATOR_CONFIG;
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

/**
 * REAL CLIENT WORKBOOKS, NO LONGER IN THE REPO.
 *
 * These fixtures are Thandanani's and Lake Trading's actual gathering files.
 * The repository is public, so they were purged from the tree AND its history
 * (2026-08-24) — client fuel bills and shareholder IDs do not belong on the
 * internet. The tests still run wherever the files exist locally: keep them in
 * C:/Users/<you>/Documents/okiru-private-data/ and copy them to these paths,
 * or set the paths below. Where the files are absent the suites SKIP — loudly,
 * by name — rather than fail or silently pass.
 */
const fixturePath = resolve(
  process.cwd(),
  "../../docs/BEE Information Gathering File - Thandanani Transport.xlsm",
);

const lakeTradingPath = resolve(process.cwd(), "../../docs/Lake Trading Test.xlsx");
const hasThandanani = existsSync(fixturePath);
const hasLakeTrading = existsSync(lakeTradingPath);

describe.skipIf(!hasThandanani)("excelImport — Thandanani Transport fixture", () => {
  // Collection still executes this body even when skipped, so the read must
  // not throw on a machine without the private fixture.
  const buffer = hasThandanani ? readFileSync(fixturePath).buffer : new ArrayBuffer(0);

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
    // Row 0 STATES its identity (a real person), so document-level aggregates
    // are no longer stamped onto it — that stamp once scored black-women
    // ownership points for a company whose only shareholder is an Indian man.
    // The projection derives black % from the stated race instead.
    expect(String(firstSh?.race ?? "")).not.toBe("");
    expect(firstSh?.blackOwnership).toBeUndefined();
  });

  it("scores Thandanani Transport QSE ownership+MC+EE after import (denominator 100)", () => {
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
    // Transport QSE denominator is 100 (any four of seven × 25 base points); the
    // old 107 conflated the four richest elements' bonus-inclusive maxima with the
    // denominator. See apps/api/__tests__/transportQseScorecard.test.ts (canonical).
    expect(cfg.totalMaxPoints).toBe(100);
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

    // 24, not 28: the four black-women voting/EI points the old pin locked in
    // were PHANTOM — this company's sole shareholder is an Indian man, and the
    // aggregate black-women % that used to be stamped onto his row is now
    // (correctly) refused because the row states its identity.
    expect(own.total).toBeCloseTo(24, 0);
    expect(mc.maxPoints).toBe(27);
    expect(ee.maxPoints).toBe(27);
    expect(ee.score).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(40);
    // Upper bound raised from 70 → 80 (2026-06-11): the per-demographic MC model
    // rewards an EAP-matched workforce more than the old aggregate model (which
    // penalised against inflated per-level targets), lifting this diverse QSE to ~73.
    expect(total).toBeLessThan(80);
  });

  it.skipIf(!hasLakeTrading)("maps Lake Trading Test.xlsx into supplier, ESD, and SED detail rows", () => {
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
    // 59.16, not 62.17: this legacy import fixture's row 0 states identity, so
    // document aggregates no longer stamp over person evidence (the phantom
    // black-women mechanism). The CANONICAL import path is unaffected — the
    // toolkitTestData fitness harness still holds Lake at its ground truth.
    expect(total).toBeCloseTo(59.16, 1);
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

describe("applyExtractedOwnershipToRows — identity guard", () => {
  const data = { blackOwnership: 0.51, blackWomenOwnership: 0.3 } as any;

  it("still stamps an identity-less trust row (the designed trust encoding)", () => {
    const rows = [{ _id: "t1", shareholderName: "Family Trust", race: "", gender: "" }] as any[];
    const out = applyExtractedOwnershipToRows(data, [], rows);
    expect(Number(out[0].blackOwnership)).toBeGreaterThan(0);
    expect(Number(out[0].blackWomenOwnership)).toBeGreaterThan(0);
  });

  it("refuses to stamp a row that states its identity — no phantom black-women points", () => {
    const rows = [{ _id: "p1", shareholderName: "V Naidoo", race: "Indian", gender: "Male" }] as any[];
    const out = applyExtractedOwnershipToRows(data, [], rows);
    expect(out[0].blackOwnership).toBeUndefined();
    expect(out[0].blackWomenOwnership).toBeUndefined();
  });
});
