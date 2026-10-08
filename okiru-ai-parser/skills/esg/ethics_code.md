---
id: ethics_code
appliesTo:
  - ethics_compliance__ethics_whistleblower_policy_and_register
element: ETHICS_COMPLIANCE
version: 1
hard: false
classify:
  is: "A code of ethics or business conduct, a whistleblowing (protected disclosures) policy, or an ethics incident register: the standards employees must keep, the hotline to report breaches, and (in a register or report) the incidents reported and investigated."
  isNot:
    - "a supplier code of conduct (rules for suppliers; read by the supplier code skill)"
    - "a POPIA or privacy policy"
    - "a CSI, employment equity or other group policy"
    - "an anti-corruption training attendance record"
  filenameHints: ["code of ethics", "code of conduct", "business standards", "whistleblowing policy", "ethics hotline", "ethics register"]
  contentSignals: ["Code of Conduct", "Ethics", "Whistleblowing", "Hotline", "Anonymous", "Conflict of interest", "Gifts", "Bribery", "Corruption", "Fraud", "Protected Disclosures Act"]
fields:
  - name: policy_title
    type: text
    required: true
    labels: ["Policy title", "Code title"]
    description: "The code's or policy's title as printed on its cover or heading."
  - name: policy_version
    type: text
    labels: ["Revision", "Version", "Rev"]
    description: "The revision or version as printed."
  - name: policy_issue_date
    type: date
    labels: ["Date issued", "Issue date"]
    description: "The date first issued, as printed."
  - name: board_approval_date
    type: date
    labels: ["Approved on", "Date approved", "Revision date", "Date revised"]
    description: "The date of the current revision's approval (or revision, when only that is printed), as printed."
  - name: policy_effective_date
    type: date
    labels: ["Effective date", "Effective from"]
    description: "The effective date, when printed separately."
  - name: policy_approved_by
    type: text
    labels: ["Approved by", "Reviewed and approved by"]
    description: "The body or person the document says approved it, as printed."
  - name: signatory_name
    type: text
    labels: ["Signed", "Signature"]
    description: "The person who SIGNED the code, from a signature block only. An author, owner, contact person or executive quoted in a foreword is not a signatory; null when there is no signature block."
  - name: code_of_ethics_in_place
    type: bool
    required: true
    labels: []
    description: "True when the document is (or adopts) a code of ethics or conduct."
  - name: whistleblower_hotline_active
    type: bool
    labels: []
    description: "True when the document gives a hotline or reporting channel employees can use now."
  - name: whistleblower_hotline_provider
    type: text
    labels: ["Hotline operated by", "Hotline provider"]
    description: "The hotline's name or operator, as printed."
  - name: whistleblower_hotline_number
    type: text
    labels: ["Hotline number", "Toll-free number", "Call"]
    description: "The hotline's telephone number as printed (other channels such as SMS or e-mail go in exceptions)."
  - name: hotline_is_anonymous
    type: bool
    labels: []
    description: "True when the document says reports may be anonymous."
  - name: hotline_is_independent
    type: bool
    labels: []
    description: "True when the document says the hotline is run independently or externally."
  - name: ethics_incidents_reported_count
    type: count
    labels: ["Incidents reported", "Reports received"]
    description: "A printed count from an incident register or report only. A code or policy has none: null."
  - name: ethics_incidents_investigated_count
    type: count
    labels: ["Incidents investigated"]
    description: "A printed count only."
  - name: ethics_incidents_resolved_count
    type: count
    labels: ["Incidents resolved", "Cases closed"]
    description: "A printed count only."
  - name: conflict_of_interest_register_maintained
    type: bool
    labels: []
    description: "True only when the document says a conflict-of-interest register IS kept; a rule requiring declarations is not a register."
  - name: gift_register_maintained
    type: bool
    labels: []
    description: "True only when the document says a gifts register IS kept."
  - name: reporting_period_start
    type: date
    labels: ["Period from"]
    description: "For an incident register or report: first day of its period, as printed. Null for a code."
  - name: reporting_period_end
    type: date
    labels: ["Period to"]
    description: "For an incident register or report: last day of its period, as printed."
newFields: [policy_issue_date, policy_approved_by]
---
## What it is / is not

A code of ethics or business conduct tells employees how to behave (conflicts
of interest, gifts, bribery and corruption, fair dealing, health and safety,
the environment) and how to report a breach, usually through an independent,
anonymous hotline. A whistleblowing policy describes that channel in detail.
An ethics incident register or report counts the reports received and how
they were dealt with.

It is NOT a supplier code of conduct, a privacy policy, another group policy
or a training attendance record.

## Where values sit

- Cover or document-control table: title, revision, dates, approver,
  disclosure class.
- A "how to report" or "whistleblowing" section near the end: the hotline's
  name, number, SMS, e-mail, website, and whether it is anonymous and
  independent.
- Counts appear only in a register or report: per period, reported,
  investigated, resolved.

## Traps

- A name in the document is not a signatory. A foreword by an executive, the
  policy owner, a contact person or the author is not the person who signed;
  without a signature block, `signatory_name` is null.
- A code has no incident counts. Counts come only from a register or report
  that prints them; an example in the text ("for example, five reports") is
  not data.
- Copy the hotline number exactly as printed, spaces kept; other channels
  (SMS, e-mail, web) go in exceptions.
- A rule is not a practice. "Employees must declare conflicts" does not mean a
  register is kept; only a statement that the register exists makes it true.
- Section numbers move between revisions; quote the heading, not just the
  number, when an exception refers to a section.

## Worked example

Invented, a code's cover and reporting section:

```
EXAMPLE GROUP CODE OF BUSINESS CONDUCT   Revision 3   Date revised 01/06/2025   Approved by: Executive Committee
...
Report concerns to the Example Ethics Line, 0800 000 111 (toll-free), operated independently.
You may remain anonymous.
```

```json
{"policy_title": "EXAMPLE GROUP CODE OF BUSINESS CONDUCT", "policy_version": "Revision 3", "policy_issue_date": null,
 "board_approval_date": "01/06/2025", "policy_effective_date": null, "policy_approved_by": "Executive Committee",
 "signatory_name": null, "code_of_ethics_in_place": true, "whistleblower_hotline_active": true,
 "whistleblower_hotline_provider": "Example Ethics Line", "whistleblower_hotline_number": "0800 000 111",
 "hotline_is_anonymous": true, "hotline_is_independent": true, "ethics_incidents_reported_count": null,
 "ethics_incidents_investigated_count": null, "ethics_incidents_resolved_count": null,
 "conflict_of_interest_register_maintained": null, "gift_register_maintained": null,
 "reporting_period_start": null, "reporting_period_end": null,
 "exceptions": ["No signature block.", "A code of conduct: no incident counts."]}
```
