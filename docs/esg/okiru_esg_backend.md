# Okiru ESG Intelligence Toolkit — Back End

**Layer:** Scoring Engine · Data Models · Calculation Logic · Reference Data  
**Client:** SG Consumer (SuperGroup SG Consumer Pty Ltd)  
**Period:** FY 2025/26 · Jul-25 to Mar-26 · 9 months YTD  
**Version:** v1.7 · Last updated: June 2026

---

## 1. Architecture overview

The toolkit is a single-file, client-side application. There is no server. All logic runs in the browser. The back end is the JavaScript layer responsible for:

1. Holding the authoritative data state (`D` scalar object + `TS` time-series arrays + `CR` carbon credits register)
2. Calculating scores for all three ESG pillars and every sub-indicator
3. Calculating GHG emissions using documented emission factors
4. Calculating carbon tax liability and net GHG position
5. Syncing time-series period data into the scoring state on every change
6. Exposing a recalc trigger that re-renders the entire UI from the updated state

There is intentionally no database, no API, and no authentication layer. The methodology and all data live inside the workbook. When the engagement ends, SG Consumer's finance team owns the file.

---

## 2. Emission factors

All emission factors are hard-coded constants. Source: DEFRA 2024 (Scope 1), Eskom NERSA 2024 (Scope 2), GHG Protocol (Scope 3).

```js
const EF = {
  diesel:  2.68,    // kgCO₂e per litre  — DEFRA 2024 mobile combustion
  petrol:  2.31,    // kgCO₂e per litre  — DEFRA 2024 mobile combustion
  lpg:     1.51,    // kgCO₂e per kg     — DEFRA 2024 LPG
  elec:    0.82,    // kgCO₂e per kWh    — Eskom NERSA 2024 location-based
  solar:   0.025,   // kgCO₂e per kWh    — Solar PV life-cycle
  water:   0.000344 // tCO₂e per kL      — GHG Protocol Scope 3 water
};
```

---

## 3. Scoring stance thresholds

The toolkit supports three scoring stances. Each stance defines the minimum proportional achievement below which no partial credit is awarded.

| Stance   | Floor | Use case |
|----------|-------|----------|
| Lean     | 30%   | Early-stage / aspirational baseline |
| Standard | 50%   | Normal annual reporting |
| Strict   | 70%   | Audit-grade / verification year |

```js
const FL = { lean: 0.30, standard: 0.50, strict: 0.70 };
let stance = 'standard'; // mutable — set by user via UI toggle
```

**Pro-rata scoring function:**
```js
function pr(actual, target, maxPoints) {
  if (!target || actual === null) return 0;
  const ratio = actual / target;
  if (ratio >= 1) return maxPoints;                            // target met — full points
  if (ratio >= FL[stance]) return Math.round(ratio * maxPoints * 100) / 100; // partial
  return 0;                                                    // below floor — no points
}
```

**Inverse pro-rata** (lower is better — used for LTIFR):
```js
function prI(actual, target, maxPoints) {
  if (actual === null) return 0;
  if (actual <= target) return maxPoints;
  return Math.max(0, Math.round((2 - actual / target) * maxPoints * 100) / 100);
}
```

**Binary scoring** (Yes/Partial/No):
```js
function bn(value, maxPoints) {
  if (value === true || value === 'yes') return maxPoints;
  if (value === 'partial')              return maxPoints * 0.5;
  return 0;
}
```

---

## 4. Main scalar data object — `D`

`D` is the authoritative single source of truth for all scoring inputs. It is populated from two sources: direct UI field edits, and `syncTStoD()` aggregation from the `TS` time-series arrays.

### Environmental fields

| Field | Type | Default | Source | Notes |
|-------|------|---------|--------|-------|
| `fleet_diesel` | number | 589,465.53 | TS sum | YTD litres — all 5 depots |
| `gen_litres` | number | 2,181.14 | TS sum | BLOEM + DBN generators |
| `lpg_kg` | number | 2,280 | TS sum | DBN warehouse forklifts |
| `car_litres` | number | 1,053.82 | TS sum | ISANDO — business car |
| `elec_kwh` | number | 2,589,578.44 | TS sum | Grid electricity — all depots |
| `solar_kwh` | number | 0 | TS sum | Solar PV — JHB + DBN EDGE |
| `water_kl` | number | 4,356.41 | TS sum | Municipal — all depots |
| `waste_div` | number | 91.1 | TS avg | Waste diversion % (Oricol CPT) |
| `waste_card` | number | 12.4 | TS avg | Cardboard recycling % (Cority) |
| `landfill_co2` | number | 1.16 | TS sum | Landfill tCO₂e |
| `iso14001` | string | `'in_progress'` | UI | `'not_started'` / `'in_progress'` / `'certified'` |
| `aspects` | bool | false | UI | Environmental aspects register |
| `env_policy` | string | `'partial'` | UI | `'no'` / `'partial'` / `'yes'` |
| `legal_reg` | bool | false | UI | NEMA/NWA/NEMWA legal register |
| `sbti` | bool | true | UI | SBTi net-zero target set |
| `prior_s12` | number | 0 | UI | Prior year Scope 1+2 tCO₂e (0 = baseline year) |
| `ev_count` | number | 0 | TS last | EV vehicles — current month |
| `fleet_total` | number | 134 | UI | Total fleet size |
| `energy_yoy` | bool | false | UI | Energy efficiency improvement confirmed |
| `water_init` | bool | false | UI | Water efficiency initiative active |

### Social fields

| Field | Type | Default | Source | Notes |
|-------|------|---------|--------|-------|
| `payroll` | number | 10,331,940.87 | UI | Leviable payroll (R) — SDL Act |
| `npat` | number | 0 | UI | Net profit after tax (R) — required for SED |
| `wsp` | bool | false | UI | WSP submitted to SETA |
| `atr` | bool | false | UI | ATR submitted to SETA |
| `train_hrs` | number | 0 | TS avg | Training hours per employee |
| `grant_pct` | number | 0 | TS avg | Mandatory grant recovery % |
| `ltifr` | number\|null | null | TS last non-null | Lost Time Injury Frequency Rate |
| `fatalities` | number | 0 | TS sum | Fatalities YTD |
| `fatigue` | bool | true | UI | Driver fatigue programme active |
| `incidents` | bool | true | UI | Incident investigation logging active |
| `csi_pct` | number | 0 | TS avg | CSI/SED as % of NPAT |
| `initiatives` | number | 10 | TS sum | Social calendar initiatives (count) |
| `local_pct` | number | 0 | TS avg | Local labour procurement % |
| `sup_hs` | number | 0 | TS avg | Supplier H&S compliance % (IMS-T-149) |

### Governance fields

| Field | Type | Default | Source | Notes |
|-------|------|---------|--------|-------|
| `board_total` | number | 7 | UI | Total board members |
| `board_blk` | number | 42.9 | TS avg | % Black board members |
| `board_fem` | number | 14.3 | TS avg | % Female board members |
| `sec_active` | bool | true | UI | Social & Ethics Committee active |
| `esg_rem` | bool | false | UI | ESG-linked executive remuneration |
| `king5` | number | 135 | TS avg | King V Apply & Explain score (/170) |
| `ifrs_board` | string | `'partial'` | UI | Board oversight disclosure status |
| `ifrs_mgmt` | string | `'no'` | UI | Management role disclosure |
| `ifrs_risks` | string | `'partial'` | UI | Climate risks to business model |
| `ifrs_opps` | string | `'partial'` | UI | Climate opportunities |
| `ifrs_scenario` | string | `'no'` | UI | Scenario analysis (1.5°C/2°C/4°C) |
| `ifrs_risk_id` | string | `'partial'` | UI | Risk identification process |
| `ifrs_erm` | string | `'partial'` | UI | Climate risk in ERM |
| `ifrs_ghg_tgt` | string | `'partial'` | UI | GHG reduction targets |
| `ifrs_trans_plan` | string | `'no'` | UI | Transition plan (net-zero pathway) |
| `ifrs_phys_board` | string | `'no'` | UI | Physical climate risks on board agenda |
| `ifrs_trans_board` | string | `'no'` | UI | Transition climate risks on board agenda |
| `erm_phys` | bool | true | UI | Climate physical risk in ERM |
| `erm_trans` | bool | true | UI | Climate transition risk in ERM |
| `erm_fleet` | bool | true | UI | Operational risk (fleet) in ERM |
| `erm_ee` | bool | true | UI | Regulatory risk (EE Act) in ERM |
| `erm_popia` | bool | true | UI | Regulatory risk (POPIA) in ERM |
| `grap_sec` | bool | true | UI | S&EC active (GRAP PI ≥500) |
| `erm_count` | number | 12 | UI | Material risks identified (count) |
| `code_ethics` | bool | true | UI | Code of ethics in place |
| `hotline` | bool | true | UI | Whistleblower hotline active |
| `popia` | string | `'partial'` | UI | POPIA IO status |
| `ext_assur` | bool | false | UI | External ESG assurance engaged |
| `int_report` | bool | true | UI | Integrated Report published |
| `risk_reg` | string | `'partial'` | UI | Legal compliance register |
| `no_penalties` | bool | true | UI | No material regulatory penalties |

### EAP configuration

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `mc_prov` | string | `'gauteng'` | Province for EAP target lookup |
| `mc_year` | number | 2025 | EAP data year |
| `mc_combined` | bool | false | Combine Exco + Senior bands (4+2 pts) |

---

## 5. Time-series store — `TS`

`TS` holds 9-period monthly arrays for every quantitative field. Periods are Jul-25 through Mar-26.

```
Periods: ['Jul-25','Aug-25','Sep-25','Oct-25','Nov-25','Dec-25','Jan-26','Feb-26','Mar-26']
```

Fields in `TS` and their aggregation method:

| Key | Aggregation to D | Pre-loaded actuals |
|-----|------------------|--------------------|
| `fleet_diesel` | sum | [79354,68179,65076,73387,67295,57589,48740,63980,65865] |
| `gen_litres` | sum | [1289,0,0,0,0,295,0,0,597] |
| `lpg_kg` | sum | [0,570,190,190,380,570,380,0,0] |
| `car_litres` | sum | [140,142,93,109,144,75,110,98,143] |
| `elec_kwh` | sum | [288639,304665,294858,263388,255634,290165,261691,315713,314826] |
| `solar_kwh` | sum | All zeros (JHB confirmed, not yet logged) |
| `water_kl` | sum | [409,391,381,535,476,500,533,561,570] |
| `waste_div` | average | [89,90,91,91,92,90,91,92,91.1] |
| `waste_card` | average | [10.7,16.2,11.1,8.9,26.4,10.7,4.6,13.7,9.6] |
| `landfill_co2` | sum | [0.11,0.11,0.13,0.14,0.12,0.13,0.13,0.14,0.15] |
| `ev_count` | last value | All zeros |
| `ltifr` | last non-null | All null (awaiting hours worked) |
| `fatalities` | sum | All zeros |
| `train_hrs` | average | All zeros |
| `grant_pct` | average | All zeros |
| `csi_pct` | average | All zeros |
| `initiatives` | sum | [1,0,1,1,1,0,1,0,1] |
| `local_pct` | average | All zeros |
| `sup_hs` | average | All set to 60 |
| `board_blk` | average | All set to 42.9 |
| `board_fem` | average | All set to 14.3 |
| `king5` | average | All set to 135 |

**Sync function — `syncTStoD()`**

Called on every paste, individual cell edit, or page load:

```js
function syncTStoD() {
  const sum = k => TS[k].reduce((a, v) => a + (v || 0), 0);
  const avg = k => {
    const v = TS[k].filter(x => x !== null);
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0;
  };
  D.fleet_diesel = sum('fleet_diesel');
  D.elec_kwh     = sum('elec_kwh');
  // ... (all fields per aggregation rules above)
  D.waste_div    = Math.round(avg('waste_div') * 10) / 10;
  D.ltifr        = (() => {
    const lts = TS.ltifr.filter(v => v !== null);
    return lts.length ? lts[lts.length - 1] : null;
  })();
}
```

---

## 6. EEA2 / Management Control headcount store — `mhc`

A nested object keyed by band ID, then race code. Updated directly by EEA2 grid UI.

```js
const mhc = {
  board:     { AM:0, CM:0, IM:0, WM:0, AF:0, CF:0, IF:0, WF:0 },
  exdir:     { ... },
  otherexec: { ... },
  senior:    { ... },
  middle:    { ... },
  junior:    { ... },
  pwd:       { ... }
};
```

**Race codes:**
- `AM` = African Male
- `CM` = Coloured Male
- `IM` = Indian Male
- `WM` = White Male
- `AF` = African Female
- `CF` = Coloured Female
- `IF` = Indian Female
- `WF` = White Female

**Black = AM + CM + IM + AF + CF + IF**

---

## 7. EAP reference data

Employment Equity Act (EEA) s42 benchmarks sourced from Department of Employment and Labour EAP data. Three years × nine provinces × six Black race/gender groups.

### Gauteng 2025 (primary reference — SG Consumer HQ)

| Group | Gauteng % | Used as target for Senior/Middle/Junior bands |
|-------|-----------|----------------------------------------------|
| African Male | 46.6% | EAP-weighted target |
| Coloured Male | 1.2% | EAP-weighted target |
| Indian Male | 1.7% | EAP-weighted target |
| African Female | 37.4% | EAP-weighted target |
| Coloured Female | 1.2% | EAP-weighted target |
| Indian Female | 1.1% | EAP-weighted target |
| **Total Black** | **89.2%** | **Combined target** |
| **Black Female** | **39.7%** | **Female sub-target** |

Fixed targets apply to Board, Exco, and Other Exec bands (not EAP-based):

| Band | Black target | Black female target | Points |
|------|-------------|---------------------|--------|
| Board | 50% | 25% | 2 + 1 |
| Executive Directors | 50% | 25% | 2 + 1 |
| Other Exec Management | 60% | 30% | 2 + 1 |
| Senior Management | EAP | EAP female | 2 + 1 |
| Middle Management | EAP | EAP female | 2 + 1 |
| Junior Management | EAP | EAP female | 1 + 1 |
| Disabilities | 2% total | — | 2 |
| **Total** | | | **19** |

---

## 8. Environmental scoring — `calcAll()` E outputs

### GHG sub-pillar (33 points)

```
Scope 1 baseline established      5 pts   — s1 > 0
Scope 1 YoY reduction ≥10%       10 pts   — pr(yoy, 0.10, 10)  [requires prior_s12 > 0]
Scope 2 net reduction via solar    8 pts   — pr(re, 0.20, 8)    [re = solar_kwh / elec_kwh]
Scope 3 tracking initiated         5 pts   — s3 > 0
Net-zero target set (SBTi)         5 pts   — D.sbti === true
```

**GHG calculation:**
```
s1 = (fleet_diesel × 2.68 + gen_litres × 2.68 + lpg_kg × 1.51 + car_litres × 2.31) / 1000  [tCO₂e]
s2 = max(0, (elec_kwh × 0.82 - solar_kwh × 0.025) / 1000)                                   [tCO₂e]
s3 = water_kl × 0.000344                                                                       [tCO₂e]
re = solar_kwh / elec_kwh                                                                      [ratio]
yoy = max(0, (prior_s12 - (s1 + s2)) / prior_s12)                                            [ratio]
```

### Energy sub-pillar (18 points)
```
kWh tracked monthly all depots     5 pts   — elec_kwh > 0
Efficiency improvement YoY         5 pts   — energy_yoy === true
Renewable electricity ≥20%         8 pts   — pr(re, 0.20, 8)
```

### Fleet sub-pillar (18 points)
```
L/100km within OEM norm            8 pts   — 0 (per-vehicle data not loaded)
CO₂ per tonne-km tracked           5 pts   — 0 (monthly km not loaded)
EV % of fleet ≥5%                  5 pts   — pr(ev_count/fleet_total, 0.05, 5)
```

### Waste sub-pillar (12 points)
```
Diversion rate ≥75%                5 pts   — pr(waste_div, 75, 5)
Cardboard recycling tracked        4 pts   — waste_card > 0
Landfill tCO₂e tracked             3 pts   — landfill_co2 > 0
```

### Water sub-pillar (7 points)
```
Consumption tracked monthly        4 pts   — water_kl > 0
Efficiency initiative active       3 pts   — water_init === true
```

### ISO 14001 sub-pillar (20 points)
```
Certification achieved             8 pts   — iso14001 === 'certified'
Aspects register maintained        4 pts   — aspects === true
Board-approved environmental policy 4 pts  — bn(env_policy, 4)
NEMA/NWA/NEMWA legal register      4 pts   — legal_reg === true
```

**E total = sum of all sub-pillars / 108**
**E weight in overall score = 40%**

---

## 9. Social scoring — `calcAll()` S outputs

### EE / Management Control (28 points max, 17 from MC)

MC points flow from `calcMC()`:

```
MC scorecard (EEA2 headcount)     17 pts   — min(17, calcMC().pts)
EE Plan submitted                  5 pts   — pre-scored 5 (confirmed)
EE Forum consultation active       3 pts   — pre-scored 3
EE Numerical targets set           3 pts   — pre-scored 3
```

**`calcMC()` detail:**

For each band, pro-rata score is applied to actual percentage vs target:
- Black % vs target (EAP-based or fixed) → partial or full points
- Black female % vs target → partial or full points
- Combined mode: Exco + Senior scored together at 60%/30% targets for 4+2 pts

### WSP / ATR sub-pillar (20 points)
```
WSP submitted to SETA              5 pts   — D.wsp
ATR submitted to SETA              5 pts   — D.atr
Training hours ≥40/employee        5 pts   — pr(train_hrs, 40, 5)
Mandatory grant recovery ≥80%      5 pts   — pr(grant_pct, 80, 5)
SDL levy = payroll × 1%
Grant target = levy × 20%
```

### Health & Safety sub-pillar (25 points)
```
LTIFR ≤2.0                         8 pts   — prI(ltifr, 2, 8)     [null = 0]
Zero fatalities                     8 pts   — fatalities === 0
Driver fatigue programme active     5 pts   — fatigue === true
Incident investigation active       4 pts   — incidents === true
```

### Community / CSI sub-pillar (20 points)
```
CSI/SED spend ≥1% NPAT             5 pts   — pr(csi_pct, 1, 5)   [npat=0 → 0]
Social calendar ≥6 initiatives      5 pts   — pr(initiatives, 6, 5)
Local labour procurement ≥40%       5 pts   — pr(local_pct, 40, 5)
Supplier H&S IMS-T-149 ≥80%        5 pts   — pr(sup_hs, 80, 5)
```

**S total = sum of all sub-pillars / 100**
**S weight in overall score = 30%**

---

## 10. Governance scoring — `calcAll()` G outputs

### Board Composition (6 points)
```
Black board ≥50% voting rights     2 pts   — pr(board_blk/100, 0.50, 2)
Black female board ≥25%            1 pt    — pr(board_fem/100, 0.25, 1)
Exec Directors black               2 pts   — from calcMC() exdir band
Exec Directors black female        1 pt    — from calcMC() exdir band
```
*Note: Exec Director points flow from mhc.exdir headcount, same as MC.*

### King V sub-pillar (35 points)
```
Apply & Explain score (/170 × 25) 25 pts   — (king5/170) × 25
S&EC established                   5 pts   — sec_active === true
ESG-linked executive remuneration  5 pts   — esg_rem === true
```

### IFRS S1/S2 sub-pillar (15 points)
```
Disclosure completeness           10 pts   — (sum of 11 disclosure bn() scores / 11) × 10
ERM climate integration            5 pts   — bn(ifrs_erm, 5)
```

The 11 IFRS S2 disclosures scored (each 0 / 0.5 / 1):
1. Board oversight of climate risks
2. Management role in climate risk
3. Climate risks to business model
4. Climate opportunities identified
5. Scenario analysis (1.5°C / 2°C / 4°C)
6. Climate risk identification process
7. Climate risk integration into ERM
8. GHG reduction targets
9. Transition plan (net-zero pathway)
10. Physical climate risks on board agenda
11. Transition climate risks on board agenda

### GARP / GRAP sub-pillar (13 points)
```
ERM includes climate physical + transition risks  8 pts  — erm_phys && erm_trans
GRAP public interest S&EC (PI ≥500)               5 pts  — grap_sec === true
```

### Ethics & Compliance sub-pillar (32 points)
```
Code of ethics + Be Heard hotline   4 pts  — code_ethics && hotline (both = 4, one = 2)
POPIA Information Officer           5 pts  — bn(popia, 5)
Legal compliance register           5 pts  — bn(risk_reg, 5)
External ESG assurance (ISAE 3000)  5 pts  — ext_assur === true
ESG/Integrated Report published     8 pts  — int_report === true
No material regulatory penalties    5 pts  — no_penalties === true
```

**G total = sum of all sub-pillars / 100**
**G weight in overall score = 30%**

---

## 11. Overall ESG score

```
Overall = (eT/108 × 0.40) + (sT/100 × 0.30) + (gT/100 × 0.30)
```

| Band | Range | Indicator |
|------|-------|-----------|
| EXCELLENT | ≥85% | ★★★ |
| GOOD | ≥70% | ★★ |
| ADEQUATE | ≥50% | ★ |
| NEEDS ATTENTION | <50% | ⚠ |

---

## 12. GHG calculation pipeline

Full calculation chain from raw inputs to scored outputs:

```
1. TS.fleet_diesel[0..8]  →  syncTStoD()  →  D.fleet_diesel (sum)
2. D.fleet_diesel × EF.diesel / 1000      →  s1 component (tCO₂e)
3. Similarly for gen_litres, lpg_kg, car_litres
4. s1 = all Scope 1 components summed
5. D.elec_kwh × EF.elec / 1000           →  s2 gross
6. D.solar_kwh × EF.solar / 1000         →  solar offset
7. s2 = max(0, s2_gross - solar_offset)  →  Scope 2 net
8. D.water_kl × EF.water                 →  s3
9. re = D.solar_kwh / D.elec_kwh         →  RE fraction
10. yoy = max(0, (prior_s12 - (s1+s2)) / prior_s12) → YoY reduction ratio
11. Scores calculated via pr() and prI() functions
12. Carbon credits: netGHG = max(0, s1+s2+s3 - CR.verified/1000)
```

---

## 13. Carbon tax calculation

Basis: Carbon Tax Act 15 of 2019. Taxable base = 40% of Scope 1+2 (basic allowance 60%).

```
taxable_base    = (s1 + s2) × 0.40
tier1_liability = taxable_base × 236   (R/tCO₂e current rate)
tier2_projected = taxable_base × 640   (R/tCO₂e projected)
```

Mitigation savings:
```
solar_saving      = annualised_s2 × 0.15 × 0.40 × 236
eco_driving_saving = annualised_s1 × 0.10 × 0.40 × 236
```

---

## 14. Carbon credits store — `CR`

```js
const CR = {
  purchases: [
    {
      id:       1,
      date:     '2025-09-15',
      standard: 'VCS',
      type:     'REDD+',
      volume:   500,          // tCO₂e
      cost:     45000,        // ZAR
      registry: 'Verra',
      project:  'Amazon Forest Protection BR-001',
      status:   'verified'   // 'verified' | 'pending' | 'anticipated'
    }
  ],
  retired: [],
  nextId:   3
};
```

**Operations:**

| Function | Effect |
|----------|--------|
| `addCredit(date, standard, type, volume, cost, registry, project, status)` | Push to `CR.purchases`, increment `nextId`, call `recalc()` |
| `retireCredit(id)` | Move verified credit from `purchases` to `retired`, add `retiredDate`, call `recalc()` |
| `deleteCredit(id)` | Splice from `purchases`, call `recalc()` |

**Net offset calculation:**
```js
function crNetOffset() {
  const purchased = CR.purchases
    .filter(c => c.status === 'verified')
    .reduce((a, c) => a + c.volume, 0);
  const retired = CR.retired.reduce((a, c) => a + c.volume, 0);
  return { purchased, retired, net: purchased };
}
// Note: all verified credits count toward net offset whether retired or not.
// Retirement is for regulatory/registry cancellation only.
```

---

## 15. Trend calculation

Prior-period values stored in `T` object. Trend arrows calculated on every render.

```js
function trendArrow(current, prior, lowerIsBetter) {
  if (prior === null || current === null) return '—';
  const diff = current - prior;
  const pctChange = prior !== 0 ? Math.round(Math.abs(diff) / Math.abs(prior) * 100) : 0;
  const up = diff > 0;
  const isGood = lowerIsBetter ? !up : up;
  const colour = isGood ? 'var(--acc-e)' : 'var(--acc-red)';
  return `${up ? '↑' : '↓'} ${pctChange}%` in that colour;
}
```

Fields where lower is better (lowerIsBetter = true):
- GHG emissions (all scopes)
- Fleet diesel litres
- Grid electricity kWh
- Water kL
- Landfill tCO₂e
- LTIFR
- Fatalities

---

## 16. Net-zero trajectory projection

Used in the Net-Zero Roadmap page. Compound annual reduction rate derived from SBTi CNZS 2.0 near-term milestone (−48% by 2030 vs baseline).

```js
const annualRate = 0.093; // 9.3% per year compound → ~48% by 2030

function projectGHG(baseGHG, year) {
  const yearsElapsed = year - 2025;
  return Math.max(0, Math.round(baseGHG * Math.pow(1 - annualRate, yearsElapsed) * 10) / 10);
}
```

| Year | Factor | tCO₂e (from FY2025/26 baseline) |
|------|--------|----------------------------------|
| 2025 | 1.00 | Baseline |
| 2026 | 0.91 | −9.3% |
| 2028 | 0.75 | −25% |
| 2030 | 0.52 | −48% ← SBTi near-term |
| 2035 | 0.34 | −66% |
| 2050 | 0.055 | ~−95% ← Net-zero |

---

## 17. Data validation rules

| Rule | Applied to | Behaviour |
|------|-----------|-----------|
| `LTIFR === null` | H&S scoring | Returns 0 points — not penalised, flagged as missing |
| `npat === 0` | CSI scoring | CSI % scores 0 — blocked pending NPAT entry |
| `prior_s12 === 0` | GHG YoY | YoY indicator scores 0 — FY2025/26 treated as baseline |
| `elec_kwh === 0` | RE% | RE% = 0, cannot be NaN |
| `fleet_total === 0` | EV% | EV% = 0, guard against divide-by-zero |
| Any TS value `null` | TS aggregation | Excluded from average; treated as 0 in sum |
| Paste parse failure | Import | Status message shown, `TS` unchanged |

---

## 18. B-BBEE scorecard integration

The toolkit scores the five B-BBEE elements using the same underlying data:

| Element | Points | Source | Status |
|---------|--------|--------|--------|
| Ownership | 25 | Manual — share register | Not auto-scored |
| Management Control | 19 | `calcMC()` — EEA2 headcount | **Auto-scored** |
| Skills Development | 25 | SDL payroll + training spend % | Partial — WSP/ATR auto |
| Enterprise & Supplier Development | 40 | PP + ESD data | Not auto-scored |
| Socio-Economic Development | 5 | `pr(csi_pct, 1, 5)` if `npat > 0` | **Auto-scored when NPAT entered** |
| Bonus | 5 | Net job creation | Not auto-scored |
| **Total** | **119** | | |

B-BBEE level thresholds:

| Level | Minimum points | Procurement recognition |
|-------|---------------|------------------------|
| Level 1 | 100 | 135% |
| Level 2 | 95 | 125% |
| Level 3 | 90 | 110% |
| Level 4 | 80 | 100% |
| Level 5 | 75 | 80% |
| Level 6 | 70 | 60% |
| Level 7 | 55 | 50% |
| Level 8 | 40 | 10% |
| Non-compliant | <40 | 0% |

---

## 19. Dependencies and constraints

- **No external libraries.** All calculation logic is vanilla JavaScript.
- **No server-side processing.** The file is fully self-contained.
- **No database persistence.** State resets on page reload. To save, the user must download the HTML file after data entry, or integrate with a backend storage layer (out of scope for v1.7).
- **Emission factors must be updated annually.** DEFRA 2024 and Eskom NERSA 2024 values are hard-coded. Review at the start of each reporting year.
- **EAP data must be updated annually.** Current data covers 2023–2025. Add the following year's DoEL EAP publication before FY2026/27 reporting begins.
- **SBTi alignment.** The −9.3% annual reduction rate is based on the CNZS 2.0 near-term pathway for Scope 1+2. Review if SG Consumer selects a different SBTi pathway.
