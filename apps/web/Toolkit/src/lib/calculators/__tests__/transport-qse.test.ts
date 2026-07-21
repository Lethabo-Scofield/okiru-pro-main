import { describe, it, expect } from 'vitest';
import { getSectorConfig } from '../../../../../../api/pipeline/sectorConfig';
import { calculateOwnershipScore } from '../ownership';
import { calculateTransportQseManagement, calculateTransportQseEmploymentEquity } from '../transport';
import type { CalculatorConfig } from '../../../../../shared/schema';

function sectorConfigToCalculatorConfig(sc: ReturnType<typeof getSectorConfig>): CalculatorConfig {
  const t = sc.targets || {};
  const own = t.ownership || {};
  const mc = t.managementControl || {};
  const ee = t.employmentEquity || {};
  const sk = t.skills || {};
  const pr = t.procurement || {};
  const esd = t.esd || {};
  const sed = t.sed || {};
  const pc = sc.pillarConfigs || {};
  const pOwn = pc.ownership || {};
  const pMc = pc.managementControl || {};
  const pEe = pc.employmentEquity || { maxPoints: 0 };
  const pSk = pc.skillsDevelopment || {};
  const pPp = pc.preferentialProcurement || {};
  const pEd = pc.enterpriseDevelopment || {};
  const pSed = pc.socioEconomicDevelopment || {};

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
    managementControl: { maxPoints: pMc.maxPoints },
    employmentEquity: { maxPoints: pEe.maxPoints },
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
    // NOTE: this mirrors sectorConfigToTransportQseCalculatorConfig by hand. It
    // is the third hand-rolled copy of that mapping found in this repo, and each
    // one has drifted from production at least once — worth collapsing.
    electiveGroupSizes: sc.electiveGroupSizes,
    pillarConfigs: {
      // Ownership / MC / EE carry the elective group too: Transport QSE elects
      // any four of seven, so none of them is compulsory.
      ownership: { maxPoints: pOwn.maxPoints, chooseOneGroup: pOwn.chooseOneGroup },
      managementControl: { maxPoints: pMc.maxPoints, chooseOneGroup: pMc.chooseOneGroup },
      employmentEquity: { maxPoints: pEe.maxPoints, chooseOneGroup: pEe.chooseOneGroup },
      skillsDevelopment: { maxPoints: pSk.maxPoints, chooseOneGroup: pSk.chooseOneGroup },
      preferentialProcurement: { maxPoints: pPp.maxPoints, chooseOneGroup: pPp.chooseOneGroup },
      enterpriseDevelopment: { maxPoints: pEd.maxPoints, chooseOneGroup: pEd.chooseOneGroup },
      socioEconomicDevelopment: { maxPoints: pSed.maxPoints, chooseOneGroup: pSed.chooseOneGroup },
    },
    benefitFactors: [],
    industryNorms: [],
  };
}

describe('Transport QSE scoring', () => {
  const cfg = sectorConfigToCalculatorConfig(getSectorConfig('TRANSPORT', 'QSE'));

  it('loads a 100-point total: any four of seven elements, 25 each', () => {
    // Was 107 ("82 compulsory + one elective"), which forced Employment Equity
    // into the denominator and allowed only one elective. Certificate 13609
    // (Thandanani Transport) scores 102 → Level 1 with EE at 0.00, which that
    // model cannot produce. See apps/api/__tests__/transportQseScorecard.test.ts.
    expect(cfg.totalMaxPoints).toBe(100);
    expect(cfg.electiveGroupSizes?.transport_qse_elective).toBe(4);

    // Element maxima are unchanged — they carry each element's bonus points, and
    // bonuses are why a certified score can exceed the 100-point target.
    expect(cfg.pillarConfigs?.ownership?.maxPoints).toBe(28);
    expect(cfg.pillarConfigs?.managementControl?.maxPoints).toBe(27);
    expect(cfg.pillarConfigs?.employmentEquity?.maxPoints).toBe(27);

    // No element is compulsory: all seven compete for the four measured slots.
    for (const key of ['ownership', 'managementControl', 'employmentEquity', 'skillsDevelopment'] as const) {
      expect(cfg.pillarConfigs?.[key]?.chooseOneGroup).toBe('transport_qse_elective');
    }
  });

  it('scores 100% black ownership at 28/28 even with companyValue=0', () => {
    const own = calculateOwnershipScore({
      id: '1', clientId: 'c',
      shareholders: [{
        id: '1', name: 'Owner', ownershipType: 'shareholder',
        blackOwnership: 1, blackWomenOwnership: 0.5, shares: 100, shareValue: 1,
        yearsHeld: 5, isDesignatedGroup: false, blackNewEntrant: false,
        votingRightsPercent: 1, economicInterestPercent: 1,
      }],
      companyValue: 0,
      outstandingDebt: 0,
      yearsHeld: 5,
    }, cfg);
    expect(own.total).toBe(28);
  });

  it('scores transport MC and EE with non-zero max', () => {
    const employees = Array.from({ length: 14 }, (_, i) => ({
      id: String(i), name: `E${i}`, gender: (i % 2 ? 'Female' : 'Male') as const,
      race: 'African' as const,
      designation: i < 2 ? 'Executive Director' : i < 5 ? 'Senior' : i < 8 ? 'Middle' : 'Junior',
      isDisabled: false,
    }));
    const mc = calculateTransportQseManagement({ id: '1', clientId: 'c', employees }, cfg);
    const ee = calculateTransportQseEmploymentEquity({ id: '1', clientId: 'c', employees }, cfg, 'Gauteng');
    expect(mc.maxPoints).toBe(27);
    expect(ee.maxPoints).toBe(27);
    expect(mc.score).toBeGreaterThan(0);
    expect(ee.score).toBeGreaterThan(0);
  });
});
