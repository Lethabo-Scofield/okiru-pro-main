---
id: injury_statistics_report
appliesTo:
  - health_safety__injury_statistics_report
element: HEALTH_SAFETY
version: 1
hard: true
classify:
  is: "A health and safety record of incidents and injuries for a period: an incident or accident register (one row per incident), a SHE statistics report with injury counts, hours worked and frequency rates, or a COIDA / section 24 incident report."
  isNot:
    - "a health and safety induction, training or appointments register (read by the H&S training skill)"
    - "an ISO 45001 certificate"
    - "a vehicle accident claim or insurance schedule with no injury classification"
    - "a risk register or HIRA"
  filenameHints: ["she incidents", "incident register", "injury statistics", "accident register", "safety statistics", "ltifr"]
  contentSignals: ["Incident", "Injury", "Lost time", "LTI", "Medical treatment", "First aid", "Near miss", "Fatality", "Days lost", "Hours worked", "LTIFR", "Section 24"]
rowsField: incident_rows
fields:
  - name: reporting_period_start
    type: date
    required: true
    labels: ["Period from", "Reporting period", "Financial year from"]
    description: "First day of the period the register or report covers, as printed. Not the date of the first incident."
  - name: reporting_period_end
    type: date
    labels: ["Period to", "Financial year to"]
    description: "Last day of the period, as printed."
  - name: site_name
    type: text
    labels: ["Business unit", "Division", "Branch"]
    description: "The site, division or business unit the record covers, as printed."
  - name: employees_headcount_for_ltifr
    type: count
    labels: ["Number of employees", "Average headcount"]
    description: "A headcount the report prints for its rates, only when printed."
  - name: hours_worked
    type: number
    labels: ["Hours worked", "Man-hours", "Person-hours", "Exposure hours"]
    description: "Hours worked in the period, only when the document prints them. Never estimate hours from a headcount."
  - name: fatalities_count
    type: count
    labels: ["Fatalities", "Fatal"]
    description: "A fatality count the document prints in a summary or statistics block. Never count the rows yourself; the code counts incidents from the rows."
  - name: lost_time_injuries_count
    type: count
    labels: ["Lost time injuries", "LTIs", "No. of LTIs"]
    description: "A lost-time injury count the document prints in a summary or statistics block. Never count the rows yourself; the code counts incidents from the rows."
  - name: medical_treatment_injuries_count
    type: count
    labels: ["Medical treatment cases", "MTCs", "MTIs"]
    description: "A printed medical-treatment count only. Never count the rows yourself."
  - name: first_aid_cases_count
    type: count
    labels: ["First aid cases", "FACs"]
    description: "A printed first-aid count only. Never count the rows yourself."
  - name: near_miss_count
    type: count
    labels: ["Near misses", "Near miss"]
    description: "A printed near-miss count only. Never count the rows yourself."
  - name: vehicle_accidents_count
    type: count
    labels: ["Vehicle accidents", "MVAs", "Road incidents"]
    description: "A printed vehicle-accident count only. Never count the rows yourself."
  - name: days_lost_count
    type: count
    labels: ["Days lost", "Lost days", "Shifts lost"]
    description: "A printed total of days lost only. Never add up the rows."
  - name: dol_section24_reportable_count
    type: count
    labels: ["Section 24 reportable", "Reportable incidents"]
    description: "A printed count of incidents reported to the Department under section 24 of the OHS Act only."
  - name: ltifr
    type: number
    labels: ["LTIFR", "Lost time injury frequency rate"]
    description: "Only an LTIFR the document itself prints, exactly as printed, with its basis in ltifr_rate_basis. Never computed: the code computes LTIFR from lost-time injuries and hours worked."
  - name: trifr
    type: number
    labels: ["TRIFR", "Total recordable injury frequency rate"]
    description: "Only a TRIFR the document itself prints. Never computed."
  - name: ltifr_rate_basis
    type: text
    labels: ["Per 1 000 000 hours", "Per 200 000 hours"]
    description: "The hours basis printed with the rate (per 1 000 000 or per 200 000 hours worked), as printed. The code reports LTIFR per 1 000 000 hours; a rate on another basis is copied with its basis, never rescaled."
  - name: incident_date
    type: date
    required: true
    rowLevel: true
    labels: []
    description: "The date of the incident, as printed."
  - name: incident_site
    type: text
    rowLevel: true
    labels: []
    description: "Where it happened (site, depot, route), as printed."
  - name: incident_description
    type: text
    rowLevel: true
    labels: []
    description: "What happened, as the register describes it (short; no names or medical detail beyond what is printed)."
  - name: incident_classification
    type: text
    rowLevel: true
    labels: []
    description: "The register's own classification as printed: LTI, medical treatment, first aid, near miss, property damage, vehicle incident, fatality. Null when the register does not classify the row."
  - name: incident_lost_time
    type: bool
    rowLevel: true
    labels: []
    description: "True only when the row states lost time (an LTI, days off, \"booked off\"); false when it states none; null otherwise."
  - name: incident_days_lost
    type: count
    rowLevel: true
    labels: []
    description: "Days lost on this row, when printed."
  - name: injured_party_category
    type: text
    rowLevel: true
    labels: []
    description: "Whose injury or incident it was, as printed: employee, contractor, labour broker worker, third party, member of the public."
newFields: [incident_rows, incident_date, incident_site, incident_description, incident_classification, incident_lost_time, incident_days_lost, injured_party_category]
---
## What it is / is not

Safety performance is measured from incidents and hours. An incident register
lists each incident with its date, place, description and classification; a
statistics report adds counts per category, hours worked and frequency rates
(LTIFR, TRIFR). The lost-time injury frequency rate is lost-time injuries per
1 000 000 hours worked: the code computes it from the rows and the hours, and
only when hours are evidenced.

It is NOT a training or appointments register, an ISO 45001 certificate, an
insurance claims schedule or a risk register.

## Where values sit

- Register header: company, site or division, reporting period.
- One row per incident: date, site, description, injury type, classification,
  days lost, who was involved, follow-up. Classification is often a column of
  its own; sometimes it is only in the description ("booked off for 3 days").
- A statistics block or summary sheet (when there is one): counts by
  category, hours worked, LTIFR with its basis. These are document-level.

## Traps

- Never count. Every count field is a figure the document prints in a summary;
  when the register only lists incidents, the counts are null and the code
  counts the rows by their classification.
- Never compute LTIFR, TRIFR or a severity rate, and never estimate hours from
  headcount: no hours, no rate.
- A bare number with no label (a "17" alone in a corner cell) is not an
  incident count. Copy labelled figures only, and note an unlabelled one in
  exceptions.
- Copy the register's classification as printed. Do not upgrade a first-aid
  case to medical treatment, or decide that an injury was lost time when the
  row does not say so.
- Vehicle incidents with no injury are incidents, not injuries; copy their
  classification as printed. Incidents of third-party transporters are
  copied with that category.
- Contractors and labour-broker workers are copied with their category; the
  code and the client's declared boundary decide whether they count.
- Rows dated outside the printed period are copied with their dates and
  flagged.

## Worked example

Invented, a short incident register with no statistics block:

```
SHE INCIDENT REGISTER - Example Distribution - 01/07/2025 to 30/06/2026
Date        Site     Description                         Type            Days lost   Person
14/08/2025  Depot A  Hand caught in roller door           LTI             4           Employee
02/10/2025  Depot B  Cut finger opening carton            First aid                   Employee
19/01/2026  Route 7  Reversed into gate, no injury        Vehicle                     Contractor
```

```json
{"reporting_period_start": "01/07/2025", "reporting_period_end": "30/06/2026", "site_name": "Example Distribution",
 "employees_headcount_for_ltifr": null, "hours_worked": null, "fatalities_count": null, "lost_time_injuries_count": null,
 "medical_treatment_injuries_count": null, "first_aid_cases_count": null, "near_miss_count": null,
 "vehicle_accidents_count": null, "days_lost_count": null, "dol_section24_reportable_count": null,
 "ltifr": null, "trifr": null, "ltifr_rate_basis": null,
 "incident_rows": [
   {"incident_date": "14/08/2025", "incident_site": "Depot A", "incident_description": "Hand caught in roller door", "incident_classification": "LTI", "incident_lost_time": true, "incident_days_lost": 4, "injured_party_category": "Employee"},
   {"incident_date": "02/10/2025", "incident_site": "Depot B", "incident_description": "Cut finger opening carton", "incident_classification": "First aid", "incident_lost_time": false, "incident_days_lost": null, "injured_party_category": "Employee"},
   {"incident_date": "19/01/2026", "incident_site": "Route 7", "incident_description": "Reversed into gate, no injury", "incident_classification": "Vehicle", "incident_lost_time": null, "incident_days_lost": null, "injured_party_category": "Contractor"}
 ],
 "exceptions": ["No statistics block: counts are left to the code.", "No hours worked are printed, so no LTIFR can be stated."]}
```
