---
id: annual_financial_statements
appliesTo:
  - esd__audited_financial_statements_or_signed_management_accounts_w
  - ownership__audited_reviewed_annual_financial_statements_afs
  - esd__audited_afs_or_signed_management_accounts_for_npat_target_de
  - sed__audited_afs_or_signed_management_accounts
  - skills_development__afs_staff_costs_training_expense_note
element: FINANCIALS
version: 1
hard: true
classify:
  is: "A set of annual financial statements (audited, independently reviewed, compiled, or with a close corporation accounting officer's report), or signed management accounts, for one financial year."
  isNot:
    - "a B-BBEE information-gathering workbook's Finance sheet (a template that restates a few AFS figures)"
    - "a SARS EMP201 / EMP501 or ITR14 tax return"
    - "a supplier ledger or creditors age analysis"
    - "a budget or forecast"
  filenameHints: ["afs", "financials", "financial statements", "annual financial", "management accounts", "audited"]
  contentSignals: ["Annual Financial Statements", "Statement of Financial Position", "Statement of Comprehensive Income", "Income Statement", "Detailed Income Statement", "Accounting Officer's Report", "Independent Auditor's Report", "Independent Reviewer's Report", "Revenue", "Gross profit", "Profit (loss) for the year", "Members' interest", "for the year ended"]
fields:
  - name: entity_name
    type: text
    required: true
    labels: ["Company", "Close Corporation", "Entity", "Name"]
    description: "The reporting entity's registered name from the cover or General Information page."
  - name: trading_name
    type: text
    labels: ["Trading as", "t/a"]
    description: "Trading name, when printed beside the registered name."
  - name: registration_number
    type: regno
    labels: ["Registration number", "Company registration number", "CK number"]
    description: "CIPC registration number from the General Information page."
  - name: financial_year_end
    type: date
    required: true
    labels: ["for the year ended", "Financial year end", "as at"]
    description: "The year-end date these statements are for (e.g. 'for the year ended 30 June 2025')."
  - name: assurance_type
    type: text
    labels: ["Independent Auditor's Report", "Independent Reviewer's Report", "Accounting Officer's Report", "Compilation report", "Audited", "Unaudited"]
    description: "What kind of assurance the statements carry: audited, independently reviewed, compiled, accounting officer's report (CC), or unaudited management accounts. Copy the report's own title."
  - name: audit_opinion
    type: text
    labels: ["Opinion", "Unqualified", "Qualified", "Conclusion"]
    description: "Only for an audit or review: the opinion / conclusion as stated. Null for an accounting officer's report or compilation."
  - name: signing_auditor
    type: text
    labels: ["Registered Auditor", "Chartered Accountants (SA)", "Independent reviewer"]
    description: "The auditor or independent reviewer who signed the report (firm and/or partner). Null when there is no audit or review."
  - name: accounting_officer_name
    type: text
    labels: ["Accounting Officer", "Accounting officer's report", "Compiled by", "Practice number"]
    description: "The accounting officer (close corporations) or compiler named on the report, with practice number when printed."
  - name: signing_date
    type: date
    labels: ["Date", "approved by", "signed on behalf of"]
    description: "The date the report was signed or the statements approved by the directors / members."
  - name: current_year_revenue
    type: money
    required: true
    labels: ["Revenue", "Turnover", "Sales", "Income from services"]
    description: "Current-year revenue from the income statement."
  - name: cost_of_sales
    type: money
    labels: ["Cost of sales", "Direct costs", "Cost of services"]
    description: "Current-year cost of sales, sign as printed."
  - name: gross_profit
    type: money
    labels: ["Gross profit", "Gross margin"]
    description: "Current-year gross profit."
  - name: operating_expenditure
    type: money
    labels: ["Operating expenses", "Other operating expenses", "Administrative expenses", "Total expenses"]
    description: "Current-year operating expenses as one stated total."
  - name: finance_costs
    type: money
    labels: ["Finance costs", "Interest paid", "Interest expense"]
    description: "Current-year finance costs."
  - name: net_profit_before_tax
    type: money
    labels: ["Profit (loss) before taxation", "Net profit before tax", "Loss before taxation"]
    description: "Current-year profit or loss before tax; negative for a loss."
  - name: current_year_npat
    type: money
    required: true
    labels: ["Profit (loss) for the year", "Net profit after tax", "Total comprehensive income (loss) for the year", "Loss for the year"]
    description: "Current-year net profit after tax (NPAT); negative for a loss."
  - name: total_salaries
    type: money
    labels: ["Salaries and wages", "Employee costs", "Staff costs", "Salaries"]
    description: "Current-year salaries / employee costs, usually in the Detailed Income Statement or an employee-costs note."
  - name: directors_or_members_remuneration
    type: money
    labels: ["Directors' emoluments", "Members' remuneration", "Directors' remuneration"]
    description: "Remuneration paid to directors (companies) or members (CCs), stated separately. 'Nil' or '-' is zero."
  - name: capital_expenditure
    type: money
    labels: ["Additions", "Purchase of property, plant and equipment", "Acquisition of assets"]
    description: "Current-year additions to fixed assets from the PPE note or the cash flow statement."
  - name: total_assets
    type: money
    labels: ["Total Assets"]
    description: "Total assets from the statement of financial position (balance sheet), current year."
  - name: total_equity
    type: money
    labels: ["Total Equity", "Members' interest", "Total members' interest", "Shareholders' equity", "Net asset value"]
    description: "Total equity, or total members' interest for a close corporation; negative when liabilities exceed assets."
  - name: total_shares_in_issue
    type: count
    labels: ["Issued", "Share capital", "ordinary shares of"]
    description: "Issued shares from the share capital note (companies only; a CC has members' interest, not shares)."
newFields: [trading_name, assurance_type, accounting_officer_name, gross_profit, net_profit_before_tax, total_salaries, directors_or_members_remuneration, total_assets, total_equity]
dropFields: [total_pre_exclusions_tmps, vice]
---
## What it is / is not

Annual financial statements (AFS) are the entity's year-end accounts: a cover,
a General Information page, a report (auditor, independent reviewer,
accounting officer or compiler), the directors' or members' report, the
statement of financial position (balance sheet), the statement of
comprehensive income (income statement), changes in equity, cash flows,
accounting policies and notes. Smaller entities add a Detailed Income
Statement (a supplementary schedule of every expense line) and a tax
computation. Signed management accounts are the same figures without the
statutory reports.

B-BBEE uses the AFS for revenue (size thresholds), NPAT (ED/SD and SED
targets), salaries (cross-check of the leviable amount), total assets / net
value (ownership) and the year end. The AFS do NOT state Total Measured
Procurement Spend, the leviable amount, or any B-BBEE level.

A Close Corporation (registration number ending /23) reports under the Close
Corporations Act: an Accounting Officer's report (section 62) instead of an
audit, "members' interest" instead of share capital and equity, and "members'
remuneration" instead of directors' emoluments.

## Where values sit

- Cover / General Information page (first 1–3 pages): registered name,
  trading name, registration number, nature of business, directors / members,
  registered office, auditor / accounting officer, and the year end in the
  title ("Annual Financial Statements for the year ended ...").
- Report page: its TITLE says the assurance type. The signatory's name,
  practice number and the date sit at its foot.
- Income statement: Revenue, Cost of sales, Gross profit, Other income,
  Operating expenses, Operating profit (loss), Finance costs, Profit (loss)
  before taxation, Taxation, Profit (loss) for the year.
- Balance sheet: Total Assets; Equity (or Members' interest); Liabilities.
- Each statement has TWO figure columns: current year first, prior year
  second, headed with the years ("2025 | 2024"). A narrow column between the
  label and the figures holds NOTE numbers.
- Detailed Income Statement (near the back, often marked "does not form part
  of the reviewed/audited statements"): one line per expense — Salaries and
  wages, Members' remuneration, Fuel, Repairs, Insurance, etc.
- Tax computation / taxation note: assessed or "computed" loss carried forward.

## Traps

- CURRENT YEAR only. Take the column headed with the year that matches the
  year end; never the prior-year comparative.
- A note number ("2", "14") is not an amount. On OCR text the note column sits
  between the label and the figures.
- Brackets mean negative: "(41 250)" is a loss of 41 250. Return the sign.
- The tax note's "assessed loss" / "computed loss carried forward" is a TAX
  figure. It is NOT procurement spend, NOT TMPS and NOT NPAT.
- These statements do not state TMPS. Never compute it from cost of sales plus
  expenses; never put any AFS figure in a TMPS field.
- Salaries in the AFS are not the leviable amount. Report them as
  `total_salaries` only.
- The year end ("30 June 2025") is a date. It is never operating or capital
  expenditure, and a figure is never the year end.
- Capital expenditure is the ADDITIONS line of the fixed-asset note or the cash
  flow statement. Unchanged cost with no additions line means none were made —
  return 0 only if the note shows "-" or nil additions, otherwise null.
- An accounting officer is not an auditor. Do not put an accounting officer in
  `signing_auditor`, and do not return an audit opinion for unaudited
  statements.
- "Members' interest" on a CC balance sheet is equity and can be negative.
- Scanned AFS arrive as OCR tables; the figure is the cell text ("4 812 300"),
  never the surrounding markup.

## Worked example

Invented, close corporation, scanned:

```
SIZWE LOGISTICS CC (Registration number 2009/012345/23)
Annual Financial Statements for the year ended 30 June 2025
Accounting Officer's Report ... P. van Wyk, Practice no. 12345 ... 20 October 2025
Statement of Comprehensive Income        Note    2025          2024
Revenue                                    9    4 812 300     4 255 910
Cost of sales                                  (2 914 650)   (2 501 330)
Gross profit                                    1 897 650     1 754 580
Operating expenses                             (1 822 410)   (1 610 870)
Finance costs                             10      (96 115)      (88 402)
Loss before taxation                              (20 875)       55 308
Loss for the year                                 (20 875)       39 822
Statement of Financial Position: Total Assets 2 104 556 ... Members' interest (312 880)
Detailed Income Statement: Salaries and wages 1 203 400; Members' remuneration -
Tax computation: Computed loss carried forward (1 950 100)
```

```json
{"entity_name": "SIZWE LOGISTICS CC", "registration_number": "2009/012345/23",
 "financial_year_end": "30 June 2025", "assurance_type": "Accounting Officer's Report",
 "audit_opinion": null, "signing_auditor": null, "accounting_officer_name": "P. van Wyk, Practice no. 12345",
 "signing_date": "20 October 2025", "current_year_revenue": "4 812 300", "cost_of_sales": "(2 914 650)",
 "gross_profit": "1 897 650", "operating_expenditure": "(1 822 410)", "finance_costs": "(96 115)",
 "net_profit_before_tax": "(20 875)", "current_year_npat": "(20 875)", "total_salaries": "1 203 400",
 "directors_or_members_remuneration": "0", "total_assets": "2 104 556", "total_equity": "(312 880)",
 "capital_expenditure": null, "total_shares_in_issue": null,
 "exceptions": ["Unaudited: accounting officer's report only.", "Computed tax loss (1 950 100) is not TMPS and was not used."]}
```
