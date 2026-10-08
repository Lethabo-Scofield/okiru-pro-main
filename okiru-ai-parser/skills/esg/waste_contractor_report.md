---
id: waste_contractor_report
appliesTo:
  - waste__contractor_report_safe_disposal_certificate
element: WASTE
version: 1
hard: true
classify:
  is: "A waste contractor's record of what it collected from a site: a monthly waste or recycling report, a material and treatment report, a system export of waste streams with masses and routes, a waste manifest, or a safe disposal certificate."
  isNot:
    - "the client's own monthly data workbook that carries a waste column per depot (read by the dashboard skill)"
    - "an invoice for skip hire with no masses"
    - "a waste management licence or permit on its own"
    - "an environmental aspects register"
  filenameHints: ["waste report", "recycling report", "safe disposal", "waste manifest", "disposal certificate", "waste statement"]
  contentSignals: ["Waste stream", "Recycled", "Landfill", "Diversion", "Safe disposal", "Mass", "Tonnes", "kg", "Manifest", "Treatment", "Disposal facility", "Certificate of safe disposal"]
rowsField: waste_stream_rows
fields:
  - name: waste_contractor_name
    type: text
    required: true
    labels: ["Contractor", "Service provider", "Collected by"]
    description: "The waste company that issued the report, as printed in its letterhead, footer or company details. Null when the only trace is a logo image or the file name."
  - name: site_name
    type: text
    required: true
    labels: ["Customer site", "Collection point", "Generator site"]
    description: "The client site the waste was collected from, as printed."
  - name: reporting_period_start
    type: date
    labels: ["Period from", "Date from", "Report period"]
    description: "First day of the period the report covers, as printed in the document. Never taken from the file name."
  - name: reporting_period_end
    type: date
    labels: ["Period to", "Date to"]
    description: "Last day of the period, as printed in the document."
  - name: waste_total_kg
    type: number
    labels: ["Total waste", "Total mass", "Grand total"]
    description: "The site total mass the report prints, in the unit printed (see waste_mass_unit). Never the sum of the streams you add up."
  - name: waste_recycled_kg
    type: number
    labels: ["Total recycled", "Total diverted", "Diverted from landfill"]
    description: "The site total the report prints as recycled or diverted, in the printed unit."
  - name: waste_landfill_kg
    type: number
    labels: ["Total landfill", "To landfill", "Landfilled"]
    description: "The site total the report prints as landfilled, in the printed unit."
  - name: waste_diversion_percent
    type: percent
    labels: ["Diversion rate", "Diversion %", "Recycling rate"]
    description: "A diversion or recycling percentage only when the report prints one. Never computed from the masses."
  - name: waste_mass_unit
    type: text
    required: true
    labels: ["Unit", "UOM", "Unit of measure"]
    description: "The unit printed for the masses: kg, t or tonnes, m3, or units. Null when no unit is printed: never assume kg."
  - name: hazardous_waste_kg
    type: number
    labels: ["Hazardous waste", "Hazardous"]
    description: "Hazardous waste mass, only when the report itself classes a stream or total as hazardous."
  - name: disposal_facility_name
    type: text
    labels: ["Disposal facility", "Landfill site", "Treatment facility"]
    description: "The landfill, treatment or recycling facility named, as printed."
  - name: disposal_permit_number
    type: text
    labels: ["Permit number", "Licence number", "Waste management licence"]
    description: "The facility's or contractor's waste management licence or permit number, as printed."
  - name: safe_disposal_certificate_number
    type: text
    labels: ["Certificate number", "Certificate no", "Safe disposal certificate"]
    description: "The safe disposal certificate or manifest number, as printed."
  - name: waste_stream_type
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The stream's DESCRIPTION as printed (\"Cardboard\", \"General waste\", \"Used oil\"). A waste code goes in waste_stream_code, not here."
  - name: waste_stream_code
    type: text
    rowLevel: true
    labels: []
    description: "The stream's code when the report prints one (a SAWIC, EWC or contractor code), as printed."
  - name: waste_treatment_route
    type: text
    rowLevel: true
    labels: []
    description: "The route the report gives this stream: recycled, reused, composted, recovered, safe disposal, incinerated or landfill, as printed."
  - name: waste_total_kg
    type: number
    rowLevel: true
    labels: []
    description: "The stream's mass, in the printed unit."
  - name: waste_recycled_kg
    type: number
    rowLevel: true
    labels: []
    description: "The stream's recycled or diverted mass, when the report splits it, in the printed unit."
  - name: waste_landfill_kg
    type: number
    rowLevel: true
    labels: []
    description: "The stream's landfilled mass, when the report splits it, in the printed unit."
newFields: [waste_stream_code, waste_treatment_route]
---
## What it is / is not

A waste contractor reports, per client site and period, how much of each waste
stream it collected and where it went: recycled, recovered, treated, safely
disposed or landfilled. Some reports print a diversion rate. A safe disposal
certificate or manifest proves one load reached a licensed facility.

For an ESG report the streams, their masses, their routes and the unit are
the evidence; the diversion rate is derived from them in code.

It is NOT the client's own monthly data workbook, a skip-hire invoice without
masses, a licence on its own, or an aspects register.

## Where values sit

- Header or letterhead: contractor, client, site, period. A system export may
  print the site in a filter line and the period nowhere at all.
- A table of streams: description, code, route, mass. Some exports split
  "landfill vs diversion" on separate sheets; each sheet's streams are rows.
- Totals at the foot: total mass, total diverted, total landfilled, a
  diversion percentage. These are document-level fields.
- Charges, rebates and net value are Rand, not mass.

## Traps

- NEVER convert units. A report in tonnes stays in tonnes; one in kg stays in
  kg. The `_kg` fields hold the number exactly as printed, and
  `waste_mass_unit` says what it is. A column headed "consumption units" or
  "quantity" with no unit gives a null unit, never kg.
- A column labelled kg can hold something else (percentages, counts, a
  monthly series that cannot be masses). Copy it as printed and flag it; never
  correct it.
- The diversion rate is the report's claim. Copy it only when printed. What
  the report counts as diversion (safe disposal of general waste is often
  counted) is copied as printed and flagged; the code and the assurance
  provider decide what counts.
- The period comes from the document. When no period is printed, the period
  fields are null and the file name's month goes in exceptions.
- Codes are not descriptions. Put a stream's code ("R01", "H02") in
  `waste_stream_code` and its words in `waste_stream_type`.
- Hazardous only when the report says hazardous. General commercial waste
  sent to safe disposal is not hazardous because of its route.
- An export that warns it hit a row limit or may be truncated: copy what is
  there and say so in exceptions.
- Never add the streams, never compute landfill as total minus recycled, and
  never compute a percentage.

## Worked example

Invented, a contractor's monthly site report:

```
EXAMPLE RECYCLING (PTY) LTD - Site report: Depot D - 01/05/2026 to 31/05/2026
Stream            Code     Route          Mass (kg)
Cardboard         R01      Recycled       1 240
Plastic film      R04      Recycled         310
General waste     G10      Landfill         880
Total                                     2 430     Diversion 63.8%
```

```json
{"waste_contractor_name": "EXAMPLE RECYCLING (PTY) LTD", "site_name": "Depot D",
 "reporting_period_start": "01/05/2026", "reporting_period_end": "31/05/2026",
 "waste_total_kg": "2 430", "waste_recycled_kg": null, "waste_landfill_kg": null,
 "waste_diversion_percent": "63.8%", "waste_mass_unit": "kg", "hazardous_waste_kg": null,
 "disposal_facility_name": null, "disposal_permit_number": null, "safe_disposal_certificate_number": null,
 "waste_stream_rows": [
   {"waste_stream_type": "Cardboard", "waste_stream_code": "R01", "waste_treatment_route": "Recycled", "waste_total_kg": "1 240"},
   {"waste_stream_type": "Plastic film", "waste_stream_code": "R04", "waste_treatment_route": "Recycled", "waste_total_kg": "310"},
   {"waste_stream_type": "General waste", "waste_stream_code": "G10", "waste_treatment_route": "Landfill", "waste_total_kg": "880"}
 ],
 "exceptions": ["No recycled or landfill totals are printed; only the streams and a diversion rate."]}
```
