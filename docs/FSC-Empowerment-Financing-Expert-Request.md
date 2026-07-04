# FSC Empowerment Financing — Expert Validation Request

**Status:** Blocked on expert sign-off (Zoleka / FSC specialist)
**Raised:** 2026-07-04
**Scope:** FSC Banks (FS701) and Long-Term Insurers (FS702) only. STI (FS703) and
FSC "Others"/Generic have EF = N/A per the sector code and are unaffected.

## Summary

The FSC test workbooks carry a fully-populated **Empowerment Financing** sheet
(billions of Rand in qualifying facilities), but the Toolkit does **not** score
it: there is no `calculateEmpowermentFinancingScore` calculator, the live store
never computes it, and the workbook sheet is never ingested. The sector configs
allocate the pillar but pin every EF sub-line to **0 points** with the code
comment *"best-effort 0 pts pending expert sign-off"*
(`apps/web/Toolkit/src/lib/sectors/fsc-banks.ts` ~line 227, same for `fsc-lti.ts`).

This is a **scoring-rule gap**, not an ingestion bug — so per the project
guardrail (never invent scoring targets) it is left at 0 until the correct
targets and point structure are confirmed by the expert, rather than guessed.

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

## What we need from the expert

To build the EF calculator without inventing targets, please confirm, for **Banks**
and **LTI** separately:

1. **Total EF points** available on the scorecard (the config placeholder is 0).
2. **Sub-line structure and point split** — e.g. Targeted Investments vs
   Transaction Financing, and any sub-caps.
3. **The target basis** for each sub-line — % of what denominator (e.g. % of total
   assets / liabilities, a Rand hurdle, or a formula), and over what period.
4. **What counts as qualifying** per EF category, and whether the measure is
   *Rand Value Advanced*, *Outstanding Balance*, or a weighted combination.
5. Whether the workbook's EF sheet columns above are the correct inputs, or if a
   different aggregate is expected.

## Impact if left as-is

All six FSC test workbooks already reach **Level 1** without EF, so this does not
block the Level-1 fitness target. But live FSC Banks/LTI clients with real
Empowerment Financing are **under-scored** by the full EF allocation — a concrete
case of "points the workbook accounts for aren't reflecting on the scorecard."

## Related (already fixed, for contrast)

- **Consumer Education** (same SED & CE scorecard) had the *same shape* of gap —
  a populated sheet that wasn't ingested — but its calculator and 0.4%-NPAT target
  already existed and were expert-signed, so it was fixed by ingestion alone
  (commit `fix(fsc): ingest Consumer Education sheet…`). EF differs because the
  calculator + targets themselves do not yet exist.
