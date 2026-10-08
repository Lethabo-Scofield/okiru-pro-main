---
id: beneficial_interest_register
newType:
  name: "Beneficial interest register"
  aliases: ["Beneficial ownership register", "Register of beneficial interest", "Register of beneficial owners", "Beneficial interest register (BI register)"]
  narrows: "Ownership Confirmation"
element: OWNERSHIP
version: 2
hard: true
classify:
  is: "A register of the natural persons who hold a beneficial interest in the company's securities (Companies Act s56 and the CIPC beneficial-ownership filing): name, ID or passport, nationality, the percentage beneficial interest and how it is held."
  isNot:
    - "the securities / share register (who is the REGISTERED holder of each share)"
    - "a share certificate"
    - "an ownership organogram (a diagram)"
    - "a CIPC disclosure certificate (directors / members, not beneficial owners)"
  filenameHints: ["bi register", "beneficial interest", "beneficial ownership", "beneficial owners"]
  contentSignals: ["Beneficial Interest", "Beneficial Ownership", "Beneficial Owner", "Register of Beneficial", "Nature of interest", "Direct", "Indirect", "Nominee", "% beneficial interest"]
rowsField: beneficial_owner_rows
fields:
  - name: entity_name
    type: text
    required: true
    labels: ["Company", "Name of company", "Entity"]
    description: "The company whose beneficial owners are listed."
  - name: registration_number
    type: regno
    labels: ["Registration number", "Reg No"]
    description: "The company's CIPC registration number from the header."
  - name: incorporation_date
    type: date
    labels: ["Registration date", "Date of incorporation"]
    description: "The company's registration date, when the header prints it."
  - name: entity_type
    type: text
    labels: ["Company type", "(Pty) Ltd", "CC"]
    description: "The entity type as printed or as the name states it."
  - name: report_date
    type: date
    labels: ["As at", "Last updated", "Date updated"]
    description: "The date the register is stated as at, or was last updated."
  - name: beneficial_owner_name
    type: text
    required: true
    rowLevel: true
    labels: ["Beneficial owner", "Full names", "Name and surname"]
    description: "The natural person with the beneficial interest."
  - name: id_number
    type: idno
    rowLevel: true
    labels: ["ID number", "Identity / passport number", "ID / Passport"]
    description: "The beneficial owner's SA ID or passport number."
  - name: nationality
    type: text
    rowLevel: true
    labels: ["Nationality", "Citizenship"]
    description: "Nationality / citizenship, when a column states it."
  - name: beneficial_interest_percentage
    type: percent
    required: true
    rowLevel: true
    labels: ["% beneficial interest", "Percentage", "% held", "Beneficial interest"]
    description: "The percentage beneficial interest that person holds."
  - name: nature_of_interest
    type: text
    rowLevel: true
    labels: ["Nature of interest", "Direct / indirect", "How held"]
    description: "Direct or indirect, and through what (e.g. 'indirect, via the Mokoena Family Trust')."
  - name: registered_holder_name
    type: text
    rowLevel: true
    labels: ["Registered holder", "Nominee", "Held through", "Held by"]
    description: "The registered shareholder the interest is held through, when it differs from the beneficial owner."
  - name: date_interest_acquired
    type: date
    rowLevel: true
    labels: ["Date acquired", "Date of interest", "Effective date"]
    description: "When the person became a beneficial owner, when printed."
newFields: [beneficial_owner_rows, beneficial_owner_name, nationality, beneficial_interest_percentage, nature_of_interest, registered_holder_name, date_interest_acquired]
---
## What it is / is not

A beneficial interest (beneficial ownership) register lists the NATURAL PERSONS
who ultimately own or control the company's securities, directly or through
trusts, companies or nominees. Companies keep it under section 56 of the
Companies Act and, since the 2023 amendments, file beneficial-ownership
information with CIPC (persons holding 5% or more). For B-BBEE it is the bridge
from a registered holder (often a trust or holding company) to the people the
ownership points flow to.

It is not the securities register: that names the REGISTERED holder of each
share. When the two agree (a person holds directly), the BI register repeats
the share register's person with "direct" interest.

## Where values sit

- Header block: company name, registration number, sometimes registration
  date and type, and an "as at" or updated date.
- Table: one row per beneficial owner — full names, ID / passport, nationality,
  address, percentage beneficial interest, nature of interest (direct /
  indirect), the registered holder or nominee it is held through, date
  acquired.
- Small companies use a one-page scanned form, often rotated landscape.

## Traps

- Beneficial interest is not voting rights, and it is not the number of
  shares. Copy the percentage as printed; do not compute it.
- Registered holder vs beneficial owner: a trust or company in the "held
  through" column is not the beneficial owner. The person is.
- An indirect interest through a trust is still that person's row; do not
  also return the trust as an owner.
- The register states NO race and NO gender. Never fill them or infer black
  ownership from a name.
- Wrapped headings ("NAME AND" / "SURNAME") and table markup are not names.
  The header block's company name is a value only when it is the text beside
  "Company" or the register's title, never a stray `</td>`.
- IDs are often printed in groups ("800101 5009 087"); copy as printed.

## Worked example

Invented, scanned and rotated:

```
REGISTER OF BENEFICIAL INTEREST — BAOBAB ENGINEERING (PTY) LTD   Reg: 2015/123456/07   As at 30/06/2025
FULL NAMES     | ID NUMBER       | NATIONALITY  | % BENEFICIAL INTEREST | NATURE                      | REGISTERED HOLDER
Thabo Mokoena  | 800101 5009 087 | South African| 60%                   | Direct                      | Thabo Mokoena
Lerato Khumalo | 850615 0123 081 | South African| 40%                   | Indirect (via Khumalo Trust)| Khumalo Family Trust
```

```json
{"entity_name": "BAOBAB ENGINEERING (PTY) LTD", "registration_number": "2015/123456/07",
 "incorporation_date": null, "entity_type": "(Pty) Ltd", "report_date": "30/06/2025",
 "beneficial_owner_rows": [
   {"beneficial_owner_name": "Thabo Mokoena", "id_number": "800101 5009 087", "nationality": "South African", "beneficial_interest_percentage": "60%", "nature_of_interest": "Direct", "registered_holder_name": "Thabo Mokoena", "date_interest_acquired": null},
   {"beneficial_owner_name": "Lerato Khumalo", "id_number": "850615 0123 081", "nationality": "South African", "beneficial_interest_percentage": "40%", "nature_of_interest": "Indirect (via Khumalo Trust)", "registered_holder_name": "Khumalo Family Trust", "date_interest_acquired": null}
 ],
 "exceptions": ["Register states no race or gender."]}
```
