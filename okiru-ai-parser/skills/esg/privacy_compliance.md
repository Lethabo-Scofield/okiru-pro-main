---
id: privacy_compliance
appliesTo:
  - ethics_compliance__popia_information_officer_and_pia
element: ETHICS_COMPLIANCE
version: 1
hard: false
classify:
  is: "A POPIA or data-privacy document of the business: an information officer appointment or registration, a personal information impact assessment, a PAIA manual, a privacy policy or notice, or a letter or form asking people to consent to the processing of their personal information."
  isNot:
    - "a code of ethics or whistleblowing policy (read by the ethics code skill)"
    - "an IT or cyber security policy that does not deal with personal information"
    - "an employee's own ID document or personal record"
  filenameHints: ["popia", "popi act", "consent", "information officer", "paia manual", "privacy policy", "privacy notice", "impact assessment"]
  contentSignals: ["Protection of Personal Information", "POPIA", "POPI Act", "Information Officer", "Information Regulator", "PAIA", "consent", "personal information", "data subject", "Act 4 of 2013"]
fields:
  - name: privacy_document_kind
    type: text
    required: true
    scope: document
    labels: []
    description: "What the document is, in a few words: appointment letter, registration, impact assessment, PAIA manual, privacy policy, privacy notice or consent letter."
  - name: document_date
    type: date
    scope: document
    labels: ["Dated", "Date of letter"]
    description: "The date the document itself prints (a letter's date line, a policy's issue date), as printed. Never taken from the file name."
  - name: act_cited
    type: text
    scope: document
    labels: ["Act", "in terms of"]
    description: "The Act the document is issued under, exactly as it prints it, a typing slip included (\"Protection of Personal Information Act, 4 of 2013\")."
  - name: issuing_entity
    type: text
    scope: document
    labels: ["Company", "Responsible party", "on behalf of"]
    description: "The company (or division of a company) that issues the document or processes the information, as printed, with its division wording (\"Example Foods, a division of Example Holdings (Pty) Ltd\")."
  - name: issuer_registration_number
    type: regno
    scope: document
    labels: ["Reg No", "Registration number", "Company registration"]
    description: "The issuing company's registration number, usually in the letterhead or page footer, as printed."
  - name: issuer_directors
    type: text
    scope: document
    labels: ["Directors"]
    description: "The directors the letterhead or footer lists, each as printed, separated by '; '."
  - name: issuer_company_secretary
    type: text
    scope: document
    labels: ["Company secretary", "Secretary"]
    description: "The company secretary the letterhead or footer names, as printed."
  - name: issuer_executives
    type: text
    scope: document
    labels: ["Executives", "Divisional executives", "Executive committee"]
    description: "The executives the letterhead or footer lists, each as printed with the role printed beside it (\"A Name (CEO)\"), separated by '; '."
  - name: popia_information_officer_appointed
    type: text
    labels: ["appointed as Information Officer", "Appointment of Information Officer"]
    description: "Yes, No or Partial, only as the document states an information officer appointment. Null when the document does not speak to it."
  - name: information_officer_name
    type: text
    labels: ["Information Officer"]
    description: "The appointed information officer, as printed. Never inferred from a job title."
  - name: information_officer_appointment_date
    type: date
    labels: ["Date of appointment", "Appointed on"]
    description: "The date of the information officer's appointment, as printed."
  - name: deputy_information_officers_count
    type: count
    labels: ["Deputy Information Officers"]
    description: "A printed number of deputy information officers, or the number the document lists by name. Null when it names none."
  - name: information_regulator_registration_reference
    type: text
    labels: ["Registration reference", "Information Regulator reference"]
    description: "The Information Regulator registration reference, as printed."
  - name: popia_impact_assessment_done
    type: text
    labels: ["Impact assessment", "PIA"]
    description: "Yes, No or Partial, only as the document states a personal information impact assessment. Null when it does not speak to it."
  - name: popia_impact_assessment_date
    type: date
    labels: ["Assessment date"]
    description: "The impact assessment's date, as printed."
  - name: paia_manual_published
    type: text
    labels: ["PAIA manual"]
    description: "Yes, No or Partial, only as the document states the PAIA manual is published. Null when it does not speak to it."
  - name: paia_manual_date
    type: date
    labels: ["PAIA manual date"]
    description: "The PAIA manual's date, as printed."
  - name: data_breach_incidents_count
    type: count
    labels: ["Security compromises", "Data breaches"]
    description: "A printed count of security compromises or data breaches. Null when none is printed; never a zero the document does not print."
  - name: privacy_policy_present
    type: text
    labels: ["Privacy policy", "Privacy notice"]
    description: "Yes when the document is, or names, the business's privacy policy or notice; No only when it says there is none; otherwise null."
newFields: [privacy_document_kind, document_date, act_cited, issuing_entity, issuer_registration_number, issuer_directors, issuer_company_secretary, issuer_executives]
---
## What it is / is not

A business shows it complies with the Protection of Personal Information Act
(POPIA) through an information officer appointment and its registration with
the Information Regulator, a personal information impact assessment, a PAIA
manual, a privacy policy or notice, and the consent it asks of the people
whose information it processes (employees, customers, drivers). Each of these
is evidence; a consent letter is evidence of consent only.

It is NOT a code of ethics or whistleblowing policy, an IT security policy
that does not deal with personal information, or a person's own records.

## Where values sit

- A letter's date line is at the top of its body; the Act it is issued under
  is in its title or first paragraph.
- The issuing company's registration number, directors, company secretary and
  executives are in the letterhead or the first page's footer. Word page
  headers and footers arrive under "## Header" and "## Footer".
- An appointment letter names the officer, the appointment date and who
  signed it; a registration prints the regulator's reference.

## Traps

- A document says what it says. A consent letter that never mentions an
  information officer, an impact assessment or a PAIA manual says nothing
  about them: those fields are null, never No and never Partial.
- The date in a file name is not the document's date. Copy the date the
  document prints and note the file name's date in exceptions if they differ.
- Copy the Act's name as printed, even when it drops or misspells a word;
  note the slip in exceptions instead of correcting it.
- A director or executive listed in a letterhead is not the information
  officer. Never infer the officer from a job title.
- A consent form's blank signature lines are not consent given: the fields
  stay null and the exception says the form is unsigned.

## Worked example

Invented, a consent letter with a letterhead footer:

```
3 March 2026
CONSENT IN TERMS OF THE PROTECTION OF PERSONAL INFORMATION ACT, 4 OF 2013
Example Foods, a division of Example Holdings (Pty) Ltd, asks for your consent to process ...
Signature: ________   Date: ________
(page footer)
Example Holdings (Pty) Ltd  Reg No 2001/123456/07  Directors: A Director, B Director  Company Secretary: C Secretary
Divisional executives: D Officer (CEO), E Officer (CFO)
```

```json
{"privacy_document_kind": "consent letter", "document_date": "3 March 2026",
 "act_cited": "PROTECTION OF PERSONAL INFORMATION ACT, 4 OF 2013",
 "issuing_entity": "Example Foods, a division of Example Holdings (Pty) Ltd",
 "issuer_registration_number": "2001/123456/07", "issuer_directors": "A Director; B Director",
 "issuer_company_secretary": "C Secretary", "issuer_executives": "D Officer (CEO); E Officer (CFO)",
 "popia_information_officer_appointed": null, "information_officer_name": null,
 "information_officer_appointment_date": null, "deputy_information_officers_count": null,
 "information_regulator_registration_reference": null, "popia_impact_assessment_done": null,
 "popia_impact_assessment_date": null, "paia_manual_published": null, "paia_manual_date": null,
 "data_breach_incidents_count": null, "privacy_policy_present": null,
 "exceptions": ["Consent letter: it does not mention an information officer, an impact assessment or a PAIA manual.", "The form is unsigned."]}
```
