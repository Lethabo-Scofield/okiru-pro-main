---
id: environmental_policy
appliesTo:
  - iso_environmental__environmental_policy
element: ISO_ENVIRONMENTAL
version: 1
hard: false
classify:
  is: "An environmental (or climate, or sustainability) policy statement the business has adopted: its commitments on emissions, energy, water, waste, biodiversity, legal compliance and continual improvement, with its revision, approval and signature."
  isNot:
    - "another group policy (CSI, employment equity, ethics, procurement), read by the group policy skill"
    - "an ISO 14001 certificate or audit report"
    - "an environmental aspects register or legal register"
    - "a sustainability or integrated report"
  filenameHints: ["environmental policy", "climate policy", "sheq policy", "sustainability policy"]
  contentSignals: ["Environmental Policy", "commit", "pollution", "continual improvement", "compliance obligations", "emissions", "energy", "water", "waste", "biodiversity", "Signed", "Revision"]
fields:
  - name: policy_title
    type: text
    required: true
    labels: ["Policy title", "Policy name"]
    description: "The policy's title as printed on its cover or heading."
  - name: policy_version
    type: text
    labels: ["Revision", "Version", "Rev"]
    description: "The revision or version as printed (\"Rev 3\", \"Version 2.1\")."
  - name: board_approval_date
    type: date
    labels: ["Approved on", "Date approved", "Revision date"]
    description: "The date the policy was approved (or, when only one is printed, revised), as printed."
  - name: policy_effective_date
    type: date
    labels: ["Effective date", "Effective from"]
    description: "The date the policy takes effect, when printed separately."
  - name: signatory_name
    type: text
    labels: ["Signed", "Signature"]
    description: "The person who SIGNED the policy, from its signature block. An author, owner or \"prepared by\" name is not a signatory."
  - name: signatory_role
    type: text
    labels: ["Designation", "Title of signatory"]
    description: "The signatory's role as printed beside the signature (CEO, Managing Director)."
  - name: policy_approved_by
    type: text
    labels: ["Approved by", "Reviewed and approved by"]
    description: "The body or person the document says approved it (board, executive committee, a committee), as printed."
  - name: review_frequency
    type: text
    labels: ["Review frequency", "Reviewed every", "Next review"]
    description: "How often the policy says it is reviewed, as written (\"annually\", \"at least every second year\")."
  - name: net_zero_commitment_present
    type: bool
    labels: []
    description: "True when the policy states a net-zero commitment; false when it plainly has none; null when unclear."
  - name: ghg_reduction_commitment_present
    type: bool
    labels: []
    description: "True when the policy commits to reducing greenhouse gas emissions."
  - name: energy_commitment_present
    type: bool
    labels: []
    description: "True when the policy commits on energy use or efficiency."
  - name: water_commitment_present
    type: bool
    labels: []
    description: "True when the policy commits on water use."
  - name: waste_commitment_present
    type: bool
    labels: []
    description: "True when the policy commits on waste reduction or recycling."
  - name: biodiversity_commitment_present
    type: bool
    labels: []
    description: "True when the policy commits on biodiversity or land."
  - name: legal_compliance_commitment_present
    type: bool
    labels: []
    description: "True when the policy commits to complying with environmental law and other obligations."
  - name: continual_improvement_commitment_present
    type: bool
    labels: []
    description: "True when the policy commits to continual improvement of environmental performance."
  - name: commitment_quotes
    type: text
    labels: []
    description: "The policy's commitment sentences, quoted briefly, separated by semicolons."
newFields: [policy_approved_by]
---
## What it is / is not

An environmental policy is the business's short statement of intent: what it
commits to on emissions, energy, water, waste, pollution, biodiversity, legal
compliance and continual improvement. ISO 14001 requires one, approved by top
management, dated and communicated. For an ESG report the evidence is the
commitments it states and its approval and revision, not any figure.

It is NOT another group policy, a certificate or audit report, an aspects or
legal register, or a sustainability report.

## Where values sit

- Cover or header: title, document number, revision, dates (issued, revised,
  effective), approval.
- Body: the commitments, often as a bulleted list.
- Foot: the signature block with name, role and date; a review clause.

## Traps

- A commitment is what the policy says it WILL do, not a target. Never supply
  a number, a year or a percentage the policy does not print, and never turn a
  general commitment ("reduce our footprint") into net zero.
- The signatory comes from the signature block only.
- Copy the revision date and approval date as printed. When a policy has
  passed its own review date, copy the dates and note it; never decide that it
  is invalid.
- Header text on every page (document number, page x of y) is not a title.

## Worked example

Invented, a one-page policy:

```
EXAMPLE LOGISTICS - ENVIRONMENTAL POLICY      Doc EX-ENV-01  Rev 4  Revised 12/02/2026
We commit to: comply with environmental legislation; reduce fuel and electricity use per load;
recycle packaging; continually improve our environmental management system.
Approved by the Board. Reviewed annually.
Signed: J. Example, Chief Executive Officer, 12/02/2026
```

```json
{"policy_title": "ENVIRONMENTAL POLICY", "policy_version": "Rev 4", "board_approval_date": "12/02/2026",
 "policy_effective_date": null, "signatory_name": "J. Example", "signatory_role": "Chief Executive Officer",
 "policy_approved_by": "the Board", "review_frequency": "annually", "net_zero_commitment_present": false,
 "ghg_reduction_commitment_present": null, "energy_commitment_present": true, "water_commitment_present": null,
 "waste_commitment_present": true, "biodiversity_commitment_present": null, "legal_compliance_commitment_present": true,
 "continual_improvement_commitment_present": true,
 "commitment_quotes": "comply with environmental legislation; reduce fuel and electricity use per load; recycle packaging; continually improve our environmental management system",
 "exceptions": ["Fuel and electricity reduction is per load; no emissions commitment is stated as such."]}
```
