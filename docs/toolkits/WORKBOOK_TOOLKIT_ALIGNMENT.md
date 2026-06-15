# Workbook ↔ Excel Toolkit Alignment

**Source toolkits:** `docs/toolkits/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx` (baseline), sector variants in same folder.  
**Workbook defs:** `apps/web/src/components/workbook/sections.ts`  
**Last updated:** 2026-06-04

## Summary

| Workbook section | Excel sheet | Grid totals row | Dropdown columns | Date format in labels |
|------------------|-------------|-----------------|------------------|------------------------|
| `ownership` | Ownership Data | — | Race, Gender, Yes/No flags | `Data Date`, loan/original/exit dates |
| `management-control` | MC Data | Sum **Annual Salary (R)** | Race, Gender, Designation, Occupational level, Yes/No | Hire/termination (MC toolkit uses Monthly Salary in Excel; workbook uses annual) |
| `skills-development` | Skills Data | Sum **Total Cost (R)** | Category A–G, Province, Race, Gender, Yes/No | Start/End, Data Date (meta) |
| `procurement` | Procurement Data | Sum **Spend (R)** | Size, B-BBEE level, Measured under, Yes/No | First procured, cert expiry |
| `esd` | ESD Data | — | SD/ED category, Size, Contribution type | Transaction, invoice, payment |
| `sed` | SED Data | — | Contribution type | Date of transaction |

Grey cells in Excel = required user input; white = formula/output (not editable in toolkit).

## Ownership Data (Excel row 6 headers)

Primary input columns (order preserved in workbook):

`Data Date` → `dataDate` · `Shareholder` → `shareholderName` · `Ownership Type` → `ownershipType` · `SOA Buyer` → `soaBuyer` · `Outstanding Debt` → `rowOutstandingDebt` · `Loan Date` → `loanDate` · `BO%` → `blackOwnership` · `BWO%` → `blackWomenOwnership` · `BDG%` → `designatedGroupOwnership` · `BNE%` → `blackNewEntrantOwnership` · `Number of Share` → `numberOfShares` · `Share Value` → `shareValue` · `Share %` → `shareholding` · `Years Held` → `yearsHeld` · `Black?` / `Debt?` → Yes/No selects.

Legacy demographic columns (`race`, `gender`, `votingRights`, `economicInterest`, …) remain for scoring derivation when BO% is blank.

## MC Data

Excel headers include `Full Name *`, `Gender *`, `Race *`, `Designation *`, `Disabled *`, `Foreign *`, `ID Number`, date fields `(format: dd/mm/yyyy)`, `Monthly Salary` (workbook label: **Annual Salary (R)** with sum row). Formula columns (`.calcs`, gap checks) are not shown in the workbook grid.

## Procurement Data

Excel: `Supplier Name *`, `Current Company Size *`, `B-BBEE Level`, `Spend *`, ownership %, Yes/No flags, dates. Top summary row in Excel aggregates spend by supplier category; workbook shows **Total Spend** above the grid (sum of `spend`).

## ESD Data

Excel `Pillar` / `SD / ED` → workbook `esdCategory` (`Supplier Development` | `Enterprise Development`). Normalizer accepts `SD`, `ED`, and full strings.

## SED Data

Excel `Contribution Type *`, `% of Spend Benefiting Black Individuals *`, `Date of Transaction * (format: dd/mm/yyyy)`.

## Skills Data

Per-learner cost columns; workbook sums `totalCost` at top. **Age** column removed (derived from ID where needed).

## AI suggest-value

Select and date fields pass `allowedValues` and validation messages from `ColumnDef` so `/api/workbook/suggest-value` matches `tabularNormalize` / `workbookValidation`.
