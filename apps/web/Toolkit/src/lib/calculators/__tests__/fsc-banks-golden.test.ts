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
  it('loads 140 total points (incl. EF 15; template: core F12=121, C104=138)', () => {
    // 25+21+23+24+7(SD)+5(ED)+15(EF)+12(AFS)+8 = 140
    expect(CONFIG.totalMaxPoints).toBe(132); // gazette shapes (audit items 7-9)
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
    expect(pc?.ownership?.maxPoints).toBe(23); // gazette shapes (audit items 7-9)
    expect(pc?.managementControl?.maxPoints).toBe(20); // gazette shapes (audit items 7-9)
    expect(pc?.skillsDevelopment?.maxPoints).toBe(23);
    expect(pc?.preferentialProcurement?.maxPoints).toBe(19); // gazette shapes (audit items 7-9)
    // EF & ESD Scorecard - Banks: SD row C17 = 7 pts, ED base C19 = 3 (+1 grad
    // +1 jobs = 5). The old 10/7 were the Others ESD-scorecard maxima.
    expect(pc?.supplierDevelopment?.maxPoints).toBe(7);
    expect(pc?.enterpriseDevelopment?.maxPoints).toBe(5);   // no stockbroker
    expect((pc as any)?.empowermentFinancing?.maxPoints).toBe(15);
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
    expect(CONFIG.esd.supplierDevMax).toBe(7); // EF & ESD - Banks C17
  });

  it('Banks ED target 0.2% NPAT (not 1% Others)', () => {
    expect(CONFIG.esd.enterpriseDevTarget).toBeCloseTo(0.002, 4);
    expect(CONFIG.esd.enterpriseDevMax).toBe(3); // EF & ESD - Banks C19 (3 base)
  });

  it('Banks has no stockbroker bonus (edStockbrokerBonusMax = 0)', () => {
    expect(CONFIG.esd.edStockbrokerBonusMax).toBe(0);
  });

  it('EF config: Targeted Investments 12 + Transaction Financing 3 (Q44 resolved from Banks sheet)', () => {
    // EF & ESD Scorecard - Banks C14 =IF(D7="Banks",12,0) / C15 =IF(...,3,0)
    // (FSC_Generic.md L15893/L15903). The old 0s were the template's
    // default-"Others" formula artifact.
    const ef = CONFIG.empowermentFinancing!;
    expect(ef.targetedInvestmentMaxPts).toBe(12);
    expect(ef.transactionFinancingMaxPts).toBe(3);
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
  it('Ownership = 20/23 (100% Black-owned, no debt; per-indicator, gazette 23-pt shape)', () => {
    const r = calculateOwnershipScore(banksOwnership, CONFIG);
    expect(r.total).toBeCloseTo(20, 1); // gazette shapes (audit items 7-9)
  });

  it('Management Control = 20/20 (fully-compliant FSC workforce; board black = 1 pt)', () => {
    const r = calculateManagementScore(
      { id: '1', clientId: 'fnb-banks', employees: banksEmployeesFull },
      CONFIG,
      EAP_PROVINCE,
    );
    expect(r.total).toBeCloseTo(20, 0); // gazette shapes (audit items 7-9)
  });

  it('SD = 7/7 at 1.8% NPAT target (EF & ESD - Banks C17)', () => {
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
    expect(r.supplierDev).toBeCloseTo(7, 1); // SD max 7 (EF & ESD - Banks C17)
    expect(r.sdSubMinimumMet).toBe(true);
  });

  it('ED = 3/3 at 0.2% NPAT (EF & ESD - Banks C19: 3 base)', () => {
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
    expect(r.enterpriseDev).toBeCloseTo(3, 1); // ED base 3 (C19)
  });

  it('Banks ED max = 5 (3 base + 1 grad + 1 jobs, no stockbroker)', () => {
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
    expect(r.edTotal).toBeCloseTo(5, 1); // 3 base + 1 grad + 1 jobs
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
      (CONFIG.accessToFinancialServices?.maxPoints ?? 0) +
      ((pc as any)?.empowermentFinancing?.maxPoints ?? 0);
    // 25+21+23+24+7+5+8+12+15(EF) = 140 (template: EF 12+3, SD 7, ED 3+1+1)
    expect(pillarSum).toBe(132); // gazette shapes (audit items 7-9)
    expect(totalMaxPoints).toBe(132); // gazette shapes (audit items 7-9)
  });
});
