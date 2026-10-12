---
id: data_source_inventory
newType:
  name: "ESG data source inventory"
  aliases: ["Data source list", "Data origin register", "Data collection matrix", "Data inventory"]
element: OTHER
version: 1
hard: false
classify:
  is: "A short list, usually two columns and no figures, of where the client's ESG figures come from: each activity group (linehaul fuel, standby power, company cars, electricity, water, waste) as a heading, the measures kept for it under it (consumption, distance, weight, cost) and the source of each (a spreadsheet capture, supplier invoices, a contractor statement, a system). It holds no data itself; it says where the data comes from."
  isNot:
    - "the data itself (a monthly data workbook, a bill, a fuel report)"
    - "a GHG emissions system export"
    - "an e-mail asking for data"
  filenameHints: ["data source", "data inventory", "data collection", "source info"]
  contentSignals: ["Data source", "Source", "Consumption", "Distance", "Cost", "Bills", "Manual", "Input", "Reports from", "Activity"]
rowsField: data_source_rows
fields:
  - name: inventory_title
    type: text
    scope: document
    labels: ["Title", "Data source"]
    description: "The list's own heading, as printed."
  - name: source_indicator
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The activity group the line belongs to, as printed (\"LINEHAUL FUEL\", \"ELECTRICITY\"): the heading the measure sits under."
  - name: source_measure
    type: text
    rowLevel: true
    labels: []
    description: "The measure kept for it, as printed (\"VOLUME (L)\", \"KILOMETRES\", \"SPEND\")."
  - name: source_system
    type: text
    rowLevel: true
    labels: []
    description: "Where the measure comes from, as printed (\"SPREADSHEET CAPTURE\", \"SUPPLIER INVOICES\"). Null when the list names no source for it."
newFields: [inventory_title, data_source_rows, source_indicator, source_measure, source_system]
---
## What it is / is not

A short list a client keeps of where its ESG data comes from: for each activity group, the
measures it records and where each one comes from. It shows how the numbers
are gathered (manual sheets, bills, contractor reports, a system), which is
what an assurance reviewer asks first.

It is NOT the data itself: no consumption, distance or cost figures are in it.
It is not an emissions system export or an e-mail asking for data.

## Where values sit

- An activity heading on its own line ("LINEHAUL FUEL", "STANDBY POWER"),
  followed by its measures one per line.
- The source in the column beside a measure. A measure with no source beside
  it has none stated.

## Traps

- One row per measure, under the activity heading above it. A heading
  with no measures under it is still one row with a null measure.
- Copy the words as printed, spelling mistakes included.
- A source printed once beside the first measure is that measure's only;
  never copy it down to the measures below it.

## Worked example

Invented:

```
WHERE OUR DATA COMES FROM
FLEET FUEL
CONSUMPTION (L)      | FUEL CARD STATEMENTS
KILOMETRES
ELECTRICITY
CONSUMPTION          | MUNICIPAL ACCOUNTS
```

```json
{"inventory_title": "WHERE OUR DATA COMES FROM",
 "data_source_rows": [
   {"source_indicator": "FLEET FUEL", "source_measure": "CONSUMPTION (L)", "source_system": "FUEL CARD STATEMENTS"},
   {"source_indicator": "FLEET FUEL", "source_measure": "KILOMETRES", "source_system": null},
   {"source_indicator": "ELECTRICITY", "source_measure": "CONSUMPTION", "source_system": "MUNICIPAL ACCOUNTS"}
 ],
 "exceptions": []}
```
