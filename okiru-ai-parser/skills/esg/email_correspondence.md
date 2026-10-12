---
id: email_correspondence
newType:
  name: "E-mail correspondence"
  aliases: ["E-mail thread", "Saved e-mail", "Email message"]
element: OTHER
version: 1
hard: false
classify:
  is: "A saved e-mail or e-mail thread (.eml, .msg, or an e-mail printed to PDF): messages with From, To, Date and Subject lines, often asking colleagues for data, answering what was asked, or sending documents along with the message."
  isNot:
    - "a letter on a letterhead (read for what the letter is)"
    - "a file sent with the e-mail (a bill, a certificate or an audit report sent along is its own document)"
    - "a meeting minute or a memo"
  filenameHints: [".eml", ".msg", "email", "e-mail", "fw:", "re:"]
  contentSignals: ["From:", "To:", "Cc:", "Subject:", "Sent:", "Date:", "Attachments:", "Regards", "Kind regards", "wrote:"]
rowsField: email_item_rows
fields:
  - name: email_subject
    type: text
    required: true
    labels: ["Subject"]
    description: "The thread's subject line, as printed (with its RE:/FW: prefix)."
  - name: email_message_dates
    type: text
    labels: []
    description: "The date of EVERY message in the thread, oldest first, each as yyyy-mm-dd, separated by '; '. Count a message that is only quoted inside a reply (its own From/Date block) too."
  - name: email_requested_period
    type: text
    labels: ["Financial period", "Data period"]
    description: "The period the e-mail asks data for, copied as printed (\"1 April 2025 - end January 2026\"). Null when no period is asked for."
  - name: email_response_deadline
    type: date
    labels: ["Deadline", "Due date"]
    description: "The date replies or data are due, as yyyy-mm-dd. A date printed without a year (\"Friday 13/03\") takes the year of the message that sets it. Null when none is set."
  - name: email_attachments
    type: text
    labels: ["Attachments", "Attached"]
    description: "Every file the messages say they carry, as printed (file names or titles), separated by '; '. A signature picture is not one of them."
  - name: sender_certifications
    type: text
    labels: []
    description: "Certifications a sender's signature or footer states for the company (\"ISO 27001:2022\", \"ISO 50001:2018\"), each as printed, separated by '; '. A claim in a signature is not a certificate: it is copied, never treated as evidence."
  - name: sender_bbbee_level
    type: text
    labels: []
    description: "A B-BBEE level a sender's signature states, as \"Level N\" (\"Level 4\"). A claim, not a certificate."
  - name: email_item
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "One thing the thread asks for or states: a data item someone must send (\"Site electricity bills, last two years\"), or a fact a message states (\"Sites loaded\", \"Trucks in the depot\"), as printed, shortened to its subject."
  - name: email_item_kind
    type: text
    rowLevel: true
    labels: []
    description: "ask (something asked for) or fact (something a message states as so)."
  - name: email_item_value
    type: text
    rowLevel: true
    labels: []
    description: "For a fact: the figure or answer itself, exactly as printed and nothing else (\"12 of 40\", \"35\", \"9\", \"not available\"). For an ask: a reply the thread gives to it, or null."
  - name: email_item_owner
    type: text
    rowLevel: true
    labels: []
    description: "The person the item is assigned to or who stated it, as the e-mail names them (often a first name after the item: \"... Musa\"). Null when none is named."
  - name: email_item_section
    type: text
    rowLevel: true
    labels: []
    description: "The heading or priority the item sits under (\"Priority 2 — Energy\"), as printed, or null."
newFields: [email_subject, email_message_dates, email_requested_period, email_response_deadline, email_attachments, sender_certifications, sender_bbbee_level, email_item_rows, email_item, email_item_kind, email_item_value, email_item_owner, email_item_section]
---
## What it is / is not

A saved e-mail thread: one or more messages, each with its From, To, Date and
Subject block, the newest usually first and older ones quoted below it. In ESG
work most threads ask colleagues for data (who must send which figures, for
which period, by when) and carry their replies (a figure stated in the body, a
document sent along, a reason something cannot be provided).

It is NOT a file sent with it: a bill, certificate or audit report sent along
with the e-mail is a document of its own and is read as one. It is NOT a
letter on a letterhead, minutes or a memo. A statement in an e-mail ("we are
ISO 14001 certified", "Level 4 B-BBEE") is a claim made in correspondence,
never the certificate itself.

## Where values sit

- Each message's header block: From (name, address), Date, To, Cc, Subject,
  Attachments.
- The body: what is asked for (a list of items, often grouped under
  priorities, each with the owner's first name after it), the period asked
  for, the deadline, and replies stating figures or status.
- The signature: name, job title, company claims (certifications, B-BBEE
  level), phone numbers and addresses. Phone numbers, e-mail addresses and
  postal addresses are never facts to return.

## Traps

- One row per item asked for or fact stated. Copy the item's own words; put
  the owner (the person named after it) in email_item_owner, not in the item.
- A figure stated in a message ("currently 12 of 40 loaded", "only has 35
  trucks") is a fact row whose value is the figure alone ("12 of 40", "35"),
  never the whole sentence.
- A date without a year takes the year of the message it is in. Message dates
  are each message's own Date line, quoted messages counted.
- A signature picture or logo is not a file sent with the message.
- A claim in a signature or body is copied as a claim. It never proves a
  certification, a level or a figure: the documents do.
- Never return phone numbers, e-mail addresses, ID numbers or bank details.

## Worked example

Invented, a two-message thread:

```
Message 1
From: Lindi Example <lindi@example.com>
Date: Tue, 3 Mar 2026 09:10:00 +0000
Subject: RE: Example Logistics | ESG data
Attachments: Water policy (90 KB)
Hi Pat, the water policy is attached. We currently have 12 of 40 sites loaded.
Lindi Example | Sustainability Officer | Level 4 B-BBEE | An ISO 27001:2022 certified company

Message 2 (quoted in the reply above)
From: Pat Example <pat@example.com>
Date: Monday, 2 March 2026 14:00
Subject: Example Logistics | ESG data
Please send the following for the period 1 April 2025 - 31 January 2026 by Friday 13/03:
Priority 2 — Energy
• Site electricity bills, last two years Lindi
• Generator diesel litres Musa
```

```json
{"email_subject": "RE: Example Logistics | ESG data",
 "email_message_dates": "2026-03-02; 2026-03-03",
 "email_requested_period": "1 April 2025 - 31 January 2026",
 "email_response_deadline": "2026-03-13",
 "email_attachments": "Water policy",
 "sender_certifications": "ISO 27001:2022", "sender_bbbee_level": "Level 4",
 "email_item_rows": [
   {"email_item": "Site electricity bills, last two years", "email_item_kind": "ask", "email_item_value": null, "email_item_owner": "Lindi", "email_item_section": "Priority 2 — Energy"},
   {"email_item": "Generator diesel litres", "email_item_kind": "ask", "email_item_value": null, "email_item_owner": "Musa", "email_item_section": "Priority 2 — Energy"},
   {"email_item": "Sites loaded", "email_item_kind": "fact", "email_item_value": "12 of 40", "email_item_owner": "Lindi", "email_item_section": null}
 ],
 "exceptions": ["The certification and B-BBEE level are claims in a signature, not certificates."]}
```
