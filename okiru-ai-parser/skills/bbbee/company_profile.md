---
id: company_profile
newType:
  name: "Company profile"
  aliases: ["Company overview", "Corporate profile", "Business profile"]
element: OWNERSHIP
version: 2
hard: false
classify:
  is: "A narrative company profile or overview the business wrote about itself: history, owners or directors, services or products, clients, fleet or equipment, contact details. Marketing text, not a statutory or financial record."
  isNot:
    - "CIPC registration documents (COR14.3, CK1, disclosure certificate)"
    - "a share register, share certificate or beneficial interest register"
    - "an ownership or control representation letter"
    - "a B-BBEE certificate or sworn affidavit"
    - "annual financial statements"
    - "an SED or skills development schedule"
  filenameHints: ["company profile", "company overview", "corporate profile", "capability statement"]
  contentSignals: ["Company Profile", "About us", "Company History", "Our services", "Mission", "Vision", "Founded", "Established", "Our clients", "Contact us"]
fields:
  - name: entity_name
    type: text
    required: true
    labels: ["Company name", "Registered name", "Name of company"]
    description: "The registered name the profile gives for the business, as written."
  - name: trading_name
    type: text
    labels: ["Trading as", "t/a", "Trading name"]
    description: "The trading name, when it differs from the registered name."
  - name: registration_number
    type: regno
    labels: ["Registration number", "Reg no", "Company registration", "CK number"]
    description: "The business's own CIPC number, when the profile prints one, as printed."
  - name: trading_since
    type: text
    labels: ["Established", "Founded", "Trading since"]
    description: "When the business says it started trading, as written (a year, or a month and year). It may predate the CIPC registration."
  - name: directors_or_members
    type: text
    labels: ["Directors", "Members", "Founder", "Management team"]
    description: "The people the profile names as owners, founders, members or directors, as written and comma-separated."
  - name: core_business
    type: text
    labels: ["Our services", "What we do", "Core business"]
    description: "A short verbatim summary of what the business does. This is the evidence for its sector."
  - name: industry_sector
    type: text
    labels: ["Industry", "Sector"]
    description: "Only a sector the profile itself states. Never choose a B-BBEE sector code yourself."
  - name: ownership_statement
    type: text
    labels: []
    description: "Any ownership or empowerment claim, verbatim (for example 'a 100% black-owned family business'). A claim, never ownership evidence: it never becomes a percentage."
  - name: accounting_officer_name
    type: text
    labels: ["Accountants", "Accounting officer", "Bookkeepers"]
    description: "The accounting firm, bookkeeper or accounting officer the profile names, as written."
  - name: auditor_name
    type: text
    labels: ["Auditors"]
    description: "The auditors the profile names, only when it calls them auditors."
  - name: employee_count
    type: count
    labels: ["Number of employees", "Staff complement", "Workforce"]
    description: "Only a headcount the profile states, as a bare number."
newFields: [trading_name, trading_since, directors_or_members, core_business, industry_sector, ownership_statement, accounting_officer_name, auditor_name, employee_count]
---
## What it is / is not

A company profile is the document a business uses to introduce itself to
customers: its history, who founded and runs it, what it does, its equipment
or fleet, its clients and its contact details. It is usually a Word or PDF
document of a few pages, written in marketing prose with headings such as
"About us", "Company History" and "Our Services".

For B-BBEE it scores almost nothing directly. It is context:
- it shows what the business does, which points to the sector code that
  applies;
- it names the founder and owners, which helps tie together the people on the
  ownership documents;
- it can explain why the business says it has traded longer than its CIPC
  registration (a sole proprietorship or partnership before incorporation).

It is NOT a CIPC record, a share register or certificate, a representation
letter, a B-BBEE certificate or affidavit, or a set of financial statements. A
profile that mentions "SED", "skills" or "B-BBEE" in passing is still a
profile.

## Where values sit

- The registered and trading names are on the cover page and in the "About
  us" or "Company History" section.
- The founding date and the owners' names are usually in the history
  paragraph.
- Services, scope of work and fleet or equipment lists describe the core
  business.
- An "Administration" or "Professional services" section may name the
  accountants, auditors, bankers and insurers.

## Traps

- A claim is not evidence. "100% black-owned" in a profile is marketing. Copy
  it into `ownership_statement`; never turn it into an ownership percentage, a
  level or a race.
- Do not hunt for scorecard figures. A profile rarely states revenue, payroll
  or procurement, and any figure it does give is unverified.
- "Trading since 1995" can be true for a company registered years later.
  Copy both as written; the difference is not an error.
- The profile may call the founder by a first name or nickname. Copy it as
  written.
- Accountants are not auditors. Put an accounting firm in
  `accounting_officer_name`, and only a firm the profile calls auditors in
  `auditor_name`.
- Describe what the business does in its own words; choosing a sector code is
  the reviewer's job.
- Never return phone numbers, e-mail addresses or bank details.

## Worked example

Invented, a three-page Word profile:

```
Page 1  MBEKI PLANT HIRE (PTY) LTD  t/a MPH Civils
        Company History: "Founded in March 2004 by Sipho Dube with a single excavator,
        MPH Civils is a proudly 100% black-owned civil works contractor."
Page 2  Our Services: "Bulk earthworks, trenching, road construction and plant hire."
Page 3  Administration: "Accountants: Dlamini and Partners Inc."
```

```json
{"entity_name": "MBEKI PLANT HIRE (PTY) LTD", "trading_name": "MPH Civils", "registration_number": null,
 "trading_since": "March 2004", "directors_or_members": "Sipho Dube",
 "core_business": "Bulk earthworks, trenching, road construction and plant hire.", "industry_sector": null,
 "ownership_statement": "a proudly 100% black-owned civil works contractor",
 "accounting_officer_name": "Dlamini and Partners Inc.", "auditor_name": null, "employee_count": null,
 "exceptions": ["The ownership claim is the profile's own statement, not ownership evidence."]}
```
