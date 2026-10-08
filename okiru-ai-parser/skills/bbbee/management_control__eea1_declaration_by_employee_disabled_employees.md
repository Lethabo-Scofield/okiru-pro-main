---
id: management_control__eea1_declaration_by_employee_disabled_employees
appliesTo:
  - management_control__eea1_declaration_by_employee_disabled_employees
element: MANAGEMENT_CONTROL
version: 3
hard: true
classify:
  is: "Form EEA1, the Employment Equity Act declaration in which ONE person self-declares racial group, gender, foreign nationality and disability, and signs it."
  isNot:
    - "an EEA2 employment equity report (the employer's annual report, tables by occupational level)"
    - "an EEA4 income differential statement"
    - "an employment equity register or headcount table (many people in rows)"
    - "a payroll or salary report"
    - "a medical certificate or occupational health report (may be attached, but is a different document)"
    - "an SA ID document"
  filenameHints: ["eea1", "eea 1", "declaration by employee", "employee declaration", "ee declaration"]
  contentSignals: ["EEA1", "DECLARATION BY EMPLOYEE", "Employment Equity Act", "Racial group", "Foreign national", "Disability", "African", "Coloured", "Indian", "White"]
fields:
  - name: employee_name
    type: text
    required: true
    labels: ["Full name", "Full names", "Name and surname", "Employee name", "First name(s)"]
    description: "The declaring person's name as written, surname and first names in the order printed."
  - name: id_number
    type: idno
    labels: ["ID number", "Identity number", "Passport number"]
    description: "SA ID or passport number as written. Optional on many versions of the form."
  - name: race
    type: text
    required: true
    labels: ["Racial group", "Race", "Population group"]
    description: "The ticked group exactly: African, Coloured, Indian or White. Never translate it to Black or non-Black."
  - name: gender
    type: text
    required: true
    labels: ["Gender", "Sex"]
    description: "Male or Female as ticked."
  - name: is_foreign
    type: bool
    required: true
    labels: ["Foreign national", "Are you a foreign national"]
    description: "True only when the Yes box of the foreign-national question is clearly marked, false when No is. Null when neither box is clearly marked, and say so in exceptions: a blank or doubtful mark is never a Yes."
  - name: nationality
    type: text
    labels: ["Nationality", "Country of citizenship"]
    description: "Country of citizenship only when the form states one."
  - name: citizenship_acquired_date
    type: date
    labels: ["Date citizenship acquired", "Date of naturalisation", "Citizenship by naturalisation", "Permanent residence"]
    description: "The date South African citizenship or permanent residence was obtained, when completed, as written."
  - name: disability_declared
    type: bool
    required: true
    labels: ["Do you have a disability", "long-term or recurring physical or mental impairment"]
    description: "Yes or No as ticked in the disability question."
  - name: disability_description
    type: text
    labels: ["If yes, describe", "Nature of disability", "Describe the impairment"]
    description: "Only what the person wrote, only when disability is Yes."
  - name: declarant_role
    type: text
    labels: ["Capacity", "Designation"]
    description: "The role the signatory claims on the form, especially a handwritten role (owner, director) replacing a struck-out 'employee'."
  - name: eea1_signed
    type: bool
    required: true
    labels: ["Signature of employee", "Signature"]
    description: "True only when a signature or initials are visible in the signature space."
  - name: eea1_date
    type: date
    required: true
    labels: ["Date signed", "Date of signature"]
    description: "The date written next to the signature, as written."
  - name: medical_supporting_doc_present
    type: bool
    labels: ["Medical certificate", "Supporting documentation"]
    description: "Only for a declared disability: whether a medical or occupational health document is attached in the same file."
  - name: practitioner_hpcsa_number
    type: text
    labels: ["HPCSA", "Practice number"]
    description: "The registration number of the practitioner on an attached medical document, as printed."
  - name: ee_act_disability_definition_met
    type: bool
    labels: []
    description: "Only when an attached medical document itself states that the impairment is long-term or recurring and substantially limiting. Otherwise null; never your own judgement."
newFields: [nationality, citizenship_acquired_date, disability_declared, disability_description, declarant_role]
---
## What it is / is not

Form EEA1 is the statutory "Declaration by Employee" under the Employment
Equity Act, 55 of 1998. Each person completes one: personal details, racial
group (African, Coloured, Indian, White), gender, whether they are a foreign
national, how and when they obtained South African citizenship if not by
birth, whether they have a disability, then a signature and date. Verifiers use
it to support the race, gender, nationality and disability recorded for that
person in the employment equity register and the management control table.

The matrix type is named for disabled employees because that is where a
verifier most often asks for it. The form is the same for every person, so
read every EEA1 with this skill, whether or not disability is ticked.

ONE form is one document: the fields are the declaring person's. When a file
holds several forms, read the first form and name the other declarants in
exceptions; never mix two people's answers.

It is NOT an EEA2, an EEA4, an EE register, a payroll report, a medical
certificate or an ID document.

## Where values sit

- The form is usually one page. The name (sometimes an ID or employee number)
  comes first; the racial group, gender and foreign-national questions follow
  as tick boxes; the citizenship and disability questions come next; the
  signature and date sit at the bottom. Item numbers differ between versions
  of the form, so read the question, not the number.
- Many EEA1s are handwritten and scanned. A tick, cross, circle or underline
  marks the choice. When two boxes look marked, report the clearer one and
  flag the other in exceptions.
- A medical certificate for a declared disability may follow on the next page.

## Traps

- One form is not the workforce. An EEA1 describes one person; never turn it
  into headcounts or percentages.
- The person is normally already in the EE register or management table. The
  form adds race, gender, nationality and disability to that person; it
  carries no occupational level.
- A struck-out printed role with another written in by hand: copy the
  handwritten role into `declarant_role`. The form still declares that
  person's race and gender.
- Only a date of naturalisation or permanent residence belongs in
  `citizenship_acquired_date`. A birth date, an ID number or "N/A" written in
  that space is not one: return null and say what was written.
- The signature box and its date are separate from any "ID no" label.
- Race is the ticked group, verbatim. Never derive it from a surname, a photo
  or an ID number.
- Only the foreign-national question decides `is_foreign`; a ticked racial
  group never does, either way. Copy both as declared. A wrong Yes removes the
  person from every employment equity count, so when the foreign-national
  boxes are blank, smudged or both look marked, return null and say so.
- Unsigned or undated: `eea1_signed` false or `eea1_date` null, and say so.
  Never borrow a date from another page.

## Worked example

Invented, a scanned two-page file: the EEA1 and an attached medical
certificate.

```
Page 1  EEA1 - DECLARATION BY EMPLOYEE
        Full names: Nomsa Grace DLAMINI      ID number: (blank)
        Racial group: [ ] African [X] Coloured [ ] Indian [ ] White     Gender: [ ] Male [X] Female
        Foreign national: [ ] Yes [X] No
        Do you have a disability? [X] Yes [ ] No   If yes, describe: partial hearing loss, left ear
        Signature of employee: (signed)   Date signed: 05/02/2025
Page 2  Medical certificate, Dr K. Venter, HPCSA MP 0123456: "long-term hearing impairment that substantially limits ..."
```

```json
{"employee_name": "Nomsa Grace DLAMINI", "id_number": null, "race": "Coloured", "gender": "Female",
 "is_foreign": false, "nationality": null, "citizenship_acquired_date": null,
 "disability_declared": true, "disability_description": "partial hearing loss, left ear", "declarant_role": null,
 "eea1_signed": true, "eea1_date": "05/02/2025", "medical_supporting_doc_present": true,
 "practitioner_hpcsa_number": "MP 0123456", "ee_act_disability_definition_met": true,
 "exceptions": ["ID number left blank on the form."]}
```
