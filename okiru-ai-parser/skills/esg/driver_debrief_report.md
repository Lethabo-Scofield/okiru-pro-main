---
id: driver_debrief_report
appliesTo:
  - fleet__telematics_driver_debrief_report
element: FLEET
version: 1
hard: true
classify:
  is: "A route-level or driver-level operations export for a period: a driver debrief summary (routes, planned and actual stops, kilometres, cases, weight), or a telematics report (distance, driving and idling hours, harsh braking, speeding and fatigue events) per driver, vehicle or route."
  isNot:
    - "a fleet vehicle register (one row per unit, no trips)"
    - "a fuel card statement or fuel log (litres per fill)"
    - "a safety incident register"
    - "the client's monthly data workbook"
  filenameHints: ["driver debrief", "debrief summary", "telematics report", "route summary", "driver scorecard"]
  contentSignals: ["Route", "Driver", "Planned stops", "Actual stops", "Plan km", "Actual km", "Cases", "Weight", "Harsh braking", "Speeding", "Idling", "Fatigue"]
rowsField: fleet_debrief_rows
fields:
  - name: report_date
    type: date
    labels: ["Run date", "Report run", "Printed on", "Generated"]
    description: "The date the export or report was run or printed, as printed. Not the reporting period."
  - name: reporting_period_start
    type: date
    required: true
    labels: ["Period from", "Date from"]
    description: "First day of the period the report covers, as printed in the document (title, filter line or header). Never from the file name; when only the file name carries it, null and say so."
  - name: reporting_period_end
    type: date
    labels: ["Period to", "Date to"]
    description: "Last day of the period, as printed in the document."
  - name: planned_stops
    type: count
    labels: ["Total plan stops", "Planned stops total"]
    description: "The grand total of planned stops a summary prints, only from the summary for the report's full period. Never add the rows."
  - name: actual_stops
    type: count
    labels: ["Total actual stops", "Actual stops total"]
    description: "The grand total of actual stops a summary prints, from the same summary. Never add the rows."
  - name: total_distance_km
    type: number
    labels: ["Total km", "Total distance", "Total plan km"]
    description: "A total distance the summary prints, with whether it is planned or actual kilometres noted in exceptions. Never added up."
  - name: total_fatigue_events_count
    type: count
    labels: ["Total fatigue events", "Fatigue alerts"]
    description: "A printed total of fatigue events only. Null when the report has no fatigue data: never zero."
  - name: report_date
    type: date
    required: true
    rowLevel: true
    labels: []
    description: "The date of the route or trip on this row, as printed."
  - name: depot_name
    type: text
    rowLevel: true
    labels: []
    description: "The depot code or name on the row, as printed."
  - name: driver_name
    type: text
    rowLevel: true
    labels: []
    description: "The driver as printed (name or employee code)."
  - name: vehicle_registration
    type: text
    rowLevel: true
    labels: []
    description: "The vehicle on the row, as printed."
  - name: route_name
    type: text
    rowLevel: true
    labels: []
    description: "The route code or name, as printed."
  - name: planned_stops
    type: count
    rowLevel: true
    labels: []
    description: "Planned stops on this route, as printed."
  - name: actual_stops
    type: count
    rowLevel: true
    labels: []
    description: "Actual stops on this route, as printed."
  - name: customer_hit_percent
    type: percent
    rowLevel: true
    labels: []
    description: "A hit or completion percentage only when the row prints one. Never computed from stops."
  - name: distance_km
    type: number
    rowLevel: true
    labels: []
    description: "Kilometres on the row, as printed; say in exceptions whether the column is planned or actual."
  - name: driving_hours
    type: number
    rowLevel: true
    labels: []
    description: "Driving hours on the row, when printed."
  - name: idling_hours
    type: number
    rowLevel: true
    labels: []
    description: "Idling hours on the row, when printed."
  - name: harsh_events_count
    type: count
    rowLevel: true
    labels: []
    description: "Harsh braking or acceleration events on the row, when printed. Null (never 0) when the report has no such column."
  - name: speeding_events_count
    type: count
    rowLevel: true
    labels: []
    description: "Speeding events on the row, when printed. Null when the report has no such column."
  - name: fatigue_events_count
    type: count
    rowLevel: true
    labels: []
    description: "Fatigue events on the row, when printed. Null when the report has no such column."
---
## What it is / is not

Two kinds of operations export reach this skill. A debrief summary is the
distribution operation's own record of each route: planned and actual stops,
kilometres, cases and weight, usually with pivot summaries by depot or month.
A telematics report is the tracking provider's record per driver or vehicle:
distance, driving and idling hours, and safety events (harsh braking,
speeding, fatigue). Both feed fleet efficiency and driver-safety indicators;
neither records fuel.

It is NOT a vehicle register, a fuel statement, an incident register or the
client's monthly data workbook.

## Where values sit

- Summary sheets: grand totals of routes, planned and actual stops, planned
  km, cases and weight, sometimes per depot. A workbook may hold more than one
  summary (for different months or filters).
- Detail sheets: one row per stop or per route, thousands of rows. Stop-level
  detail is read by the code; copy route rows only from a route summary table.
- Telematics reports: one row per driver or vehicle with distance, hours and
  event counts, and a totals row.

## Traps

- Two summaries in one file are two different answers. Copy the grand totals
  of the summary that covers the report's whole period, and name any other
  summary (another month, a filtered view) in exceptions. Never mix their
  figures.
- No telematics columns means no telematics data. A debrief export without
  harsh-braking, speeding, fatigue, idling or driving-hours columns gives null
  for all of them, never zero.
- Planned kilometres are not actual kilometres. Copy each from its own
  column, and say which one a total is.
- Never add rows, never compute a hit rate, km per stop or any total.
- The report's run date is not its period, and the file name's period is not
  printed evidence.
- Weight and volume columns may print no unit: copy the figure and leave the
  unit to exceptions.
- Depot codes differ between systems ("DEP-CT" here, "DEPCPT" in the fleet
  list); copy them as printed, never normalise.

## Worked example

Invented, a debrief workbook's route summary:

```
ROUTE SUMMARY - 01/07/2025 to 30/06/2026          Run 05-Jul-2026 08:12
Depot    Routes   Plan stops   Actual stops   Plan km
DEP-A    410      1 805        1 640          58 220.5
DEP-B    388      1 714        1 655          61 004.0
Grand Total  798  3 519        3 295          119 224.5
```

```json
{"report_date": "05-Jul-2026", "reporting_period_start": "01/07/2025", "reporting_period_end": "30/06/2026",
 "planned_stops": 3519, "actual_stops": 3295, "total_distance_km": "119 224.5", "total_fatigue_events_count": null,
 "fleet_debrief_rows": [
   {"report_date": null, "depot_name": "DEP-A", "planned_stops": 1805, "actual_stops": 1640, "distance_km": "58 220.5"},
   {"report_date": null, "depot_name": "DEP-B", "planned_stops": 1714, "actual_stops": 1655, "distance_km": "61 004.0"}
 ],
 "exceptions": ["Distances are planned km.", "No telematics columns (harsh braking, speeding, fatigue, idling, driving hours) are in the export.", "Rows are depot totals; route detail is on the detail sheet."]}
```
