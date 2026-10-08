---
id: bbbee_verification_certificate
appliesTo:
  - B-BBEE Certificate
  - esd__valid_b_bbee_verification_certificate_per_sampled_supplier
element: ESD
version: 3
hard: false
classify:
  is: "A B-BBEE verification certificate issued by a SANAS-accredited verification agency (older certificates may name an IRBA-registered auditor), stating an entity's B-BBEE status level, points, ownership percentages, issue and expiry dates."
  isNot:
    - "a B-BBEE sworn affidavit for an EME or QSE (signed by the entity's own representative before a Commissioner of Oaths, no agency, no points table)"
    - "a CIPC-issued B-BBEE certificate for an EME (a CIPC form, not an agency verification)"
    - "a verification report or scorecard workpaper (many pages of element calculations)"
    - "a SETA or CIPC registration certificate"
  filenameHints: ["bee cert", "bee certificate", "bbbee certificate", "b-bbee certificate", "verification certificate"]
  contentSignals: ["B-BBEE Verification Certificate", "Status Level Verification Certificate", "B-BBEE Status Level", "Contributor", "Procurement Recognition Level", "SANAS", "BVA", "Black Ownership", "Black Women Ownership", "Empowering Supplier", "Date of Issue", "Expiry Date", "Codes of Good Practice"]
fields:
  - name: supplier_name
    type: text
    required: true
    labels: ["Measured Entity", "Entity name", "Company name", "Name of entity"]
    description: "The certified entity (on a supplier's certificate, the supplier) as printed at the top of the certificate. For a consolidated certificate, the parent named on page 1 — not a subsidiary from an annexure."
  - name: registration_number
    type: regno
    labels: ["Registration number", "Reg No", "Company registration"]
    description: "The certified entity's CIPC registration number from page 1."
  - name: vat_number
    type: text
    labels: ["VAT number", "VAT No"]
    description: "VAT registration number, when printed."
  - name: bee_level
    type: level
    required: true
    labels: ["B-BBEE Status Level", "Status Level", "B-BBEE Level", "Level", "Contributor"]
    description: "The FINAL B-BBEE status level as printed — digits ('Level 2') or words ('LEVEL ONE CONTRIBUTOR'), or 'Non-Compliant'. After any discounting."
  - name: total_points
    type: text
    labels: ["Total Score", "Total points", "Overall score"]
    description: "The total score as printed, with its maximum when shown (e.g. '98.40 / 109')."
  - name: procurement_recognition_level
    type: percent
    labels: ["Procurement Recognition Level", "B-BBEE Procurement Recognition", "Recognition level"]
    description: "The procurement recognition percentage (e.g. 135%, 125%, 0%)."
  - name: supplier_black_ownership_percentage
    type: percent
    labels: ["Black Ownership", "Black Ownership %", "Black Economic Interest"]
    description: "The certified entity's (the supplier's) black ownership percentage as printed. When voting rights and economic interest are both shown, use economic interest and report both in exceptions."
  - name: supplier_black_women_ownership_percentage
    type: percent
    labels: ["Black Women Ownership", "Black Female Ownership", "BWO"]
    description: "The certified entity's (the supplier's) black women ownership percentage."
  - name: empowering_supplier
    type: bool
    labels: ["Empowering Supplier", "Empowering Supplier Status"]
    description: "Whether the certificate states Empowering Supplier status (Yes / No)."
  - name: scorecard_type
    type: text
    labels: ["Scorecard", "Enterprise size", "Measured on"]
    description: "The scorecard the entity was measured on: Generic, QSE, EME, or Specialised, as printed."
  - name: sector_code
    type: text
    labels: ["Applicable Code", "Sector Code", "Codes of Good Practice", "Measured in terms of"]
    description: "The Code the verification used, e.g. 'Amended Codes of Good Practice (2013)', a named Sector Code (Financial Sector, Transport, Construction, ICT, ...)."
  - name: financial_year_end
    type: date
    labels: ["Financial Year End", "Financial period", "Year end", "Measurement period"]
    description: "The financial year (end date) the verification measured."
  - name: certificate_issue_date
    type: date
    required: true
    labels: ["Date of Issue", "Issue date", "Effective date", "Date issued"]
    description: "The date the certificate was issued / became effective."
  - name: certificate_expiry_date
    type: date
    required: true
    labels: ["Expiry Date", "Valid until", "Date of expiry"]
    description: "The expiry date (normally 12 months after issue)."
  - name: issuing_body
    type: text
    labels: ["Verification Agency", "Issued by", "Verified by"]
    description: "The verification agency that issued the certificate (on older certificates, an IRBA-registered auditor)."
  - name: agency_accreditation_number
    type: text
    labels: ["SANAS", "BVA", "Accreditation number"]
    description: "The agency's SANAS accreditation number (e.g. 'BVA 123'), not the certificate number."
  - name: certificate_number
    type: text
    labels: ["Certificate Number", "Certificate No", "Certificate reference"]
    description: "The certificate's own number / reference."
  - name: signatory_name
    type: text
    labels: ["Technical Signatory", "Signed by", "Authorised signatory"]
    description: "The agency's technical signatory."
newFields: [total_points, procurement_recognition_level, scorecard_type, sector_code, agency_accreditation_number]
dropFields: [certificate_recognition_level, valid_at_each_invoice_date]
---
## What it is / is not

A B-BBEE verification certificate is the one- or two-page summary an
accredited verification agency issues after verifying an entity against the
Codes of Good Practice. A pack contains two kinds and they look the same:

- the MEASURED ENTITY'S OWN certificate (usually last year's), which states the
  level and ownership percentages being re-verified; and
- SUPPLIERS' certificates, which prove each supplier's level for preferential
  procurement.

Read both the same way. The certified company's name always goes in
`supplier_name` and its number in `registration_number`, copied exactly:
whose certificate it is gets decided by comparing those with the measured
entity, in code, outside this document. Never call the certified company the
measured entity. The ownership figures go under the supplier ownership fields
either way: a certificate's ownership
percentages are the certified entity's, and the measured entity's own
ownership is read from its share register and ownership documents, never from
a certificate.

It is NOT a sworn affidavit (an EME or QSE's own declaration before a
Commissioner of Oaths, with no agency and no points table), not a CIPC-issued
EME certificate, and not the multi-page verification report behind it.

## Where values sit

- Top: agency logo and the SANAS accreditation mark with a "BVA" number; the
  title "B-BBEE Verification Certificate".
- Entity block: name, registration number, VAT number, address.
- Status block (large type): "B-BBEE Status Level: Level 2 Contributor" or
  "LEVEL ONE CONTRIBUTOR"; "Procurement Recognition Level: 125%".
- Points table: one row per element (Ownership, Management Control, Skills
  Development, Enterprise and Supplier Development, Socio-Economic
  Development), with a Total.
- Ownership block: Black Ownership %, Black Women Ownership %, sometimes Black
  Designated Group %, and "Empowering Supplier: Yes/No".
- Dates block: Financial Year End, Date of Issue, Expiry Date; certificate
  number; technical signatory's signature.
- Page 2 (when present): an ANNEXURE listing subsidiaries of a consolidated
  certificate, with their own registration numbers.

## Traps

- The level is often written in WORDS ("LEVEL ONE CONTRIBUTOR"). That is level
  one; copy it as printed and never report the level as missing.
- Discounting: some certificates show the level BEFORE and AFTER the
  priority-element discount ("Level 3, discounted to Level 4"). The status
  level is the final one.
- The procurement recognition (e.g. 135%) is not the black ownership
  percentage, and neither is the points total.
- Three different numbers sit on the page: the agency's accreditation ("BVA
  123"), the certificate number, and the entity's CIPC registration number.
  Keep them apart.
- A consolidated certificate's annexure lists subsidiaries. The column heading
  "Registration Number" there is a heading, not the entity's name, and a
  subsidiary's number is not the certified entity's.
- The two registration numbers (page 1 and annexure) may disagree by a digit.
  Copy page 1's and report the mismatch in exceptions.
- Expiry, issue and financial year end are three different dates. An expired
  certificate is still read in full — expiry is judged later against the
  measurement period.
- Black ownership when the certificate shows voting rights and economic
  interest separately: report economic interest in the field and both in
  exceptions.

## Worked example

Invented supplier certificate, digital PDF:

```
[Agency logo]   SANAS accredited  BVA 123
B-BBEE VERIFICATION CERTIFICATE
Measured Entity: KHANYA OFFICE SUPPLIES (PTY) LTD   Registration Number: 2012 / 654321 / 07
VAT No: 4123456789
B-BBEE STATUS: LEVEL TWO CONTRIBUTOR      Procurement Recognition Level: 125%
Scorecard: Generic   Measured in terms of the Amended Codes of Good Practice
Total Score 98.40 / 109    Black Ownership 51.00%   Black Women Ownership 30.20%   Empowering Supplier: Yes
Financial Year End: 30 June 2024   Date of Issue: 14 October 2024   Expiry Date: 13 October 2025
Certificate No: KOS-24-0187     Technical Signatory: S. Botha
```

```json
{"supplier_name": "KHANYA OFFICE SUPPLIES (PTY) LTD", "registration_number": "2012 / 654321 / 07",
 "vat_number": "4123456789", "bee_level": "LEVEL TWO CONTRIBUTOR", "total_points": "98.40 / 109",
 "procurement_recognition_level": "125%", "supplier_black_ownership_percentage": "51.00%",
 "supplier_black_women_ownership_percentage": "30.20%", "empowering_supplier": true, "scorecard_type": "Generic",
 "sector_code": "Amended Codes of Good Practice", "financial_year_end": "30 June 2024",
 "certificate_issue_date": "14 October 2024", "certificate_expiry_date": "13 October 2025",
 "issuing_body": null, "agency_accreditation_number": "BVA 123", "certificate_number": "KOS-24-0187",
 "signatory_name": "S. Botha", "exceptions": ["Agency name appears only as a logo; not stated in text."]}
```
