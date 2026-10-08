---
id: emissions_system_export
newType:
  name: "Emissions inventory system export"
  aliases: ["GHG inventory export", "Carbon accounting system export", "GHG data export", "Carbon footprint calculator export"]
element: GHG_ENERGY
version: 1
hard: true
classify:
  is: "An export from the client's own greenhouse gas or carbon accounting software: activity data (kWh, litres, km, kg) and calculated emissions by category, site and month, with the report's run date, organisation node, date range and calculation settings."
  isNot:
    - "an external assurance or GHG verification statement (an independent opinion)"
    - "the client's own monthly data workbook (read by the dashboard skill)"
    - "a carbon tax return"
    - "a utility bill or fuel statement"
  filenameHints: ["ghg inventory", "carbon footprint", "emissions report", "emissions export", "carbon accounting"]
  contentSignals: ["Emissions", "tCO2e", "Scope", "Category", "Location-based", "Market-based", "Date Range", "Node", "Activity", "Purchased electricity", "Road transport", "Stationary"]
rowsField: esg_monthly_rows
fields:
  - name: report_title
    type: text
    labels: ["Report", "Report name"]
    description: "The export's report name as printed."
  - name: report_run_date
    type: date
    labels: ["Date run", "Run date", "Generated on"]
    description: "When the export was run, as printed."
  - name: organisation_node
    type: text
    required: true
    labels: ["View", "Node", "Organisation", "Reporting entity"]
    description: "The organisation unit or node the export is for, as printed."
  - name: reporting_period_start
    type: date
    labels: ["Date range from", "Date range"]
    description: "Start of the export's date range, as printed."
  - name: reporting_period_end
    type: date
    labels: ["Date range to"]
    description: "End of the export's date range, as printed (it may run past the last month with data)."
  - name: scope2_method
    type: text
    labels: ["Scope 2 methodology", "Scope 2 method"]
    description: "Location-based or market-based, as printed."
  - name: monthly_measure
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The category and quantity, as printed (\"Purchased electricity - consumption\", \"Road transport emissions\")."
  - name: monthly_site
    type: text
    rowLevel: true
    labels: []
    description: "The site or node the row belongs to, as printed."
  - name: monthly_period_end
    type: date
    rowLevel: true
    labels: []
    description: "The month (or period) the figure belongs to, as printed."
  - name: monthly_value
    type: number
    required: true
    rowLevel: true
    labels: []
    description: "The figure, as printed. An emissions figure is copied as printed, never calculated or converted."
  - name: monthly_unit
    type: text
    rowLevel: true
    labels: []
    description: "The unit printed for the figure (kWh, L, km, t, tCO2e). Null when the export prints none: never assumed, even for an emissions table."
newFields: [report_run_date, organisation_node, scope2_method]
---
## What it is / is not

Carbon accounting software holds the client's activity data and applies
emission factors to it. Its exports list, per category (grid electricity,
road transport, stationary fuel, business travel, waste, water), per site and
per month, the activity quantities and the calculated emissions, with the
settings used (location- or market-based Scope 2, modelled data included or
not). It is the client's own calculation, not an independent verification.

It is NOT an assurance or verification statement, the client's monthly data
workbook, a carbon tax return, or a bill or statement.

## Where values sit

- A header block: report name, run date, view or node, date range, Scope 2
  method, settings.
- Tables per category: sites down the side, months across, or one row per
  site, month and category, with activity and emission columns.
- Category totals and a grand total.

## Traps

- No printed unit, no unit. Emissions tables often print figures without
  "tCO2e"; copy the figure as printed with a null unit and say so. Never assume
  tonnes, kilograms or tCO2e.
- Activity units vary by category: water may be in litres, waste in tonnes,
  fuel in litres, distance in km. Copy each as printed; never convert.
- The date range is not the data. A range to the end of the financial year
  with figures only to an earlier month means the later months are not yet
  reported, not zero.
- "N/A" rows (a source that does not apply to a site) are not zero: copy "N/A"
  as printed in exceptions and leave the row out.
- Rounded figures are copied as rounded; never replace them with a more
  precise figure from another document.
- A column that multiplies unrelated figures (distance times a site's total
  tonnage) is copied as printed only when asked and flagged as not meaningful.
- An empty organisation node in the tree is not a site.
- This is the client's own system: it is never a verified or assured figure,
  and it never sets carbon tax or a scope split by itself. Copy the
  categories as printed; the code decides the scope.

## Worked example

Invented, an export header and one category table:

```
Emissions Summary Export    Date run: 2026-04-08    View: Example Logistics > Region North
Date Range: 2025-07-01 to 2026-06-30    Scope 2: Location-based
Purchased electricity - consumption        Jul-25     Aug-25
  Depot G                                22 410     21 980
Purchased electricity - emissions          Jul-25     Aug-25
  Depot G                                 21.29      20.88
```

```json
{"report_title": "Emissions Summary Export", "report_run_date": "2026-04-08", "organisation_node": "Example Logistics > Region North",
 "reporting_period_start": "2025-07-01", "reporting_period_end": "2026-06-30", "scope2_method": "Location-based",
 "esg_monthly_rows": [
   {"monthly_measure": "Purchased electricity - consumption", "monthly_site": "Depot G", "monthly_period_end": "Jul-25", "monthly_value": "22 410", "monthly_unit": null},
   {"monthly_measure": "Purchased electricity - consumption", "monthly_site": "Depot G", "monthly_period_end": "Aug-25", "monthly_value": "21 980", "monthly_unit": null},
   {"monthly_measure": "Purchased electricity - emissions", "monthly_site": "Depot G", "monthly_period_end": "Jul-25", "monthly_value": "21.29", "monthly_unit": null},
   {"monthly_measure": "Purchased electricity - emissions", "monthly_site": "Depot G", "monthly_period_end": "Aug-25", "monthly_value": "20.88", "monthly_unit": null}
 ],
 "exceptions": ["No units are printed for either table.", "The date range runs to 2026-06-30; data stops at Aug-25."]}
```
