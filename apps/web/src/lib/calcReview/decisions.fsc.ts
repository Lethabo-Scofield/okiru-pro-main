/**
 * The rulings the Calculation Review asks for on the four FSC scorecards, from
 * the parity findings for the Empower FSC toolkit (template v1.0). Written for
 * a verification professional: no code, no file names, no cell addresses.
 *
 * The four scorecards are variants of one workbook, so a fault in a sheet they
 * share is one fault: its ruling is the same entry (and the same note thread)
 * on every scorecard it touches. Rulings for one variant only carry their own.
 */
import type { ReviewDecision } from './decisions';

const ALL_FOUR = 'All four FSC scorecards (one toolkit): one ruling covers all four.';
const BANKS_AND_INSURERS = 'Banks, long-term and short-term insurers: one ruling covers all three.';
const BANKS_AND_LTI = 'Banks and long-term insurers: one ruling covers both.';
const OTHERS_AND_STI = 'Others and short-term insurers: one ruling covers both.';

const SHARED_BEFORE_PP_SUB_MINIMUM: ReviewDecision[] = [
  {
    id: 'fsc-skills-within-year',
    element: 'Skills development',
    title: 'The "within the financial year" test moves down the page',
    kind: 'toolkit-fault',
    toolkit:
      'Each training row is compared with a date cell that moves one row down for every row of the register, so the 6th, 13th and 25th training rows meet a text label and drop out of every skills sum, and other rows are compared with unrelated dates. Every test company with six or more training rows lost at least one.',
    okiru: 'Counts every training row in the year.',
    question: 'Confirm every training row in the measurement year counts.',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-skills-leviable-headcount',
    element: 'Skills development',
    title: 'The leviable amount and headcount are another company\'s',
    kind: 'toolkit-fault',
    toolkit:
      'The skills sheet\'s leviable amount (R6,531,144,233) and headcount (14,212) are typed values in locked cells on a password-protected sheet, not linked to the company\'s own figures. The unemployed, disabled and learnership lines measure against them.',
    okiru: 'Uses the company\'s own leviable amount (the larger of the skills levy × 100 and payroll) and its own headcount.',
    question: 'Confirm these lines are measured against the measured entity\'s own leviable amount and headcount.',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-skills-workforce-shares',
    element: 'Skills development',
    title: 'The workforce shares are typed in',
    kind: 'toolkit-fault',
    toolkit:
      'The training manager\'s salary and training overhead are shared out by an "auto generated" workforce row that holds typed figures from another workforce.',
    okiru: 'Works out the same shares from the company\'s own management control register.',
    question: 'Confirm these costs are shared by the measured entity\'s own workforce.',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-pp-recognised-spend',
    element: 'Preferential procurement',
    title: 'Recognised spend has no formula',
    kind: 'toolkit-fault',
    toolkit: 'The procurement register\'s recognised spend (spend after the supplier\'s B-BBEE recognition level) is a typed number in the template, not a formula.',
    okiru: 'Works it out: spend × the recognition of the supplier\'s level.',
    question: 'Confirm recognised spend is the spend times the recognition level.',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-pp-first-time-supplier',
    element: 'Preferential procurement',
    title: 'First-time suppliers never earn the 1.2 factor',
    kind: 'toolkit-fault',
    toolkit: 'The recognition test falls back to the 3-year-contract answer instead of the first-time-supplier answer, so a first-time black-owned QSE or EME supplier never earns the 1.2 factor on that ground.',
    okiru: 'Reads the first-time answer.',
    question: 'Confirm a first-time, 51% black-owned QSE or EME supplier earns the 1.2 factor.',
    appliesTo: ALL_FOUR,
  },
];

/**
 * Banks and long-term insurers have no procurement sub-minimum: empowerment
 * financing is the priority element in its place, and the toolkit tests that
 * one correctly (as Okiru does), so this ruling is not theirs.
 */
const PP_SUB_MINIMUM: ReviewDecision = {
  id: 'fsc-pp-sub-minimum',
  element: 'Preferential procurement',
  title: 'The procurement sub-minimum can never fail',
  kind: 'toolkit-fault',
  toolkit: 'The discount test takes 40% of empty cells, so procurement always passes as a priority element.',
  okiru: 'Tests 40% of the five base procurement lines: 8 of their 20 points.',
  question: 'Confirm procurement is tested at 40% of its base lines.',
  appliesTo: OTHERS_AND_STI,
};

const SHARED_AFTER_PP_SUB_MINIMUM: ReviewDecision[] = [
  {
    id: 'fsc-ownership-debt-netting',
    element: 'Ownership',
    title: 'Acquisition debt is netted by row order and ignores the black share',
    kind: 'toolkit-fault',
    toolkit:
      'The first indebted shareholder uses the 40% rule, the rows below a different formula; every row credits the whole stake as black, and a non-black holder\'s debt is netted as a negative stake. The same fault as on RCOGP Generic.',
    okiru: 'Nets every black holder by the first row\'s rule, for the black share of the stake only.',
    question: 'Which rule does Empower use when there are two or more shareholders with acquisition debt?',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-ownership-old-loans',
    element: 'Ownership',
    title: 'A loan in its tenth year or later scores no net value',
    kind: 'toolkit-fault',
    toolkit: 'The graduation table stops at year 9 (100%); the lookup finds nothing for a later year, and that stake\'s net value becomes 0.',
    okiru: 'Reads 100% from year 9 on.',
    question: 'Confirm a loan past its ninth year is fully graduated.',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-mc-disabled-non-executives',
    element: 'Management control',
    title: 'Employees with disabilities include non-executive directors',
    kind: 'toolkit-fault',
    toolkit: 'The count of black people with disabilities includes non-executive directors, while the employee count it divides by leaves them out.',
    okiru: 'Counts employees only, on both sides.',
    question: 'Confirm non-executive directors are left out of this line.',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-mc-combined-band',
    element: 'Management control',
    title: 'A combined executive and senior band with middle or junior managers but no senior manager loses 4 points',
    kind: 'judgment',
    toolkit:
      'When the entity does not distinguish other executives from senior management, employs no senior manager and does employ middle or junior managers, the other-executive band falls back to its own points and the senior band\'s 4 points go to no band. Management control is then out of 17 instead of 21, and the level thresholds scale to 4 fewer base points. With no middle or junior manager either, nothing is lost: the toolkit moves the senior, middle and junior bands\' points to other executive management (10 points for black and 4 for black women) and management control stays out of 21.',
    okiru: 'Follows the toolkit; two test companies hit this and both match its 17-point management control.',
    question: 'What split of the 14 management points is intended when no senior manager is employed but middle or junior managers are?',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-sd-minority-investment',
    element: 'Supplier development',
    title: 'A supplier development minority investment counts nothing',
    kind: 'toolkit-fault',
    toolkit: 'The benefit-factor lookup meets a duplicated "Minority Investment" row with no factor before the 70% row (the enterprise development copy reads 70%). The same fault as on RCOGP Generic.',
    okiru: 'Recognises it at 70%.',
    question: 'Confirm a supplier development minority investment is recognised at 70%.',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-sed-additional-consumer-education',
    element: 'Socio-economic development and consumer education',
    title: 'Additional consumer education is measured above the wrong target',
    kind: 'toolkit-fault',
    toolkit: 'The bonus counts consumer-education spend above the socio-economic development target (0.6% of NPAT) instead of above the consumer-education target (0.4%).',
    okiru: 'Counts spend above the consumer-education target.',
    question: 'Confirm additional consumer education is spend above the 0.4% consumer-education target.',
    appliesTo: ALL_FOUR,
  },
  {
    id: 'fsc-level-on-threshold',
    element: 'Levels',
    title: 'A total exactly on a threshold',
    kind: 'toolkit-fault',
    toolkit: 'The level lookup uses "less than", so a total exactly on a threshold drops a level. The same fault as on RCOGP Generic.',
    okiru: 'A total exactly on a threshold earns that level.',
    question: 'Confirm how Empower treats a total that lands exactly on a threshold.',
    appliesTo: ALL_FOUR,
  },
];

const OWNERSHIP_BONUS_NEGATIVE: ReviewDecision = {
  id: 'fsc-ownership-bonus-negative',
  element: 'Ownership',
  title: 'The voting-rights-above-15% bonus goes negative',
  kind: 'toolkit-fault',
  toolkit: '"Direct or indirect ownership in excess of 15%" is black voting rights less 15%, against 10%, so black voting rights below 15% give negative points.',
  okiru: 'Floors the bonus at 0.',
  question: 'Confirm the bonus cannot score below 0.',
  appliesTo: BANKS_AND_INSURERS,
};

const NET_VALUE_CAP: ReviewDecision = {
  id: 'fsc-net-value-cap',
  element: 'Ownership',
  title: 'Net value can score 8 points on a 6-point line',
  kind: 'toolkit-fault',
  toolkit:
    'For banks and insurers the net value line is weighted 6 points, but the formulas that score it, and both of its methods (graduated and plain), are capped and scaled by a hard-coded 8. Excel showed net value 8 of 6 on seven of eleven bank and insurer test companies, adding up to 2 points to the grand total.',
  okiru: 'Scores the line, and both methods, against its own weighting: at most 6. Others (weighted 8) is unaffected.',
  question: 'Is net value for banks and insurers capped at the line\'s 6 points, as Okiru scores it, or at 8 as the toolkit\'s formulas do?',
  appliesTo: BANKS_AND_INSURERS,
};

const ESD_PERIOD: ReviewDecision = {
  id: 'fsc-ef-esd-period',
  element: 'Enterprise and supplier development',
  title: 'Development spend disappears without transaction financing',
  kind: 'toolkit-fault',
  toolkit:
    'The empowerment financing and ESD scorecard takes its "current year" date from the transaction-financing rows, and filters the supplier development, enterprise development, graduation, jobs and (long-term insurers) stock-broker lines by it. An institution that recorded no transaction financing in the period scores 0 on all of them, however much it spent.',
  okiru: 'Reads the development rows in their own period, as the ESD scorecard does.',
  question: 'Confirm development spend is read in its own measurement period.',
  appliesTo: BANKS_AND_LTI,
};

const BAD_DEBTS: ReviewDecision = {
  id: 'fsc-bad-debts',
  element: 'Enterprise and supplier development',
  title: 'Bad debts written off on development financing count at 100%',
  kind: 'judgment',
  toolkit: 'Bad debts written off on enterprise and supplier development financing are recognised at 100%.',
  codes: 'The Code limits this to a maximum of 50% of the non-recoverable target for banks and life offices.',
  okiru: 'Follows the toolkit: 100%.',
  question: 'Should bad debts written off be recognised in full, or capped as the Code says?',
  appliesTo: BANKS_AND_LTI,
};

const BANKS_ONLY: ReviewDecision[] = [
  {
    id: 'fsc-banks-electronic-access',
    element: 'Access to financial services',
    title: 'Electronic access and active accounts have no target',
    kind: 'judgment',
    toolkit: 'The banks\' access sheet has no target for electronic access or for active accounts, so both score 0 whatever is entered.',
    okiru: 'Has no target to score them against either; they score only on a stated compliance answer, which the toolkit does not collect.',
    question: 'What targets should electronic access and active accounts be measured against?',
  },
];

const LTI_ONLY: ReviewDecision[] = [
  {
    id: 'fsc-lti-transaction-financing-target',
    element: 'Empowerment financing',
    title: 'Transaction financing is measured against the wrong target',
    kind: 'toolkit-fault',
    toolkit: 'The long-term insurers\' transaction-financing line divides by the targeted-investment portion instead of the transaction-financing target.',
    okiru: 'Divides by the transaction-financing target.',
    question: 'Confirm transaction financing is measured against its own target.',
  },
  {
    id: 'fsc-lti-transactional-access',
    element: 'Access to financial services',
    title: 'Transactional access is typed in',
    kind: 'toolkit-fault',
    toolkit:
      'The long-term insurers\' transactional-access share is a typed, locked 80% (always 2 points) instead of the share of areas entered. Its tiers are: below 50% none; 60% to 70% 1 point; 70% to 80% 1.5; otherwise 2 — which also gives 2 points between 50% and 60%.',
    okiru: 'Scores the share entered, on the toolkit\'s own tiers.',
    question: 'What should a share between 50% and 60% earn?',
  },
];

const STI_ONLY: ReviewDecision[] = [
  {
    id: 'fsc-sti-commercial-target',
    element: 'Access to financial services',
    title: 'Commercial lines are measured against the wrong target',
    kind: 'toolkit-fault',
    toolkit:
      'The sheet asks for the target policies of each line offered, but its formulas divide by the personal-lines target whenever personal lines are offered (so an insurer offering both meets the personal target on its commercial products and policies), and by an unlabelled cell for a commercial-only insurer, so every line scores 0.',
    okiru: 'Measures each line against its own line\'s target policies.',
    question: 'Confirm each line of business is measured against its own target.',
  },
  {
    id: 'fsc-sti-appropriate-products',
    element: 'Access to financial services',
    title: 'Appropriate products are scored by policy volume',
    kind: 'judgment',
    toolkit: 'Each appropriate product is scored as qualifying policies × their compliance share ÷ target policies, so one product can earn its share from policy volume alone.',
    okiru: 'Follows the toolkit.',
    question: 'Should appropriate products be scored by policy volume, or by the share of products that are compliant?',
  },
];

/** The rulings on the sheets all four share, with the procurement sub-minimum where that scorecard has one. */
const shared = (procurementSubMinimum: boolean): ReviewDecision[] => [
  ...SHARED_BEFORE_PP_SUB_MINIMUM,
  ...(procurementSubMinimum ? [PP_SUB_MINIMUM] : []),
  ...SHARED_AFTER_PP_SUB_MINIMUM,
];

export const FSC_OTHERS_DECISIONS: ReviewDecision[] = [...shared(true)];
export const FSC_BANKS_DECISIONS: ReviewDecision[] = [
  ...shared(false), OWNERSHIP_BONUS_NEGATIVE, NET_VALUE_CAP, ESD_PERIOD, BAD_DEBTS, ...BANKS_ONLY,
];
export const FSC_LTI_DECISIONS: ReviewDecision[] = [
  ...shared(false), OWNERSHIP_BONUS_NEGATIVE, NET_VALUE_CAP, ESD_PERIOD, BAD_DEBTS, ...LTI_ONLY,
];
export const FSC_STI_DECISIONS: ReviewDecision[] = [
  ...shared(true), OWNERSHIP_BONUS_NEGATIVE, NET_VALUE_CAP, ...STI_ONLY,
];
