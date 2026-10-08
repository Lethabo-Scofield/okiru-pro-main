---
id: esd__detailed_ledger_accounts_payable_entries_per_sampled_supplie
appliesTo:
  - esd__detailed_ledger_accounts_payable_entries_per_sampled_supplie
element: ESD
version: 2
hard: false
classify:
  is: "An accounts-payable or general-ledger extract for ONE sampled supplier (or a few): dated entries such as invoices, debit orders or payments, with amounts and usually a total, used to prove the spend claimed for that supplier."
  isNot:
    - "the full supplier schedule or procurement list covering all suppliers"
    - "the supplier's B-BBEE certificate or sworn affidavit"
    - "a single supplier invoice"
    - "a bank statement (the bank's side, every payee mixed together)"
    - "a trial balance, management accounts or AFS"
  filenameHints: ["detailed ledger", "supplier ledger", "creditors ledger", "accounts payable", "vendor history"]
  contentSignals: ["Accounts Payable", "Creditors Ledger", "Supplier Ledger", "Detailed Ledger", "Supplier Account", "Creditor", "Debit order"]
rowsField: ledger_entry_rows
fields:
  - name: supplier_name
    type: text
    required: true
    labels: ["Supplier", "Creditor", "Vendor", "Account name"]
    description: "The supplier the ledger is for, as written in its title or account line."
  - name: ledger_period
    type: text
    labels: ["For the period", "Date range", "Period from"]
    description: "The period the ledger says it covers, as printed (for example '01 July 2023 to 30 June 2024')."
  - name: ap_subledger_total
    type: money
    required: true
    labels: ["Total spend", "Total for period", "Period total"]
    description: "The total of the period's entries that the ledger itself prints, including an unlabelled SUM row directly under the entries. Never an opening or closing balance, and never a sum you work out."
  - name: amounts_include_vat
    type: bool
    labels: ["Incl VAT", "VAT inclusive", "VAT exclusive"]
    description: "True or false only when the ledger says whether its amounts include VAT. Otherwise null."
  - name: claimed_spend_ex_vat
    type: money
    labels: ["Amount excl VAT", "Total excl VAT"]
    description: "Only a VAT-exclusive total the ledger itself prints. Never divide by 1.15 yourself."
  - name: reconciliation_status
    type: text
    labels: ["Reconciled", "Variance", "Difference"]
    description: "Only a reconciliation or variance line the ledger itself prints, as printed. Otherwise null."
  - name: entry_date
    type: date
    required: true
    rowLevel: true
    labels: ["Transaction date", "Doc date", "Entry date"]
    description: "One row per ledger entry: its date as printed."
  - name: entry_reference
    type: text
    rowLevel: true
    labels: ["Reference", "Doc no", "Invoice no"]
    description: "The entry's invoice, journal or debit-order reference."
  - name: entry_description
    type: text
    rowLevel: true
    labels: ["Description", "Narration"]
    description: "The entry's description as written."
  - name: entry_amount
    type: money
    required: true
    rowLevel: true
    labels: ["Amount", "Debit", "Credit"]
    description: "The entry's amount as printed. Credits, reversals and credit notes keep their sign."
newFields: [ledger_period, amounts_include_vat, ledger_entry_rows, entry_date, entry_reference, entry_description, entry_amount]
dropFields: [supporting_invoices_reviewed]
---
## What it is / is not

During procurement testing a verifier samples suppliers from the client's
supplier schedule and asks for each sampled supplier's ledger: the
accounts-payable sub-ledger or general-ledger account listing every invoice,
debit order or payment in the measurement period. The ledger total is compared
with the spend claimed for that supplier. It is usually a small spreadsheet
export or a printed report from the accounting system, with a title or
account line naming the supplier and the period.

The comparison with the schedule, the count of supporting invoices and any
check that the total equals its entries are done later in code, not here.

It is NOT the full supplier schedule, the supplier's certificate or affidavit,
one invoice on its own, a bank statement, or a trial balance.

## Where values sit

- The supplier name and stated period are in the title rows above the table
  (often one merged cell such as "Supplier X: 01 July 2023 to 30 June 2024").
- Entries are one per row: date, reference, description, amount (sometimes
  split into debit and credit columns, sometimes with a running balance).
- The total is often in a cell under the last entry with no label at all, a
  formula such as `=SUM(E6:E12)`. It is still the ledger's printed total.

## Traps

- The opening balance is not spend, and neither is a closing balance or a
  running balance column: they are what is owed, not what was bought. Never
  put either in `ap_subledger_total`, and never return a balance as an entry.
- A ledger titled for twelve months may hold entries for only some of them.
  Copy the entries that are there and the title's period as printed; never
  extrapolate a year.
- A creditor ledger can list invoices on one side and payments on the other.
  Copy every entry with its sign; never net or add them yourself.
- B-BBEE spend is measured excluding VAT. Copy amounts as printed and say
  whether they include VAT only when the ledger says so.
- An unlabelled total row under the entries is the ledger's total. Copy it as
  printed even when you suspect it does not match the entries; the code checks
  that.
- The ledger may use a brand or short name where the schedule uses the legal
  name. Copy the ledger's name as written.
- If one sheet holds several suppliers, copy only the entries under the
  supplier this document is for and name the others in exceptions.
- A `#REF!` total holds no value: null plus an exception.

## Worked example

Invented, a one-sheet spreadsheet:

```
   |   B          | C                                                  | D           | E
 4 |              | Bright Office Supplies: 01 July 2023 to 30 June 2024 |           |
 5 | Date         | Reference                                          | Description | Amount
 6 | 2023-07-15   | INV 3301                                           | Stationery  | 4 812.50
 7 | 2023-08-15   | INV 3388                                           | Stationery  | 4 812.50
 8 | 2023-09-15   | INV 3460                                           | Toner       | 6 140.75
10 |              |                                                    |             | 15 765.75
```

```json
{"supplier_name": "Bright Office Supplies", "ledger_period": "01 July 2023 to 30 June 2024",
 "ap_subledger_total": "15 765.75", "amounts_include_vat": null, "claimed_spend_ex_vat": null, "reconciliation_status": null,
 "ledger_entry_rows": [
   {"entry_date": "2023-07-15", "entry_reference": "INV 3301", "entry_description": "Stationery", "entry_amount": "4 812.50"},
   {"entry_date": "2023-08-15", "entry_reference": "INV 3388", "entry_description": "Stationery", "entry_amount": "4 812.50"},
   {"entry_date": "2023-09-15", "entry_reference": "INV 3460", "entry_description": "Toner", "entry_amount": "6 140.75"}
 ],
 "exceptions": ["The total in E10 has no label.", "The title covers 12 months but entries stop in September 2023."]}
```
