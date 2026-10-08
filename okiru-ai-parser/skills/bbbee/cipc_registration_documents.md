---
id: cipc_registration_documents
appliesTo:
  - ownership__cipc_registration_documents_cor14_1_cor14_3
element: OWNERSHIP
version: 2
hard: false
classify:
  is: "A CIPC record of the entity's registration: a Disclosure Certificate / company or CC information printout, a COR14.3 registration certificate, or a CK1/CK2 for a close corporation — enterprise name, registration number and date, type, status, addresses, and the directors or members."
  isNot:
    - "a COR39 (notice of change of directors only — a separate type)"
    - "a share register or share certificate"
    - "a SETA registration certificate (names a SETA and an SDL number)"
    - "a SARS tax clearance / tax compliance status PIN letter"
    - "a B-BBEE certificate"
  filenameHints: ["cipc", "cor14", "cor 14", "ck1", "ck2", "disclosure certificate", "company registration"]
  contentSignals: ["Companies and Intellectual Property Commission", "CIPC", "Disclosure Certificate", "Enterprise Information", "Enterprise Name", "Enterprise Type", "Enterprise Status", "Registration Number", "Active Members / Directors", "Member's Interest", "COR14.3", "Close Corporation", "In Business"]
rowsField: director_rows
fields:
  - name: entity_name
    type: text
    required: true
    labels: ["Enterprise Name", "Company Name", "Name of Close Corporation"]
    description: "The registered enterprise name only — stop before the registration number, addresses or anything else on the line."
  - name: registration_number
    type: regno
    required: true
    labels: ["Registration Number", "Enterprise Number", "Reg No"]
    description: "The CIPC registration number, copied as printed even when it has spaces around the slashes ('2009 / 012345 / 23')."
  - name: incorporation_date
    type: date
    labels: ["Registration Date", "Date of Incorporation", "Date of Registration"]
    description: "The date the entity was registered."
  - name: entity_type
    type: text
    labels: ["Enterprise Type", "Company Type"]
    description: "The entity type as printed: 'Close Corporation', 'Private Company', 'Public Company', 'Non Profit Company', 'Personal Liability Company'."
  - name: enterprise_status
    type: text
    labels: ["Enterprise Status", "Company Status"]
    description: "Registration status: 'In Business', 'Deregistration Process', 'Final Deregistration', 'AR Final Deregistration'."
  - name: financial_year_end_month
    type: text
    labels: ["Financial Year End", "Year End"]
    description: "The financial year-end month as registered (CIPC prints a month, e.g. 'June')."
  - name: tax_number
    type: text
    labels: ["Tax Number", "Income Tax Number"]
    description: "The SARS income tax number, when printed."
  - name: registered_address
    type: text
    labels: ["Registered Address", "Registered Office", "Physical Address"]
    description: "The CURRENT registered (physical) address only — not the change history lines."
  - name: postal_address
    type: text
    labels: ["Postal Address"]
    description: "The current postal address, when printed."
  - name: certificate_date
    type: date
    labels: ["Printed on", "Date printed", "Certificate date", "Date issued"]
    description: "The date the certificate / printout was issued (usually in the page header with a time)."
  - name: accounting_officer_name
    type: text
    labels: ["Accounting Officer", "Accounting Officer Details"]
    description: "The CURRENT accounting officer (close corporations), with profession / practice number when printed. Resigned officers are history."
  - name: auditor_name
    type: text
    labels: ["Auditor", "Auditor Details"]
    description: "The CURRENT auditor (companies), when printed."
  - name: full_name
    type: text
    required: true
    rowLevel: true
    labels: ["Surname and First Names", "Full names"]
    description: "One active member or director per row, as printed ('SURNAME, FIRST NAMES')."
  - name: id_number
    type: idno
    rowLevel: true
    labels: ["ID Number", "Identity number", "Date of Birth / ID"]
    description: "Their ID number when the column is filled; null when the column is blank."
  - name: role_type
    type: text
    rowLevel: true
    labels: ["Member type", "Director type", "Designation", "Capacity"]
    description: "'Member', 'Director', 'Alternate Director', etc., as printed."
  - name: status
    type: text
    rowLevel: true
    labels: ["Member status", "Director status", "Active / Resigned"]
    description: "'Active' / 'Resigned' as printed."
  - name: appointment_date
    type: date
    rowLevel: true
    labels: ["Appointment Date", "Date Appointed"]
    description: "When that member or director was appointed."
  - name: member_interest_percentage
    type: percent
    rowLevel: true
    labels: ["Member's Interest", "Member Interest %", "Interest"]
    description: "A close corporation member's percentage interest (the CC equivalent of a shareholding)."
  - name: member_contribution
    type: money
    rowLevel: true
    labels: ["Member Contribution", "Contribution"]
    description: "A CC member's contribution in Rand, when printed."
newFields: [enterprise_status, financial_year_end_month, tax_number, postal_address, accounting_officer_name, auditor_name, director_rows, member_interest_percentage, member_contribution]
---
## What it is / is not

CIPC (the Companies and Intellectual Property Commission) is South Africa's
company registry. Its records establish the measured entity's legal identity:
the registered name, the registration number every other document must match,
the entity type, whether it is still in business, and who its directors (or,
for a close corporation, members) are.

Common forms: the CIPC Disclosure Certificate (a multi-page printout with
"Enterprise Information", "Active Members / Directors", auditor / accounting
officer and history sections), the COR14.3 registration certificate, and for
older close corporations the CK1 (founding statement) / CK2 (amended founding
statement).

A close corporation (number ending /23) has MEMBERS holding a percentage
MEMBERS' INTEREST, not shareholders — on a CC's disclosure certificate the
members' interest IS the ownership, and the members are its owners. A company
(/07, /06, /21, /08) lists directors; its shareholders are on the share
register, not here.

It is not a COR39 (a notice of director changes), not a SETA certificate and
not a SARS document.

## Where values sit

- Page header (every page): "Disclosure Certificate", the date and time it
  was printed, and often the registration number.
- Enterprise Information block: label/value pairs — Enterprise Name,
  Registration Number, Registration Date, Enterprise Type, Enterprise Status,
  Financial Year End (a month), Tax Number, then Addresses (registered,
  postal).
- Active Members / Directors table: surname and first names, ID number,
  type, status, appointment date, and for a CC: member contribution and
  member's interest %.
- Auditor / Accounting Officer section: name, profession / practice number,
  status and dates; resigned ones listed too.
- History sections: name changes, address changes ("Change on dd/mm/yyyy"),
  previous members and officers.

## Traps

- The registration number is printed with SPACES around the slashes
  ("2009 / 012345 / 23"). It is valid — copy it.
- On text extraction the Enterprise Information block can collapse into one
  long line: "SIZWE LOGISTICS 2009 / 012345 / 23 Registration Number Enterprise
  Name ...". The name is only the words before the number; never return the
  run of text.
- Address change history ("Change on 15/08/2017 ...") is not the address. Take
  the current registered address only.
- Resigned members, directors and accounting officers appear in history. Only
  ACTIVE ones go in `director_rows`; only the current officer in
  `accounting_officer_name`.
- A blank ID column is a blank value (null), not the next column's content.
- Financial Year End on CIPC is a MONTH, not a date — copy the month into
  `financial_year_end_month`. It is not the AFS's `financial_year_end` (a full
  date for one specific year).
- Members' interest is a percentage of the CC; member contribution is Rand.
  Do not swap them.
- The certificate date (print date) is not the registration date.

## Worked example

Invented CC disclosure certificate, digital PDF:

```
CIPC  Disclosure Certificate                       Date: 2025-03-14 10:05
ENTERPRISE INFORMATION
Enterprise Name: SIZWE LOGISTICS        Registration Number: 2009 / 012345 / 23
Registration Date: 12/05/2009   Enterprise Type: Close Corporation   Enterprise Status: In Business
Financial Year End: June    Tax Number: 9123456789
Addresses: Registered Address: 14 Acacia Street, Pinetown, 3610 (Change on 01/02/2018)  Postal Address: PO Box 1234, Pinetown, 3600
ACTIVE MEMBERS / DIRECTORS
Surname and First Names | ID Number | Type   | Status | Appointment Date | Contribution | Member's Interest
MOKOENA, THABO          |           | Member | Active | 12/05/2009       | R250.00      | 100%
ACCOUNTING OFFICER: P. van Wyk, Practice no. 12345, Active; previous officer resigned 01/02/2018
```

```json
{"entity_name": "SIZWE LOGISTICS", "registration_number": "2009 / 012345 / 23", "incorporation_date": "12/05/2009",
 "entity_type": "Close Corporation", "enterprise_status": "In Business", "financial_year_end_month": "June",
 "tax_number": "9123456789", "registered_address": "14 Acacia Street, Pinetown, 3610",
 "postal_address": "PO Box 1234, Pinetown, 3600", "certificate_date": "2025-03-14",
 "accounting_officer_name": "P. van Wyk, Practice no. 12345", "auditor_name": null,
 "director_rows": [
   {"full_name": "MOKOENA, THABO", "id_number": null, "role_type": "Member", "status": "Active", "appointment_date": "12/05/2009", "member_interest_percentage": "100%", "member_contribution": "R250.00"}
 ],
 "exceptions": ["Member ID number column is blank on the certificate."]}
```
