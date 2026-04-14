/**
 * Lake Trading Validation — verifies calculateAllPillars against ground truth.
 * Expected: total ~63.5, Level 7, Discounted Level 8
 * Run: npx tsx apps/api/__tests__/accuracy/lakeTradingValidation.ts
 */

import { calculateAllPillars } from '../../pipeline/rules/pillarCalculators.js';
import { RCOGP_GENERIC } from '../../pipeline/sectorConfig.js';

const LAKE_NPAT = 33_862_998;
const LAKE_REVENUE = 274_953_097;
const LAKE_LEVIABLE = 2_069_572;
const LAKE_TMPS = 133_730_345.99;
const LAKE_HEADCOUNT = 12;

const shareholders = [
  {
    name: 'Lake Family Trust',
    blackOwnership: 1,
    blackWomenOwnership: 0.5,
    shares: 100,
    shareValue: 1,
    yearsHeld: 3,
    isDesignatedGroup: false,
    blackNewEntrant: true,
  },
];

const employees = [
  { name: 'Director A', gender: 'Female', race: 'African', designation: 'Board', isDisabled: false, isForeign: false },
  { name: 'Director B', gender: 'Male', race: 'White', designation: 'Board', isDisabled: false, isForeign: false },
  { name: 'Exec A', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { name: 'Exec B', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { name: 'OEM A', gender: 'Male', race: 'White', designation: 'Other Executive Management', isDisabled: false, isForeign: false },
  { name: 'Sen A', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
  { name: 'Sen B', gender: 'Female', race: 'White', designation: 'Senior', isDisabled: false, isForeign: false },
  { name: 'Mid A', gender: 'Female', race: 'African', designation: 'Middle', isDisabled: false, isForeign: false },
  { name: 'Mid B', gender: 'Male', race: 'Indian', designation: 'Middle', isDisabled: false, isForeign: false },
  { name: 'Jun A', gender: 'Male', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { name: 'Jun B', gender: 'Female', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { name: 'Jun C', gender: 'Male', race: 'White', designation: 'Junior', isDisabled: false, isForeign: false },
];

const suppliers = [
  {
    name: 'EME supplier (bulk TMPS)',
    spend: 133_696_348.453,
    beeLevel: 1,
    blackOwnership: 1,
    blackWomenOwnership: 0,
    enterpriseType: 'eme',
    isDesignatedGroup: false,
  },
  {
    name: 'QSE supplier',
    spend: 2_233_217.8945,
    beeLevel: 4,
    blackOwnership: 1,
    blackWomenOwnership: 0,
    enterpriseType: 'qse',
    isDesignatedGroup: false,
  },
];

const contributions = [
  { beneficiary: 'SD beneficiary (EME)', type: 'direct_cost', amount: 250_000, category: 'sd' as const },
  { beneficiary: 'ED beneficiary (EME)', type: 'direct_cost', amount: 160_000, category: 'ed' as const },
  { beneficiary: 'Operation Smile South Africa', type: 'grant', amount: 27_500, category: 'sed' as const },
];

const financials = {
  revenue: LAKE_REVENUE,
  npat: LAKE_NPAT,
  leviableAmount: LAKE_LEVIABLE,
  tmps: LAKE_TMPS,
  headcount: LAKE_HEADCOUNT,
  companyValue: 50_000_000,
  outstandingDebt: 0,
  yearsHeld: 3,
};

const result = calculateAllPillars(RCOGP_GENERIC, {
  employees,
  shareholders,
  suppliers,
  contributions,
  trainingPrograms: [],
  financials,
  province: 'Gauteng',
});

const expected = {
  ownership: 25,
  managementControl: 11.77,
  skillsDevelopment: 0,
  procurement: 20.33,
  supplierDevelopment: 3.69,
  enterpriseDevelopment: 2.36,
  socioEconomicDevelopment: 0.41,
  total: 63.56,
  level: 7,
  discountedLevel: 8,
};

console.log('=== Lake Trading Validation ===\n');
console.log(`Ownership:     ${result.ownership.score} (expected ${expected.ownership})`);
console.log(`MC:            ${result.managementControl.score} (expected ${expected.managementControl})`);
console.log(`Skills:        ${result.skillsDevelopment.score} (expected ${expected.skillsDevelopment})`);
console.log(`Procurement:   ${result.procurement.score} (expected ${expected.procurement})`);
console.log(`SD:            ${result.supplierDevelopment.score} (expected ${expected.supplierDevelopment})`);
console.log(`ED:            ${result.enterpriseDevelopment.score} (expected ${expected.enterpriseDevelopment})`);
console.log(`SED:           ${result.socioEconomicDevelopment.score} (expected ${expected.socioEconomicDevelopment})`);
console.log(`YES:           tier=${result.yesInitiative.tier} boost=${result.yesInitiative.levelBoost} bonus=${result.yesInitiative.bonusPoints}`);
console.log(`\nTotal:         ${result.totalPoints} (expected ${expected.total})`);
console.log(`Level:         ${result.beeLevel} (expected ${expected.level})`);
console.log(`Discounted:    ${result.discountedLevel} (expected ${expected.discountedLevel})`);
console.log(`isDiscounted:  ${result.isDiscounted}`);
console.log(`Recognition:   ${result.recognitionLevel}%`);

const pass = (a: number, b: number, tolerance = 0.5) => Math.abs(a - b) <= tolerance;

const checks = [
  ['Ownership', result.ownership.score, expected.ownership],
  ['MC', result.managementControl.score, expected.managementControl],
  ['Skills', result.skillsDevelopment.score, expected.skillsDevelopment],
  ['Procurement', result.procurement.score, expected.procurement],
  ['SD', result.supplierDevelopment.score, expected.supplierDevelopment],
  ['ED', result.enterpriseDevelopment.score, expected.enterpriseDevelopment],
  ['SED', result.socioEconomicDevelopment.score, expected.socioEconomicDevelopment],
  ['Total', result.totalPoints, expected.total],
] as const;

console.log('\n=== Pass/Fail ===');
let allPassed = true;
for (const [name, actual, exp] of checks) {
  const ok = pass(actual, exp);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name} = ${actual} (expected ${exp}, diff ${(actual - exp).toFixed(2)})`);
  if (!ok) allPassed = false;
}

const levelOk = result.beeLevel === expected.level;
const discOk = result.discountedLevel === expected.discountedLevel;
console.log(`  ${levelOk ? 'PASS' : 'FAIL'}: Level = ${result.beeLevel} (expected ${expected.level})`);
console.log(`  ${discOk ? 'PASS' : 'FAIL'}: Discounted Level = ${result.discountedLevel} (expected ${expected.discountedLevel})`);
if (!levelOk) allPassed = false;
if (!discOk) allPassed = false;

console.log(`\n${allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
process.exit(allPassed ? 0 : 1);
