---
id: _open
version: 2
rowsField: facts
fields:
  - name: document_label
    type: text
    required: true
    description: "What this document is, in a few plain words of your own: 'Lease agreement', 'Bank confirmation letter', 'Insurance schedule'. Name the kind of document, never its company."
  - name: document_title
    type: text
    labels: ["title", "heading"]
    description: "The document's own title or main heading, copied as printed. Null when it has none."
  - name: issued_by
    type: text
    labels: ["issued by", "from", "letterhead", "signed for and on behalf of"]
    description: "The organisation or person that issued, wrote or signed the document, as printed."
  - name: about_entity
    type: text
    labels: ["to", "addressed to", "the insured", "the tenant", "account holder", "in respect of"]
    description: "The company or person the document is about or addressed to, as printed. Not the issuer."
  - name: document_date
    type: date
    labels: ["date", "dated", "signed on", "issued on"]
    description: "The date the document was issued or signed, as printed."
  - name: period
    type: text
    labels: ["period", "from", "to", "valid until", "term"]
    description: "The period the document covers or is valid for, as printed ('1 March 2025 to 28 February 2026')."
  - name: reference_numbers
    type: text
    labels: ["reference", "ref", "policy number", "registration number", "contract number"]
    description: "Reference, contract, policy or registration numbers printed on the document, as printed, separated by '; '. Never a bank or card account number, an ID number or a passport number."
  - name: could_evidence
    type: text
    description: "The scorecard elements this document could support, as a list of element keys (OWNERSHIP, MANAGEMENT_CONTROL, SKILLS_DEVELOPMENT, ESD, SED, FINANCIALS), or an empty list when it supports none."
  - name: label
    type: text
    required: true
    rowLevel: true
    description: "What the fact is, in the document's OWN words where it names it ('Monthly rental', 'Sum insured', 'Closing balance')."
  - name: value
    type: text
    required: true
    rowLevel: true
    description: "The value exactly as printed: a figure with its sign and separators, a date as written, a name, a number."
  - name: unit
    type: text
    rowLevel: true
    description: "The unit or currency as printed ('R', 'per month', 'kWh', '%', 'hours'), or null."
  - name: kind
    type: text
    rowLevel: true
    description: "One of: figure, date, reference, party, person, condition, other. A person is a named individual with their role as the label."
  - name: page
    type: count
    rowLevel: true
    description: "The page the fact is printed on, when the document marks pages ('## Page 2'), or null."
  - name: quote
    type: text
    required: true
    rowLevel: true
    description: "The printed line or table cell the value is in, copied word for word (at most 300 characters). The value must appear inside it."
---
## What it is / is not

The open read is for a document that is NONE of the document types the
platform has a reading guide for: a lease, a bank confirmation letter, an
insurance schedule, a municipal rates letter, a quotation, a contract, a
memo. It is read for what it IS, not forced into the nearest listed type.

It is not a verification decision. You do not decide whether anything here
scores, and you do not move a fact into a scorecard field: you report what
the document states, each fact with the words it is printed in. Code and a
person decide later whether any fact belongs in the workbook.

## Where values sit

- Identity sits at the top and the foot: the letterhead (issuer), the title,
  the addressee block ("To:", "The Insured:", "Tenant:"), the date line, the
  reference line ("Our ref", "Policy no", "Contract no"), and the signature
  block (who signed, in which capacity).
- Key facts sit in schedules, tables and clauses: amounts with their labels
  ("Monthly rental: R 18 500.00"), dates ("Commencement date"), terms
  ("Term: 36 months"), limits ("Sum insured"), balances ("Closing balance as
  at ..."), counts ("Number of attendees"), named parties and their roles.
- A table row is one fact per labelled cell: label from the row or column
  heading, value from the cell, quote = the row as printed.
- People are facts of kind person: the label is their role as printed
  ("Lessor's signatory", "Relationship manager", "Facilitator"), the value is
  the name as printed.

## Traps

- Copy, never compute. No totals, no annual figures from monthly ones, no
  VAT conversions, no percentages worked out. A figure not printed is not a
  fact.
- Every fact needs a quote that is IN the document, word for word, with the
  value inside it. A fact you cannot quote is left out.
- Do not repeat boilerplate as facts: clause text that states no figure,
  date, party or reference is not a fact. Prefer the twenty facts a reader
  would note over a hundred lines of contract wording.
- The issuer is not the entity the document is about: a bank's letter about
  a client names the bank as issuer and the client as about_entity.
- Never return bank or card account numbers, ID or passport numbers,
  passwords or medical details, as facts or as reference numbers; on a bank
  letter the account number is left out (the bank, the account holder and
  the balance are enough). A reference number that identifies the document
  (a policy, contract or letter reference) is fine. The parser drops any
  that slip through, so returning one only wastes the read.
- document_label is your own short description of the kind of document. It
  is never a company name and never a listed type's name unless the document
  truly is that type.
- could_evidence lists only elements the document's facts genuinely bear on;
  an empty list is the honest answer for most of these documents.

## Worked example

Invented, a two-page lease:

```
## Page 1
LEASE AGREEMENT
between KESTRELVALE PROPERTY HOLDINGS (PTY) LTD ("the Lessor") and BAOBAB ENGINEERING (PTY) LTD ("the Lessee")
Contract no: LA-2207
Premises: Unit 4, 12 Fig Tree Road, Gqeberha
Commencement date: 1 March 2025      Term: 36 months
Monthly rental: R 18 500.00 excluding VAT, escalating at 7% per annum
## Page 2
Signed at Gqeberha on 14 February 2025
For the Lessor: N. Dube (Director)        For the Lessee: T. Mokoena (Director)
```

```json
{"document_label": "Lease agreement", "document_title": "LEASE AGREEMENT",
 "issued_by": "KESTRELVALE PROPERTY HOLDINGS (PTY) LTD", "about_entity": "BAOBAB ENGINEERING (PTY) LTD",
 "document_date": "14 February 2025", "period": "Commencement date: 1 March 2025, Term: 36 months",
 "reference_numbers": "LA-2207", "could_evidence": [],
 "facts": [
  {"label": "Monthly rental", "value": "R 18 500.00", "unit": "R per month excluding VAT", "kind": "figure", "page": 1, "quote": "Monthly rental: R 18 500.00 excluding VAT, escalating at 7% per annum"},
  {"label": "Escalation", "value": "7%", "unit": "% per annum", "kind": "figure", "page": 1, "quote": "Monthly rental: R 18 500.00 excluding VAT, escalating at 7% per annum"},
  {"label": "Commencement date", "value": "1 March 2025", "unit": null, "kind": "date", "page": 1, "quote": "Commencement date: 1 March 2025"},
  {"label": "Term", "value": "36 months", "unit": "months", "kind": "condition", "page": 1, "quote": "Term: 36 months"},
  {"label": "Premises", "value": "Unit 4, 12 Fig Tree Road, Gqeberha", "unit": null, "kind": "other", "page": 1, "quote": "Premises: Unit 4, 12 Fig Tree Road, Gqeberha"},
  {"label": "For the Lessor (Director)", "value": "N. Dube", "unit": null, "kind": "person", "page": 2, "quote": "For the Lessor: N. Dube (Director)"}
 ],
 "exceptions": []}
```
