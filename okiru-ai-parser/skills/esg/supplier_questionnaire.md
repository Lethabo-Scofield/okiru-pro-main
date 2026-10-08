---
id: supplier_questionnaire
appliesTo:
  - supplier_esg__self_assessment_questionnaire
element: SUPPLIER_ESG
version: 1
hard: false
classify:
  is: "A supplier questionnaire or evaluation about a supplier: a supplier approval or self-assessment questionnaire (yes/no questions on certifications, environment, food safety, health and safety), or an external service provider evaluation scoring a supplier on criteria such as delivery and quality."
  isNot:
    - "a supplier code of conduct or its acknowledgement"
    - "a customer's sustainability survey answered BY the client about itself"
    - "a supplier's B-BBEE certificate"
    - "a procurement spend schedule"
  filenameHints: ["supplier questionnaire", "supplier approval", "supplier evaluation", "service provider evaluation", "vendor assessment", "saq"]
  contentSignals: ["Supplier name", "Questionnaire", "Evaluation", "Criteria", "Score", "Rating", "Yes", "No", "ISO 9001", "ISO 14001", "Completed by", "Approved supplier"]
fields:
  - name: saq_reference
    type: text
    labels: ["Form number", "Document number", "Questionnaire reference"]
    description: "The questionnaire's or form's own reference as printed (a document control number)."
  - name: form_revision_date
    type: date
    labels: ["Revised", "Revision date", "Date revised"]
    description: "The form's revision date from its header or footer, as printed. Not a completion date."
  - name: supplier_name
    type: text
    required: true
    labels: ["Supplier name", "Service provider", "Company name"]
    description: "The supplier the form was COMPLETED for, as written in the answer space. Null on a blank form."
  - name: supplier_registration_number
    type: regno
    labels: ["Registration number", "Company registration"]
    description: "The supplier's CIPC number as written in the answer space. Null on a blank form."
  - name: saq_completion_date
    type: date
    labels: ["Date completed", "Date of evaluation"]
    description: "The date the supplier (or evaluator) completed the form, as written. Null on a blank form."
  - name: saq_respondent_name
    type: text
    labels: ["Completed by", "Evaluated by"]
    description: "Who completed it, as written. Null on a blank form."
  - name: saq_respondent_role
    type: text
    labels: ["Designation", "Position"]
    description: "Their role, as written."
  - name: supplier_delivery_score
    type: number
    labels: ["Delivery"]
    description: "The score given for delivery, as written. Null when no score is filled in."
  - name: supplier_quality_score
    type: number
    labels: ["Quality"]
    description: "The score given for quality, as written."
  - name: supplier_health_safety_score
    type: number
    labels: ["Health and safety", "Safety"]
    description: "The score given for health and safety, as written."
  - name: supplier_environmental_score
    type: number
    labels: ["Environmental"]
    description: "The score given for environmental performance, as written."
  - name: supplier_food_safety_score
    type: number
    labels: ["Food safety"]
    description: "The score given for food safety, as written."
  - name: supplier_invoicing_score
    type: number
    labels: ["Invoicing", "Administration"]
    description: "The score given for invoicing or administration, as written."
  - name: supplier_backup_support_score
    type: number
    labels: ["Backup support", "After-sales service"]
    description: "The score given for backup or after-sales support, as written."
  - name: supplier_overall_rating
    type: text
    labels: ["Overall rating", "Total score", "Band"]
    description: "The overall score or band written on the form (\"A\", \"78%\"). A legend of bands is not a rating."
  - name: supplier_environmental_policy_in_place
    type: bool
    labels: []
    description: "The supplier's ANSWER (ticked or written) to whether it has an environmental policy. Null when unanswered."
  - name: supplier_iso14001_certified
    type: bool
    labels: []
    description: "The supplier's answer on ISO 14001 certification. Null when unanswered."
  - name: supplier_iso45001_certified
    type: bool
    labels: []
    description: "The supplier's answer on ISO 45001 certification. Null when unanswered."
  - name: supplier_bbbee_level
    type: level
    labels: ["B-BBEE level", "BEE status"]
    description: "The supplier's B-BBEE level as answered. Null when unanswered."
  - name: saq_responses
    type: text
    labels: []
    description: "The answered questions, briefly, as \"question: answer\" pairs separated by semicolons. Null on a blank form."
newFields: [form_revision_date]
---
## What it is / is not

A business vets its suppliers in two ways: it asks them to complete a
questionnaire (certifications held, policies in place, practices on the
environment, food safety and health and safety), and it evaluates them
against criteria (delivery, quality, safety, invoicing) on a score scale with
rating bands. Completed forms are evidence about one supplier.

It is NOT a supplier code of conduct, a customer survey the client answered
about itself, a supplier's B-BBEE certificate or a spend schedule.

## Where values sit

- Header and footer: the form's document number and revision date (document
  control), the business's logo.
- Answer spaces: supplier name, registration, contact, completed by, date.
- Question rows with Yes / No boxes or a score column; a legend of score
  meanings and rating bands; a total or band at the foot.

## Traps

- A blank template holds no answers. When the answer spaces are empty, the
  boxes unticked and the scores unfilled, every supplier and answer field is
  null. The questions, the criteria list, the score legend and the rating
  bands are the form, not answers; say "blank template" in exceptions.
- The form's own document number and revision date are not a completion date
  or a supplier reference. Copy them to `saq_reference` and
  `form_revision_date` only.
- A header or footer that a word processor keeps but never shows (an old
  first-page header) is not this form's revision; copy the header the form
  displays.
- The business's name in the logo is not the supplier.
- Scores are copied as written; never compute a total or a band from them.

## Worked example

Invented, a blank evaluation form:

```
EXAMPLE GROUP - EXTERNAL SERVICE PROVIDER EVALUATION   Form EX-F-012-01   Revised 02/02/2026
Service provider: __________   Date: ______   Evaluated by: ______
Criteria (score 1-5): Delivery [ ]  Quality [ ]  Health and safety [ ]  Environmental [ ]
Bands: A 21-25 approved; B 15-20 conditional; C below 15 not approved
```

```json
{"saq_reference": "EX-F-012-01", "form_revision_date": "02/02/2026", "supplier_name": null,
 "supplier_registration_number": null, "saq_completion_date": null, "saq_respondent_name": null,
 "saq_respondent_role": null, "supplier_delivery_score": null, "supplier_quality_score": null,
 "supplier_health_safety_score": null, "supplier_environmental_score": null, "supplier_food_safety_score": null,
 "supplier_invoicing_score": null, "supplier_backup_support_score": null, "supplier_overall_rating": null,
 "supplier_environmental_policy_in_place": null, "supplier_iso14001_certified": null, "supplier_iso45001_certified": null,
 "supplier_bbbee_level": null, "saq_responses": null,
 "exceptions": ["Blank template: no supplier, scores or answers are filled in."]}
```
