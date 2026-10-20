# Our B-BBEE calculator against the Empower toolkits: where every sector stands

For the owner and the sector expert. Plain English; the detail for each sector
is in its own note in this folder.

## How this was checked

For each sector we invented companies (made-up names and figures, no client
data), typed each one into a fresh copy of that sector's Empower spreadsheet,
let Excel work out the scorecard, and fed the same company into our
calculator. Then we compared the two line by line: every indicator, every
element total, the grand total, the achieved level and the discounted level.
A line matches when the two agree to within half a cent of a point (levels
exactly).

The rule we worked to, as the owner decided: the spreadsheet is the
reference, except where one of its formulas is evidently broken. There we do
not copy the break; we score what the formula evidently means, worked out from
the spreadsheet's own figures, and list the fault so the sector expert can rule
on it.

All six sectors now live in one version of the calculator, and every
comparison below was run again on that combined version.

| Sector | Invented companies | Figures compared | Match | Spreadsheet faults found |
|---|---|---|---|---|
| RCOGP Generic | 17 | 782 | all | 5 |
| RCOGP QSE | 19 | 608 | all | 7 |
| ICT Generic | 16 | 834 | all | 10 |
| ICT QSE | 23 | 736 | all | 9 (and 3 that change nothing we compare) |
| AgriBEE Generic | 22 | 1,012 | all | 8 |
| FSC (Others including reinsurers, Banks, Long-term and Short-term insurers) | 27 | 1,693 | all | 18 |

## The sectors

**RCOGP Generic.** Every line on all 17 companies matches. Five spreadsheet
faults are corrected: acquisition debt is netted differently depending on
which row the shareholder sits in, and the whole indebted stake is counted as
black; the designated-groups and new-entrants targets are cut short so those
lines can never score; a supplier development minority investment is
recognised at nothing because the factor table has a blank duplicate row; a
total exactly on a level boundary drops a level; and the Skills sub-minimum
test reads empty cells, so it always fails. This was the first sector done and
the template the others were measured against.

**RCOGP QSE.** Every line on all 19 companies matches (608 figures). Seven
faults are corrected: the shortened targets (black economic interest scored
against 20% instead of 25%, and the new-entrants-or-designated-groups line that
can never score), debt netting by row order, the absorption bonus divided by
the wrong number, first-time suppliers never earning the 1.2 factor (the
formula reads the 3-year-contract answer), the minority-investment blank row,
the discount test (it applies the large-enterprise rule and two of its checks
can never fail), and the level-boundary lookup. Because of these the
spreadsheet's own level differs from ours on 9 companies and its discounted
level on 11.

**ICT Generic.** All 834 figures on 16 companies match: every scorecard line
and also the recognised amount of each of the 98 enterprise and supplier
development contributions, to the cent. Ten faults are corrected: the two
ownership lines that can never score, debt netting by row order, the minority
investment at nothing, employed learners counted as unemployed in five of six
groups, training-admin costs on the disabled line going to African men only,
first-time suppliers never earning the 1.2 factor, both job-creation bonus
tiers scoring together, the level-boundary lookup, the level being read from
the projected column (on one company that alone costs a level), and a loan
above prime being recognised at a negative amount.

**ICT QSE.** All 736 figures on 23 companies match. Sixty-four line values
match only once a faulty formula is read as meant. Nine faults are corrected:
the new-entrants-or-designated-groups target cut to nothing, debt netted three
different ways, ownership points that can go below zero, the middle-and-junior
management line with no formula in the combined layout, first-time suppliers
never earning the 1.2 factor, the minority investment at nothing, both
job-creation bonuses added together, the Skills and procurement sub-minimum
checks that can never fail, and the level-boundary lookup. Three more faults
change nothing we compare (the YES checks read the wrong rows, the employee-time
branch that can never be reached, a display-only gap column). The achieved
level the spreadsheet prints differs from ours on 14 companies.

**AgriBEE Generic.** All 1,012 figures on 22 companies match (the Skills lines
compared before rounding to the cent). Eight faults are corrected: debt
netting by row order, loans older than eight years earning no net value, the
"unemployed black people in training" line counting employed learners,
first-time suppliers never earning the 1.2 factor, the minority investment at
nothing, an Enterprise Development sub-minimum that can never be met (so the
spreadsheet discounts every AgriBEE company), disabled non-executive directors
counted against employees, and the level-boundary lookup. Twenty of the 22
companies touch at least one fault.

**FSC.** All 1,693 figures on 27 companies match: 16 on the generic (Others)
scorecard, seven of them reinsurers; 4 banks; 3 long-term insurers; 4
short-term insurers (personal lines, commercial lines, both, and one exempted
by the FSTC). Eighteen faults are corrected, among them a "within the
financial year" test that slides down the training register, a leviable
amount and headcount typed in from another company and locked, a procurement
sub-minimum that can never fail, bank and long-term insurer ESD that vanishes
without transaction financing, short-term insurers' commercial lines measured
against the wrong target, and net value that can score 8 points on a 6-point
line. The Stock Exchanges scorecard was not compared (we have no such
sub-sector), and the workbook has no QSE scorecard, so our FSC QSE scorecard
was not checked against it.

## Rulings we ask the sector expert for

Across sectors (the same question in several templates):

1. **Should every spreadsheet fault be read as we read it?** Each sector note
   lists its faults with the cell, what it does and what we score instead.
   The faults that recur in several templates (debt netting by row order, the
   blank minority-investment row, first-time suppliers never earning the 1.2
   factor, the level-boundary lookup) are read the same way everywhere.
2. **Discounting a QSE.** RCOGP QSE applies the Codes' QSE rule (Ownership
   plus either Skills or the Enterprise and Supplier Development element),
   because its spreadsheet's test is broken. ICT QSE follows its spreadsheet,
   which discounts a QSE when any priority element misses its sub-minimum, as
   for a large company. The two QSE templates therefore discount differently
   today. Which rule should each follow?
3. **The QSE absorption bonus.** Both QSE templates have the same cell. For
   RCOGP QSE we divide the black learners absorbed by the learners who
   completed a learnership, apprenticeship or internship while unemployed (the
   line's own headcount, the formula read as meant); for ICT QSE we follow the
   formula as written, the black share of the learners absorbed, so one black
   learner absorbed out of fifty earns all 5 points. Which reading is right for
   each? And should the RCOGP QSE headcount count black learners only?
4. **Enterprise and supplier development beneficiaries.** The RCOGP QSE, ICT
   Generic, ICT QSE and AgriBEE templates work out whether a beneficiary
   qualifies (51% black-owned EME or QSE; for Enterprise Development an ICT or
   agricultural company) but count the contribution either way. RCOGP Generic
   and FSC exclude a beneficiary that does not qualify. We follow each
   template. Should the others exclude non-qualifying beneficiaries?
5. **Employee time given to development or socio-economic causes.** Every
   template means to turn a monthly salary into an hourly rate (divide by 160),
   but that part of the formula can never be reached, so the full amount times
   60% (80% for socio-economic development) counts. How should the amount be
   captured: as a monthly salary, or as the value of the time given?
6. **A socio-economic contribution nobody has marked as a sector-specific
   initiative.** ICT QSE counts only those marked Yes, as its spreadsheet
   does. ICT Generic and AgriBEE Generic still count an unanswered row,
   because the app does not ask the question on every path and older records
   have no answer; their spreadsheets count a blank as No. Should a blank count?
7. **The "% of spend benefiting black individuals" on socio-economic rows** is
   collected but never used by any template; the full amount counts. We follow
   that.

Sector by sector:

- **RCOGP QSE:** the absorption headcount (above); whether a QSE should exclude
  non-qualifying beneficiaries (above).
- **ICT Generic:** whether disabled learners without the EAP split should share
  one 15% cap for the whole pool (the spreadsheet gives each group its own);
  the absorption denominator counting learners of every race, foreign
  nationals included; the two choices the template ships blank, which score
  procurement and the disabled line 0 until someone picks.
- **ICT QSE:** supplier and enterprise development targets of 1% of NPAT each,
  as the spreadsheet says (our settings had 2% from the July gazette review);
  a black shareholder whose debt is larger than the stake taking the shortfall
  off the total.
- **AgriBEE Generic:** whether the scarce-and-critical-skills declarations or
  the computed share (at least 85%) should decide those lines; net value
  measured against 25% (the RCOGP templates use 100%); the level read from the
  projected column.
- **FSC:** bad debts written off on ESD financing at 100% for banks and
  long-term insurers, or capped as the Code says; the long-term insurers'
  transactional-access tier between 50% and 60%; the combined
  other-executive and senior band that loses 4 points when no senior manager
  is employed; a target for banks' electronic access and active accounts;
  short-term insurers' appropriate products by policy volume or by the share
  of compliant products; banks' and insurers' net value capped at the line's
  6 points or at 8 as the formulas do.

## What the live app does not capture yet

Each of these is an answer a toolkit reads that no screen, upload or import in
the app fills yet (or fills on only some paths). Our invented companies carry
them; a live record does not. Without the answer, the scorecard is never
scored lower than the company earned elsewhere, and a missing answer never
fails a priority element by itself.

| Sector | The answer | Which line needs it | What happens without it |
|---|---|---|---|
| Every sector | The prime rate and the actual interest rate on an ESD loan or investment (entered in the workbook, but not passed to the calculator) | Supplier and Enterprise Development: below-prime loans and lower-dividend investments | Those contributions are recognised at nothing. (Reported by the ICT Generic review; filed as a separate fix.) |
| RCOGP QSE, ICT Generic, ICT QSE, AgriBEE Generic, FSC | "First-time supplier?" for each supplier | Procurement: one of the grounds for the 1.2 recognition factor | The workbook's supplier register now asks it for all five; the Toolkit's procurement page and its bulk upload do not, and the workbook's Excel export does not write it. Unanswered counts as No, which only ever withholds the 1.2 factor on that ground. |
| ICT Generic | "ICT-specific initiative?" on each socio-economic contribution | Socio-economic development | The workbook and the Excel import ask it; the Toolkit's socio-economic page does not ask it for ICT Generic. An unanswered contribution still counts. |
| ICT Generic | The verification agent's sign-off on measuring disabled learners against the EAP split | Skills: disabled learners | Asked in the workbook's Skills details only. Unticked, the disabled line is one pool against the whole target. |
| ICT QSE | "ICT-specific initiative?" | Socio-economic development | Asked on every path (workbook, Excel import, the Toolkit page and its bulk upload). An unanswered contribution counts nothing, and the page shows how much did not count and why. |
| AgriBEE Generic | The two scarce-and-critical-skills declarations (spend, headcount) | Skills: the spend lines and the headcount lines | Not asked anywhere. An unanswered declaration does not zero anything (the spreadsheet treats a blank as No). |
| AgriBEE Generic | "Agri-specific initiative?" on each socio-economic contribution | Socio-economic development | Not asked anywhere. An unanswered contribution still counts (the spreadsheet counts a blank as No). |
| FSC | Payroll per management level, and each learner's management position | Skills: the four per-level spend lines (11 of the 20 base points), and which learners count as unemployed | Skills is scored on the leviable amount, as every FSC record was before, and the element says why. |
| FSC | The total allocated trade value, and suppliers marked intermediary, stock broker or fund manager | Procurement: the two FSC bonus lines | Both bonus lines score 0 and the element says which answer is missing. |
| FSC | ESD rows marked as supporting black stock brokers, fund managers or intermediaries | Enterprise Development: the stock-broker bonus (Others and insurers) | The single figure the ESD page already collects for it counts, as before. |
| FSC | The pillar of each socio-economic row (SED, consumer education, Fundisa) | SED, consumer education, additional consumer education, Fundisa | The socio-economic page's own figures count; every row counts as SED. On all 27 companies this scores the same. |
| FSC | An indebted shareholder's loan date | Net value: the graduation factor | Read as year 1; on all 27 companies ownership is the same with or without it. |
| FSC, long-term insurers | Credit-life policies on book | Market penetration: up to 0.25 extra | No extra. |
| FSC, short-term insurers | Lines of products, FSTC exemption, target policies, qualifying policies per product | Access to financial services (12 points) | Scored from the yes/no product answers the page collects, as before, and the element says so. |

## Release notes: what changes for existing data

When this is deployed, every client in these six sectors is scored the
toolkit's way the next time their scorecard is worked out. Scores on existing
records will move. The changes most likely to surprise:

- **ICT QSE socio-economic development:** only contributions marked as an
  ICT-specific initiative count. Before, every contribution counted. Every
  existing ICT QSE contribution not answered Yes stops counting until someone
  answers Yes; the socio-economic page shows how much is not counted and why.
- **ICT Generic socio-economic development:** a contribution answered No stops
  counting. Rows brought in by the old Excel import carry a No the importer
  wrote itself (on every row), and the workbook shows them as No, so those rows
  stop counting until someone changes them to Yes. Any ICT client whose
  socio-economic development came in through the import should be looked at
  before release. Pasting into the "ICT-Specific?" column turns a blank cell
  into No, as it does for every Yes/No column.
- **Older socio-economic records:** the answer used to be kept in two places.
  It is now kept in one. A record written before keeps its Yes; its No was a
  default nobody chose, and is now read as unanswered (which counts for ICT
  Generic and AgriBEE Generic, and does not for ICT QSE, exactly as each
  sector's own version scored it).
- **ICT QSE:** supplier and enterprise development targets are 1% of NPAT
  each (were 2%), and a QSE is discounted when any priority element misses its
  sub-minimum.
- **ICT Generic:** a shorter-payment contribution without both an invoice
  date and a payment date is recognised at nothing (it used to get the
  table's 15%).
- **AgriBEE Generic:** training that ended before the measurement period began
  no longer counts; net value is measured against 25%.
- **RCOGP QSE, ICT Generic, ICT QSE, AgriBEE Generic:** the all-suppliers
  procurement line counts every supplier's recognised spend, whether or not it
  was marked as an empowering supplier; guarantees count at 50% (the Codes say
  3%); an Enterprise Development sub-minimum now applies.
- **RCOGP QSE Skills, absorption:** a learner on a fixed-term contract now
  counts as not employed, as in every other toolkit sector (before, only
  "Unemployed" did). This came from combining the two QSE methods; ICT QSE
  already did this.
- **FSC:** Others, Banks, Long-term and Short-term insurers are scored by a new
  calculator that follows the FSC toolkit. Records without the answers listed
  above fall back as described there (Skills on the leviable amount, the two
  procurement bonuses at 0, and so on).
- **Workbook forms:** the supplier register now shows "First-time Supplier?"
  for RCOGP QSE, ICT QSE, AgriBEE Generic and FSC (it already did for ICT
  Generic).
- **Skills page:** for ICT Generic and AgriBEE Generic, the per-group detail
  under each Skills line now shows that line's learners (before, the disabled
  line showed the bursary learners and the learnership line the disabled
  ones), and ICT Generic's per-category figures now show amounts after its 15%
  cap.
- **Deploy both services together.** An ICT QSE answer typed on the Toolkit's
  socio-economic page is saved by the api service, which needs this version to
  keep it; until it is deployed the answer is dropped on save.

The score gate over the 16 Toolkit Testing Data workbooks moves as the
integration report lists; each move is explained there by the sector whose
toolkit method caused it.
