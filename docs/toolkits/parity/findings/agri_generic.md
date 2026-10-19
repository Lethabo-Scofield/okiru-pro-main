# AgriBEE Generic — our scorecard against the Empower toolkit

For: Chengetai (sector expert). Reference: the Empower "BBBEE Toolkit (Agri Generic)" master, version 1.0.1 (Amended AgriBEE Sector Codes, Generic scorecard, 132 points).

## How this was checked

We made up twenty-two companies (invented names, no real client data) and typed each one into a fresh copy of the Empower AgriBEE spreadsheet. Excel then worked out every scorecard line. We fed the same company into our own scorecard and compared the two, line by line: all 36 indicators on the Summary Scorecard, the seven element totals, the grand total, the achieved level and the discounted level (46 figures per company). A line "matches" when the two agree to within half a cent of a point.

The companies come in eight kinds:

- **Ordinary** (seven of them): mid-sized agri businesses, every register filled, some with acquisition debt, training-manager and overhead costs, a procurement buffer, loss years in the financial history.
- **Small** (three): few rows everywhere.
- **Edge** (three): suppliers exactly on the 51% black and 30% black-women thresholds; QSE and EME suppliers that are first-time suppliers with no 3-year contract; acquisition debt on a non-black shareholder, on a stake whose debt is more than 60% of its value, and on a loan more than eight years old; a disabled black non-executive director; a training programme that ended before the year began; a below-prime loan, a lower-dividend investment, shorter payment terms and a Supplier Development minority investment; socio-economic rows that are and are not agri-specific initiatives.
- **Lean** (one): no Enterprise and Supplier Development or socio-economic rows at all, no acquisition debt, no training-admin costs.
- **Discounted** (two): tiny training, procurement and development spend, so the sub-minimums fail; both scarce-and-critical-skills declarations answered "No".
- **Boundary** (one): every line either full or empty, so the total is exactly 80.00 points, the Level 4 boundary.
- **Benefit factors** (one): Enterprise, Supplier and socio-economic development spend kept below target, so every benefit factor shows in the points: a below-prime loan, a lower-dividend investment, two shorter-payment arrangements (6 and 29 days), employee time, a guarantee on each side, overheads, an interest-free loan, discounts, a Supplier Development minority investment, and every socio-economic contribution type (one row not an agri-specific initiative).
- **Coverage** (four): ordinary companies that also reach what the others leave alone: acquisition debt on a shareholder who is not black and on one who is partly black, sitting in later rows of the share register; exclusions in the total measured procurement spend (in two of them the spend plus the procurement buffer outweighs it, in two the measured spend stays the larger); stationery costs; a foreign black learner and a foreign black senior manager (neither counts as black); and, in two of them, the scarce-and-critical-skills spend declaration answered "No" while the headcount one is "Yes". In two of the four, black ownership is kept well below the 25% targets so the debt netting shows in the points (in one of those, the partly black holder's loan is more than eight years old).

Three of the ordinary companies also answer "No" to the headcount declaration only, so the headcount lines score nothing while the spend lines still do.

## Result

**All 1,012 figures match** (22 companies, 46 figures each): every indicator line, every element total, the grand total, the achieved level and the discounted level, each to within half a cent of a point. The Skills lines are compared as worked out, before our scorecard rounds them to the cent for display (one absorption bonus is exactly 0.625 points, which shows as 0.63).

Twenty of the 22 companies contain at least one figure where the spreadsheet's own formula is faulty (listed below). Those figures are compared with what the formula evidently means, worked out from the spreadsheet's own numbers, and the line-by-line report shows the spreadsheet's own figure beside it. How often each fault changed a number:

| Fault (numbered as below) | Companies where it changed a figure | Lines changed |
|---|---|---|
| 4. First-time suppliers never earn the 1.2 factor | 13 | 28 procurement lines |
| 3. Unemployed-learners line counts employed learners | 11 | 11 |
| 1 and 2. Debt netting by row order; loans older than eight years | 6 (the old-loan fault decides the net value in 3 of them) | 5 economic-interest lines, 6 net-value lines |
| 5. Supplier Development minority investment at 0 | 2 | 2 |
| 7. Disabled non-executive director | 1 | 1 |
| 6. Enterprise Development sub-minimum can never be met | 5 companies the spreadsheet discounts although every sub-minimum is met | 5 discounted levels |
| 8. Total exactly on a level boundary | 1 (exactly 80.00 points) | 1 achieved level, 1 discounted level |

Because of the corrected lines, the spreadsheet's own achieved level differs from ours in 5 companies (in 4 because its total includes the faulty lines, in 1 because of the boundary) and its own discounted level in 8.

Two companies (one discounted, one coverage) touch none of the faults; there every figure is the spreadsheet's own.

## What we changed so our scorecard matches the AgriBEE toolkit

These follow the AgriBEE spreadsheet for AgriBEE Generic clients only. No other sector's scoring moved.

1. **Ownership** is worked out the toolkit's way: each shareholder counts by the value of their shares; a black shareholder's acquisition debt is subtracted from the value of their stake (the stake counts in full once its value after debt reaches 40% of it, pro rata below); net value is measured against 25%, as the AgriBEE spreadsheet does (the RCOGP template measures it against 100%). Designated groups are measured against 4% and new entrants against 2%.
2. **Skills Development** is worked out the AgriBEE toolkit's way:
   - The 8-point spend line is split by black group (African, Coloured and Indian, men and women) in proportion to the economically active population, each group capped at its share. It counts course costs for categories A to E and stipends for categories B, C and D; category F and G course costs and all travel, accommodation, catering, stationery, venue and other costs count only up to 15% of all training spend (all learners, all races), per group share; and 15% of the training manager's salary and of training overheads is added, shared by each group's share of the workforce.
   - The 4-point disability line counts the same costs for black learners with disabilities (the 15% cap on all training spend, no group split).
   - The two 4-point headcount lines count black learners in learnerships, apprenticeships and internships (categories B, C and D), each group against its share of 2.5% of headcount. The second counts unemployed learners only (see fault 3).
   - The 5-point absorption bonus is the unemployed black learners who completed a learnership and were absorbed, out of all black learners who completed one, against 100%.
   - Only training that ended after the measurement period began counts.
   - The two declarations on the Skills Toolkit sheet ("at least 85% of the skills spend / headcount for black people is in scarce and critical skills"): a "No" scores the spend lines (or the headcount lines) 0, as the spreadsheet does. Our app does not ask these questions yet, so an unanswered declaration does not zero anything (the spreadsheet treats a blank as "No").
   Before this, our AgriBEE skills lines had no group split, a 25% cap on F and G and a separate cap on other costs, a spend-based reading of the unemployed line, and absorption over all black learners.
3. **Preferential procurement**: the "spend on empowering suppliers" line counts every supplier's recognised spend (the spreadsheet never looks at the "Empowering supplier?" answer). A 51%-black-owned QSE or EME supplier earns the 1.2 recognition factor if it is a Supplier Development beneficiary, holds a 3-year contract, or is a first-time supplier (see fault 4).
4. **Guarantees** for Enterprise and Supplier Development are recognised at 50% of the guarantee, as in the template's benefit-factor table.
5. **Enterprise Development sub-minimum**: 40% of the 5-point base line (2 points). Our AgriBEE settings had none (see fault 6 for what the spreadsheet does).
6. **Socio-economic development**: only rows marked as an agri-specific initiative count, at their benefit factor. Our app does not ask this yet, so an unanswered row still counts (the spreadsheet counts a blank as "No").

## Faults in the AgriBEE spreadsheet (we did not copy these)

Each is a formula that does not do what it evidently means. Where one of them changes a number, our scorecard shows what the formula means and the line-by-line report shows both figures. Please confirm each reading.

1. **Acquisition debt netting depends on row order ("Oustanding Debts Calcs", column H).** The first indebted shareholder is netted one way (the stake counts in full once its value after debt reaches 40% of the stake, pro rata below), every later one another way (plain value after debt), and the indebted shareholder's whole stake is counted as black even when only part of it is. A non-black shareholder's debt on a later row is even subtracted from black economic interest and from net value. We net every black indebted shareholder with the first row's rule, for the black share of the stake only, and a non-black shareholder's debt not at all. This is the same fault, and the same reading, as in the RCOGP Generic and RCOGP QSE templates. It moves "economic interest of black individuals" and "net value". (In two of our test companies a non-black shareholder with debt sits in the second row: the spreadsheet subtracts 15% of the company's value from black economic interest for it.)
2. **Loans older than eight years earn no net value ("Oustanding Debts Calcs", columns F and G; "Ownership Calcs Formula" A3:B11).** Net value for an indebted holder is the lower of Formula A (value after debt against 25% times the time-based graduation factor) and Formula B (value after debt against 25%). The graduation factor is looked up from a table that stops at year 9, so a loan taken out more than eight years before the measurement date finds no factor, reads 0, Formula A becomes 0, and the holder's net value scores nothing. A loan that old has evidently passed the last step of the table (100%). We use 100% from year 9 on. (With any factor above 0, Formula A is never lower than Formula B, so in practice the net value of an indebted holder is Formula B.)
3. **The "unemployed black people in training" line counts employed learners too ("Skills Calcs", cells F40 to F45).** Only the African-male cell (F40) tests that the learner was unemployed; the other five cells (Coloured, Indian, men and women, and African women) count every black learner in a learnership, apprenticeship or internship, employed or not. So the line usually scores the same as the learnership line above it. We count unemployed learners in all six groups.
4. **First-time suppliers never earn the 1.2 factor ("Procurement Data", column "First-time supplier? [Scenario].Calcs").** When no scenario answer is typed, the formula that should fall back on the supplier's "First-time supplier?" answer falls back on its "3 year contract in place?" answer instead, so the first-time answer is ignored (and a 3-year contract counts twice over, harmlessly). We read the first-time answer. (The same fault is in the RCOGP QSE template.)
5. **Supplier Development minority investments recognised at 0 ("ESD and SED Calcs", the Supplier Development benefit-factor table).** The table has the "Minority Investment" row twice; the first copy has no factor, and the lookup stops at it, so a Supplier Development minority investment counts for nothing. The Enterprise Development table says 70%. We use 70%. (Same fault as the RCOGP templates.)
6. **The Enterprise Development sub-minimum can never be met ("Scorecard Calculations", cell F8).** The discount test compares the 5-point Enterprise Development base line with 40% of 15 points (6 points), so it always fails and every AgriBEE entity is discounted one level, whatever it scores. The Summary Scorecard's own sub-minimum flag for the same line (H62) uses 40% of the line's 5 points, and every other element in the same test uses 40% of its own weighting. We use 40% of 5, which is 2 points.
7. **Disabled non-executive directors ("MC Toolkit", row 111).** The disabled-employees ratio counts black disabled people on every row of the register, non-executive directors included, but divides by employees only (non-executive directors excluded). We leave non-executive directors out of both, as the RCOGP template's own management sheet does.
8. **A total exactly on a level boundary drops a level ("Scorecard Calculations", cell C12).** The lookup asks for the highest boundary strictly below the total, so exactly 80.00 points is Level 5, not Level 4. We give the level at the boundary. (Same fault as the RCOGP templates.)

## Things the spreadsheet does that we follow, but you may want to look at

- **No beneficiary test on Enterprise and Supplier Development.** The AgriBEE template's "Qualify?" column checks whether the beneficiary is a 51% black-owned EME or QSE (and, for Enterprise Development, an agricultural company), and "Recognised Amount" tests it, but both outcomes give the same amount, so every contribution counts whoever the beneficiary is. The RCOGP Generic template does exclude non-qualifying beneficiaries. We follow the AgriBEE spreadsheet (count everything). The Codes require qualifying beneficiaries, and the template evidently meant to check "agricultural company" for Enterprise Development; please say whether AgriBEE should exclude them.
- **Time of employees** (Enterprise and Supplier Development): the template means to divide the monthly salary by 160 hours, but that branch of the formula can never be reached, so the full amount times 60% counts. We follow the spreadsheet; please say whether the amount entered is meant to be a monthly salary.
- **The "% of spend benefiting black individuals"** on socio-economic development is collected but never used: the full amount counts (at its benefit factor) if the row is an agri-specific initiative. Same as the Generic template; we follow it.
- **The scarce-and-critical-skills declarations.** The spreadsheet works out the actual share of black learners' spend and headcount in scarce and critical skills (Skills Toolkit O9 and O10, from the "Scarce or Critical Skills?" column) but only warns about it; what zeroes the lines is the typed-in "Yes"/"No" in D10 and D11, and a blank counts as "No". We follow the declarations. Please say whether the computed share (at least 85%) should decide it instead.
- **The level is worked out from the "Projected" column ("Scorecard Calculations" C3:C10 read column J of the Summary Scorecard, not the actual column F).** With no scenario figures typed in, the two columns are the same, which is how every one of our test companies was filled. A user who types scenario figures would see the actual level move with them.
- **Scenario answers in the supplier register replace the actual ones.** Each "[Scenario]" column on the Procurement Data sheet (size, level, black and black-women ownership, designated-group ownership, Supplier Development recipient, 3-year contract, first-time supplier), when filled in, is used instead of the supplier's current answer in the actual procurement score as well as the projected one. Our app has no scenario planning, so we use the current answers; our test companies leave the scenario columns blank.
- **Exit dates and "Continuing Consequences" holders never change ownership.** The share-percentage formula has a branch meant to keep a "Continuing Consequences" holder's share until its expiry date, but the branch can only be reached when the first branch already applies, so it never changes anything. Exit dates and dates of tax therefore never move a score.
- **Net value is measured against 25%** (the AgriBEE spreadsheet divides by the first characters of the 25% voting-rights target), where the RCOGP templates measure it against 100%. We follow the AgriBEE spreadsheet.
- **YES**: the spreadsheet adds the YES reward on its own rows, after the B-BBEE total and the two levels; it never changes them. The AgriBEE training register has no YES column, so the YES rows themselves were not compared.

## Still different

Nothing, among the 46 figures compared for each company.

What these checks do not cover:

- **The YES rows** (Summary Scorecard row 71 and the YES sheet). The spreadsheet adds the YES points there only; they never change the B-BBEE total or either level, and our test companies do not qualify for YES. Our app records YES youth on the training register, which the AgriBEE register has no column for, so the YES workings were not compared.
- **Scenario and projected figures, prior-year periods and manual overrides.** Every test company is measured on "Current YTD" with "Actual" procurement spend, no scenario answers, and none of the typed-in override cells (the Ownership Scorecard's manual column, the "Actual [Manual]" and "Scenario [Manual]" cells on the Skills and Management sheets) filled.
- **Inputs the scorecard never reads**: ID numbers (the spreadsheet reads a gender from an ID number only in its prior-year management columns, which are not scored; our test companies carry no ID numbers), provinces, business units, employee codes, ABET and mandatory-training answers, ages, the beneficiary's "Initiative" and "New Contribution?" answers, and the "% of spend benefiting black individuals" on socio-economic rows (see above).
