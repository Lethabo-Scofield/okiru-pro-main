---
id: ownership_representation_letter
appliesTo:
  - Ownership Confirmation
element: OWNERSHIP
version: 2
hard: false
classify:
  is: "A signed letter, usually on the entity's letterhead and addressed to the verification agency, in which management states who owns the entity, in what percentage, and who manages and controls it. Usually unsworn."
  isNot:
    - "a management representation letter confirming no undisclosed acquisition debt, side agreements or options (deal financing)"
    - "a sworn affidavit for an EME or QSE, signed before a commissioner of oaths"
    - "a share certificate, share register or beneficial interest register"
    - "a B-BBEE certificate"
    - "board resolution or minutes"
    - "a letter confirming compliance with the EE Act, Skills Development Act and SDL Act"
  filenameHints: ["ownership letter", "ownership confirmation", "ownership and control"]
  contentSignals: ["To whom it may concern", "We hereby confirm", "This serves to confirm", "shareholding", "member's interest", "management and control", "decision making", "Yours faithfully", "Yours sincerely"]
rowsField: stated_owner_rows
fields:
  - name: signing_date
    type: date
    required: true
    labels: ["Dated", "Date of letter"]
    description: "The letter's date, at the top or beside the signature, as written."
  - name: entity_name
    type: text
    required: true
    labels: ["Re:", "Company name"]
    description: "The measured entity the letter speaks for, from the letterhead or the 'Re:' line, as written."
  - name: trading_name
    type: text
    labels: ["Trading as", "t/a"]
    description: "The trading name, when given."
  - name: registration_number
    type: regno
    labels: ["Reg No", "Co. Reg", "Co. Reg. No", "Registration number"]
    description: "The entity's own CIPC number, often in the letterhead footer, as printed."
  - name: vat_number
    type: text
    labels: ["VAT No", "VAT number", "VAT Reg"]
    description: "The entity's own VAT number, when printed."
  - name: ownership_statement
    type: text
    labels: []
    description: "The letter's overall ownership claim, verbatim (for example 'which is 100% black owned'). A representation, not evidence: it never becomes the entity's ownership percentage."
  - name: control_statement
    type: text
    labels: []
    description: "The sentence that says who manages and controls the entity, verbatim."
  - name: years_in_operation
    type: count
    labels: ["in operation for", "trading for", "in business for"]
    description: "Years in operation as the letter states them, as a bare number."
  - name: stated_bee_level
    type: text
    labels: ["B-BBEE level", "BEE level", "B-BBEE status level"]
    description: "Only a level the letter itself claims, as printed. Usually absent."
  - name: signatory_name
    type: text
    required: true
    labels: ["Yours faithfully", "Yours sincerely"]
    description: "Who signed, from the signature block."
  - name: signatory_role
    type: text
    labels: ["Designation", "Title", "Capacity"]
    description: "The signatory's role as printed under the name."
  - name: scope_of_declaration
    type: text
    labels: []
    description: "What the letter represents, as a short list in its own words (for example ownership percentage, management and control, years in operation)."
  - name: sworn
    type: bool
    labels: ["Commissioner of Oaths"]
    description: "True only when a commissioner of oaths stamp and oath wording are present (then it is an affidavit: say so in exceptions)."
  - name: stated_owner_name
    type: text
    required: true
    rowLevel: true
    labels: ["Owner", "Shareholder", "Member"]
    description: "One row per person or entity the letter names as an owner, as written."
  - name: id_number
    type: idno
    rowLevel: true
    labels: ["ID number", "Identity number"]
    description: "That owner's ID number, when the letter gives it, as printed."
  - name: stated_percentage
    type: percent
    rowLevel: true
    labels: ["holds", "member's interest", "owns"]
    description: "The percentage the letter says that owner holds, as printed. A representation, not a shareholding record."
newFields: [trading_name, ownership_statement, control_statement, years_in_operation, stated_bee_level, sworn, stated_owner_rows, stated_owner_name, stated_percentage]
dropFields: [black_ownership, black_women_ownership]
---
## What it is / is not

Verification agencies often ask management for a signed letter that states,
in plain words, who owns the business and who runs it: "We confirm that A
holds 60% of the shares, B holds 40%, and A runs the business day to day." It
is on the entity's letterhead, dated, addressed to the agency or "To whom it
may concern", and signed by a director, member or manager. It is not sworn.

It is a REPRESENTATION, not ownership evidence. Everything it says about
ownership is copied into the `stated_*` fields and `ownership_statement`,
which never set the entity's ownership: that comes from the share or members'
register, the CIPC record and the ID documents. A verifier reads the letter
alongside them.

It is NOT:
- the management representation letter confirming no undisclosed acquisition
  debt, side agreements or options (deal financing in a B-BBEE transaction,
  signed by the entity and each black participant). A letter about who owns
  and controls the business is this type, even when it is titled "Management
  representation letter";
- a sworn affidavit (EME or QSE), which carries oath wording and a
  commissioner of oaths stamp;
- a share certificate, share register or beneficial interest register
  (records, not representations);
- a B-BBEE certificate, board minutes or a compliance-confirmation letter.

## Where values sit

- Letterhead (top): entity name, trading name, sometimes the address.
- Date: top right or top left, or beside the signature.
- Body: owners, percentages, ID numbers, years in operation, and the control
  sentence.
- Signature block (bottom): signature, name, designation.
- Footer: registration number, VAT number, directors' names.

## Traps

- The title "Management representation letter" does not make it the
  acquisition-debt type. Classify by what it represents.
- "100% black owned" also appears in EME and QSE affidavits, but without oath
  wording and a commissioner's stamp this is a letter: `sworn` false.
- In "Mr A, ID no ...", "no" means number. The signing date is the letter's
  date.
- Take the entity from the letterhead or the "Re:" line. A sentence fragment
  such as "we have" or "the company" is not a name.
- An administrator or manager often signs for the owner. Copy who signed and
  their role as printed, and flag that the owner did not sign.
- "In operation for 20 years" may predate the CIPC registration (trading
  before incorporation). Copy the stated number; do not correct it.
- The registration and VAT numbers here are the measured entity's own, never
  a supplier's.
- The letter usually says "black owned" without a race per owner. Never infer
  race from names.

## Worked example

Invented, a scanned one-page letter:

```
LERATO LOGISTICS CC  t/a Swift Haul
15 May 2025
To: The Verification Manager
"We hereby confirm that Ms Lerato Mokoena, ID no 800101 0123 089, holds 100% of the member's interest
in the close corporation, which is 100% black owned and has been in operation for 18 years.
Ms Mokoena is responsible for all strategic decisions and the day-to-day management of the business."
Yours faithfully, N. Khumalo, Office Administrator
Co. Reg 2007 / 012345 / 23    VAT No 4123456789
```

```json
{"signing_date": "15 May 2025", "entity_name": "LERATO LOGISTICS CC", "trading_name": "Swift Haul",
 "registration_number": "2007 / 012345 / 23", "vat_number": "4123456789",
 "ownership_statement": "which is 100% black owned",
 "control_statement": "Ms Mokoena is responsible for all strategic decisions and the day-to-day management of the business.",
 "years_in_operation": 18, "stated_bee_level": null, "signatory_name": "N. Khumalo", "signatory_role": "Office Administrator",
 "scope_of_declaration": "member's interest, black ownership, years in operation, management and control", "sworn": false,
 "stated_owner_rows": [
   {"stated_owner_name": "Ms Lerato Mokoena", "id_number": "800101 0123 089", "stated_percentage": "100%"}
 ],
 "exceptions": ["Signed by the office administrator, not by the owner."]}
```
