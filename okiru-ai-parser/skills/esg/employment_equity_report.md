---
id: employment_equity_report
appliesTo:
  - employment_equity__eea2_eea4_report
element: EMPLOYMENT_EQUITY
version: 1
hard: true
classify:
  is: "An Employment Equity report or analysis filed with (or prepared for) the Department of Employment and Labour that states the WORKFORCE PROFILE: headcount by occupational level, race and gender, with foreign nationals and people with disabilities. EEA2 (annual report), EEA12 (section 19 analysis) and the EE Online print of either."
  isNot:
    - "an EE plan or its numerical goals and targets (EEA13; read by the EE plan skill), even when printed in the same file"
    - "an EEA4 income differential statement on its own (remuneration, not headcount)"
    - "an EEA1 employee declaration (one person)"
    - "an employment equity or diversity POLICY (no figures)"
    - "a payroll report"
  filenameHints: ["eea2", "eea12", "ee report", "employment equity report", "workforce profile"]
  contentSignals: ["Workforce profile", "Occupational Levels", "Top management", "Senior management", "Professionally qualified", "Skilled technical", "Semi-skilled", "Unskilled", "Foreign Nationals", "TOTAL PERMANENT", "Temporary employees", "People with disabilities"]
rowsField: ee_level_rows
fields:
  - name: entity_name
    type: text
    required: true
    labels: ["Employer", "Trade name", "Name of employer", "Registered name"]
    description: "The employer the report is for, as printed in its employer details. When the form prints both a trade name and a registered name, copy the trade name and put the registered name in exceptions."
  - name: ee_reporting_period_start
    type: date
    labels: ["Reporting period from", "Period from"]
    description: "Start of the reporting period, when printed."
  - name: ee_reporting_period_end
    type: date
    required: true
    labels: ["Workforce profile as at", "As at", "Snapshot date", "Reporting period to"]
    description: "The date the workforce profile is stated at (the snapshot date), as printed."
  - name: ee_submission_date
    type: date
    labels: ["Date submitted", "Submission date", "Date of submission"]
    description: "The date the report was SUBMITTED to the Department, only when printed as a submission or acknowledgement date. A signature date or an e-signature audit-trail date is not a submission date."
  - name: ee_submission_reference
    type: text
    labels: ["Submission reference", "Reference number", "Acknowledgement number"]
    description: "The Department's submission or acknowledgement reference, as printed."
  - name: headcount_total_all_levels
    type: count
    required: true
    labels: ["TOTAL PERMANENT", "Total permanent employees"]
    description: "The TOTAL PERMANENT row's total, as printed. Not the grand total that adds temporary employees."
  - name: non_permanent_headcount
    type: count
    labels: ["Temporary employees", "Non-permanent employees"]
    description: "The temporary (non-permanent) employees row's total, as printed."
  - name: headcount_disabled_total
    type: count
    labels: ["Total people with disabilities", "Employees with disabilities"]
    description: "The total of the people-with-disabilities table, as printed. Zero when the table prints zero."
  - name: occupational_level
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "One row per occupational level, named as printed (Top management, Senior management, Professionally qualified, Skilled technical, Semi-skilled, Unskilled). The TOTAL PERMANENT, Temporary and Grand total rows are not levels: they go to the document-level fields."
  - name: headcount_african_male
    type: count
    rowLevel: true
    labels: []
    description: "African male headcount at this level (column AM)."
  - name: headcount_coloured_male
    type: count
    rowLevel: true
    labels: []
    description: "Coloured male headcount at this level (column CM)."
  - name: headcount_indian_male
    type: count
    rowLevel: true
    labels: []
    description: "Indian male headcount at this level (column IM)."
  - name: headcount_white_male
    type: count
    rowLevel: true
    labels: []
    description: "White male headcount at this level (column WM)."
  - name: headcount_african_female
    type: count
    rowLevel: true
    labels: []
    description: "African female headcount at this level (column AF)."
  - name: headcount_coloured_female
    type: count
    rowLevel: true
    labels: []
    description: "Coloured female headcount at this level (column CF)."
  - name: headcount_indian_female
    type: count
    rowLevel: true
    labels: []
    description: "Indian female headcount at this level (column IF)."
  - name: headcount_white_female
    type: count
    rowLevel: true
    labels: []
    description: "White female headcount at this level (column WF)."
  - name: headcount_foreign_male
    type: count
    rowLevel: true
    labels: []
    description: "Foreign national male headcount at this level."
  - name: headcount_foreign_female
    type: count
    rowLevel: true
    labels: []
    description: "Foreign national female headcount at this level."
  - name: headcount_disabled
    type: count
    rowLevel: true
    labels: []
    description: "People with disabilities at this level, from the disability table's row for the same level (its own total column)."
  - name: headcount_level_total
    type: count
    rowLevel: true
    labels: []
    description: "The level's printed Total column."
---
## What it is / is not

The workforce profile is the table an Employment Equity report is built on:
one row per occupational level, columns for African, Coloured, Indian and White
men and women, foreign nationals (male and female) and a Total. Below the
levels sit TOTAL PERMANENT, Temporary employees and a Grand total. A second
table of the same shape counts people with disabilities.

EEA12 (the section 19 analysis) and EEA2 (the annual report) both carry it.
An EEA13 (the EE plan) is often printed in the same file, with tables of
NUMERICAL GOALS and annual targets in exactly the same shape: those are
targets, read by the EE plan skill, never headcounts.

It is NOT an EE plan, an EEA4 income differential statement on its own, an
EEA1 employee declaration, an EE policy or a payroll report.

## Where values sit

- Employer details (name, trade name, registration and SARS numbers, sector)
  are on the first page; the snapshot date ("workforce profile as at") is in
  the section heading or the reporting period line.
- Columns run AM, CM, IM, WM, AF, CF, IF, WF, then foreign male, foreign
  female, then Total. Read each level's row across those columns in that
  order.
- The disability table repeats the levels; its row for a level gives that
  level's `headcount_disabled`.
- The submission reference and date, when present, are on an acknowledgement
  page or footer printed by EE Online.

## Traps

- A flattened table is not readable as a string of digits. A PDF text layer
  can run a row together ("5 00 01 0 0 6"), and splitting it by guesswork puts
  figures in the wrong columns. Read the row from the table cells or the page
  image; when the columns cannot be told apart, leave the row's columns null
  and say so in exceptions.
- Goals are not headcounts. A table headed numerical goals, numerical targets,
  "Year 1 / Year 2 targets" or "projected" is the plan's target, never the
  workforce. Copy headcounts only from the workforce profile ("as at").
- TOTAL PERMANENT is not the grand total. Permanent, temporary and grand
  totals are three different rows; copy each to its own field.
- Never add a row up, never compute a percentage of black or female
  employees, and never derive a total from the columns. The code does that
  and labels it derived.
- A signature date, or the date an e-signature audit trail completed, is not a
  submission date. Leave `ee_submission_date` null unless a submission or
  acknowledgement date is printed.
- The report speaks for the employer named in it, at its snapshot date. A
  report from an earlier year, or for a different legal entity in the group,
  is copied as printed and flagged in exceptions; never relabel it.
- Zeros are values: a level with no employees prints 0, which is copied as 0.

## Worked example

Invented, an EEA12 workforce profile (two levels shown):

```
Employer: ACME DISTRIBUTION        Workforce profile as at 30/09/2025
Occupational Levels   AM  CM  IM  WM  AF  CF  IF  WF  FM  FF  Total
Senior management      2   1   0   4   2   0   1   1   0   0    11
Semi-skilled          41  12   2   5  28   9   1   3   2   1   104
TOTAL PERMANENT       43  13   2   9  30   9   2   4   2   1   115
Temporary employees    1   0   0   0   2   0   0   0   0   0     3
GRAND TOTAL                                                     118
People with disabilities: Semi-skilled 1 (total 1)
```

```json
{"entity_name": "ACME DISTRIBUTION", "ee_reporting_period_start": null, "ee_reporting_period_end": "30/09/2025",
 "ee_submission_date": null, "ee_submission_reference": null,
 "headcount_total_all_levels": 115, "non_permanent_headcount": 3, "headcount_disabled_total": 1,
 "ee_level_rows": [
   {"occupational_level": "Senior management", "headcount_african_male": 2, "headcount_coloured_male": 1, "headcount_indian_male": 0, "headcount_white_male": 4, "headcount_african_female": 2, "headcount_coloured_female": 0, "headcount_indian_female": 1, "headcount_white_female": 1, "headcount_foreign_male": 0, "headcount_foreign_female": 0, "headcount_disabled": 0, "headcount_level_total": 11},
   {"occupational_level": "Semi-skilled", "headcount_african_male": 41, "headcount_coloured_male": 12, "headcount_indian_male": 2, "headcount_white_male": 5, "headcount_african_female": 28, "headcount_coloured_female": 9, "headcount_indian_female": 1, "headcount_white_female": 3, "headcount_foreign_male": 2, "headcount_foreign_female": 1, "headcount_disabled": 1, "headcount_level_total": 104}
 ],
 "exceptions": ["Only two levels are printed in this extract.", "Grand total 118 includes temporary employees."]}
```
