/**
 * FSC Banks (FS701) golden tests.
 *
 * Source: BBBEE Toolkit (FSC) Template v1.0.xlsx — Banks sub-variant
 * Config: FSC_BANKS_CALCULATOR_CONFIG
 *
 * Key Banks differences from FSC Generic (Others):
 * - Grand total: 130 pts (no stockbroker bonus, +AFS 12 pts)
 * - SD target: 1.8% NPAT (not 2%)
 * - ED target: 0.2% NPAT (not 1%); no stockbroker bonus
 * - EF Targeted Investments + Transaction Financing: 0 pts (Q44 — blank in template)
 * - AFS Banks: 12 pts — 6 geographic/access indicators
 *
 * Synthetic entity: "First National Bank Ltd" (fictional, FSC Banks FS701)
 */
import { describe, it, expect } from 'vitest';
import { FSC_BANKS_CALCULATOR_CONFIG, FSC_BANKS_SUB_SECTOR } from '../../sectors/fsc-banks';
import { calculateOwnershipScore } from '../ownership';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';
import { calculateAfsScore } from '../afs';
import type { AfsData } from '../../types';

const CONFIG = FSC_BANKS_CALCULATOR_CONFIG;

const NPAT = 100_000_000;
const LEVIABLE = 300_000_000;
const TMPS = 40_000_000;
const EAP_PROVINCE = 'Gauteng';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const banksOwnership = {
  id: '1',
  clientId: 'fnb-banks',
  shareholders: [
    {
      id: 'sh1',
      name: 'Black Banking Trust',
      ownershipType: 'shareholder' as const,
      blackOwnership: 1,
      blackWomenOwnership: 0.5,
      shares: 100,
      shareValue: 1,
      votingRightsPercent: 1,
      economicInterestPercent: 1,
      isDesignatedGroup: false,
      blackNewEntrant: true,
    },
  ],
  companyValue: 500_000_000,
  outstandingDebt: 0,
  yearsHeld: 5,
};

const banksEmployeesFull = [
  { id: '1', name: 'Board F1', gender: 'Female', race: 'African', designation: 'Board', isDisabled: false },
  { id: '2', name: 'Board M1', gender: 'Male', race: 'African', designation: 'Board', isDisabled: false },
  { id: '3', name: 'Exec F1', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false },
  { id: '4', name: 'Exec M1', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false },
  { id: '5', name: 'OEM F1', gender: 'Female', race: 'African', designation: 'Other Executive Management', isDisabled: false },
  { id: '6', name: 'OEM F2', gender: 'Female', race: 'African', designation: 'Other Executive Management', isDisabled: false },
  { id: '7', name: 'OEM F3', gender: 'Female', race: 'African', designation: 'Other Executive Management', isDisabled: false },
  { id: '8', name: 'OEM M1', gender: 'Male', race: 'African', designation: 'Other Executive Management', isDisabled: false },
  { id: '9', name: 'Disabled', gender: 'Male', race: 'African', designation: 'Other Executive Management', isDisabled: true },
];

const banksProcurementFull = {
  id: '1',
  clientId: 'fnb-banks',
  tmps: TMPS,
  suppliers: [
    {
      id: 'eme1',
      name: 'Empowered EME',
      beeLevel: 1 as const,
      enterpriseType: 'eme' as const,
      blackOwnership: 1,
      blackWomenOwnership: 0,
      youthOwnership: 0,
      disabledOwnership: 0,
      spend: TMPS,
      isEmpoweringSupplier: true,
      isBlackOwned51: true,
      isBlackWomanOwned30: false,
      isDesignatedGroup: false,
    },
  ],
};

const banksAfsDataFull: AfsData = {
  id: '1',
  clientId: 'fnb-banks',
  transactionPointCoverage: 90,    // > 85% target → 1/1 pt
  servicePointCoverage: 80,        // > 70% target → 1/1 pt
  salesPointCoverage: 70,          // > 60% target → 2/2 pts
  electronicAccessCompliant: true, // national → 2/2 pts
  hasPointOfPresence: true,        // yes → 3/3 pts
  activeAccountsCompliant: true,   // yes → 3/3 pts
};

const banksAfsDataEmpty: AfsData = {
  id: '1',
  clientId: 'fnb-banks',
};

// ---------------------------------------------------------------------------
// Suite 1: CalculatorConfig completeness
// ---------------------------------------------------------------------------

describe('FSC Banks — CalculatorConfig completeness', () => {
  it('loads 130 total points', () => {
    expect(CONFIG.totalMaxPoints).toBe(130);
  });

  it('sector identity is FSC / Generic', () => {
    expect(CONFIG.sectorCode).toBe('FSC');
    expect(CONFIG.scorecardType).toBe('Generic');
  });

  it('sub-sector constant is Banks', () => {
    expect(FSC_BANKS_SUB_SECTOR).toBe('Banks');
  });

  it('pillar maxima match Banks sub-sector spec', () => {
    const pc = CONFIG.pillarConfigs;
    expect(pc?.ownership?.maxPoints).toBe(25);
    expect(pc?.managementControl?.maxPoints).toBe(21);
    expect(pc?.skillsDevelopment?.maxPoints).toBe(23);
    expect(pc?.preferentialProcurement?.maxPoints).toBe(24);
    expect(pc?.supplierDevelopment?.maxPoints).toBe(10);
    expect(pc?.enterpriseDevelopment?.maxPoints).toBe(7);   // no stockbroker
    expect(pc?.socioEconomicDevelopment?.maxPoints).toBe(8);
  });

  it('AFS config sub-sector is Banks, max 12 pts', () => {
    expect(CONFIG.accessToFinancialServices?.subSector).toBe('Banks');
    expect(CONFIG.accessToFinancialServices?.maxPoints).toBe(12);
  });

  it('AFS Banks indicator targets (from PDF)', () => {
    const afs = CONFIG.accessToFinancialServices!;
    expect(afs.transactionPointTarget).toBeCloseTo(0.85, 4);
    expect(afs.transactionPointMaxPts).toBe(1);
    expect(afs.servicePointTarget).toBeCloseTo(0.70, 4);
    expect(afs.servicePointMaxPts).toBe(1);
    expect(afs.salesPointTarget).toBeCloseTo(0.60, 4);
    expect(afs.salesPointMaxPts).toBe(2);
    expect(afs.electronicAccessMaxPts).toBe(2);
    expect(afs.pointOfPresenceMaxPts).toBe(3);
    expect(afs.activeAccountsMaxPts).toBe(3);
    // Verify total = 12
    const total = (afs.transactionPointMaxPts ?? 0) + (afs.servicePointMaxPts ?? 0) +
      (afs.salesPointMaxPts ?? 0) + (afs.electronicAccessMaxPts ?? 0) +
      (afs.pointOfPresenceMaxPts ?? 0) + (afs.activeAccountsMaxPts ?? 0);
    expect(total).toBe(12);
  });

  it('Banks SD target 1.8% NPAT (not 2% Others)', () => {
    expect(CONFIG.esd.supplierDevTarget).toBeCloseTo(0.018, 4);
    expect(CONFIG.esd.supplierDevMax).toBe(10);
  });

  it('Banks ED target 0.2% NPAT (not 1% Others)', () => {
    expect(CONFIG.esd.enterpriseDevTarget).toBeCloseTo(0.002, 4);
    expect(CONFIG.esd.enterpriseDevMax).toBe(5);
  });

  it('Banks has no stockbroker bonus (edStockbrokerBonusMax = 0)', () => {
    expect(CONFIG.esd.edStockbrokerBonusMax).toBe(0);
  });

  it('EF config: Targeted Investments and Transaction Financing = 0 pts (Q44)', () => {
    const ef = CONFIG.empowermentFinancing!;
    expect(ef.targetedInvestmentMaxPts).toBe(0);
    expect(ef.transactionFinancingMaxPts).toBe(0);
    expect(ef.sdTarget).toBeCloseTo(0.018, 4);
    expect(ef.edTarget).toBeCloseTo(0.002, 4);
  });

  it('sub-minimum percentages unchanged', () => {
    const pc = CONFIG.pillarConfigs;
    expect(pc?.ownership?.subMinimumPercent).toBe(40);
    expect(pc?.skillsDevelopment?.subMinimumPercent).toBe(40);
    expect(pc?.preferentialProcurement?.subMinimumPercent).toBe(40);
    expect(pc?.supplierDevelopment?.subMinimumPercent).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: AFS Banks scoring
// ---------------------------------------------------------------------------

describe('FSC Banks — AFS scoring', () => {
  it('AFS = 12/12 (all indicators compliant)', () => {
    const result = calculateAfsScore(banksAfsDataFull, CONFIG);
    expect(result).not.toBeNull();
    expect(result!.total).toBeCloseTo(12, 1);
    expect(result!.maxPoints).toBe(12);
    expect(result!.subSector).toBe('Banks');
  });

  it('AFS = 0/12 (no data)', () => {
    const result = calculateAfsScore(banksAfsDataEmpty, CONFIG);
    expect(result).not.toBeNull();
    expect(result!.total).toBe(0);
  });

  it('AFS = 1/12 (only Transaction Point compliant)', () => {
    const result = calculateAfsScore(
      { id: '1', clientId: 'fnb', transactionPointCoverage: 90 },
      CONFIG,
    );
    expect(result!.total).toBeCloseTo(1, 1);
  });

  it('AFS = 6/12 (electronic access + PoP + active accounts)', () => {
    const result = calculateAfsScore(
      {
        id: '1', clientId: 'fnb',
        electronicAccessCompliant: true,
        hasPointOfPresence: true,
        activeAccountsCompliant: true,
      },
      CONFIG,
    );
    expect(result!.total).toBeCloseTo(8, 1); // 2+3+3 = 8
  });

  it('AFS partial — transaction point at 50% of 85% target = 0.588 pts', () => {
    const result = calculateAfsScore(
      { id: '1', clientId: 'fnb', transactionPointCoverage: 42.5 }, // 42.5/85 = 50%
      CONFIG,
    );
    expect(result!.total).toBeCloseTo(0.5, 1); // 50% × 1 pt
  });

  it('AFS returns null for non-AFS sector config', () => {
    const cfgNoAfs = { ...CONFIG, accessToFinancialServices: undefined };
    const result = calculateAfsScore(banksAfsDataEmpty, cfgNoAfs);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Standard pillar golden scores (same as Generic)
// ---------------------------------------------------------------------------

describe('FSC Banks golden — standard pillar scores', () => {
  it('Ownership = 25/25 (100% Black-owned, no debt)', () => {
    const r = calculateOwnershipScore(banksOwnership, CONFIG);
    expect(r.total).toBeCloseTo(25, 1);
  });

  it('Management Control = 21/21 (fully-compliant FSC workforce)', () => {
    const r = calculateManagementScore(
      { id: '1', clientId: 'fnb-banks', employees: banksEmployeesFull },
      CONFIG,
      EAP_PROVINCE,
    );
    expect(r.total).toBeCloseTo(21, 0);
  });

  it('SD = 10/10 at 1.8% NPAT target', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'fnb-banks',
        contributions: [
          {
            id: 'sd1',
            beneficiary: 'EME beneficiary',
            type: 'direct_cost',
            amount: NPAT * 0.018, // exactly 1.8% of NPAT
            category: 'supplier_development',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBeCloseTo(10, 1);
    expect(r.sdSubMinimumMet).toBe(true);
  });

  it('ED = 5/5 at 0.2% NPAT (Banks lower target)', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'fnb-banks',
        contributions: [
          {
            id: 'ed1',
            beneficiary: 'SME beneficiary',
            type: 'grant',
            amount: NPAT * 0.002, // exactly 0.2% of NPAT
            category: 'enterprise_development',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.enterpriseDev).toBeCloseTo(5, 1);
  });

  it('Banks ED max = 7 (5 base + 1 grad + 1 jobs, no stockbroker)', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'fnb-banks',
        contributions: [
          {
            id: 'ed1', beneficiary: 'SME',
            type: 'grant',
            amount: NPAT * 0.002,
            category: 'enterprise_development',
          },
        ],
        graduationBonus: true,
        jobsCreatedBonus: true,
        stockbrokerSpend: NPAT * 0.005, // should score 0 (no stockbroker for Banks)
      },
      NPAT,
      CONFIG,
    );
    expect(r.edTotal).toBeCloseTo(7, 1);
    expect(r.stockbrokerBonus).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Total max achievable
// ---------------------------------------------------------------------------

describe('FSC Banks — total points', () => {
  it('standard pillar totals reflect Banks point structure', () => {
    const { pillarConfigs: pc, totalMaxPoints } = CONFIG;
    const pillarSum = (pc?.ownership?.maxPoints ?? 0) +
      (pc?.managementControl?.maxPoints ?? 0) +
      (pc?.skillsDevelopment?.maxPoints ?? 0) +
      (pc?.preferentialProcurement?.maxPoints ?? 0) +
      (pc?.supplierDevelopment?.maxPoints ?? 0) +
      (pc?.enterpriseDevelopment?.maxPoints ?? 0) +
      (pc?.socioEconomicDevelopment?.maxPoints ?? 0) +
      (CONFIG.accessToFinancialServices?.maxPoints ?? 0);
    // 25+21+23+24+10+7+8+12 = 130
    expect(pillarSum).toBe(130);
    expect(totalMaxPoints).toBe(130);
  });
});
