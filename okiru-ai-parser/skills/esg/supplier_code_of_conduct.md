---
id: supplier_code_of_conduct
appliesTo:
  - supplier_esg__code_of_conduct_acknowledgement
element: SUPPLIER_ESG
version: 1
hard: false
classify:
  is: "A supplier code of conduct (the standards a business requires of its suppliers on labour, corruption, health and safety and the environment), a supplier's signed acknowledgement of it, or a schedule of which suppliers have acknowledged it."
  isNot:
    - "the business's own code of ethics for employees (read by the ethics code skill)"
    - "a supplier self-assessment questionnaire or evaluation (read by the supplier questionnaire skill)"
    - "a supplier's B-BBEE certificate"
    - "a contract or purchase order"
  filenameHints: ["supplier code", "vendor code of conduct", "supplier code of conduct", "code acknowledgement"]
  contentSignals: ["Supplier Code of Conduct", "Suppliers shall", "child labour", "forced labour", "bribery", "health and safety", "environment", "acknowledge", "signed", "Revision"]
fields:
  - name: code_version
    type: text
    required: true
    labels: ["Revision", "Version", "Rev"]
    description: "The code's revision or version as printed."
  - name: policy_title
    type: text
    labels: ["Code title"]
    description: "The code's title as printed."
  - name: board_approval_date
    type: date
    labels: ["Approved on", "Date approved", "Revision date", "Date revised"]
    description: "The code's approval or revision date, as printed."
  - name: policy_approved_by
    type: text
    labels: ["Approved by"]
    description: "The body or person the document says approved the code, as printed."
  - name: labour_rights_clause_present
    type: bool
    labels: []
    description: "True when the code has a clause on labour or human rights (child or forced labour, fair wages, working hours)."
  - name: anti_corruption_clause_present
    type: bool
    labels: []
    description: "True when the code has a clause on bribery, corruption or fraud."
  - name: environmental_clause_present
    type: bool
    labels: []
    description: "True when the code has a clause on environmental management."
  - name: health_safety_clause_present
    type: bool
    labels: []
    description: "True when the code has a clause on health and safety."
  - name: supplier_name
    type: text
    labels: ["Supplier", "Supplier name", "Company name"]
    description: "The SUPPLIER that acknowledged the code, from a completed acknowledgement only. The business that wrote the code is never the supplier; null for the code alone."
  - name: code_acknowledged
    type: bool
    labels: []
    description: "True only when a supplier's signed acknowledgement is present; null for the code alone."
  - name: acknowledgement_date
    type: date
    labels: ["Date signed", "Acknowledged on"]
    description: "The date of the supplier's acknowledgement, as printed."
  - name: signatory_name
    type: text
    labels: ["Signed", "Signature"]
    description: "Who signed the acknowledgement for the supplier, as printed."
  - name: signatory_role
    type: text
    labels: ["Designation", "Capacity"]
    description: "The signatory's role, as printed."
  - name: suppliers_acknowledged_count
    type: count
    labels: ["Suppliers acknowledged", "Signed acknowledgements"]
    description: "A printed count from an acknowledgement schedule only. Never counted by you."
  - name: suppliers_total_count
    type: count
    labels: ["Total suppliers"]
    description: "A printed total from the schedule only."
  - name: suppliers_acknowledged_percent
    type: percent
    labels: ["Acknowledged %"]
    description: "A printed percentage only. Never computed."
newFields: [policy_approved_by]
---
## What it is / is not

A supplier code of conduct sets the standards a business expects of its
suppliers: labour and human rights, anti-bribery and corruption, health and
safety, the environment, and often B-BBEE or local sourcing. The ESG evidence
is two things: which topics the code covers, and how many suppliers have
signed to say they will keep it.

It is NOT the business's own employee code of ethics, a supplier
questionnaire or evaluation, a B-BBEE certificate, or a contract.

## Where values sit

- Cover or document-control table: title, revision, dates, approver.
- Body: sections per topic; a section heading is enough to mark a clause
  present.
- An acknowledgement form (often the last page): supplier name, signatory,
  role, date, signature. A blank form is not an acknowledgement.
- A schedule (spreadsheet) of suppliers with acknowledged yes/no.

## Traps

- The code alone is not an acknowledgement. Without a completed, signed
  acknowledgement, `supplier_name`, `code_acknowledged`,
  `acknowledgement_date` and the signatory are null.
- The business that issues the code is never the supplier.
- Requirements in the code (a B-BBEE level suppliers must hold, a hotline
  number for suppliers) are rules, not a supplier's status.
- Counts and percentages only from a printed schedule; never counted.

## Worked example

Invented, a code with a blank acknowledgement page:

```
EXAMPLE GROUP SUPPLIER CODE OF CONDUCT  Revision 2  Date revised 10/10/2024  Approved by: Board
1 Labour practices ... 2 Anti-bribery and corruption ... 3 Health and safety ... 4 Environmental management ...
Acknowledgement: Supplier name ____________  Signed ____________  Date ________
```

```json
{"code_version": "Revision 2", "policy_title": "EXAMPLE GROUP SUPPLIER CODE OF CONDUCT", "board_approval_date": "10/10/2024",
 "policy_approved_by": "Board", "labour_rights_clause_present": true, "anti_corruption_clause_present": true,
 "environmental_clause_present": true, "health_safety_clause_present": true, "supplier_name": null,
 "code_acknowledged": null, "acknowledgement_date": null, "signatory_name": null, "signatory_role": null,
 "suppliers_acknowledged_count": null, "suppliers_total_count": null, "suppliers_acknowledged_percent": null,
 "exceptions": ["The acknowledgement page is blank: the code itself, not a supplier's acknowledgement."]}
```
