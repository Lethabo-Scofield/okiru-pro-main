---
id: fleet_fuel_statement
appliesTo:
  - fleet__fuel_card_statement
element: FLEET
version: 1
hard: true
classify:
  is: "A record of fuel put into vehicles, fill by fill: a fuel card statement or transaction listing, a fleet manager's fuel consumption report, one vehicle's own fuel log (one sheet per vehicle), or a list of fills from a depot tank into named vehicles."
  isNot:
    - "a bulk tank or bowser reconciliation (opening and closing stock; read by the bowser skill)"
    - "a fleet vehicle register with no fills"
    - "a telematics or driver debrief report (routes and stops)"
    - "the client's monthly data workbook that totals litres per depot per month"
  filenameHints: ["fuel card", "fuel statement", "fuel transactions", "fuel log", "fuel consumption report", "fuel issues"]
  contentSignals: ["Litres", "Fuel card", "Odometer", "Registration", "Fill", "Transaction date", "Pump", "Diesel", "Petrol", "L/100km", "Internal fuel", "External fuel"]
rowsField: fleet_fuel_transaction_rows
fields:
  - name: fuel_card_provider
    type: text
    labels: ["Card provider", "Issued by", "Fleet card"]
    description: "The fuel card or fleet management company that issued the statement, as printed. Null for an internal log."
  - name: account_number
    type: text
    labels: ["Account No", "Account Number"]
    description: "The fleet account number as printed."
  - name: statement_period_start
    type: date
    required: true
    labels: ["Period from", "Statement from"]
    description: "First day of the period the statement or log covers, as printed. Not the date of its first fill."
  - name: statement_period_end
    type: date
    labels: ["Period to", "Statement to"]
    description: "Last day of the period, as printed."
  - name: depot_name
    type: text
    labels: ["Depot", "Branch", "Cost centre"]
    description: "The depot or cost centre the statement or log belongs to, as printed."
  - name: total_litres_period
    type: number
    labels: ["Total litres", "Litres total"]
    description: "The period's total litres, only when the document prints a total line. Never the sum of the rows you add up."
  - name: total_fuel_rand_excl_vat
    type: money
    labels: ["Total amount", "Total value", "Total cost"]
    description: "The period's total Rand, only when printed; say in exceptions whether it includes VAT when the document says so."
  - name: transaction_date
    type: date
    required: true
    rowLevel: true
    labels: []
    description: "The date of the fill, as printed."
  - name: vehicle_registration
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The registration of the vehicle filled, as printed. On a one-vehicle log the registration is in the sheet's title or tab; copy it into every row."
  - name: fuel_type
    type: text
    rowLevel: true
    labels: []
    description: "Diesel, petrol, LPG or AdBlue, as printed. Null when not printed; never inferred from the vehicle."
  - name: fuel_litres
    type: number
    rowLevel: true
    labels: []
    description: "Litres filled on this row, as printed."
  - name: fuel_rand_excl_vat
    type: money
    rowLevel: true
    labels: []
    description: "The Rand amount of this fill, as printed."
  - name: odometer_reading
    type: number
    rowLevel: true
    labels: []
    description: "The odometer reading at the fill, as printed. Not kilometres travelled."
  - name: transaction_site
    type: text
    rowLevel: true
    labels: []
    description: "Where the fill happened: the filling station, or the depot tank (\"internal\", \"bowser\"), as printed."
  - name: fill_source
    type: text
    rowLevel: true
    labels: []
    description: "Whether the row is an internal fill from the depot's own tank or an external purchase, as the document labels it (\"Internal fuel\", \"External fuel\")."
newFields: [fill_source]
---
## What it is / is not

Every litre a fleet burns enters a vehicle at a fill. A fuel card statement
lists those fills by card and vehicle with litres, Rand, odometer and the
station; a depot's own log lists fills from its tank; a vehicle's fuel log
sheet (one tab per truck) lists that truck's fills with odometer readings and
often its kilometres and L/100km. These rows are the road-fuel evidence.

It is NOT a bulk tank reconciliation, a vehicle register, a debrief report, or
the client's monthly data workbook.

## Where values sit

- Statement header: provider, account, period, depot or cost centre.
- One row per fill: date, registration (or card number), product, litres,
  price, amount, odometer, station.
- A one-vehicle log names the vehicle once, in its tab or title; its rows
  carry only dates, odometer, litres and sometimes a source column (internal
  or external fuel). Every row belongs to that vehicle.
- Totals rows ("Total", "Month total") sit at the foot; they are
  document-level, never rows.

## Traps

- Internal versus external. A fill from the depot's own tank ("internal
  fuel", "bowser") and a fill bought at a filling station ("external fuel")
  are both this vehicle's road fuel, but they come from different records:
  copy each with its `fill_source` so the code does not count a tank issue
  twice (once in the tank reconciliation, once here).
- An external-issue list from a depot tank (fills into vehicles that are not
  the depot's own) is still a list of fills: copy each fill. Whose vehicle it
  is, and whether it is charged on, is not decided here.
- Odometer readings are not kilometres; kilometres travelled and L/100km are
  computed by the code from consecutive readings. When the log prints its own
  km or L/100km columns, they are the log's figures; never compute them.
- Copy totals only from a printed total line. Never add the rows.
- A row with litres but no date continues the fill above it; a row with
  neither is not a fill.
- Product codes: diesel 50ppm and 500ppm are both diesel; AdBlue is not fuel.
  Copy the product as printed.
- Credit or reversal lines (negative litres or amounts) are copied with their
  sign.

## Worked example

Invented, one vehicle's fuel log sheet:

```
Sheet "AB 12 CD GP"   Vehicle fuel log   Depot C   April 2026
Date        Odo      Internal fuel   External fuel   Cost
03/04/2026  412 880  310.5
11/04/2026  414 102                  180.0           R 4 212.00
```

```json
{"fuel_card_provider": null, "account_number": null, "statement_period_start": "April 2026",
 "statement_period_end": null, "depot_name": "Depot C", "total_litres_period": null, "total_fuel_rand_excl_vat": null,
 "fleet_fuel_transaction_rows": [
   {"transaction_date": "03/04/2026", "vehicle_registration": "AB 12 CD GP", "fuel_type": null, "fuel_litres": "310.5", "fuel_rand_excl_vat": null, "odometer_reading": "412 880", "transaction_site": "depot tank", "fill_source": "Internal fuel"},
   {"transaction_date": "11/04/2026", "vehicle_registration": "AB 12 CD GP", "fuel_type": null, "fuel_litres": "180.0", "fuel_rand_excl_vat": "R 4 212.00", "odometer_reading": "414 102", "transaction_site": null, "fill_source": "External fuel"}
 ],
 "exceptions": ["The registration is the sheet name; the rows do not repeat it.", "No total line is printed."]}
```
