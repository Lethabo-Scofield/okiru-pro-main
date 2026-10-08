---
id: skills_development__sars_emp201_submissions_monthly_employer_declarations
appliesTo:
  - skills_development__sars_emp201_submissions_monthly_employer_declarations
element: SKILLS_DEVELOPMENT
version: 2
hard: true
classify:
  is: "SARS EMP201 monthly employer declarations: one return per tax period declaring PAYE, SDL and UIF (less any ETI). Several months are often in one file, sometimes with the EMP501 employer reconciliation for a tax year."
  isNot:
    - "a letter confirming compliance with the EE Act, Skills Development Act and SDL Act (a declaration with no amounts or periods)"
    - "a SETA registration certificate (names a SETA and an SDL number, no monthly amounts)"
    - "a SARS statement of account or payment history (payments and balances, not declarations)"
    - "IRP5 or IT3(a) employee tax certificates (one per employee)"
    - "a payroll or salary report (one row per employee)"
    - "a workplace skills plan or annual training report"
  filenameHints: ["emp201", "emp 201", "emp501", "monthly employer declaration", "paye return"]
  contentSignals: ["EMP201", "MONTHLY EMPLOYER DECLARATION", "EMP501", "EMPLOYER RECONCILIATION DECLARATION", "PAYE", "SDL", "UIF", "Tax Period", "Payment Reference Number", "ETI"]
rowsField: emp201_rows
fields:
  - name: entity_name
    type: text
    required: true
    labels: ["Employer name", "Registered name", "Name of employer"]
    description: "The employer the returns are filed for, as printed on the returns."
  - name: paye_reference_number
    type: text
    labels: ["PAYE reference number", "PAYE ref no", "PAYE Ref"]
    description: "The employer's PAYE reference as printed (normally 10 digits starting with 7)."
  - name: sdl_reference_number
    type: text
    labels: ["SDL reference number", "SDL ref no", "SDL Ref"]
    description: "The employer's SDL reference as printed (normally L followed by 9 digits)."
  - name: uif_reference_number
    type: text
    labels: ["UIF reference number", "UIF ref no", "UIF Ref"]
    description: "The employer's UIF reference as printed (normally U followed by 9 digits)."
  - name: sum_of_leviable_amount
    type: money
    labels: ["Leviable amount", "Remuneration subject to SDL", "Total leviable amount"]
    description: "ONLY a leviable amount (the SDL payroll base) the document itself prints. Never SDL x 100 and never a sum of months: the code derives those from the rows and labels them derived. It is the Skills denominator, never training spend."
  - name: sdl_levy_excluded_from_denominator
    type: bool
    labels: []
    description: "Whether a printed leviable amount excludes the SDL levy itself. Null unless the document says so."
  - name: emp501_tax_year
    type: text
    labels: ["Transaction Year", "Year of assessment", "Period of reconciliation"]
    description: "The tax year (and interim or annual) of an EMP501 in the file, as printed."
  - name: emp501_paye
    type: money
    labels: []
    description: "The PAYE total on the EMP501's declaration side, as printed. No labels on purpose: the EMP201 labels would collide."
  - name: emp501_sdl
    type: money
    labels: []
    description: "The SDL total on the EMP501's declaration side, as printed. It is SDL, not the leviable amount."
  - name: emp501_uif
    type: money
    labels: []
    description: "The UIF total on the EMP501's declaration side, as printed."
  - name: emp501_total
    type: money
    labels: []
    description: "The EMP501's total liability, as printed."
  - name: tax_period
    type: text
    required: true
    rowLevel: true
    labels: ["Tax Period", "Transaction Year/Period", "Return period"]
    description: "One row per EMP201: the return's tax period as printed, normally YYYYMM (202503 is March 2025). Every return in the file gets a row, whatever its month."
  - name: paye_amount
    type: money
    rowLevel: true
    labels: ["PAYE Liability", "PAYE amount", "Pay-As-You-Earn"]
    description: "PAYE declared on this return."
  - name: sdl_amount
    type: money
    required: true
    rowLevel: true
    labels: ["SDL Liability", "SDL amount", "Skills Development Levy"]
    description: "SDL declared on this return. Zero when the employer is SDL-exempt."
  - name: uif_amount
    type: money
    rowLevel: true
    labels: ["UIF Liability", "UIF amount", "Unemployment Insurance Fund"]
    description: "UIF declared on this return (employer and employee shares together, as printed)."
  - name: eti_utilised
    type: money
    rowLevel: true
    labels: ["ETI Utilised", "Employment Tax Incentive"]
    description: "Employment Tax Incentive used to reduce PAYE on this return, when printed."
  - name: total_liability
    type: money
    rowLevel: true
    labels: ["Tax Payable", "Total Amount Payable", "Payroll Tax Liability"]
    description: "The return's own printed total of the declared liabilities."
  - name: payment_reference_number
    type: text
    rowLevel: true
    labels: ["Payment Reference Number", "PRN"]
    description: "The PRN printed on the return, which links it to its payment."
newFields: [paye_reference_number, sdl_reference_number, uif_reference_number, emp501_tax_year, emp501_paye, emp501_sdl, emp501_uif, emp501_total, emp201_rows, tax_period, paye_amount, sdl_amount, uif_amount, eti_utilised, total_liability, payment_reference_number]
dropFields: [months_submitted, reconciliation_to_afs_staff_costs]
---
## What it is / is not

The EMP201 is the monthly employer declaration every registered employer
submits to SARS. One return covers one tax period (a calendar month) and
declares Pay-As-You-Earn (PAYE), the Skills Development Levy (SDL) and the
Unemployment Insurance Fund contribution (UIF), less any Employment Tax
Incentive (ETI). It carries the employer's PAYE, SDL and UIF reference numbers
and a payment reference number (PRN).

For B-BBEE the EMP201s are evidence of the leviable amount, the payroll base
Skills Development spend is measured against. SDL is 1% of leviable
remuneration, so the code derives the year's leviable amount from the monthly
SDL figures you copy. You copy the months; the code chooses the months inside
the measurement period, adds them up and labels the result derived.

The EMP501 is the employer reconciliation declaration, filed for a SARS tax
year (1 March to the end of February; interim: March to August). It is often
printed into the same file. Read it into the `emp501_*` fields.

It is NOT a compliance-confirmation letter, a SETA registration certificate, a
SARS statement of account, an IRP5, a payroll report, a WSP or an ATR. It never
proves training spend.

## Where values sit

- Each EMP201 is one page, or two when the payment section prints
  separately. The header holds the employer name, the reference numbers and the
  tax period. A calculation block lists PAYE, SDL, UIF and ETI with a total.
- Scanned files are often rotated. Read every page; each page is a separate
  return unless it continues the previous one.
- The EMP501 has a declaration side (what the EMP201s declared) and a
  certificates side (what the IRP5s add up to). The `emp501_*` fields take the
  declaration side.

## Traps

- Every return is a row. A file can hold returns from before or after the
  financial year: copy each one as its own row with its printed tax period.
  Never drop a month, and never decide which months count; the code does that
  against the measurement period.
- Never add the months up, never multiply SDL by 100 and never list "months
  submitted". Those are derived in code from `emp201_rows`.
- The EMP501's SDL total is SDL, not the leviable amount. Never put it in
  `sum_of_leviable_amount`.
- The tax year is not the financial year. Copy the EMP501's year as printed,
  even when the measured entity's year-end is in another month.
- SDL-exempt employers (annual leviable payroll under R500 000) show SDL as
  zero. Copy the zero; the code then cannot derive a leviable amount and says
  so.
- ETI makes the total smaller. When ETI is claimed, the printed total is less
  than PAYE + SDL + UIF. That is not an error; copy the printed total.
- The leviable amount is the denominator. Never report it, or SDL, as
  training spend.
- A print caption or watermark (a "copy" stamp, an eFiling print banner) does
  not make a submitted return a draft. Read the figures and note the caption.
- If the PAYE, SDL and UIF references do not share the same last nine digits,
  copy each as printed and flag the mismatch in exceptions.

## Worked example

Invented, a digital eFiling export of three returns for an employer with a
30 June year-end (no EMP501 in the file):

```
NOMVULA BAKERY (PTY) LTD   PAYE Ref 7123456789   SDL Ref L123456789   UIF Ref U123456789
Tax Period 202407  PAYE Liability 8 412.55  SDL Liability 731.90  UIF Liability 1 463.80  ETI Utilised 0.00     Tax Payable 10 608.25  PRN 7123456789LC07001
Tax Period 202408  PAYE Liability 8 655.10  SDL Liability 748.35  UIF Liability 1 496.70  ETI Utilised 1 250.00 Tax Payable 9 650.15   PRN 7123456789LC08001
Tax Period 202409  PAYE Liability 8 655.10  SDL Liability 748.35  UIF Liability 1 496.70                        Tax Payable 10 900.15  PRN 7123456789LC09001
```

```json
{"entity_name": "NOMVULA BAKERY (PTY) LTD", "paye_reference_number": "7123456789",
 "sdl_reference_number": "L123456789", "uif_reference_number": "U123456789",
 "sum_of_leviable_amount": null, "sdl_levy_excluded_from_denominator": null,
 "emp501_tax_year": null, "emp501_paye": null, "emp501_sdl": null, "emp501_uif": null, "emp501_total": null,
 "emp201_rows": [
   {"tax_period": "202407", "paye_amount": "8 412.55", "sdl_amount": "731.90", "uif_amount": "1 463.80", "eti_utilised": "0.00", "total_liability": "10 608.25", "payment_reference_number": "7123456789LC07001"},
   {"tax_period": "202408", "paye_amount": "8 655.10", "sdl_amount": "748.35", "uif_amount": "1 496.70", "eti_utilised": "1 250.00", "total_liability": "9 650.15", "payment_reference_number": "7123456789LC08001"},
   {"tax_period": "202409", "paye_amount": "8 655.10", "sdl_amount": "748.35", "uif_amount": "1 496.70", "eti_utilised": null, "total_liability": "10 900.15", "payment_reference_number": "7123456789LC09001"}
 ],
 "exceptions": ["No leviable amount is printed; only monthly SDL.", "202408 claims ETI; its printed total is copied as printed."]}
```
