/**
 * The rulings the Calculation Review asks for on AgriBEE Generic, from the
 * parity findings for the Empower AgriBEE Generic toolkit (master v1.0.1).
 * Written for a verification professional: no code, no file names, no cell
 * addresses.
 */
import type { ReviewDecision } from './decisions';

export const AGRI_GENERIC_DECISIONS: ReviewDecision[] = [
  {
    id: 'ed-sub-minimum-unreachable',
    element: 'Levels',
    title: 'The Enterprise Development sub-minimum can never be met',
    kind: 'toolkit-fault',
    toolkit:
      'The discount test compares the 5-point Enterprise Development base line with 40% of 15 points (6 points), so it always fails and every AgriBEE entity is discounted one level, whatever it scores. The Summary Scorecard\'s own flag for the same line uses 40% of the line\'s 5 points.',
    okiru: 'Tests 40% of 5, which is 2 points.',
    question: 'Confirm the Enterprise Development sub-minimum is 2 of its 5 base points.',
  },
  {
    id: 'ownership-first-debt-holder',
    element: 'Ownership',
    title: 'Acquisition debt is netted by row order',
    kind: 'toolkit-fault',
    toolkit:
      'The first indebted shareholder is netted one way (the stake counts in full once its value after debt reaches 40% of it, pro rata below), every later one by plain value after debt, and the whole indebted stake counts as black even when only part of it is. A non-black shareholder\'s debt on a later row is subtracted from black economic interest and from net value.',
    okiru:
      'Nets every black indebted shareholder by the first row\'s rule, for the black share of the stake only, and a non-black shareholder\'s debt not at all. The same reading as on the RCOGP toolkits.',
    question: 'Which rule does Empower use when there are two or more shareholders with acquisition debt, and should a non-black shareholder\'s debt count?',
  },
  {
    id: 'ownership-old-loans',
    element: 'Ownership',
    title: 'Loans older than eight years earn no net value',
    kind: 'toolkit-fault',
    toolkit:
      'An indebted holder\'s net value uses a time-based graduation factor from a table that stops at year 9. A loan taken out more than eight years before the measurement date finds no factor, reads 0, and the holder\'s net value scores nothing.',
    okiru: 'Uses 100% from year 9 on: a loan that old has passed the last step of the table.',
    question: 'Confirm a loan in its ninth year or later is fully graduated.',
  },
  {
    id: 'net-value-target',
    element: 'Ownership',
    title: 'Net value is measured against 25%',
    kind: 'judgment',
    toolkit: 'Net value is measured against 25% (the formula reads the first characters of the 25% voting-rights target). The RCOGP toolkits measure it against 100%.',
    okiru: 'Follows the AgriBEE toolkit: 25%.',
    question: 'Confirm net value is measured against 25% on the AgriBEE scorecard.',
  },
  {
    id: 'mc-disabled-non-executives',
    element: 'Management control',
    title: 'Disabled non-executive directors',
    kind: 'toolkit-fault',
    toolkit:
      'The disabled-employees ratio counts black disabled people on every row of the register, non-executive directors included, but divides by employees only.',
    okiru: 'Leaves non-executive directors out of both, as the RCOGP toolkit\'s own management sheet does.',
    question: 'Confirm non-executive directors are left out of the employees-with-disabilities line.',
  },
  {
    id: 'skills-unemployed-learners',
    element: 'Skills development',
    title: 'The unemployed-learners line counts employed learners too',
    kind: 'toolkit-fault',
    toolkit:
      'Only the African-male group tests that the learner was unemployed; the other five groups count every black learner in a learnership, apprenticeship or internship, so the line usually scores the same as the learnership line above it.',
    okiru: 'Counts unemployed learners in all six groups.',
    question: 'Confirm this line counts unemployed learners only.',
  },
  {
    id: 'skills-scarce-critical',
    element: 'Skills development',
    title: 'The scarce-and-critical-skills declarations',
    kind: 'judgment',
    toolkit:
      'The toolkit works out the share of black learners\' spend and headcount in scarce and critical skills but only warns about it. What zeroes the lines is the typed "Yes" or "No" to "at least 85% is in scarce and critical skills", and a blank counts as "No".',
    okiru:
      'Follows the declarations: a "No" scores the spend lines (or the headcount lines) 0. The app does not ask the two questions yet, so an unanswered declaration zeroes nothing.',
    question: 'Should the typed declarations decide these lines, or the computed share of at least 85%?',
  },
  {
    id: 'pp-first-time-supplier',
    element: 'Preferential procurement',
    title: 'First-time suppliers never earn the 1.2 factor',
    kind: 'toolkit-fault',
    toolkit:
      'When no scenario answer is typed, the formula that should fall back on the supplier\'s "First-time supplier?" answer falls back on its "3 year contract in place?" answer instead, so the first-time answer is ignored.',
    okiru: 'Reads the first-time answer: a first-time QSE or EME supplier at least 51% black owned earns the 1.2 recognition factor.',
    question: 'Confirm a first-time, 51% black-owned QSE or EME supplier earns the 1.2 factor.',
  },
  {
    id: 'pp-empowering-gate',
    element: 'Preferential procurement',
    title: 'Spend on all suppliers counts on the "empowering suppliers" line',
    kind: 'judgment',
    toolkit: 'The toolkit never reads the "Empowering supplier?" answer: every supplier\'s recognised spend counts.',
    codes: 'The indicator is B-BBEE procurement spend from empowering suppliers.',
    okiru: 'Follows the toolkit.',
    question: 'Should a supplier marked "not empowering" be left out of this line?',
  },
  {
    id: 'sd-minority-investment',
    element: 'Supplier development',
    title: 'A supplier development minority investment is recognised at nothing',
    kind: 'toolkit-fault',
    toolkit:
      'The supplier development benefit-factor table lists "Minority Investment" twice. The first copy has no factor and the lookup stops at it. The enterprise development table says 70%.',
    okiru: 'Recognises it at 70%. The same fault as on the RCOGP toolkits.',
    question: 'Confirm a supplier development minority investment is recognised at 70%.',
  },
  {
    id: 'esd-beneficiaries',
    element: 'Enterprise and supplier development',
    title: 'Contributions count whoever the beneficiary is',
    kind: 'judgment',
    toolkit:
      'The toolkit checks whether each beneficiary is a 51% black-owned EME or QSE (and, for Enterprise Development, an agricultural company), but both outcomes give the same recognised amount, so every contribution counts. The RCOGP Generic toolkit does leave out a beneficiary that does not qualify.',
    codes: 'The Codes require qualifying beneficiaries, and the toolkit evidently meant to check "agricultural company" for Enterprise Development.',
    okiru: 'Follows the AgriBEE toolkit: every contribution counts.',
    question: 'Should AgriBEE leave out contributions to beneficiaries that do not qualify?',
  },
  {
    id: 'esd-guarantees-factor',
    element: 'Enterprise and supplier development',
    title: 'Guarantees are recognised at 50%',
    kind: 'judgment',
    toolkit: 'Guarantees provided for a beneficiary are recognised at 50% of the amount guaranteed.',
    codes: 'The Codes\' benefit-factor table says 3%.',
    okiru: 'Follows the toolkit: 50%.',
    question: 'Confirm the benefit factor for guarantees.',
  },
  {
    id: 'employee-time',
    element: 'Enterprise and supplier development',
    title: 'Time given by employees',
    kind: 'judgment',
    toolkit:
      'The toolkit means to divide a monthly salary by 160 hours, but that branch of the formula can never be reached, so the full amount entered times 60% counts.',
    okiru: 'Follows the toolkit, so the amount entered must already be the value of the time given.',
    question: 'Is the amount entered meant to be a monthly salary turned into an hourly rate, or the value of the time given?',
  },
  {
    id: 'sed-agri-specific-blank',
    element: 'Socio-economic development',
    title: 'A contribution nobody has marked as an agri-specific initiative',
    kind: 'judgment',
    toolkit: 'Only rows marked as an agri-specific initiative count; a blank counts as "No".',
    okiru: 'The app does not ask this question yet, so an unanswered row still counts.',
    question: 'Should a contribution with no answer count?',
  },
  {
    id: 'level-projected-column',
    element: 'Levels',
    title: 'The level is worked out from the projected column',
    kind: 'judgment',
    toolkit:
      'The levels read the projected points, not the actual ones. With no scenario figures typed in the two are the same, but a user who types scenario figures would see the actual level move with them.',
    okiru: 'Gives the level of the actual points (the same as the toolkit whenever no scenario is entered).',
    question: 'Confirm the level follows the actual points.',
  },
  {
    id: 'level-on-threshold',
    element: 'Levels',
    title: 'A total exactly on a threshold',
    kind: 'toolkit-fault',
    toolkit: 'The level lookup uses "less than", so exactly 80.00 points is Level 5, not Level 4.',
    okiru: 'A total exactly on a threshold earns that level.',
    question: 'Confirm how Empower treats a total that lands exactly on a threshold.',
  },
];
