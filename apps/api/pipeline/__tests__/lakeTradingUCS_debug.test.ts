import { describe, it, expect } from 'vitest';
import { calculateScorecard } from '../rules/calculationEngine.js';

it('dump UCS result for Lake Trading', async () => {
  const result = await calculateScorecard({
    assessmentId: 'debug',
    sectorCode: 'RCOGP',
    scorecardType: 'Generic',
    entityValues: new Map(),
    crossPillarValues: new Map([
      ['npat', 33_862_998],
      ['tmps', 133_730_345.99],
      ['leviableAmount', 2_069_572],
      ['totalEmployees', 12],
    ]),
    employees: [
      { name: 'Director A', gender: 'Female', race: 'African', designation: 'Board', isDisabled: false },
      { name: 'Director B', gender: 'Male', race: 'White', designation: 'Board', isDisabled: false },
      { name: 'Exec A', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false },
      { name: 'Exec B', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false },
      { name: 'OEM A', gender: 'Male', race: 'White', designation: 'Other Executive Management', isDisabled: false },
      { name: 'Sen A', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false },
      { name: 'Sen B', gender: 'Female', race: 'White', designation: 'Senior', isDisabled: false },
      { name: 'Mid A', gender: 'Female', race: 'African', designation: 'Middle', isDisabled: false },
      { name: 'Mid B', gender: 'Male', race: 'Indian', designation: 'Middle', isDisabled: false },
      { name: 'Jun A', gender: 'Male', race: 'African', designation: 'Junior', isDisabled: false },
      { name: 'Jun B', gender: 'Female', race: 'African', designation: 'Junior', isDisabled: false },
      { name: 'Jun C', gender: 'Male', race: 'White', designation: 'Junior', isDisabled: false },
    ],
    shareholders: [{
      name: 'Lake Family Trust',
      blackOwnership: 1.0,
      blackWomenOwnership: 0.5,
      shares: 100,
      shareValue: 1,
      yearsHeld: 3,
      isDesignatedGroup: true,
      blackNewEntrant: true,
    }],
    suppliers: [
      { name: 'EME Bulk', spend: 133_696_348.453, beeLevel: 1, blackOwnership: 1.0, blackWomenOwnership: 0, enterpriseType: 'eme', isEME: true, isBlackOwned51: true },
      { name: 'QSE Small', spend: 2_233_217.8945, beeLevel: 4, blackOwnership: 1.0, blackWomenOwnership: 0, enterpriseType: 'qse', isQSE: true, isBlackOwned51: true },
    ],
    contributions: [
      { beneficiary: 'SD', type: 'direct_cost', amount: 250_000, category: 'sd' as const },
      { beneficiary: 'ED', type: 'direct_cost', amount: 160_000, category: 'ed' as const },
      { beneficiary: 'SED', type: 'grant', amount: 27_500, category: 'sed' as const },
    ],
    financials: { revenue: 274_953_097, npat: 33_862_998, leviableAmount: 2_069_572, tmps: 133_730_345.99, headcount: 12 },
    province: 'Gauteng',
  });

  console.log('=== PILLAR CODES ===');
  for (const p of result.pillars) {
    console.log(`  ${p.pillarCode}: ${p.points}/${p.maxPoints} (${p.criteria.length} criteria)`);
    for (const c of p.criteria) {
      console.log(`    ${c.criterionCode}: ${c.points}/${c.maxPoints} formula=${c.formulaId} inputs=${JSON.stringify(c.inputs)}`);
    }
  }
  console.log('=== SUB-MINIMUMS ===', JSON.stringify(result.subMinimums));
  console.log('=== TOTAL ===', result.totalPoints, '/', result.maxPoints, 'Level:', result.beeLevel);
  console.log('=== VALIDATION ===', JSON.stringify(result.validation));

  expect(true).toBe(true);
});
