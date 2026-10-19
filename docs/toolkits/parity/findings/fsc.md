# FSC toolkit parity — findings for the sector expert

Workbook: **BBBEE Toolkit (FSC) Template v1.0** (the Empower FSC toolkit).
Ruling applied: the spreadsheet is the reference, except where one of its
formulas is evidently broken; there we score what the formula evidently means
and list it here for you to confirm.

## What was checked

The template holds one scorecard with five variants, chosen on Client
Information ("Applicable Sub-Sector Codes"): **Others** (the generic FSC
scorecard, with an optional **Reinsurer** variant), **Banks**, **Long-term
Insurers**, **Short-term Insurers** and **Stock Exchanges**. There is no QSE
(QSFI) scorecard in this workbook.

Synthetic companies (invented names, no ID numbers, no client data) were typed
into a copy of the template, Excel recalculated it, and every line of the
Summary Scorecard was compared with our scorecard for the same company — each
line, each element total, the grand total, the achieved level and the
discounted level, to within half a cent of a point.

RESULTS_PLACEHOLDER

## How the FSC toolkit scores (as we now score it)

- **Ownership.** Voting rights and economic interest are weighed by the value
  of each holding. A black shareholder's acquisition debt is netted against the
  company value: the stake counts in full once its net value is at least 40% of
  the stake, and proportionally below that. **Net value** is the unencumbered
  black economic interest against 25% (8 points; 6 for the other sub-sectors),
  plus each indebted black stake's net value, graduated by the year of its loan
  (10% in year 1 rising to 100% in year 9), capped at 8. The sub-sectors other
  than Others carry two bonus lines (voting rights beyond 15%; economic interest
  at 32.5% / 40%).
- **Management control** is measured by headcount, board included (the voting
  rights column is not read). The 14 points for other executive, senior, middle
  and junior management move between bands: a band with nobody in it gives its
  points to the bands that have people, and when no senior, middle or junior
  manager is employed, other executive management carries 10 + 4 points at 75% /
  38%. Each band also has an African line against the African share of the EAP.
- **Skills development** measures spend on each management level against that
  level's own payroll (senior & executive 2%, middle 3%, junior 5%,
  non-management 8%), with black-women and African sub-lines; unemployed black
  people (1.5% of the leviable amount), black people with disabilities (0.3%),
  learnerships (5% of headcount) and absorption (bonus, of the unemployed
  learners who completed). Category G and other costs are capped at 15% of the
  level's spend.
- **Preferential procurement**: the usual five lines (all suppliers 80%, QSE
  18%, EME 12%, 51% black-owned 30%, 30% black-women-owned 10%), plus two FSC
  bonuses measured against the **total allocated trade value** — intermediated
  black professional services and black stock brokers / fund managers (the
  better of the two counts) — and the designated-group bonus.
- **Enterprise and supplier development**: a contribution counts only for a
  QSE/EME beneficiary at least 51% black owned. Others: SD 2% of NPAT (10),
  ED 1% (5), graduation and jobs bonuses, and an ED bonus for support of black
  stock brokers, fund managers and intermediaries (0.5%, 2 points). Banks and
  long-term insurers score SD (1.8%, 7) and ED (0.2%, 3) on their empowerment
  financing scorecard.
- **SED and consumer education** come from one table split by its Pillar
  column: SED 0.6% of NPAT (3; 0.7% for reinsurers), consumer education 0.4%
  (2), additional consumer education (bonus, 1), and the Fundisa Retail Fund
  (bonus, 2; a base line for reinsurers).
- **Levels** use thresholds scaled to the scorecard's own base points: each of
  100 / 95 / 90 / 80 / 75 / 70 / 55 / 40 is multiplied by base points ÷ 111
  (Others: 106 base points, Level 1 from 95.50). A failed priority element
  (net value, skills, procurement — empowerment financing for banks and
  long-term insurers — supplier development, enterprise development) drops the
  level by one; a discounted Level 8 is non-compliant.

## Toolkit formula faults (please confirm)

Each fault below is reworked by the parity referee from the toolkit's own
figures, and our scorecard scores what the formula evidently means.

1. **Skills: the "within the financial year" test moves down the page.**
   Skills Data, column "Within FY?" (and "Prior Year"), compares each training
   row with Validation!C2 as a *relative* reference, so row 2 compares with C3,
   row 3 with C4, and so on. Rows 6, 13 and 25 meet a text label there and drop
   out of every skills sum; other rows are compared with unrelated dates. We
   count every row in the year.
2. **Skills: the leviable amount and headcount are another company's.**
   'Skills Toolkit'!D3 (leviable amount, R6,531,144,233) and D6 (headcount,
   14,212) are typed values, not linked to Client Information, and they sit in
   locked cells on a password-protected sheet, so no user can change them. The
   unemployed (1.5%), disabled (0.3%) and learnership (5% of headcount) lines
   measure against them. We use the workbook's own leviable amount (the larger
   of SDL × 100 and payroll, Financials!I3) and headcount ('Client
   Information'!E16).
3. **Skills: the workforce demographics are typed in.** The training
   manager's salary and training overhead are shared out by 'Employee
   Demographics' row 1, whose "auto generated" row holds typed figures from
   another workforce. Our cases type the manual row from the company's own
   employees; we compute the same shares from Management Control.
4. **Procurement: recognised spend has no formula.** Procurement Data, column
   "All Spend adjusted" — the spend after the B-BBEE recognition level — holds a
   typed number in the template, not a formula. Our cases type what it
   evidently means (spend × the level's recognition, Validation!B27:C35); our
   scorecard computes it.
5. **Procurement: the first-time-supplier test reads the wrong column.**
   "First-time supplier? [Scenario].Calcs" falls back to the *3-year contract*
   answer instead of the first-time-supplier answer, so a first-time black-owned
   QSE/EME supplier never earns the 1.2 recognition factor. We read the
   first-time answer.
6. **Procurement: the sub-minimum can never fail.** 'Scorecard Calculations'!G6
   is 40% of 'Procurement Scorecard'!C60:C64, which are empty, so the
   procurement priority element always passes. We test 40% of the five base
   lines (8 points for Others).
7. **Ownership: debt netting depends on row order and ignores the black share.**
   'Oustanding Debts Calcs': the first indebted shareholder row uses the 40%
   rule, the rows below use a different formula, every row credits the whole
   stake as black, and a non-black holder's debt is netted as a negative stake.
   (Same as RCOGP Generic.) We net every black holder by the first row's
   formula, for the black share only.
8. **Ownership: a loan in its tenth year or later scores no net value.** The
   graduation table stops at year 9 (100%); the lookup finds nothing for a
   later year and the stake's Formula A becomes 0. We read 100%.
9. **Ownership (sub-sectors other than Others): a negative bonus.** "Direct /
   indirect ownership in excess of 15%" is (black voting rights − 15%) against
   10%, so black voting rights below 15% give *negative* points. We floor it at 0.
10. **Supplier development: minority investments count 0.** The benefit-factor
    lookup meets a duplicated "Minority Investment" row with no factor before
    the 70% row (the enterprise-development copy reads 70%). (Same as RCOGP
    Generic.) We use 70%.
11. **Additional consumer education is measured above the wrong target.**
    'SED & CE Scorecard'!I10 counts consumer-education spend above the *SED*
    target (0.6% of NPAT, F7) instead of above the consumer-education target
    (0.4%, F8). We use the consumer-education target.
12. **Levels: a total exactly on a threshold drops a level.** The round-down
    ('Scorecard Calculations'!C14) uses a strict "<". (Same as RCOGP Generic.)

## Also seen in the template (not affecting the generic scorecard)

- Banks: electronic access and active accounts ('AFS Scorecard - Banks' rows 11
  and 13) have no target, so the toolkit scores them 0 whatever is entered. We
  have no target to score them against either; they score only on a stated
  compliance answer, which the toolkit does not collect. **Needs your target.**
- Long-term insurers: the transaction-financing line divides by the
  targeted-investment portion (C6) instead of its own target (C8); the
  transactional-access share ('AFS Scorecard - Long Term'!H26) is a typed,
  locked 80% (always 2 points), and its tiers give 2 points for 50%–60%.
- Short-term insurers' access to financial services is scored from the AFS
  policy table by policy line; it was not part of this check.

STILL_DIFFERENT_PLACEHOLDER
