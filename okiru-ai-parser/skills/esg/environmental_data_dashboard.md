---
id: environmental_data_dashboard
newType:
  name: "Client environmental data dashboard"
  aliases: ["Monthly environmental dashboard", "Environmental data tracker", "ESG data dashboard", "Sustainability data workbook"]
element: GHG_ENERGY
version: 1
hard: true
classify:
  is: "The client's own workbook of monthly environmental figures per site: a dashboard or tracker with sites or depots down the side and months across (fuel, distance, electricity, water, gas, waste, tonnage), usually with a summary tab and one tab per measure."
  isNot:
    - "a utility bill, fuel statement or waste report (the evidence behind the figures)"
    - "a GHG or carbon accounting system export (read by the emissions system export skill)"
    - "a fleet register or a depot diesel reconciliation"
    - "a customer's sustainability survey"
  filenameHints: ["dashboard", "environmental tracker", "esg tracker", "environmental data"]
  contentSignals: ["Jul", "Aug", "Sep", "Total", "Depot", "Diesel", "Litres", "Km", "kWh", "Water", "Electricity", "Tonnage"]
rowsField: esg_monthly_rows
fields:
  - name: dashboard_title
    type: text
    labels: ["Dashboard", "Title"]
    description: "The workbook's or tab's title as printed (often names the business unit and financial year)."
  - name: reporting_period_start
    type: date
    required: true
    labels: ["Financial year", "Period from", "Year"]
    description: "First month of the year the dashboard covers, as printed (a header month or a financial-year label)."
  - name: reporting_period_end
    type: date
    labels: ["Period to"]
    description: "Last month the dashboard covers, as printed (the last column heading of the year)."
  - name: monthly_measure
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "What the figure measures, as the block or row labels it (\"Fleet diesel\", \"Electricity\", \"Water\", \"Generator\", \"Tonnage\"). A mislabelled block is copied as labelled and flagged."
  - name: monthly_site
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The site or depot the row belongs to, as printed. Never \"Total\": a total row is not a site."
  - name: monthly_period_end
    type: date
    required: true
    rowLevel: true
    labels: []
    description: "The month the column belongs to, as its heading prints it (\"Jul-25\", \"2025-07-31\", a serial)."
  - name: monthly_value
    type: number
    required: true
    rowLevel: true
    labels: []
    description: "The figure in the cell, as printed. A future month's 0 or blank is not a figure: leave that cell out and say which months are not yet reported."
  - name: monthly_unit
    type: text
    rowLevel: true
    labels: []
    description: "The unit printed for the block or row (L, LT, kL, kWh, kg, t, km, R). Null when none is printed; never assumed."
newFields: [dashboard_title]
---
## What it is / is not

Many clients keep their own monthly environmental figures in a workbook: one
block or tab per measure (fleet diesel, kilometres, fuel cost, generator
diesel, business-car petrol, LPG, electricity, water, waste, tonnage moved),
sites down the side, months across, a total row and a total column, and a
summary tab that pulls the totals together. It is the client's compilation,
not evidence: its figures should trace back to bills, fuel records and waste
reports. It is usually read cell by cell by the code; this skill tells a model
reading it how not to be misled.

It is NOT a bill, statement or contractor report, a carbon accounting system
export, a fleet register, a depot reconciliation or a customer survey.

## Where values sit

- Each block: a measure label and unit in its heading, site rows, month
  columns (the financial year, often July to June), a total row and a total
  column.
- One row of `esg_monthly_rows` is one site, one month, one measure: the
  cell's value with the block's measure and unit.
- Cell comments and notes beside a block often say a month was estimated or
  copied from the previous month; those notes go in exceptions.
- A summary tab repeats the totals, sometimes in another unit.

## Traps

- Totals are not sites, and a wrong total is not fixed. Never copy a total row
  or total column into the rows. When a total does not add up, skips a site,
  holds a stray single digit where thousands belong, or is labelled
  with a unit it cannot be (a tCO2e row holding litres or kWh), copy it as
  printed into exceptions and say what is wrong; never replace it with your
  own sum.
- Units change between blocks and between the site rows and the totals:
  water rows in kL and the total in litres ("LT"), waste "kg" that holds
  something else. Copy each block's printed unit; never convert.
- Months not yet reported print 0 or "-". They are not consumption: leave them
  out and name the months in exceptions.
- A repeated identical value across months, or a month several times the
  run-rate, is copied as printed; flag it, never smooth it.
- A block whose label does not match its content (a generator column headed
  with a gas type) is copied with its printed label and flagged.
- A tab dated a different year from the dashboard (a waste tab one year
  behind) is a stale copy: flag it, do not read it as this year.
- Activity figures (tonnage, cases, kilometres) are copied like any other
  measure; they are not emissions.

## Worked example

Invented, one block of a dashboard (months after March not yet reported):

```
ELECTRICITY (kWh)   Jul-25    Aug-25    ...  Mar-26    Apr-26  May-26  Jun-26   TOTAL
Depot A             41 220    39 870         44 015    0       0       0        7
Depot B             18 400    18 400         18 400    0       0       0        55 200
```

```json
{"dashboard_title": null, "reporting_period_start": "Jul-25", "reporting_period_end": "Jun-26",
 "esg_monthly_rows": [
   {"monthly_measure": "ELECTRICITY", "monthly_site": "Depot A", "monthly_period_end": "Jul-25", "monthly_value": "41 220", "monthly_unit": "kWh"},
   {"monthly_measure": "ELECTRICITY", "monthly_site": "Depot A", "monthly_period_end": "Aug-25", "monthly_value": "39 870", "monthly_unit": "kWh"},
   {"monthly_measure": "ELECTRICITY", "monthly_site": "Depot A", "monthly_period_end": "Mar-26", "monthly_value": "44 015", "monthly_unit": "kWh"},
   {"monthly_measure": "ELECTRICITY", "monthly_site": "Depot B", "monthly_period_end": "Jul-25", "monthly_value": "18 400", "monthly_unit": "kWh"}
 ],
 "exceptions": ["Depot A's TOTAL cell holds 7, not a total; copied as printed here, not used.", "Apr-26 to Jun-26 print 0: not yet reported.", "Depot B prints the same 18 400 every month."]}
```
