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

**Result: every line matches.** 27 synthetic companies, 1,693 comparisons
(each line, each element total, the grand total and both levels), all within
half a cent of a point:

| Scorecard | Companies | Comparisons | Match |
|---|---|---|---|
| Others (generic FSC), 7 of them reinsurers | 16 | 930 | 930 |
| Banks | 4 | 280 | 280 |
| Long-term insurers | 3 | 204 | 204 |
| Short-term insurers (personal, commercial, both, and FSTC-exempt) | 4 | 279 | 279 |
| **All** | **27** | **1,693** | **1,693** |

The companies range from complete, strong entities to sparse ones (a handful
of rows per table), edge cases (zeros and blanks, values sitting on targets
and thresholds, loans past their ninth year, a first-time supplier, a
combined management band with no senior manager) and weak ones that fail
sub-minimums: 15 of the 27 are discounted, two are non-compliant before
discounting, one is a Level 8 discounted to non-compliant. Every bonus line
was earned by at least seven of them.

"Match" means: equal to the toolkit's own figure, or — on the lines listed
under *Toolkit formula faults* below — equal to what the faulty formula
evidently means, worked out from the toolkit's own figures. That happened on
163 line values, and it moves the level: on 19 of the 27 companies the
toolkit, as shipped, prints a different achieved or discounted level from the
one its formulas evidently intend. On the skills and procurement lines, where
the rework recomputes the whole line, the faulty formula is first recomputed
the toolkit's own way and must reproduce the toolkit's number exactly before
the reworked figure is accepted, so a difference with any other cause would
still show as a difference.

Not checked:

- **Stock Exchanges.** Our product has no Stock Exchanges sub-sector (an FSC
  client is Others, Banks, Long-term or Short-term Insurers), so there is
  nothing of ours to compare. In the template it is the Others scorecard with
  the two ownership bonus lines and 6 points of net value.
- **YES.** The YES sheet only lifts the level once a YES tier and its
  headcounts are entered; the comparison is on the level before YES.
- **"Prior Year" and "Projected" columns.** Every scorecard was read on its
  "Current YTD" period.

## How the FSC toolkit scores (as we now score it)

- **Ownership.** Voting rights and economic interest are weighed by the value
  of each holding. A black shareholder's acquisition debt is netted against the
  company value: the stake counts in full once its net value is at least 40% of
  the stake, and proportionally below that. **Net value** is the unencumbered
  black economic interest against 25% (8 points; 6 for the other sub-sectors),
  plus each indebted black stake's net value — Formula A, graduated by the year
  of its loan (10% in year 1 rising to 100% in year 9), or Formula B, the lesser
  — capped at the line's own weighting (8, or 6; see fault 18). The sub-sectors
  other than Others carry two bonus lines (voting rights beyond 15%; economic
  interest at 32.5% / 40%).
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
  better of the two counts) — and the designated-group bonus. A first-time
  black-owned QSE/EME supplier earns the 1.2 recognition factor, as a
  supplier-development recipient or one on a 3-year contract does.
- **Enterprise and supplier development**: a contribution counts only for a
  QSE/EME beneficiary at least 51% black owned. Others and short-term insurers:
  SD 2% of NPAT (10), ED 1% (5), graduation and jobs bonuses, and an ED bonus
  for support of black stock brokers, fund managers and intermediaries (0.5%,
  2 points). Banks and long-term insurers score SD (1.8%, 7) and ED (0.2%, 3) on
  their empowerment financing scorecard (long-term insurers keep the
  stock-broker bonus; banks do not). Guarantees count at 50%, and **bad debts
  written off on ESD financing at 100%** — the toolkit does not apply the
  Code's "maximum of 50% of the non-recoverable target for banks and life
  offices"; please say if it should.
- **SED and consumer education** come from one table split by its Pillar
  column: SED 0.6% of NPAT (3; 0.7% for reinsurers), consumer education 0.4%
  (2), additional consumer education (bonus, 1), and the Fundisa Retail Fund
  (bonus, 2; a base line for reinsurers).
- **Empowerment financing** (banks and long-term insurers, 15 points):
  targeted investments 12 (banks: exposure on new loans against the
  balance-sheet plus additional targeted-investment exposure; long-term
  insurers: the targeted-investment portion against the qualifying exposure)
  and transaction financing 3 (the period's transaction financing against its
  target portion). It is the priority element in procurement's place.
- **Access to financial services** (12 points). Banks: transaction, service
  and sales points by share of the qualifying area (85% / 70% / 60%), a point of
  presence (3). Long-term insurers: appropriate products (3), market
  penetration (7, plus up to 0.25 for credit-life policies), transactional
  access (2, in tiers). Short-term insurers: appropriate products — 2 points
  shared equally by the products of the lines offered (4 personal, 6
  commercial, or all 10), none when the FSTC granted an exemption — and
  insurance policies (10; 8 personal + 2 commercial when both lines are
  offered); each measures the qualifying policies × their average compliance
  share against that line's target policies.
- **Levels** use thresholds scaled to the scorecard's own base points: each of
  100 / 95 / 90 / 80 / 75 / 70 / 55 / 40 is multiplied by base points ÷ 111.
  Base points (bonus points excluded): Others 106 (Level 1 from 95.50); banks
  and long-term insurers 121 (Level 1 from 109.01); short-term insurers 116
  (114 when exempt from appropriate products); 4 fewer in each when the
  combined management band loses its senior points (see *Also seen*). A failed
  priority element (net
  value, skills, procurement — empowerment financing for banks and long-term
  insurers — supplier development, enterprise development) drops the level by
  one; a discounted Level 8 is non-compliant.

### The empowerment financing denominator

The open question was what the grand total is out of for banks and long-term
insurers. The template answers it: the levels scale by the base points
('Scorecard Calculations'!F12), which include empowerment financing and access
to financial services — **121** for both (ownership 23, management control 21,
skills 20, procurement 15, empowerment financing 15, SD 7, ED 3, SED and
consumer education 5, access to financial services 12). With bonus points the
grand total is out of **138** for banks and **140** for long-term insurers
(Summary Scorecard C104); Others is 106 base, 120 with bonuses (117 for
reinsurers). We score the same.

## Toolkit formula faults (please confirm)

Each fault below is reworked by the parity referee from the toolkit's own
figures, and our scorecard scores what the formula evidently means.

1. **Skills: the "within the financial year" test moves down the page.**
   Skills Data, column "Within FY?" (and "Prior Year"), compares each training
   row with Validation!C2 as a *relative* reference, so row 2 compares with C3,
   row 3 with C4, and so on. The 6th, 13th and 25th training rows meet a text
   label there and drop out of every skills sum (every one of our companies
   with six or more training rows lost at least one); other rows are compared
   with unrelated dates. We count every row in the year.
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
   lines (8 points for Others and short-term insurers). Banks and long-term
   insurers are not affected: G6 and H6 are blank for them, and the discount
   test ('Scorecard Calculations'!C15) reads empowerment financing (H7 < G7,
   40% of its 15 points) in procurement's place, as we do.
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
10. **Management control: employees with disabilities.** 'MC Toolkit'!C111
    counts black people with disabilities including non-executive directors,
    while the employee count it divides by (C7) leaves them out. We count
    employees only, on both sides.
11. **Supplier development: minority investments count 0.** The benefit-factor
    lookup meets a duplicated "Minority Investment" row with no factor before
    the 70% row (the enterprise-development copy reads 70%). (Same as RCOGP
    Generic.) We use 70%.
12. **Banks and long-term insurers: ESD disappears without transaction
    financing.** The EF & ESD scorecards ('EF & ESD Scorecard - Banks' /
    '- Long Term', I27) take their "Current YTD" date from the
    transaction-financing rows (Validation!H168:H186), and the SD, ED,
    graduation, jobs and (long-term insurers) stock-broker lines filter the ESD
    rows by that date. A bank that recorded no transaction financing in the
    period scores 0 on all of them however much it spent. We read the ESD rows
    in their own period (the ESD Scorecard's, I16).
13. **Long-term insurers: transaction financing against the wrong target.**
    'EF & ESD Scorecard - Long Term'!I14 divides by the targeted-investment
    portion (C6) instead of the transaction-financing target (C8). We use C8.
14. **Long-term insurers: transactional access is typed in.** 'AFS Scorecard -
    Long Term'!H26 holds a typed, locked 80% (always 2 points) instead of the
    share of polygons entered (E16). We score the share entered, on the
    toolkit's own tiers (below 50% none; 60%–70% 1; 70%–80% 1.5; otherwise 2 —
    which also gives 2 points between 50% and 60%; **please confirm that tier**).
15. **Short-term insurers: commercial lines against the wrong target.** The
    sheet asks for the target policies where it labels them — D6 for the line
    offered, D7 for commercial lines when both personal and commercial lines are
    offered — but its formulas divide by D6 whenever personal lines are offered
    (so a personal-and-commercial insurer's commercial products and policies
    meet the *personal* target) and by D7 for a commercial-only insurer (a cell
    the sheet never labels for it, so every line scores 0). We measure each line
    against its own line's target.
16. **Additional consumer education is measured above the wrong target.**
    'SED & CE Scorecard'!I10 counts consumer-education spend above the *SED*
    target (0.6% of NPAT, F7) instead of above the consumer-education target
    (0.4%, F8). We use the consumer-education target.
17. **Levels: a total exactly on a threshold drops a level.** The round-down
    ('Scorecard Calculations'!C14) uses a strict "<". (Same as RCOGP Generic.)
18. **Banks and insurers: the net value line scores above its own
    weighting.** For banks, long-term and short-term insurers the net value
    line weighs 6 points (Summary Scorecard C27; 'Ownership Scorecard'!F17 =
    IF(Others, 8, 6)), but the formulas that score it use a hard-coded 8: the
    outer MIN of 'Ownership Scorecard'!J17, and 'Oustanding Debts Calcs'
    columns K and L (Formula A, × 8, capped at 8) and N (Formula B, × 8, capped
    at 8 in N1). So the line can score 8 of 6, and ownership more than its
    weighting. Excel showed net value 8 of 6 on seven of our eleven bank and
    insurer companies (and ownership 30 of 28 on two of them), each adding up
    to 2 points to the grand total; on an eighth, faults 7 and 8 hide it (the
    toolkit shows 3.57), and correcting them with the 8s left in gives 8 of 6.
    We score the line, and Formula A and B, against the line's own weighting,
    at most 6. Others (weighted 8) is unaffected. **Please confirm** the cap is
    the weighting, not 8.

## Also seen in the template

- **Management control: a combined band with no senior manager loses 4
  points.** When the entity says it does not distinguish other executives from
  senior management ('MC Toolkit'!C8 = "No") and employs no senior manager,
  the other-executive band falls back to its own 2 / 1 / 0 points, and the
  senior band's 4 points are passed neither to it nor to middle or junior
  management ('MC Calcs (Toolkit)'!K4:M4, K19:M19). Management control is then
  out of 17 instead of 21, and the level thresholds scale to 4 fewer base
  points (Excel confirmed it on two of our companies: an Others entity on 102
  base points, Level 1 from 91.89, and a long-term insurer on 117). It is not
  clear what the intended split is, so we follow the toolkit; **please rule**.
- **Banks: electronic access and active accounts** ('AFS Scorecard - Banks'
  rows 11 and 13) have no target, so the toolkit scores them 0 whatever is
  entered. We have no target to score them against either; they score only on
  a stated compliance answer, which the toolkit does not collect. **Needs your
  target.**
- **Short-term insurers: appropriate products** are scored as qualifying
  policies × compliance ÷ target policies per product (so one product can earn
  its share from policy volume alone), rather than as the share of products
  that are compliant. We follow the toolkit; please say if the Code means
  otherwise.
- **The STI access-to-financial-services sheet has its own period picker**
  ('AFS Scorecard - Short Term'!H34:H35), blank in the shipped template: until
  someone picks "Current YTD" the actual column reads nothing.

## Still different

Nothing that was compared. What was not compared, and why:

- **YES**, **Stock Exchanges**, and the **Prior Year / Projected** columns (see
  *Not checked* above).
- **QSE financial institutions.** This workbook has no QSE scorecard, so our
  FSC QSE scorecard was not checked against it.
- **Banks: electronic access and active accounts** score 0 on both sides in
  every company (no target in the toolkit; see *Also seen*).
- **Training manager's salary and training overhead**: the toolkit shares them
  out by a typed workforce row (fault 3); our companies type that row from
  their own employees, so both sides share them the same way.
- **Records without the inputs below.** The comparison is on companies that
  carry every input the toolkit reads. A record without them is scored as
  the next section says, not the toolkit's way, on the lines concerned.

## Inputs the live app does not capture yet

The toolkit method reads some inputs that no screen, upload or import in the
app fills yet; only the synthetic companies above carry them. A live FSC
record lacks them, so the scorecard handles each one in a way that a missing
input never costs points the company earned elsewhere, or fails a priority
element by itself:

| Toolkit input | What reads it | Without it |
|---|---|---|
| Payroll per management level ('Client Information'!I20:I23) and each training row's Management Position | Skills: the four per-level spend lines (11 of the 20 base points), and which learners count as unemployed | Skills is scored on the leviable amount, as every FSC record was before the toolkit method (learning programmes 11, bursaries 4, disabled 1, learnerships 4, absorption bonus 3; sub-minimum 8), and the element says why. Without this, the per-level lines read 0 whatever was spent: with these two inputs removed from our 27 companies, skills fell to 1.70–8.00 and failed its sub-minimum on all 27; on the leviable amount it is 4.33–16.25 and passes on 15. |
| Total allocated trade value; suppliers marked intermediary, stock broker or fund manager | Procurement: the two FSC bonus lines | Both score 0, and the element says which input is missing. Nothing measured them before (the earlier scorer had only the designated-group bonus). They are bonus lines, so no sub-minimum depends on them. |
| A supplier marked first-time supplier | Procurement: one ground for the 1.2 recognition factor | Not applied on that ground (a supplier-development recipient or a 3-year contract still earns it). The toolkit as shipped never applies it either (fault 5). |
| ESD rows marked as supporting black stock brokers, fund managers or intermediaries | ED: the stock-broker bonus (Others and insurers) | The spend captured for it as one figure on the ESD build form ("ED support of black stockbrokers / fund managers / intermediaries") counts, as it did before. |
| The SED & CE rows' Pillar column (SED, Consumer Education, Fundisa) | SED, consumer education, additional consumer education, Fundisa | The SED page's own figures count: Consumer Education spend, Additional CE spend (where larger than the consumer education beyond its 0.4% target) and Fundisa spend; rows count as SED. Held that way, every one of our companies scores SED & CE exactly as with the Pillar column. |
| An indebted shareholder's loan date | Net value: Formula A's graduation factor | Read as year 1, and it changes nothing: Formula A divides by the graduation factor, so it is never below Formula B, and the lesser of the two counts. Ownership is the same on all 27 companies with or without loan dates (only a loan dated after the data date would differ). |
| Long-term insurers: credit-life policies on book | Market penetration: up to 0.25 extra | No extra. |
| Short-term insurers: lines of products, FSTC exemption, target policies, qualifying policies per product | Access to financial services (12 points) | The earlier calculator scores it from the yes/no product answers the AFS page collects, and the element says so. |

apps/web/Toolkit/src/lib/calculators/__tests__/fscToolkit.liveInputs.test.ts
keeps this so: each of the 27 Excel-scored companies is scored again without
any of these inputs (consumer education, Fundisa and stock-broker spend held
as the app's own figures), and skills must equal the leviable-amount score;
ownership, management control, SD, ED, SED & CE and empowerment financing must
equal the complete record's; and no priority element may fail, nor the level
be discounted, unless it also does with every input or on the earlier scorer.

To score these lines the toolkit's way, the app needs: a payroll per
management level; a Management Position column on the skills register; the
allocated trade value, and intermediary / stock broker / fund manager /
first-time supplier columns on the procurement register; a stock-broker flag
on ESD rows; a Pillar column on SED rows; credit-life policies on the
long-term AFS page; and the short-term qualifying-policies table — each in
the screens, the upload mapping and storage.

## Rulings needed

1. Bad debts written off on ESD financing at 100% for banks and long-term
   insurers, or capped (*How the FSC toolkit scores*, ESD).
2. The long-term insurers' transactional-access tier between 50% and 60%
   (fault 14).
3. The combined other-executive / senior band that loses 4 points when no
   senior manager is employed (*Also seen*). Two of our companies hit it; both
   match the toolkit's 17-point management control.
4. A target for banks' electronic access and active accounts.
5. Short-term insurers' appropriate products: policy volume per product, or
   the share of products that are compliant.
6. Banks and insurers' net value: capped at the line's weighting (6), as we
   score it, or at 8 as the toolkit's formulas do (fault 18).
7. Each of the 18 formula faults above: confirm that what we score is what the
   toolkit means.
