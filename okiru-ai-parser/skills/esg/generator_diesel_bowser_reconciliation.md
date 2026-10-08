---
id: generator_diesel_bowser_reconciliation
appliesTo:
  - ghg_energy__generator_diesel_bowser_reconciliation
element: GHG_ENERGY
version: 1
hard: true
classify:
  is: "A site's own diesel stock record for a period: a bulk tank or bowser reconciliation (opening dip, deliveries, issues, closing dip, variance), a depot diesel control pack's reconciliation and daily summary sheets, or a standby generator's fuel and run-hours log."
  isNot:
    - "a fuel card statement or a per-vehicle fuel log (fills at the pump or from the bowser, per vehicle; read by the fleet fuel skill)"
    - "a fleet vehicle register"
    - "an LPG or gas cylinder invoice"
    - "the client's monthly data workbook that totals diesel per depot per month"
  filenameHints: ["bowser", "diesel report", "diesel control", "tank reconciliation", "generator log"]
  contentSignals: ["Opening stock", "Closing stock", "Deliveries", "Dip", "Bowser", "Meter reading", "Issued", "Variance", "Theoretical stock", "Generator", "Run hours", "Delivery note"]
fields:
  - name: site_name
    type: text
    required: true
    labels: ["Depot", "Branch", "Site name"]
    description: "The depot or site whose tank this is, as printed (a depot name or code)."
  - name: reporting_period_start
    type: date
    required: true
    labels: ["Period from", "Month start"]
    description: "First day of the period the reconciliation covers, as printed. When only a month is printed (\"March 2026\"), copy the month as printed here and leave the end null."
  - name: reporting_period_end
    type: date
    labels: ["Period to", "Month end"]
    description: "Last day of the period, as printed."
  - name: opening_stock_litres
    type: number
    labels: ["Opening stock", "Opening dip", "Opening balance"]
    description: "Litres in the tank at the start of the period, as printed (the dip or book figure the sheet labels opening)."
  - name: deliveries_litres
    type: number
    labels: ["Deliveries", "Received", "Litres delivered"]
    description: "Litres delivered into the tank in the period, as printed on the reconciliation's own total line. Not the sum of delivery notes you add up."
  - name: closing_stock_litres
    type: number
    labels: ["Closing stock", "Closing dip", "Last dip"]
    description: "Litres in the tank at the end of the period, as printed."
  - name: issued_total_litres
    type: number
    labels: ["Total issued", "Issues", "Litres issued"]
    description: "All litres issued from the tank in the period, as printed (to own vehicles, external vehicles, generators and equipment together)."
  - name: issued_to_fleet_litres
    type: number
    labels: ["Issued to fleet", "Own vehicles", "Internal fuel"]
    description: "Litres issued from the tank into the depot's own vehicles, as printed."
  - name: issued_to_external_litres
    type: number
    labels: ["External vehicles", "Issued to external", "To be invoiced"]
    description: "Litres issued from the tank into vehicles that are not the depot's own fleet (another depot's or a third party's), as printed. Never generator diesel."
  - name: generator_diesel_litres
    type: number
    labels: ["Generator", "Standby generator", "Genset"]
    description: "Litres issued to a stationary generator, only from a line or sheet that names a generator. Zero when the generator line prints 0."
  - name: generator_run_hours
    type: number
    labels: ["Run hours", "Hours run", "Hour meter"]
    description: "The generator's run hours for the period, as printed."
  - name: stock_variance_litres
    type: number
    labels: ["Variance", "Stock variance", "Gain / loss"]
    description: "The variance the reconciliation itself prints (book against dip), with its sign. Never computed."
  - name: fuel_supplier_name
    type: text
    labels: ["Supplier", "Fuel supplier", "Delivered by"]
    description: "The company that delivered the bulk diesel, as printed."
  - name: delivery_note_numbers
    type: text
    labels: ["Delivery note", "DN number", "Delivery note no"]
    description: "Every delivery note number printed for the period, as written, separated by semicolons."
newFields: [issued_to_external_litres, stock_variance_litres]
---
## What it is / is not

A depot that keeps its own diesel tank (a bowser) reconciles it every month:
opening stock, plus deliveries, less issues, gives the theoretical closing
stock, which is compared with the closing dip. Issues go to the depot's own
trucks, to vehicles from elsewhere, and sometimes to a standby generator or
equipment. A depot diesel control pack carries this on a reconciliation sheet
with a daily summary, per-vehicle sheets, an external-issues sheet and a
generator sheet.

For an ESG report the split matters most: diesel into vehicles is road fuel,
diesel into a generator is stationary fuel, and diesel into someone else's
vehicle is not this depot's fleet consumption at all. You copy each line as
the document labels it; the code decides what each one counts as.

It is NOT a fuel card statement or a per-vehicle fuel log (read by the fleet
fuel skill), a vehicle register, an LPG invoice, or the client's monthly data
workbook.

## Where values sit

- The reconciliation sheet: opening dip, deliveries (with delivery note and
  order numbers and the supplier), meter readings open and close, issues by
  destination, theoretical stock, closing dip, variance, and often a price per
  litre and a Rand value.
- The daily summary: one row per day or per vehicle with litres issued; its
  totals row is the month's issues.
- The generator sheet or line: litres into the generator and run hours. A
  sheet titled "Generator" with 0 printed means 0 litres to the generator.
- The external-issues sheet: fills into vehicles that are not the depot's own,
  with registrations and odometer readings.

## Traps

- "External" means two different things. External FUEL is diesel the depot's
  own trucks bought outside at a filling station (not from the bowser); it is
  read by the fleet fuel skill. External VEHICLES are other vehicles filled
  from this bowser; their litres go to `issued_to_external_litres`. Neither is
  generator diesel.
- Generator diesel comes only from a line or sheet that names a generator or
  standby set. Never move external or unallocated issues into it, even when
  another document (a dashboard, a system export) labels them generator fuel:
  copy what THIS document says and note the difference in exceptions.
- Copy the reconciliation's own totals. Never add the daily rows, never
  compute the theoretical stock or the variance, never multiply litres by the
  price.
- Dip and meter readings are different measurements; copy each in its own
  place and do not choose between them.
- A sheet linked to another workbook shows cached values; a cell showing
  `#REF!` or `#DIV/0!` (idle vehicles divide by zero kilometres) holds no
  value.
- Hidden per-vehicle sheets with no activity this month are not issues.
- "To be invoiced" means the issue will be charged to someone; it does not
  say whose vehicle it was. Copy the registration in exceptions when the
  document shows it.

## Worked example

Invented, a depot reconciliation sheet:

```
DEPOT C - DIESEL RECONCILIATION - APRIL 2026
Opening dip 8 120   Deliveries 24 000 (DN 55120, DN 55188; Example Fuels)   Meter open 401 220  close 425 410
Issued: own fleet 23 650   external vehicles 540   generator 0   Total issued 24 190
Theoretical stock 7 930   Closing dip 7 905   Variance -25
```

```json
{"site_name": "DEPOT C", "reporting_period_start": "APRIL 2026", "reporting_period_end": null,
 "opening_stock_litres": "8 120", "deliveries_litres": "24 000", "closing_stock_litres": "7 905",
 "issued_total_litres": "24 190", "issued_to_fleet_litres": "23 650", "issued_to_external_litres": "540",
 "generator_diesel_litres": "0", "generator_run_hours": null, "stock_variance_litres": "-25",
 "fuel_supplier_name": "Example Fuels", "delivery_note_numbers": "55120; 55188",
 "exceptions": ["Only the month is printed.", "Theoretical stock 7 930 is printed; closing dip 7 905."]}
```
