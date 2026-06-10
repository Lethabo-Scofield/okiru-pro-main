# Okiru ESG Intelligence Toolkit — Input Layer

**Layer:** Data Capture · Time-Series Paste Engine · Prior Period · EEA2 Headcount  
**Client:** SG Consumer (SuperGroup SG Consumer Pty Ltd)  
**Period:** FY 2025/26 · Jul-25 to Mar-26 · 9 months YTD  
**Version:** v1.7 · Last updated: June 2026

---

## 1. Input architecture

The toolkit accepts data through four entry mechanisms:

| Mechanism | Where used | Description |
|-----------|-----------|-------------|
| **Excel paste** | Data Import tab | Paste tab-separated ranges from any system. Auto-maps row labels to fields. |
| **Direct cell edit** | Data Import tab — per-field grids | Edit individual monthly cells in-page. Each cell updates `TS` and triggers recalc. |
| **Form inputs** | Each E/S/G sub-page | Scalar fields, dropdowns, and toggles. Update `D` directly on change. |
| **Prior period panel** | Floating button (bottom-right) | Enter prior-year actuals to generate trend arrows across all pages. |

**One rule applies to all mechanisms:** every input change triggers `syncTStoD()` followed by `recalc()`. There is no save button. The state is always live.

---

## 2. Data Import tab — overview

The Data Import tab is the primary bulk-entry surface. It is structured in three sections corresponding to the three ESG pillars. Each section has:

1. A **paste zone** — textarea accepting tab-separated Excel data
2. A **Copy template** button — copies a pre-formatted Excel-ready template to clipboard
3. An **Apply** button — parses the pasted text and maps values to `TS`
4. A **per-field grid** — 9 individual month cells per metric, with a live YTD summary

---

## 3. Paste engine — `parsePaste()`

### Supported input formats

**Format A — rows = metrics, columns = months (standard)**

This is the primary format, matching the Mariette dashboard, Mix Telematics exports, and Cority exports.

```
Metric / Period   Jul-25   Aug-25   Sep-25   Oct-25   Nov-25   Dec-25   Jan-26   Feb-26   Mar-26
Fleet Diesel      79354    68179    65076    73387    67295    57589    48740    63980    65865
Grid Electricity  288639   304665   294858   263388   255634   290165   261691   315713   314826
Water             409      391      381      535      476      500      533      561      570
```

Row labels are fuzzy-matched (case-insensitive, partial). A header row is optional — if the first row contains numbers it is treated as data.

**Format B — rows = months, columns = metrics (transposed)**

Used when your system exports one row per period.

```
Period    Fleet Diesel   Grid Electricity   Water
Jul-25    79354          288639             409
Aug-25    68179          304665             391
...
```

The parser detects Format A vs B automatically: if any data row contains 7 or more numeric values, it assumes Format A (metrics as rows). Otherwise it falls back to Format B using the header row for column mapping.

### Row label fuzzy-matching dictionary

The parser normalises labels to lowercase, strips punctuation, and matches against this dictionary. The first match wins.

| Label contains | Maps to field | Notes |
|----------------|--------------|-------|
| `fleet diesel` / `diesel litres` / `fuel litres` / `total fleet` | `fleet_diesel` | Mariette dashboard row label |
| `generator` / `gen diesel` | `gen_litres` | |
| `lpg` / `forklift` | `lpg_kg` | |
| `petrol` / `business car` | `car_litres` | |
| `electricity` / `elec` / `kwh` / `grid` | `elec_kwh` | |
| `solar` / `pv` / `renewable` | `solar_kwh` | |
| `water` | `water_kl` | Do not use for wastewater rows |
| `waste diversion` / `diversion` | `waste_div` | |
| `cardboard` / `recycling` | `waste_card` | |
| `landfill` | `landfill_co2` | |
| `ev` / `electric vehicle` | `ev_count` | |
| `training` / `train hrs` | `train_hrs` | |
| `grant` / `mandatory grant` | `grant_pct` | |
| `ltifr` / `lost time` | `ltifr` | |
| `fatal` / `fatalities` | `fatalities` | |
| `csi` / `sed` / `social spend` | `csi_pct` | |
| `initiative` / `social calendar` | `initiatives` | |
| `local labour` / `local procurement` | `local_pct` | |
| `supplier h` / `ims` / `ims-t-149` | `sup_hs` | |
| `board black` / `black board` | `board_blk` | |
| `board female` / `female board` | `board_fem` | |
| `king` / `king v` | `king5` | |

### Null and empty value handling

| Input value | Parsed as |
|-------------|-----------|
| Empty cell | `null` (preserves existing value in TS) |
| `-` or `—` | `null` |
| `n/a` | `null` |
| Any number | `parseFloat` after stripping commas |
| Non-numeric text | `null` |

### Partial paste behaviour

If a paste only covers some fields, only those fields are updated. Existing values in all other `TS` positions are preserved. You can paste fleet data one day and electricity data the next without overwriting.

### Post-paste flow

1. Matched fields update `TS` arrays
2. `syncTStoD()` aggregates `TS` → `D`
3. `recalc()` scores all pillars and re-renders the current page
4. Status message shows: `Loaded 5 fields across 9 periods.`

---

## 4. Templates

### Environmental template structure

Paste this into Excel, fill your actuals, then copy the filled range back.

```
Metric / Period     Unit    Jul-25  Aug-25  Sep-25  Oct-25  Nov-25  Dec-25  Jan-26  Feb-26  Mar-26  YTD Total
Fleet Diesel        litres  79354   68179   65076   73387   67295   57589   48740   63980   65865   589465
Grid Electricity    kWh     288639  304665  294858  263388  255634  290165  261691  315713  314826  2589578
Solar Generated     kWh     0       0       0       0       0       0       0       0       0       0
Water Consumption   kL      409     391     381     535     476     500     533     561     570     4356
Generator Diesel    litres  1289    0       0       0       0       295     0       0       597     2181
LPG Forklifts       kg      0       570     190     190     380     570     380     0       0       2280
Business Car Petrol litres  140     142     93      109     144     75      110     98      143     1054
Waste Diversion     %       89      90      91      91      92      90      91      92      91.1    (avg)
Cardboard Recycling %       10.7    16.2    11.1    8.9     26.4    10.7    4.6     13.7    9.6     (avg)
Landfill tCO2e      tCO2e   0.11    0.11    0.13    0.14    0.12    0.13    0.13    0.14    0.15    1.16
EV Vehicles         count   0       0       0       0       0       0       0       0       0       0
```

> The YTD Total column is optional — the parser uses columns 2–10 (the 9 period columns) and ignores any trailing columns.

### Social template structure

```
Metric / Period             Unit    Jul-25  Aug-25  Sep-25  Oct-25  Nov-25  Dec-25  Jan-26  Feb-26  Mar-26
Training Hours / Employee   hrs     0       0       0       0       0       0       0       0       0
Mandatory Grant Recovery    %       0       0       0       0       0       0       0       0       0
LTIFR                       index
Fatalities                  count   0       0       0       0       0       0       0       0       0
CSI % of NPAT               %       0       0       0       0       0       0       0       0       0
Social Initiatives          count   1       0       1       1       1       0       1       0       1
Local Labour Procurement    %       0       0       0       0       0       0       0       0       0
Supplier H&S Compliance     %       60      60      60      60      60      60      60      60      60
```

> LTIFR row should be left blank if hours worked are not yet available. The parser will set these to `null`, leaving prior values intact.

### Governance template structure

```
Metric / Period     Unit    Jul-25  Aug-25  Sep-25  Oct-25  Nov-25  Dec-25  Jan-26  Feb-26  Mar-26
Board Black %       %       42.9    42.9    42.9    42.9    42.9    42.9    42.9    42.9    42.9
Board Female %      %       14.3    14.3    14.3    14.3    14.3    14.3    14.3    14.3    14.3
King V Score        /170    135     135     135     135     135     135     135     135     135
```

---

## 5. Per-field cell edit grid

Each field in the Data Import tab shows a 9-row grid (one input per period). Cells are styled:
- **Blank** = no border emphasis
- **Populated** = green border — value is non-null and non-zero
- **Focused** = blue border

Editing any cell calls:
```js
TS['fleet_diesel'][2] = parseFloat(inputValue) || 0;
syncTStoD();
recalc();
```

The YTD row below each field updates immediately:
- Sum fields: running total of all 9 months
- Average fields: mean of all non-null values

---

## 6. Environmental sub-page inputs

Each Environmental sub-page has a manual entry table in addition to the Data Import tab. These write directly to `D` and trigger `recalc()` without updating `TS`. Use these for quick corrections or scalar fields that are not time-series.

### GHG page (`e-ghg`)

| Field | Input type | Validation |
|-------|-----------|------------|
| Fleet diesel (litres YTD) | Number | ≥ 0 |
| Generator diesel (litres) | Number | ≥ 0 |
| LPG forklifts (kg) | Number | ≥ 0 |
| Business car petrol (litres) | Number | ≥ 0 |
| Grid electricity (kWh YTD) | Number | ≥ 0 |
| Solar PV generated (kWh) | Number | ≥ 0 |
| Water consumption (kL YTD) | Number | ≥ 0 |
| Prior year Scope 1+2 (tCO₂e) | Number | 0 = baseline year |
| SBTi target set | Select: Yes / No | |

### Energy page (`e-energy`)

| Field | Input type | Notes |
|-------|-----------|-------|
| Grid electricity (kWh YTD) | Number | Syncs with GHG page |
| Solar PV generated (kWh) | Number | Syncs with GHG page |
| Energy efficiency YoY confirmed | Select: Yes / No | Manual confirmation |

### Fleet page (`e-fleet`)

| Field | Input type | Notes |
|-------|-----------|-------|
| EV vehicles (count) | Number | Current fleet EVs |
| Total fleet size | Number | Default: 134 confirmed |

### Waste page (`e-waste`)

| Field | Input type | Notes |
|-------|-----------|-------|
| Waste diversion rate (%) | Number | Oricol CPT Mar-26 |
| Cardboard recycling avg (%) | Number | Cority all depots |
| Landfill tCO₂e YTD | Number | Waste contractor data |

### Water page (`e-water`)

| Field | Input type | Notes |
|-------|-----------|-------|
| Water consumption (kL YTD) | Number | All 5 depots |
| Water efficiency initiative | Select: Yes / No | CT dam + DBN mezzanine |

### ISO 14001 page (`e-iso`)

| Field | Input type | Options |
|-------|-----------|---------|
| ISO 14001 status | Select | Not started / In progress / Certified |
| Aspects register maintained | Select: Yes / No | |
| Environmental policy | Select | Not in place / Partial / Board-approved |
| Legal requirements register | Select: Yes / No | |

---

## 7. Social sub-page inputs

### Management Control (`s-mc`)

**EEA2 headcount grid** — the most critical input in the toolkit. Updates `mhc` object directly.

| Band | Rows in grid | Source document |
|------|-------------|-----------------|
| Board | 8 race/gender cells | Board resolutions / statutory register |
| Executive Directors | 8 cells | Employment contracts |
| Other Exec Management | 8 cells | HR system |
| Senior Management | 8 cells + EAP sub-row | HR system — EEA2 report |
| Middle Management | 8 cells + EAP sub-row | HR system — EEA2 report |
| Junior Management | 8 cells + EAP sub-row | HR system — EEA2 report |
| Disabilities | 8 cells | EEA2 section 6 |

Additional controls on this page:

| Control | Effect |
|---------|--------|
| Province dropdown | Changes EAP target for Senior/Middle/Junior bands |
| Year dropdown | Selects 2023 / 2024 / 2025 EAP data |
| Layout dropdown | Separate (default) vs Combined Exco+Senior scoring |

**EEA2 paste — accepted format:**
```
Band                    Af M  Col M  Ind M  Wh M  Af F  Col F  Ind F  Wh F
Board                   2     0      0      2     0     0      0      0
Executive Director      1     0      0      1     0     0      0      0
Other Executive Manager 0     0      0      2     1     0      0      0
Senior Manager          5     1      1      3     2     1      0      1
Middle Manager          12    2      1      5     6     2      1      2
Junior Manager          45    8      3      15    22    7      2      8
Disability              2     0      0      1     1     0      0      0
```

Band label fuzzy-matching:

| Label contains | Maps to band |
|----------------|-------------|
| `board` | `board` |
| `executive director` / `exec director` | `exdir` |
| `other executive` / `other exec` | `otherexec` |
| `senior manager` / `senior management` | `senior` |
| `middle manager` / `middle management` | `middle` |
| `junior manager` / `junior management` | `junior` |
| `disability` / `disabilities` / `pwd` | `pwd` |

### WSP / ATR page (`s-wsp`)

| Field | Input type | Notes |
|-------|-----------|-------|
| Leviable payroll (R) | Number | Coba HR confirmed: R10,331,940.87 |
| NPAT (R) | Number | From management accounts — required for SED |
| WSP submitted | Select: Yes / No | Deadline: 30 April annually |
| ATR submitted | Select: Yes / No | Annual Training Report |
| Training hours per employee | Number | HR system / SETA records |
| Mandatory grant recovered (%) | Number | Target ≥80% |

### Health & Safety page (`s-hs`)

| Field | Input type | Notes |
|-------|-----------|-------|
| LTIFR | Number (step 0.1) | Leave blank if hours not yet known — scores 0, not penalised |
| Fatalities YTD | Number | Any fatality = 8 pts to zero (absolute) |
| Driver fatigue programme | Select: Yes / No | TETA WSP — 77 heavy motor drivers |
| Incident investigation active | Select: Yes / No | Accidently system — all depots |

> **Confirmed LTIs (SHE register, Jul-25 to Apr-26):**  
> Wallace Arends · Ndumiso Mkhize · Joseph Sebeko · Tendani Matumba

LTIFR formula for reference (calculate externally, enter result):
```
LTIFR = (LTIs × 1,000,000) ÷ Hours worked
Target ≤ 2.0
```

### Community / CSI page (`s-csi`)

| Field | Input type | Notes |
|-------|-----------|-------|
| NPAT (R) | Number | Syncs with WSP page |
| CSI as % of NPAT | Number (step 0.1) | Budget R45,000 confirmed |
| Social initiatives YTD | Number | 10 confirmed — see register below |
| Local labour procurement (%) | Number | Target ≥40% |
| Supplier H&S compliance (%) | Number | IMS-T-149 SAQ — 12 key suppliers |

**Confirmed CSI programmes (FY2025/26):**

| Programme | Focus area | Black beneficiary % |
|-----------|-----------|---------------------|
| Mandela Day (Jul-25) | Community | 90–100% |
| Casual Day Stickers (Sep-25) | Disability | 75–90% |
| CHOC Foundation | Childhood cancer | 75–90% |
| SA Guide Dog Association | Visual impairment | 70–85% |
| Friends of Valkenburg Trust | Mental health | 75–90% |
| Blanket Drive (May-26) | Winter relief (in-kind) | 90–100% |
| Wings of Inspiration | Community | 90–100% |
| Gerald Fitzpatrick Donations | SED / enterprise dev | 75–90% |
| Jicama 89 | Children visual impairment | 100% |

---

## 8. Governance sub-page inputs

### Board Composition (`g-board`)

| Field | Input type | Current value | Notes |
|-------|-----------|---------------|-------|
| Total board members | Number | 7 | 2 Exec + 5 Ind NED |
| % Black board members | Number | 42.9% | 3/7 — Chitalu SA-EEA classification pending |
| % Female board members | Number | 14.3% | 1/7 — Pitsi Mnisi |
| Board meetings held YTD | Number | 4 | JSE minimum — confirm from Co Sec |
| Risk Committee active | Select: Yes / No | Yes | Cathrall chairs |
| S&EC active | Select: Yes / No | Yes | CSI/SED Policy §7 |

**Confirmed board as at 27 May 2026:**

| Role | Name | Classification |
|------|------|---------------|
| Chairman (Ind NED) | Chitalu | Zambian — SA-EEA TBC |
| Lead Independent | Cathrall | Risk Committee Chair |
| CEO (Exec) | Peter Mountford | White male |
| CFO / Debt Officer (Exec) | Colin Brown | White male |
| Ind NED | Mehlomakulu | Black |
| Ind NED | Pitsi Mnisi | Black female |
| Ind NED | Phalane | Black |
| Company Secretary | John Mackay | — |

### King V page (`g-kingv`)

| Field | Input type | Current value | Notes |
|-------|-----------|---------------|-------|
| King V A&E score (/170) | Number | 135 | 79.4% — Adequate |
| S&EC established (P5) | Select: Yes / No | Yes | Group S&EC confirmed |
| ESG-linked remuneration (P6) | Select: Yes / No | No | **Critical gap** |

**King V principle statuses (FY2025/26):**

| # | Principle | Current status | Evidence |
|---|-----------|---------------|----------|
| 1 | Ethical leadership | Applied | Code of Ethics Rev 2 · Be Heard hotline |
| 2 | Corporate citizenship | Applied | CSI/SED Policy · three-pronged approach |
| 3 | Board composition | Explained | Skills matrix not in supplied policies |
| 4 | Board roles | Explained | Board charter not in supplied policies |
| 5 | Committees | Partially Applied | S&EC confirmed · Remco ToR outstanding |
| 6 | Remuneration — ESG KPIs | Explained | **ESG KPIs not yet in exec contracts** |
| 7 | Stakeholder engagement | Applied | CSI/SED Policy §15 |
| 8 | Integrated reporting | Applied | CSI/SED Policy §15(b)(v) confirms IAR |
| 9 | Technology governance | Applied | Code of Ethics §6 · POPIA consent Jan-26 |
| 10 | Risk governance | Partially Applied | Code §11 risk approach · formal ERM TBC |
| 11 | Internal audit | Partially Applied | IA active · combined assurance TBC |
| 12 | Legal compliance | Applied | Code §3-4 · multi-statute framework |
| 13 | Strategy — six capitals | Explained | Not explicit in supplied policies |
| 14 | Performance KPIs | Explained | ESG KPIs in board pack outstanding |
| 15 | Disclosure | Applied | CSI/SED Policy §15(b)(v) |
| 16 | Non-financial outcomes | Partially Applied | ESG data via this toolkit |
| 17 | SA-specific | Applied | Companies Act compliance confirmed |

### IFRS S1/S2 page (`g-ifrs`)

Each of the 11 disclosure requirements is scored via a three-option dropdown:

| Option | Points awarded | Guidance |
|--------|---------------|----------|
| Not disclosed | 0.0 | No evidence of disclosure |
| Partially disclosed | 0.5 | Mentioned or referenced but incomplete |
| Fully disclosed | 1.0 | Meets ISSB minimum disclosure standard |

**Current disclosure status (FY2025/26):**

| Requirement | Pillar | Status | Evidence |
|-------------|--------|--------|----------|
| Board oversight of climate risks | Governance | Partial | Code of Ethics §11 |
| Management role in climate risk | Governance | Not disclosed | Exec owner not yet assigned |
| Climate risks to business model | Strategy | Partial | Code §11 risk references |
| Climate opportunities | Strategy | Partial | Solar, EV mentioned |
| Scenario analysis (1.5°C/2°C/4°C) | Strategy | Not disclosed | Not commissioned |
| Risk identification process | Risk Mgmt | Partial | Code §11 framework |
| Climate risk in ERM | Risk Mgmt | Partial | Code §11 partial |
| GHG reduction targets | Metrics | Partial | SBTi commitment pending |
| Transition plan | Metrics | Not disclosed | Net-zero pathway not formalised |
| Physical climate risks — board agenda | Governance S2 | Not disclosed | Not formally on board agenda |
| Transition climate risks — board agenda | Governance S2 | Not disclosed | Not formally on board agenda |

### GARP / ERM page (`g-garp`)

| Field | Input type | Current value | Notes |
|-------|-----------|---------------|-------|
| Climate physical risk in ERM | Select: Yes / No | Yes | DBN floods 2022, extreme heat |
| Climate transition risk in ERM | Select: Yes / No | Yes | Carbon tax, EV mandate |
| Operational risk (fleet) in ERM | Select: Yes / No | Yes | Driver fatigue, accidents |
| Regulatory risk (EE Act) | Select: Yes / No | Yes | EE Policy + Committees |
| Regulatory risk (POPIA) | Select: Yes / No | Yes | IO outstanding |
| S&EC established | Select: Yes / No | Yes | CSI/SED Policy §7 |
| Material risks identified (count) | Number | 12 | Target ≥10 |

### Ethics & Compliance page (`g-ethics`)

| Field | Input type | Current value | Notes |
|-------|-----------|---------------|-------|
| Code of ethics in place | Select: Yes / No | Yes | Super Group Code Rev 2, Jan 2023 |
| Be Heard hotline active | Select: Yes / No | Yes | 0800-007-117 · 24/365 anonymous |
| POPIA Information Officer | Select | Partial | s55 registration — consent active, letter outstanding |
| Legal compliance register | Select | Partial | Code §11 — quarterly update required |
| External ESG assurance | Select: Yes / No | No | **5 pts gap — Engage ISAE 3000 provider** |
| Integrated Report published | Select: Yes / No | Yes | JSE-listed — Group level IAR |
| No material regulatory penalties | Select: Yes / No | Yes | Confirmed |

**POPIA options:** Not appointed / Partial — consent active / Formally appointed with letter  
**Risk register options:** Not in place / Partial evidence / Maintained quarterly

---

## 9. Carbon Credits input

### Add credit form fields

| Field | Input type | Required | Notes |
|-------|-----------|----------|-------|
| Date | Date | Yes | Month of purchase — YYYY-MM-DD |
| Standard | Select | Yes | VCS (Verra) / Gold Standard / ACR / CAR / Social Carbon / ISO 14064 |
| Type | Select | Yes | REDD+ / Renewable Energy / Energy Efficiency / Blue Carbon / Soil Carbon / Direct Air Capture |
| Volume (tCO₂e) | Number | Yes | Tonnes CO₂ equivalent |
| Cost (ZAR) | Number | No | Total purchase price |
| Registry / Serial no. | Text | No | e.g. VCS-3456-2025 or GS-2025-0012 |
| Project name | Text | No | e.g. Amazon Forest Protection BR-001 |
| Status | Select | Yes | Verified / Pending verification / Anticipated |

**Status definitions:**

| Status | Counted in net GHG? | Notes |
|--------|--------------------|----|
| Verified | Yes | Confirmed by registry — offsets Scope 1+2+3 |
| Pending | No | Awaiting registry confirmation |
| Anticipated | No | Pre-purchase planning — not yet procured |

### Retire credit

Retiring a credit moves it from the active portfolio to the retired register and stamps a `retiredDate`. Retirement is the formal act of cancellation in the registry. Only verified credits can be retired.

### Pre-loaded credits (FY2025/26)

| Date | Standard | Type | Volume | Cost | Status |
|------|----------|------|--------|------|--------|
| 2025-09-15 | VCS | REDD+ | 500 tCO₂e | R45,000 | Verified |
| 2026-01-20 | Gold Standard | Renewable Energy | 200 tCO₂e | R24,000 | Pending |

---

## 10. Prior period panel

The floating **⟲ Prior period** button (bottom-right) opens a panel for entering last year's actuals. These values populate the `T` object and drive the ↑↓ trend arrows shown on every indicator table across all pages.

| Field | Pre-seeded value | Notes |
|-------|-----------------|-------|
| Waste diversion (%) | 88.0 | Prior year CPT average |
| Cardboard recycling (%) | 11.2 | Prior year average |
| Landfill tCO₂e | 1.28 | Prior year total |
| Fatalities | 0 | Prior year confirmed zero |
| Social initiatives | 9 | Prior year count |
| Board Black (%) | 42.9 | Unchanged |
| Board Female (%) | 14.3 | Unchanged |
| King V (/170) | 130 | Prior year score |
| All others | blank | Enter when prior-year report is finalised |

Fields left blank produce a `—` in the trend column rather than an incorrect arrow.

---

## 11. Outstanding data requirements

The following inputs are currently missing and affect scoring materially:

| Field | Blocked score | Owner | Urgency |
|-------|--------------|-------|---------|
| EEA2 headcount (all bands) | 17 S pts + B-BBEE MC element | HR / Coba | **Critical** |
| Hours worked YTD | LTIFR calculation | SHE register | **Critical** |
| NPAT from management accounts | SED scoring (5 pts) | Finance | **High** |
| WSP submission | 5 pts | Skills development team | **High** (30 April deadline) |
| ATR submission | 5 pts | Skills development team | **High** |
| Solar kWh (JHB actual monthly figures) | 8 pts | Graeme Barand / Facilities | **High** |
| Fleet km + litres per vehicle | Fleet L/100km (8 pts) | Fleet Register / Mix Telematics | Medium |
| Prior year Scope 1+2 (tCO₂e) | YoY reduction (10 pts) | Finance / prior ESG report | Medium |
| Training hours per employee | 5 pts | HR / SETA records | Medium |
| Local labour procurement % | 5 pts | Procurement team | Medium |

---

## 12. Data sources reference

| Data type | System / source | Contact | Format for paste |
|-----------|----------------|---------|-----------------|
| Fleet fuel (diesel) | Mariette dashboard / I-CAM | Fleet team | Monthly summary — Format A |
| Grid electricity | Utility bills (Eskom / municipal) | Facilities | Monthly kWh per depot |
| Solar generation | Mix Telematics / inverter monitoring | Graeme Barand | Monthly kWh |
| Water consumption | Utility bills (municipal) | Facilities | Monthly kL per depot |
| Waste diversion | Oricol monthly report (CPT) | Waste contractor | Monthly % |
| Cardboard recycling | Cority system | EHS manager | Monthly % |
| LTIFR | SHE register / Accidently | SHE manager | Calculate externally, enter result |
| Training hours | HR system / SETA records | HR / Skills dev | Hours per employee |
| Grant recovery | SETA portal | Skills dev team | % of mandatory grant |
| CSI spend | Finance / CSI register | Finance | R amount → convert to % of NPAT |
| Board composition | Statutory register | Company Secretary | Manual entry |
| King V score | IoDSA assessment / board evaluation | Governance advisor | Manual entry |

---

## 13. Paste validation and error handling

| Scenario | Behaviour |
|----------|-----------|
| No recognisable row labels | Status: `No fields matched. Check row labels.` — TS unchanged |
| Partial match (some rows recognised) | Only matched rows updated. Status: `Loaded 3 fields across 9 periods.` |
| Fewer than 9 period values in a row | Remaining positions left as-is (null or prior value) |
| Non-numeric values in data cells | Treated as null — existing value preserved |
| Paste with header row present | Header row excluded from data rows automatically |
| Paste without header row | All rows treated as data — first row matched against label dictionary |
| Extra columns (e.g. totals) | Parser reads columns 2–10 for Format A, ignores trailing columns |
| Comma-formatted numbers (1,234) | Commas stripped before parseFloat |
