---
id: municipal_water_bill
appliesTo:
  - water__municipal_water_bill
element: WATER
version: 1
hard: true
classify:
  is: "An account that charges a site for WATER (and often sanitation or sewerage) used in a billing period: a municipal water account, the water lines of a combined municipal account, a water board account, or a landlord's recovery statement for a sub-metered tenant."
  isNot:
    - "an electricity-only account (read by the electricity bill skill)"
    - "the client's own monthly data workbook that lists water per site per month"
    - "a borehole abstraction log or water use licence with no billed consumption"
    - "a water quality test certificate"
  filenameHints: ["water bill", "water account", "water and sanitation"]
  contentSignals: ["Water", "kl", "Kilolitres", "Sewerage", "Sanitation", "Meter No", "Previous Reading", "Current Reading", "Consumption", "Basic charge"]
rowsField: water_period_rows
fields:
  - name: municipality_or_supplier_name
    type: text
    required: true
    labels: ["Issued by", "Supplier", "Municipality"]
    description: "Who issued the account (municipality, water board, or the landlord / utility manager re-billing a tenant). Only a name printed on THIS document; never inferred from the address or account format."
  - name: site_name
    type: text
    required: true
    labels: ["Premises", "Property", "Erf", "Service address", "Stand"]
    description: "The premises the water was used at, as printed."
  - name: utility_account_number
    type: text
    labels: ["Account No", "Account Number", "Acc No", "Customer No"]
    description: "The account (or tenant) number as printed."
  - name: billing_period_start
    type: date
    required: true
    labels: ["Period from", "From", "Reading date previous"]
    description: "First day of the WATER consumption period, as printed. A combined account often reads water on different dates from electricity: take the water lines' own dates."
  - name: billing_period_end
    type: date
    required: true
    labels: ["Period to", "Reading date current"]
    description: "Last day (or current reading date) of the water period, as printed."
  - name: water_kl
    type: number
    required: true
    labels: ["Consumption", "Kilolitres", "kl used", "Water used"]
    description: "The water consumed in this period, as printed, in the unit printed (most accounts print kilolitres). Never sewerage or sanitation volumes, and never a daily average."
  - name: water_unit
    type: text
    labels: []
    description: "The unit printed for the water volume: kl, kL, m3, Ml or litres. Null when no unit is printed."
  - name: water_rand_excl_vat
    type: money
    labels: ["Water charges", "Water consumption charge"]
    description: "The Rand charged for water in this period, as printed (the water section's own total when printed). Sewerage, sanitation and basic charges are left out unless the account's own water total includes them; say so in exceptions."
  - name: water_meter_number
    type: text
    labels: ["Meter No", "Meter Number", "Water meter"]
    description: "The water meter number as printed."
  - name: water_meter_reading_previous
    type: number
    labels: ["Previous Reading", "Old Reading"]
    description: "The previous water meter reading, as printed."
  - name: water_meter_reading_current
    type: number
    labels: ["Current Reading", "New Reading", "Present Reading"]
    description: "The current water meter reading, as printed."
  - name: reading_type
    type: text
    labels: ["Reading type", "Read type"]
    description: "Whether the water reading is actual or estimated, as printed."
  - name: sanitation_kl
    type: number
    labels: ["Sewerage", "Sanitation", "Effluent"]
    description: "A sewerage or sanitation VOLUME, only when printed as a volume. It is usually a percentage of water used and is never added to water."
  - name: borehole_or_alternative_source_kl
    type: number
    labels: ["Borehole", "Rainwater", "Alternative source"]
    description: "Water from a borehole or other non-municipal source, only when this document states a volume for it."
  - name: is_landlord_recovery
    type: bool
    labels: []
    description: "True when the document is a landlord's or utility manager's recovery statement re-billing a tenant from a sub-meter."
  - name: line_site
    type: text
    rowLevel: true
    labels: []
    description: "The site, premises or meter description this line belongs to, as printed."
  - name: line_meter_number
    type: text
    rowLevel: true
    labels: []
    description: "The meter number on this line, when printed."
  - name: line_period_start
    type: date
    rowLevel: true
    labels: []
    description: "The line's period start (or previous reading date), as printed."
  - name: line_period_end
    type: date
    rowLevel: true
    required: true
    labels: []
    description: "The line's period end or reading date, as printed."
  - name: line_water_kl
    type: number
    rowLevel: true
    labels: []
    description: "The water volume on this line, as printed, in the document's unit."
  - name: line_water_rand
    type: money
    rowLevel: true
    labels: []
    description: "The Rand charged for water on this line, as printed."
  - name: line_reading_type
    type: text
    rowLevel: true
    labels: []
    description: "Actual or estimated for this line, when printed."
newFields: [water_unit, water_period_rows, line_site, line_meter_number, line_period_start, line_period_end, line_water_kl, line_water_rand, line_reading_type]
---
## What it is / is not

A water account charges one premises for the water drawn between two meter
readings. For an ESG report the volume, its unit, its period and the premises
matter; the Rand figure is supporting evidence. Water is often billed on the
same combined municipal account as electricity, rates and sewerage, or re-billed
by a landlord from a sub-meter with a history table.

It is NOT an electricity-only account, the client's own monthly data workbook,
a borehole log or water use licence without a billed volume, or a water quality
certificate.

## Where values sit

- The water section lists the meter number, previous and current readings with
  their dates, the reading type, the consumption, the tariff steps (blocks of
  kl at rising rates) and a section total.
- Sewerage or sanitation is a separate section, usually charged as a
  percentage of the water volume or per property; it is not water drawn.
- Document-level fields hold this account's current water period;
  `water_period_rows` holds every site/meter x period line a table prints
  (other meters, and each line of a consumption history including the current
  one).

## Traps

- kL, m3 and litres. Most accounts print kilolitres (a kilolitre is a cubic
  metre, a thousand litres). Some summaries and client systems print litres,
  and a "Total" row may be in litres while the site rows are in kl. Copy each
  figure as printed and put its unit in `water_unit`; never multiply or divide
  by a thousand.
- The water period is its own. On a combined account water may be read weeks
  apart from electricity; never copy the electricity dates into the water
  fields.
- Tariff blocks are not separate consumption. "0-6 kl", "6-15 kl" lines split
  one volume across price steps; consumption is the volume read off the
  meter, not the sum of a block you picked.
- Sewerage and sanitation volumes are never added to water.
- An estimated or averaged reading is still copied, with its reading type.
- A handwritten month on the scan is the client's filing label, not the
  period.
- Never compute a cost per kl or a total across meters.

## Worked example

Invented, the water section of a combined municipal account:

```
RIVERSIDE LOCAL MUNICIPALITY        Account 4100 2233 9   Erf 1187, Depot B
WATER   Meter W7731   Prev 06/05/2025 12 418   Curr 04/06/2025 12 503   Actual   Consumption 85 kl   R 3 412.77
SEWERAGE  70% of water                                                                           R 1 702.10
```

```json
{"municipality_or_supplier_name": "RIVERSIDE LOCAL MUNICIPALITY", "site_name": "Erf 1187, Depot B",
 "utility_account_number": "4100 2233 9", "billing_period_start": "06/05/2025", "billing_period_end": "04/06/2025",
 "water_kl": "85", "water_unit": "kl", "water_rand_excl_vat": "R 3 412.77", "water_meter_number": "W7731",
 "water_meter_reading_previous": "12 418", "water_meter_reading_current": "12 503", "reading_type": "Actual",
 "sanitation_kl": null, "borehole_or_alternative_source_kl": null, "is_landlord_recovery": false,
 "water_period_rows": [
   {"line_site": "Erf 1187, Depot B", "line_meter_number": "W7731", "line_period_start": "06/05/2025", "line_period_end": "04/06/2025", "line_water_kl": "85", "line_water_rand": "3 412.77", "line_reading_type": "Actual"}
 ],
 "exceptions": ["Sewerage is charged as 70% of water; no sewerage volume is printed.", "VAT treatment is not stated."]}
```
