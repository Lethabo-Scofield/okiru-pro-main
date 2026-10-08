---
id: risk_register
appliesTo:
  - risk_assurance__risk_register_including_climate
element: RISK_ASSURANCE
version: 1
hard: true
classify:
  is: "A register of the risks or issues a business has identified, one row per risk or factor: an enterprise risk register, a context register of internal and external factors (ISO clause 4.1), or a climate risk register, with ratings, owners and controls where it has them."
  isNot:
    - "an environmental aspects and impacts register (activities and environmental impacts)"
    - "a HIRA or safety risk assessment of tasks"
    - "an IFRS S1/S2 readiness assessment"
    - "a policy that mentions risk"
  filenameHints: ["risk register", "internal and external factors", "context register", "erm register", "climate risk register"]
  contentSignals: ["Risk", "Factor", "Internal", "External", "Likelihood", "Impact", "Rating", "High", "Medium", "Low", "Owner", "Mitigation", "Controls"]
rowsField: risk_register_rows
fields:
  - name: register_version
    type: text
    labels: ["Revision", "Version", "Document number"]
    description: "The register's document number and revision as printed."
  - name: register_last_review_date
    type: date
    required: true
    labels: ["Revised", "Last reviewed", "Revision date", "Date reviewed"]
    description: "The register's revision or last review date, as printed in its header or footer."
  - name: review_frequency
    type: text
    labels: ["Review frequency", "Reviewed every"]
    description: "How often the register says it is reviewed, as written."
  - name: total_risks_count
    type: count
    labels: ["Total risks", "Number of risks"]
    description: "A printed total only. Never count the rows."
  - name: material_risks_count
    type: count
    labels: ["Material risks", "High risks", "Top risks"]
    description: "A printed count of material or high risks only. Never count the rows."
  - name: climate_risk_in_register
    type: text
    labels: []
    description: "Yes when any row names climate change, extreme weather, carbon or emissions; No when the register plainly has none; Partial only when climate is mentioned without being a risk row of its own."
  - name: physical_climate_risks_identified
    type: text
    labels: []
    description: "Yes when a row names a PHYSICAL climate risk (extreme weather, heat, flooding, drought); No when none; Partial only when climate is mentioned without any physical effect named."
  - name: transition_climate_risks_identified
    type: text
    labels: []
    description: "Yes when a row names a TRANSITION risk (pressure or regulation to cut carbon, carbon tax, customer or investor expectations on emissions, low-carbon technology shifts); No when none; Partial only when climate is mentioned without any transition effect named."
  - name: risk_id
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The row's number or ID as printed; null when the row is unnumbered."
  - name: risk_description
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The risk or factor as the register words it, briefly."
  - name: risk_category
    type: text
    rowLevel: true
    labels: []
    description: "The register's grouping for the row as printed (internal or external; political, economic, environmental; strategic, operational)."
  - name: inherent_likelihood
    type: text
    rowLevel: true
    labels: []
    description: "A likelihood the row prints in its own column only."
  - name: inherent_impact
    type: text
    rowLevel: true
    labels: []
    description: "An impact the row prints in its own column only."
  - name: residual_risk_rating
    type: text
    rowLevel: true
    labels: []
    description: "A rating the register labels residual (after controls) only."
  - name: risk_rating_as_printed
    type: text
    rowLevel: true
    labels: []
    description: "The row's rating or ranking exactly as printed when the register gives one rating (H, M, L, 1-25, a colour word) without saying whether it is inherent or residual."
  - name: control_status
    type: text
    rowLevel: true
    labels: []
    description: "The status of the row's controls, as printed."
  - name: risk_owner
    type: text
    rowLevel: true
    labels: []
    description: "The owner the row names in an owner column only."
  - name: mitigation_action
    type: text
    rowLevel: true
    labels: []
    description: "The controls or actions the row lists, briefly."
newFields: [risk_rating_as_printed]
---
## What it is / is not

A risk register lists what could go wrong (or, in an ISO context register,
the internal and external factors that affect the business) with a rating and,
in a mature register, likelihood and impact scores, owners, controls and a
residual rating. For an ESG report two questions matter: is climate in the
register, and is the register maintained (revised, reviewed, owned).

It is NOT an aspects and impacts register, a task-level safety risk
assessment, an IFRS readiness assessment or a policy.

## Where values sit

- Header or footer: document number, revision, revision date, scope.
- One row per risk or factor: number, description, category, rating, controls.
  Landscape tables often wrap a row over several lines or pages.
- Climate usually appears as one factor (adverse weather, climate change)
  whose text names its effects, and sometimes as water or energy factors.

## Traps

- One printed rating is one rating. When the register gives a single H/M/L
  ranking, copy it to `risk_rating_as_printed`; never split it into
  likelihood and impact, and never call it residual.
- No owner column, no owner. A department named in the header is not each
  row's owner.
- Read the climate questions from what the rows SAY. A factor that names heat,
  extreme weather or drought is a physical risk; one that names pressure to
  reduce carbon emissions or customers' sustainability demands is a
  transition risk. When a row names both, both are Yes. "Partial" is only for
  a register that mentions climate without saying what the risk is.
- A PDF text layer can interleave a landscape table's cells (the factor, its
  rating and its controls mixed together). Read the row from the page; when the
  rating cannot be tied to its row, leave it null and say so.
- Never count rows or ratings; copy printed totals only.
- Gaps in the numbering and unnumbered rows are copied as printed.

## Worked example

Invented, two rows of a context register:

```
EX-R-004 Internal and External Factors   Rev 02   Revised 14/01/2026
No  Factor                                                      Type      Ranking  Controls
6   Load-shedding / power supply interruptions                  External  H        Generators at depots
11  Severe weather and climate change: floods, heat; pressure   External  M        Business continuity plan;
    from customers to cut emissions                                                 fleet renewal
```

```json
{"register_version": "EX-R-004 Rev 02", "register_last_review_date": "14/01/2026", "review_frequency": null,
 "total_risks_count": null, "material_risks_count": null, "climate_risk_in_register": "Yes",
 "physical_climate_risks_identified": "Yes", "transition_climate_risks_identified": "Yes",
 "risk_register_rows": [
   {"risk_id": "6", "risk_description": "Load-shedding / power supply interruptions", "risk_category": "External", "risk_rating_as_printed": "H", "mitigation_action": "Generators at depots"},
   {"risk_id": "11", "risk_description": "Severe weather and climate change: floods, heat; pressure from customers to cut emissions", "risk_category": "External", "risk_rating_as_printed": "M", "mitigation_action": "Business continuity plan; fleet renewal"}
 ],
 "exceptions": ["One ranking per factor; no likelihood, impact or owner columns."]}
```
