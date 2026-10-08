---
id: share_register
appliesTo:
  - ownership__securities_share_register
element: OWNERSHIP
version: 2
hard: true
classify:
  is: "The company's securities (share) register under section 50 of the Companies Act: a table with one line per holding or transfer, naming each registered shareholder, their certificate number, share class and number of shares."
  isNot:
    - "a share certificate (one holder, one certificate, 'This is to certify that ...')"
    - "a beneficial interest / beneficial ownership register (natural persons behind the registered holders)"
    - "an ownership organogram (a diagram of holding structures)"
    - "a Memorandum of Incorporation (the constitution: clauses and share classes, no holders)"
    - "a CIPC disclosure certificate (lists directors or CC members, not shareholdings)"
  filenameHints: ["share register", "securities register", "register of members", "shareholders register", "members register"]
  contentSignals: ["Securities Register", "Share Register", "Register of Shareholders", "Register of Members", "Certificate No", "No. of Shares", "Number of shares", "Class of shares", "Date of issue", "Transfer"]
rowsField: holdings_table
fields:
  - name: entity_name
    type: text
    required: true
    labels: ["Company", "Name of company", "Company name"]
    description: "The company whose register this is, from the header block."
  - name: registration_number
    type: regno
    labels: ["Registration number", "Reg No"]
    description: "The company's CIPC registration number from the header."
  - name: incorporation_date
    type: date
    labels: ["Registration date", "Date of incorporation", "Incorporated"]
    description: "The company's registration / incorporation date, when the header prints it."
  - name: entity_type
    type: text
    labels: ["Company type", "(Pty) Ltd", "CC", "Ltd", "NPC"]
    description: "The entity type as printed or as its name states it ('(Pty) Ltd', 'CC')."
  - name: total_shares_in_issue
    type: count
    labels: ["Total issued", "Total shares", "Issued shares"]
    description: "The total of shares currently in issue, when the register states it."
  - name: authorised_shares
    type: count
    labels: ["Authorised", "Authorised share capital"]
    description: "Authorised shares, when printed. Not the issued total."
  - name: shareholder_name
    type: text
    required: true
    rowLevel: true
    labels: ["Name and surname", "Shareholder", "Name of member", "Registered holder"]
    description: "The registered holder on that line: a person, a trust or a company."
  - name: id_number
    type: idno
    rowLevel: true
    labels: ["ID number", "Identity number", "ID / Registration no"]
    description: "The holder's SA ID number (or the registration number of a juristic holder)."
  - name: certificate_number
    type: text
    rowLevel: true
    labels: ["Certificate No", "Cert. No", "Share certificate number"]
    description: "The share certificate number for that holding."
  - name: share_class
    type: text
    rowLevel: true
    labels: ["Class", "Class of shares", "Type of shares"]
    description: "Share class ('Ordinary', 'Preference', 'A ordinary')."
  - name: number_of_shares
    type: count
    required: true
    rowLevel: true
    labels: ["No. of shares", "Number of shares", "Shares held", "Balance"]
    description: "Shares held by that holder after this entry. For a transfer line, the balance left, not the number transferred."
  - name: percentage
    type: percent
    rowLevel: true
    labels: ["Percentage", "% held", "Shareholding"]
    description: "Percentage of issued shares held, only when the register prints it."
  - name: issue_date
    type: date
    rowLevel: true
    labels: ["Date of issue", "Date acquired", "Date registered"]
    description: "The date the shares were issued to or registered in the name of that holder."
  - name: pledge_or_encumbrance_noted
    type: bool
    rowLevel: true
    labels: ["Pledged", "Ceded", "Encumbrance", "Remarks"]
    description: "True only when the line records a pledge, cession or encumbrance; false only when the register has such a column and it is blank or 'None'."
newFields: [authorised_shares]
---
## What it is / is not

A securities register (also "share register", "register of members" or
"register of shareholders") is the company's own statutory record of who holds
its shares. Under the Companies Act every company keeps one; it is the
auditor's primary source for ownership, and each holding should trace to a
share certificate. Small companies often keep it on a printed form or a
one-page table that is signed and scanned — frequently in landscape, so the
scan is rotated.

It is not a share certificate (one holder, prose "This is to certify that"),
not a beneficial interest register (who ultimately owns the holders), and not
an organogram. A close corporation has MEMBERS with a percentage members'
interest, not shareholders; a CC's "register of members" is read the same way,
with the percentage as the holding.

## Where values sit

- Header block: company name, registration number, sometimes registration
  date and type, and "as at" date.
- Table: one row per holding or transfer entry. Common columns: name and
  surname, ID / registration number, address, certificate number, date of
  issue, number of shares, class, consideration paid, date and certificate of
  transfer, transferee, balance.
- The heading row is often two physical lines ("NAME" / "AND SURNAME",
  "NO. OF" / "SHARES"). The first DATA row starts below both.
- Totals: a final "TOTAL" line or an issued-capital note at the foot.

## Traps

- A wrapped heading is not a shareholder. "AND SURNAME", "NO. OF SHARES" and
  any `</th>`-style markup are column headings; the name is in the next row.
- Transfers: a holder who sold shares appears on a line with the transfer and
  a nil or reduced balance. The CURRENT holding is the balance, and a holder
  whose balance is nil is not a shareholder at the measurement date (report the
  transfer in exceptions).
- Only state `percentage` when the register prints it. Do not divide shares by
  the total yourself.
- Authorised shares (e.g. 3 600) are not issued shares (e.g. 100).
- The register states NO race and NO gender. Never fill them, and never infer
  black ownership from a name.
- ID numbers are often spaced ("800101 5009 087"); copy as printed.
- A trust or company can be the registered holder. Copy its name as the
  shareholder; the people behind it are on the beneficial interest register.
- One holder may appear on several lines (separate certificates). Return each
  line; do not merge them.

## Worked example

Invented register, scanned and rotated:

```
SECURITIES REGISTER — BAOBAB ENGINEERING (PTY) LTD   Reg No: 2015 / 123456 / 07   Registered 02/03/2015
NAME AND      | ID NUMBER        | CERT | DATE OF    | CLASS    | NO. OF | %
SURNAME       |                  | NO.  | ISSUE      |          | SHARES |
Thabo Mokoena | 800101 5009 087  | BE01 | 02/03/2015 | Ordinary | 60     | 60%
Khumalo Family| IT 001234/2014   | BE02 | 02/03/2015 | Ordinary | 40     | 40%
Trust         |                  |      |            |          |        |
TOTAL                                                           | 100    | 100%
```

```json
{"entity_name": "BAOBAB ENGINEERING (PTY) LTD", "registration_number": "2015 / 123456 / 07",
 "incorporation_date": "02/03/2015", "entity_type": "(Pty) Ltd", "total_shares_in_issue": 100,
 "authorised_shares": null,
 "holdings_table": [
   {"shareholder_name": "Thabo Mokoena", "id_number": "800101 5009 087", "certificate_number": "BE01", "share_class": "Ordinary", "number_of_shares": 60, "percentage": "60%", "issue_date": "02/03/2015", "pledge_or_encumbrance_noted": null},
   {"shareholder_name": "Khumalo Family Trust", "id_number": "IT 001234/2014", "certificate_number": "BE02", "share_class": "Ordinary", "number_of_shares": 40, "percentage": "40%", "issue_date": "02/03/2015", "pledge_or_encumbrance_noted": null}
 ],
 "exceptions": ["Register states no race or gender for holders.", "The second holder is a trust; its beneficial owners are on the beneficial interest register."]}
```
