/**
 * FSC Short-Term Insurers (FS703) golden tests.
 *
 * Source: BBBEE Toolkit (FSC) Template v1.0.xlsx — Short-Term Insurers sub-variant
 * Config: FSC_STI_CALCULATOR_CONFIG
 *
 * Key STI differences from FSC Generic (Others):
 * - Grand total: 132 pts (+AFS 12 pts; standard SD/ED targets)
 * - No Empowerment Financing (EF = N/A for STI per SLS §2)
 * - Standard SD/ED targets (same as Others: SD 2% NPAT, ED 1% NPAT)
 * - AFS STI: 12 pts — Commercial Products (2 pts, 6 lines) + Insurance Policies (10 pts)
 *
 * AFS source: "AFS Scorecard - Short Term" PDF (rendered 2026-06-01):
 *   Commercial sub-total = 2.00 pts (6 lines × 0.333 each)
 *   Insurance Policies sub-total = 10.00 pts
 *   Grand-total = 12.00 ✓
 *
 * Synthetic entity: "Old Mutual Short Term Insurance" (fictional, FSC STI FS703)
 */
import { describe, it, expect } from 'vitest';
import { FSC_STI_CALCULATOR_CONFIG, FSC_STI_SUB_SECTOR } from '../../sectors/fsc-sti';
import { calculateEsdScore } from '../esd-sed';
import { calculateAfsScore } from '../afs';
import type { AfsData } from '../../types';

const CONFIG = FSC_STI_CALCULATOR_CONFIG;
const NPAT = 30_000_000;

// ---------------------------------------------------------------------------
// AFS STI fixtures
// ---------------------------------------------------------------------------

const stiAfsDataAll6: AfsData = {
  id: '1',
  clientId: 'om-sti',
  commercialEquipment: true,
  commercialLiability: true,
  commercialProperty: true,
  commercialAgriculture: true,
  commercialLivestock: true,
  commercialOther: true,
  insurancePoliciesCompliant: true,
};

const stiAfsDataCommercialOnly: AfsData = {
  id: '1',
  clientId: 'om-sti',
  commercialEquipment: true,
  commercialLiability: true,
  commercialProperty: true,
  commercialAgriculture: true,
  commercialLivestock: true,
  commercialOther: true,
  insurancePoliciesCompliant: false,
};

const stiAfsDataPoliciesOnly: AfsData = {
  id: '1',
  clientId: 'om-sti',
  insurancePoliciesCompliant: true,
};

const stiAfsDataEmpty: AfsData = { id: '1', clientId: 'om-sti' };

// ---------------------------------------------------------------------------
// Suite 1: Config completeness
// ---------------------------------------------------------------------------

describe('FSC STI — CalculatorConfig completeness', () => {
  it('loads 132 total points', () => {
    expect(CONFIG.totalMaxPoints).toBe(132);
  });

  it('sector identity is FSC / Generic', () => {
    expect(CONFIG.sectorCode).toBe('FSC');
    expect(CONFIG.scorecardType).toBe('Generic');
  });

  it('sub-sector constant is STI', () => {
    expect(FSC_STI_SUB_SECTOR).toBe('STI');
  });

  it('pillar maxima match STI sub-sector spec', () => {
    const pc = CONFIG.pillarConfigs;
    expect(pc?.ownership?.maxPoints).toBe(25);
    expect(pc?.managementControl?.maxPoints).toBe(21);
    expect(pc?.skillsDevelopment?.maxPoints).toBe(23);
    expect(pc?.preferentialProcurement?.maxPoints).toBe(24);
    expect(pc?.supplierDevelopment?.maxPoints).toBe(10);
    expect(pc?.enterpriseDevelopment?.maxPoints).toBe(9);   // same as Others
    expect(pc?.socioEconomicDevelopment?.maxPoints).toBe(8);
  });

  it('AFS config sub-sector is STI, max 12 pts', () => {
    expect(CONFIG.accessToFinancialServices?.subSector).toBe('STI');
    expect(CONFIG.accessToFinancialServices?.maxPoints).toBe(12);
  });

  it('AFS STI indicator config (from PDF)', () => {
    const afs = CONFIG.accessToFinancialServices!;
    expect(afs.commercialProductsMaxPts).toBe(2);
    expect(afs.commercialLinesCount).toBe(6);
    expect(afs.insurancePoliciesTarget).toBeCloseTo(1.0, 4);
    expect(afs.insurancePoliciesMaxPts).toBe(10);
    // Commercial(2) + Policies(10) = 12
    expect((afs.commercialProductsMaxPts ?? 0) + (afs.insurancePoliciesMaxPts ?? 0)).toBe(12);
  });

  it('STI has no EF config (N/A for STI)', () => {
    expect(CONFIG.empowermentFinancing).toBeUndefined();
  });

  it('STI standard SD/ED targets (same as Others)', () => {
    expect(CONFIG.esd.supplierDevTarget).toBeCloseTo(0.02, 4);
    expect(CONFIG.esd.enterpriseDevTarget).toBeCloseTo(0.01, 4);
    expect(CONFIG.esd.edStockbrokerBonusMax).toBe(2);
    expect(CONFIG.esd.edStockbrokerTarget).toBeCloseTo(0.005, 4);
  });

  it('STI total pillar sum = 132', () => {
    const pc = CONFIG.pillarConfigs!;
    const sum = (pc.ownership?.maxPoints ?? 0) + (pc.managementControl?.maxPoints ?? 0) +
      (pc.skillsDevelopment?.maxPoints ?? 0) + (pc.preferentialProcurement?.maxPoints ?? 0) +
      (pc.supplierDevelopment?.maxPoints ?? 0) + (pc.enterpriseDevelopment?.maxPoints ?? 0) +
      (pc.socioEconomicDevelopment?.maxPoints ?? 0) +
      (CONFIG.accessToFinancialServices?.maxPoints ?? 0);
    expect(sum).toBe(132);
    expect(CONFIG.totalMaxPoints).toBe(132);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: AFS STI scoring
// ---------------------------------------------------------------------------

describe('FSC STI — AFS scoring', () => {
  it('AFS = 12/12 (all 6 lines + insurance policies)', () => {
    const result = calculateAfsScore(stiAfsDataAll6, CONFIG);
    expect(result).not.toBeNull();
    expect(result!.total).toBeCloseTo(12, 1);
    expect(result!.subSector).toBe('STI');
  });

  it('AFS = 0/12 (no data)', () => {
    const result = calculateAfsScore(stiAfsDataEmpty, CONFIG);
    expect(result!.total).toBe(0);
  });

  it('AFS = 2/12 (all 6 commercial lines, no insurance policies)', () => {
    const result = calculateAfsScore(stiAfsDataCommercialOnly, CONFIG);
    expect(result!.total).toBeCloseTo(2, 1);
    const commercialLine = result!.lines.find(l => l.code === '2.1');
    expect(commercialLine?.score).toBeCloseTo(2, 1);
  });

  it('AFS = 10/12 (insurance policies only, no commercial lines)', () => {
    const result = calculateAfsScore(stiAfsDataPoliciesOnly, CONFIG);
    expect(result!.total).toBeCloseTo(10, 1);
    const policyLine = result!.lines.find(l => l.code === '2.2');
    expect(policyLine?.score).toBeCloseTo(10, 1);
  });

  it('AFS = 0.333 × N for partial commercial lines (3 of 6 = 1 pt)', () => {
    const result = calculateAfsScore(
      {
        id: '1', clientId: 'om-sti',
        commercialEquipment: true,
        commercialLiability: true,
        commercialProperty: true,
        // agriculture, livestock, other = false → 3 lines
      },
      CONFIG,
    );
    expect(result!.total).toBeCloseTo(1.0, 1); // 3 × 0.333 = 1.0
  });

  it('AFS lines array has 2 entries (Commercial + Policies)', () => {
    const result = calculateAfsScore(stiAfsDataAll6, CONFIG);
    expect(result!.lines).toHaveLength(2);
    expect(result!.lines[0].code).toBe('2.1');
    expect(result!.lines[1].code).toBe('2.2');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Standard ESD (same targets as Others)
// ---------------------------------------------------------------------------

describe('FSC STI — ESD scoring (standard targets)', () => {
  it('SD = 10/10 at standard 2% NPAT', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'om-sti',
        contributions: [
          { id: 'sd1', beneficiary: 'SME', type: 'direct_cost', amount: NPAT * 0.02, category: 'supplier_development' },
        ],
        graduationBonus: false, jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBeCloseTo(10, 1);
  });

  it('ED = 9/9 including stockbroker bonus (same as Others)', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'om-sti',
        contributions: [
          { id: 'ed1', beneficiary: 'SME', type: 'grant', amount: NPAT * 0.01, category: 'enterprise_development' },
        ],
        graduationBonus: true,
        jobsCreatedBonus: true,
        stockbrokerSpend: NPAT * 0.005,
      },
      NPAT,
      CONFIG,
    );
    expect(r.edTotal).toBeCloseTo(9, 1);
    expect(r.stockbrokerBonus).toBeCloseTo(2, 1);
  });
});
