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
    description: "The status the document states, as printed: certified, suspended, withdrawn, or for an audit report its overall result line when it prints one, else its recommendation (\"stage 2 recommended\", \"recommended for certification\"). An audit report never makes the status certified."
  - name: iso14001_certification_body
    type: text
    labels: ["Certification body", "Issued by", "Registrar"]
    description: "The certification body that issued the certificate or ran the audit, as printed: in the letterhead, the logo text, or the report's own footer or confidentiality line (\"this report remains the property of ...\")."
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
  - name: audit_client_name
    type: text
    scope: document
    labels: ["Client", "Client/Address", "Organisation"]
    description: "The audited organisation as the report names it, without its address."
  - name: audit_client_reference
    type: text
    scope: document
    labels: ["Client ID", "Client number", "Customer ID"]
    description: "The certification body's own reference for the client, as printed. Never a certificate number."
  - name: management_review_date
    type: date
    scope: document
    labels: ["Management review", "Management review meeting"]
    description: "The date of the client's last management review the report cites, as printed."
  - name: compliance_evaluation_date
    type: date
    scope: document
    labels: ["Legal compliance audit", "Compliance evaluation", "Legal register review"]
    description: "The date of the client's last evaluation of legal compliance the report cites, as printed."
  - name: audited_headcount
    type: count
    scope: document
    labels: ["Headcount", "Number of employees", "Effective personnel"]
    description: "The audited scope's headcount as the report finally states it (a corrected figure when the report corrects one). Not the company's employee count."
  - name: audited_headcount_previous
    type: count
    scope: document
    labels: ["Previous headcount", "Headcount declared"]
    description: "The headcount first declared, when the report says it was corrected from it, as printed."
  - name: significant_aspects
    type: text
    scope: document
    labels: ["Significant aspects", "Significant environmental aspects"]
    description: "The significant environmental aspects the report names, each as printed, separated by '; '."
  - name: referenced_documents
    type: text
    scope: document
    labels: ["Document reference", "Doc ref", "Ref no"]
    description: "The client's document numbers the report cites (manuals, registers, work instructions), each as printed, separated by '; '."
  - name: client_representative_name
    type: text
    scope: document
    labels: ["Client representative", "Management representative"]
    description: "The client's representative named in the report, as printed."
newFields: [audit_type, audit_start_date, audit_end_date, audit_report_date, lead_auditor_name, major_nonconformities_count, minor_nonconformities_count, audit_client_name, audit_client_reference, management_review_date, compliance_evaluation_date, audited_headcount, audited_headcount_previous, significant_aspects, referenced_documents, client_representative_name]
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
- A headcount on an audit cover is the audited scope's headcount
  (`audited_headcount`); it is not the company's employee count. When the
  report corrects it, the corrected figure is `audited_headcount` and the
  first one `audited_headcount_previous`.
- Referenced document numbers in the findings name the client's documents
  (`referenced_documents`); they are not certificates.
- The certification body is often named only in the logo and in every
  page's footer or confidentiality line; that is still the body.

## Worked example

Invented, a stage 1 audit report cover:

```
EXAMPLE CERTIFICATION SERVICES - AUDIT REPORT
Client: Example Logistics, Depot E   Client ID: EX-000123   Standard: ISO 14001:2015   Audit type: Stage 1
Audit dates: 03-04 March 2026   Report issued: 10-Mar-2026   Lead auditor: R. Pillay   Headcount: 210
Major NCs: -  Minor NCs: -   Recommendation: Stage 2 recommended   Accreditation mark: Not applicable
Management review held 01/03/2026. Significant aspects: diesel use; waste oil. See manual EX-PR-001.
Client representative: T. Example
```

```json
{"iso14001_status": "Stage 2 recommended", "iso14001_certification_body": "EXAMPLE CERTIFICATION SERVICES",
 "iso14001_standard_version": "ISO 14001:2015", "iso14001_scope_statement": null, "iso14001_sites_covered": "Depot E",
 "iso14001_certificate_number": null, "iso14001_issue_date": null, "iso14001_expiry_date": null,
 "iso14001_last_surveillance_audit_date": null, "accreditation_mark": "Not applicable", "audit_type": "Stage 1",
 "audit_start_date": "03 March 2026", "audit_end_date": "04 March 2026", "audit_report_date": "10-Mar-2026",
 "lead_auditor_name": "R. Pillay", "major_nonconformities_count": null, "minor_nonconformities_count": null,
 "audit_client_name": "Example Logistics", "audit_client_reference": "EX-000123", "management_review_date": "01/03/2026",
 "compliance_evaluation_date": null, "audited_headcount": 210, "audited_headcount_previous": null,
 "significant_aspects": "diesel use; waste oil", "referenced_documents": "EX-PR-001", "client_representative_name": "T. Example",
 "exceptions": ["A stage 1 audit report, not a certificate: certification is in progress."]}
```
