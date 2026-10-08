---
id: sed__proof_of_payment_cash_grants_donations_or_monetary_contribut
appliesTo:
  - sed__proof_of_payment_cash_grants_donations_or_monetary_contribut
element: SED
version: 2
hard: true
classify:
  is: "Evidence that a cash socio-economic development (SED) contribution was paid to a named beneficiary: EFT or payment confirmations, bank statement lines, transaction printouts or donation receipts, often filed with the beneficiary's invoices or donation requests."
  isNot:
    - "an SED or donation agreement with a beneficiary (terms, not payment)"
    - "a beneficiary sworn affidavit or report on black beneficiaries"
    - "an ESD or supplier development proof of payment (money to a business being developed, or to a supplier)"
    - "a supplier invoice for procurement"
    - "an SED schedule or the social development sheet of an information-gathering workbook (lists contributions, does not prove them)"
    - "a delivery note or completion certificate for an in-kind contribution"
  filenameHints: ["sed proof of payment", "sed pop", "csi payment", "donation payment", "donation receipt"]
  contentSignals: ["Proof of payment", "Payment confirmation", "Payment notification", "Beneficiary", "Donation", "Section 18A", "NPO", "PBO", "NPC"]
rowsField: beneficiary_rows
fields:
  - name: payer_name
    type: text
    labels: ["Paid by", "Payer", "From account"]
    description: "Who paid, as the payment records name it. It should be the measured entity; copy what is printed."
  - name: beneficiary_name
    type: text
    required: true
    rowLevel: true
    labels: ["Beneficiary", "Beneficiary name", "Recipient", "Paid to", "Payee"]
    description: "One row per contribution: the organisation or person that received it, as named on the invoice letterhead, receipt or payment record."
  - name: beneficiary_registration_number
    type: text
    rowLevel: true
    labels: ["NPO number", "NPO No", "PBO number", "PBO No", "NPC registration number"]
    description: "The beneficiary's own NPC (CIPC, ending /08), NPO or PBO number, as printed."
  - name: evidence_kind
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "What the file holds for this row: payment_confirmation, bank_statement_line, transaction_printout, donation_receipt, or none when only an invoice or request is in the file."
  - name: invoice_number
    type: text
    rowLevel: true
    labels: ["Invoice no", "Invoice number", "Tax invoice no", "Request no"]
    description: "The beneficiary's invoice or donation-request number, when the contribution was invoiced."
  - name: invoice_date
    type: date
    rowLevel: true
    labels: ["Invoice date", "Request date"]
    description: "The date on that invoice or request."
  - name: invoice_amount
    type: money
    rowLevel: true
    labels: ["Amount due", "Invoice total", "Total due"]
    description: "The amount on that invoice or request."
  - name: description_of_contribution
    type: text
    rowLevel: true
    labels: ["Description", "Narrative"]
    description: "What the contribution was for, as written."
  - name: payment_date
    type: date
    required: true
    rowLevel: true
    labels: ["Payment date", "Date paid", "Action date", "Effective date", "Date received"]
    description: "The date the money was paid (or received, on a receipt), from the payment record. Never the invoice date."
  - name: amount_paid
    type: money
    required: true
    rowLevel: true
    labels: ["Amount paid", "Payment amount", "Amount received"]
    description: "The amount on the payment record or receipt. Null on a row that has only an invoice."
  - name: payment_reference
    type: text
    rowLevel: true
    labels: ["Beneficiary reference", "Transaction reference", "Trace number", "Payment reference", "Receipt no"]
    description: "The reference printed on the payment record or receipt."
  - name: marked_not_proof_of_payment
    type: bool
    rowLevel: true
    labels: []
    description: "True when the bank printout itself states that it is not a proof of payment."
  - name: excludes_vat
    type: bool
    rowLevel: true
    labels: ["Excl VAT"]
    description: "Only when the invoice shows VAT. Donations to non-profits usually carry none; then null."
newFields: [payer_name, beneficiary_registration_number, evidence_kind, invoice_amount, payment_reference, marked_not_proof_of_payment]
dropFields: [payment_within_measurement_period, matches_agreement_value, obligation_vested_in_period]
---
## What it is / is not

Socio-economic development (SED) contributions are money, goods or time given
to black beneficiaries or to organisations that serve them (non-profit
companies, NPOs, PBOs, schools, local projects). A verifier recognises a
cash contribution only with proof that it was paid: an EFT confirmation, a bank
statement line, a bank-generated payment record or a donation receipt showing
the beneficiary, the amount and the date. The file often also holds the
beneficiary's invoices or donation requests.

One cash contribution can leave two pieces of paper: the beneficiary's invoice
or request, and the payer's payment record. Pair them into ONE row per
contribution. Whether a payment falls inside the measurement period, matches
an agreement or vested in the period is decided later in code and by the
reviewer, not here; so is the total.

It is NOT an SED agreement or pledge, a beneficiary affidavit, an ESD payment,
a supplier invoice, an SED schedule, or a delivery note for an in-kind
contribution.

## Where values sit

- Invoices and requests carry the beneficiary's letterhead and number (NPC
  numbers end in `/08`; NPO numbers look like `123-456 NPO`; PBO numbers are
  digits), an invoice number, a date, a description and an amount.
- Bank payment records carry the payment date, amount, beneficiary name or
  reference, and the payer's account name. Bank and account numbers appear
  too; never return them.
- A donation receipt (often a Section 18A receipt) is issued by the
  beneficiary: its "received on" date and amount are the payment.
- Pages are not always in order. Match an invoice to a payment by
  beneficiary, amount and a payment date on or after the invoice date.

## Traps

- Do not count a contribution twice. The invoice amount and the payment amount
  describe the same money: put both on one row (`invoice_amount`,
  `amount_paid`), never two rows.
- Unpaired items: an invoice with no payment record is a row with
  `amount_paid` null and `evidence_kind` none; a payment with no invoice is a
  row with the invoice fields null.
- Some bank printouts say in their own small print that they are not a proof
  of payment. Still read the row and set `marked_not_proof_of_payment` true.
- Copy every payment date as printed, even after year-end. Never move a date
  and never decide whether it counts.
- If a bank record shows only an abbreviated reference that is plainly the
  same beneficiary as an invoice, use the invoice's full name and note it.
- A beneficiary is not a supplier. Never record an SED amount as procurement
  spend.
- Equal amounts in different months are different contributions: one row
  each, told apart by date and reference.
- Never add the rows up; the code totals `amount_paid`.

## Worked example

Invented, a two-page digital file with no invoices: a bank's payment
confirmation and a beneficiary's Section 18A receipt.

```
Page 1  PAYMENT CONFIRMATION   Paid by: ACME TRADING (PTY) LTD   Date paid: 05/11/2024
        Beneficiary: SUNRISE EDUCARE NPC   Amount paid: R12 500.00   Beneficiary reference: ACME ECD NOV
Page 2  THEMBALETHU FEEDING SCHEME   PBO No 930012345   Section 18A receipt   Receipt no R-0457
        Received from Acme Trading (Pty) Ltd on 17/01/2025 the amount of R4 000.00 as a donation towards school meals
```

```json
{"payer_name": "ACME TRADING (PTY) LTD",
 "beneficiary_rows": [
   {"beneficiary_name": "SUNRISE EDUCARE NPC", "beneficiary_registration_number": null, "evidence_kind": "payment_confirmation",
    "invoice_number": null, "invoice_date": null, "invoice_amount": null, "description_of_contribution": null,
    "payment_date": "05/11/2024", "amount_paid": "R12 500.00", "payment_reference": "ACME ECD NOV", "marked_not_proof_of_payment": null, "excludes_vat": null},
   {"beneficiary_name": "THEMBALETHU FEEDING SCHEME", "beneficiary_registration_number": "930012345", "evidence_kind": "donation_receipt",
    "invoice_number": null, "invoice_date": null, "invoice_amount": null, "description_of_contribution": "a donation towards school meals",
    "payment_date": "17/01/2025", "amount_paid": "R4 000.00", "payment_reference": "R-0457", "marked_not_proof_of_payment": null, "excludes_vat": null}
 ],
 "exceptions": ["No beneficiary invoices or requests in the file.", "The payment confirmation does not print the beneficiary's registration number."]}
```
