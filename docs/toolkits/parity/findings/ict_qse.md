# ICT QSE: our scorecard against the Empower toolkit

For: Chengetai (sector expert). Written in plain English; no code.

Toolkit checked: **BBBEE Toolkit (ICT QSE) Template v1.1** (the Empower workbook in `docs/toolkits`).
Method: invented companies (no client data) were typed into the real workbook, Excel recalculated it, and every
line of its Summary Scorecard was compared with what our system scores for the same company, to the cent of a point.

## Result

**704 of 704 comparisons match** across 22 invented companies. For each company we compare 32 figures: the 22 scored lines, the 7 element totals and the grand total, the achieved level and the discounted level, each to within half a cent of a point (levels exactly).

61 of the scored lines match only once a faulty toolkit formula is read as it is evidently meant (the corrected lines then also move their element total and the grand total). Because of those corrections, the achieved level differs from the one the workbook prints in 13 companies and the discounted level in 14. Every company, with the workbook's printed figures beside ours:

| Company | Workbook total | Our total | Workbook level (discounted) | Our level (discounted) | Why the level differs |
|---|---|---|---|---|---|
| 1 | 76.42 | 85.42 | L5 (L6) | L4 (L5) | the corrected lines move the total from 76.42 to 85.42 |
| 2 | 92.93 | 95.93 | L3 (L3) | L2 (L2) | the corrected lines move the total from 92.93 to 95.93 |
| 3 | 62.05 | 68.66 | L7 (L8) | L7 (L8) | — |
| 4 | 90.34 | 99.34 | L3 (L3) | L2 (L2) | the corrected lines move the total from 90.34 to 99.34 |
| 5 | 96.45 | 99.75 | L2 (L3) | L2 (L3) | — |
| 6 | 78.57 | 83.76 | L5 (L6) | L4 (L5) | the corrected lines move the total from 78.57 to 83.76 |
| 7 | 91.07 | 100.07 | L3 (L4) | L1 (L2) | the corrected lines move the total from 91.07 to 100.07 |
| 8 | 105.25 | 106.27 | L1 (L1) | L1 (L1) | — |
| 9 | 60.60 | 63.60 | L7 (L7) | L7 (L8) | its Skills and PP sub-minimum tests ('Scorecard Calculations'!G5, G6) add the gap and other columns to the points and always pass; here Skills scores 9.85 of the 10 needed |
| 10 | 97.47 | 106.47 | L2 (L3) | L1 (L2) | the corrected lines move the total from 97.47 to 106.47 |
| 11 | 90.64 | 90.60 | L3 (L4) | L3 (L4) | — |
| 12 | 93.55 | 102.55 | L3 (L4) | L1 (L2) | the corrected lines move the total from 93.55 to 102.55 |
| 101 | 91.00 | 100.00 | L3 (L3) | L1 (L1) | the corrected lines move the total from 91.00 to 100.00 |
| 102 | 49.80 | 58.23 | L8 (NC) | L7 (L8) | the corrected lines move the total from 49.80 to 58.23 |
| 103 | 72.97 | 91.27 | L6 (L7) | L3 (L4) | the corrected lines move the total from 72.97 to 91.27 |
| 104 | 94.86 | 102.86 | L3 (L4) | L1 (L2) | the corrected lines move the total from 94.86 to 102.86 |
| 105 | 91.14 | 100.14 | L3 (L4) | L1 (L2) | the corrected lines move the total from 91.14 to 100.14 |
| 106 | 101.33 | 107.19 | L1 (L1) | L1 (L1) | — |
| 107 | 101.57 | 103.37 | L1 (L2) | L1 (L2) | — |
| 108 | 67.49 | 99.67 | L7 (L8) | L2 (L3) | the corrected lines move the total from 67.49 to 99.67 |
| 109 | 41.14 | 47.26 | L8 (NC) | L8 (NC) | — |
| 112 | 29.16 | 34.13 | NC (NC) | NC (NC) | — |

Where a line matched only because the toolkit's own formula is faulty and we score what that formula clearly
means, the fault is listed under "Toolkit formula faults" below, with the cases it changed.

## What our system now does the toolkit's way

These are the rules this toolkit uses for ICT QSE. Our ICT QSE scorecard now follows each of them. Where the rule
is a choice the Codes could be read differently on, it is marked **(please confirm)**.

1. **Ownership.** Shareholders are weighed by the value of their shares. The targets are 30% (black voting rights and
   economic interest, 5 points each), 10% (black women, 2 points each), 2% for the single QSE line "black new
   entrants **or** designated groups" (3 points; the two groups' economic interest is added together), and 100% for
   net value (8 points). Net value is the black economic interest after acquisition debt, netted shareholder by
   shareholder.
2. **Management control, combined layout.** When the client chooses to combine executive and senior management,
   senior managers are counted on the two executive lines (50% / 25% targets), and the senior, middle and junior
   lines count middle and junior managers only (60% / 30%). Without the combination, executive directors and
   other executive managers make the executive lines, and senior, middle and junior managers together make the
   other two. Semi-skilled and unskilled staff are in neither. Gender is the gender entered.
3. **Skills development.** There is no EAP split in the QSE toolkit. Each spend line takes the course costs of
   categories A to E and the stipends of categories B to D for the learners concerned. It adds their F and G course
   costs and "other" costs (travel, accommodation and so on), but those may not exceed 15% of all training spend.
   It also adds 15% of the training manager's salary and training overheads, shared by the matching share of the
   workforce. Targets are 3% (black people, 15 points), 1% (black women, 7 points) and 0.15% (black people with
   disabilities, 3 points) of the leviable amount. The leviable amount is the larger of the SDL × 100 and the
   total payroll.
4. **Absorption bonus (please confirm).** The toolkit gives the 5 bonus points by the **black share of the absorbed
   learners** ('Skills Calcs'!J28). It counts the unemployed learners who completed a learnership, apprenticeship
   or internship and were absorbed, and asks what share of them is black. It does **not** compare the number
   absorbed with the number who completed, although it counts the completers on the same row (D28) and then
   never uses that count. So one black learner absorbed out of fifty who completed earns all 5 points. We now
   score it the same way, because that is what the spreadsheet does. If you read the bonus as "black learners
   absorbed out of black learners who completed", tell us and we will change it.
5. **Preferential procurement.** The all-suppliers line counts every supplier's recognised spend; the toolkit never
   reads the "Empowering supplier?" answer. A QSE or EME supplier that is at least 51% black owned earns the 1.2
   recognition factor if it is a supplier-development beneficiary, holds a 3-year contract, or is a first-time
   supplier. Targets: all suppliers 60% (15 points), 51% black-owned suppliers 15% (5 points), and the bonus for
   51% black designated-group-owned suppliers 1% (1 point), each of the larger of the TMPS and the supplier listing
   plus any buffer.
6. **Supplier and enterprise development targets (please confirm).** The toolkit sets both at **1% of NPAT** (5 points
   each; 'ESD Scorecard'!F12 and F13). Our ICT QSE settings had 2% from the July gazette review. The spreadsheet now
   rules. The ED sub-minimum is 40% of its 5-point base line. Guarantees count at 50%.
7. **ESD beneficiaries are not tested (please confirm).** The toolkit works out a "Qualify?" answer for each ESD
   contribution: for ED, a black-owned (51%) EME or QSE that is an ICT company; for SD, a black-owned EME or QSE.
   But both branches of its recognised-amount formula ('ESD Data', Recognised Amount) give the same amount (amount ×
   benefit factor), so the answer never changes a score. A contribution to a white-owned, non-ICT beneficiary counts
   in full. We do the same. The sister RCOGP Generic toolkit does recognise 0 for a beneficiary that does not
   qualify, so the ICT toolkit may mean the same; we did not assume it, because a formula that gives the same answer
   either way does not say which answer was meant. This changes many scores: in 18 of our 22 test companies at least
   one ESD contribution goes to a beneficiary that is not an ICT company.
8. **SED.** Only contributions marked as ICT-specific initiatives count. The percentage benefiting black people is not
   used. Target: 1% of NPAT for 12 points.
9. **Deemed NPAT.** NPAT is the larger of the current year and the average of the current and up to four prior years.
   If that is below a quarter of the industry norm times revenue, the toolkit uses the larger of (smallest qualifying
   margin × revenue) and (quarter-norm × revenue). A manual deemed NPAT always wins.
10. **Discounting (please confirm).** The toolkit discounts a QSE by one level when **any** priority sub-minimum fails:
    net value (3.2 of 8), Skills (10 of the 25 base points), Procurement (8 of the 20 base points), SD (2 of 5) or
    ED (2 of 5). This is stricter than the Codes' QSE rule, which is Ownership plus either Skills or ESD. A discounted
    Level 8 becomes Non-compliant.

## Toolkit formula faults (not copied; recorded here)

Where a toolkit formula is evidently broken, we score what the formula evidently means, using the toolkit's own
figures. Each fault is shown with the cell, what it does, what we do instead, and which test companies it changed.

- **The new-entrants-or-designated-groups target is cut to nothing** ('Ownership Scorecard'!H9). The points formula divides the measure by the first three characters of the target. The 2% target (0.02) becomes the text "0.0", the division fails, and the line always scores 0 unless points are typed in by hand. **What we do:** the toolkit's own measure (designated groups plus new entrants, I9) against 2% for 3 points. *Changed:* case 1, case 2, case 3, case 4, case 5, case 7, case 8, case 9, case 10, case 11, case 12, case 101, case 102, case 103, case 104, case 105, case 106, case 107, case 108, case 109, case 112.
- **Acquisition debt is netted three different ways** ('Oustanding Debts Calcs' column H, feeding 'Ownership Scorecard'!I7 and I10). Only the first indebted shareholder (row 3) gets the rule that the stake counts in full once its net value reaches 40% of it; every later row subtracts the debt straight off, so the result depends on the order the shareholders are typed in. It credits an indebted holder's whole stake as black, not the black share of it. And its debt column ignores the "Debt?" flag (which is Yes only for a black holder with debt), so a non-black shareholder's acquisition debt is subtracted from the black economic interest. **What we do:** for each black shareholder with acquisition debt, the black share of the stake, credited in full once its net value reaches 40% of the stake and pro rata below (the first-row rule, as for RCOGP Generic); a non-black shareholder's debt is left out. A black shareholder whose debt is larger than its stake takes the shortfall off the total, as the first-row rule does (please confirm). This sets the black economic interest line and the net value line. *Changed:* case 5, case 8, case 11, case 102, case 103, case 106, case 107, case 108.
- **Ownership points can go below zero** ('Ownership Scorecard'!H5:H10). The points formula caps at the maximum but has no floor. Debt larger than the stake drives black women's economic interest below zero, and the line shows negative points. **What we do:** a line scores at least 0. *Changed:* case 103, case 108.
- **Middle and junior management line has no formula in the combined layout** ('MC Scorecard (Exco + Senior)'!K28). When the client combines executive and senior management, the cell that scores black middle and junior managers is empty, so the line always scores 0 (the black-women cell beside it, K29, has its formula). **What we do:** the sheet's own measure (J28) against 60% for 6 points. *Changed:* case 1, case 4, case 6, case 7, case 10, case 12, case 101, case 102, case 104, case 105, case 106, case 108, case 109, case 112.
- **"First-time supplier?" reads the 3-year-contract answer** ('Procurement Data', column "First-time supplier? (Yes/No) [Scenario].Calcs"). With no scenario typed, the column falls back to the "3 year contract in place?" answer instead of the "First-time supplier?" answer, so a first-time supplier never earns the 1.2 recognition factor unless it also holds a 3-year contract. **What we do:** the first-time answer, so a QSE or EME first-time supplier at least 51% black owned earns the 1.2 factor. *Changed:* case 6, case 102, case 103, case 109, case 112.
- **A supplier-development minority investment counts 0** ('ESD and SED Calcs' rows 9 and 10). Both rows read "Minority Investment in Enterprise and Supplier Development beneficiaries". Row 9 is a stray copy (its description is the lower-interest-rate one) with no benefit factor, and the lookup finds it first. **What we do:** 70%, as row 10 and the enterprise-development table (row 28) say. *Changed:* case 3.
- **Both jobs-created bonuses are added** ('Summary Scorecard'!F47). The ED total adds the up-to-10% bonus (1 point) and the 11%-or-more bonus (2 points). They are alternatives: the element maximum (C47) counts only the 2-point tier and the gap (G47) takes the larger of the two. With one beneficiary under 11% and another over, the toolkit gives 3 points. **What we do:** the larger tier only (2 points in that example). *Changed:* case 8, case 104, case 107, case 108, case 109.
- **The Skills and procurement sub-minimums never fail** ('Scorecard Calculations'!G5 and G6). The tests add the points, the gap and further columns of the Summary Scorecard (F34:J36 and F40:J41). Points plus gap always equal the full weighting, so both tests always pass and only net value, SD and ED can discount the level. **What we do:** Skills must reach 10 of its 25 base points and procurement 8 of its 20 base points, as the sheet's own targets (F5, F6) say. *Changed:* case 9.
- **A total exactly on a threshold drops a level** ('Scorecard Calculations'!C12). The level is looked up from the highest threshold strictly below the total, so exactly 100 points gives Level 2 (and exactly 95, Level 3, and so on). The Codes say 100 points or more is Level 1. **What we do:** at or above the threshold. (Test company case 101 lands on exactly 100 points once its lines are corrected; we give Level 1.) *Changed:* none of the test companies.

## Other faults in the workbook that do not change any line we compared

- **YES qualification checks read the wrong rows.** On the YES sheet, the procurement, SD and ED sub-minimum ticks
  (F10, F11, F12) add up Skills rows of the Summary Scorecard (J35:J37, J36:J38, J37:J39) instead of the procurement
  rows (J40:J41), the SD row (J45) and the ED row (J48). A client choosing one of those elements for YES is tested on
  the wrong figures. (See "Still different" for why we do not compare YES.)
- **Time of employees.** The ESD recognised-amount formula has a branch that divides the amount by 160 for "time of
  employees productively deployed", but it can never be reached (the branch before it already returns amount ×
  60%). So the toolkit recognises 60% of whatever amount is typed; the label says "60% of the monthly salary
  divided by 160". A consultant who types a monthly salary gets 160 times too much. We recognise 60% of the amount
  typed, as the toolkit does; the amount should be the value of the time given.
- **Gap column.** The "% gap" on the Ownership Scorecard voting-rights line (M5) also uses the cut-down target. It is
  display only.

## Still different, and why

No compared figure differs: all 704 comparisons match.

Not compared, on purpose:

- **YES.** The toolkit's YES reward comes from what the consultant types on the YES sheet: the reward tier aimed for, last year's level, this year's level and the element picked for the sub-minimum. It does not count YES youth. Our system grants YES from the YES youth recorded with the training data. The two take different inputs, so the YES points (row 58) and the YES level (row 64) are not compared. Every test company leaves YES off, so in the workbook those equal the total and the discounted level, which are compared.
- **Prior-year, projected and scenario columns, and the manual-override cells** ("Actual [manual]", "Prior Year [manual]"). Every test company picks "Current YTD" and actual spend and leaves the overrides empty; only the actual scorecard is compared.
- **Choices we follow but you may overrule** are marked (please confirm) above: the absorption bonus, the 1% SD and ED targets, the untested ESD beneficiaries and the stricter discounting rule.

## Inputs the cases exercise

22 invented companies (cases 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 101, 102, 103, 104, 105, 106, 107, 108, 109, 112): twelve random ones of two sizes, and one or two for each edge the random ones may miss (every line at its maximum, empty data, heavy acquisition debt, every ESD contribution type, first-time suppliers, deemed NPAT, a Level 8 that discounting makes Non-compliant, and a company under 40 points). How many companies exercise each input:

- SD beneficiaries as suppliers: 22
- suppliers answered "not empowering": 22
- several shareholders: 19
- black new entrants: 19
- category F and G courses: 19
- 3-year contracts: 19
- stipends (categories B to D): 18
- large other costs (the 15% cap): 18
- non-compliant suppliers: 18
- ESD beneficiaries that are not ICT companies: 18
- disabled learners: 17
- designated groups in ownership: 16
- foreign employees: 16
- absorbed learners: 16
- disabled employees: 16
- executive and senior management combined: 14
- an ED beneficiary graduating: 14
- a first-time supplier with no SD link or 3-year contract: 13
- SED that is not ICT-specific: 13
- TMPS exclusions: 11
- acquisition debt: 11
- jobs created up to 10%: 11
- a procurement buffer: 10
- foreign learners: 10
- a payroll figure (leviable amount may exceed SDL × 100): 10
- a missing prior year: 9
- jobs created 11% or more: 9
- investments at a lower dividend: 9
- a training manager's salary and training overheads: 8
- executive and senior management kept apart: 8
- below-prime loans: 7
- guarantees: 6
- minority investments: 5
- shorter payment periods: 4
- a non-black shareholder with debt: 4
- NPAT of zero or a loss (deemed NPAT): 3
- no SED contributions: 2
- debt larger than the stake: 2
- no training at all: 1
- no ESD contributions: 1
- a manual deemed NPAT: 1
