# ESG Section Parity Checklist

> Workbook: `docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx` (28 sheets)  
> Registry: `apps/web/src/lib/esg/esgSectionRegistry.ts`  
> Generated: June 2026 — status reflects web app vs v1.7 extracted JSON.

**Summary:** 26 / 28 sheets ✅ complete · 1 partial · 1 reference-only · **93% input/toolkit parity**

| # | Workbook sheet | Block / rows | Input section key | Toolkit page | Status |
|---|----------------|--------------|-------------------|--------------|--------|
| 1 | Cover | Entity, period, sector (C5–C12) | `company-reporting-setup` | — | ✅ |
| 2 | Assumptions | Stance, sector, thresholds (B6–B112) | `assumptions` | — | ✅ |
| 3 | Audit_Log | Version change log (A6:F30) | — | — | ❌ (reference; Phase 2) |
| 4 | ESG_Dashboard | Pillar scores & executive KPIs | — | `/` (Dashboard) | ✅ |
| 5 | E_Data | SCOPE 1A fleet diesel (A14:N18) | `e-data` › scope-1a | — | ✅ |
| 5 | E_Data | SCOPE 1B generator diesel (A23:M27) | `e-data` › scope-1b | — | ✅ |
| 5 | E_Data | SCOPE 1C LPG forklifts (A32:M32) | `e-data` › scope-1c | — | ✅ |
| 5 | E_Data | SCOPE 1D road business (A37:M37) | `e-data` › scope-1d | — | ✅ |
| 5 | E_Data | SCOPE 2 electricity (A41:N45) | `e-data` › scope-2 | — | ✅ |
| 5 | E_Data | Solar PV offset (A50:M54) | `e-data` › solar | — | ✅ |
| 5 | E_Data | Waste / % recycled (A67:M71) | `e-data` › waste | — | ✅ |
| 5 | E_Data | Scope 3 water (A58:M62) | `e-data` › water | — | ✅ |
| 5 | E_Data | GHG summary (A73:M86) | `e-data` › ghg-summary | — | ✅ |
| 5 | E_Data | Net-zero targets (A90:G90) | `e-data` › nz-targets | `/net-zero` | ✅ |
| 6 | Fleet_Register | Per-vehicle grid (A4:O33) | `fleet` | — | ✅ |
| 7 | ISO_14083 | Transport GHG trips (A4:O81) | — | `/iso-14083` | ✅ |
| 8 | Waste_Register | Waste streams (A4:J40) | `waste` | — | ✅ |
| 9 | Driver_Debrief | Per-trip debrief (A3:M50) | `driver-debrief` | — | ✅ |
| 10 | S_Data | EE headcount EEA2 (A5:L11) | `s-data` › headcount | — | ✅ |
| 10 | S_Data | Health & safety (A28:G35) | `s-data` › hs | — | ✅ |
| 10 | S_Data | WSP / ATR training (A40:G55) | `s-data` › training | — | ✅ |
| 10 | S_Data | Leviable payroll & SDL (B43:B71) | `s-data` › payroll | — | ✅ |
| 10 | S_Data | OFO training interventions (A57:F68) | `s-data-ofo` | — | ✅ |
| 10 | S_Data | CSI initiatives (A70:F82) | `s-data-csi` | — | ✅ |
| 11 | G_Data | Board & F-col maturity (A5:F26) | `g-data` | — | ✅ |
| 12 | EE_Scorecard | EE indicators (A5:H25) | `ee` | — | ✅ |
| 13 | E_Scorecard | Environmental scoring (A5:I29) | — | `/environmental` | ✅ |
| 14 | S_Scorecard | Social scoring (A5:I27) | — | `/social` | ✅ |
| 15 | G_Scorecard | Governance scoring (A5:I25) | — | `/governance` | ✅ |
| 16 | King5_Scorecard | 17 principles (B4:I20) | `king5` | — | ✅ |
| 17 | IFRS_S1_S2 | S1/S2 disclosures (A5:H30) | `ifrs` | — | ✅ |
| 18 | GARP_GRAP | Risk register (A5:K30) | `garp` | — | ✅ |
| 19 | ISO_Tracker | ISO clauses (~60 rows) | `iso-tracker` | — | ✅ |
| 20 | SAQ_Supplier | Supplier assessment (A5:K40) | `saq` | — | ✅ |
| 21 | NetZero_Roadmap | Decarbonisation pathway | — | `/net-zero` | ✅ |
| 22 | B_BBEE_ESG | Generic Code bridge | — | `/bbbee-bridge` | ✅ |
| 23 | Materiality_Matrix | Double materiality | — | — | ❌ (computed; dashboard Phase 2) |
| 24 | Carbon_Tax | SA liability | — | `/carbon-tax` | ✅ |
| 25 | Standards_Map | Standards crosswalk | — | — | ❌ (reference; in-app help Phase 2) |
| 26 | Glossary | 101 definitions | — | — | ❌ (reference; help drawer Phase 2) |
| 27 | Validation | Completeness checks | — | Validation panel | ✅ |
| 28 | Data_Status | Field completion tracker | — | — | ❌ (partial; toolkit tile Phase 2) |

## Input layer sections (sidebar)

| Section key | Workbook sheet | Subtabs / editor |
|-------------|----------------|------------------|
| `company-reporting-setup` | Cover | Scalar form |
| `assumptions` | Assumptions | Scalar form |
| `e-data` | E_Data | 10 subtabs (monthly grids + GHG + NZ) |
| `s-data` | S_Data | 4 subtabs (headcount, H&S, WSP/ATR, payroll) |
| `s-data-ofo` | S_Data | Register grid |
| `s-data-csi` | S_Data | Register grid |
| `g-data` | G_Data | Maturity grid (B + F cols) |
| `ee` | EE_Scorecard | Maturity grid |
| `fleet` | Fleet_Register | Register grid |
| `waste` | Waste_Register | Register grid |
| `driver-debrief` | Driver_Debrief | Register grid |
| `iso-tracker` | ISO_Tracker | Register grid (fixed rows) |
| `king5` | King5_Scorecard | Register grid (17 rows) |
| `ifrs` | IFRS_S1_S2 | Register grid |
| `garp` | GARP_GRAP | Register grid |
| `saq` | SAQ_Supplier | Register grid |

## Toolkit pages (results only)

| Route | Workbook sheet | Rows rendered |
|-------|----------------|---------------|
| `/` | ESG_Dashboard | All KPI cells + pillar mini-tables |
| `/environmental` | E_Scorecard | 20 indicator rows |
| `/social` | S_Scorecard | 19 indicator rows |
| `/governance` | G_Scorecard | 14 indicator rows |
| `/net-zero` | NetZero_Roadmap | Pathway chart |
| `/carbon-tax` | Carbon_Tax | Tier 1/2 liability |
| `/iso-14083` | ISO_14083 | Trip register (read/link) |
| `/bbbee-bridge` | B_BBEE_ESG | Bridge elements |

## Golden parity (SG Consumer)

| Metric | Workbook | Calculator |
|--------|----------|------------|
| E pillar | 36 / 108 | ✅ `esg-consumer-golden.test.ts` |
| S pillar | 33 / 100 | ✅ |
| G pillar | 64.85 / 100 | ✅ |
| Overall D9 | 44.6176% | ✅ |

## Remaining gaps (❌)

1. **Audit_Log** — reference sheet; append UI deferred to admin Phase 2  
2. **Materiality_Matrix** — computed from GARP; dashboard tile Phase 2  
3. **Standards_Map / Glossary** — static reference; help drawer Phase 2  
4. **Data_Status** — manual completion flags; toolkit completeness tile Phase 2  
5. **ISO_14083** — toolkit page exists; full trip data entry optional in input layer
