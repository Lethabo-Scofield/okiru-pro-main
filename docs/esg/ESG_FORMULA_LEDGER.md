# ESG FORMULA LEDGER — authoritative

**Source of truth:** `docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx`, as extracted to
`docs/esg/extracted/*.json` (full cell + formula dump; the `*.md` siblings are truncated to the first
30 rows and must NOT be used as the source).

**Status:** every formula below is verbatim from the workbook. Where this document and any other doc
in `docs/esg/` disagree, this document wins. Implementation agents code against this file.

**Scope of sheets read:** E_Scorecard, S_Scorecard, G_Scorecard, E_Data, S_Data, G_Data, Assumptions,
Waste_Register, Fleet_Register, ISO_Tracker, SAQ_Supplier, King5_Scorecard, IFRS_S1_S2, GARP_GRAP,
EE_Scorecard, Carbon_Tax, NetZero_Roadmap, B_BBEE_ESG, Driver_Debrief, Validation, ESG_Dashboard.

---

## Conventions

* **Indicator id** = the scorecard row number, prefixed `d` (the id used by
  `apps/web/EsgToolkit/src/lib/calculators/*.ts` `rows` records). `d5` on E = `E_Scorecard` row 5.
* Column **A** = label, **B** = max points, **C** = computed "Actual", **D** = final score,
  **F** = status text, **I** = the workbook's own audit note.
* **Every** row's D cell is `=MIN(Cn,Bn)`. **Every** row's F cell is
  `=IF(Dn>=Bn,"✓ Met",IF(Dn>=Bn*0.5,"⚠ Partial","✗ Gap"))`. These are not repeated per row below.
* Classification:
  * `FORMULA` — column C holds a real Excel formula.
  * `MANUAL_ZERO` — column C is a literal `0` with **no** formula. The workbook itself never computed
    the indicator. These are listed again in Part 5.
* Rows 4, 10, 14, 18, 22, 25 (E), 4, 11, 16, 21, 25 (S) and 4, 8, 11, 13, 15, 18, 21, 23 (G) are
  section-divider rows (`── GHG ──` etc.) with no B/C/D. They are not indicators.

### The workbook's own column-I notes are unreliable

The scorecards carry a documentation column I ("Audit / Calculation"). Several of its cell references
are stale and contradict the live formula — e.g. E row 6 note says `Assumptions B36` but the formula
reads `Assumptions!$B$43`; E row 9 note says `B105` but the formula reads `$B$107`. **The formula is
authoritative; the note is not.** Same for the Assumptions sheet's own column F "Cell ref" strings
(see Part 3).

---

# Part 1 — Indicator ledger

## 1A. Environmental — `E_Scorecard` rows 5–29, total row 30

`E_Scorecard!D30 = =SUM(D5,D6,D7,D8,D9,D11,D12,D13,D15,D16,D17,D19,D20,D21,D23,D24,D26,D27,D28,D29)`
→ **36**. `E30` (a label, not a number) reads `108 pts max`.

| id | Label (verbatim col A) | Max (B) | Exact C-column formula | Cells read (fully qualified) | Class | TS status — `EsgToolkit/src/lib/calculators/environmental.ts` |
|---|---|---|---|---|---|---|
| **d5** | `GHG: Scope 1 baseline established & tracked` | 5 | `=IF(E_Data!L19>0,5,0)` | `E_Data!L19` | FORMULA | **correct port** — `l19 > 0 ? 5 : 0` |
| **d6** | `GHG: Scope 1 reduction vs prior year` | 10 | `=IFERROR(IF(E_Data!$B$90=0,0,IF((E_Data!$B$90-E_Data!$F$90)/E_Data!$B$90>=Assumptions!$B$43,10,IF((E_Data!$B$90-E_Data!$F$90)/E_Data!$B$90>=Assumptions!$B$43*Assumptions!$B$9,10*((E_Data!$B$90-E_Data!$F$90)/E_Data!$B$90)/Assumptions!$B$43,0))),0)` | `E_Data!B90`, `E_Data!F90`, `Assumptions!B43`, `Assumptions!B9` | FORMULA | **correct port** — `pr(yoy, thr, 10, floor)` guarded on `b90 > 0` |
| **d7** | `GHG: Scope 2 net reduction (solar offset)` | 8 | `=IFERROR(IF(E_Data!$M$80=0,0,IF(-E_Data!$M$81/E_Data!$M$80>=Assumptions!$B$44,8,IF(-E_Data!$M$81/E_Data!$M$80>=Assumptions!$B$44*Assumptions!$B$9,8*(-E_Data!$M$81/E_Data!$M$80)/Assumptions!$B$44,0))),0)` | `E_Data!M80`, `E_Data!M81`, `Assumptions!B44`, `Assumptions!B9` | FORMULA (**broken — reads two cells that do not exist**) | **hardcoded 0** (`const d7 = 0;`). Matches the workbook only because the workbook itself is broken. See Part 2 — `E_Data!M80/M81` are empty; the real cells are `L80`/`L81`. |
| **d8** | `GHG: Scope 3 tracking initiated` | 5 | `=IF(E_Data!$L$63>0,5,0)` | `E_Data!L63` | FORMULA | **correct port** — `num(wb,"L63") > 0 ? 5 : 0` |
| **d9** | `GHG: Net-zero target formally set (SBTi)` | 5 | `=IF(AND(Assumptions!$B$107>=2030,Assumptions!$B$107<=2060),5,IF(Assumptions!$B$107>0,2.5,0))` | `Assumptions!B107` | FORMULA | **correct port** |
| **d11** | `Energy: kWh data tracked monthly (all 5 depots)` | 5 | `=IF(E_Data!L46>0,5,0)` | `E_Data!L46` | FORMULA | **correct port** |
| **d12** | `Energy: Energy efficiency improvement YoY` | 5 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful to workbook |
| **d13** | `Energy: % renewable electricity ≥20%` | 8 | `=IFERROR(IF(E_Data!$L$46=0,0,IF((E_Data!$L$50+E_Data!$L$51+E_Data!$L$52+E_Data!$L$53+E_Data!$L$54)/E_Data!$L$46>=Assumptions!$B$44,8,IF((E_Data!$L$50+E_Data!$L$51+E_Data!$L$52+E_Data!$L$53+E_Data!$L$54)/E_Data!$L$46>=Assumptions!$B$44*Assumptions!$B$9,8*((E_Data!$L$50+E_Data!$L$51+E_Data!$L$52+E_Data!$L$53+E_Data!$L$54)/E_Data!$L$46)/Assumptions!$B$44,0))),0)` | `E_Data!L46`, `E_Data!L50`, `E_Data!L51`, `E_Data!L52`, `E_Data!L53`, `E_Data!L54`, `Assumptions!B44`, `Assumptions!B9` | FORMULA | **hardcoded 0** (`const d13 = 0;`) — `thrRenew` is read on line 31 and never used. Matches golden only because all solar is 0. **Must be ported.** |
| **d15** | `Fleet: L/100km within norm (all vehicles)` | 8 | `=IFERROR(IF(COUNTA(Fleet_Register!$A$4:$A$19)=0,0,8*SUMPRODUCT((Fleet_Register!$K$4:$K$19>0)*(Fleet_Register!$K$4:$K$19<=Fleet_Register!$L$4:$L$19*Assumptions!$B$45))/MAX(1,COUNTIF(Fleet_Register!$K$4:$K$19,">0"))),0)` | `Fleet_Register!A4:A19`, `Fleet_Register!K4:K19`, `Fleet_Register!L4:L19`, `Assumptions!B45` | FORMULA | **hardcoded 0** — `environmental.ts` never reads the `fleet` section at all. **Must be ported.** |
| **d16** | `Fleet: Fleet CO₂ per tonne-km tracked` | 5 | `=IF(SUMPRODUCT((Fleet_Register!$F$4:$F$19>0)*(Fleet_Register!$I$4:$I$19>0))>0,5,0)` | `Fleet_Register!F4:F19`, `Fleet_Register!I4:I19` | FORMULA | **hardcoded 0**. **Must be ported.** |
| **d17** | `Fleet: EV vehicles as % of fleet` | 5 | `=IFERROR(IF(Fleet_Register!$B$28=0,0,IF(Fleet_Register!$H$28/Fleet_Register!$B$28>=Assumptions!$B$46,5,IF(Fleet_Register!$H$28/Fleet_Register!$B$28>=Assumptions!$B$46*Assumptions!$B$9,5*(Fleet_Register!$H$28/Fleet_Register!$B$28)/Assumptions!$B$46,0))),0)` | `Fleet_Register!B28`, `Fleet_Register!H28`, `Assumptions!B46`, `Assumptions!B9` | FORMULA | **hardcoded 0**. **Must be ported.** Note `B28`/`H28` are **text** `"134"`/`"0"` in the workbook, not numbers. |
| **d19** | `Waste: Diversion rate ≥75% (target 91%+)` | 5 | `=IFERROR(IF(Waste_Register!$B$16>=Assumptions!$B$48,5,IF(Waste_Register!$B$16>=Assumptions!$B$48*Assumptions!$B$9,5*Waste_Register!$B$16/Assumptions!$B$48,0)),0)` | `Waste_Register!B16`, `Assumptions!B48`, `Assumptions!B9` | FORMULA | **correct port** — `pr(waste(wb,"B16"), thrWaste, 5, floor)`. But `Waste_Register!B16` has **no input path** (Part 2). |
| **d20** | `Waste: Cardboard recycling tracked (Cority)` | 4 | `=IF(Waste_Register!$B$17>0,4,0)` | `Waste_Register!B17` | FORMULA | **correct port**; `B17` has no derivation (Part 2) |
| **d21** | `Waste: Landfill tCO₂e tracked` | 3 | `=IF(Waste_Register!$B$18>0,3,0)` | `Waste_Register!B18` | FORMULA | **correct port**; `B18` has no derivation (Part 2) |
| **d23** | `Water: Monthly consumption tracked (all depots)` | 4 | `=IF(E_Data!L63>0,4,0)` | `E_Data!L63` | FORMULA | **correct port** |
| **d24** | `Water: Water efficiency initiative active` | 3 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful |
| **d26** | `ISO 14001: Certification achieved/in progress` | 8 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful |
| **d27** | `ISO 14001: Aspects register maintained` | 4 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful |
| **d28** | `Environmental policy — board approved` | 4 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful |
| **d29** | `NEMA/NWA/NEMWA legal compliance` | 4 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful |

**E max points as scored:** 5+10+8+5+5+5+5+8+8+5+5+5+4+3+4+3+8+4+4+4 = **108** (= `PILLAR_MAX_ENVIRONMENTAL`).

## 1B. Social — `S_Scorecard` rows 5–27, total row 28

`S_Scorecard!D28 = =SUM(D5,D6,D7,D8,D9,D10,D12,D13,D14,D15,D17,D18,D19,D20,D22,D23,D24,D26,D27)` → **33**.

| id | Label (verbatim col A) | Max (B) | Exact C-column formula | Cells read | Class | TS status — `social.ts` |
|---|---|---|---|---|---|---|
| **d5** | `EE: % Black employees (all levels) vs 60% target` | 8 | `=IFERROR(IF(EE_Scorecard!$B$5>=Assumptions!$B$50,8,IF(EE_Scorecard!$B$5>=Assumptions!$B$50*Assumptions!$B$9,8*EE_Scorecard!$B$5/Assumptions!$B$50,0)),0)` | `EE_Scorecard!B5`, `Assumptions!B50`, `Assumptions!B9` | FORMULA | **correct port** — `pr(blackPct, thrBlack, 8, floor)` |
| **d6** | `EE: % Black female management (L1-L3) vs 30%` | 6 | `=IFERROR(IF((S_Data!$L$5+S_Data!$L$6)=0,0,IF((S_Data!$F$5+S_Data!$F$6+S_Data!$G$5+S_Data!$G$6+S_Data!$H$5+S_Data!$H$6)/(S_Data!$L$5+S_Data!$L$6)>=Assumptions!$B$51,6,IF((S_Data!$F$5+S_Data!$F$6+S_Data!$G$5+S_Data!$G$6+S_Data!$H$5+S_Data!$H$6)/(S_Data!$L$5+S_Data!$L$6)>=Assumptions!$B$51*Assumptions!$B$9,6*((S_Data!$F$5+S_Data!$F$6+S_Data!$G$5+S_Data!$G$6+S_Data!$H$5+S_Data!$H$6)/(S_Data!$L$5+S_Data!$L$6))/Assumptions!$B$51,0))),0)` | `S_Data!F5`, `F6`, `G5`, `G6`, `H5`, `H6`, `L5`, `L6`, `Assumptions!B51`, `Assumptions!B9` | FORMULA | **hardcoded 0** (`const d6 = 0;`). **Must be ported.** Label says L1-L3 but the formula covers only rows 5+6 = EEA2 L1+L2. |
| **d7** | `EE: EE Plan submitted & compliant` | 5 | `=IF(EE_Scorecard!$B$9="Yes",5,IF(EE_Scorecard!$B$9="Partial",2.5,0))` | `EE_Scorecard!B9` | FORMULA | **correct port** — `yesPartialNo(ee B9, 5)` |
| **d8** | `EE: % Persons with Disabilities vs 2%` | 5 | `=IFERROR(IF(EE_Scorecard!$B$8>=Assumptions!$B$52,5,IF(EE_Scorecard!$B$8>=Assumptions!$B$52*Assumptions!$B$9,5*EE_Scorecard!$B$8/Assumptions!$B$52,0)),0)` | `EE_Scorecard!B8`, `Assumptions!B52`, `Assumptions!B9` | FORMULA | **correct port**, but `EE_Scorecard!B8` has **no input** (Part 2) → permanently 0 |
| **d9** | `EE: EE forum/TD consultation active` | 3 | `=IF(EE_Scorecard!$B$10="Yes",3,IF(EE_Scorecard!$B$10="Partial",1.5,0))` | `EE_Scorecard!B10` | FORMULA | **correct port** |
| **d10** | `EE: EE numerical targets set and tracked` | 3 | `=IF(EE_Scorecard!$B$12="Yes",3,IF(EE_Scorecard!$B$12="Partial",1.5,0))` | `EE_Scorecard!B12` | FORMULA | **correct port**, but `EE_Scorecard!B12` has **no input** (Part 2) → permanently 0 |
| **d12** | `WSP: WSP submitted to SETA on time` | 5 | `=IF(S_Data!B45="Yes",5,0)` | `S_Data!B45` | FORMULA | **correct port** (note: workbook has no `Partial` branch here; TS matches) |
| **d13** | `WSP: ATR submitted on time` | 5 | `=IF(S_Data!B46="Yes",5,0)` | `S_Data!B46` | FORMULA | **correct port** |
| **d14** | `WSP: Training hours per employee ≥40 hours` | 5 | `=IFERROR(IF(S_Data!$L$12=0,0,IF(S_Data!$B$49/S_Data!$L$12>=Assumptions!$B$53,5,IF(S_Data!$B$49/S_Data!$L$12>=Assumptions!$B$53*Assumptions!$B$9,5*(S_Data!$B$49/S_Data!$L$12)/Assumptions!$B$53,0))),0)` | `S_Data!L12`, `S_Data!B49`, `Assumptions!B53`, `Assumptions!B9` | FORMULA | **correct port** |
| **d15** | `WSP: Mandatory grant recovery ≥80%` | 5 | `=IFERROR(IF(S_Data!$B$44=0,0,IF(S_Data!$B$47/S_Data!$B$44>=Assumptions!$B$54,5,IF(S_Data!$B$47/S_Data!$B$44>=Assumptions!$B$54*Assumptions!$B$9,5*(S_Data!$B$47/S_Data!$B$44)/Assumptions!$B$54,0))),0)` | `S_Data!B44`, `S_Data!B47`, `Assumptions!B54`, `Assumptions!B9` | FORMULA | **correct port of the formula, WRONG CELL SEMANTICS upstream** — `S_Data!B44` is *SDL levy paid* (`=IFERROR(B43*0.01,0)`), but `S_DATA_PAYROLL_FIELDS` labels `B44` as **"NPAT (R)"** and lets a user type NPAT into it. See Part 2. |
| **d17** | `H&S: LTIFR ≤ 2.0` | 8 | `=IFERROR(IF(S_Data!$G$35=0,0,IF(S_Data!$G$35<=Assumptions!$B$55,8,IF(S_Data!$G$35<=Assumptions!$B$55/Assumptions!$B$9,MAX(0,8*(1+Assumptions!$B$9-S_Data!$G$35/Assumptions!$B$55)),0))),0)` | `S_Data!G35`, `Assumptions!B55`, `Assumptions!B9` | FORMULA | **correct port** — `prLtifr(ltifr, thrLtifr, 8, floor)` |
| **d18** | `H&S: Zero fatalities` | 8 | `=IFERROR(IF(OR(S_Data!$G$28=0,S_Data!$G$28="—",S_Data!$G$28=""),8,0),0)` | `S_Data!G28` | FORMULA | **correct port** (incl. the em-dash and blank branches) |
| **d19** | `H&S: Driver fatigue programme active` | 5 | `=IF(S_Data!$C$59>0,5,0)` | `S_Data!C59` | FORMULA | **correct port + extra** — TS also accepts `driver-debrief!_active > 0` as an alternative trigger. Superset of the workbook; document as an intentional divergence or remove. |
| **d20** | `H&S: Incident investigation rate 100%` | 4 | `=IF(SUM(S_Data!$G$29:$G$33)>0,4,0)` | `S_Data!G29:G33` | FORMULA | **wrong cells** — TS reads only `S_Data!G29`, not the `G29:G33` sum. Same golden result (both > 0) but diverges when only MTI/near-miss/vehicle incidents exist. |
| **d22** | `Community: CSI/SED spend ≥1% NPAT` | 5 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful |
| **d23** | `Community: Social calendar initiatives ≥6 pa` | 5 | `=IFERROR(IF(COUNTA(S_Data!$A$72:$A$79)>=6,5,IF(COUNTA(S_Data!$A$72:$A$79)>=6*Assumptions!$B$9,5*COUNTA(S_Data!$A$72:$A$79)/6,0)),0)` | `S_Data!A72:A79` | FORMULA | **correct port** — count sourced from the `s-data-csi` grid via `deriveEsgSummaryCells` → `s-data!_initiatives_count`. Threshold `6` is hardcoded in the workbook, not an Assumptions cell. |
| **d24** | `Community: Local labour procurement ≥40%` | 5 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful |
| **d26** | `Supplier: IMS-T-149 H&S compliance ≥80%` | 5 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful |
| **d27** | `Supplier: Supplier food safety rating` | 5 | *(literal `0`, no formula)* | — | **MANUAL_ZERO** | hardcoded 0 — faithful |

**S max points as scored:** 8+6+5+5+3+3+5+5+5+5+8+8+5+4+5+5+5+5+5 = **100** (= `PILLAR_MAX_SOCIAL`).

## 1C. Governance — `G_Scorecard` rows 5–25, total row 26

`G_Scorecard!D26 = =SUM(D5,D6,D7,D9,D10,D12,D14,D16,D17,D19,D20,D22,D24,D25)` → **64.8529411765**.

**There are no MANUAL_ZERO rows in G.** Every C cell holds a formula.

| id | Label (verbatim col A) | Max (B) | Exact C-column formula | Cells read | Class | TS status — `governance.ts` |
|---|---|---|---|---|---|---|
| **d5** | `King V: Score ≥70% (Apply & Explain)` | 25 | `=King5_Scorecard!E21/170*25` | `King5_Scorecard!E21` | FORMULA | **correct port** — `minCap((king5/170)*25, 25)`. `170` = 17 principles × 10, hardcoded in the workbook (also in `King5_Scorecard!E22`). |
| **d6** | `King V: Social & Ethics Committee established` | 5 | `=G_Data!F13` | `G_Data!F13` | FORMULA | **correct port** |
| **d7** | `King V: ESG-linked executive remuneration` | 5 | `=G_Data!F14` | `G_Data!F14` | FORMULA | **correct port** |
| **d9** | `IFRS: S1/S2 disclosures prepared` | 10 | `=IFERROR(10*COUNTIF(IFRS_S1_S2!D4:D40,"Yes")/MAX(1,COUNTA(IFRS_S1_S2!A4:A40)-COUNTBLANK(IFRS_S1_S2!A4:A40)),0)` | `IFRS_S1_S2!D4:D40`, `IFRS_S1_S2!A4:A40` | FORMULA (**structurally always 0**) | **divergent by design** — TS uses `ifrs!_yes_count / ifrs!_total`. The workbook counts `"Yes"` in a column whose validation vocabulary is `Disclosed / Partially Disclosed / Not Disclosed / N/A` — `"Yes"` can never occur, so the workbook value is **always exactly 0**. See Part 5 note. |
| **d10** | `IFRS: Climate risk in board agenda` | 5 | `=G_Data!F23` | `G_Data!F23` | FORMULA | **correct port** |
| **d12** | `GARP: ERM framework includes ESG/climate risks` | 8 | `=IF(G_Data!F21>0,IF(G_Data!F23>0,8,4),0)` | `G_Data!F21`, `G_Data!F23` | FORMULA | **correct port** |
| **d14** | `GARP: GRAP public interest compliance` | 5 | `=IF(G_Data!F5>0,5,0)` | `G_Data!F5` | FORMULA | **correct port** |
| **d16** | `ISO 27001: POPIA Information Officer appointed` | 5 | `=G_Data!F17` | `G_Data!F17` | FORMULA | **correct port** |
| **d17** | `ISO 27001: Cyber/data risk assessed` | 5 | `=G_Data!F18` | `G_Data!F18` | FORMULA | **correct port** |
| **d19** | `Transparency: ESG/Integrated report published` | 8 | `=G_Data!F20*8/5` | `G_Data!F20` | FORMULA | **correct port** |
| **d20** | `Transparency: External assurance of ESG report` | 5 | `=G_Data!F19` | `G_Data!F19` | FORMULA | **correct port** |
| **d22** | `Ethics: Code of ethics + hotline active` | 4 | `=(G_Data!F15+G_Data!F16)/2*4/5` | `G_Data!F15`, `G_Data!F16` | FORMULA | **correct port** |
| **d24** | `Compliance: Legal register maintained` | 5 | `=G_Data!F21` | `G_Data!F21` | FORMULA | **correct port** |
| **d25** | `Compliance: No material regulatory penalties` | 5 | `=IF(G_Data!B25="",5,IF(G_Data!B25=0,5,0))` | `G_Data!B25` | FORMULA | **correct port**, but `G_Data!B25` **does not exist** — G_Data has no row 25 at all. Free 5 points. See Part 2. |

**G max points as scored:** 25+5+5+10+5+8+5+5+5+8+5+4+5+5 = **100** (= `PILLAR_MAX_GOVERNANCE`).

## 1D. Overall

`ESG_Dashboard!D9 = =IFERROR((E_Scorecard!D30/100+S_Scorecard!D28/100+G_Scorecard!D26/100)/3,0)`
→ **0.4461764706**.

Note the divisor is **100 for all three pillars**, even though E is out of 108. This is deliberate in
the workbook and is mirrored by `ESG_D9_PILLAR_DIVISOR = 100` in `apps/web/src/lib/esg/esgScoringDefaults.ts`.

---

# Part 2 — Cell provenance map

Legend: `INPUT` (a user types it) · `DERIVED` (computed from other cells) · **`MISSING`** (read by a
formula but nothing in our app writes it, and no input exists).

Input-component references are to `apps/web/src/components/esg-workbook/esgSectionConfigs.ts` and its
consumers (`EsgWorkbookSectionEditor.tsx`, `EsgMonthlyGrid.tsx`, `EsgHeadcountGrid.tsx`,
`EsgMaturityGrid.tsx`, `EsgRegisterGrid.tsx`). Derivation references are to
`apps/web/src/lib/esg/esgDeriveSummary.ts`.

## 2A. `E_Data`

| Cell | Class | Excel derivation | App status |
|---|---|---|---|
| `E_Data!L14`…`L18` | DERIVED | `=SUM(C14:K14)` … `=SUM(C18:K18)` | monthly cells `s1a_C14`…`s1a_K18` written by `EsgMonthlyGrid cellPrefix="s1a"` (rows from `eDataDepotRows()`); per-row YTD not persisted, only the L19 roll-up |
| **`E_Data!L19`** | DERIVED | `=L14+L15+L16+L17+L18` | **derived** — `esgDeriveSummary.ts` `L19: sumMatching(eCells, r => isMonthCell(r,"s1a"))` |
| `E_Data!L41`…`L45` | DERIVED | `=SUM(C41:K41)` … `=SUM(C45:K45)` | monthly cells via `EsgMonthlyGrid cellPrefix="s2"` |
| **`E_Data!L46`** | DERIVED | `=L41+L42+L43+L44+L45` | **derived** — `L46: sumMatching(eCells, r => isMonthCell(r,"s2"))` |
| **`E_Data!L50`** | DERIVED | `=SUM(C50:K50)` (Solar – ISANDO) | **MISSING derivation.** `eDataSolarRows()` writes `solar_C14`…`solar_K18` (the grid hardcodes row base `14 + rowIndex` for *every* prefix — `EsgMonthlyGrid.tsx` line 52). Nothing rolls these into `L50`. |
| **`E_Data!L51`** | DERIVED | `=SUM(C51:K51)` (Solar – DBN) | **MISSING derivation** (as above) |
| **`E_Data!L52`** | DERIVED | `=SUM(C52:K52)` (Solar – CPT) | **MISSING derivation** |
| **`E_Data!L53`** | DERIVED | `=SUM(C53:K53)` (Solar – BLOEM) | **MISSING derivation** |
| **`E_Data!L54`** | DERIVED | `=SUM(C54:K54)` (Solar – PE) | **MISSING derivation** |
| `E_Data!L58`…`L62` | DERIVED | `=SUM(C58:K58)` … `=SUM(C62:K62)` | monthly cells via `EsgMonthlyGrid cellPrefix="water"` |
| **`E_Data!L63`** | DERIVED | `=L58+L59+L60+L61+L62` | **derived** — `L63: sumMatching(eCells, r => isMonthCell(r,"water"))` |
| `E_Data!L75` | DERIVED | `=SUM(C75:K75)` where `C75 = =E_Data!C14+C15+C16+C17+C18` | `E_DATA_GHG_SUMMARY_FIELDS` entry `{cell:"L75", label:"Scope 1A Fleet Diesel YTD (tCO₂e)"}` (manual override field) |
| `E_Data!L76` | DERIVED | `=SUM(C76:K76)`, `C76 = =E_Data!C23+…+C27` | `E_DATA_GHG_SUMMARY_FIELDS` `L76` |
| `E_Data!L77` | DERIVED | `=SUM(C77:K77)`, `C77 = =E_Data!C32` | `E_DATA_GHG_SUMMARY_FIELDS` `L77` |
| `E_Data!L78` | DERIVED | `=SUM(C78:K78)`, `C78 = =E_Data!C37` | `E_DATA_GHG_SUMMARY_FIELDS` `L78` |
| `E_Data!L79` | DERIVED | `=SUM(L75,L76,L77,L78)` | `E_DATA_GHG_SUMMARY_FIELDS` `L79`; **not** auto-derived by `esgDeriveSummary.ts` |
| **`E_Data!L80`** | DERIVED | `=E_Data!L46` (Scope 2 gross) | **MISSING from the app entirely** — no config entry, no derivation. This is one of the two cells `E_Scorecard!C7` *should* be reading. |
| **`E_Data!L81`** | DERIVED | `=SUM(E_Data!L50+E_Data!L51+E_Data!L52+E_Data!L53+E_Data!L54)` (solar offset) | **MISSING from the app entirely.** The other cell `C7` should read. |
| `E_Data!L82` | DERIVED | `=L80+L81` | `E_DATA_GHG_SUMMARY_FIELDS` `L82` |
| `E_Data!L83` | DERIVED | `=E_Data!L63` (Scope 3 water) | **wrong config cell** — `E_DATA_GHG_SUMMARY_FIELDS` labels **`L84`** "Scope 3 — Water (tCO₂e)". Off by one row. |
| `E_Data!L84` | DERIVED | `=L79+L82+L83` (TOTAL GHG) | **wrong config cell** — `E_DATA_GHG_SUMMARY_FIELDS` labels **`L86`** "TOTAL GHG (Scope 1+2+3) tCO₂e". Off by two rows. |
| `E_Data!L85` | DERIVED | `=IFERROR(L79/L84,0)` (% Scope 1) | not modelled |
| `E_Data!L86` | DERIVED | `=IFERROR(L82/L84,0)` (% Scope 2) | not modelled; **currently mis-mapped as "TOTAL GHG"** |
| **`E_Data!M80`** | **MISSING** | *cell is empty — row 80 stops at column L* | **Read by `E_Scorecard!C7` (8 pts). Nothing writes it; nothing can. `C7` is permanently 0.** |
| **`E_Data!M81`** | **MISSING** | *cell is empty — row 81 stops at column L* | **Read by `E_Scorecard!C7` (8 pts). Permanently 0.** |
| `E_Data!B90` | INPUT | literal `0`; data validation `type=list, formula1="0"` | `E_DATA_NZ_FIELDS` `{cell:"B90", label:"Net-zero baseline tCO₂e (Scope 1+2)", type:"number"}` — currently 0, which is exactly why `d6` (10 pts) is 0 |
| `E_Data!F90` | DERIVED | `=L79+L82` | `E_DATA_NZ_FIELDS` `{cell:"F90", label:"Current YTD Scope 1+2 (derived)"}`; **no auto-derivation** — the user must type it |
| `E_Data!B4`…`B10` | INPUT | emission factors, literals (`2.68 / 2.31 / 1.51 / 0.82 / 0.025 / 0.000344 / 0.58`) | read by `EsgMonthlyGrid emissionFactor` props; not exposed as an editable field group |

> **Data-integrity warning (do not "fix" silently).** Rows 75–84 are labelled `tCO₂e` but the formulas
> copy the **raw activity** rows, not the `M`-column tCO₂e rows. `L75 = 589,465.53` is *litres*;
> `L80 = 2,589,578.44` is *kWh*. `L84 = 3,188,915.34` is therefore a meaningless mixed-unit sum, and it
> propagates into `Carbon_Tax`, `ESG_Dashboard` rows 13–18 and `Validation!B32`. Preserve it bit-for-bit
> for regression parity; raise it as a separate workbook defect.

## 2B. `Waste_Register`

| Cell | Class | Excel derivation | App status |
|---|---|---|---|
| **`Waste_Register!B16`** | DERIVED (**hardcoded constant**) | `=91.1%` — literally a formula whose entire body is the constant `91.1%`. It is **not** computed from `D9/E9/F9`. | **MISSING input.** `environmental.ts` reads `waste!B16`; the golden fixture injects `0.911`; **no UI field writes it and no derivation computes it.** `d19` (5 pts) is unreachable from the manual form. Candidate real rule: `(E9 + recovery) / D9`, or `(SUM(E5:E40))/(SUM(D5:D40))` over the register grid. |
| **`Waste_Register!B17`** | DERIVED | `=AVERAGE(B13:J13)` — the Cority monthly `% Recycled (all depots)` row | **MISSING derivation.** The Cority monthly row is captured by `EsgMonthlyGrid cellPrefix="waste"` via `eDataWasteRows()`, but that grid renders inside the **`e-data`** section (`EsgWorkbookSectionEditor.tsx` "waste" sub-tab), writing `waste_C14`…`waste_K14` into `e-data`. `environmental.ts` reads section **`waste`**, ref `B17`. Wrong section *and* no averaging step. `d20` (4 pts) unreachable. |
| **`Waste_Register!B18`** | DERIVED | `=SUMIF(F4:F40,">0",F4:F40)*0.58/1000` | **MISSING derivation.** The `waste` register grid *does* capture `landfillKg` per row (`ESG_GRID_SECTIONS.waste`, column key `landfillKg`, startRow 5 = column F), so the input exists — nothing aggregates it into `B18`. `d21` (3 pts) unreachable. |
| `Waste_Register!B13:J13` | INPUT | monthly Cority `% Recycled` | written to the wrong section as `e-data!waste_C14`… (see B17) |
| `Waste_Register!D5:F40` | INPUT | `Total kg / Recycled kg / Landfill kg` per row | `EsgRegisterGrid` via `ESG_GRID_SECTIONS.waste` |
| `Waste_Register!G5:G40` | DERIVED | `=IFERROR(E5/D5,0)` per row | grid column `divertedPct` is a plain number input, not derived |
| `Waste_Register!H5:H40` | DERIVED | `=F5*0.58/1000` per row | grid column `landfillTco2` is a plain number input, not derived |
| `Waste_Register!L68/L69/L70` | — | **These refs do not exist on Waste_Register.** They are `E_Data!L68/L69/L70` (`CPT Oricol — Total Waste (kg) = 22470`, `% Landfill = 8.9`, `% Diversion = 91.1`), all literals. | `WASTE_SCALAR_FIELDS` writes `L68/L69/L70` into the **`e-data`** draft. These are the numbers that should feed `Waste_Register!B16` but currently feed nothing. |

## 2C. `Fleet_Register`

| Cell | Class | Excel derivation | App status |
|---|---|---|---|
| `Fleet_Register!A4:A19` | INPUT | vehicle registration | `ESG_GRID_SECTIONS.fleet` column `reg` (required), startRow 4 |
| `Fleet_Register!F4:F19` | INPUT | `Carry (kg)` | `ESG_GRID_SECTIONS.fleet` column `carry` |
| `Fleet_Register!I4:I19` | INPUT | `Monthly km` | `ESG_GRID_SECTIONS.fleet` column `monthlyKm` |
| `Fleet_Register!J4:J19` | INPUT | `Monthly Litres` | `ESG_GRID_SECTIONS.fleet` column `monthlyLitres` |
| `Fleet_Register!K4:K19` | DERIVED | `=IFERROR(J4/I4*100,0)` per row (L/100 km actual) | `ESG_GRID_SECTIONS.fleet` column `l100Actual` is a **plain number input**, not derived from J/I |
| `Fleet_Register!L4:L19` | INPUT | `L/100km Norm` (OEM norm per model, e.g. 26.5, 55) | `ESG_GRID_SECTIONS.fleet` column `l100Norm` |
| `Fleet_Register!M4:M19` | DERIVED | `=J4*E_Data!$B$4/1000` | grid column `monthlyTco2`, plain number input |
| `Fleet_Register!N4:N19` | DERIVED | `=IF(L4=0,"N/A",IF(K4=0,"No data",IF(K4<=L4*1.05,"✓ Good",IF(K4<=L4*1.15,"⚠ Alert","🔴 High"))))` | grid column `serviceStatus`, plain text input. **Note the 1.05/1.15 tolerances are hardcoded here, not read from `Assumptions!B45`.** |
| **`Fleet_Register!B28`** | INPUT (literal, **stored as text `"134"`**) | fleet summary `TOTAL / Total Vehicles`; rows 23–27 (`B23`…`B27`) are also literal text | **MISSING.** No config entry, no derivation. Should be `=SUM(B23:B27)` over the depot summary block. `d17` unreachable. Any port must number-coerce (`Number("134")`). |
| **`Fleet_Register!H28`** | INPUT (literal, **stored as text `"0"`**) | fleet summary `EV Vehicles` total | **MISSING.** The fleet grid has **no EV column at all**, so EV count cannot be entered anywhere. `d17` (5 pts) unreachable. |
| `Fleet_Register!B23:H27` | INPUT | per-depot summary counts, all literal **text** | **MISSING** — not modelled |
| `Fleet_Register!E32:F33` | DERIVED | `=E_Data!$B$7*35/330/1000`, `=IFERROR(D32*0.0001,0)` | EV comparison table; reporting-only, not scored |

## 2D. `Assumptions`

*(See Part 3 for the B9 collision and the full corrected mapping.)*

| Cell | Class | Value / derivation | App status |
|---|---|---|---|
| `Assumptions!B8` | INPUT | `"Standard"` — Scoring stance. DV list `"Lean,Standard,Strict"` is attached to **B6**, two rows above. | **written to `B6`** by `ASSUMPTIONS_FIELDS[0]` |
| **`Assumptions!B9`** | **DERIVED** | `=IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))` → **`0.5`**. This is the numeric **banding floor** (`STANCE_FLR`). | **COLLISION** — `ASSUMPTIONS_FIELDS` defines `B9` as a *text select* "Primary reporting standard". See Part 3. |
| `Assumptions!B10` | INPUT | `"Transport / FMCG Distribution"` — Sector (`SECTOR`) | written to `B8` by config |
| `Assumptions!B11` | INPUT | `"King V + IFRS S1/S2"` — Primary reporting standard (`STD_PRIMARY`) | written to `B9` by config ← **the collision** |
| `Assumptions!B12` | INPUT | `"Single (financial — IFRS)"` — Materiality basis | written to `B10` by config |
| `Assumptions!B13` | INPUT | `"ZAR"` — Reporting currency | written to `B11` by config |
| `Assumptions!B14` | DERIVED | Currency symbol (auto) — **cell is blank**; consumed as a prefix by `Carbon_Tax!B17/C17/D17/B27/C27/B28/C28` | **MISSING** |
| `Assumptions!B15` | INPUT | `"Both (current + escalated)"` — Carbon tax display (`TAX_MODE`); read by `Carbon_Tax!E15` | written to `B13` by config |
| `Assumptions!B30`…`B36` | INPUT | emission factors 2.68 / 2.31 / 1.51 / 0.82 / 0.025 / 0.000344 / 0.58 | **MISSING** from `ASSUMPTIONS_FIELDS` (mirrored in `E_Data!B4:B10`) |
| `Assumptions!B37` | INPUT | `236` — Carbon Tax Tier 1 (`TAX_T1`); read by `Carbon_Tax!B15` | **MISSING** from config (present in golden fixture) |
| `Assumptions!B38` | INPUT | `640` — Carbon Tax Tier 2 (`TAX_T2`); read by `Carbon_Tax!C15` | **MISSING** from config |
| `Assumptions!B39` | INPUT | `0.6` — basic allowance (`TAX_ALLOW`); read by `Carbon_Tax!E6:E10` | **MISSING** from config |
| **`Assumptions!B43`** | INPUT | `0.1` — `THR_GHG_YOY`; read by `E_Scorecard!C6` | `ASSUMPTIONS_FIELDS` `B43` ✓ correct |
| **`Assumptions!B44`** | INPUT | `0.2` — `THR_RE`; read by `E_Scorecard!C7`, `C13` | `ASSUMPTIONS_FIELDS` `B44` ✓ correct |
| **`Assumptions!B45`** | INPUT | `1.05` — `THR_FUEL_TOL`; read by `E_Scorecard!C15` | `ASSUMPTIONS_FIELDS` `B45` ✓ correct (unused by TS today) |
| **`Assumptions!B46`** | INPUT | `0.05` — `THR_EV_MIN`; read by `E_Scorecard!C17` | `ASSUMPTIONS_FIELDS` `B46` ✓ correct (unused by TS today) |
| `Assumptions!B47` | INPUT | `0.2` — `THR_EV_2030`; NetZero_Roadmap only | **MISSING** from config |
| **`Assumptions!B48`** | INPUT | `0.75` — `THR_WASTE`; read by `E_Scorecard!C19` | `ASSUMPTIONS_FIELDS` `B48` ✓ correct |
| `Assumptions!B49` | INPUT | `0.9` — `THR_WASTE_X` | **MISSING** from config (constant `THR_WASTE_X` exists in `consumer-goods.ts`) |
| **`Assumptions!B50`** | INPUT | `0.6` — `THR_BLACK`; read by `S_Scorecard!C5`, `G_Data!F8` | `ASSUMPTIONS_FIELDS` `B50` ✓ correct |
| **`Assumptions!B51`** | INPUT | `0.3` — `THR_BFM`; read by `S_Scorecard!C6` | `ASSUMPTIONS_FIELDS` `B51` ✓ correct |
| **`Assumptions!B52`** | INPUT | `0.02` — `THR_PWD`; read by `S_Scorecard!C8` | `ASSUMPTIONS_FIELDS` `B52` ✓ correct |
| **`Assumptions!B53`** | INPUT | `40` — `THR_TRAIN_HR`; read by `S_Scorecard!C14` | **MISSING** from `ASSUMPTIONS_FIELDS` (TS falls back to `THR_TRAINING_HOURS = 40`) |
| **`Assumptions!B54`** | INPUT | `0.8` — `THR_GRANT`; read by `S_Scorecard!C15` | **MISSING** from `ASSUMPTIONS_FIELDS` (TS falls back to `THR_LEVY_SPEND = 0.8`) |
| **`Assumptions!B55`** | INPUT | `2` — `THR_LTIFR`; read by `S_Scorecard!C17` | `ASSUMPTIONS_FIELDS` `B55` ✓ correct. **Help text is wrong** — it says "per 200,000 hours"; `S_Data!G35` uses `*1000000`. |
| `Assumptions!B56` | INPUT | `0.01` — `THR_CSI`; read by `B_BBEE_ESG!E10` | `ASSUMPTIONS_FIELDS` `B56` ✓ correct |
| `Assumptions!B57` | INPUT | `0.4` — `THR_LOCAL` | **MISSING** from config |
| `Assumptions!B58` | INPUT | `0.8` — **`THR_SUP_HS`** (Supplier H&S compliance minimum) | **MISLABELLED** — `ASSUMPTIONS_FIELDS` labels `B58` "King V Apply & Explain minimum (THR_KING)". `THR_KING` is **B59**. |
| `Assumptions!B59` | INPUT | `0.7` — `THR_KING` | **MISSING** from config (see B58) |
| `Assumptions!B60` | INPUT | `500` — `THR_PI` | `ASSUMPTIONS_FIELDS` `B60` ✓ correct |
| **`Assumptions!B61`** | INPUT | `10` — `THR_RISKS`; read by `G_Data!F22` | **MISSING** from config |
| `Assumptions!B62/B63/B64` | INPUT | `0.85 / 0.7 / 0.5` — `RTG_EXC / RTG_GOOD / RTG_ADEQ`; read by `ESG_Dashboard!E6:E8`, `M6` | **MISSING** from config |
| `Assumptions!B65` | INPUT | `0.75` — `TGT_PILLAR`; read by `ESG_Dashboard!J6:J8` | **MISSING** from config |
| `Assumptions!B68`…`B72` | INPUT | B-BBEE element weights `25/19/25/40/5` | **MISSING** from config |
| `Assumptions!B76`…`B84` | INPUT | B-BBEE level thresholds `100/95/90/‹blank›/75/‹blank›/55/40/0`; read by `B_BBEE_ESG!B15/E15/B18` | **MISSING** from config. **`B79` (Level 4) and `B81` (Level 6) are BLANK in the workbook** — `B_BBEE_ESG!B15` therefore compares against 0 and reports `"Level 4"` for any score ≥ 0. Workbook defect. |
| `Assumptions!B98/B99/B100` | INPUT | pillar weights `0.4 / 0.3 / 0.3`, maxima `108 / 100 / 100` | **MISSING** from config; note `ESG_Dashboard!D9` ignores the weights entirely |
| **`Assumptions!B107`** | INPUT | `2050` — `ENT_NZ`; read by `E_Scorecard!C9` | `ASSUMPTIONS_FIELDS` `B107` ✓ correct |
| `Assumptions!B104/B105/B106/B108/B109/B110` | INPUT | entity name, FY, baseline year, B-BBEE code, currency, consultant | modelled instead on the `company-reporting-setup` section (`COVER_FIELDS`) with symbolic keys (`entity`, `period`, …), not A1 refs |
| `Assumptions!B111` | INPUT | `9` — `ENT_MOS` (data months) | **MISSING** from config |
| `Assumptions!B112` | DERIVED | `=12/B111` → `1.3333333333` — `ENT_ANN`; read by `Carbon_Tax!D6:D10`, `ESG_Dashboard!L13:L18` | **MISSING** from config (constant `CARBON_ANNUALISE_FACTOR` exists in `consumer-goods.ts`) |

## 2E. `S_Data`

| Cell | Class | Excel derivation | App status |
|---|---|---|---|
| `S_Data!B5:K11` | INPUT | headcount by EEA2 level × race/gender | `EsgHeadcountGrid` writes `hc_{rowIdx}_{colIdx}` into `s-data` |
| **`S_Data!F5`, `F6`, `G5`, `G6`, `H5`, `H6`** | INPUT | Af F / Col F / Ind F at EEA2 L1 + L2 | **MISSING as A1 refs** — the headcount grid only writes `hc_r_c`; `esgDeriveSummary.ts` does **not** project them to `F5/G5/H5/…`. Read by `S_Scorecard!C6`. |
| **`S_Data!L5`, `L6`** | DERIVED | `=SUM(B5:K5)`, `=SUM(B6:K6)` | **MISSING derivation** — only the grand total `L12` is derived. Read by `S_Scorecard!C6`. |
| `S_Data!L7`…`L11` | DERIVED | `=SUM(B7:K7)` … `=SUM(B11:K11)` | **MISSING derivation** |
| **`S_Data!L12`** | DERIVED | `=SUM(L5,L6,L7,L8,L9,L10,L11)` (and `B12`…`K12` = `=SUM(B5,…,B11)` per column) | **derived** — `headcount = sumMatching(sCells, /^hc_\d+_\d+$/)` → `s-data!L12` |
| **`S_Data!G28`** | INPUT (literal `"—"`) | **no formula** — `C28:F28` are all `"—"` and `G28` is a hand-typed `"—"`. Inconsistent with `G29 = =SUM(C29:F29)`. | `S_DATA_HS_FIELDS` has **no `G28` field**; the quarterly fatality cells `C28:F28` are also absent. Read by `S_Scorecard!C18` (8 pts). Currently 8 pts by default. |
| `S_Data!G27` | DERIVED | `=SUM(C27:F27)` (hours worked) | `S_DATA_HS_FIELDS` `C27/D27/E27/F27` ✓; `G27` not derived |
| `S_Data!G29:G33` | DERIVED | `=SUM(C29:F29)` … `=SUM(C33:F33)` | `S_DATA_HS_FIELDS` supplies `C29:F33` ✓; the `G` roll-ups are **not derived** — `social.ts` reads `s-data!G29` directly |
| **`S_Data!G35`** | DERIVED | `=IF(SUM(C27:F27)>0,SUM(C29:F29)*1000000/SUM(C27:F27),"Awaiting hours worked")` | `S_DATA_HS_FIELDS` `{cell:"G35", label:"LTIFR (computed)", type:"number"}` — presented as a **manual number field**, not derived. Live value is the string `"Awaiting hours worked"` → `readEsgCell` returns `null` → `d17 = 0`. |
| `S_Data!G36` | DERIVED | `=IF(SUM(C27:F27)>0,(SUM(C29:F29)+SUM(C30:F30))*1000000/SUM(C27:F27),"Awaiting hours worked")` (TRIFR) | not modelled |
| **`S_Data!B43`** | INPUT | `10331940.87` — **Leviable payroll (R)** | `S_DATA_PAYROLL_FIELDS` `{cell:"B43", label:"Leviable payroll (R)"}` ✓ correct |
| **`S_Data!B44`** | **DERIVED** | `=IFERROR(B43*0.01,0)` → `103319.4087` — **SDL levy paid (1 % of payroll)** | **WRONG** — `S_DATA_PAYROLL_FIELDS` defines `{cell:"B44", label:"NPAT (R)"}`. A user typing NPAT into B44 corrupts `S_Scorecard!C15` (grant recovery = `B47/B44`). B44 must be derived, and NPAT needs a **new** cell. |
| `S_Data!B45` | INPUT | WSP submitted (Y/N) — blank in the live workbook | `S_DATA_TRAINING_FIELDS` `B45` ✓ |
| `S_Data!B46` | INPUT | ATR submitted (Y/N) — blank | `S_DATA_TRAINING_FIELDS` `B46` ✓ |
| `S_Data!B47` | INPUT | Mandatory grant claimed (R) — blank | `S_DATA_TRAINING_FIELDS` `B47` ✓ |
| `S_Data!B49` | INPUT | Total training hours delivered — blank | `S_DATA_TRAINING_FIELDS` `B49` ✓ |
| `S_Data!B50` | INPUT | Training spend (R) — blank; read by `B_BBEE_ESG!D8` | `S_DATA_TRAINING_FIELDS` `B50` ✓ |
| `S_Data!B51`…`B55` | INPUT | % trained / Black / female / youth / PWD | `S_DATA_TRAINING_FIELDS` ✓ — **but note `B55` here collides in name only with `Assumptions!B55`; they are different sheets, no bug** |
| `S_Data!B71` | — | **header cell**: row 71 is the Community table header (`Initiative \| Month \| Beneficiaries \| Spend (R) \| …`); `B71 = "Month"` | **WRONG** — `S_DATA_PAYROLL_FIELDS` defines `{cell:"B71", label:"SDL levy paid (1% of payroll)"}`, writing a number over a column header. Remove; SDL levy is `B44` (derived). |
| `S_Data!C59` | INPUT | `77` — OFO learners for the fatigue programme | `ESG_GRID_SECTIONS["s-data-ofo"]` grid (`learners` column, startRow 59) |
| `S_Data!A72:A79` | INPUT | CSI initiative names | `ESG_GRID_SECTIONS["s-data-csi"]` grid; **derived** to `s-data!_initiatives_count` |
| `S_Data!D82` | DERIVED | `=SUM(D72:D81)` (total CSI spend) | not derived; needed for the `d22` proposal in Part 5 |
| `S_Data!C16:J22` | DERIVED | EE gap analysis block, e.g. `C16 = =IFERROR((S_Data!B5+C5+D5+F5+G5+H5)/S_Data!L5,0)`, `J16 = =MAX(0,MIN(10,10*(C16/D16)))`, `J22 = =AVERAGE(J16,…,J21)` | not modelled; not read by any scorecard |

## 2F. `G_Data`

| Cell | Class | Excel derivation | App status |
|---|---|---|---|
| `G_Data!B5` | INPUT | `7` — board members | `G_DATA_MATURITY_ROWS` `B5` (numeric) ✓ |
| `G_Data!B6`…`B11` | INPUT | INEDs, exec directors, % Black board, % female board, board meetings, audit meetings | `G_DATA_MATURITY_ROWS` ✓ |
| `G_Data!B12`…`B24` | INPUT | Y/N/Partial governance statements (DV `"Yes,No,Partial,N/A"`); `B14`, `B19`, `B22` blank in the live workbook | `G_DATA_MATURITY_ROWS` ✓ (`B22` is numeric — material risk count) |
| **`G_Data!F5`** | DERIVED | `=IF(B5>0,5,0)` | **derived** — `esgDeriveSummary.ts` `F5 = boardMembers > 0 ? 5 : 0` ✓ |
| `G_Data!F6` | DERIVED | `=IFERROR(IF(B5=0,0,IF(B6/B5>=0.5,5,IF(B6/B5>=0.5*Assumptions!$B$9,5*B6/B5/0.5,0))),0)` | **MISSING derivation** (not read by any scorecard row, but feeds `F26`) |
| `G_Data!F7` | DERIVED | `=IFERROR(IF(B5=0,0,IF(B7/B5<=0.4,5,MAX(0,5*(1-((B7/B5)-0.4)*2)))),0)` | **MISSING derivation** |
| `G_Data!F8` | DERIVED | `=IFERROR(IF(B8>=Assumptions!$B$50,5,IF(B8>=Assumptions!$B$50*Assumptions!$B$9,5*B8/Assumptions!$B$50,0)),0)` | **MISSING derivation** |
| `G_Data!F9` | DERIVED | `=IFERROR(IF(B9>=0.5,5,IF(B9>=0.5*Assumptions!$B$9,5*B9/0.5,0)),0)` | **MISSING derivation** |
| `G_Data!F10` | DERIVED | `=IFERROR(IF(B10>=4,5,IF(B10>=4*Assumptions!$B$9,5*B10/4,0)),0)` | **MISSING derivation** |
| `G_Data!F11` | DERIVED | `=IFERROR(IF(B11>=4,5,IF(B11>=4*Assumptions!$B$9,5*B11/4,0)),0)` | **MISSING derivation** |
| **`G_Data!F12`…`F21`, `F23`, `F24`** | DERIVED | `=IF(Bn="Yes",5,IF(Bn="Partial",2.5,0))` | **derived** — `esgDeriveSummary.ts` `GOV_YN_ROWS = [13,14,15,16,17,18,19,20,21,23,24]`. **`F12` is missing from that list** (harmless today — no scorecard row reads `F12` — but it breaks `F26`). |
| `G_Data!F22` | DERIVED | `=IFERROR(IF(B22>=Assumptions!$B$61,5,IF(B22>=Assumptions!$B$61*Assumptions!$B$9,5*B22/Assumptions!$B$61,0)),0)` | **MISSING derivation** — `B22` is an input, but `F22` is never computed |
| `G_Data!F26` | DERIVED | `=SUM(F5:F24)` → `66.0714285714` (Governance total /100) | present in the golden fixture; **not derived** by the app |
| **`G_Data!B25`** | **MISSING** | **G_Data has no row 25.** Row 24 is `Anti-corruption training`, row 26 is the total. There is no "material regulatory penalties" input anywhere in the workbook. | Read by `G_Scorecard!C25` (5 pts). `IF(B25="",5,…)` → blank → **free 5 points forever**. `governance.ts` reproduces this faithfully. Needs a real input. |

## 2G. `EE_Scorecard`

| Cell | Class | Excel derivation | App status |
|---|---|---|---|
| **`EE_Scorecard!B5`** | DERIVED | `=IFERROR((S_Data!B5+S_Data!C5+S_Data!D5+S_Data!F5+S_Data!G5+S_Data!H5)/(S_Data!L5)*1,0)` — **note: L1 only, despite the label "all levels combined"** | `EE_MATURITY_ROWS` exposes `B5` as a **manual numeric** field. Not derived. Read by `S_Scorecard!C5` and `ESG_Dashboard!B27`. |
| `EE_Scorecard!B6` | DERIVED | `=0` (a formula whose body is the constant zero) | not modelled |
| `EE_Scorecard!B7` | DERIVED | `=IFERROR((S_Data!B5+ S_Data!B6)/S_Data!L12,0)` | not modelled |
| **`EE_Scorecard!B8`** | DERIVED | `=0` (constant-zero formula — PWD % is never computed) | **MISSING input.** Read by `S_Scorecard!C8` (5 pts). Not in `EE_MATURITY_ROWS`. **Permanently 0.** |
| `EE_Scorecard!B9` | INPUT | `"Yes"` — EE Plan submitted (DV `Yes,No,Partial,N/A`) | `EE_MATURITY_ROWS` `B9` ✓ |
| `EE_Scorecard!B10` | INPUT | `"Yes"` — EE forum | `EE_MATURITY_ROWS` `B10` ✓ |
| `EE_Scorecard!B11` | INPUT | `"Yes"` — EE monitoring & reporting | **MISSING** from `EE_MATURITY_ROWS` (feeds `E11` → `E15`) |
| **`EE_Scorecard!B12`** | INPUT | `"Yes"` — Numerical targets set | **MISSING** from `EE_MATURITY_ROWS`. Read by `S_Scorecard!C10` (3 pts). **Permanently 0.** |
| `EE_Scorecard!B13`, `B14` | INPUT | Barriers removed / affirmative measures | **MISSING** from `EE_MATURITY_ROWS` (feed `E13`, `E14` → `E15`) |
| `EE_Scorecard!E5:E14` | DERIVED | `E5 = =IFERROR(MIN(20,ROUND(B5/0.6*20,2)),0)`; `E6 = =IFERROR(MIN(15,ROUND(B6/0.3*15,2)),0)`; `E7 = =IFERROR(MIN(20,ROUND(B7/0.5*20,2)),0)`; `E8 = =IFERROR(MIN(10,ROUND(B8/0.02*10,2)),0)`; `E9 = =IF(B9="Yes",10,IF(B9="Partial",5,0))`; `E10`…`E14 = =IF(Bn="Yes",5,IF(Bn="Partial",2,0))` | not derived by the app |
| **`EE_Scorecard!E15`** | DERIVED | `=SUM(E5,E6,E7,E8,E9,E10,E11,E12,E13,E14)` → **35** / max 100 (`F15`) | read by `bbbeeBridge.ts` and `B_BBEE_ESG!D7`; **not derived** by the app |
| `EE_Scorecard!B19:I25` | DERIVED | mirrors of `S_Data!B5:I12` | not modelled |

## 2H. `King5_Scorecard`

| Cell | Class | Excel derivation | App status |
|---|---|---|---|
| `King5_Scorecard!C4:C20` | INPUT | 17 statuses, DV `"Applied,Explained,Partially Applied,Not Applied"` | `ESG_GRID_SECTIONS.king5` grid `status` column, startRow 4 ✓ |
| `King5_Scorecard!D4:D20` | INPUT | weights `8,6,6,6,8,6,6,8,6,8,6,8,6,6,6,6,4` (Σ = **110**) | `ESG_GRID_SECTIONS.king5` grid `weight` column ✓ |
| `King5_Scorecard!E4:E20` | DERIVED | `=IF(Cn="Applied",10,IF(Cn="Explained",7,IF(Cn="Partially Applied",5,0)))` | **MISSING derivation** — no rule in `esgDeriveSummary.ts` |
| **`King5_Scorecard!E21`** (total) | DERIVED | `=SUM(E4,E5,E6,E7,E8,E9,E10,E11,E12,E13,E14,E15,E16,E17,E18,E19,E20)` → **135** | read by `governance.ts` (`king5!E21`); **not derived** — golden fixture injects `135`. `d5` (25 pts) is unreachable from the grid. |
| **King V max** | — | **`170`** — hardcoded in `G_Scorecard!C5` (`E21/170*25`) and `King5_Scorecard!E22` (`=IFERROR(E21/170,0)` → `0.7941176471`). 17 principles × 10 points. **`Assumptions!B59` (`THR_KING = 0.7`) is a *rating* threshold, not the divisor.** | `governance.ts` hardcodes `/170` ✓ matches |
| `King5_Scorecard!F4:F20` | DERIVED | `=En*Dn/10` (weighted score) | not modelled |
| `King5_Scorecard!F21` | DERIVED | `=SUM(F4,…,F20)` → **87** out of a weighted max of **110** (cell `G21` incorrectly labels it "Max theoretical: 1100") | not modelled |
| `King5_Scorecard!F22` | DERIVED | `=IF(F21>=120,"Excellent",IF(F21>=90,"Good",IF(F21>=60,"Adequate","Needs Attention")))` → `"Adequate"`. **Bands are calibrated for a 0–170 scale but applied to F21, whose max is 110 — "Excellent" is unreachable.** | not modelled |

## 2I. `IFRS_S1_S2`

| Cell | Class | Excel derivation | App status |
|---|---|---|---|
| `IFRS_S1_S2!D5:D16`, `D19:D28` | INPUT | DV `"Disclosed,Partially Disclosed,Not Disclosed,N/A"`. Live values: 8 × `Partially Disclosed`, 4 × `Not Disclosed`, the rest blank. | `ESG_GRID_SECTIONS.ifrs` grid `status` column, startRow 5 ✓ |
| `IFRS_S1_S2!E5:E28` | DERIVED | `=IF(Dn="Disclosed",5,IF(Dn="Partially Disclosed",3,IF(Dn="N/A",5,0)))` | **MISSING derivation** |
| **`IFRS_S1_S2!E29` (total)** | DERIVED | `=SUMIF(E5:E28,"<>0",E5:E28)` → **18** | not modelled |
| `IFRS_S1_S2!E30` | DERIVED | `=IFERROR(E29/110,0)` → **0.1636363636**. Divisor `110` = 22 requirement rows × 5. | not modelled |
| **IFRS "yes-count"** (`G_Scorecard!C9` numerator) | DERIVED | `=COUNTIF(IFRS_S1_S2!D4:D40,"Yes")` → **0, permanently.** The D-column vocabulary never contains the literal `"Yes"`. | `governance.ts` reads `ifrs!_yes_count` (golden fixture: `0`) |
| **IFRS denominator** (`G_Scorecard!C9`) | DERIVED | `=MAX(1,COUNTA(IFRS_S1_S2!A4:A40)-COUNTBLANK(IFRS_S1_S2!A4:A40))`. Within `A4:A40` only `A17` and `A29` are populated (section headings), so `COUNTA = 2`, `COUNTBLANK = 35`, `2-35 = -33`, `MAX(1,-33) = **1**`. | `governance.ts` reads `ifrs!_total` (golden fixture: `10`) |
| `ESG_Dashboard!B31` | DERIVED | same broken COUNTIF, without the `10*` → `0` | — |

## 2J. Sheets read by no scorecard row (reporting only)

`ISO_Tracker` (section scores `E17=15`, `E30=6`, `E42=12`, `E53=24`, `E64=0`; each row
`=IF(Dn="Fully Compliant",5,IF(Dn="Partially Compliant",3,IF(Dn="Not Applicable",5,0)))`),
`SAQ_Supplier` (`In = =IFERROR(SUM(Bn:Hn)/(COUNTIF(Bn:Hn,"<>"&"N/A")*5)*100,0)`, all suppliers `60 / C`),
`GARP_GRAP` (`Jn = =IF(En="High",5,IF(En="Medium",3,IF(En="Low",1,IF(En="Req",4,0))))*In`; `C27=18`,
`C28=12`, `C29=4`, `C30=25`), `Driver_Debrief` (`B46=0.93`, `B47=125`, `B48=0.0880902044`,
`B49=0.375`, `B50=1`), `Carbon_Tax`, `NetZero_Roadmap`, `B_BBEE_ESG`, `Validation`.

**These sheets are cited in `E_Scorecard!E26:E29` / `S_Scorecard!E26:E27` as "Data Source" for the
MANUAL_ZERO rows, but no formula reads them.** They are the raw material for Part 5.

---

# Part 3 — The `Assumptions!B9` collision

## 3.1 What `B9` actually is

`Assumptions!B9` is **a derived numeric banding floor**:

```
Assumptions!A9 = "Banding floor (auto from stance)"
Assumptions!B9 = =IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))   → 0.5
Assumptions!C9 = "0.30 / 0.50 / 0.70"
Assumptions!D9 = "STANCE_FLR"
Assumptions!E9 = "Below Actual/Target × this %, score = 0. Above, pro-rata."
```

It is read as a **number** by 20 scorecard formulas across E, S, G and B_BBEE_ESG. Every
`…>=Assumptions!$B$44*Assumptions!$B$9…` term is `target × floor`.

**The reporting standard lives at `Assumptions!B11`**, not B9:

```
Assumptions!A11 = "Primary reporting standard"
Assumptions!B11 = "King V + IFRS S1/S2"
Assumptions!D11 = "STD_PRIMARY"
```

So `esgSectionConfigs.ts` is wrong, and the stance floor is **already at the right address** — the TS
calculators are correct to read `B9` as a number. The **form** is the thing that must move.

## 3.2 Why the offset exists

Assumptions Block 0 carries a self-documenting column F ("Cell ref"). Every entry in it is **two rows
behind** the cell it describes, and the sheet's **data validations sit on the same stale addresses**:

| Row | Column A (setting) | Real cell | Column F claims | DV attached to |
|---|---|---|---|---|
| 8 | Scoring stance | `B8` | `Assumptions!B6` | `B6` |
| 9 | Banding floor (auto from stance) | `B9` | `Assumptions!B7` | — |
| 10 | Sector | `B10` | `Assumptions!B8` | `B8` |
| 11 | Primary reporting standard | `B11` | `Assumptions!B9` | `B9` |
| 12 | Materiality basis | `B12` | `Assumptions!B10` | `B10` |
| 13 | Reporting currency | `B13` | `Assumptions!B11` | `B11` |
| 15 | Carbon tax display | `B15` | `Assumptions!B13` | `B13` |

Two rows (the `🔒 THIS INSTANCE IS CONFIGURED FOR SUPERGROUP` banner at A3 and the fork warning at A4)
were inserted after the sheet was authored. Excel re-pointed every **formula** reference — which is why
`E_Scorecard` correctly reads `$B$43`, `$B$9`, `$B$107` — but it did not rewrite the literal **text** in
column F, and the data-validation `sqref`s stayed put. `esgSectionConfigs.ts` was built from the
validations/column-F documentation, so it inherited the 2-row error.

**The offset is confined to Block 0 (rows 6–15).** Blocks 1–7 (`B30`–`B112`) are correct as-is, because
the scorecard formulas that reference them were re-pointed by the insert. Do **not** shift `B43`–`B112`.

## 3.3 Corrected `ASSUMPTIONS_FIELDS` mapping

| Current config `cell` | Current label | **Corrected cell** | Correct label / kind | Action |
|---|---|---|---|---|
| `B6` | Scoring stance | **`B8`** | Scoring stance — select `Lean / Standard / Strict` (`STANCE`) | **move B6 → B8** |
| — | — | **`B9`** | Banding floor — **derived, read-only number** `=IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))` (`STANCE_FLR`) | **add as derived; never user-editable** |
| `B8` | Sector | **`B10`** | Sector — select (`SECTOR`) | **move B8 → B10** |
| `B9` | Primary reporting standard | **`B11`** | Primary reporting standard — select (`STD_PRIMARY`) | **move B9 → B11 — this is the collision** |
| `B10` | Materiality basis | **`B12`** | Materiality basis — select (`MAT_BASIS`) | **move B10 → B12** |
| `B11` | Reporting currency | **`B13`** | Reporting currency — select (`CCY`) | **move B11 → B13** |
| — | — | **`B14`** | Currency symbol — derived from `B13` (`Carbon_Tax` prefixes it) | **add as derived** |
| `B13` | Carbon tax display | **`B15`** | Carbon tax display — select (`TAX_MODE`) | **move B13 → B15** |
| `B43` | THR_GHG_YOY | `B43` | ✓ unchanged | keep |
| `B44` | THR_RE | `B44` | ✓ unchanged | keep |
| `B45` | THR_FUEL_TOL | `B45` | ✓ unchanged | keep |
| `B46` | THR_EV_MIN | `B46` | ✓ unchanged | keep |
| `B48` | THR_WASTE | `B48` | ✓ unchanged | keep |
| `B50` | THR_BLACK | `B50` | ✓ unchanged | keep |
| `B51` | THR_BFM | `B51` | ✓ unchanged | keep |
| `B52` | THR_PWD | `B52` | ✓ unchanged | keep |
| — | — | **`B53`** | Training hours per employee target `40` (`THR_TRAIN_HR`) — read by `S_Scorecard!C14` | **add** |
| — | — | **`B54`** | Mandatory grant recovery target `0.8` (`THR_GRANT`) — read by `S_Scorecard!C15` | **add** |
| `B55` | THR_LTIFR | `B55` | ✓ unchanged — **fix help text: LTIFR is per 1,000,000 hours, not 200,000** | keep + fix text |
| `B56` | THR_CSI | `B56` | ✓ unchanged | keep |
| `B58` | "King V Apply & Explain minimum (THR_KING)" | **`B59`** | `B58` is `THR_SUP_HS` (Supplier H&S `0.8`); `THR_KING` (`0.7`) is `B59` | **relabel `B58` → THR_SUP_HS and add `B59` → THR_KING** |
| `B60` | THR_PI | `B60` | ✓ unchanged | keep |
| — | — | **`B61`** | Material risks minimum `10` (`THR_RISKS`) — read by `G_Data!F22` | **add** |
| `B107` | Net-zero target year | `B107` | ✓ unchanged | keep |

**Additional cells that must exist for parity with the workbook** (not currently in any config):
`B14`, `B30`–`B39` (emission factors + carbon tax rates/allowance), `B47`, `B49`, `B57`, `B62`–`B65`
(rating bands), `B68`–`B72` (B-BBEE weights), `B76`–`B84` (B-BBEE levels — note `B79`/`B81` are blank in
the source workbook and must be back-filled with **80** and **65** per the Generic Codes),
`B98`–`B101` (pillar weights), `B111`/`B112` (months / annualisation factor).

## 3.4 Migration hazard

`readEsgCell` number-coerces. Today `readEsgCell(wb,"assumptions","B9")` on a form-authored workbook
returns `null` (because B9 holds `"King V + IFRS S1/S2"`), so:

* `social.ts` line 29 silently falls back to `0.5`;
* `bbbeeBridge.ts` line 15 silently falls back to `stanceFloor("standard")` = `0.5`;
* `environmental.ts` accidentally works, because `stanceFloorFromWorkbook` falls back to the *label* in
  `B6` — which today is where the form writes the stance.

Consequence: **selecting "Lean" or "Strict" changes E but not S or B-BBEE.** After the migration,
`B8` holds the label and `B9` holds the number, and all three read the same floor. Any workbook already
saved with the old layout needs a one-time migration: `B6 → B8`, `B8 → B10`, `B9 → B11`, `B10 → B12`,
`B11 → B13`, `B13 → B15`, then recompute `B9` from `B8`.

Note that `apps/web/EsgToolkit/src/lib/fixtures/esg-consumer-golden.generated.json` **already uses the
correct workbook layout** (`B8: "Standard"`, `B9: 0.5`, `B11: "King V + IFRS S1/S2"`). The fixture and
the form currently disagree; fixing the form removes the divergence.

---

# Part 4 — Golden regression targets

Dataset: `docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx` (SG Consumer, FY 2025/26,
9 months Jul-25 → Mar-26).

## 4.1 Pillar totals — the gate

| Target | Cell | **Expected value** |
|---|---|---|
| Environmental | `E_Scorecard!D30` | **36** (of 108) |
| Social | `S_Scorecard!D28` | **33** (of 100) |
| Governance | `G_Scorecard!D26` | **64.8529411765** (of 100) |
| Overall | `ESG_Dashboard!D9` | **0.4461764706** (44.6 %) |

Mirrored in `apps/web/src/lib/esg/esgScoringDefaults.ts` → `ESG_GOLDEN_SG_CONSUMER`, and asserted by
`apps/web/EsgToolkit/src/lib/calculators/__tests__/esg-consumer-golden.test.ts`.

## 4.2 Per-indicator D-column values — Environmental

| id | D | C (actual) | F (status) |
|---|---|---|---|
| d5 | **5** | 5 | ⚠ Partial |
| d6 | **0** | 0 | ✗ Gap |
| d7 | **0** | 0 | ✗ Gap |
| d8 | **5** | 5 | ⚠ Partial |
| d9 | **5** | 5 | ⚠ Partial |
| d11 | **5** | 5 | ⚠ Partial |
| d12 | **0** | 0 | ✗ Gap |
| d13 | **0** | 0 | ✗ Gap |
| d15 | **0** | 0 | ✗ Gap |
| d16 | **0** | 0 | ✗ Gap |
| d17 | **0** | 0 | ✗ Gap |
| d19 | **5** | 5 | ⚠ Partial |
| d20 | **4** | 4 | ⚠ Partial |
| d21 | **3** | 3 | ⚠ Partial |
| d23 | **4** | 4 | ⚠ Partial |
| d24 | **0** | 0 | ✗ Gap |
| d26 | **0** | 0 | ✗ Gap |
| d27 | **0** | 0 | ✗ Gap |
| d28 | **0** | 0 | ✗ Gap |
| d29 | **0** | 0 | ✗ Gap |
| **Σ** | **36** | | |

## 4.3 Per-indicator D-column values — Social

| id | D | C (actual) | F (status) |
|---|---|---|---|
| d5 | **0** | 0 | ✗ Gap |
| d6 | **0** | 0 | ✗ Gap |
| d7 | **5** | 5 | ⚠ Partial |
| d8 | **0** | 0 | ✗ Gap |
| d9 | **3** | 3 | ⚠ Partial |
| d10 | **3** | 3 | ⚠ Partial |
| d12 | **0** | 0 | ✗ Gap |
| d13 | **0** | 0 | ✗ Gap |
| d14 | **0** | 0 | ✗ Gap |
| d15 | **0** | 0 | ✗ Gap |
| d17 | **0** | 0 | ✗ Gap |
| d18 | **8** | 8 | ⚠ Partial |
| d19 | **5** | 5 | ⚠ Partial |
| d20 | **4** | 4 | ⚠ Partial |
| d22 | **0** | 0 | ✗ Gap |
| d23 | **5** | 5 | ⚠ Partial |
| d24 | **0** | 0 | ✗ Gap |
| d26 | **0** | 0 | ✗ Gap |
| d27 | **0** | 0 | ✗ Gap |
| **Σ** | **33** | | |

## 4.4 Per-indicator D-column values — Governance

| id | D | C (actual) | F (status) |
|---|---|---|---|
| d5 | **19.8529411765** | 19.8529411765 | ⚠ Partial |
| d6 | **5** | 5 | ⚠ Partial |
| d7 | **0** | 0 | ✗ Gap |
| d9 | **0** | 0 | ✗ Gap |
| d10 | **2.5** | 2.5 | ⚠ Partial |
| d12 | **8** | 8 | ⚠ Partial |
| d14 | **5** | 5 | ⚠ Partial |
| d16 | **2.5** | 2.5 | ⚠ Partial |
| d17 | **2.5** | 2.5 | ⚠ Partial |
| d19 | **8** | 8 | ⚠ Partial |
| d20 | **0** | 0 | ✗ Gap |
| d22 | **4** | 4 | ⚠ Partial |
| d24 | **2.5** | 2.5 | ⚠ Partial |
| d25 | **5** | 5 | ⚠ Partial |
| **Σ** | **64.8529411765** | | |

## 4.5 Supporting golden values (assert these too — they are the inputs the pillar rows hinge on)

| Cell | Value |
|---|---|
| `E_Data!L19` (fleet diesel YTD, litres) | `589465.53` |
| `E_Data!L46` (electricity YTD, kWh) | `2589578.44` |
| `E_Data!L63` (water YTD, kL) | `4356.41` |
| `E_Data!L50`…`L54` (solar YTD, kWh) | `0` each |
| `E_Data!L75 / L76 / L77 / L78` | `589465.53 / 2181.14 / 2280 / 1053.82` |
| `E_Data!L79 / L82 / L83 / L84` | `594980.49 / 2589578.44 / 4356.41 / 3188915.34` |
| `E_Data!B90 / F90` | `0 / 3184558.93` |
| `E_Data!M80 / M81` | **empty (do not fabricate)** |
| `Assumptions!B9` (stance floor) | `0.5` |
| `Assumptions!B43/B44/B45/B46/B48` | `0.1 / 0.2 / 1.05 / 0.05 / 0.75` |
| `Assumptions!B50/B51/B52/B53/B54/B55` | `0.6 / 0.3 / 0.02 / 40 / 0.8 / 2` |
| `Assumptions!B107 / B111 / B112` | `2050 / 9 / 1.3333333333` |
| `Waste_Register!B16 / B17 / B18` | `0.911 / 0.1242555556 / 2.320153236` |
| `Fleet_Register!B28 / H28` | `"134" / "0"` (**strings**) |
| `S_Data!B43 / B44` | `10331940.87 / 103319.4087` |
| `S_Data!L12` | `0` |
| `S_Data!G28 / G29 / G35` | `"—" / 4 / "Awaiting hours worked"` |
| `S_Data!C59` | `77` |
| `S_Data!A72:A79` populated count | `8` |
| `EE_Scorecard!B5 / B8 / E15` | `0 / 0 / 35` |
| `G_Data!F5/F13/F14/F15/F16/F17/F18/F19/F20/F21/F23` | `5 / 5 / 0 / 5 / 5 / 2.5 / 2.5 / 0 / 5 / 2.5 / 2.5` |
| `G_Data!F26` | `66.0714285714` |
| `G_Data!B25` | **does not exist (blank)** |
| `King5_Scorecard!E21 / E22 / F21` | `135 / 0.7941176471 / 87` |
| `IFRS_S1_S2!E29 / E30` | `18 / 0.1636363636` |
| IFRS yes-count / denominator (`G_Scorecard!C9`) | `0 / 1` |
| `B_BBEE_ESG!E12 / B15` | `6.65 / "Level 4"` |
| `Carbon_Tax!C11 / E11 / B16 / C16` | `3184558.93 / 1698431.42933333 / 400829817.322667 / 1086996114.77333` |
| `GARP_GRAP!C27 / C28 / C29 / C30` | `18 / 12 / 4 / 25` |
| `Driver_Debrief!B46 / B47 / B50` | `0.93 / 125 / 1` |
| `ISO_Tracker!E17 / E30 / E42 / E53 / E64` | `15 / 6 / 12 / 24 / 0` |

## 4.6 Regression rule

Any change to a calculator, a config cell address, or a derivation **must** leave 4.1–4.4 bit-identical
unless the change is explicitly a scoring-behaviour change, in which case the golden numbers move in the
same commit with a written justification. Fixing a MANUAL_ZERO (Part 5) **will** move the totals — those
must land as deliberate, documented golden-value updates, never as incidental drift.

---

# Part 5 — MANUAL_ZERO indicators

Ten indicators, worth **48 points** (E: 28 of 108; S: 20 of 100; G: 0), have a literal `0` in column C
and no formula. The workbook never computed them. Column E of each scorecard row already names the
intended data source, and column I already carries the author's "Pending: …" note — reproduced verbatim
below as `workbook note`.

Additionally, **five FORMULA indicators are structurally unreachable** and behave like MANUAL_ZEROs in
practice. They are listed in 5.3 because any remediation plan must cover them too.

## 5.1 Environmental MANUAL_ZERO (32 points)

### `E d12` — `Energy: Energy efficiency improvement YoY` — 5 pts
* **Data source (col E):** `E_Data Elec` · **Standard:** GRI 302-4 / ISO 14001
* **Workbook note:** *"Pending: requires prior-year kWh baseline. Add to E_Data and reformulate. Currently 0."*
* **Real-world evidence:** prior-year utility bills / municipal statements for all five depots, or a
  signed prior-year energy report; current-year kWh already exists at `E_Data!L46`.
* **Proposed rule** — mirror `E d6` exactly, with a new baseline input `E_Data!B92` (*prior-year total kWh*):
  ```
  =IFERROR(IF(E_Data!$B$92=0,0,
     IF((E_Data!$B$92-E_Data!$L$46)/E_Data!$B$92>=Assumptions!$B$43,5,
     IF((E_Data!$B$92-E_Data!$L$46)/E_Data!$B$92>=Assumptions!$B$43*Assumptions!$B$9,
        5*((E_Data!$B$92-E_Data!$L$46)/E_Data!$B$92)/Assumptions!$B$43,0))),0)
  ```
  New input: `E_Data!B92` (number, "Prior-year total electricity kWh"). Reuses `THR_GHG_YOY` (B43) and
  the stance floor (B9). Add a dedicated `Assumptions!B42` (`THR_ENERGY_YOY`) if energy is to be tuned
  independently of GHG.

### `E d24` — `Water: Water efficiency initiative active` — 3 pts
* **Data source (col E):** `E_Data` · **Standard:** GRI 303-3 · **Action (col H):** *"CT dam, DBN 20kL project"*
* **Workbook note:** *"Pending: requires water efficiency initiative Y/N flag in G_Data. Currently 0."*
* **Real-world evidence:** project charter / capex approval for a water-reduction initiative (the CT dam
  project, DBN 20 kL mezzanine tank), or a documented reduction target with a named owner.
* **Proposed rule** — new Y/N/Partial input `E_Data!B94` (*Water efficiency initiative active*, DV
  `Yes,No,Partial,N/A`), scored on the workbook's standard binary band, plus a quantitative bonus path
  once prior-year kL exists:
  ```
  =IF(E_Data!$B$94="Yes",3,IF(E_Data!$B$94="Partial",1.5,0))
  ```

### `E d26` — `ISO 14001: Certification achieved/in progress` — 8 pts
* **Data source (col E):** `ISO_Tracker` · **Action:** *"Target date confirm with Maria"*
* **Workbook note:** *"Pending: requires ISO 14001 cert status (Y/N) from ISO_Tracker. Currently 0."*
* **Real-world evidence:** **ISO 14001:2015 certificate PDF** from an accredited body (SANAS/IAF), or a
  signed Stage-1 audit report / certification-body engagement letter for "in progress".
* **Proposed rule** — score the ISO_Tracker section directly. `ISO_Tracker!B16` is the row
  *"ISO 14001 certification achieved"*, clause 10, whose status cell is `D16` and score `E16`
  (`=IF(D16="Fully Compliant",5,IF(D16="Partially Compliant",3,IF(D16="Not Applicable",5,0)))`).
  Blend the certification row with the whole-EMS score `E17` (max 60 = 12 rows × 5):
  ```
  =IFERROR(MIN(8, 4*ISO_Tracker!$E$16/5 + 4*ISO_Tracker!$E$17/60), 0)
  ```
  Half the points for the certificate itself, half for EMS maturity. All inputs already exist
  (`ESG_GRID_SECTIONS["iso-tracker"]`, `status` column) — only the derivation of `E5:E16` and `E17` and
  this roll-up are missing.

### `E d27` — `ISO 14001: Aspects register maintained` — 4 pts
* **Data source (col E):** `ISO_Tracker` · **Standard:** ISO 14001 cl 6.1.2 · **Action:** *"Fleet diesel dominant aspect"*
* **Workbook note:** *"Pending: aspects register Y/N from ISO_Tracker. Currently 0."*
* **Real-world evidence:** the **environmental aspects & impacts register** (a document listing aspects,
  significance ratings and controls), dated within the reporting period, with fleet diesel ranked.
* **Proposed rule** — score `ISO_Tracker!D10` (row `B10 = "Environmental aspects — fleet emissions dominant"`, clause 6.1.2):
  ```
  =IFERROR(4*ISO_Tracker!$E$10/5,0)
  ```
  → `Fully Compliant` 4 pts, `Partially Compliant` 2.4, `Gap` 0. Input already exists.

### `E d28` — `Environmental policy — board approved` — 4 pts
* **Data source (col E):** `G_Data` · **Standard:** King V P1 / ISO 14001 · **Action:** *"Include net-zero commitment"*
* **Workbook note:** *"Pending: env policy approval Y/N from G_Data row 23. Currently 0."*
  (The note is stale — `G_Data!B23` is *Climate risk in risk register*, not an environmental policy.)
* **Real-world evidence:** **board-approved environmental policy PDF** with a board resolution reference
  or minuted approval date (for SG Consumer: *Code of Business Standards and Ethics §11*, Rev 2,
  30 Jan 2023, approved by the Executive Committee — which is exactly why `ISO_Tracker!D8` is
  `Partially Compliant`: the net-zero/SBTi commitment is missing).
* **Proposed rule** — add a real input `G_Data!B27` (*Environmental policy board-approved*, DV
  `Yes,No,Partial,N/A`) with derived `G_Data!F27 = =IF(B27="Yes",5,IF(B27="Partial",2.5,0))`, and take
  the **stricter** of that and the ISO_Tracker clause-5.2 view:
  ```
  =IFERROR(MIN(G_Data!$F$27, ISO_Tracker!$E$8)*4/5, 0)
  ```
  → both `Yes` + `Fully Compliant` = 4; the live SG Consumer state (`Partially Compliant`) = 2.4.

### `E d29` — `NEMA/NWA/NEMWA legal compliance` — 4 pts
* **Data source (col E):** `ISO_Tracker` · **Standard:** NEMA / NWA · **Action:** *"Legal register quarterly"*
* **Workbook note:** *"Pending: legal compliance status from ISO_Tracker. Currently 0."*
* **Real-world evidence:** an **environmental legal register** (NEMA / National Water Act / NEMWA
  obligations mapped to controls) updated within the last quarter, plus current permits/licences and a
  nil-directives declaration from the competent authority.
* **Proposed rule** — score `ISO_Tracker!D11` (row `B11 = "Legal requirements register (NEMA, NWA, NEMWA)"`,
  clause 6.1.3), gated on the governance legal register being live (`G_Data!F21`):
  ```
  =IFERROR(IF(G_Data!$F$21=0,0, 4*ISO_Tracker!$E$11/5), 0)
  ```

## 5.2 Social MANUAL_ZERO (20 points)

### `S d22` — `Community: CSI/SED spend ≥1% NPAT` — 5 pts
* **Data source (col E):** `S_Data Community` · **Standard:** GRI 413-1 / B-BBEE SED
* **Workbook note:** *"Pending: requires NPAT input in G_Data + sum of S_Data D72:D79 (CSI spend). Currently 0."*
* **Real-world evidence:** audited **NPAT** from the annual financial statements, plus the CSI/SED
  general-ledger extract or beneficiary receipts totalling the spend (SG Consumer's CSI/SED Policy §7
  puts approval with the Group Social & Ethics Committee; budget R45,000 per Coba May 2026).
* **Proposed rule** — add `S_Data!B84` (*NPAT (R)*, number — **not** `B44`, which is the derived SDL
  levy) and derive `S_Data!D82 = =SUM(D72:D81)` from the CSI register. Then:
  ```
  =IFERROR(IF(S_Data!$B$84<=0,0,
     IF(S_Data!$D$82/S_Data!$B$84>=Assumptions!$B$56,5,
     IF(S_Data!$D$82/S_Data!$B$84>=Assumptions!$B$56*Assumptions!$B$9,
        5*(S_Data!$D$82/S_Data!$B$84)/Assumptions!$B$56,0))),0)
  ```
  Reuses `THR_CSI` (`Assumptions!B56 = 0.01`) and the stance floor. The `s-data-csi` register already
  has a `spend` column, so only the `D82` roll-up and the NPAT field are new.

### `S d24` — `Community: Local labour procurement ≥40%` — 5 pts
* **Data source (col E):** `S_Data` · **Standard:** B-BBEE ESD / GRI 204 · **Action:** *"Preferential procurement"*
* **Workbook note:** *"Pending: requires local procurement % input in S_Data. Currently 0."*
* **Real-world evidence:** creditors-ledger spend split by supplier locality (or by supplier B-BBEE
  affidavit / certificate address), reconciled to total measured procurement spend — the same evidence
  pack a B-BBEE verification agency requires for Statement 400.
* **Proposed rule** — add `S_Data!B86` (*Local procurement spend (R)*) and `S_Data!B87` (*Total measured
  procurement spend (R)*), and score against `THR_LOCAL` (`Assumptions!B57 = 0.4`, currently unmapped):
  ```
  =IFERROR(IF(S_Data!$B$87=0,0,
     IF(S_Data!$B$86/S_Data!$B$87>=Assumptions!$B$57,5,
     IF(S_Data!$B$86/S_Data!$B$87>=Assumptions!$B$57*Assumptions!$B$9,
        5*(S_Data!$B$86/S_Data!$B$87)/Assumptions!$B$57,0))),0)
  ```

### `S d26` — `Supplier: IMS-T-149 H&S compliance ≥80%` — 5 pts
* **Data source (col E):** `SAQ_Supplier` · **Standard:** GRI 308 / ISO 26000 · **Action:** *"Safety file check each supplier"*
* **Workbook note:** *"Pending: SAQ_Supplier aggregate score required. Currently 0."*
* **Real-world evidence:** a completed **IMS-T-149-02 External Service Provider Evaluation** per supplier
  with the H&S (safety file) criterion scored 1–5, plus the safety files themselves (OHS Act s37(2)
  mandataries agreements, letters of good standing).
* **Proposed rule** — `SAQ_Supplier!D5:D16` is the H&S column and is already an input
  (`ESG_GRID_SECTIONS.saq` column `healthSafety`, DV `5,4,3,2,1,N/A`). Score the mean H&S rating against
  `THR_SUP_HS` (`Assumptions!B58 = 0.8`):
  ```
  =IFERROR(IF(COUNT(SAQ_Supplier!$D$5:$D$16)=0,0,
     IF(AVERAGE(SAQ_Supplier!$D$5:$D$16)/5>=Assumptions!$B$58,5,
     IF(AVERAGE(SAQ_Supplier!$D$5:$D$16)/5>=Assumptions!$B$58*Assumptions!$B$9,
        5*(AVERAGE(SAQ_Supplier!$D$5:$D$16)/5)/Assumptions!$B$58,0))),0)
  ```
  On live data all 12 suppliers score 3 → `3/5 = 0.6` → `0.6 ≥ 0.8×0.5` → `5×0.6/0.8 = 3.75` pts.

### `S d27` — `Supplier: Supplier food safety rating` — 5 pts
* **Data source (col E):** `SAQ_Supplier` · **Standard:** ISO 22000 / GRI 416 · **Action:** *"Cold chain quality standards"*
* **Workbook note:** *"Pending: SAQ_Supplier food safety aggregate required. Currently 0."*
* **Real-world evidence:** supplier **Certificates of Analysis / food-safety policies** and, for cold-chain
  contractors, HACCP plans and Transfrig fridge-unit service records; captured as the IMS-T-149 "Food
  Safety (COA/Policy)" criterion.
* **Proposed rule** — `SAQ_Supplier!F5:F16` is the Food Safety column (`ESG_GRID_SECTIONS.saq` column
  `foodSafety`). Same band as `d26`, reusing `THR_SUP_HS` until a dedicated `THR_SUP_FS` is added:
  ```
  =IFERROR(IF(COUNT(SAQ_Supplier!$F$5:$F$16)=0,0,
     IF(AVERAGE(SAQ_Supplier!$F$5:$F$16)/5>=Assumptions!$B$58,5,
     IF(AVERAGE(SAQ_Supplier!$F$5:$F$16)/5>=Assumptions!$B$58*Assumptions!$B$9,
        5*(AVERAGE(SAQ_Supplier!$F$5:$F$16)/5)/Assumptions!$B$58,0))),0)
  ```
  Optionally gate on ISO 22000 maturity (`ISO_Tracker!E64`, currently 0) once that section is filled.

## 5.3 De-facto zeros — FORMULA rows that can never score

These are **not** MANUAL_ZERO (a formula exists) but are unreachable as written. Any remediation plan
must include them or 34 further points stay dead.

| id | Pts | Why it can never score | Fix |
|---|---|---|---|
| `E d7` | 8 | Reads `E_Data!M80` / `M81`, **cells that do not exist** (rows 80–81 stop at column L). `IF(M80=0,0,…)` → always 0. | Repoint to `L80` / `L81`: `=IFERROR(IF(E_Data!$L$80=0,0,IF(-E_Data!$L$81/E_Data!$L$80>=Assumptions!$B$44,8,…)),0)` — **and** fix the sign, since `L81 = SUM(L50..L54)` is a positive kWh figure, so the leading `-` must be dropped: use `E_Data!$L$81/E_Data!$L$80`. Add `L80`/`L81` to `E_DATA_GHG_SUMMARY_FIELDS` + `esgDeriveSummary.ts`. |
| `G d9` | 10 | `COUNTIF(IFRS_S1_S2!D4:D40,"Yes")` against a `Disclosed / Partially Disclosed / Not Disclosed / N/A` vocabulary → **always 0**; denominator collapses to `MAX(1,-33) = 1`. | Use the sheet's own scoring: `=IFERROR(10*IFRS_S1_S2!$E$29/110,0)` → live data gives `10×18/110 = 1.636`. Requires deriving `E5:E28` and `E29`. |
| `S d8` | 5 | `EE_Scorecard!B8` is `=0` — a constant-zero formula. PWD % is never computed anywhere in the workbook. | Add a PWD headcount column to the EE grid (or a scalar `S_Data!B88` *PWD headcount*), then `EE_Scorecard!B8 = =IFERROR(B88/S_Data!L12,0)`. Also add `B8` to `EE_MATURITY_ROWS`. |
| `S d10` | 3 | `EE_Scorecard!B12` exists and is `"Yes"` in the workbook, but **is not in `EE_MATURITY_ROWS`** — no UI writes it. | Add `B11`, `B12`, `B13`, `B14` to `EE_MATURITY_ROWS`. |
| `G d25` | 5 | `G_Data!B25` **does not exist**; `IF(B25="",5,…)` awards 5 unconditionally. | Add a real `G_Data!B25` input (*Material regulatory penalties in period — count or R value*, default blank) so the 5 points reflect an assertion rather than an absent row. |

## 5.4 Points ledger

| Bucket | Points | Currently earned (golden) |
|---|---|---|
| E MANUAL_ZERO (`d12` 5, `d24` 3, `d26` 8, `d27` 4, `d28` 4, `d29` 4) | 28 | 0 |
| S MANUAL_ZERO (`d22` 5, `d24` 5, `d26` 5, `d27` 5) | 20 | 0 |
| Unreachable FORMULA (`E d7` 8, `G d9` 10, `S d8` 5, `S d10` 3) | 26 | 0 |
| Free points from a non-existent cell (`G d25`) | 5 | **5 (unearned)** |
| Reachable but with no input path (`E d13` 8, `d15` 8, `d16` 5, `d17` 5; `E d19` 5, `d20` 4, `d21` 3 via Waste; `S d6` 6) | 44 | 12 (via injected fixture cells) |

**Total dead or unearned: 79 of 308 points** (28 + 20 + 26 + 5). A further 44 points are formula-correct
but have no path from any UI input, of which only 12 score today and only because the golden fixture
injects `Waste_Register!B16/B17/B18` directly.

---

## Appendix — files this ledger governs

| File | Role |
|---|---|
| `apps/web/EsgToolkit/src/lib/calculators/environmental.ts` | E d5–d29 |
| `apps/web/EsgToolkit/src/lib/calculators/social.ts` | S d5–d27 |
| `apps/web/EsgToolkit/src/lib/calculators/governance.ts` | G d5–d25 |
| `apps/web/EsgToolkit/src/lib/calculators/shared.ts` | `pr` / `prLtifr` / `yesPartialNo` / `minCap` banding primitives |
| `apps/web/EsgToolkit/src/lib/calculators/bbbeeBridge.ts` | `Assumptions!B9` floor + `EE_Scorecard!E15` |
| `apps/web/EsgToolkit/src/lib/esgConfig/consumer-goods.ts` | threshold fallbacks, pillar maxima, stance floors |
| `apps/web/src/components/esg-workbook/esgSectionConfigs.ts` | **input cell addresses — Part 3 corrections land here** |
| `apps/web/src/lib/esg/esgDeriveSummary.ts` | **derivation rules — Part 2 `MISSING derivation` items land here** |
| `apps/web/src/lib/esg/esgGridSections.ts` | register-grid column↔column-letter mapping |
| `apps/web/src/lib/esg/esgScoringDefaults.ts` | `ESG_GOLDEN_SG_CONSUMER` — Part 4 gate |
| `apps/web/EsgToolkit/src/lib/fixtures/esg-consumer-golden.generated.json` | golden cells (already on the **correct** Assumptions layout) |
| `apps/web/EsgToolkit/src/lib/calculators/__tests__/esg-consumer-golden.test.ts` | the regression test |
