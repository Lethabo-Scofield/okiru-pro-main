---
id: policy_document
newType:
  name: "Group policy document"
  aliases: ["CSI and SED policy", "Socio-economic development policy", "Employment equity and diversity policy", "Workplace diversity policy", "Human rights policy", "Procurement policy"]
element: OTHER
version: 1
hard: false
classify:
  is: "A policy the business or its group has adopted on a social or governance topic (CSI and SED, employment equity and diversity, harassment, human rights, procurement): its title, revision, issue and approval dates, author and approver, scope, owners and review clause."
  isNot:
    - "an environmental or climate policy (read by the environmental policy skill)"
    - "a code of ethics or conduct with a whistleblowing line (read by the ethics code skill)"
    - "a supplier code of conduct (read by the supplier code skill)"
    - "a spend record, plan or report with actual figures (CSI spend records, an EE plan, an EEA2 report)"
  filenameHints: ["csi policy", "sed policy", "employment equity policy", "diversity policy", "human rights policy", "procurement policy"]
  contentSignals: ["Policy", "Purpose", "Scope", "Definitions", "Revision", "Date issued", "Approved by", "Author", "Policy owner", "Review", "Disclosure"]
rowsField: policy_rule_rows
fields:
  - name: policy_title
    type: text
    required: true
    labels: ["Policy title", "Policy name"]
    description: "The policy's title as printed on its cover or heading."
  - name: policy_version
    type: text
    labels: ["Revision", "Version", "Rev"]
    description: "The revision or version as printed."
  - name: policy_issue_date
    type: date
    labels: ["Date issued", "Issue date", "First issued"]
    description: "The date the policy was first issued, as printed."
  - name: board_approval_date
    type: date
    labels: ["Approved on", "Date approved", "Revision date", "Date revised"]
    description: "The date of the current revision's approval (or revision, when only that is printed), as printed."
  - name: policy_effective_date
    type: date
    labels: ["Effective date", "Effective from"]
    description: "The date the policy takes effect, when printed separately."
  - name: policy_author
    type: text
    scope: document
    labels: ["Author", "Prepared by", "Compiled by"]
    description: "Who wrote the policy, as printed."
  - name: policy_approved_by
    type: text
    labels: ["Approved by", "Reviewed and approved by"]
    description: "The body or person the document says approved it (board, executive committee, a committee), as printed."
  - name: signatory_name
    type: text
    labels: ["Signed", "Signature"]
    description: "The person who SIGNED the policy, from a signature block only. An author or owner is not a signatory."
  - name: policy_scope
    type: text
    scope: document
    labels: ["Scope", "Application", "Applies to"]
    description: "Who or what the policy applies to, quoted briefly as printed (the group, its subsidiaries, employees)."
  - name: policy_owners
    type: text
    list: true
    scope: document
    labels: ["Policy owner", "Responsible", "Custodian"]
    description: "The roles or people the policy names as owning or reviewing THE POLICY ITSELF, as printed, separated by semicolons: usually in its monitoring, review or ownership section (\"X and Y are responsible for reviewing this policy\"). Not the roles that carry out what the policy requires."
  - name: review_frequency
    type: text
    labels: ["Review frequency", "Reviewed every", "Next review"]
    description: "How often the policy says it is reviewed, as written."
  - name: policy_disclosure
    type: text
    scope: document
    labels: ["Disclosure", "Classification", "Confidentiality"]
    description: "The document's disclosure class as printed (Public, Internal, Confidential)."
  - name: policy_approach
    type: text
    scope: document
    labels: ["Approach", "Pillars", "Focus areas", "Programmes"]
    description: "The programmes, pillars or approaches the policy says it works through, each as printed, separated by '; '."
  - name: rule_subject
    type: text
    rowLevel: true
    labels: []
    description: "What the policy's rule is about, in its own words ('SED budget', 'CSI contributions', 'black beneficiaries')."
  - name: rule_figure
    type: text
    rowLevel: true
    labels: []
    description: "The rule's figure ALONE, exactly as printed with its unit ('2%', '0.5%', '60%', 'R50 000'). The words around it go in rule_basis, never here."
  - name: rule_basis
    type: text
    rowLevel: true
    labels: []
    description: "What the figure is measured against or bounded by, as printed ('of net profit after tax', 'maximum', 'at least', 'per year'), or null."
newFields: [policy_issue_date, policy_author, policy_approved_by, policy_scope, policy_owners, policy_disclosure, policy_approach, policy_rule_rows, rule_subject, rule_figure, rule_basis]
---
## What it is / is not

A group policy states rules and intentions on a topic: how much the group
means to spend on community investment and on whom, how it approaches
employment equity, how it handles harassment or procurement. For an ESG
report a policy is evidence that the topic is governed: its title, revision,
approval, owners, scope and review. It is never evidence of what was spent,
achieved or employed.

It is NOT an environmental policy, a code of ethics with a whistleblowing line,
a supplier code of conduct, or a record, plan or report with actual figures.

## Where values sit

- Cover page or document-control table: title, revision, date issued, date
  revised, author, approved by, disclosure class.
- Opening sections: purpose, scope, definitions.
- Closing section: responsibilities, policy owners, review clause, signature
  block (often absent from group policies).
- The policy's own quantified rules (a budget as a share of profit, a cap, a
  minimum share of beneficiaries) go in `policy_rule_rows`, one row per rule,
  figure as printed; the programmes or pillars it works through go in
  `policy_approach`.
- A document-control table's label and value cells can reach you interleaved
  on one line, the value split around its label ("Example Holdings Water /
  Policy Title Revision 4 / Stewardship Policy"). Rebuild
  the title from the value cells around "Policy Title"; a running page heading
  or a cover slogan is not the title.

## Traps

- A rule is not a result. "The group will spend up to a share of profit on
  CSI", "beneficiaries must be at least a stated share black" and "the plan
  sets numerical targets" are policy rules and definitions. They are never
  spend, never a beneficiary percentage and never an EE target: they go in
  `policy_rule_rows` only, as the policy prints them.
- No universal targets: never supply a target, budget or percentage the
  client has not stated as its own measured result.
- Approved by is not signed by. Many group policies are approved by a
  committee and signed by nobody; then `signatory_name` is null.
- Issue date, revision date and effective date are three dates; copy each to
  its own field and never pick one for another.
- A review clause ("at least every second year") is copied as written; whether
  the policy is overdue is decided in code from the dates.
- A group policy speaks for the group. When the client is one division, copy
  the policy as printed and note the group-level scope in exceptions.

## Worked example

Invented, a policy's document-control table:

```
EXAMPLE HOLDINGS - SOCIO-ECONOMIC DEVELOPMENT POLICY
Revision 3 | Date issued 01/04/2021 | Date revised 15/03/2025 | Author: Group Transformation Manager
Reviewed and approved by: Social and Ethics Committee | Disclosure: Public
Scope: all subsidiaries of the group.  Review: at least every two years.
4. BUDGET  The group sets aside 2% of net profit after tax for SED, of which at most 0.5% may go to CSI.
5. PROGRAMMES  Bursaries; Enterprise hubs; Staff volunteering.
```

```json
{"policy_title": "SOCIO-ECONOMIC DEVELOPMENT POLICY", "policy_version": "Revision 3", "policy_issue_date": "01/04/2021",
 "board_approval_date": "15/03/2025", "policy_effective_date": null, "policy_author": "Group Transformation Manager",
 "policy_approved_by": "Social and Ethics Committee", "signatory_name": null, "policy_scope": "all subsidiaries of the group",
 "policy_owners": null, "review_frequency": "at least every two years", "policy_disclosure": "Public",
 "policy_approach": "Bursaries; Enterprise hubs; Staff volunteering",
 "policy_rule_rows": [
   {"rule_subject": "SED budget", "rule_figure": "2%", "rule_basis": "of net profit after tax"},
   {"rule_subject": "CSI share of the budget", "rule_figure": "0.5%", "rule_basis": "at most"}
 ],
 "exceptions": ["No signature block.", "The policy sets a spending rule; it is a rule, not spend."]}
```
