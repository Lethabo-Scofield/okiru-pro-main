# ESG SCORING DELTA — corrected calculation vs. the client workbook

**Scope:** `apps/web/EsgToolkit/src/lib/calculators/*`
**Specification:** [`ESG_FORMULA_LEDGER.md`](./ESG_FORMULA_LEDGER.md)
**Raw evidence:** `docs/esg/extracted/*.json` (verbatim cell + formula dump of
`Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx`)

---

## 0. What this document is

The client workbook contains genuine defects: formulas that point at cells which
do not exist, a threshold ladder with blank rungs, and three indicators that
award points to a company that has entered nothing at all.

The product decision was to **ship the corrected calculation as live**, keep the
workbook's original output provable as an audit reference, and write down every
number that moved. That is this file.

| | What it is | Where it lives |
|---|---|---|
| **Corrected** | The live calculation. Default for every caller. | `mode: "corrected"` (the default) |
| **Workbook parity ("as-was")** | The client spreadsheet reproduced verbatim, defects included. Audit reference only. | `mode: "workbook-parity"` |

Both modes share one code path. They branch on **seven** indicators only:

* three defect fixes — `E d7`, `S d18`, `G d25` (§2.1, §2.2);
* four indicators the workbook never computed at all and the corrected
  calculation now scores from inputs added alongside this work — `E d12`,
  `E d24`, `S d22`, `S d24` (§2.4). Parity keeps the workbook's literal `0`.

Every other indicator is one shared implementation, so parity cannot silently
rot. On the golden dataset the two modes differ on **exactly two** indicators,
and a test asserts that (`esg-consumer-golden.test.ts`).

---

## 1. Pillar totals

Dataset: SG Consumer FY 2025/26, the golden fixture
(`apps/web/EsgToolkit/src/lib/fixtures/esg-consumer-golden.generated.json`).

| Pillar | Workbook cell | As-was | **Corrected (live)** | Δ |
|---|---|---|---|---|
| Environmental | `E_Scorecard!D30` | 36 / 108 | **36 / 108** | — |
| Social | `S_Scorecard!D28` | 33 / 100 | **25 / 100** | **−8** |
| Governance | `G_Scorecard!D26` | 64.8529411765 / 100 | **59.8529411765 / 100** | **−5** |
| Overall | `ESG_Dashboard!D9` | 0.4461764706 | **0.4028431373** | −0.0433 |

**Every point of the −13 is a point the workbook awarded without evidence.** No
indicator lost a point it had earned.

Environmental is unchanged *on this dataset only*: five E indicators went from
`const dN = 0;` to real formulas, and all five legitimately evaluate to 0 for SG
Consumer (no solar generation, no fleet register captured, no EV data). Their
correctness is proven by the per-indicator tests in §5, not by this total.

---

## 2. Every indicator that changed

`before` = the value the shipped code produced on the golden dataset.
`after` = the corrected live value on the same dataset.

### 2.1 Formulas ported out of `const dN = 0;`

| id | Indicator | Pts | Before | After | What changed | Evidence cell |
|---|---|---|---|---|---|---|
| **E d7** | GHG: Scope 2 net reduction (solar offset) | 8 | `0` hardcoded | `0` (computed) | Workbook reads `E_Data!M80` / `M81`; **rows 80–81 stop at column L, so both cells are empty and the indicator was 0 for every company forever.** Repointed to `L80` (Scope 2 gross) / `L81` (solar offset), and the leading `−` dropped because `L81 = SUM(L50:L54)` is a positive kWh sum. | `E_Data!L80`, `L81` |
| **E d13** | Energy: % renewable electricity ≥20% | 8 | `0` hardcoded | `0` (computed) | Never ported. `thrRenew` was read and thrown away. Now `(L50+L51+L52+L53+L54)/L46` banded against `Assumptions!B44`. | `E_Data!L50:L54`, `L46` |
| **E d15** | Fleet: L/100km within norm | 8 | `0` hardcoded | `0` (computed) | `environmental.ts` never read the `fleet` section at all. Now `8 × within-norm ÷ MAX(1, measured)` off the derived SUMPRODUCT/COUNTIF terms. | `fleet!_l100_within_norm`, `_l100_positive`, `_vehicle_count` |
| **E d16** | Fleet: CO₂ per tonne-km tracked | 5 | `0` hardcoded | `0` (computed) | As above. Needs ≥1 vehicle with **both** carry kg and monthly km. | `fleet!_tonne_km_rows` |
| **E d17** | Fleet: EV vehicles as % of fleet | 5 | `0` hardcoded | `0` (computed) | As above. Number-coerces the workbook's TEXT totals (`"134"` / `"0"`). | `fleet!B28`, `H28` |
| **S d6** | EE: % Black female management (L1–L3) | 6 | `0` hardcoded | `0` (computed) | The headcount matrix now rolls up into `S_Data!B5:L12`, so `(F5+F6+G5+G6+H5+H6)/(L5+L6)` is computable instead of hardcoded. | `S_Data!F5,F6,G5,G6,H5,H6,L5,L6` |

All six are 0 on the golden dataset because SG Consumer's workbook carries no
solar generation, no fleet register and an all-zero headcount matrix. Each is
proven to score correctly on real data by a dedicated test (§5).

**34 of these 40 points were structurally unreachable before this change.**

### 2.2 Indicators whose value moved on the golden dataset

| id | Indicator | Pts | Before | **After** | Defect | Evidence |
|---|---|---|---|---|---|---|
| **S d18** | H&S: Zero fatalities | 8 | **8** | **0** | `IF(OR(G28=0, G28="—", G28=""), 8, 0)` — the blank and em-dash branches mean "never reported" scores the same as "reported zero". The em-dash is the template author's placeholder, hand-typed into `G28` while `G29` next to it is a live `=SUM(C29:F29)`. | `S_Data!G28 = "—"` (`docs/esg/extracted/S_Data.json`) |
| **G d25** | Compliance: No material regulatory penalties | 5 | **5** | **0** | `IF(G_Data!B25="", 5, …)` against a cell that **does not exist** — `G_Data` row 24 is "Anti-corruption training", row 26 is the total, there is no row 25 anywhere in the sheet. Five free points to every company, permanently. | `G_Data` has no row 25 (`docs/esg/extracted/G_Data.json`) |

**Corrected rule for both:** the company must make an actual assertion.
`S d18` now scores 8 only when a fatality count of **0** is reported (the derived
`G28 = SUM(C28:F28)` means entering 0/0/0/0 for the four quarters earns it, and
reporting a fatality loses it). `G d25` now scores 5 only on an explicit nil
penalty assertion.

### 2.3 Wrong-cell and fabricated-denominator fixes

| id | Indicator | Pts | Before | After | What changed | Evidence |
|---|---|---|---|---|---|---|
| **S d20** | H&S: Incident investigation rate | 4 | 4 | 4 | Read `S_Data!G29` alone; the workbook is `SUM(G29:G33)`. A company recording only MTIs, near-misses, vehicle or property incidents scored 0 for having an investigation process. Same value here (both > 0), different behaviour on real data. | `S_Scorecard!C20` |
| **G d5** | King V: Score ≥70% | 25 | 19.8529411765 | 19.8529411765 | `/170` was an inline literal, frozen regardless of how many principles the grid holds. Now `king5!_max_score` (derived as `10 × max(17, rows)`), falling back to the named `KING5_MAX_SCORE = 170` — the workbook's own figure in `King5_Scorecard!E22`. | `King5_Scorecard!E21`, `E22` |
| **G d9** | IFRS: S1/S2 disclosures prepared | 10 | 0 | 0 | Two defects. (a) The workbook runs `COUNTIF(D4:D40,"Yes")` against a `Disclosed / Partially Disclosed / Not Disclosed / N/A` vocabulary — the literal "Yes" can never occur, so the numerator is 0 forever and the denominator collapses to `MAX(1,−33)=1`. (b) Our code substituted `readEsgCell(…,"ifrs","_total") ?? 10` — a **fabricated** denominator matching neither the sheet's 110 nor the formula's 1. Now `10 × E29 / 110` using the sheet's own scoring column. | `IFRS_S1_S2!E29`, `E30 = E29/110` |
| **S d17** | H&S: LTIFR ≤ 2.0 | 8 | 0 | 0 | Two divergent LTIFR implementations existed. Unified on `shared.prLtifr` (the one production used), which reproduces the workbook band exactly, including the `Assumptions!B9` stance floor. See §6 for the stub that must die. | `S_Data!G35` |

### 2.4 MANUAL_ZERO indicators now scored (inputs landed with this work)

The workbook holds a literal `0` and no formula for these. Ledger Part 5
specifies a rule for each; all four were blocked on inputs that did not exist,
and those inputs now do (`esgSectionConfigs.ts`). Leaving them hardcoded would
have created a collected-but-never-scored dead input.

| id | Indicator | Pts | Rule (ledger 5.1 / 5.2) | Input | Golden |
|---|---|---|---|---|---|
| **E d12** | Energy efficiency improvement YoY | 5 | Mirrors `d6`: `(B92 − L46)/B92` banded on `THR_GHG_YOY` | `E_Data!B92` prior-year kWh | 0 (absent) |
| **E d24** | Water efficiency initiative active | 3 | `IF(B94="Yes",3,IF(B94="Partial",1.5,0))` | `E_Data!B94` | 0 (absent) |
| **S d22** | CSI/SED spend ≥1% NPAT | 5 | `D82/B84` banded on `THR_CSI` (`B56`) | `S_Data!B84` NPAT + derived `D82` | 0 (absent) |
| **S d24** | Local labour procurement ≥40% | 5 | `B86/B87` banded on `THR_LOCAL` (`B57`) | `S_Data!B86`/`B87` | 0 (absent) |

`S d22` deliberately divides by **`B84` (NPAT)**, never `B44` — `B44` is the
derived SDL levy that `S_DATA_PAYROLL_FIELDS` used to mislabel "NPAT (R)". A
test asserts a workbook with `B44` but no `B84` scores 0.

Two more became reachable with **no calculator change at all**, because the
inputs behind them landed:

* **`S d8`** — % Persons with Disabilities (5 pts). `EE_Scorecard!B8` is the
  constant-zero formula `=0` in the workbook, but `esgDeriveSummary` computes it
  as `S_Data!B88 ÷ L12` and `B88` ("Employees with disabilities (headcount)")
  now exists. Covered end-to-end by tests.
* **`S d10`** — EE numerical targets set (3 pts). The formula always read
  `EE_Scorecard!B12`; the cell simply had no UI. `EE_MATURITY_ROWS` now carries
  `B11`–`B14`.

None of these moves the corrected baseline — the golden fixture carries none of
the new inputs — so they are pure additional reach: **26 more points a company
can now actually earn.**

---

## 3. Unconditional / default-pass scores removed

These awarded points to a workbook containing **no data at all**.

| # | id | Pts | The defect | Corrected behaviour |
|---|---|---|---|---|
| 1 | **E d9** — Net-zero target formally set (SBTi) | 5 | `readEsgCell(…,"B107") ?? SBTI_TARGET_YEAR` — the sector config's **2050** stood in for a target the company never set, so `AND(B107>=2030, B107<=2060)` was true for everyone. A blank workbook had "formally set an SBTi net-zero target". | No fallback. Absent `Assumptions!B107` → 0. |
| 2 | **S d18** — Zero fatalities | 8 | See §2.2. Blank workbook → full 8 points. | Requires a reported count of 0. |
| 3 | **G d25** — No material regulatory penalties | 5 | See §2.2. Reads a row that does not exist → 5 points forever. | Requires an explicit nil assertion. |

**18 of 308 points were payable to an empty workbook.** After this change a blank
workbook scores **exactly 0 on all 53 indicators** — asserted three ways (named
only / stance chosen / all sections present but empty) in
`esgNoFreePoints.test.ts`.

> `S d23` (CSI initiatives, 5 pts) previously defaulted its count to its own
> threshold and was fixed before this pass. It is now covered by a regression
> test so it cannot come back.

---

## 4. Magic numbers and fabricated values removed

| Location | Was | Now | Justification |
|---|---|---|---|
| `governance.ts` `d5` | `(king5 / 170) * 25` | `king5!_max_score`, fallback `KING5_MAX_SCORE` | 17 principles × 10; the workbook's own divisor in `G_Scorecard!C5` and `King5_Scorecard!E22`. Now a named, cited constant used only when a total was imported without its grid. |
| `governance.ts` `d9` | `readEsgCell(…,"ifrs","_total") ?? 10` | `ifrs!_max_score`, fallback `IFRS_MAX_SCORE = 110` | 22 requirement rows × 5; `IFRS_S1_S2!E30 = E29/110`. The `10` had no source. |
| `shared.ts` `pr()` | `minCap((ratio * maxPts * 100) / 100, maxPts)` | `minCap(ratio * maxPts, maxPts)` | `×100/100` was a no-op. |
| `bbbeeBridge.ts` | `eePts × floor × {0.1, 0.1, 0.05}` | The workbook's real Statement 000 formulas | See §4.1. |
| `netZero.ts` | `MILESTONE_DEFS` with one shared `gapTco2e`; `targetYear` read but unused | Per-milestone targets from the workbook trajectory; `Assumptions!B107` drives the terminal year | See §4.2. |
| `carbonTax.ts` | `?? CARBON_ANNUALISE_FACTOR` (= 12/9) | `12 / Assumptions!B111`, else `1` | 1.333 is **SG Consumer's nine-month** annualiser. Applied to any other company it inflated the liability by a third. `1` is the neutral identity, not another client's reporting period. |
| `EsgNetZero.tsx` | Hardcoded `LEVERS` array | Workbook levers, else an empty state | The array carried the **source client's** action plan and owner roles ("Fleet Mgr", "Ops", "WSP", "SHEQ") and rendered it to every company. |

### 4.1 The B-BBEE bridge

The coefficients `0.1 / 0.1 / 0.05` appear nowhere in the workbook, in
`docs/esg/`, or in the Codes of Good Practice. Worse, the multiplicand came from
`ee!E15` or `ee!D15`, **neither of which anything wrote**, so all three credits
were always 0 and the page rendered a column of zeros that read as earned
results.

No coefficient needed inventing, because `docs/esg/extracted/B_BBEE_ESG.json`
rows 6–11 already carry the real element formulas:

```
Ownership          B6=25   E6 = IF(D6>=0.251,25,IF(D6>=0.251*B9,25*D6/0.251,0))
Management Control B7=19   D7 = EE_Scorecard!E15/100          E7 = D7*19
Skills Development B8=25   D8 = S_Data!B50/MAX(1,S_Data!B43)
                           E8 = IF(D8>=0.06,25,IF(D8>=0.06*B9,25*D8/0.06,0))
Enterprise & Supplier Dev  B9=40   E9 = D9*40
Socio-Economic Dev B10=5   E10 = IF(D10>=B56,5,IF(D10>=B56*B9,5*D10/B56,0))
Bonus              B11=5   E11 = MIN(5,D11)
E12 = SUM(E6:E11)          B12 = SUM(B6:B11) = 119
```

Two of the six have inputs in this app and are now computed:

* **Management Control** — from the derived `EE_Scorecard!E15`. On the golden
  dataset this reproduces the workbook's `E7 = 6.65` exactly (`E15 = 35` →
  `0.35 × 19`). Asserted as a parity test.
* **Skills Development** — training spend ÷ leviable payroll against the 6% target.

The other four (Ownership, ESD, SED, Bonus) are hand-entered `D` cells on a sheet
the app has no editor for. They are reported as **not available**, each with the
reason, rather than as `0` — a company with no ownership data has not scored zero
on ownership, it has not measured it.

**The status level.** `B_BBEE_ESG!B15` compares the total against
`Assumptions!B76:B83`, and **`B79` (Level 4) and `B81` (Level 6) are blank in the
source workbook**, so `E12 >= 0` matches the Level-4 rung and the sheet reports
**"Level 4" for any score at all** — including the 6.65 out of 119 it actually
holds. Per the instruction not to invent thresholds, the corrected bridge returns
**`null` / "Not determined"** and names the blank rungs, and also refuses a level
when any element could not be measured. A workbook carrying a complete ladder
computes a real level (tested).

### 4.2 The net-zero roadmap

All four milestones received the **same** `gapTco2e` (`current − baseline`), so
the table printed one number four times and said nothing about whether 2028 or
2050 was in reach. `Assumptions!B107` was read and never used.

`NetZero_Roadmap!C5:L5` already publishes a real Scope 1+2 trajectory as live
formulas (`=IFERROR(B5*(1-x),0)`):

| 2025 | 2026 | 2027 | 2028 | 2029 | 2030 | 2035 | 2040 | 2045 | 2050 |
|---|---|---|---|---|---|---|---|---|---|
| 0% | 5% | 12% | 20% | 35% | 50% | 65% | 78% | 90% | 95% |

Each milestone now has `reductionRequired`, `targetTco2e = baseline × (1 − r)`,
and its own `gapTco2e`. Tiers, years and requirement strings are
`NetZero_Roadmap!A13:C16` verbatim; the terminal milestone's year comes from
`Assumptions!B107`, so a company targeting 2040 sees 2040. Between published
columns the trajectory is interpolated linearly (SBTi's own linear-annual-reduction
convention) and clamped outside the range — no new reduction target is invented.

> **Workbook conflict surfaced, not resolved.** The Recognised tier's requirement
> text says "−50% Scope 1+2 from baseline" at **2028**, while the numeric
> trajectory puts −20% at 2028 and −50% at **2030**. Per the ledger's own
> convention ("the formula is authoritative; the note is not") the target is
> computed from the trajectory and the prose is passed through unaltered for
> display. **This needs a decision from the methodology owner.**

---

## 5. Things I could not justify from a source — and what I did instead

Nothing was invented. Where no source exists the indicator scores **0** and is
listed here.

### 5.1 The six MANUAL_ZERO indicators still at 0 (28 pts)

Four of the original ten are now scored (§2.4). The remaining six are **blocked
on a missing derivation, not a missing input** — the raw data is already
captured in the `ISO_Tracker` and `SAQ_Supplier` grids, but nothing rolls it up
into the cells the ledger's rules read.

| id | Pts | Rule needs | Blocked on |
|---|---|---|---|
| `E d26` ISO 14001 certification | 8 | `ISO_Tracker!E16`, `E17` | derivation of `ISO_Tracker!E5:E17` |
| `E d27` Aspects register | 4 | `ISO_Tracker!E10` | same |
| `E d28` Environmental policy board-approved | 4 | `MIN(G_Data!F27, ISO_Tracker!E8)` | `G_Data!B27` input **now exists**, but neither `F27` (not in `GOV_YN_ROWS`) nor `ISO_Tracker!E8` is derived |
| `E d29` NEMA/NWA/NEMWA legal compliance | 4 | `ISO_Tracker!E11`, gated on `G_Data!F21` | derivation of `ISO_Tracker` |
| `S d26` Supplier H&S ≥80% | 5 | `AVERAGE(SAQ_Supplier!D5:D16)` | derivation of the SAQ column means |
| `S d27` Supplier food safety | 5 | `AVERAGE(SAQ_Supplier!F5:F16)` | same |

`E d28` is the cheapest of the six: adding row 27 to `GOV_YN_ROWS` in
`esgDeriveSummary.ts` plus an `ISO_Tracker!E8` derivation unlocks 4 points.
**All six are scored 0, not defaulted.**

### 5.2 Other unavailable values

| Item | Why | What we do instead |
|---|---|---|
| **B-BBEE Ownership / ESD / Bonus** | Hand-entered `B_BBEE_ESG!D6/D9/D11`; no editor in the app. | Reported **"not available"** with a reason — never 0. |
| **B-BBEE SED** | Needs CSI spend ÷ NPAT. **Now measurable** once `S_Data!B84` (NPAT) is filled — the bridge reads it, with the derived `D82` as the numerator. | Computed when both are present; "not available" otherwise. |
| **B-BBEE status level** | `Assumptions!B79` / `B81` are blank in the workbook. The Generic Codes' real values (commonly 80 and 65) are a **business decision**. | Returns **"Not determined"** and names the blank rungs. Thresholds are not back-filled. |
| **Net-zero levers** | No `NetZero_Roadmap` input section exists. | Returns `[]`; the page shows an empty state instead of the source client's plan. |
| **2028 milestone requirement** | Workbook prose and workbook formula disagree (§4.2). | Formula used, prose displayed, decision escalated. |

---

## 6. Follow-ups in files this change does not own

| File | Issue | Recommended action |
|---|---|---|
| `apps/web/src/lib/esg/esgScoringDefaults.ts` | `esgLtifrPoints` is a self-described "Phase 1 stub" that hardcodes the stance floor as a doubling (`ltifr <= thrLtifr * 2`) and ignores `Assumptions!B9`. It is exported but has **no production caller** — only its own test. Two divergent LTIFR implementations is one too many. | **Delete `esgLtifrPoints` and its test.** `shared.prLtifr` is the single implementation. |
| `apps/web/src/lib/esg/esgGridRows.ts:134` | `cells._total = withStatus.length \|\| 10` — the fabricated IFRS denominator. `governance.ts` no longer reads it. | Delete the `\|\| 10`, or the whole `_total` cell. |
| `apps/web/src/lib/esg/esgDeriveSummary.ts` | The six indicators in §5.1 are blocked here, not on inputs: no `ISO_Tracker!E5:E17` roll-up, no `SAQ_Supplier` column means, and `G_Data!F27` is missing from `GOV_YN_ROWS`. | Add the three derivations — 28 points, no calculator change needed beyond wiring the ledger's rules. |
| `apps/web/EsgToolkit/src/pages/EsgNetZero.tsx`, `EsgBbbeeBridge.tsx` | **Edited by this change** (minimally) so they consume the corrected calculators rather than the removed fabricated fields. Net-zero now renders per-milestone targets and an empty lever state; the B-BBEE page renders the six elements with availability and the "Not determined" level. | Design review of the two pages. |
| `apps/web/src/lib/esg/esgValidationRules.ts:286-291` | Stale comment: "`scoreGovernance` awards 5 free points for `d25`". It no longer does. The rule's belt-and-braces `hasAnyCells` guard is still correct and its test still passes — the comment is the only thing out of date. | Reword the comment (file is on the do-not-edit list for this change). |

### 6.1 A divergence found and fixed in passing

`EsgEnvironmental.tsx`, `EsgSocial.tsx` and `EsgGovernance.tsx` called the pillar
scorers on `store.workbook` — the **raw** workbook — while the Dashboard scores
the **derived** one (`computeEsgScorecard` runs `deriveEsgSummaryCells` first).
The same company therefore saw a lower score on `/environmental` than on the
Dashboard for any manually-entered workbook, and this change makes that gap much
wider because far more indicators now depend on the derivation layer. All three
pages now derive before scoring.
| Methodology owner | The 2028 requirement conflict (§4.2). | Decide: prose (−50%) or trajectory (−20%). |

---

## 7. Test coverage

| File | Tests | What it proves |
|---|---|---|
| `__tests__/esg-consumer-golden.test.ts` | 12 | **As-was parity** reproduces E 36 / S 33 / G 64.8529411765 / D9 0.4461764706 and carries all three defects; **corrected baseline** is the live gate with every indicator asserted individually; the two modes differ on exactly `S d18` and `G d25`. |
| `__tests__/esgIndicatorFormulas.test.ts` | 69 | Every ported formula, at the threshold, pro-rata, below the floor, and with the denominator absent — plus **end-to-end** runs from raw grid inputs through `deriveEsgSummaryCells` for `d7`, `d13`, `d15/16/17`, `d19/d21`, `S d6`, `S d8`, `S d17`, `S d18`, `S d22`, `G d5`, `G d9`. |
| `__tests__/esgNoFreePoints.test.ts` | 29 | **A blank workbook scores 0 on all 53 indicators**, in three different blank shapes; each removed unconditional score asserted individually. |
| `__tests__/esgBridges.test.ts` | 20 | Carbon tax reproduces `Carbon_Tax!C11/D11/E11/B16/C16` and is **non-zero for a manually-entered workbook**; per-milestone net-zero targets are distinct and `B107` is used; the B-BBEE bridge reproduces `B_BBEE_ESG!E7 = 6.65` and refuses to report a level from a holed ladder. |
| `__tests__/esgDashboardRows.test.ts` | 9 | Dashboard rows project the indicator ledger; earned points updated to the corrected baseline. |

```
npx vitest run --config apps/web/vitest.config.ts EsgToolkit/src/lib/calculators/__tests__ --testTimeout=60000
→ 6 files, 147 tests passed

npx vitest run --config apps/web/vitest.config.ts src/lib/esg EsgToolkit --testTimeout=60000
→ 36 files, 403 tests passed
```

---

## 8. Points ledger after this change

Against the ledger's own Part 5.4 buckets:

| Ledger bucket | Pts | Resolved | Still dead |
|---|---|---|---|
| **Unreachable FORMULA rows** — `E d7` 8, `G d9` 10, `S d8` 5, `S d10` 3 | 26 | **26** (ported / corrected / inputs landed) | 0 |
| **Free points from a non-existent cell** — `G d25` | 5 | **5** (now requires an assertion) | 0 |
| **E MANUAL_ZERO** — `d12` 5, `d24` 3, `d26` 8, `d27` 4, `d28` 4, `d29` 4 | 28 | **8** (`d12`, `d24`) | 20 |
| **S MANUAL_ZERO** — `d22` 5, `d24` 5, `d26` 5, `d27` 5 | 20 | **10** (`d22`, `d24`) | 10 |
| **Total dead or unearned** | **79** | **49** | **30** |

Separately, the ledger's "reachable but with no input path" bucket — `E d13` 8,
`d15` 8, `d16` 5, `d17` 5, `d19` 5, `d20` 4, `d21` 3, `S d6` 6 = **44 points**,
of which only 12 scored and only because the golden fixture injected the cells —
is now **fully live from real UI inputs**, proven end-to-end by tests.

The remaining 30 dead points sit across six indicators and are blocked on three
derivations (`ISO_Tracker!E5:E17`, the `SAQ_Supplier` column means, and
`G_Data!F27`), all named in §5.1 and §6.

And the headline: **a blank workbook now scores 0.** It used to score 18.
