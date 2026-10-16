/**
 * The rulings the Calculation Review asks a sector expert to make.
 *
 * Every entry is a place where matching the Empower toolkit forced a choice:
 * either the toolkit does something the Codes word differently (a judgment
 * call — we follow the toolkit and ask), or the toolkit's own formula is
 * broken (a fault — we use what the formula evidently means and say so).
 * Written for a verification professional: no code, no file names.
 */

export type DecisionKind = 'judgment' | 'toolkit-fault';

export interface ReviewDecision {
  /** Notes attach as `indicator:decision-<id>` (the notes api accepts indicator/pillar anchors). */
  id: string;
  element: string;
  title: string;
  kind: DecisionKind;
  /** What the toolkit does. */
  toolkit: string;
  /** What the Codes say, where it differs. */
  codes?: string;
  /** What Okiru does now. */
  okiru: string;
  /** The question for the expert. */
  question: string;
}

export const RCOGP_GENERIC_DECISIONS: ReviewDecision[] = [
  {
    id: 'net-value-target',
    element: 'Ownership',
    title: 'Net value is scored against 100%',
    kind: 'judgment',
    toolkit:
      'The net value line divides the black net value by a target of 100% and multiplies by 8. A debt-free company that is 30% black owned scores 2.4 of 8 and fails the ownership sub-minimum of 3.2.',
    codes:
      'Annexe 100(E) measures net value against the 25% economic-interest target, graduated over ten years. The toolkit\'s own "Ownership Calcs Formula" sheet describes these formulas, but they are not linked to the scorecard.',
    okiru: 'Follows the toolkit: 100%.',
    question:
      'Does Empower score net value for a debt-free, 30% black-owned company as 2.4 or as 8? This one setting moves many clients\' levels through the sub-minimum.',
  },
  {
    id: 'ownership-debt-in-economic-interest',
    element: 'Ownership',
    title: 'Acquisition debt reduces black economic interest',
    kind: 'judgment',
    toolkit:
      'A black shareholder with acquisition debt counts on the economic-interest lines only at their deemed value (value of their shares less the debt, over the company value), not at their full stake.',
    codes: 'The Codes net debt off in the net value line; economic interest is the stake held.',
    okiru: 'Follows the toolkit.',
    question: 'Should economic interest be the full stake, with debt netted only in net value?',
  },
  {
    id: 'ownership-left-truncation',
    element: 'Ownership',
    title: 'The toolkit\'s ownership targets are cut short',
    kind: 'toolkit-fault',
    toolkit:
      'Each ownership line divides by the first three characters of its target. 3% (designated groups) and 2% (new entrants) become "0.0", so those lines always score 0 unless points are typed in by hand; 25% (black economic interest) becomes "0.2", so it is scored against 20%.',
    okiru: 'Scores against the real targets: 3%, 2% and 25%.',
    question: 'Confirm Empower scores designated groups and new entrants against 3% and 2%.',
  },
  {
    id: 'ownership-first-debt-holder',
    element: 'Ownership',
    title: 'The first shareholder with debt is valued differently',
    kind: 'toolkit-fault',
    toolkit:
      'On the debt sheet, the first shareholder listed uses a different deemed-value formula from every other row, so the score depends on the order the shareholders are entered in.',
    okiru: 'Uses one formula for every shareholder: (company value × stake − debt) ÷ company value, times their black share.',
    question: 'Which of the two formulas does Empower use?',
  },
  {
    id: 'board-headcount',
    element: 'Management control',
    title: 'Board lines count heads, not voting rights',
    kind: 'judgment',
    toolkit:
      'The board indicators are worded "exercisable voting rights", but the toolkit counts black board members over all board members. The voting-rights column it collects is not used.',
    codes: 'The indicator is exercisable voting rights.',
    okiru: 'Follows the toolkit: headcount. Weighting by voting rights is available as a setting.',
    question: 'Should the board lines use the voting rights entered?',
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
    id: 'esd-guarantees-factor',
    element: 'Enterprise and supplier development',
    title: 'Guarantees are recognised at 50%',
    kind: 'judgment',
    toolkit: 'Guarantees provided for a beneficiary are recognised at 50% of the amount guaranteed.',
    okiru: 'Follows the toolkit: 50% (previously 3%).',
    question: 'Confirm the benefit factor for guarantees.',
  },
  {
    id: 'skills-absorption-basis',
    element: 'Skills development',
    title: 'Absorption is measured against headcount',
    kind: 'judgment',
    toolkit:
      'Absorbed learners (unemployed or fixed-term learners who completed and were absorbed) over the entity\'s headcount, against a 5% target.',
    codes: 'Statement 300 measures absorption of black people at the end of the programme; a July review set it as absorbed ÷ learners against 100%.',
    okiru: 'Follows the toolkit.',
    question: 'Which basis does Empower use for the absorption bonus?',
  },
  {
    id: 'skills-subminimum-always-fails',
    element: 'Skills development',
    title: 'The toolkit always discounts on Skills',
    kind: 'toolkit-fault',
    toolkit: 'The level-discount check for Skills adds up empty cells, so it always fails and every entity drops a level.',
    okiru: 'Applies the real test: the four base Skills lines must reach 40% of their 20 points.',
    question: 'Confirm Empower does not discount an entity that meets the Skills sub-minimum.',
  },
  {
    id: 'level-on-threshold',
    element: 'Levels',
    title: 'A total exactly on a threshold',
    kind: 'toolkit-fault',
    toolkit: 'The level lookup uses "less than", so exactly 80.00 points is Level 5, not Level 4.',
    okiru: 'Exactly 80.00 is Level 4.',
    question: 'Confirm how Empower treats a total that lands exactly on a threshold.',
  },
  {
    id: 'deemed-npat',
    element: 'Targets',
    title: 'Deemed NPAT',
    kind: 'judgment',
    toolkit:
      'Targets use the higher of current NPAT and the average of the current and up to four prior years. If that is below a quarter of the industry norm × revenue, the smallest qualifying year margin × revenue is used, never less than a quarter of the norm × revenue.',
    okiru:
      'Follows the toolkit for every sector with a toolkit. Transport, which has no toolkit, keeps the full-norm method its verified certificates use.',
    question: 'Confirm the five-year average and the quarter-norm floor.',
  },
  {
    id: 'yes-points',
    element: 'Levels',
    title: 'YES points and level uplift',
    kind: 'judgment',
    toolkit:
      'YES points are shown beside the total but never added to it. The level uplift needs the prior year\'s level and a measured level no worse than it.',
    okiru: 'Follows the toolkit; the prior-year level is the current certificate level.',
    question: 'Confirm the YES rules.',
  },
  {
    id: 'years-as-supplier',
    element: 'Preferential procurement',
    title: 'Years as a supplier',
    kind: 'toolkit-fault',
    toolkit: 'Graduated QSE/EME suppliers count for five years measured to today\'s date, so the same workbook scores differently next month.',
    okiru: 'Measures to the end of the measurement period.',
    question: 'Confirm the five years run to the measurement period end.',
  },
];
