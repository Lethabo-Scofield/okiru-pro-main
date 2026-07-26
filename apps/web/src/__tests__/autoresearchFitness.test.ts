/**
 * autoresearch FITNESS FUNCTION (do not delete — drives the autonomous loop).
 *
 * Bulk-uploads the generated Lake Trading info sheet through the REAL importer
 * (normalizeExcelBuffer) → projectWorkbookToClient → calculators, and checks the
 * grand total against the Excel ground truth 63.56.
 *
 * The sheet is produced by `node autoresearch/fitness/generate-info-sheet.mjs`
 * from the real filled toolkit (NOT the lakeTradingWorkbookFixture golden data).
 *
 * Two gates:
 *   1. PIPELINE gate (hard): the bulk upload must ingest every pillar's rows.
 *      This is the regression guard for the create-scorecard bulk-upload feature.
 *   2. SCORE gate (the research target): grand total ≈ 63.56. Currently RED
 *      (~62.17) — the Management Control per-demographic EAP model under-scores
 *      vs the Excel aggregate (10.38 vs 11.77). Closing this is autoresearch
 *      mission M1. When it passes, the engine matches the Excel toolkit.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { normalizeExcelBuffer } from '@/lib/workbookExcelNormalizer';
import { projectWorkbookToClient, type WorkbookData } from '../../server/workbookRoutes';
import { calculateOwnershipScore } from '@toolkit/lib/calculators/ownership';
import { calculateManagementScore } from '@toolkit/lib/calculators/management';
import { calculateProcurementScore } from '@toolkit/lib/calculators/procurement';
import { calculateEsdScore, calculateSedScore } from '@toolkit/lib/calculators/esd-sed';
import type { CalculatorConfig } from '../../shared/schema';

const SHEET = resolve(process.cwd(), '../../autoresearch/fitness/lake-trading-info-sheet.xlsx');
/**
 * RE-ANCHORED 2026-07-26 (user directive: gazette truth over template baselines).
 *
 * The Excel toolkit's 63.56 includes Ownership 25.00 awarded by the template's
 * "25%+1 voting → every line at maximum" convention: the Lake Family Trust got
 * the black-WOMEN voting/EI points (2+2) and designated-group/new-entrant
 * points (3+2) with none of those recorded. Annexe 100 scores each indicator
 * on its own measure, so the gazette-true engine awards Ownership 18.00
 * (voting 4 + EI 4 + DG… as evidenced + net value 8) and the grand total is
 * 56.53. The full delta vs 63.56 is that ownership line — every other pillar
 * is unchanged (MC 11.74, PP 20.33, SD 3.69, ED 2.36, SED 0.41).
 * See docs/calculator-audit-2026-07-26.md item 12a.
 */
const TARGET = 56.53;

// RCOGP Generic config (mirrors apps/web/server/__tests__/workbookProjection.test.ts).
const CONFIG: CalculatorConfig = {
  totalMaxPoints: 120,
  ownership: { votingRightsMax: 4, womenBonusMax: 2, economicInterestMax: 4, netValueMax: 8, targetEconomicInterest: 0.25, subMinNetValue: 3.2 },
  management: { boardBlackTarget: 0.5, boardBlackPoints: 2, boardWomenTarget: 0.25, boardWomenPoints: 1, execBlackTarget: 0.5, execBlackPoints: 2, execWomenTarget: 0.25, execWomenPoints: 1, disabledTarget: 0.02, execBWTarget: 0.25, execBWMaxPts: 1 },
  managementControl: { maxPoints: 19, subMinimumPercent: 0, boardBlackTarget: 0.5, boardBlackMaxPts: 2, boardBWTarget: 0.25, boardBWMaxPts: 1, execBlackTarget: 0.5, execBlackMaxPts: 2, execBWTarget: 0.25, execBWMaxPts: 1, otherExecBlackTarget: 0.6, otherExecBlackMaxPts: 2, otherExecBWTarget: 0.3, otherExecBWMaxPts: 1, seniorMaxPts: 2, seniorBWMaxPts: 1, middleMaxPts: 2, middleBWMaxPts: 1, juniorMaxPts: 1, juniorBWMaxPts: 1, disabledTarget: 0.02, disabledMaxPts: 2 },
  employmentEquity: { maxPoints: 0, disabledTarget: 0.02, disabledMaxPts: 2 },
  skills: { generalMax: 6, bursaryMax: 4, overallTarget: 3.5, bursaryTarget: 2.5, subMinThreshold: 10, learningProgrammesMaxPts: 6, bursaryMaxPts: 4, disabledLearningMaxPts: 4, learnershipsMaxPts: 6, absorptionMaxPts: 5, learnershipTargetPercent: 5, absorptionTargetPercent: 2.5, overallSpendPercent: 3.5, bursarySpendPercent: 2.5, disabledSpendPercent: 0.3 },
  procurement: { baseMax: 27, bonusMax: 2, tmpsTarget: 0, subMinThreshold: 10.8, blackOwnedThreshold: 0.5, blackWomenThreshold: 0.3, allSuppliersTarget: 0.8, allSuppliersMaxPts: 5, qseTarget: 0.15, qseMaxPts: 3, emeTarget: 0.15, emeMaxPts: 4, bo51Target: 0.5, bo51MaxPts: 11, bwo30Target: 0.12, bwo30MaxPts: 4, dgTarget: 0.02, dgMaxPts: 2 },
  esd: { supplierDevMax: 10, enterpriseDevMax: 5, supplierDevTarget: 0.02, enterpriseDevTarget: 0.01 },
  sed: { maxPoints: 5, npatTarget: 0.01 },
  discounting: { dropLevels: 1, maxDropLevel: 8 },
  pillarConfigs: {
    ownership: { maxPoints: 25, subMinimumPercent: 40 }, managementControl: { maxPoints: 19, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0 }, skillsDevelopment: { maxPoints: 25, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 29, subMinimumPercent: 40 }, supplierDevelopment: { maxPoints: 10, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 7, subMinimumPercent: 0 }, socioEconomicDevelopment: { maxPoints: 5 }, yesInitiative: { maxPoints: 0 },
  },
  benefitFactors: [], industryNorms: [],
};

// The info sheet is a reproducible artifact (gitignored). If it hasn't been
// generated yet, skip gracefully so a fresh checkout's suite stays green —
// run `node autoresearch/fitness/generate-info-sheet.mjs` first.
const suite = existsSync(SHEET) ? describe : describe.skip;

suite('autoresearch fitness — Lake Trading bulk upload → 63.56', () => {
  const buf = readFileSync(SHEET);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const imported = normalizeExcelBuffer(ab as ArrayBuffer);
  const wb: WorkbookData = {
    companyId: 'C-LAKE-FITNESS', ownerOrganizationId: null, ownerUserId: 'fitness',
    sections: imported.sections as any, updatedAt: new Date().toISOString(),
  };
  const p = projectWorkbookToClient(wb);
  const npat = p.financials?.effectiveNpat ?? 33862998;
  const tmps = p.financials?.tmps ?? 133730345.99;

  const own = calculateOwnershipScore({ shareholders: p.shareholders, companyValue: 100000000, outstandingDebt: 0, yearsHeld: 10 } as any, CONFIG).total;
  // combineExcoSenior comes from the company-info meta ("Combine Other Executive &
  // Senior Management? = Yes") — the real scoring path (Toolkit store) passes it,
  // so the fitness harness must too.
  const combineExcoSenior = Boolean((p.financials as any)?.combineExcoSenior);
  // eapYear 2025: the Lake workbook (and its 63.56 ground truth) was scored
  // under the 25th CEE EAP dataset. The live default is the newest CEE year
  // (26th = 2026); pinning the vintage here keeps the fixture faithful to the
  // workbook it was verified against — see docs/Commission for Employment
  // Equity 26th CEE Report.pdf pp.33-34 for the newer stats.
  const mgmt = calculateManagementScore({ id: '', clientId: '', employees: p.employees as any, combineExcoSenior } as any, CONFIG, 'Gauteng', 2025).total;
  const proc = calculateProcurementScore({ id: '', clientId: '', tmps, suppliers: p.suppliers as any } as any, CONFIG).total;
  const esd = calculateEsdScore({ id: '', clientId: '', contributions: p.esdContributions as any, graduationBonus: false, jobsCreatedBonus: false } as any, npat, CONFIG);
  const sed = calculateSedScore({ id: '', clientId: '', contributions: p.sedContributions as any } as any, npat, CONFIG).total;
  const total = own + mgmt + 0 + proc + esd.sdTotal + esd.edTotal + sed;

  it('PIPELINE: bulk upload ingests every pillar', () => {
    // eslint-disable-next-line no-console
    console.log(`\n[autoresearch fitness] employees=${p.employees.length} suppliers=${p.suppliers.length} esd=${p.esdContributions.length} sed=${p.sedContributions.length}`);
    // eslint-disable-next-line no-console
    console.log(`[autoresearch fitness] Ownership=${own.toFixed(2)} MC=${mgmt.toFixed(2)} Skills=0.00 PP=${proc.toFixed(2)} SD=${esd.sdTotal.toFixed(2)} ED=${esd.edTotal.toFixed(2)} SED=${sed.toFixed(2)}`);
    // eslint-disable-next-line no-console
    console.log(`[autoresearch fitness] >>> SCORE=${total.toFixed(2)}  TARGET=${TARGET}  GAP=${(TARGET - total).toFixed(2)} <<<\n`);
    expect(p.employees.length).toBe(12);
    expect(p.suppliers.length).toBeGreaterThanOrEqual(40);
    expect(p.esdContributions.length).toBe(2);
    expect(p.sedContributions.length).toBe(1);
  });

  // The SCORE target is the research GOAL — RED until autoresearch mission M1
  // lands. It is skipped in the normal suite (so it isn't a spurious failure)
  // and made a HARD gate when the loop runs with AUTORESEARCH=1.
  const scoreIt = process.env.AUTORESEARCH ? it : it.skip;
  scoreIt('SCORE TARGET (research goal M1): grand total ≈ 63.56', () => {
    expect(total).toBeCloseTo(TARGET, 0);
  });
});
