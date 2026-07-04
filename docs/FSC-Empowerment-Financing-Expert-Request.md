# FSC Empowerment Financing — Status & Narrowed Expert Questions

**Status (updated 2026-07-04):** The scoring rules were **found in the master
FSC toolkit template** — EF is *not* expert-blocked after all. See the full
extracted spec in **[FSC-Empowerment-Financing-Spec.md](./FSC-Empowerment-Financing-Spec.md)**.
The calculator is buildable now without inventing any numbers. Only three
point/total **reconciliation** questions remain for the expert (below).
**Raised:** 2026-07-04
**Scope:** FSC Banks (FS701) and Long-Term Insurers (FS702) only. STI (FS703) and
FSC "Others"/Generic have EF = N/A per the sector code and are unaffected.

## Summary

The FSC test workbooks carry a fully-populated **Empowerment Financing** sheet
(billions of Rand in qualifying facilities), but the Toolkit does **not** score
it: there is no `calculateEmpowermentFinancingScore` calculator, the live store
never computes it, and the workbook sheet is never ingested.

**Correction to the original flag:** the config's "0 points … pending expert
sign-off" was a *formula artifact* — the blank template defaults the sub-sector
to "Others", where every EF cell is `=IF(sub="Banks"/"Long-Term Insurers", pts, 0)`
and collapses to 0. The **Banks** and **Long-Term** scorecard sheets in the
master template DO fully define EF: **Targeted Investments 12 pts** (100% of
Balance-Sheet / Qualifying Exposure) + **Transaction Financing 3 pts** (100% of
TF portfolio, plain `SUM(Value)`), = **15 EF-proper points**. So this is an
ingestion + calculator build (like Skills/ESD were), NOT a targets gap.

The aggregation is a plain `SUM` of the `Transaction Financing Data` table's
`Value` column — there is **no** "Advanced vs Outstanding vs Qualifying-weighted"
split in the generic FSC toolkit (those column names do not appear in the
extracted template), so the evidence table below overstates the input model.

## Evidence (Sechaba_Financial_Group_FSC_Banks_LongTerm workbook)

The "Empowerment Financing" sheet lists 6 facilities, **Rand Value Advanced = R9.8 bn**:

| Facility | EF Category | Advanced (R) | Outstanding (R) | Qualifying % |
|---|---|---|---|---|
| Renewable energy IPP facility | Transformational Infrastructure | 3,200,000,000 | 2,240,000,000 | 100 |
| Affordable housing development fund | Affordable Housing | 2,100,000,000 | 1,470,000,000 | 100 |
| Black commercial farmer funding | Agricultural Development | 900,000,000 | 630,000,000 | 100 |
| Black SME credit facility | Black SME Financing | 1,600,000,000 | 1,120,000,000 | 100 |
| B-BBEE ownership transaction funding | B-BBEE Transaction Financing | 1,200,000,000 | 840,000,000 | 100 |
| Black business growth fund | Black Business Growth / PE | 800,000,000 | 560,000,000 | 100 |

All of this currently contributes **0 points** to the scorecard.

## What we still need from the expert (narrowed to 3 reconciliation questions)

The EF **calculator** (15 pts, both indicators, targets, inputs, aggregation) is
now fully specified by the template and can be built without expert input. What
remains is reconciling three places where the template and the current app config
disagree — and these matter because they change the **denominator**, which shifts
B-BBEE **level thresholds** for real FSC clients:

1. **Grand-total denominator.** `FSC-FULL-ANALYSIS.md` gives the Banks total as
   **"~144"** and LTI **"~146"** ("exact max depends on bonus ownership rows"),
   whereas the app uses **130 / 132** (EF excluded). The **exact** total must be
   pinned (by tracing the Summary Scorecard's IF-gated pillar sum for Banks/LTI,
   or by your confirmation) before we raise `totalMaxPoints` and re-level clients.
2. **Supplier Development max — template 7 pts vs app config 10 pts.**
3. **Enterprise Development base — template 3 pts vs app config 5 pts.**

Questions 2–3 are pre-existing app-vs-template point discrepancies independent of
EF; they should be reconciled but do not block the EF-proper calculator.

## Impact if left as-is

All six FSC test workbooks already reach **Level 1** without EF, so this does not
block the Level-1 fitness target. But live FSC Banks/LTI clients with real
Empowerment Financing are **under-scored** by up to 15 points — a concrete case
of "points the workbook accounts for aren't reflecting on the scorecard."

## Related (already fixed, for contrast)

- **Consumer Education** (same SED & CE scorecard) had the *same shape* of gap —
  a populated sheet that wasn't ingested — and was fixed by ingestion alone
  (commit `fix(fsc): ingest Consumer Education sheet…`). EF is now in the same
  position: calculator + targets exist in the template; only the total-denominator
  reconciliation gates wiring it into the live score.
