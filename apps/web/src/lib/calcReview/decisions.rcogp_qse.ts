/**
 * The rulings the Calculation Review asks for on RCOGP QSE, from the parity
 * findings for the Empower RCOGP QSE toolkit (version 1.1). Written for a
 * verification professional: no code, no file names, no cell addresses.
 */
import type { ReviewDecision } from './decisions';

export const RCOGP_QSE_DECISIONS: ReviewDecision[] = [
  {
    id: 'qse-discount-rule',
    element: 'Levels',
    title: 'Which rule discounts a QSE',
    kind: 'toolkit-fault',
    toolkit:
      'The discount test drops a level when any priority element misses its sub-minimum, which is the large-enterprise rule. Its Skills and Procurement checks also add the points to the gap and the projected columns, so those two checks can never fail. A QSE whose Supplier or Enterprise Development line misses 40% is always discounted; one whose Skills or Procurement misses 40% never is.',
    codes:
      'A QSE must meet the Ownership sub-minimum and either Skills Development or Enterprise and Supplier Development. The toolkit\'s own YES sheet applies a QSE rule too.',
    okiru:
      'Applies the QSE rule from the Codes, measured on the toolkit\'s own line points. The ICT QSE scorecard follows its own toolkit\'s stricter rule instead, so the two QSE scorecards discount differently today.',
    question: 'Which discount rule should RCOGP QSE follow: the Codes\' QSE rule, as now, or the toolkit\'s any-element rule?',
  },
  {
    id: 'ownership-left-truncation',
    element: 'Ownership',
    title: 'The toolkit\'s ownership targets are cut short',
    kind: 'toolkit-fault',
    toolkit:
      'Each ownership line divides by the first three characters of its target. The 25% economic-interest target becomes 20%, and the 2% target for black new entrants or designated groups becomes nothing, so that line can never score unless points are typed in by hand.',
    okiru: 'Scores against the real targets: 25% and 2%.',
    question: 'Confirm Empower scores black economic interest against 25% and the new-entrants-or-designated-groups line against 2%.',
  },
  {
    id: 'ownership-first-debt-holder',
    element: 'Ownership',
    title: 'Acquisition debt is netted by row order',
    kind: 'toolkit-fault',
    toolkit:
      'The first shareholder with acquisition debt is netted one way (the stake counts in full once its value after debt reaches 40% of the stake), every later one another way. The whole indebted stake counts as black even when only part of it is, and a non-black shareholder\'s debt on a later row is subtracted from black economic interest.',
    okiru:
      'Nets every black indebted shareholder by the first row\'s rule, for the black share of the stake only. A non-black shareholder\'s debt is left out. The same reading as on RCOGP Generic.',
    question: 'Which rule does Empower use when there are two or more shareholders with acquisition debt, and should a non-black shareholder\'s debt reduce black economic interest?',
  },
  {
    id: 'skills-absorption-denominator',
    element: 'Skills development',
    title: 'The absorption bonus is measured against the wrong number',
    kind: 'toolkit-fault',
    toolkit:
      'The bonus divides the black learners who were absorbed by all learners who were absorbed. A company that absorbs one black learner out of twenty who finished a learnership earns the full 5 points, as long as it absorbed nobody else.',
    okiru:
      'Divides by the line\'s own headcount: the learners who completed a learnership, apprenticeship or internship while not employed. That headcount counts learners of every race.',
    question: 'Is that the right number to divide by, and should the headcount count black learners only?',
  },
  {
    id: 'skills-fixed-term-learners',
    element: 'Skills development',
    title: 'A learner on a fixed-term contract counts as not employed',
    kind: 'judgment',
    toolkit:
      'The toolkit asks "Employed?" as Yes or No and counts the learners answered No. Its own "absorption potential" column, and the Generic toolkits, read a fixed-term learner as not employed.',
    okiru:
      'Okiru\'s register asks Permanent, Fixed-Term or Unemployed, and reads Fixed-Term as not employed, in both QSE sectors. Before the two QSE methods were combined, RCOGP QSE read only "Unemployed" that way, so a fixed-term learner who completed and was absorbed now counts in both the absorbed learners and the headcount.',
    question: 'Confirm the fixed-term reading for RCOGP QSE.',
  },
  {
    id: 'pp-first-time-supplier',
    element: 'Preferential procurement',
    title: 'First-time suppliers never earn the 1.2 factor',
    kind: 'toolkit-fault',
    toolkit:
      'The column that should read each supplier\'s "First-time supplier?" answer reads its "3 year contract in place?" answer instead, so the first-time answer is ignored.',
    okiru: 'Reads the first-time answer: a first-time QSE or EME supplier at least 51% black owned earns the 1.2 recognition factor.',
    question: 'Confirm a first-time, 51% black-owned QSE or EME supplier earns the 1.2 factor.',
  },
  {
    id: 'pp-empowering-gate',
    element: 'Preferential procurement',
    title: 'Spend on all suppliers counts on the "empowering suppliers" line',
    kind: 'judgment',
    toolkit: 'The toolkit collects "Empowering supplier? (Yes/No)" but never reads it: every supplier\'s recognised spend counts.',
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
      'The supplier development benefit-factor table lists "Minority Investment" twice. The first copy has no factor and the lookup stops at it, so such an investment counts for nothing. The enterprise development table says 70%.',
    okiru: 'Recognises it at 70%. The same fault, and the same reading, as on RCOGP Generic.',
    question: 'Confirm a supplier development minority investment is recognised at 70%.',
  },
  {
    id: 'esd-beneficiaries',
    element: 'Enterprise and supplier development',
    title: 'Contributions count whoever the beneficiary is',
    kind: 'judgment',
    toolkit:
      'The toolkit checks whether each beneficiary is a 51% black-owned EME or QSE, but both outcomes give the same recognised amount, so every contribution counts. The RCOGP Generic toolkit does leave out a beneficiary that does not qualify.',
    codes: 'The Codes require qualifying beneficiaries.',
    okiru: 'Follows the QSE toolkit: every contribution counts.',
    question: 'Should a QSE leave out contributions to beneficiaries that do not qualify?',
  },
  {
    id: 'esd-guarantees-factor',
    element: 'Enterprise and supplier development',
    title: 'Guarantees are recognised at 50%',
    kind: 'judgment',
    toolkit: 'Guarantees provided for a beneficiary are recognised at 50% of the amount guaranteed, as in every Empower toolkit we hold.',
    codes: 'The Codes\' benefit-factor table says 3%.',
    okiru: 'Follows the toolkit: 50%.',
    question: 'Confirm the benefit factor for guarantees.',
  },
  {
    id: 'ed-sub-minimum',
    element: 'Enterprise development',
    title: 'An Enterprise Development sub-minimum now applies',
    kind: 'judgment',
    toolkit: 'The discount test requires 40% of the 5-point Enterprise Development base line.',
    okiru: 'Follows the toolkit. Okiru\'s QSE settings had no Enterprise Development sub-minimum before.',
    question: 'Confirm a QSE must reach 40% of the Enterprise Development base line.',
  },
  {
    id: 'employee-time',
    element: 'Enterprise and supplier development',
    title: 'Time given by employees',
    kind: 'judgment',
    toolkit:
      'The description says 60% of the monthly salary divided by 160 hours, but the "divide by 160" part of the formula can never be reached, so the full amount typed in times 60% counts (80% for socio-economic development).',
    okiru: 'Follows the toolkit, so the amount entered must already be the value of the time given.',
    question: 'How should the amount be captured: as a monthly salary turned into an hourly rate, or as the value of the time given?',
  },
  {
    id: 'level-on-threshold',
    element: 'Levels',
    title: 'A total exactly on a threshold',
    kind: 'toolkit-fault',
    toolkit: 'The level lookup uses "less than", so exactly 75.00 points is Level 6, not Level 5, and exactly 95.00 points is Level 3, not Level 2.',
    okiru: 'A total exactly on a threshold earns that level.',
    question: 'Confirm how Empower treats a total that lands exactly on a threshold.',
  },
];
