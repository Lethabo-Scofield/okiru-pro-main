---
id: iso14001_audit_or_certificate
appliesTo:
  - iso_environmental__iso14001_certificate
element: ISO_ENVIRONMENTAL
version: 1
hard: false
classify:
  is: "Evidence of an ISO 14001 environmental management system's certification status: a certificate of registration, or a certification body's audit report (stage 1, stage 2, surveillance or recertification) with its findings and recommendation."
  isNot:
    - "an ISO 45001 or ISO 9001 certificate or audit (other standards)"
    - "an internal audit or management review the business ran itself"
    - "an environmental policy, aspects register or legal register"
  filenameHints: ["iso 14001", "iso14001", "ems certificate", "stage 1 audit", "stage 2 audit", "surveillance audit"]
  contentSignals: ["ISO 14001", "ISO 14001:2015", "Certificate of registration", "Stage 1", "Stage 2", "Surveillance", "Audit report", "Certification body", "Scope of certification", "Nonconformity", "Recommendation"]
fields:
  - name: iso14001_status
    type: text
    required: true
    labels: ["Certification status", "Audit recommendation", "Recommendation"]
    description: "The status the document states, as printed: certified, suspended, withdrawn, or for an audit report its recommendation (\"stage 2 recommended\", \"recommended for certification\"). An audit report never makes the status certified."
  - name: iso14001_certification_body
    type: text
    labels: ["Certification body", "Issued by", "Registrar"]
    description: "The certification body that issued the certificate or ran the audit, as printed."
  - name: iso14001_standard_version
    type: text
    labels: ["Standard", "Audit criteria"]
    description: "The standard and edition as printed (ISO 14001:2015)."
  - name: iso14001_scope_statement
    type: text
    labels: ["Scope", "Scope of certification", "Audit scope"]
    description: "The scope as printed, quoted briefly."
  - name: iso14001_sites_covered
    type: text
    labels: ["Sites", "Site address", "Locations"]
    description: "The sites the certificate or audit covers, as printed, separated by semicolons."
  - name: iso14001_certificate_number
    type: text
    labels: ["Certificate number", "Certificate no", "Registration number"]
    description: "The certificate number, from a CERTIFICATE only. An audit report's client, project or activity number is not a certificate number."
  - name: iso14001_issue_date
    type: date
    labels: ["Date of issue", "Issue date", "Original certification date"]
    description: "The certificate's issue date, from a certificate only. An audit report's issue date is audit_report_date."
  - name: iso14001_expiry_date
    type: date
    labels: ["Expiry date", "Valid until"]
    description: "The certificate's expiry date, from a certificate only."
  - name: iso14001_last_surveillance_audit_date
    type: date
    labels: ["Last surveillance audit"]
    description: "The last surveillance audit date when a certificate or report states one."
  - name: accreditation_mark
    type: text
    labels: ["Accreditation", "Accredited by"]
    description: "The accreditation body or mark as printed (SANAS, UKAS), or \"Not applicable\" when the document says so."
  - name: audit_type
    type: text
    labels: ["Audit type", "Type of audit"]
    description: "Stage 1, stage 2, surveillance, recertification or special, as printed."
  - name: audit_start_date
    type: date
    labels: ["Audit date", "Date of audit", "Audit dates"]
    description: "The first day of the audit, as printed."
  - name: audit_end_date
    type: date
    labels: ["Audit end"]
    description: "The last day of the audit, as printed."
  - name: audit_report_date
    type: date
    labels: ["Report date", "Date issued", "Report issued"]
    description: "The date the audit report was issued, as printed."
  - name: lead_auditor_name
    type: text
    labels: ["Lead auditor", "Audit team leader"]
    description: "The lead auditor, as printed."
  - name: major_nonconformities_count
    type: count
    labels: ["Major nonconformities", "Major NCs"]
    description: "A printed count of major nonconformities only. An empty column is null, not zero."
  - name: minor_nonconformities_count
    type: count
    labels: ["Minor nonconformities", "Minor NCs"]
    description: "A printed count of minor nonconformities only. An empty column is null, not zero."
newFields: [audit_type, audit_start_date, audit_end_date, audit_report_date, lead_auditor_name, major_nonconformities_count, minor_nonconformities_count]
---
## What it is / is not

ISO 14001 certification is granted by an accredited certification body after
a two-stage initial audit (stage 1 reviews readiness and documents, stage 2
assesses implementation), then maintained by surveillance audits and renewed
on a three-year cycle. A certificate states the number, scope, sites, issue and
expiry dates. An audit report states the audit type, dates, findings and the
auditor's recommendation.

For an ESG report the question is "is the system certified, in progress or
absent", and the answer must come from what the document is.

It is NOT another standard's certificate or audit, an internal audit or
management review, or a policy or register.

## Where values sit

- Certificate: a single page with the certificate number, the organisation,
  the scope, the sites, the standard, issue and expiry dates and the
  accreditation mark.
- Audit report: a cover table (client, client number, audit type, dates,
  standard, lead auditor, scope, sites, headcount), then findings tables
  (major, minor, opportunities for improvement) and the recommendation.

## Traps

- An audit report is not a certificate. A stage 1 report that recommends
  stage 2 means certification is in progress: copy that recommendation as
  the status, and leave the certificate number, issue date and expiry null.
  The report's own issue date is `audit_report_date`.
- A client, project, activity or audit number on a report is not a
  certificate number.
- Empty nonconformity columns are null, not zero; copy counts only when
  printed.
- Text that contradicts a tick box ("Opportunities for improvement: No",
  followed by a list of improvement points) is copied as printed and both are
  noted in exceptions.
- A headcount on an audit cover is the audited scope's headcount; it is not
  the company's employee count and has no field here.
- Referenced document numbers in the findings name the client's documents;
  they are not certificates.

## Worked example

Invented, a stage 1 audit report cover:

```
EXAMPLE CERTIFICATION SERVICES - AUDIT REPORT
Client: Example Logistics, Depot E   Standard: ISO 14001:2015   Audit type: Stage 1
Audit dates: 03-04 March 2026   Report issued: 10-Mar-2026   Lead auditor: R. Pillay
Major NCs: -  Minor NCs: -   Recommendation: Stage 2 recommended   Accreditation mark: Not applicable
```

```json
{"iso14001_status": "Stage 2 recommended", "iso14001_certification_body": "EXAMPLE CERTIFICATION SERVICES",
 "iso14001_standard_version": "ISO 14001:2015", "iso14001_scope_statement": null, "iso14001_sites_covered": "Depot E",
 "iso14001_certificate_number": null, "iso14001_issue_date": null, "iso14001_expiry_date": null,
 "iso14001_last_surveillance_audit_date": null, "accreditation_mark": "Not applicable", "audit_type": "Stage 1",
 "audit_start_date": "03 March 2026", "audit_end_date": "04 March 2026", "audit_report_date": "10-Mar-2026",
 "lead_auditor_name": "R. Pillay", "major_nonconformities_count": null, "minor_nonconformities_count": null,
 "exceptions": ["A stage 1 audit report, not a certificate: certification is in progress."]}
```
