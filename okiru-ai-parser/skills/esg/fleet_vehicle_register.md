---
id: fleet_vehicle_register
appliesTo:
  - fleet__vehicle_register
element: FLEET
version: 1
hard: false
classify:
  is: "A list of the vehicles (and trailers) a business operates: a fleet list or vehicle asset register with one row per unit, often with a summary pivot of units per depot or type, a sold-vehicles tab and a new-vehicles tab."
  isNot:
    - "a fuel card statement or vehicle fuel log (fills, litres per fill)"
    - "a telematics or driver debrief report (routes, stops, events)"
    - "a maintenance or service schedule with no fleet list"
    - "the client's monthly data workbook"
  filenameHints: ["fleet list", "vehicle register", "asset register", "vehicle schedule"]
  contentSignals: ["Registration", "Fleet no", "Make", "Model", "GVM", "Tare", "Trailer", "Horse", "Depot", "Licence expiry", "Vehicle type", "Grand Total"]
rowsField: fleet_vehicle_rows
fields:
  - name: register_as_at_date
    type: date
    required: true
    labels: ["As at", "Updated", "Fleet list as of"]
    description: "The date (or month) the register states it is current at, as printed in its title or header."
  - name: fleet_total_vehicles
    type: count
    labels: ["Total vehicles", "Fleet size"]
    description: "A total number of vehicles only when the register prints one (a summary or pivot grand total), and only from the current summary. Never count the rows yourself; the code counts them."
  - name: fleet_ev_count
    type: count
    labels: ["Electric vehicles", "EV count"]
    description: "A printed count of electric vehicles only. Never counted by you; the code counts rows marked electric."
  - name: fleet_trailer_count
    type: count
    labels: ["Trailers", "Total trailers"]
    description: "A printed count of trailers only. Never counted by you."
  - name: vehicle_registration
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The unit's registration (licence plate) as printed; a fleet number when no registration is printed, said so in exceptions."
  - name: depot_name
    type: text
    rowLevel: true
    labels: []
    description: "The depot, branch or cost centre the unit is allocated to, as printed (codes kept as printed)."
  - name: vehicle_make_model
    type: text
    rowLevel: true
    labels: []
    description: "Make and model as printed."
  - name: vehicle_category
    type: text
    rowLevel: true
    labels: []
    description: "The register's own type or category for the unit (rigid, truck-tractor, trailer, panel van, bakkie, forklift), as printed."
  - name: fuel_type
    type: text
    rowLevel: true
    labels: []
    description: "Fuel type only when the register prints it. Never inferred from the make or model."
  - name: is_electric_vehicle
    type: bool
    rowLevel: true
    labels: []
    description: "True only when the register states the unit is electric (fuel type electric, \"EV\", \"no tank\" with an electric note); null otherwise."
  - name: gvm_kg
    type: number
    rowLevel: true
    labels: []
    description: "Gross vehicle mass, as printed, in the printed unit."
  - name: tare_kg
    type: number
    rowLevel: true
    labels: []
    description: "Tare mass, as printed."
  - name: payload_kg
    type: number
    rowLevel: true
    labels: []
    description: "Payload, as printed."
  - name: fuel_tank_capacity_litres
    type: number
    rowLevel: true
    labels: []
    description: "Fuel tank capacity, as printed."
  - name: telematics_provider
    type: text
    rowLevel: true
    labels: []
    description: "The tracking or telematics provider fitted, as printed."
  - name: licence_expiry_date
    type: date
    rowLevel: true
    labels: []
    description: "The licence disc expiry date, as printed."
  - name: service_status
    type: text
    rowLevel: true
    labels: []
    description: "The unit's status as printed (active, sold, new, in workshop). A unit on a sold tab is \"Sold\"."
dropFields: [monthly_km, monthly_litres, l_per_100km_actual, l_per_100km_norm, monthly_tco2e]
---
## What it is / is not

A fleet register lists every unit the business runs: trucks, truck-tractors,
trailers, vans, cars, sometimes forklifts, with registration, make, model,
masses, depot and licence expiry. A summary pivot often counts units per
depot and type with a grand total. Tabs for sold units and new deliveries are
common, and older lists are often kept on hidden tabs.

It is the denominator for fleet indicators (the fleet's size and its share of
electric vehicles), not a fuel record: litres, kilometres and emissions come
from fuel and trip records.

It is NOT a fuel statement or log, a debrief report, a service schedule, or the
client's monthly data workbook.

## Where values sit

- The main list: one row per unit. Its title or header carries the as-at date.
- The current summary pivot: units per depot and type, with a grand total.
  Only a summary for the register's own date is current.
- A sold tab lists units that left the fleet; a new-vehicles tab lists
  additions. Copy their rows with the status the tab gives them.

## Traps

- Never count. Fleet size, EV count and trailer count are copied only when
  printed; the code counts the rows by category and status.
- Trailers are units without an engine. Copy them as rows with their category;
  whether they count as vehicles is decided in code.
- An electric vehicle is one the register says is electric. Never infer
  electric (or diesel) from a make or a model name.
- Old lists are not the fleet. A hidden tab, a pivot dated an earlier month,
  or a list "as of" an earlier year is stale: name it in exceptions and do not
  copy its totals as current.
- Kilometres or fuel columns on a register tab are not this register's job;
  an empty fuel column is null, and a kilometre figure is never litres.
- Impossible dates ("31/11", "2025/06/31") are copied as printed and flagged.
- An instruction note in a header ("check the red ones") is not data.

## Worked example

Invented, a register with a current summary:

```
FLEET LIST AS AT 28/02/2026
Reg          Depot   Make/Model          Type         GVM     Licence exp   Fuel
AB 12 CD GP  DEP-A   Example 1528        Rigid        15 500  30/06/2026    Diesel
EF 34 GH GP  DEP-B   Example eVan        Panel van     3 500  31/03/2026    Electric
TR 56 JK GP  DEP-A   Example tri-axle    Trailer      34 000  31/05/2026
Summary 28/02/2026: DEP-A 1  DEP-B 1   Grand Total 2 (excl. trailers)
```

```json
{"register_as_at_date": "28/02/2026", "fleet_total_vehicles": 2, "fleet_ev_count": null, "fleet_trailer_count": null,
 "fleet_vehicle_rows": [
   {"vehicle_registration": "AB 12 CD GP", "depot_name": "DEP-A", "vehicle_make_model": "Example 1528", "vehicle_category": "Rigid", "fuel_type": "Diesel", "is_electric_vehicle": false, "gvm_kg": "15 500", "licence_expiry_date": "30/06/2026"},
   {"vehicle_registration": "EF 34 GH GP", "depot_name": "DEP-B", "vehicle_make_model": "Example eVan", "vehicle_category": "Panel van", "fuel_type": "Electric", "is_electric_vehicle": true, "gvm_kg": "3 500", "licence_expiry_date": "31/03/2026"},
   {"vehicle_registration": "TR 56 JK GP", "depot_name": "DEP-A", "vehicle_make_model": "Example tri-axle", "vehicle_category": "Trailer", "fuel_type": null, "is_electric_vehicle": null, "gvm_kg": "34 000", "licence_expiry_date": "31/05/2026"}
 ],
 "exceptions": ["The grand total excludes trailers, as printed."]}
```
