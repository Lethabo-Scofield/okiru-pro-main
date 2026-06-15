# Toolkit Coverage Dashboard

> **Generated:** 2026-05-28 · **Comparison:** [`comparison_output.md`](./comparison_output.md) · **Extractor:** `extract_fast.py` → `extracted_*.json`

## Summary

| Sector | Pillars matched | Inputs extracted (rows) | Discrepancies | Coverage % est. |
|--------|:---------------:|:-----------------------:|:-------------:|:---------------:|
| RCOGP Generic | 6 / 8 | 543 (12 sheets) | 10 | 63.0% |
| RCOGP QSE | 2 / 8 | 361 (11 sheets) | 9 | 23.1% |
| Agri Generic | 4 / 9 | 541 (12 sheets) | 17 | 29.6% |
| ICT Generic | 3 / 9 | 555 (12 sheets) | 21 | 19.2% |
| ICT QSE | 1 / 8 | 367 (11 sheets) | 11 | 7.7% |
| FSC Generic | 2 / 12 | 660 (20 sheets) | 16 | 26.1% |
| **Total** | **18 / 54** | **3,127** | **84** | **~28%** |

### Coverage % methodology

**Coverage % est.** = `(YES rows ÷ comparable rows) × 100` across all pillar + criterion tables in `comparison_output.md` (excludes `?` and “not in Excel” rows without a codebase pair).

**Pillars matched** = pillar max-point rows where Excel and codebase agree (`YES` in Pillar Max Points table only).

**Inputs extracted** = scorecard-related rows in `extracted_*.json` (`extract_fast.py` target sheets: Summary, Ownership, MC, Skills, Procurement, ESD, SED, Industry Norms, EAP, etc.).

## Per-sector notes

### RCOGP Generic
- Strong pillar alignment (6/8); main gaps: ESD pillar totals (SD/ED), Skills/PP criterion parsing zeros from Excel.
- Industry norms: 8 SARS-sourced entries in toolkit vs fabricated `STANDARD_INDUSTRY_NORMS` in codebase.

### RCOGP QSE
- Grand total mismatch (Excel 108 vs Code 124); ESD SD/ED weights differ (5/5 vs 15/10).
- Fewer extracted sheets (11) — QSE template layout.

### Agri Generic (AgriBEE)
- MC combined total in Excel (23) vs split MC+EE in codebase (19+11).
- SED and PP pillar totals diverge; several MC senior/disabled criteria missing in codebase mapping.

### ICT Generic
- Highest discrepancy count (21): Grand Total, SED, ED, MC criterion grid misalignment.
- Employment Equity pillar in codebase only — not surfaced on Excel summary parser.

### ICT QSE
- Lowest coverage (7.7%): multiple pillar totals off; same ESD pattern as RCOGP QSE.

### FSC Generic
- Most extracted sheets (20) but parser misses FSC-specific pillars (EF, AFS, Consumer Education) on summary.
- MC “Other Exec” rows dominate discrepancies (Excel 10/4 vs Code 2/1).

## Priority actions (Phase 2+)

1. Fix `compare_v2.py` / extractor column maps for Skills and Procurement criteria (many `Excel=0`).
2. Add FSC summary-sheet labels for EF, AFS, SED & CE to pillar inventory.
3. Replace `STANDARD_INDUSTRY_NORMS` with per-toolkit SARS industry norm tables.
4. Author remaining sector SLS files from [`sls-template.md`](../domain/sectors/sls-template.md) (RCOGP Generic draft: `docs/domain/sectors/rcogp/generic/sls.md`).
5. Wire `scripts/sls-coverage-check.ts` to `CalculatorConfig` once SLS files exist.

## Related paths

| Artifact | Path |
|----------|------|
| Comparison report | `docs/toolkits/comparison_output.md` |
| Extracted JSON | `docs/toolkits/extracted_*.json` |
| Compare script | `docs/toolkits/compare_v2.py` |
| Codebase config | `apps/api/pipeline/sectorConfig.ts` |
| SLS template | `docs/domain/sectors/sls-template.md` |
| SLS validator | `scripts/sls-coverage-check.ts` |
