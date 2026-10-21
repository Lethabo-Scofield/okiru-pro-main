/**
 * The rulings the Calculation Review asks for on ICT Generic, from the parity
 * findings for the Empower ICT Generic toolkit (template v1.4). Written for a
 * verification professional: no code, no file names, no cell addresses.
 */
import type { ReviewDecision } from './decisions';

export const ICT_GENERIC_DECISIONS: ReviewDecision[] = [
  {
    id: 'ownership-left-truncation',
    element: 'Ownership',
    title: 'Designated groups and new entrants can never score',
    kind: 'toolkit-fault',
    toolkit:
      'Each ownership line divides by the first three characters of its target, so the 3% (designated groups) and 2% (new entrants) targets become nothing and those two lines always score 0 unless points are typed in by hand.',
    okiru: 'Scores against the full 3% and 2%. The same fault, and the same reading, as on RCOGP Generic.',
    question: 'Confirm Empower scores designated groups and new entrants against 3% and 2%.',
  },
  {
    id: 'ownership-first-debt-holder',
    element: 'Ownership',
    title: 'Acquisition debt is netted by row order',
    kind: 'toolkit-fault',
    toolkit:
      'On the debt sheet (the same sheet as RCOGP Generic), the first shareholder with acquisition debt is netted one way and every later one another way, and the whole indebted stake counts as black even when only part of it is.',
    okiru:
      'Nets every shareholder by the first row\'s rule — the stake counts in full once its value after debt reaches 40% of it, pro rata below — for the black share of the stake only. This can lower net value: on one test company it took net value under its 3.2-point sub-minimum.',
    question: 'Which rule does Empower use when there are two or more shareholders with acquisition debt?',
  },
  {
    id: 'skills-unemployed-learners',
    element: 'Skills development',
    title: 'Employed learners count as unemployed',
    kind: 'toolkit-fault',
    toolkit:
      'On the "unemployed learners in learnerships" line only the African-male group checks that the learner is not employed; the other five groups count every black learner in a learnership, apprenticeship or internship.',
    okiru: 'Counts unemployed learners only, in every group.',
    question: 'Confirm this line counts unemployed learners only.',
  },
  {
    id: 'skills-disabled-admin-costs',
    element: 'Skills development',
    title: 'Training-admin costs on the disabled line go to African men only',
    kind: 'toolkit-fault',
    toolkit:
      'The share of disabled black staff in each group should decide how the training manager\'s salary and training overhead are shared on the disabled-learner line. Five of the six group shares were copied across with references that drifted onto unrelated columns and read 0, so only African men get a share.',
    okiru: 'Gives every group its share of disabled black staff, as the African-male group does.',
    question: 'Confirm every black group shares the training-admin costs on the disabled-learner line.',
  },
  {
    id: 'pp-first-time-supplier',
    element: 'Preferential procurement',
    title: 'First-time suppliers never earn the 1.2 factor',
    kind: 'toolkit-fault',
    toolkit:
      'When no scenario answer is entered, the calculated "first-time supplier" column reads the three-year-contract answer instead of the first-time answer. Every other calculated column beside it falls back to its own answer.',
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
      'The supplier development benefit-factor table holds the minority-investment row twice and the lookup finds the copy with no factor. The enterprise development table says 70%.',
    okiru: 'Recognises it at 70%. The same fault as on RCOGP Generic.',
    question: 'Confirm a supplier development minority investment is recognised at 70%.',
  },
  {
    id: 'esd-negative-rate',
    element: 'Enterprise and supplier development',
    title: 'A loan above prime is recognised at a negative amount',
    kind: 'toolkit-fault',
    toolkit:
      'A loan at a lower interest rate, or an investment at a lower dividend, is recognised at the prime rate less the actual rate, with no floor. A loan charged above prime subtracts from the element\'s other contributions (on one test company, a loan at 12% against a prime of 10.75% is recognised at minus R4,052.73). A blank actual rate is read as 0%, so a loan whose rate was never entered counts at the full prime rate.',
    okiru: 'Never recognises a contribution below nothing, and recognises the row only once both rates are entered.',
    question: 'Confirm a loan above prime counts for nothing (not less), and that a loan without its rate is not recognised.',
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
    id: 'esd-beneficiaries',
    element: 'Enterprise and supplier development',
    title: 'Contributions count whoever the beneficiary is',
    kind: 'judgment',
    toolkit:
      'The toolkit works out whether each beneficiary qualifies (a 51% black-owned EME or QSE, and for Enterprise Development an ICT company), but every branch of its recognised amount gives the full amount times the benefit factor. The "ICT company?" answer and the beneficiary\'s size and ownership change nothing. The RCOGP Generic toolkit does leave out a beneficiary that does not qualify.',
    okiru: 'Follows this toolkit: every contribution counts.',
    question: 'Should contributions to beneficiaries that do not qualify count?',
  },
  {
    id: 'ed-jobs-bonus-tiers',
    element: 'Enterprise development',
    title: 'Both job-creation bonus tiers score together',
    kind: 'toolkit-fault',
    toolkit:
      'A company with one beneficiary creating jobs up to 10% of its workforce and another creating 11% or more gets 1 + 2 = 3 points, so Enterprise Development can reach 19 although it is weighted 18 (15 + 1 + 2) and its gap column treats the tiers as alternatives.',
    okiru: 'Awards the higher tier only.',
    question: 'Confirm the two job-creation tiers are alternatives.',
  },
  {
    id: 'employee-time',
    element: 'Enterprise and supplier development',
    title: 'Time given by employees',
    kind: 'judgment',
    toolkit:
      'The toolkit has a branch that divides employee time by 160 (hours in a month), but it can never be reached, so employee time counts at the full amount entered times 60%.',
    okiru: 'Follows the toolkit, so the amount entered must already be the value of the time given.',
    question: 'How should the amount be captured: as a monthly salary turned into an hourly rate, or as the value of the time given?',
  },
  {
    id: 'skills-disabled-cap-per-group',
    element: 'Skills development',
    title: 'Each black group gets its own 15% cap on the disabled line',
    kind: 'judgment',
    toolkit:
      'Without the verifier\'s sign-off on the EAP split, disabled learners are one pool against the whole target, yet each of the six groups is allowed category F and G and other costs up to 15% of all training spend, rather than one 15% cap for the whole pool.',
    okiru: 'Follows the toolkit. The cap is rarely reached.',
    question: 'Should disabled learners measured as one pool share one 15% cap?',
  },
  {
    id: 'skills-absorption-basis',
    element: 'Skills development',
    title: 'Absorption counts learners of every race',
    kind: 'judgment',
    toolkit:
      'The absorption bonus divides the absorbed unemployed black learners by every unemployed learner who completed, of any race and including foreign nationals, while only black learners can be absorbed for points.',
    okiru: 'Follows the toolkit.',
    question: 'Should the learners who completed be counted for black learners only?',
  },
  {
    id: 'blank-choices',
    element: 'Preferential procurement and skills',
    title: 'Two choices the toolkit ships blank',
    kind: 'judgment',
    toolkit:
      'The toolkit ships with "Actual or projected spend?" (procurement) and "EAP targets applicable on disability spend?" (skills) blank, which scores every procurement line and the disabled-learner line 0 until someone picks.',
    okiru: 'Reads procurement as actual spend, and disability spend without the EAP split unless the verification agent\'s sign-off is ticked.',
    question: 'Are those the right readings when a client has not chosen?',
  },
  {
    id: 'sed-ict-specific-blank',
    element: 'Socio-economic development',
    title: 'A contribution nobody has marked as ICT-specific',
    kind: 'judgment',
    toolkit: 'Only contributions marked as ICT-specific initiatives count; a blank answer counts as No.',
    okiru:
      'A "No" removes the contribution, as in the toolkit. A blank still counts, because the app does not ask the question on every path and older records have no answer.',
    question: 'Should a contribution with no answer count?',
  },
  {
    id: 'level-projected-column',
    element: 'Levels',
    title: 'The level is read from the projected column',
    kind: 'toolkit-fault',
    toolkit:
      'The achieved and discounted levels come from the projected points, not the points shown on the scorecard. With no scenario entered the two should agree, but two projected formulas differ from their actual twins (absorption, and the disabled-learner cost cap), so the projected total ran 0.1 to 1.0 points lower on twelve of sixteen test companies. On one, that alone cost a level.',
    okiru: 'Gives the level of the actual points shown on the scorecard.',
    question: 'Confirm the level follows the actual points.',
  },
  {
    id: 'level-on-threshold',
    element: 'Levels',
    title: 'A total exactly on a threshold',
    kind: 'toolkit-fault',
    toolkit: 'The level lookup uses "less than", so exactly 100 points is Level 5, not Level 4.',
    okiru: 'A total exactly on a threshold earns that level.',
    question: 'Confirm how Empower treats a total that lands exactly on a threshold.',
  },
];
