# Sector Truth Ledger — Canonical B-BBEE Reference

**Document Purpose**: Single source of canonical B-BBEE truth, established from the gazetted training pack and sector toolkits supplied by the client. Used to audit `apps/api/pipeline/sectorConfig.ts`, the `/api/sectors` route, and the Super Admin "B-BBEE Scorecard Reference" view. Authored by the domain-truth & configuration auditor agent; the scoring engine math is owned by a separate agent and is out of scope here.

**Last audited**: 2026-05-21

**Conflict-resolution rule**: where two sources disagree, the most-recently gazetted official source is preferred and the conflict is flagged inline as `[CONFLICT]`. Internal derivative documents (`docs/domain/_index.md` summary tables that still show the older 111-point structure) are explicitly downgraded against `docs/SCORECARD_GROUND_TRUTH.md` and the Excel toolkits.

**Symbols used below**:

| Symbol | Meaning |
|---|---|
| `✓` | Value verified against canonical source |
| `[CONFLICT]` | Multiple sources disagree — preferred value used, conflict flagged |
| `[UNVERIFIED]` | No source available in workspace — needs expert review |
| `[DERIVED]` | Computed from sub-element rows, not stated as a header |
| `MC` | Management Control element |
| `EE` | Employment Equity element |

---

## 0. Cross-cutting rule: is "Management Control + Employment Equity" one pillar or two?

The answer is **sector-dependent**. The training pack explicitly defines this for the generic codes:

| Code / scorecard | MC + EE structure | Canonical source |
|---|---|---|
| **RCOGP Generic** | **ONE pillar — "Management Control" (19 pts)**. The Board+Exec rows (9 pts) and the Senior/Middle/Junior management EAP-banded rows (10 pts incl. disabled) are sub-elements of the same pillar. There is no separate "Employment Equity" pillar in the gazetted scorecard. | `docs/domain/pillars/02_management_control.md` (training pack slides 96–106); `docs/SCORECARD_GROUND_TRUTH.md` §3.2 |
| **RCOGP QSE** | **ONE pillar — "Management Control" (15 pts)**. QSE drops the EAP-banded Senior/Middle/Junior rows; only Board + Executive + disabled remain. | `docs/SCORECARD_GROUND_TRUTH.md` §7 ("QSE changes vs Generic: MC drops to 15 (merges MC+EE)") |
| **ICT Generic** | **ONE pillar — "Management Control" (23 pts)** including EAP-banded staff rows and disabled. | `docs/SCORECARD_GROUND_TRUTH.md` §4 ("MC Total 23 = board 3+2, exec 2+1, other exec 3+2, EE via EAP, disabled 2") |
| **ICT QSE** | **ONE pillar — "Management Control" (15 pts)** mirroring RCOGP QSE. | `docs/SCORECARD_GROUND_TRUTH.md` §7 |
| **FSC Generic (Others)** | **ONE pillar — "Management Control" (21 pts)** with board 3, exec 3, other exec **14**, disabled 1. | `docs/SCORECARD_GROUND_TRUTH.md` §5 |
| **AGRI Generic** | **ONE pillar — "Management Control" (23 pts)** same shape as ICT MC. | `docs/SCORECARD_GROUND_TRUTH.md` §6 |
| **Transport Sector (Road Freight Large)** | **TWO separate pillars — "Management Control" (11 pts) and "Employment Equity" (18 pts)** on the gazetted toolkit. | `docs/Transport Codes.xlsx`, sheet "Road Freight Large" (rows 17–29 split element column) |
| **Transport Sector QSE (Road Freight QSE)** | **TWO separate compulsory pillars — "Management Control" (27 pts) and "Employment Equity" (27 pts)**. | `docs/Transport Codes.xlsx`, sheet "Road Freight QSE" (rows 9–17) |
| **Construction QSE** | **ONE pillar — "Management Control" (20 pts)** that covers exec + senior/middle/junior representation (no separate EE element in the QSE scorecard). | `apps/api/pipeline/constructionIndicators.ts` line 1282–1293; primary docx "CONSTRUCTION_QUALIFYING_SMALL_ENTERPRISE_(QSE)_SCORECARD" referenced in source comments but not present in workspace — `[UNVERIFIED]` against original. |
| **Construction Contractor** | **ONE pillar — "Management Control" (22 pts)** including board, exec, senior/middle/junior, disabled, professional registration, youth bonus. | `docs/Construction sector codes.docx` (Contractor "Total 22" row) ✓ |
| **Construction BEP** | **ONE pillar — "Management Control" (22 pts)**. Same as Contractor minus Junior Management rows; BEP-specific professional registration weighting. | `docs/Construction sector codes.docx` (BEP "Total 22" row) ✓ |

**Bottom line**: the experts are correct **for the 6 generic codes and both Construction variants** — MC+EE is one pillar. The exception the codebase must preserve is **Transport (Road Freight)** where they are two separate gazetted elements.

---

## 1. Pillar Max Points — sector × scorecard matrix

This is the authoritative pillar header table. Every cell is cited against a canonical source.

| Pillar | RCOGP Gen | RCOGP QSE | ICT Gen | ICT QSE | FSC Gen (Others) | AGRI Gen | Transport Large | Transport QSE | Construction QSE | Construction Contractor | Construction BEP |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ownership | **25** | 25 | 25 | 25 | 25 | 25 | **24** | **28** | **30** | **31** | **31** |
| Management Control | **19** | 15 | 23 | 15 | 21 | 23 | **11** | **27** | **20** | **22** | **22** |
| Employment Equity | merged into MC | merged into MC | merged into MC | merged into MC | merged into MC | merged into MC | **18** | **27** | merged into MC | merged into MC | merged into MC |
| Skills Development | 25 | 30 | 25 | 30 | 23 | 25 | **15** | 25 (elective) | **26** | **26** | **34** |
| Preferential Procurement | 29 | 21 | 27 | 21 | 24 | 27 | **20** | 25 (elective) | n/a (combined into ESD) | n/a (combined into ESD) | n/a (combined into ESD) |
| Supplier Development | 10 | 5 | 10 | 5 | 10 | 10 | **15** (called "Enterprise Dev" in toolkit; 3% NPAT) | n/a | combined into ESD | combined into ESD | combined into ESD |
| Enterprise Development | 7 | 7 | 18 | 8 | 9 | 7 | n/a (sub-rows merged into SD pillar) | 25 (elective) | n/a | n/a | n/a |
| Enterprise & Supplier Development (combined) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | **29** | **38** | **30** |
| Socio-Economic Development | 5 | 5 | 12 | 12 | 8 | 15 | **5** | 25 (elective) | **5** | **6** | **6** |
| YES Initiative | 0 (level boost) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Grand Total** | **120** | **108** | **140** | **116** | **120** | **132** | **108** | **107** | **110** | **123** | **123** |

**Sources per column**:
- RCOGP Gen / RCOGP QSE / ICT Gen / ICT QSE / FSC Gen / AGRI Gen — `docs/SCORECARD_GROUND_TRUTH.md` §1, §2 and per-sector tables; verified against `docs/toolkits/BBBEE Toolkit (...).xlsx`
- Transport Large — `docs/Transport Codes.xlsx` sheet "Road Freight Large" (GRAND TOTAL row 48 explicitly states 108)
- Transport QSE — `docs/Transport Codes.xlsx` sheet "Road Freight QSE" (compulsory totals 28 + 27 + 27 = 82; each elective 25; 82 + 25 = 107)
- Construction (all three) — `docs/Construction sector codes.docx` Total rows + `apps/api/pipeline/constructionIndicators.ts` lines 11–14 element comments. The Contractor and BEP totals are explicit in the docx; the QSE total is from the indicator file's source comments — primary docx not in workspace, `[UNVERIFIED]`.

---

## 2. Recognition / level thresholds

### 2.1 Standard scale (RCOGP Gen, RCOGP QSE, AGRI Gen)

Source: `docs/SCORECARD_GROUND_TRUTH.md` §8; `docs/domain/calculations/scoring_tables.md`.

| Level | Min Points | Recognition % |
|---|---|---|
| 1 | ≥ 100 | 135 |
| 2 | 95 – 99 | 125 |
| 3 | 90 – 94 | 110 |
| 4 | 80 – 89 | 100 |
| 5 | 75 – 79 | 80 |
| 6 | 70 – 74 | 60 |
| 7 | 55 – 69 | 50 |
| 8 | 40 – 54 | 10 |
| Non-Compliant | < 40 | 0 |

### 2.2 ICT scale (ICT Gen, ICT QSE)

Source: `docs/SCORECARD_GROUND_TRUTH.md` §4 ("ICT Level Thresholds").

| Level | Min Points | Recognition % |
|---|---|---|
| 1 | ≥ 120 | 135 |
| 2 | 115 – 119 | 125 |
| 3 | 110 – 114 | 110 |
| 4 | 100 – 109 | 100 |
| 5 | 95 – 99 | 80 |
| 6 | 90 – 94 | 60 |
| 7 | 75 – 89 | 50 |
| 8 | 55 – 74 | 10 |

### 2.3 FSC scaled (FSC Gen — Others sub-sector)

Source: `docs/SCORECARD_GROUND_TRUTH.md` §5.

| Level | Min Points | Recognition % |
|---|---|---|
| 1 | ≥ 95.50 | 135 |
| 2 | 90.72 – 95.49 | 125 |
| 3 | 85.95 – 90.71 | 110 |
| 4 | 76.40 – 85.94 | 100 |
| 5 | 71.62 – 76.39 | 80 |
| 6 | 66.85 – 71.61 | 60 |
| 7 | 52.52 – 66.84 | 50 |
| 8 | 38.20 – 52.51 | 10 |

### 2.4 Transport Large

Source: not explicitly tabulated in `docs/Transport Codes.xlsx`. The gazetted Transport Sector Code uses the **standard scale percentage thresholds** applied to the 108-pt total. Code derives this by scaling `STANDARD_LEVELS × (108/120)` — `[UNVERIFIED]` against an official threshold table; pragmatic and consistent with how DTI publishes sector-specific scaled totals.

### 2.5 Transport QSE

Same situation as Transport Large but scaled to 107-pt total — `[UNVERIFIED]`, pragmatic scaling used in `sectorConfig.ts`.

### 2.6 Construction (QSE, Contractor, BEP)

No explicit level threshold table appears in `docs/Construction sector codes.docx`. The Construction engine returns absolute points; the caller is expected to translate. **`[UNVERIFIED]` — needs expert input.** Current code uses `STANDARD_LEVELS` as a placeholder which is **inappropriate** because Construction totals are 110/123/123, not 120; the scale needs sector-specific calibration before production use.

---

## 3. RCOGP Generic — full ledger (120 pts)

Source: `docs/SCORECARD_GROUND_TRUTH.md` §3; cross-checked against `docs/domain/pillars/0X_*.md`; verified to `docs/toolkits/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx`.

### 3.1 Ownership (25 pts) — sub-min: 40% of Net Value (3.2/8)

| Indicator | Pts | Target | Formula | Source |
|---|---|---|---|---|
| Voting rights — Black | 4 | 25% + 1 vote | proportional | §3.1, slide 108 |
| Voting rights — Black women | 2 | 10% | proportional | §3.1 |
| Economic interest — Black | 4 | 25% | graduated × time | §3.1 |
| Economic interest — Black women | 2 | 10% | proportional | §3.1 |
| Economic interest — Designated groups / ownership schemes | 3 | 3% | proportional | §3.1 |
| Economic interest — Black new entrants | 2 | 2% | bonus flag | §3.1 |
| Net Value (realisation) | 8 | 100% | net_value (Annex Section 4) | §3.1 |

### 3.2 Management Control (19 pts) — includes Board, Exec and EAP-banded EE staff rows

| Indicator | Pts | Target | Source |
|---|---|---|---|
| Black board members (voting rights) | 2 | 50% | §3.2 |
| Black women board members (voting rights) | 1 | 25% | §3.2 |
| **Black executive directors** | **2** | **50%** | §3.2 — `[CONFLICT]` with code defaults that historically used 60% — ground truth is 50% |
| **Black female executive directors** | **1** | **25%** | §3.2 — `[CONFLICT]` historical 30% — ground truth is 25% |
| Black other executive management | 2 | 60% | §3.2 |
| Black female other executive management | 1 | 30% | §3.2 |
| Black senior management | 2 | EAP-based | §3.2 |
| Black female senior management | 1 | EAP-based | §3.2 |
| Black middle management | 2 | EAP-based | §3.2 |
| Black female middle management | 1 | EAP-based | §3.2 |
| Black junior management | 1 | EAP-based (~88%) | §3.2 |
| Black female junior management | 1 | EAP-based (~44%) | §3.2 |
| Black employees with disabilities | 2 | 2% | §3.2 |

### 3.3 Skills Development (25 = 20 base + 5 bonus) — sub-min 40% of 20 base (8 pts)

| Indicator | Pts | Target | Source |
|---|---|---|---|
| Learning programmes for Black people (% of leviable) | 6 | 3.5% | §3.3 |
| Bursaries — Black | 4 | 2.5% | §3.3 |
| Learning programmes for disabled Black people | 4 | 0.3% | §3.3 |
| Black people in B/C/D programmes (headcount) | 6 | 5% of headcount | §3.3 |
| Absorption after B/C/D programmes (bonus) | 5 | 100% absorbed | §3.3 |

### 3.4 Preferential Procurement (29 = 27 base + 2 bonus) — sub-min 40% of 27 (10.8)

| Indicator | Pts | Target | Source |
|---|---|---|---|
| All empowering suppliers (BEE L1-L8 by recognition) | 5 | 80% of TMPS | §3.4 |
| QSE suppliers | 3 | 15% | §3.4 |
| EME suppliers | 4 | 15% | §3.4 |
| **≥51% Black-owned (BO51)** | **11** | **50%** | §3.4 — `[CONFLICT]` historical 40%/10pts; ground truth 50%/11pts |
| ≥30% Black women owned (BWO30) | 4 | 12% | §3.4 |
| Designated group suppliers (bonus, 51% Black owned) | 2 | 2% | §3.4 — bonus only |

### 3.5 Supplier Development (10) — sub-min 40% (4 pts)

| Indicator | Pts | Target | Source |
|---|---|---|---|
| SD contributions as % of (2% NPAT) | 10 | 2% NPAT | §3.5 |

### 3.6 Enterprise Development (7 = 5 base + 2 bonus) — sub-min 40% of 5 (2 pts)

| Indicator | Pts | Target | Source |
|---|---|---|---|
| ED contributions as % of (1% NPAT) | 5 | 1% NPAT | §3.6 |
| Graduation bonus (≥1 SD → ED) | 1 | yes/no | §3.6 |
| Jobs created bonus (≥1 perm job) | 1 | yes/no | §3.6 |

### 3.7 Socio-Economic Development (5)

| Indicator | Pts | Target | Source |
|---|---|---|---|
| SED contributions as % of (1% NPAT) | 5 | 1% NPAT | §3.7 |

---

## 4. RCOGP QSE — full ledger (108 pts)

Source: `docs/SCORECARD_GROUND_TRUTH.md` §2 + §7; `docs/toolkits/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx`.

| Pillar | Pts | Notes |
|---|---|---|
| Ownership | 25 | Same indicators as Generic; same sub-min |
| MC (incl. exec + disabled — no EAP staff bands) | 15 | Board 3+2, Exec 5+2, Other Exec 3+2, Disabled 2; **QSE merges MC + EE; no Senior/Middle/Junior bands** |
| Skills Development | 30 | Spend 15 + Bursary 7 + Disabled 3 + Absorption 5 |
| Preferential Procurement | 21 | All-Suppliers 5 + QSE 3 + EME 4 + BO51 9 + BWO30 4 (no DG bonus on QSE) `[UNVERIFIED]` — DG bonus presence/absence on QSE needs expert confirm |
| Supplier Development | 5 | 1% NPAT |
| Enterprise Development | 7 | 5 base + 1 grad + 1 jobs |
| Socio-Economic Development | 5 | 1% NPAT |

Sub-minimum priority element for QSE: must choose **either** SD or ESD for the 40% sub-min check (see Ground Truth §9).

---

## 5. ICT Generic — full ledger (140 pts)

Source: `docs/SCORECARD_GROUND_TRUTH.md` §4; `docs/toolkits/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx`; `docs/toolkits/extracted_ICT_Generic.json`.

| Pillar | Pts | Notes |
|---|---|---|
| Ownership | 25 | **Voting target = 30%** (not 25%); EI 25%; rest mirrors RCOGP |
| MC (incl. EE bands + disabled) | 23 | Board 3+2, Exec 2+1, Other Exec 3+2, plus EAP bands + disabled 2 |
| Skills Development | 25 | Spend 15 + Bursary 7 + Disabled 3 + Absorption 5 (different breakdown vs RCOGP 6+4+4+6+5) |
| Preferential Procurement | 27 | 5+3+4+9+4+2 = 27 |
| Supplier Development | 10 | 2% NPAT |
| Enterprise Development | 18 | 15 base + 1 grad + 1 jobs ≤10% + 1 jobs >11% |
| Socio-Economic Development | 12 | ICT-specific initiatives |

Levels: ICT scale (§2.2 above).

---

## 6. ICT QSE — full ledger (116 pts)

Source: `docs/SCORECARD_GROUND_TRUTH.md` §7.

| Pillar | Pts | Notes |
|---|---|---|
| Ownership | 25 | Same as ICT Generic ownership shape |
| MC | 15 | Board 3+2, Exec 4+4, Other Exec 3+2 — `[CONFLICT]` Ground Truth section is brief; ICT QSE MC sub-row weights are inferred from the Excel extraction file `docs/toolkits/extracted_ICT_QSE.json` |
| Skills Development | 30 | Same indicators as ICT Generic Skills, scaled |
| Preferential Procurement | 21 | |
| Supplier Development | 5 | 1% NPAT |
| Enterprise Development | 8 | 5 base + 1 grad + 2 jobs |
| Socio-Economic Development | 12 | |

Levels: ICT scale.

---

## 7. FSC Generic (Others sub-sector) — full ledger (120 pts)

Source: `docs/SCORECARD_GROUND_TRUTH.md` §5; `docs/toolkits/BBBEE Toolkit (FSC) Template v1.0.xlsx`; `docs/toolkits/extracted_FSC_Generic.json`.

| Pillar | Pts | Notes |
|---|---|---|
| Ownership | 25 | Same shape as RCOGP |
| MC | 21 | Board 2+1, Exec 2+1, **Other Exec 10+4** (75% / 38% targets), Disabled 1 |
| Skills Development | 23 | Banded by management level: 2+2+3+4+4+1+4+3 = 23 `[CONFLICT]` Ground Truth states 23 but breakdown shape differs by sub-sector — needs FSC-domain expert confirmation |
| Preferential Procurement | 24 | 5+3+2+7+3+2+2 = 24 (no Empowerment Financing for Others sub-sector) |
| Supplier Development | 10 | 2% NPAT |
| Enterprise Development | 9 | 5 base + 1 grad + 3 bonus |
| Socio-Economic Development | 8 | SED 3 + Consumer Education 2 + bonus 3 = 8 |

Levels: FSC scaled (§2.3 above).

FSC sub-sector variants exist (Banks, Long-Term Insurers, Short-Term Insurers, Others). Only **Others** is implemented in `sectorConfig.ts`. Banks/Insurers each have their own gazetted scorecards including the Empowerment Financing and Access to Financial Services elements that the `SectorConfig` interface already declares as optional pillars but never populates. **`[UNVERIFIED]` for non-Others FSC sub-sectors.**

---

## 8. AGRI Generic — full ledger (132 pts)

Source: `docs/SCORECARD_GROUND_TRUTH.md` §6; `docs/toolkits/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx`; `docs/toolkits/extracted_AGRI_Generic.json`.

| Pillar | Pts | Notes |
|---|---|---|
| Ownership | 25 | Same shape as RCOGP; includes farm workers in designated groups |
| MC | 23 | Same shape as ICT MC |
| Skills Development | 25 | Breakdown **8 + 4 + 4 + 4 + 5 = 25** — different from RCOGP's 6/4/4/6/5 split |
| Preferential Procurement | 27 | 5+3+4+9+4+2 = 27 |
| Supplier Development | 10 | 2% NPAT |
| Enterprise Development | 7 | 5 base + 1 grad + 1 jobs |
| Socio-Economic Development | 15 | Agriculture-specific community development |

Levels: standard scale (§2.1 above).

---

## 9. Transport Sector (Road Freight Large) — full ledger (108 pts)

**Source**: `docs/Transport Codes.xlsx`, sheet `Road Freight Large` (rows 2–48). The sheet is canonical — the GRAND TOTAL row 48 column D states **108**.

| Element (toolkit label) | Indicator | Pts | Target | Source row |
|---|---|---|---|---|
| **Ownership (total 24)** | Voting rights — Black people | 3 | 25% + 1 vote | row 3 |
| | Voting rights — Black women | 2 | 10% | row 4 |
| | Economic interest — Black | 4 | 25% | row 5 |
| | Economic interest — Black women | 2 | 10% | row 6 |
| | Economic interest — Black designated / ESOP / BBOS / co-ops | 1 | 2.5% | row 7 |
| | Net Value | 7 | 60% | row 8 |
| | Ownership Fulfilment | 1 | yes | row 9 |
| | Bonus — Black New Entrants | 2 | 10% | row 10 |
| | Bonus — ESOP / BBOS / co-ops | 2 | 10% | row 11 |
| **Management Control (total 11) — SEPARATE pillar in Transport** | Black board (voting rights) | 1.5 | 50% | row 13 |
| | Black women board (voting rights) | 1.5 | 25% | row 14 |
| | Black executive directors | 1 | 50% | row 15 |
| | Black women executive directors | 1 | 25% | row 16 |
| | Black senior top management | 1.5 | 40% | row 17 |
| | Black women senior top management | 1.5 | 20% | row 18 |
| | Black other top management | 1 | 40% | row 19 |
| | Black women other top management | 1 | 20% | row 20 |
| | Bonus — Black independent non-exec board | 1 | 40% | row 21 |
| **Employment Equity (total 18) — SEPARATE pillar in Transport** | Black senior management | 2.5 | 43% | row 23 |
| | Black women senior management | 2.5 | 22% | row 24 |
| | Black middle management | 1.5 | 63% | row 25 |
| | Black women middle management | 1.5 | 32% | row 26 |
| | Black junior management | 1.5 | 68% | row 27 |
| | Black women junior management | 1.5 | 34% | row 28 |
| | Black women semi/unskilled | 2 | 15% | row 29 |
| | Black people with disabilities | 1 | 2% | row 30 |
| | Black women with disabilities | 1 | 1% | row 31 |
| | Bonus — meet/exceed EAP targets | 3 | yes | row 32 |
| **Skills Development (total 15)** | SD spend on Black employees (% leviable) | 3 | 3% | row 34 |
| | SD spend on Black women employees (% leviable) | 3 | 1.5% | row 35 |
| | SD spend on Black disabled employees | 1.5 | 0.3% | row 36 |
| | SD spend on Black women disabled employees | 1.5 | 0.15% | row 37 |
| | Black employees in B/C/D programmes (% headcount) | 3 | 5% | row 38 |
| | Black women employees in B/C/D programmes | 3 | 2.5% | row 39 |
| **Preferential Procurement (total 20)** | B-BBEE compliant suppliers (% TMPS) | 12 | 50% | row 41 |
| | EME + QSE suppliers | 3 | 10% | row 42 |
| | 50% Black-owned suppliers | 3 | 9% | row 43 |
| | 30% Black women-owned suppliers | 2 | 6% | row 44 |
| **Enterprise Development (total 15)** — **toolkit labels this "Enterprise Development" but the formula is SD-style (% NPAT)** | Supplier development initiatives (% NPAT) | 15 | 3% NPAT | row 46 |
| **Socio-Economic Development (total 5)** | Social development programmes (% NPAT) | 5 | 1% NPAT | row 47 |

**Notes**:
- The "Notes" sheet (`docs/Transport Codes.xlsx`) defines the **sub-minimum target matrix** for Transport: Voting rights B/BW = 50%/25%; Executive Directors = 50%/20%; Senior Top = 40%/20%; Other Top = 40%/20%.
- Adjusted Recognition for Gender applies to MC, EE and Skills.
- The toolkit uses the label "Enterprise Development" for what is functionally a Supplier Development pillar — this is a known labelling quirk of the gazetted Transport Code.

---

## 10. Transport Sector (Road Freight QSE) — full ledger (107 pts)

**Source**: `docs/Transport Codes.xlsx`, sheet `Road Freight QSE` (rows 2–24).

**Structure**: 3 compulsory pillars (Ownership 28 + MC 27 + EE 27 = 82) + **choose ONE** of 4 elective pillars (Skills Dev 25 / PP 25 / Enterprise Dev 25 / SED 25). The chosen elective contributes 25 to the total → 82 + 25 = 107.

| Element | Indicator | Pts | Target | Source row |
|---|---|---|---|---|
| **Ownership — compulsory (28)** | Voting rights — Black | 6 | 25% + 1 vote | row 3 |
| | Economic interest — Black | 9 | 25% | row 4 |
| | Ownership fulfilment | 1 | yes | row 5 |
| | Net Value | 9 | 60% | row 6 |
| | Bonus — Black women | 2 | 10% | row 7 |
| | Bonus — Black ESOP/BBOS/co-ops | 1 | 10% | row 8 |
| **Management Control — compulsory (27)** | Black representation at top management | 25 | 50.1% | row 10 |
| | Bonus — Black women at top management | 2 | 25% | row 11 |
| **Employment Equity — compulsory (27)** | Black employees as % of all management | 7.5 | 40% | row 13 |
| | Black women as % of all management | 7.5 | 20% | row 14 |
| | Black employees as % of total employees | 5 | 60% | row 15 |
| | Black women as % of total employees | 5 | 30% | row 16 |
| | Bonus — meet/exceed EAP per category | 2 | yes | row 17 |
| **Skills Dev — elective (25)** | SD on Black employees (% leviable) | 12.5 | 2% | row 19 |
| | SD on Black women employees (% leviable) | 12.5 | 1% | row 20 |
| **Preferential Procurement — elective (25)** | Procurement spend from B-BBEE suppliers (single indicator) | 25 | 40% TMPS | row 22 |
| **Enterprise Development — elective (25)** | Qualifying contributions (% NPAT) | 25 | 2% NPAT | row 23 |
| **Socio-Economic Development — elective (25)** | Qualifying contributions (% NPAT) | 25 | 1% NPAT | row 24 |

**Engine semantic**: only **one** elective pillar counts. The other three must be displayed as "elective — not chosen" or hidden. Current `sectorConfig.ts` marks them with `chooseOneGroup: 'transport_qse_elective'` but the Super Admin UI does not visually indicate this — see fix plan §3.

---

## 11. Construction QSE — full ledger (110 pts)

**Source**: `apps/api/pipeline/constructionIndicators.ts` lines 89–330. The header comment cites a "CONSTRUCTION_QUALIFYING_SMALL_ENTERPRISE_(QSE)_SCORECARD" docx that is **not present in the workspace**. The pillar totals (30 + 20 + 26 + 29 + 5 = 110) are internally consistent.

`[UNVERIFIED]` against an external gazette. **Flagged for expert review.** A specific point: the QSE Skills Development row labelled "SD Expenditure on Black People — secondary tier" is explicitly marked `TODO(verify)` in source — the target "25%" is described as ambiguous in the original docx.

| Element | Indicator | Pts | Target |
|---|---|---|---|
| **Ownership (30)** | Voting rights — Black | 5.5 | 30% |
| | Voting rights — Black women | 2 | 10% |
| | Economic interest — Black | 5.5 | 30% |
| | Economic interest — Black women | 2 | 10% |
| | Designated groups / new entrants | 7 | 10% `[UNVERIFIED]` ambiguous in source |
| | Net Value (Annex CSC 100) | 5 | calc |
| | Bonus — voting+economic ≥40% | 1.5 | 40% |
| | Bonus — Black women voting+economic ≥12.5% | 1.5 | 12.5% |
| **Management Control (20)** | Black executive management | 5 | 50% |
| | Black women executive management | 2 | 20% |
| | Black senior+middle management | 6 | 20% |
| | Black women senior+middle | 2 | 10% |
| | Black junior management | 4 | 40% |
| | Black women junior | 1 | 20% |
| **Skills Development (26)** | SD spend Black (% leviable) | 14 | 1.5% |
| | SD spend Black — secondary tier `[UNVERIFIED]` | 7 | 25% |
| | SD spend Black disabled | 3 | 3% |
| | Bonus — absorption | 1 | 100% |
| | Bonus — industry registration | 1 | 50% |
| **Enterprise & Supplier Development (29)** | PP from all empowering suppliers (% TMPS) | 13 | 60% |
| | PP from ≥51% Black-owned | 5 | 17.5% |
| | PP from ≥35% Black women-owned | 4 | 7.5% |
| | SD contributions (% NPAT) | 7 | 1% NPAT |
| **Socio-Economic Development (5)** | SED contributions (% NPAT) | 3 | 1% NPAT |
| | Bonus — SED in limited-services communities | 2 | 50% above |

---

## 12. Construction Contractor — full ledger (123 pts)

**Source**: `docs/Construction sector codes.docx` (table #1 in the docx — column 2 "Weight" and column 3 "Target"). Totals explicit: Ownership 31, MC 22, Skills 26, ESD 38, SED 6 = 123. ✓

| Element | Indicator | Pts | Target | Source |
|---|---|---|---|---|
| **Ownership (31)** | Voting rights — Black | 4.5 | 35% | docx row 4 |
| | Voting rights — Black women | 2 | 14% | docx row 5 |
| | Economic interest — Black | 4.5 | 35% | docx row 7 |
| | Economic interest — Black women | 2 | 14% | docx row 8 |
| | Economic interest — Black designated groups | 3 | 12% | docx row 9 |
| | Black new entrants | 5 | 5% | docx row 10 |
| | Net Value | 6 | calc | docx row 12 |
| | Bonus — voting Black >50% | 1 | yes | docx row 13 |
| | Bonus — voting Black >75% | 2 | yes | docx row 14 |
| | Bonus — voting Black women >50% | 1 | yes | docx row 15 |
| **Management Control (22)** | Black board (voting rights) | 3 | 50% | docx row 18 |
| | Black women board | 1 | 20% | docx row 19 |
| | Black executive directors | 2 | 50% | docx row 20 |
| | Black women executive directors | 1 | 20% | docx row 21 |
| | Bonus — exceeding Black exec dir | 1 | >50% | docx row 22 |
| | Bonus — exceeding Black women exec dir | 1 | >20% | docx row 23 |
| | Black other executive management | 2 | 60% | docx row 25 |
| | Black women other executive management | 1 | 30% | docx row 26 |
| | Black senior management | 2 | 60% | docx row 28 |
| | Black women senior management | 0.5 | 30% | docx row 29 |
| | Black middle management | 1 | 75% | docx row 31 |
| | Black women middle management | 0.5 | 30% | docx row 32 |
| | Black junior management | 1 | 88% | docx row 34 |
| | Black women junior management | 0.5 | 35% | docx row 35 |
| | Black employees with disabilities | 0.5 | 2% | docx row 37 |
| | Black professionally registered employees | 2 | 50% | docx row 39 |
| | Bonus — Black youth employees | 2 | 30% | docx row 41 |
| **Skills Development (26)** | SD on Black people (% leviable) | 4 | 3% | docx row 45 |
| | SD on African People per Stats SA EAP | 2 | %EAP | docx row 47 |
| | SD on Black management (exec/senior/middle) | 2 | 15% | docx row 48 |
| | SD on Black junior management | 1 | 10% | docx row 49 |
| | Bursaries / scholarships — Black | 2 | 15% | docx row 50 |
| | Cat A/B/C/D learning programmes | 3 | 2.5% | docx row 52 |
| | Black industry-body candidates | 3 | 60% | docx row 53 |
| | Disabled on programmes | 1 | 5% | docx row 54 |
| | Mentorship programme (Annex CSC300 C) | 3 | yes | docx row 56 |
| | Bonus — absorption | 1 | 100% | docx row 58 |
| | Bonus — mentorship promotion | 2 | 15% | docx row 59 |
| | Bonus — professional registration | 2 | 60% | docx row 60 |
| **Enterprise & Supplier Development (38)** | PP from all empowering suppliers | 6 | 80% TMPS | docx row 64 |
| | PP from EME | 3 | 15% TMPS | docx row 65 |
| | PP from QSE | 3 | 15% TMPS | docx row 66 |
| | PP from ≥51% Black-owned | 4 | 20% TMPS | docx row 67 |
| | PP from ≥35% Black women-owned | 3 | 12% TMPS | docx row 68 |
| | Bonus — PP from ≥51% Black designated groups | 3 | 20% TMPS | docx row 70 |
| | Bonus — PP from ≥51% Black women-owned | 1 | 8% TMPS | docx row 71 |
| | Supplier & contractor development programmes (Annex CSC 400) | 5 | yes | docx row 73 |
| | SD contributions | 8 | 3% NPAT | docx row 75 |
| | SD contributions to ≥51% Black women-owned | 2 | 20% of (3% NPAT) | docx row 76 |
| **Socio-Economic Development (6)** | SED contributions | 4 | 1.25% NPAT | docx row 80 |
| | SED above-spend on limited-services communities | 1 | 30% above | docx row 81 |
| | Bonus — Structured SED projects | 1 | 1.25% NPAT | docx row 82 |

---

## 13. Construction BEP (Built Environment Professional) — full ledger (123 pts)

**Source**: `docs/Construction sector codes.docx` (columns 4 "Weight" and 5 "Target"). Totals explicit: 31 + 22 + 34 + 30 + 6 = 123. ✓

Differences vs Contractor:
- Ownership targets marked `*` — more than 50% of total ownership must be held by individuals who are both professionally registered in a BEP statutory council AND members of Executive Management; otherwise only 50% of non-qualifying owners' Black ownership counts.
- MC has **no Junior Management row** (BEP scorecard ends at Middle Management).
- Skills weights are heavier in bursaries (4 vs 2), professional registration bonus (4 vs 2), and Cat A/B/C/D programmes (4 vs 3). Total 34.
- ESD weights are smaller for QSE (2 vs 3), bonus designated groups (2 vs 3), SD contributions (4 vs 8). Total 30.
- SED structure identical to Contractor. Total 6.

Full table omitted for brevity — `apps/api/pipeline/constructionIndicators.ts` BEP_INDICATORS array is the canonical machine-readable form and matches the docx weights row-for-row.

---

## 14. Sub-minimum priority element rules

Source: `docs/SCORECARD_GROUND_TRUTH.md` §9.

| Element | Sub-min rule | Threshold | Applies to |
|---|---|---|---|
| Ownership | 40% of **Net Value points** | 3.2 / 8 | Generic + QSE |
| Skills Development | 40% of total pillar base | 8 / 20 (base) | Generic; QSE must choose SD or ESD |
| Preferential Procurement | 40% of base points | 10.8 / 27 (Generic RCOGP) | Generic |
| Supplier Development | 40% of points | 4 / 10 | Generic |
| Enterprise Development | 40% of base points | 2 / 5 | Generic |

**Important nuance** that the codebase currently mis-represents: Ownership's sub-minimum is only on the **Net Value** sub-element, not on the whole pillar. The code's `subMinimumPercent: 40` on the Ownership pillarConfig will, if interpreted literally by the UI, suggest the threshold is 40% of 25 = 10 pts. The correct UI copy must read "40% of Net Value points (3.2 / 8)" — see fix plan §3.

For Transport Large and Transport QSE: the toolkit's "Notes" sheet defines a separate **sub-minimum target matrix** for MC indicators (Voting 50%/25%, Exec Dir 50%/20%, Senior Top 40%/20%, Other Top 40%/20%). Code does not model these.

---

## 15. Open items / `[UNVERIFIED]` flags requiring expert review

1. **Construction QSE source docx** — not present in workspace; entire QSE indicator set inherits from internal extraction. Highest priority for expert verification.
2. **Construction level thresholds** — no canonical mapping from absolute points to B-BBEE levels; placeholder uses STANDARD_LEVELS which is wrong for 110/123-pt scorecards.
3. **FSC sub-sector variants** — Banks, Long-Term Insurers, Short-Term Insurers all need their own ledger entries; currently only "Others" is implemented and even that has skills/PP breakdown inconsistencies between Ground Truth and the extracted JSON.
4. **Transport Large / Transport QSE level thresholds** — derived by linear scaling; no canonical table sighted.
5. **ICT QSE MC sub-row breakdown** — Ground Truth §7 only states the total (15 pts); per-row weights are inferred from `docs/toolkits/extracted_ICT_QSE.json`. Should be confirmed by expert.
6. **RCOGP QSE — Designated Group bonus** — Ground Truth shows PP=21 for QSE but doesn't explicitly state whether the 2 pt DG bonus row exists for QSE. Currently `dgMaxPts: 2` in code; expert to confirm.
7. **Skills Category F & G caps** — Ground Truth §16 has F=15% and G=15% caps; the `STANDARD_CATEGORY_WEIGHTINGS` array in code has E=25% (no description override) and F=15%, G=0. Three-way disagreement between Training Pack (§16), Domain doc, and code. Expert to confirm authoritative caps.
8. **Liquid Fuels / Media / other sector codes** — listed as outstanding in `BBBEE_ONTOLOGY_EXPERT_GUIDE.md` §1. Not in scope for current ledger but flagged.

---
