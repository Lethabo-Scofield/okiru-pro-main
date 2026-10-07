---
id: payroll_report
appliesTo:
  - management_control__payroll_as_at_measurement_date
  - management_control__remuneration_total_cost_to_company_schedules
  - ownership__payroll_remuneration_schedules_for_directors_and_senior_mana
element: MANAGEMENT_CONTROL
version: 1
hard: true
classify:
  is: "A payroll system report for one pay period (usually a month): the employer, the period, one row per employee with earnings and deductions, and a totals row."
  isNot:
    - "EEA1 declaration (a one-person form with race, gender, disability and nationality tick-boxes, signed by the employee)"
    - "EEA2 / EEA4 return (an occupational-level x race x gender headcount or income matrix submitted to the Department of Employment and Labour)"
    - "SARS EMP201 / EMP501 (a tax return with PAYE, SDL and UIF totals and payment references, no employee names)"
    - "an individual payslip or IRP5 (one employee only)"
    - "an employment-equity register in a workbook (race, gender and occupational level per person, not pay)"
  filenameHints: ["payroll", "pay roll", "salary report", "salaries", "wages", "transaction history", "payslip summary", "earnings"]
  contentSignals: ["Transaction History Report", "Payroll Report", "Salary Report", "Basic Salary", "Gross Pay", "Total Earnings", "Nett Pay", "PAYE", "UIF", "SDL", "Emp No", "Number of employees", "TOTAL"]
rowsField: employee_rows
fields:
  - name: entity_name
    type: text
    required: true
    labels: ["Company", "Employer", "Company name", "Business name"]
    description: "The employer the payroll is run for, from the report header. A trading name ('t/a ...') may stand beside the registered name; copy what the header prints."
  - name: period_covered
    type: text
    labels: ["Period", "Pay period", "Tax period", "Month", "From ... to ..."]
    description: "The pay period exactly as printed, e.g. '2025/10/01 - 2025/10/31' or 'October 2025'."
  - name: period_start
    type: date
    labels: ["From", "Period start", "Start date"]
    description: "First day of the pay period, when printed."
  - name: period_end
    type: date
    labels: ["To", "Period end", "End date", "Pay date"]
    description: "Last day of the pay period (or the pay date when only that is printed — say which in exceptions)."
  - name: employee_count
    type: count
    labels: ["Number of employees", "Employees", "Headcount", "No. of employees"]
    description: "The headcount the report itself states. If it states none, count the employee rows and say so in exceptions; never count the totals row."
  - name: total_gross_pay
    type: money
    labels: ["Total earnings", "Gross pay", "Gross remuneration", "Total gross", "TOTAL"]
    description: "The totals row's gross earnings for the period (before deductions)."
  - name: total_basic_salary
    type: money
    labels: ["Basic Salary", "Basic", "Salary"]
    description: "The totals row of the basic (monthly-paid) salary column, when the report has one."
  - name: total_basic_hourly_pay
    type: money
    labels: ["Basic Hourly", "Hourly pay", "Normal time", "Wages"]
    description: "The totals row of the basic hourly / wage column for hourly-paid staff, when the report has one. Kept apart from total_basic_salary."
  - name: period_leviable_amount
    type: money
    labels: ["SDL leviable", "Leviable amount", "Remuneration subject to SDL"]
    description: "The SDL leviable remuneration for THIS pay period only, when printed. Never an annual figure."
  - name: period_sdl_amount
    type: money
    labels: ["SDL", "Skills Development Levy", "SDL Contribution"]
    description: "The employer's Skills Development Levy for this pay period (the totals row of the SDL column)."
  - name: signatory_name
    type: text
    labels: ["Approved by", "Authorised by", "Signed", "Prepared by"]
    description: "Who signed off the payroll, when a sign-off block is filled in."
  - name: signed_date
    type: date
    labels: ["Date", "Approved on", "Signed on"]
    description: "The date beside the sign-off signature (not the run date or period)."
  - name: employee_name
    type: text
    required: true
    rowLevel: true
    labels: ["Employee", "Employee name", "Name", "Surname, Initials", "Full names"]
    description: "One employee per row, as printed (often 'Surname Firstname')."
  - name: employee_number
    type: text
    rowLevel: true
    labels: ["Emp No", "Employee code", "Staff no", "Code"]
    description: "The payroll's own employee code."
  - name: id_number
    type: idno
    rowLevel: true
    labels: ["ID Number", "Identity number", "ID / Passport"]
    description: "The employee's SA ID or passport number, when the report prints it."
  - name: designation
    type: text
    rowLevel: true
    labels: ["Job title", "Position", "Occupation", "Designation"]
    description: "Job title, only when a column shows it."
  - name: basic_salary
    type: money
    rowLevel: true
    labels: ["Basic Salary", "Basic", "Basic Hourly", "Rate"]
    description: "That employee's basic pay for the period."
  - name: salary
    type: money
    rowLevel: true
    labels: ["Gross", "Total earnings", "Gross pay", "Gross remuneration"]
    description: "That employee's gross earnings for the period (before deductions). This is the figure a workbook's monthly salary column takes."
newFields: [period_start, period_end, employee_count, total_gross_pay, total_basic_salary, total_basic_hourly_pay, period_leviable_amount, period_sdl_amount, employee_number, basic_salary]
---
## What it is / is not

A payroll report is what a payroll system (Sage / VIP, SimplePay, PaySpace and
the like, or an accountant's spreadsheet) prints for one pay run: a header with
the employer and period, one row per employee with earnings and deductions, and
a totals row. Wordings vary — "Payroll Report", "Salary Report", "Transaction
History Report", "Earnings and Deductions", "Payroll Summary", "Company Totals"
— and so do layouts; the shape (period + per-employee rows + totals) is what
identifies it.

It is evidence that the people claimed on the scorecard are employed and paid
at the measurement date, and of what they earn. It does NOT state race, gender,
disability, nationality or occupational level — those come from the EEA1, the
EE register or the EEA2. It is not an EEA1 (a single person's declaration form)
and not an EMP201 (a SARS return with no names).

## Where values sit

- Header (top of page 1, sometimes repeated on every page): employer name,
  period ("From 2025/10/01 To 2025/10/31", "Tax Period 202510"), run date, and
  often "Number of employees".
- Body: one row per employee. Typical columns, left to right: employee code,
  name, (ID number), basic salary or basic hourly pay, overtime, allowances,
  gross / total earnings, PAYE, UIF, (SDL), other deductions, nett pay. Some
  reports print employer contributions (UIF employer, SDL) in a separate block.
- "Transaction history" layouts list each employee as a block of transaction
  lines (one line per earning or deduction code) with a sub-total per employee;
  the employee's gross is that block's earnings sub-total.
- Totals: the last row ("TOTAL", "Company totals", "Grand total") or a summary
  block at the end of the report. Basic salary and basic hourly pay are often
  separate columns with separate totals — report each in its own field.
- Sign-off: an "Approved by / Signature / Date" block at the bottom, sometimes
  hand-signed on a scanned copy.

## Traps

- A payroll month is NOT the year. `period_leviable_amount` and
  `period_sdl_amount` are for this pay period only; never multiply by 12 and
  never return them as the annual Leviable Amount (that comes from the year's
  EMP201s / EMP501).
- The totals row is not an employee. Do not add it to `employee_rows`, and do
  not count it in `employee_count`.
- Hourly-paid and salaried staff are often in different columns. Do not add the
  hourly total to the salary total yourself; return both as printed.
- An employee's gross is EARNINGS before deductions — not nett pay, not cost to
  company (which adds employer UIF/SDL/medical/pension contributions).
- A column headed "Rate" may be an hourly RATE (e.g. 45.50), not pay for the
  period. Only use it for `basic_salary` when no basic-pay column exists, and
  say so in exceptions.
- Run date, print date and pay date are not the period. Prefer the printed
  period.
- No race, gender or occupational level on the report means null — never infer
  them from names, and never derive gender from the ID number here.
- A report scanned after signing may have a handwritten date in the sign-off;
  that is `signed_date`, not the period.

## Worked example

Invented report, digital PDF:

```
ACME TRADING (PTY) LTD            Transaction History Report
Period: 2025/10/01 - 2025/10/31   Number of employees: 3
Emp No  Employee            Basic Salary  Basic Hourly  Gross      PAYE     UIF     Nett
E001    Mokoena Thabo        18 500.00                  18 500.00  1 820.00 177.12  16 502.88
E002    Dlamini Nomsa                      9 840.00     10 240.00    0.00   102.40  10 137.60
E003    Pillay Ravi          24 000.00                  25 100.00  3 410.00 177.12  21 512.88
TOTAL                        42 500.00     9 840.00     53 840.00  5 230.00 456.64  48 153.36
Approved by: ____ (signed)   Date: 03/11/2025
```

```json
{"entity_name": "ACME TRADING (PTY) LTD", "period_covered": "2025/10/01 - 2025/10/31",
 "period_start": "2025/10/01", "period_end": "2025/10/31", "employee_count": 3,
 "total_gross_pay": "53 840.00", "total_basic_salary": "42 500.00", "total_basic_hourly_pay": "9 840.00",
 "period_leviable_amount": null, "period_sdl_amount": null,
 "signatory_name": null, "signed_date": "03/11/2025",
 "employee_rows": [
   {"employee_name": "Mokoena Thabo", "employee_number": "E001", "id_number": null, "designation": null, "basic_salary": "18 500.00", "salary": "18 500.00"},
   {"employee_name": "Dlamini Nomsa", "employee_number": "E002", "id_number": null, "designation": null, "basic_salary": "9 840.00", "salary": "10 240.00"},
   {"employee_name": "Pillay Ravi", "employee_number": "E003", "id_number": null, "designation": null, "basic_salary": "24 000.00", "salary": "25 100.00"}
 ],
 "exceptions": ["No SDL column on this report; leviable amount not stated."]}
```
