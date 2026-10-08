---
id: municipal_electricity_bill
appliesTo:
  - ghg_energy__municipal_electricity_bill
element: GHG_ENERGY
version: 1
hard: true
classify:
  is: "An account that charges a site for ELECTRICITY used in a billing period: a municipal or Eskom account, a combined municipal account (rates, electricity, water, sewerage), or a landlord's or utility manager's recovery statement that re-bills a sub-metered tenant."
  isNot:
    - "a solar or PV inverter generation report (kWh produced, not bought)"
    - "a water-only account (read by the water bill skill)"
    - "the client's own monthly data workbook that lists kWh per site per month"
    - "a fuel, LPG or diesel invoice"
    - "a prepaid electricity token slip with no consumption period"
  filenameHints: ["electricity bill", "municipal account", "eskom", "utility statement", "tenant recovery"]
  contentSignals: ["kWh", "Consumption", "Meter No", "Previous Reading", "Current Reading", "Actual", "Estimated", "Tariff", "Demand", "kVA", "Service Charge", "Tenant recovery", "Sub-meter"]
rowsField: electricity_period_rows
fields:
  - name: municipality_or_supplier_name
    type: text
    required: true
    labels: ["Issued by", "Supplier", "Municipality"]
    description: "Who issued the account: the municipality, Eskom, or the landlord / utility management company that re-bills the tenant. Only a name printed on THIS document (letterhead, logo text, footer). Never inferred from the account-number format, the city in an address or a handwritten note."
  - name: site_name
    type: text
    required: true
    labels: ["Premises", "Property", "Erf", "Service address", "Stand"]
    description: "The premises the electricity was used at, as printed (an address, erf, unit or warehouse name)."
  - name: utility_account_number
    type: text
    labels: ["Account No", "Account Number", "Acc No", "Customer No"]
    description: "The account (or tenant) number as printed, spaces and dashes kept."
  - name: billing_period_start
    type: date
    required: true
    labels: ["Period from", "From", "Reading date previous", "Billing period"]
    description: "First day of the consumption period this account charges for, as printed. Not the statement date and not the month someone wrote on the file."
  - name: billing_period_end
    type: date
    required: true
    labels: ["Period to", "Reading date current"]
    description: "Last day (or current reading date) of the consumption period, as printed."
  - name: electricity_kwh
    type: number
    required: true
    labels: ["Consumption", "Units consumed", "kWh used", "Units"]
    description: "The electricity consumed in THIS billing period, as printed. A daily average, a demand figure (kVA) or a units-exported credit is not consumption. When several meters are billed and no all-meter total is printed, leave this null and list each meter in the rows."
  - name: electricity_unit
    type: text
    labels: []
    description: "The unit printed beside the consumption figure (kWh, MWh, units). Null when none is printed."
  - name: electricity_rand_excl_vat
    type: money
    labels: ["Electricity charges", "Energy charge", "Consumption charge"]
    description: "The Rand charged for electricity in this period, as printed. Copy the electricity section's own total when the account prints one; say in exceptions whether VAT, service or network charges are included, only when the account says so."
  - name: electricity_tariff_rand_per_kwh
    type: number
    labels: ["Tariff rate", "c/kWh", "R/kWh"]
    description: "A per-kWh rate only when the account prints one, with its unit (cents or Rand) noted in exceptions. Never divide the charge by the kWh."
  - name: meter_number
    type: text
    labels: ["Meter No", "Meter Number", "Meter"]
    description: "The electricity meter number as printed (often letters and digits)."
  - name: meter_reading_previous
    type: number
    labels: ["Previous Reading", "Old Reading"]
    description: "The previous meter reading, as printed."
  - name: meter_reading_current
    type: number
    labels: ["Current Reading", "New Reading", "Present Reading"]
    description: "The current meter reading, as printed."
  - name: reading_type
    type: text
    labels: ["Reading type", "Read type"]
    description: "Whether the reading is actual, estimated, interim or average, as printed (\"Actual\", \"Est\", \"E\")."
  - name: max_demand_kva
    type: number
    labels: ["Demand", "Maximum demand", "kVA", "NMD"]
    description: "The maximum demand in kVA, when printed. Notified maximum demand (NMD) is a contracted limit; copy it only when no measured demand is printed and say which it is."
  - name: is_landlord_recovery
    type: bool
    labels: []
    description: "True when the document is a landlord's or utility manager's recovery or reconciliation statement re-billing a tenant from a sub-meter; false when it is the municipality's or Eskom's own account. Null when it cannot be told."
  - name: solar_kwh_exported_to_grid
    type: number
    labels: ["Generation offset", "Export", "Units exported", "SSEG credit"]
    description: "kWh the site EXPORTED to the grid and was credited for (a generation offset or SSEG credit line), as printed. Never put it in a generated or consumed field: the account does not show how much the panels produced."
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
  - name: line_electricity_kwh
    type: number
    rowLevel: true
    labels: []
    description: "The kWh on this line, as printed."
  - name: line_electricity_rand
    type: money
    rowLevel: true
    labels: []
    description: "The Rand charged on this line, as printed."
  - name: line_reading_type
    type: text
    rowLevel: true
    labels: []
    description: "Actual or estimated for this line, when printed."
newFields: [electricity_unit, electricity_period_rows, line_site, line_meter_number, line_period_start, line_period_end, line_electricity_kwh, line_electricity_rand, line_reading_type]
---
## What it is / is not

An electricity account charges one premises (or several meters on one
account) for the electricity used between two meter readings. The figures that
matter for an ESG report are the kWh consumed, the period the kWh belong to,
the premises, whether the reading was actual or estimated, and who issued the
account. A Rand figure is supporting evidence; the kWh are the Scope 2 input.

Three shapes reach you:

1. A municipal or Eskom account: letterhead, account number, an electricity
   section with meter readings, kWh, tariff lines and a section total.
2. A combined municipal account: rates, electricity, water, sewerage and other
   services on the same pages. Read only the electricity lines here; the water
   lines belong to the water bill skill.
3. A landlord's or utility manager's recovery statement ("tenant recovery",
   "sub-meter recovery", "for record purposes only"): it re-bills a
   tenant from a sub-meter, often with a 12-month history table. Its
   "municipal" columns may all be zero. It is still the evidence of the
   tenant's electricity; set `is_landlord_recovery` true.

It is NOT a solar generation report, a water-only account, the client's own
monthly data workbook, or a fuel invoice.

## Where values sit

- The electricity section lists, per meter: meter number, previous and
  current readings with their dates, the reading type, consumption (kWh), the
  tariff lines and a section total. The billing period is the pair of reading
  dates, or a printed "period from / to".
- Document-level fields hold THIS account's current period. When the account
  bills one meter, that meter's figures go there.
- `electricity_period_rows` holds every site/meter x period line the document
  prints in a table: each meter of a multi-meter account, and every line of a
  consumption history (including the current period's line). Copy the table
  row by row.
- A recovery statement's history table has one line per reading date, newest
  first or oldest first. Each line is a reading cycle, not a calendar month:
  copy each line's own date.
- Scans are often rotated or cut: page 2 of 3 without the letterhead page is
  common. Read what is on the pages you have.

## Traps

- The billing period is not the month on the file. Accounts are read on
  cycles of 27 to 40 days; a bill a person filed as "July" may cover late May
  to late June. Copy the printed period. A handwritten note ("Depot A June")
  is the client's filing label: put it in exceptions, never in a date field.
- The issuer must be printed on THIS document. When the letterhead page is
  missing, `municipality_or_supplier_name` is null, even when the city in the
  address or the account-number format suggests a municipality.
- A generation offset, export credit or SSEG line is electricity the site SENT
  to the grid. It goes in `solar_kwh_exported_to_grid` only. It is never
  consumption, and never "solar generated".
- A daily average ("avg kWh/day"), a demand figure (kVA) and a meter reading
  are not consumption. Consumption is the kWh charged for the period.
- Estimated readings are still consumption: copy them with `reading_type`
  "Estimated". A later account may reverse an estimate; copy any reversal line
  as printed, with its sign.
- A recovery statement's zero "municipal" columns do not mean zero
  electricity; the recovered columns hold the tenant's figures.
- Never compute a tariff, a total across meters, or a year from a history
  table. The code adds lines up and labels the result derived.
- Units: some large accounts bill in MWh. Copy the figure and put the printed
  unit in `electricity_unit`; never multiply.
- Rates, refuse, sewerage, improvement-district levies and the service or
  basic charge are not electricity: leave them out of
  `electricity_rand_excl_vat` unless the account's own electricity total
  includes them, and say so.

## Worked example

Invented, a recovery statement for one warehouse with a short history (the
current period is the newest line):

```
TENANT UTILITY RECOVERY - FOR RECORD PURPOSES ONLY        Example Estates Services
Tenant: Acme Logistics (Pty) Ltd   Premises: Unit 4, Depot A   Tenant No: 00412
Period 01/02/2026 - 28/02/2026
Electricity  Units 18 420.5  Amount R 66 912.40      Municipal 0.00
History   Date        kWh        Amount
          28/02/2026  18 420.5   66 912.40
          31/01/2026  19 004.0   68 990.15
```

```json
{"municipality_or_supplier_name": "Example Estates Services", "site_name": "Unit 4, Depot A",
 "utility_account_number": "00412", "billing_period_start": "01/02/2026", "billing_period_end": "28/02/2026",
 "electricity_kwh": "18 420.5", "electricity_unit": null, "electricity_rand_excl_vat": "R 66 912.40",
 "electricity_tariff_rand_per_kwh": null, "meter_number": null, "meter_reading_previous": null,
 "meter_reading_current": null, "reading_type": null, "max_demand_kva": null, "is_landlord_recovery": true,
 "solar_kwh_exported_to_grid": null,
 "electricity_period_rows": [
   {"line_site": "Unit 4, Depot A", "line_meter_number": null, "line_period_start": null, "line_period_end": "28/02/2026", "line_electricity_kwh": "18 420.5", "line_electricity_rand": "66 912.40", "line_reading_type": null},
   {"line_site": "Unit 4, Depot A", "line_meter_number": null, "line_period_start": null, "line_period_end": "31/01/2026", "line_electricity_kwh": "19 004.0", "line_electricity_rand": "68 990.15", "line_reading_type": null}
 ],
 "exceptions": ["Landlord recovery statement; municipal columns are 0.00.", "No unit is printed beside the units figure.", "VAT treatment of the amount is not stated."]}
```
