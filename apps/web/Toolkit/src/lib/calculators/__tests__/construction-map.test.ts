import { describe, it, expect } from 'vitest';
import { buildConstructionScoringInput } from '../construction-map';
import { buildConstructionCalculatorConfig } from '../../sectors/construction';
import { calculateConstructionScorecard } from '../../../../../../api/pipeline/constructionScoring';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function baseState(o: any = {}): any {
  return {
    client: {
      sectorCode: 'CONSTRUCTION', scorecardType: 'Generic', constructionSubSector: 'Contractor',
      npat: 10_000_000, leviableAmount: 1_000_000, eapProvince: 'National', ...(o.client ?? {}),
    },
    ownership: { id: '1', clientId: 'c', shareholders: [], companyValue: 10_000_000, outstandingDebt: 0, yearsHeld: 5, ...(o.ownership ?? {}) },
    management: { id: '1', clientId: 'c', employees: [], ...(o.management ?? {}) },
    skills: { id: '1', clientId: 'c', leviableAmount: 1_000_000, trainingPrograms: [], ...(o.skills ?? {}) },
    procurement: { id: '1', clientId: 'c', tmps: 5_000_000, suppliers: [], ...(o.procurement ?? {}) },
    esd: { id: '1', clientId: 'c', contributions: [], ...(o.esd ?? {}) },
    sed: { id: '1', clientId: 'c', contributions: [], ...(o.sed ?? {}) },
  };
}

const FULL_BLACK_SHAREHOLDER = {
  id: 'sh1', name: 'Black Trust', ownershipType: 'shareholder' as const,
  blackOwnership: 1, blackWomenOwnership: 0.5, shares: 100, shareValue: 1,
  votingRightsPercent: 1, economicInterestPercent: 1, isDesignatedGroup: false, blackNewEntrant: false,
};

describe('construction-map — unit conversions + wiring', () => {
  const cfg = buildConstructionCalculatorConfig('construction_contractor');

  it('converts ownership fractions (0–1) to whole-number percent (×100)', () => {
    const { input, entityType } = buildConstructionScoringInput(
      baseState({ ownership: { shareholders: [FULL_BLACK_SHAREHOLDER] } }), cfg,
    );
    expect(entityType).toBe('construction_contractor');
    // 100% black voting → 100 (not 1.0)
    expect(input.indicators.votingRightsBlackPercent).toBeCloseTo(100, 1);
    expect(input.indicators.economicInterestBlackPercent).toBeCloseTo(100, 1);
  });

  it('sources TMPS from procurement.tmps (not client) and leviable/npat from client', () => {
    const { input } = buildConstructionScoringInput(baseState(), cfg);
    expect(input.financials.totalMeasuredProcurementSpend).toBe(5_000_000);
    expect(input.financials.leviableAmount).toBe(1_000_000);
    expect(input.financials.npat).toBe(10_000_000);
  });

  it('Phase 1: ESD/SED beneficiary flags feed the BWO / structured / limited-services indicators', () => {
    const { input } = buildConstructionScoringInput(
      baseState({
        client: { npat: 10_000_000 },
        esd: { contributions: [
          { id: 'sd1', beneficiary: 'BWO Co', type: 'grant', amount: 100_000, category: 'supplier_development', blackBenefitPercent: 100, isBlackWomenOwnedBeneficiary: true },
        ] },
        sed: { contributions: [
          { id: 'se1', beneficiary: 'Community', type: 'grant', amount: 80_000, category: 'socio_economic', blackBenefitPercent: 100, isStructuredProject: true, isLimitedServicesCommunity: true },
        ] },
      }), cfg,
    );
    expect(input.indicators.supplierDevelopmentSpendBWO as number).toBeGreaterThan(0);
    expect(input.indicators.sedStructuredProjectsSpend as number).toBeGreaterThan(0);
    expect(input.indicators.sedLimitedServicesPercent).toBe(100); // 100% of SED to limited-services communities
  });

  it('passes recognised PP / SD / SED spend as RAW ZAR (not a percentage)', () => {
    const { input } = buildConstructionScoringInput(
      baseState({
        procurement: { tmps: 1_000_000, suppliers: [
          { id: 's1', name: 'EMP', beeLevel: 1, enterpriseType: 'generic', blackOwnership: 0.6, blackWomenOwnership: 0, youthOwnership: 0, disabledOwnership: 0, spend: 1_000_000 },
        ] },
        sed: { contributions: [
          { id: 'sed1', beneficiary: 'X', description: 'grant', type: 'grant', amount: 200_000, category: 'socio_economic', blackBenefitPercent: 100, transactionDate: '2025-07-01' },
        ] },
      }), cfg,
    );
    // raw ZAR numerators, not 0–1 or percentages
    expect(input.indicators.ppAllEmpoweringSpend as number).toBeGreaterThan(0);
    expect(input.indicators.sedSpend).toBe(200_000);
  });
});

describe('construction-map — end-to-end scoring via the verified engine', () => {
  it('scores the ownership element for a fully black-owned contractor', () => {
    const cfg = buildConstructionCalculatorConfig('construction_contractor');
    const { entityType, input } = buildConstructionScoringInput(
      baseState({ ownership: { shareholders: [FULL_BLACK_SHAREHOLDER] } }), cfg,
    );
    const out = calculateConstructionScorecard(entityType, input);
    expect(out.sectorCode).toBe('CONSTRUCTION');
    expect(out.elementScores.ownership.achievedPoints).toBeGreaterThan(0);
    // derivable indicators score; new-input ones report missing_data (honest, not wrong)
    expect(out.missingFieldSummary.length).toBeGreaterThan(0);
  });

  it('applies the BEP subSector override (designated groups target 5%, not 10%)', () => {
    const cfg = buildConstructionCalculatorConfig('construction_qse');
    const { entityType, input } = buildConstructionScoringInput(
      baseState({ client: { scorecardType: 'QSE', constructionSubSector: 'BEP' } }), cfg,
    );
    expect(entityType).toBe('construction_qse');
    expect(input.subSector).toBe('BEP');
    const out = calculateConstructionScorecard(entityType, input);
    const dg = out.indicators.find((i) => i.code === 'qse.ownership.designated_groups');
    expect(dg?.target).toBe(5);
  });
});
