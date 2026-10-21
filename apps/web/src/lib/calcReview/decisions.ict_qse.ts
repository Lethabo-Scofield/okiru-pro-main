/**
 * The rulings the Calculation Review asks for on ICT QSE, from the parity
 * findings for the Empower ICT QSE toolkit (template v1.1). Written for a
 * verification professional: no code, no file names, no cell addresses.
 */
import type { ReviewDecision } from './decisions';

export const ICT_QSE_DECISIONS: ReviewDecision[] = [
  {
    id: 'qse-discount-rule',
    element: 'Levels',
    title: 'A QSE is discounted when any priority element fails',
    kind: 'judgment',
    toolkit:
      'The toolkit drops a QSE one level when any priority sub-minimum is missed: net value (3.2 of 8), Skills (10 of its 25 base points), Procurement (8 of its 20 base points), Supplier Development (2 of 5) or Enterprise Development (2 of 5). A discounted Level 8 becomes Non-compliant.',
    codes: 'The Codes\' QSE rule is Ownership plus either Skills or Enterprise and Supplier Development.',
    okiru:
      'Follows the toolkit. The RCOGP QSE scorecard applies the Codes\' QSE rule instead (its toolkit\'s test is broken), so the two QSE scorecards discount differently today.',
    question: 'Which discount rule should ICT QSE follow: the toolkit\'s any-element rule, as now, or the Codes\' QSE rule?',
  },
  {
    id: 'skills-absorption-basis',
    element: 'Skills development',
    title: 'The absorption bonus is the black share of learners absorbed',
    kind: 'judgment',
    toolkit:
      'The 5 bonus points go by the black share of the unemployed learners who completed and were absorbed. The toolkit counts the learners who completed on the same row but never uses that count, so one black learner absorbed out of fifty who completed earns all 5 points.',
    okiru:
      'Follows the toolkit as written. (RCOGP QSE, whose toolkit has the same cell, divides by the learners who completed instead.) A learner on a fixed-term contract counts as not employed, as in every toolkit sector.',
    question: 'Should the bonus be black learners absorbed out of black learners who completed, rather than the black share of those absorbed?',
  },
  {
    id: 'esd-targets',
    element: 'Enterprise and supplier development',
    title: 'Supplier and Enterprise Development targets of 1% of NPAT',
    kind: 'judgment',
    toolkit: 'Both targets are 1% of NPAT, for 5 points each.',
    okiru: 'Follows the toolkit. Okiru\'s ICT QSE settings had 2% each, from the July gazette review.',
    question: 'Confirm 1% of NPAT for each.',
  },
  {
    id: 'esd-beneficiaries',
    element: 'Enterprise and supplier development',
    title: 'Contributions count whoever the beneficiary is',
    kind: 'judgment',
    toolkit:
      'The toolkit works out whether each beneficiary qualifies (for Enterprise Development a 51% black-owned EME or QSE that is an ICT company; for Supplier Development a 51% black-owned EME or QSE), but both branches of its recognised amount give the same figure, so a contribution to a white-owned, non-ICT beneficiary counts in full. The RCOGP Generic toolkit does leave out a beneficiary that does not qualify.',
    okiru: 'Follows the toolkit. This changes many scores: in 18 of the 23 test companies at least one contribution goes to a beneficiary that is not an ICT company.',
    question: 'Should contributions to beneficiaries that do not qualify count?',
  },
  {
    id: 'ownership-left-truncation',
    element: 'Ownership',
    title: 'The new-entrants-or-designated-groups line can never score',
    kind: 'toolkit-fault',
    toolkit:
      'The points formula divides by the first three characters of the target, so the 2% target becomes nothing and the line always scores 0 unless points are typed in by hand.',
    okiru: 'Scores the toolkit\'s own measure (designated groups plus new entrants) against 2%, for 3 points.',
    question: 'Confirm Empower scores this line against 2%.',
  },
  {
    id: 'ownership-debt-netting',
    element: 'Ownership',
    title: 'Acquisition debt is netted three different ways',
    kind: 'toolkit-fault',
    toolkit:
      'Only the first indebted shareholder gets the rule that the stake counts in full once its value after debt reaches 40% of it; every later one has the debt subtracted straight off, so the result depends on the order the shareholders are typed in. The whole indebted stake counts as black, and a non-black shareholder\'s debt is subtracted from black economic interest.',
    okiru:
      'For each black shareholder with acquisition debt, the black share of the stake, by the first row\'s rule; a non-black shareholder\'s debt is left out. This sets the black economic interest line and the net value line.',
    question: 'Which rule does Empower use when there are two or more shareholders with acquisition debt, and should a non-black shareholder\'s debt reduce black economic interest?',
  },
  {
    id: 'ownership-debt-above-stake',
    element: 'Ownership',
    title: 'Debt larger than the stake',
    kind: 'judgment',
    toolkit: 'A black shareholder whose acquisition debt is larger than the value of the stake takes the shortfall off the black economic interest total.',
    okiru: 'Follows the first row\'s rule, which does the same.',
    question: 'Should the shortfall come off the total, or should such a stake simply count as nothing?',
  },
  {
    id: 'ownership-negative-points',
    element: 'Ownership',
    title: 'Ownership points can go below zero',
    kind: 'toolkit-fault',
    toolkit: 'The points formula caps each line at its maximum but has no floor, so debt larger than the stake can show negative points on black women\'s economic interest.',
    okiru: 'A line scores at least 0.',
    question: 'Confirm an ownership line cannot score below 0.',
  },
  {
    id: 'mc-middle-junior-combined',
    element: 'Management control',
    title: 'Middle and junior management has no formula when executives and seniors are combined',
    kind: 'toolkit-fault',
    toolkit:
      'When the client combines executive and senior management, the cell that scores black middle and junior managers is empty, so that line always scores 0. The black-women line beside it has its formula.',
    okiru: 'Scores the sheet\'s own measure against 60%, for 6 points.',
    question: 'Confirm the line is scored against 60% in the combined layout.',
  },
  {
    id: 'pp-first-time-supplier',
    element: 'Preferential procurement',
    title: 'First-time suppliers never earn the 1.2 factor',
    kind: 'toolkit-fault',
    toolkit:
      'With no scenario typed, the "first-time supplier" column falls back to the "3 year contract in place?" answer instead of the "First-time supplier?" answer, so a first-time supplier earns the 1.2 factor only if it also holds a 3-year contract.',
    okiru: 'Reads the first-time answer: a first-time QSE or EME supplier at least 51% black owned earns the 1.2 recognition factor.',
    question: 'Confirm a first-time, 51% black-owned QSE or EME supplier earns the 1.2 factor.',
  },
  {
    id: 'pp-empowering-gate',
    element: 'Preferential procurement',
    title: 'Spend on all suppliers counts on the "all suppliers" line',
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
      'The benefit-factor table has a stray copy of the "Minority Investment" row with no factor, and the lookup finds it first. The proper row and the enterprise development table say 70%.',
    okiru: 'Recognises it at 70%.',
    question: 'Confirm a supplier development minority investment is recognised at 70%.',
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
    id: 'ed-jobs-bonus-tiers',
    element: 'Enterprise development',
    title: 'Both job-creation bonuses are added',
    kind: 'toolkit-fault',
    toolkit:
      'The Enterprise Development total adds the up-to-10% bonus (1 point) and the 11%-or-more bonus (2 points), though the element\'s own maximum counts only the 2-point tier and its gap takes the larger. With one beneficiary under 11% and another over, the toolkit gives 3 points.',
    okiru: 'Awards the larger tier only.',
    question: 'Confirm the two job-creation tiers are alternatives.',
  },
  {
    id: 'employee-time',
    element: 'Enterprise and supplier development',
    title: 'Time given by employees',
    kind: 'judgment',
    toolkit:
      'The recognised amount has a branch that divides by 160 for time of employees, but it can never be reached, so 60% of whatever amount is typed counts. The label says "60% of the monthly salary divided by 160", so a consultant who types a monthly salary gets 160 times too much.',
    okiru: 'Follows the toolkit, so the amount entered must already be the value of the time given.',
    question: 'How should the amount be captured: as a monthly salary turned into an hourly rate, or as the value of the time given?',
  },
  {
    id: 'sed-ict-specific-blank',
    element: 'Socio-economic development',
    title: 'Only contributions marked as ICT-specific count',
    kind: 'judgment',
    toolkit: 'A contribution counts only when "ICT Specific Initiative?" says Yes; one answered No, and one left blank, counts nothing.',
    okiru:
      'Follows the toolkit. Every place a contribution comes in now asks the question, and what does not count is shown on the socio-economic line with its rand value, so the client can see why and answer.',
    question: 'Should a contribution with no answer count?',
  },
  {
    id: 'sub-minimum-checks',
    element: 'Levels',
    title: 'The Skills and Procurement sub-minimum checks can never fail',
    kind: 'toolkit-fault',
    toolkit:
      'The two checks add the points, the gap and further columns of the Summary Scorecard. Points plus gap always equal the full weighting, so both always pass, and only net value, Supplier Development and Enterprise Development can discount the level.',
    okiru: 'Skills must reach 10 of its 25 base points and Procurement 8 of its 20 base points, as the toolkit\'s own targets say.',
    question: 'Confirm the Skills and Procurement sub-minimums are tested on their points.',
  },
  {
    id: 'yes-wrong-rows',
    element: 'YES',
    title: 'The YES checks read the wrong rows',
    kind: 'toolkit-fault',
    toolkit:
      'On the YES sheet, the procurement, supplier development and enterprise development sub-minimum checks add up Skills rows instead of their own elements, so a client choosing one of those elements for YES is tested on the wrong figures. No B-BBEE total or level is affected.',
    okiru: 'Okiru grants YES from the YES youth on the training register, so this check is not used.',
    question: 'Confirm YES qualification on procurement, supplier or enterprise development is tested on that element\'s own points.',
  },
  {
    id: 'level-on-threshold',
    element: 'Levels',
    title: 'A total exactly on a threshold',
    kind: 'toolkit-fault',
    toolkit: 'The level lookup uses "less than", so exactly 100 points is Level 2, not Level 1 (and exactly 95, Level 3, and so on).',
    codes: 'The Codes say 100 points or more is Level 1.',
    okiru: 'A total exactly on a threshold earns that level.',
    question: 'Confirm how Empower treats a total that lands exactly on a threshold.',
  },
];
