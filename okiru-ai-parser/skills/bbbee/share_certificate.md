---
id: share_certificate
appliesTo:
  - ownership__share_certificates_security_certificates_held_by_each_bee_pa
element: OWNERSHIP
version: 1
hard: false
classify:
  is: "A single share (security) certificate: 'This is to certify that [holder] is the registered holder of [n] [class] shares in [company]', with a certificate number, date and signatures."
  isNot:
    - "a securities / share register (a table of every holder)"
    - "a B-BBEE verification certificate (agency, level, points)"
    - "an ownership confirmation letter from an auditor or company secretary (states percentages for all holders)"
    - "a CIPC registration certificate"
  filenameHints: ["share certificate", "share cert", "certificate no", "security certificate"]
  contentSignals: ["Share Certificate", "This is to certify that", "registered holder of", "Ordinary Shares", "Certificate No", "Authorised Capital", "fully paid", "Director", "Secretary"]
fields:
  - name: entity_name
    type: text
    required: true
    labels: ["in the capital of", "Company", "Name of company"]
    description: "The company that issued the shares."
  - name: registration_number
    type: regno
    labels: ["Registration number", "Reg No"]
    description: "The issuing company's CIPC registration number, when printed."
  - name: certificate_number
    type: text
    required: true
    labels: ["Certificate No", "Cert. No", "No."]
    description: "The certificate's number, usually top left or top right."
  - name: holder_name
    type: text
    required: true
    labels: ["This is to certify that", "registered holder", "Holder"]
    description: "The registered holder named in the certifying sentence."
  - name: id_number
    type: idno
    labels: ["ID No", "Identity number", "of (ID)"]
    description: "The HOLDER's ID (or registration) number when the certifying sentence gives it — never a signatory's."
  - name: share_class
    type: text
    labels: ["Ordinary Shares", "Class", "Preference Shares"]
    description: "The class of shares on the certificate."
  - name: number_of_shares
    type: count
    required: true
    labels: ["Number of shares", "No. of shares", "shares of"]
    description: "Shares this certificate covers (issued to the holder), not the authorised capital."
  - name: authorised_shares
    type: count
    labels: ["Authorised Capital", "Authorised", "Authorised shares"]
    description: "The company's authorised shares, when printed on the certificate."
  - name: percentage
    type: percent
    labels: ["% shares", "per cent", "holding"]
    description: "The percentage holding, only when the certificate states it in words or figures."
  - name: issue_date
    type: date
    labels: ["Given under", "Dated", "Date of issue", "this ... day of"]
    description: "The date the certificate was issued ('this 2nd day of March 2015')."
  - name: signed_by
    type: text
    labels: ["Director", "Secretary", "Authorised signatory", "Witness"]
    description: "Signatories with their capacities as printed (e.g. 'T. Mokoena (Director); A. Smith (Secretary)')."
newFields: [authorised_shares]
dropFields: [matches_share_register]
---
## What it is / is not

A share certificate is the physical proof of one holding: one holder, one
number of shares of one class in one company, numbered, dated and signed
(usually by a director and the company secretary or a second director, some
with a seal). It traces to a line of the securities register.

It is not a register (several holders in a table) and not an ownership
confirmation letter. It says nothing about race, gender, black ownership or
B-BBEE: those come from IDs, declarations and the verification.

## Where values sit

- Title "Share Certificate"; the certificate number in a corner box
  ("Certificate No. BE01").
- Top band or a side box: number of shares and class ("100 Ordinary Shares"),
  sometimes the authorised capital ("Authorised Capital: 1 000 ordinary
  shares").
- The certifying sentence in the middle: "This is to certify that [holder] (ID
  No ...) is the registered holder of [n] fully paid [class] shares of no par
  value in [company] (Registration number ...)". Some add "being 100% of the
  issued shares".
- Foot: "Given under ... this [day] day of [month] [year]" and the signatures
  with names, capacities and sometimes their own ID numbers.

## Traps

- Authorised capital is not the holding. "Authorised 1 000" with "100 shares"
  means the holder has 100.
- Signatories' ID numbers sit near the signatures. The holder's ID is the one
  in the certifying sentence; if only signatories' IDs are printed, the
  holder's `id_number` is null.
- A holder can also sign as a director. Still record them once as the holder
  and once in `signed_by`.
- A share certificate states NO race. Never return black ownership, race or
  gender from it.
- The percentage is only filled when the certificate itself states it.
- Date in words ("this 2nd day of March 2015") is the issue date; a place name
  beside it ("at Durban") is not part of the date.
- A close corporation does not issue shares; a "certificate" for a CC member's
  interest is read the same way, with the member's interest as the percentage —
  say so in exceptions.

## Worked example

Invented, scanned:

```
SHARE CERTIFICATE                                       Certificate No. BE01
                        BAOBAB ENGINEERING (PTY) LTD  (Reg. 2015/123456/07)
Authorised Capital: 1 000 Ordinary Shares of no par value
This is to certify that THABO MOKOENA (ID No 800101 5009 087) is the registered holder of
60 (sixty) fully paid Ordinary Shares in the above company.
Given at Durban this 2nd day of March 2015.
____ T. Mokoena, Director (ID 800101 5009 087)      ____ A. Smith, Company Secretary
```

```json
{"entity_name": "BAOBAB ENGINEERING (PTY) LTD", "registration_number": "2015/123456/07",
 "certificate_number": "BE01", "holder_name": "THABO MOKOENA", "id_number": "800101 5009 087",
 "share_class": "Ordinary", "number_of_shares": 60, "authorised_shares": 1000, "percentage": null,
 "issue_date": "2nd day of March 2015", "signed_by": "T. Mokoena (Director); A. Smith (Company Secretary)",
 "exceptions": []}
```
