---
id: hs_training_register
appliesTo:
  - health_safety__training_and_induction_register
element: HEALTH_SAFETY
version: 1
hard: false
classify:
  is: "A health and safety training, induction and appointments record: a training matrix of employees against required courses (inductions, first aid, fire fighting, forklift), an induction or toolbox-talk register, or a list of OHS Act appointments."
  isNot:
    - "a register of training delivered with costs per learner (read by the training register skill)"
    - "an incident register"
    - "a WSP / ATR SETA submission"
    - "an ISO 45001 certificate"
  filenameHints: ["training matrix", "induction register", "toolbox talk", "she appointments", "ohs appointments"]
  contentSignals: ["Induction", "Training matrix", "First aid", "Fire fighting", "Toolbox", "Appointment", "Section 16(2)", "Safety representative", "Employee", "Department", "Legend", "X"]
rowsField: hs_training_rows
fields:
  - name: site_name
    type: text
    required: true
    labels: ["Depot", "Distribution centre", "Branch"]
    description: "The site or distribution centre the record is for, as printed. A department or sheet name is not a site; a placeholder (\"[Site name]\") is null."
  - name: reporting_period_start
    type: date
    labels: ["Period from"]
    description: "First day of the period the record covers, when printed."
  - name: reporting_period_end
    type: date
    labels: ["Period to"]
    description: "Last day of the period, when printed."
  - name: register_version
    type: text
    labels: ["Document number", "Revision"]
    description: "The record's document number and revision as printed."
  - name: register_last_review_date
    type: date
    labels: ["Revised", "Revision date"]
    description: "The record's revision date as printed."
  - name: employees_inducted_count
    type: count
    labels: ["Employees inducted", "Total inducted"]
    description: "A printed count only. Never counted by you."
  - name: employees_total_count
    type: count
    labels: ["Total employees", "Headcount"]
    description: "A printed count only. Never counted by you."
  - name: hs_induction_percent
    type: percent
    labels: ["Induction %", "Inducted %"]
    description: "A printed induction percentage only. Never computed from ticks."
  - name: hs_training_hours
    type: number
    labels: ["Training hours", "Hours of training"]
    description: "Printed health and safety training hours only."
  - name: first_aiders_certified_count
    type: count
    labels: ["First aiders"]
    description: "A printed count only."
  - name: safety_representatives_appointed_count
    type: count
    labels: ["Safety representatives"]
    description: "A printed count only."
  - name: trainee_name
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The employee on the row, as printed."
  - name: trainee_department
    type: text
    rowLevel: true
    labels: []
    description: "The department or sheet the row sits on, as printed."
  - name: course_name
    type: text
    rowLevel: true
    labels: []
    description: "The course or appointment the cell is for (the column heading), as printed."
  - name: course_entry_as_printed
    type: text
    rowLevel: true
    labels: []
    description: "The cell exactly as printed (\"X\", \"X (12/03/2026)\", a date, \"Due\"). Its meaning comes from the legend; never decide planned or completed yourself."
newFields: [hs_training_rows, trainee_name, trainee_department, course_name, course_entry_as_printed]
---
## What it is / is not

A training matrix crosses employees (rows, often one sheet per department)
with required courses (columns) and marks each cell with an X, a date, or both,
explained by a legend. Induction and toolbox-talk registers list attendance;
appointment lists name the people appointed under the OHS Act (first aiders,
safety representatives, fire marshals). For an ESG report they evidence
health and safety training coverage.

It is NOT a training register with costs, an incident register, a SETA
submission or an ISO 45001 certificate.

## Where values sit

- Header or footer: document number, revision date, site.
- Per sheet: the department; employees down the side; courses across the top.
- A legend explaining the marks (X = completed; X(date) = planned, or the
  reverse; blank = not required).

## Traps

- Never count ticks or compute coverage. Induction percentages and counts are
  copied only when printed; the code counts the cells.
- The legend decides what a mark means. When the legend lets one mark mean
  both planned and completed, copy the cell as printed and say so; never
  choose.
- A department or sheet name is not the site, and a template placeholder
  ("[Site name]") is not a site.
- Dates in cells may be spreadsheet serials or typo'd ("2026/05/11" written as
  "202605/11"); copy them as printed and flag impossible ones.
- Entries dated after the record's revision date are copied and flagged.
- A blank cell is not "not trained" unless the legend says so.

## Worked example

Invented, one department sheet of a matrix:

```
EX-T-030-01 Training Matrix   Revised 05/05/2026   Site: Depot F   Department: Dispatch
Legend: X = completed   X (date) = booked
Employee      Induction      First aid      Forklift
S. Khumalo    X              X (14/06/2026)  X
J. Sample      X
```

```json
{"site_name": "Depot F", "reporting_period_start": null, "reporting_period_end": null,
 "register_version": "EX-T-030-01", "register_last_review_date": "05/05/2026", "employees_inducted_count": null,
 "employees_total_count": null, "hs_induction_percent": null, "hs_training_hours": null,
 "first_aiders_certified_count": null, "safety_representatives_appointed_count": null,
 "hs_training_rows": [
   {"trainee_name": "S. Khumalo", "trainee_department": "Dispatch", "course_name": "Induction", "course_entry_as_printed": "X"},
   {"trainee_name": "S. Khumalo", "trainee_department": "Dispatch", "course_name": "First aid", "course_entry_as_printed": "X (14/06/2026)"},
   {"trainee_name": "S. Khumalo", "trainee_department": "Dispatch", "course_name": "Forklift", "course_entry_as_printed": "X"},
   {"trainee_name": "J. Sample", "trainee_department": "Dispatch", "course_name": "Induction", "course_entry_as_printed": "X"}
 ],
 "exceptions": ["X (date) means booked per the legend.", "No counts or percentages are printed."]}
```
