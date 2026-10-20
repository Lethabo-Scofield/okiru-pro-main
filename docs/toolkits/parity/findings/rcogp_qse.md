# RCOGP QSE — our scorecard against the Empower toolkit

For: Chengetai (sector expert). Reference: the Empower "BBBEE Toolkit (RCOGP QSE)" template, version 1.1.

## How this was checked

We made up nineteen small companies (invented names, no real client data) and typed each one into a fresh copy of the Empower QSE spreadsheet. Excel then worked out every scorecard line. We fed the same company into our own scorecard and compared the two, line by line: every indicator, every element total, the grand total, the achieved level and the discounted level. A line "matches" when the two agree to within half a cent of a point (our scorecard shows each line to two decimals; the spreadsheet keeps the full figure in the cell).

Eight of the companies are random (big and small registers, profit and loss years, debt, most kinds of contribution). Eleven were built to hit the edges:

- **Nothing to score**: no black shareholders, an all-white management team, no training, no development or socio-economic spend.
- **Exactly 75 points**: every line either full or empty so the total lands exactly on the Level 5 boundary.
- **The QSE discount rule**: Ownership and Skills pass their sub-minimums, Supplier Development is empty.
- **Skills fails, the rest passes**: Ownership and every Enterprise and Supplier Development line pass, Skills misses its sub-minimum, so a QSE keeps its level.
- **Skills and Procurement both miss**: Ownership, Supplier and Enterprise Development pass, Skills and Preferential Procurement miss their sub-minimums, so a QSE is discounted.
- **Everything full**: 108 out of 108.
- **Ownership fails at Level 8**: net value below its sub-minimum, total in the Level 8 band.
- **Every bonus and every calculated factor**: absorption, designated-group suppliers, the Enterprise Development graduation and jobs bonuses, each route to the 1.2 procurement factor, a minority investment, a below-prime loan, shorter payment terms, guarantees, a procurement buffer and exclusions, payroll above the skills levy figure, training-manager and training-overhead costs, a typed-in deemed NPAT.
- **Acquisition debt**: four shareholders, three of them still paying for their shares, one of those not black.
- **YES**: the YES sheet filled in so the company qualifies (prior-year level, chosen tier, Skills as the priority element).
- **The remaining contribution types**: overhead costs, time of employees (development and socio-economic), an interest-free loan and a lower-dividend investment for Supplier Development, free professional services for Enterprise Development, a beneficiary that is neither an EME/QSE nor 51% black owned, and the stationery and training-venue costs on the training register.

## Result

**Everything matches.** On all nineteen companies, all 608 compared figures agree with the spreadsheet, or, where one of its formulas is faulty, with what that formula evidently means: 22 indicator lines, the seven element totals, the grand total, the achieved level and the discounted level for each company.

How often each fault moved one of the spreadsheet's own figures in these nineteen companies:

| Fault (numbered as below) | Companies where it changed a figure |
|---|---|
| 1. The 2% new-entrants or designated-groups line can never score | 15 |
| 1. Black economic interest scored against 20% instead of 25% | 2 |
| 2. Acquisition debt netted by row order | 4 |
| 3. Absorption bonus measured against the wrong number | 2 |
| 4. First-time suppliers never earn the 1.2 factor | 2 |
| 5. Supplier Development minority investments recognised at 0 | 2 |
| 6. The discount test (large-enterprise rule; Skills and Procurement checks that always pass) | 6 |
| 7. A total exactly on a level boundary drops a level | 2 (the spreadsheet's own total is exactly 95.00 and it shows Level 3); a third company's corrected total is exactly 75.00, which we score Level 5 |

Because of these, the spreadsheet's achieved level differs from ours on 9 companies and its discounted level on 11. On 6 companies the discount test alone decides the difference: on 5 the spreadsheet discounts a QSE that meets the QSE rule (Ownership and Skills pass, but a Supplier or Enterprise Development line misses 40%), and on 1 it keeps the level of a QSE that fails it (Skills and Procurement both miss, which its checks cannot see).

Wherever a fault changed a figure, the line-by-line comparison report shows the spreadsheet's own number beside what its formula evidently means, worked out from the spreadsheet's own figures.

## What we changed so our scorecard matches the QSE toolkit

These now follow the QSE spreadsheet for RCOGP QSE clients only. No other sector's scoring moved.

1. **Ownership** is worked out the toolkit's way: each shareholder counts by the value of their shares; a black shareholder's acquisition debt is subtracted from the value of their stake; net value is measured against 100% of black economic interest after debt. The QSE scorecard has one line for "black new entrants or designated groups", and the spreadsheet measures it as the two percentages added together; we do the same.
2. **Skills Development** is worked out the QSE toolkit's way. For each of the three spend lines (black people; black women; black people with disabilities) it counts course costs for categories A to E plus stipends for categories B, C and D; it adds category F and G course costs and all travel, accommodation, catering, stationery, venue and other costs, but only up to 15% of all training spend (all learners, all races); and it adds 15% of the training manager's salary and of training overheads, shared by that group's share of the workforce. There is no EAP split on the QSE scorecard. Before this, our QSE skills lines were measured differently (a 25% cap on F and G, admin costs capped against programme spend, no workforce share).
3. **Preferential procurement**: the "spend on empowering suppliers" line counts every supplier's recognised spend; the spreadsheet never looks at the "Empowering supplier?" answer. A black-owned (51% or more) QSE or EME supplier that is a first-time supplier now earns the 1.2 recognition factor, as the template intends (see fault 4).
4. **Guarantees** for Enterprise and Supplier Development are recognised at 50% of the guarantee, as in the template's benefit-factor table (the Codes' table says 3%; every Empower template we hold uses 50%).
5. **Enterprise Development sub-minimum**: 40% of the 5-point base line, as the spreadsheet tests it. Our QSE settings had no Enterprise Development sub-minimum at all.

## Faults in the QSE spreadsheet (we did not copy these)

Each is a formula that does not do what it evidently means. Where one of them changes a number, our scorecard shows what the formula means and the line-by-line report shows both figures. Please confirm each reading.

1. **Ownership targets cut short ("Ownership Scorecard", cells H7 and H9).** The points formula divides by the first three characters of the target cell. That turns the 25% economic-interest target into "0.2" (20%), so black economic interest is scored against 20% instead of 25%; and it turns the 2% target for black new entrants or designated groups into "0.0", which makes the formula fail, so that line can never score. We use the real targets, 25% and 2%.
2. **Acquisition debt netting depends on row order ("Oustanding Debts Calcs", columns H).** The first indebted shareholder is netted one way (the stake counts in full once its value after debt reaches 40% of the stake), every later one another way, and the indebted shareholder's whole stake is counted as black even when only part of it is. A non-black shareholder's debt on a later row is even subtracted from black economic interest. We net every black indebted shareholder with the first row's rule, for the black share of the stake only. This is the same fault, and the same reading, as in the RCOGP Generic template.
3. **Absorption bonus measured against the wrong number ("Skills Calcs", cell J28).** The formula divides the black learners who were absorbed by ALL learners who were absorbed. A company that absorbs one black learner out of twenty who finished a learnership gets the full 5 points, as long as it absorbed nobody else. The line's own headcount cell (D28: learners who completed a learnership, apprenticeship or internship while unemployed) is evidently the number to divide by, and that is what we use. (That headcount counts learners of every race; please confirm whether it should count black learners only.)
4. **First-time suppliers never earn the 1.2 factor ("Procurement Data", column "First-time supplier? [Scenario].Calcs").** The formula that should read the "First-time supplier?" answer reads the "3 year contract in place?" answer instead. So the first-time answer is ignored. We read the first-time answer.
5. **Supplier Development minority investments recognised at 0 ("ESD and SED Calcs", the Supplier Development benefit-factor table).** The table has the "Minority Investment" row twice; the first copy has no factor, and the lookup stops at it, so a Supplier Development minority investment counts for nothing. The Enterprise Development table says 70%. We use 70%. (Same fault as the Generic template.)
6. **The discount test ("Scorecard Calculations", cells C13, G5 and G6).** Two problems. (a) The Skills and Procurement sub-minimum checks add up the actual, gap, scenario and projected columns together (G5 and G6), and actual plus gap is always the full weighting, so those two checks always pass. (b) The test discounts the level if ANY priority element misses its sub-minimum, which is the large-enterprise rule. A QSE must meet the Ownership sub-minimum plus EITHER Skills Development OR Enterprise and Supplier Development (Preferential Procurement, Supplier Development and Enterprise Development each at 40%). The spreadsheet's own YES sheet applies a QSE rule too ("Ownership and any one of the priority elements"). We apply the QSE rule from the Codes, measured on the spreadsheet's own line points. **This is the one most worth your ruling**: with the spreadsheet's test as written, a QSE whose Supplier Development or Enterprise Development line misses 40% is always discounted, and a QSE whose Skills or Procurement misses 40% never is. The Skills-and-Procurement company shows the second half: Skills scores 3.33 and Procurement 2.50, yet the two checks read 28.33 and 22.50, so the spreadsheet keeps Level 8; under the QSE rule that company is Non-compliant.
7. **A total exactly on a level boundary drops a level ("Scorecard Calculations", cell C12).** The lookup asks for the highest boundary strictly below the total, so exactly 75.00 points is Level 6, not Level 5, and exactly 95.00 points is Level 3, not Level 2 (two of our companies total exactly 95.00 in the spreadsheet). We give the level at the boundary. (Same fault as the Generic template.)

## Things the spreadsheet does that we follow, but you may want to look at

- **No beneficiary test on Enterprise and Supplier Development.** The QSE template's "Recognised Amount" formula checks whether the beneficiary is a 51% black-owned EME or QSE, but both outcomes give the same amount, so every contribution counts whoever the beneficiary is. The Generic template does exclude non-qualifying beneficiaries. We follow the QSE spreadsheet (count everything). The Codes require qualifying beneficiaries; please say if the QSE should exclude them.
- **The "% of spend benefiting black individuals" on socio-economic development** is collected but never used: the full amount counts. Same as the Generic template; we follow it.
- **Time of employees** (Enterprise and Supplier Development): the template's description says 60% of the monthly salary divided by 160 hours, but the formula's "divide by 160" branch can never be reached, so the full amount times 60% counts (80% for socio-economic development). We follow the spreadsheet; the contribution-types company checks it. The description implies the amount is a monthly salary, turned into an hourly rate (divided by 160) and then multiplied by the hours given; the formula does neither, so the amount must already be the value of the time given. Please say how the amount should be captured.

## Still different

Nothing beyond the spreadsheet faults above: on every company, every line, element total, grand total and both levels agree.

One thing about the comparison itself. Our scorecard shows each line to two decimals; the spreadsheet keeps the full figure in the cell and shows two decimals. When a line lands exactly on half a cent of a point (for example 3.575), both show 3.58, but the stored figures differ by exactly 0.005, and the way computers store decimals can put that a hair over half a cent (0.0050000000000003). The first draft of the contribution-types company hit this on Supplier Development; we moved two amounts by R100 so no line lands on half a cent. The arithmetic was the same either way.

### What was not compared, and why

- **The YES rows** (YES points and YES level). The spreadsheet adds the YES reward on these rows only, after the B-BBEE total and the two levels, and never changes those. It works them out from the YES sheet; our scorecard works out YES from the YES youth on the training register, which this template does not carry. The qualifying YES company confirms that the B-BBEE total and both levels are not affected by the YES sheet. (On that company the spreadsheet's YES level is built on its own discounted level, which carries fault 6.)
- **The "[Scenario]" columns on the procurement register.** They are a what-if layer: when filled they replace the supplier's current answers in every procurement line. Our scorecard has no what-if layer, and none of the companies filled them.
- **Shareholder exit dates and sale-of-asset tax dates.** They feed only the "continuing consequences" and lock-in columns, which the current-year ownership lines never read (the continuing-consequences branch of the share formula cannot be reached when the current year is selected).
- **The benefit-factor tables** were left at the template's own values. The spreadsheet lets a user edit them; our factors are fixed for the sector.
