/**
 * Construction Phase-1 template columns: the importer/form now collect
 * construction-only fields (professional registration, youth, industry-body
 * registration, learner management level, mentorship, supplier-dev programme).
 * This proves buildConstructionScoringInput derives the previously-missing
 * indicators when the data IS present — and leaves them missing (no fabrication)
 * when it isn't.
 */
import { describe, it, expect } from 'vitest';
import { buildConstructionCalculatorConfig } from '../../sectors/construction';
import { buildConstructionScoringInput } from '../construction-map';

const CFG = buildConstructionCalculatorConfig('construction_contractor');

function state(opts: { withColumns: boolean }) {
  const cols = opts.withColumns;
  return {
    client: { sectorCode: 'CONSTRUCTION', scorecardType: 'Generic', constructionSubSector: 'Contractor', npat: 4e6, leviableAmount: 2e6, eapProvince: 'National' },
    ownership: { shareholders: [{ race: 'African', gender: 'Female', votingRights: 60, economicInterest: 60, blackNewEntrant: true, blackOwnership: 1 }], companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 },
    management: {
      employees: [
        { race: 'African', gender: 'Female', designation: 'Senior', ...(cols ? { professionallyRegistered: true, isYouthEmployee: true } : {}) },
        { race: 'African', gender: 'Male', designation: 'Junior', ...(cols ? { professionallyRegistered: true, isYouthEmployee: false } : {}) },
      ],
    },
    skills: {
      leviableAmount: 2e6,
      trainingPrograms: [
        { race: 'African', gender: 'Female', categoryCode: 'C', courseCost: 50000, isBlack: true, ...(cols ? { industryRegistered: true, learnerMgmtLevel: 'Senior', mentorship: true, mentorshipPromotion: true } : {}) },
        { race: 'African', gender: 'Male', categoryCode: 'D', courseCost: 30000, isBlack: true, ...(cols ? { industryRegistered: false, learnerMgmtLevel: 'Junior', mentorship: true, mentorshipPromotion: false } : {}) },
      ],
    },
    procurement: { tmps: 1e7, suppliers: [{ blackWomenOwnership: 0.6, blackOwnership: 1, beeLevel: 1, enterpriseType: 'eme', spend: 2e6 }] },
    esd: { contributions: [{ category: 'supplier_development', amount: 120000, ...(cols ? { supplierDevProgramme: true } : {}) }] },
    sed: { contributions: [] },
  };
}

describe('Construction Phase-1 template columns', () => {
  it('derives the construction-only indicators when the workbook carries the data', () => {
    const { input } = buildConstructionScoringInput(state({ withColumns: true }), CFG);
    const i = input.indicators;
    expect(i.blackProfessionalsPercent).toBeCloseTo(100);
    expect(i.professionalRegistrationPercent).toBeCloseTo(100);
    expect(i.blackYouthPercent).toBeCloseTo(50);
    expect(i.skillsIndustryCandidatesPercent).toBeCloseTo(50);
    expect(i.skillsBlackMgmtExecSeniorMiddlePercent).toBeCloseTo(62.5);
    expect(i.skillsBlackMgmtJuniorPercent).toBeCloseTo(37.5);
    expect(i.mentorshipProgrammeImplemented).toBe(true);
    expect(i.mentorshipPromotionPercent).toBeCloseTo(50);
    expect(i.supplierContractorDevProgrammeImplemented).toBe(true);
  });

  it('leaves the indicators missing (no fabrication) when the columns are absent', () => {
    const { input } = buildConstructionScoringInput(state({ withColumns: false }), CFG);
    const i = input.indicators;
    // Evidence flags absent → omitted (engine reports missing → 0), never forced true.
    expect(i.mentorshipProgrammeImplemented).toBeUndefined();
    expect(i.supplierContractorDevProgrammeImplemented).toBeUndefined();
    // Count-based percentages with no qualifying rows → 0, not fabricated.
    expect(i.blackProfessionalsPercent ?? 0).toBe(0);
    expect(i.blackYouthPercent ?? 0).toBe(0);
  });
});
