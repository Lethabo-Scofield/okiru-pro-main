---
id: _open
version: 1
rowsField: facts
fields:
  - name: document_label
    type: text
    required: true
    description: "What this document is, in a few plain words of your own: 'Insurance schedule', 'Municipal rates letter', 'Lease agreement'. Name the kind of document, never its company."
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
    description: "The company, site or person the document is about or addressed to, as printed. Not the issuer."
  - name: document_date
    type: date
    labels: ["date", "dated", "signed on", "issued on"]
    description: "The date the document was issued or signed, as printed."
  - name: period
    type: text
    labels: ["period", "from", "to", "valid until", "term"]
    description: "The period the document covers or is valid for, as printed."
  - name: reference_numbers
    type: text
    labels: ["reference", "ref", "account number", "policy number", "erf number", "contract number"]
    description: "Reference, contract, policy, account or property numbers printed on the document, as printed, separated by '; '."
  - name: could_evidence
    type: text
    description: "The ESG data elements this document could support, as a list of element keys (GHG_ENERGY, FLEET, WASTE, WATER, ISO_ENVIRONMENTAL, EMPLOYMENT_EQUITY, HEALTH_SAFETY, TRAINING, COMMUNITY_CSI, SUPPLIER_ESG, BOARD_GOVERNANCE, ETHICS_COMPLIANCE, RISK_ASSURANCE, FINANCIAL), or an empty list when it supports none."
  - name: label
    type: text
    required: true
    rowLevel: true
    description: "What the fact is, in the document's OWN words where it names it ('Sum insured', 'Rates levied', 'Number of attendees')."
  - name: value
    type: text
    required: true
    rowLevel: true
    description: "The value exactly as printed: a figure with its sign and separators, a date as written, a name, a number."
  - name: unit
    type: text
    rowLevel: true
    description: "The unit or currency as printed ('R', 'kWh', 'kL', 'kg', 'litres', 'hours', '%'), or null. Never converted."
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

The open read is for a document that is NONE of the ESG document types the
platform has a reading guide for: an insurance schedule, a municipal rates
letter, a lease, a landlord's service-charge letter, a quotation, a permit, a
memo. It is read for what it IS, not forced into the nearest listed type.

It is not an assurance decision. You do not decide whether a figure is in
scope, which scope it belongs to, or which ESG cell it fills: you report
what the document states, each fact with the words it is printed in. Code
and a person decide later whether any fact belongs in the workbook.

## Where values sit

- Identity sits at the top and the foot: the letterhead (issuer), the title,
  the addressee block, the date line, the reference line ("Account no",
  "Policy no", "Erf"), and the signature block.
- Key facts sit in schedules, tables and clauses: amounts with their labels,
  quantities WITH their units ("Consumption: 4 210 kWh"), dates, terms,
  limits, counts, named sites and parties and their roles.
- A table row is one fact per labelled cell: label from the row or column
  heading, value from the cell, quote = the row as printed.
- People are facts of kind person: the label is their role as printed, the
  value is the name as printed.

## Traps

- Copy, never compute or convert. No totals, no annual figures from monthly
  ones, no unit conversions (MWh stays MWh), no emissions worked out from
  litres or kWh. A figure not printed is not a fact.
- Every fact needs a quote that is IN the document, word for word, with the
  value inside it. A fact you cannot quote is left out.
- A rand amount is not a quantity: "Electricity R 4 210" is money, "4 210
  kWh" is consumption. Keep the unit the document prints.
- Do not repeat boilerplate as facts: clause text that states no figure,
  date, party or reference is not a fact.
- The issuer is not the entity the document is about.
- Never return bank account numbers, card numbers, passwords or medical
  details as facts.
- document_label is your own short description of the kind of document,
  never a company name and never a listed type's name unless the document
  truly is that type. could_evidence is often an empty list.

## Worked example

Invented, a one-page insurance schedule:

```
POLICY SCHEDULE — ASSETS ALL RISKS
Insurer: Thornveld Mutual Insurance Ltd        Policy no: PM-55120
The Insured: Baobab Logistics (Pty) Ltd
Period of insurance: 1 July 2025 to 30 June 2026
Item 1  Warehouse, Erf 3301 Polokwane     Sum insured R 12 400 000
Item 2  Rooftop solar installation 150 kWp  Sum insured R 2 150 000
Annual premium: R 96 420.00
```

```json
{"document_label": "Insurance schedule", "document_title": "POLICY SCHEDULE — ASSETS ALL RISKS",
 "issued_by": "Thornveld Mutual Insurance Ltd", "about_entity": "Baobab Logistics (Pty) Ltd",
 "document_date": null, "period": "1 July 2025 to 30 June 2026",
 "reference_numbers": "PM-55120", "could_evidence": ["GHG_ENERGY"],
 "facts": [
  {"label": "Item 1 Warehouse, Erf 3301 Polokwane — Sum insured", "value": "R 12 400 000", "unit": "R", "kind": "figure", "page": null, "quote": "Item 1  Warehouse, Erf 3301 Polokwane     Sum insured R 12 400 000"},
  {"label": "Rooftop solar installation", "value": "150 kWp", "unit": "kWp", "kind": "figure", "page": null, "quote": "Item 2  Rooftop solar installation 150 kWp  Sum insured R 2 150 000"},
  {"label": "Annual premium", "value": "R 96 420.00", "unit": "R per year", "kind": "figure", "page": null, "quote": "Annual premium: R 96 420.00"}
 ],
 "exceptions": []}
```
