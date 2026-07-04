# FSC Empowerment Financing — Implementation-Ready Spec

**Extracted 2026-07-04** from the master FSC toolkit template
(`docs/toolkits/BBBEE Toolkit (FSC) Template v1.0.xlsx`, via
`docs/toolkits/extracted_formulas/FSC_Generic.md`) and
`docs/domain/sectors/fsc/FSC-FULL-ANALYSIS.md`. Every number is cited.

**Headline:** Empowerment Financing is **fully specified by the template** — the
earlier "pending expert sign-off / 0 pts" placeholder was a *formula artifact*
(the blank template defaults sub-sector to "Others", where every EF cell is
`=IF(sub="Banks"/"Long-Term Insurers", pts, 0)` → 0). It is buildable now without
inventing numbers. The only items that still need the human expert are three
point/total **reconciliation** questions between the template and the current
app config (see §Open Questions).

---

## Scope

EF is scored **only** for **Banks (FS701)** and **Long-Term Insurers (FS702)**.
Short-Term Insurers (FS703), Generic/Others, and Stock Exchanges have EF = N/A
(they use the plain ESD Scorecard). The calculator must return `null` for any
sub-sector other than Banks/LTI (mirror `afs.ts`).

## Point structure (EF-proper = 15 pts)

The template's `EF & ESD Scorecard - Banks/Long Term` sheets combine EF **and**
ESD on one sheet, but the app already scores SD/ED through the existing
`supplierDevelopment`/`enterpriseDevelopment` pillars. To avoid double-counting,
the EF calculator scores **only the two EF-proper indicators**:

| Line | Max pts | Target basis | Achieved (aggregation) |
|---|---|---|---|
| Targeted Investments | **12** | 100% of exposure — Banks: `Balance Sheet Exposure + Additional TI Exposure` (`SUM(C5:C6)`); LTI: `Qualifying Exposure` (`C5`). **NOT NPAT.** | Banks: `newLoansExposure` (D7); LTI: `targetedInvestmentPortion` (C6) |
| Transaction Financing & Risk Capital | **3** | 100% of TF portfolio — Banks `C9`, LTI `C6/C8` | **plain `SUM(Value)`** of the `Transaction Financing Data` table for the period. No advanced/outstanding split, no per-facility qualifying-weighting. |

Score each line `MIN(achieved / target × maxPts, maxPts)`. Sub-total = **15**.

(SD 7 / ED 3 + graduation 1 + jobs 1 [+ LTI stockbroker 2] remain in the ESD
pillar — do **not** re-score them in the EF calculator.)

## Required inputs (to ingest)

- **Transaction Financing Data** sheet → column `Value` (E), filtered by `End of month` (H). Plain sum for the period.
- **Targeted-Investment scalar cells** (typed on the scorecard sheet, not a table):
  - Banks: `Balance Sheet Exposure` (C5), `Additional TI Exposure` (C6), `Balance Sheet Exposure relating to new loans written` (C7→D7 = achieved), `Portion of B-BBEE TF & Risk Capital` (C9).
  - LTI: `Qualifying Exposure` (C5), `Portion of targeted investment target` (C6 = achieved), `Portion of B-BBEE TF & Risk Capital` (C8).

## Current-code gap

- No `calculateEmpowermentFinancingScore` exists. `esd-sed.ts` reads only `config.esd`/`config.sed`; the `empowermentFinancing` config block's SD/ED fields are dead mirror copies.
- `sectorConfig.ts` EF slots: `FSC_BANKS` (~L750), `FSC_LTI` (~L837) have `maxPoints: 0`; `fsc-banks.ts` (~L229) / `fsc-lti.ts` (~L231) have `targetedInvestmentMaxPts: 0`, `transactionFinancingMaxPts: 0`.
- `store.ts` has no EF term in `totalPoints`; `ScorecardResult.empowermentFinancing?` (`types.ts` L502) is never emitted.
- Golden tests (`fsc-banks-golden`, `fsc-lti-golden`) assert EF max = 0 and `totalMaxPoints` = 130 / 132.

## Implementation plan (mirror the AFS pattern)

1. New `apps/web/Toolkit/src/lib/calculators/empowermentFinancing.ts` — score the 2 EF-proper lines (15 pts), `null` for non-Banks/LTI.
2. New `EmpowermentFinancingData` type + emit `ScorecardResult.empowermentFinancing`.
3. Config: set `targetedInvestmentMaxPts: 12`, `transactionFinancingMaxPts: 3`, EF `maxPoints: 15`; add exposure-basis fields.
4. Ingestion: read the TF table `Value`/`End of month` + the scalar exposure cells in `normalizeExcelBuffer` + `projectWorkbookToClient`.
5. Store/harness: add `efForTotal` to `totalPoints`; emit the pillar (AFS block pattern).
6. Update golden tests: EF max 0→12/3; `totalMaxPoints` 130→~145 (Banks) / 132→~147 (LTI) **pending the exact total (see Open Questions)**; add EF full/empty/partial/null suites.

## Open questions (for Zoleka — reconciliation, not missing data)

1. **Grand total denominator.** `FSC-FULL-ANALYSIS.md` §5/§12 gives the Banks total as **"~144"** and LTI **"~146"** ("exact max depends on bonus ownership rows"). The current code uses 130 / 132 (EF excluded). Since the denominator drives the B-BBEE **level thresholds** for every FSC client, the **exact** total must be pinned (by tracing the Summary Scorecard's IF-gated pillar sum for Banks/LTI, or by expert confirm) before changing `totalMaxPoints`.
2. **SD max 7 (template) vs 10 (app config)** — `⚠ CONFLICT`.
3. **ED base 3 (template) vs 5 (app config)** — `⚠ CONFLICT`.

Items 2–3 are pre-existing app-vs-template discrepancies independent of EF; they
should be reconciled but do not block the EF-proper calculator.

**Bottom line:** the EF calculator (15 pts, both indicators, targets, inputs,
aggregation) can be built now with zero invented numbers. Wiring it into the
live/harness total requires pinning the exact grand-total denominator first,
because that shifts level thresholds for real clients.
