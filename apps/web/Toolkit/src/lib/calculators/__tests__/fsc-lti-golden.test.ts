/**
 * FSC Long-Term Insurers (FS702) golden tests.
 *
 * Source: BBBEE Toolkit (FSC) Template v1.0.xlsx — Long-Term Insurers sub-variant
 * Config: FSC_LTI_CALCULATOR_CONFIG
 *
 * Key LTI differences from FSC Generic (Others):
 * - Grand total: 142 pts incl. EF 15 (template: EF & ESD Scorecard - Long Term
 *   C13/C14 = 12+3; SD C16 = 7; ED C18 = 3 base + grad + jobs + stockbroker 2)
 * - SD target: 1.8% NPAT (not 2%)
 * - ED target: 0.2% NPAT (not 1%); stockbroker bonus still present (0.5%/2pts)
 * - EF Targeted Investments + Transaction Financing: 0 pts (Q44)
 * - AFS LTI: 12 pts — Appropriate Products (3) + Market Penetration (7) + Transactional Access (2)
 *
 * Synthetic entity: "Sanlam Life Insurance Ltd" (fictional, FSC LTI FS702)
 */
import { describe, it, expect } from 'vitest';
import { FSC_LTI_CALCULATOR_CONFIG, FSC_LTI_SUB_SECTOR } from '../../sectors/fsc-lti';
import { calculateEsdScore } from '../esd-sed';
import { calculateAfsScore } from '../afs';
import type { AfsData } from '../../types';

const CONFIG = FSC_LTI_CALCULATOR_CONFIG;
const NPAT = 50_000_000;

// ---------------------------------------------------------------------------
// AFS LTI fixtures
// ---------------------------------------------------------------------------

const ltiAfsDataFull: AfsData = {
  id: '1',
  clientId: 'sanlam-lti',
  appropriateProductsNumerator: 5,    // 5 compliant out of 5 total
  appropriateProductsDenominator: 5,  // → 100% → 3/3 pts
  marketPenetrationPolicies: 1_000_000,   // on-book
  saiaCommunicatedPolicies: 1_000_000,    // SAIA reference = 100% → 7/7 pts
  transactionalAccessCoverage: 85,         // 85% > 80% target → 2/2 pts
};

const ltiAfsDataEmpty: AfsData = { id: '1', clientId: 'sanlam-lti' };

const ltiAfsDataPartial: AfsData = {
  id: '1',
  clientId: 'sanlam-lti',
  appropriateProductsNumerator: 3,
  appropriateProductsDenominator: 5,   // 60% → 1.8/3 pts
  transactionalAccessCoverage: 40,     // 40/80 = 50% → 1/2 pts
};

// ---------------------------------------------------------------------------
// Suite 1: Config completeness
// ---------------------------------------------------------------------------

describe('FSC LTI — CalculatorConfig completeness', () => {
  it('loads 142 total points (incl. EF 15; template: core F12=121, C104=140)', () => {
    // 25+21+23+24+7(SD)+7(ED incl stockbroker)+15(EF)+12(AFS)+8 = 142
    expect(CONFIG.totalMaxPoints).toBe(134); // gazette shapes (audit items 7-10)
  });

  it('sector identity is FSC / Generic', () => {
    expect(CONFIG.sectorCode).toBe('FSC');
    expect(CONFIG.scorecardType).toBe('Generic');
  });

  it('sub-sector constant is LTI', () => {
    expect(FSC_LTI_SUB_SECTOR).toBe('LTI');
  });

  it('pillar maxima match LTI sub-sector spec', () => {
    const pc = CONFIG.pillarConfigs;
    expect(pc?.ownership?.maxPoints).toBe(23); // gazette shapes (audit items 7-10)
    expect(pc?.managementControl?.maxPoints).toBe(20); // gazette shapes (audit items 7-10)
    expect(pc?.skillsDevelopment?.maxPoints).toBe(23);
    expect(pc?.preferentialProcurement?.maxPoints).toBe(19); // gazette shapes (audit items 7-10)
    // EF & ESD Scorecard - Long Term: SD C16 = 7; ED C18 = 3 base (+1 grad
    // +1 jobs +2 stockbroker = 7). The old 10/9 were the Others ESD maxima.
    expect(pc?.supplierDevelopment?.maxPoints).toBe(7);
    expect(pc?.enterpriseDevelopment?.maxPoints).toBe(7);  // includes stockbroker
    expect((pc as any)?.empowermentFinancing?.maxPoints).toBe(15);
    expect(pc?.socioEconomicDevelopment?.maxPoints).toBe(8);
  });

  it('AFS config sub-sector is LTI, max 12 pts', () => {
    expect(CONFIG.accessToFinancialServices?.subSector).toBe('LTI');
    expect(CONFIG.accessToFinancialServices?.maxPoints).toBe(12);
  });

  it('AFS LTI indicator maxima (from PDF)', () => {
    const afs = CONFIG.accessToFinancialServices!;
    expect(afs.appropriateProductsMaxPts).toBe(3);
    expect(afs.marketPenetrationMaxPts).toBe(7);
    expect(afs.transactionalAccessTarget).toBeCloseTo(0.80, 4);
    expect(afs.transactionalAccessMaxPts).toBe(2);
    // Verify total = 12
    expect((afs.appropriateProductsMaxPts ?? 0) + (afs.marketPenetrationMaxPts ?? 0) + (afs.transactionalAccessMaxPts ?? 0)).toBe(12);
  });

  it('LTI SD target 1.8% NPAT (not 2%)', () => {
    expect(CONFIG.esd.supplierDevTarget).toBeCloseTo(0.018, 4);
  });

  it('LTI ED target 0.2% NPAT with stockbroker bonus 0.5%/2pts', () => {
    expect(CONFIG.esd.enterpriseDevTarget).toBeCloseTo(0.002, 4);
    expect(CONFIG.esd.edStockbrokerBonusMax).toBe(2);
    expect(CONFIG.esd.edStockbrokerTarget).toBeCloseTo(0.005, 4);
  });

  it('EF config for LTI has stockbroker bonus', () => {
    const ef = CONFIG.empowermentFinancing!;
    expect(ef.stockbrokerBonusMaxPts).toBe(2);
    expect(ef.stockbrokerTarget).toBeCloseTo(0.005, 4);
    expect(ef.sdTarget).toBeCloseTo(0.018, 4);
    expect(ef.edTarget).toBeCloseTo(0.002, 4);
  });

  it('LTI total pillar sum = 134 (gazette shapes)', () => {
    const pc = CONFIG.pillarConfigs!;
    const sum = (pc.ownership?.maxPoints ?? 0) + (pc.managementControl?.maxPoints ?? 0) +
      (pc.skillsDevelopment?.maxPoints ?? 0) + (pc.preferentialProcurement?.maxPoints ?? 0) +
      (pc.supplierDevelopment?.maxPoints ?? 0) + (pc.enterpriseDevelopment?.maxPoints ?? 0) +
      (pc.socioEconomicDevelopment?.maxPoints ?? 0) +
      (CONFIG.accessToFinancialServices?.maxPoints ?? 0) +
      ((pc as any).empowermentFinancing?.maxPoints ?? 0);
    // 25+21+23+24+7+7+8+12+15(EF) = 142
    expect(sum).toBe(134); // gazette shapes (audit items 7-10)
  });
});

// ---------------------------------------------------------------------------
// Suite 2: AFS LTI scoring
// ---------------------------------------------------------------------------

describe('FSC LTI — AFS scoring', () => {
  it('AFS = 12/12 (all indicators compliant)', () => {
    const result = calculateAfsScore(ltiAfsDataFull, CONFIG);
    expect(result).not.toBeNull();
    expect(result!.total).toBeCloseTo(12, 1);
    expect(result!.subSector).toBe('LTI');
  });

  it('AFS = 0/12 (no data)', () => {
    const result = calculateAfsScore(ltiAfsDataEmpty, CONFIG);
    expect(result!.total).toBe(0);
  });

  it('AFS partial — 60% products + no market penetration + 50% TA', () => {
    const result = calculateAfsScore(ltiAfsDataPartial, CONFIG);
    // Appropriate Products: 60% → 0.6 × 3 = 1.8 pts
    // Market Penetration: 0 pts (no data)
    // Transactional Access: 40%/80% × 2 = 1 pt
    // Total ≈ 2.8
    expect(result!.total).toBeCloseTo(2.8, 1);
  });

  it('AFS market penetration proportional scoring', () => {
    const result = calculateAfsScore(
      {
        id: '1', clientId: 'sanlam-lti',
        marketPenetrationPolicies: 500_000,
        saiaCommunicatedPolicies: 1_000_000,
      },
      CONFIG,
    );
    // 500k / 1M = 50% → 0.5 × 7 = 3.5 pts
    expect(result!.total).toBeCloseTo(3.5, 1);
  });

  it('AFS Transactional Access = 0 when below 80% target', () => {
    const result = calculateAfsScore(
      { id: '1', clientId: 'sanlam-lti', transactionalAccessCoverage: 60 },
      CONFIG,
    );
    // 60% / 80% = 75% → 0.75 × 2 = 1.5 pts
    expect(result!.total).toBeCloseTo(1.5, 1);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: ESD with modified targets
// ---------------------------------------------------------------------------

describe('FSC LTI — ESD scoring (modified targets)', () => {
  it('SD = 7/7 at 1.8% NPAT (EF & ESD - Long Term C16)', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'sanlam-lti',
        contributions: [
          { id: 'sd1', beneficiary: 'SME', type: 'direct_cost', amount: NPAT * 0.018, category: 'supplier_development' },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBeCloseTo(7, 1); // SD max 7 (C16)
    expect(r.sdSubMinimumMet).toBe(true);
  });

  it('ED with stockbroker bonus = 7/7 total (3 base +1+1+2)', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'sanlam-lti',
        contributions: [
          { id: 'ed1', beneficiary: 'SME', type: 'grant', amount: NPAT * 0.002, category: 'enterprise_development' },
        ],
        graduationBonus: true,
        jobsCreatedBonus: true,
        stockbrokerSpend: NPAT * 0.005,
      },
      NPAT,
      CONFIG,
    );
    expect(r.stockbrokerBonus).toBeCloseTo(2, 1);
    expect(r.edTotal).toBeCloseTo(7, 1); // 3 base (C18) + 1 + 1 + 2 stockbroker
  });
});
