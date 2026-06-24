# autoresearch — risk register

One row per risk. Severity: HIGH / MEDIUM / LOW. HIGH items should spawn a fix
experiment (see BACKLOG M5).

| # | Severity | Area | Risk | Evidence (file:line / source) | Proposed fix | Status |
|---|---|---|---|---|---|---|
| R1 | HIGH | Correctness | MC engine under-scored Lake Trading (6.79 vs 11.77) | EXP-3; `management.ts` board voting | Board voting now includes exec directors | DONE (deployed 762dfe47) |
| R2 | MEDIUM | Correctness | Ownership dropped 2 pts on bulk-upload (23 vs 25) | EXP-1; `projectWorkbookToClient` | New entrants credited from BNE% | DONE (deployed) |
| R3 | MEDIUM | Correctness | Construction sub-sector overloaded onto scorecardType | EXP-5; `sections.ts` | UI re-model shipped; engine integration held for review | PARTIAL (UI done) |
| R4 | MEDIUM | Maintainability | Duplicated feedback handlers — edits to the wrong one are silent | memory `devmode-feedback-infra` | Unify / mark the dead one (M4) | OPEN |
| R5 | LOW | Data integrity | Bulk-upload empty-section overwrite can blank pillars | `/api/workbook/:id/import` | Client-side mitigated; add server guard (M4) | OPEN |

## M3 misalignment hunt (EXP-6, 2026-06-24) — 14 confirmed (sector TS vs verbatim Excel)

### Clear, undocumented bugs — the loop will fix each with a golden test (no scoring judgment needed)
| # | Severity | Sector / pillar | Misalignment | Fix | Status |
|---|---|---|---|---|---|
| R6 | **HIGH** | ICT Generic / MC | senior/middle/junior band targets MISSING from config → targets resolve to NaN → **8 of 23 MC pts always score 0** for every ICT Generic entity (under-scores). `sectorConfig.ts:554-567` omits them | Added seniorBlackTarget 0.60 / BW 0.30, middle 0.75 / 0.38, junior 0.88 / 0.44 (mirror AGRI/RCOGP) + converter copy in `ict-generic.ts` + golden test (full 8 SMJ pts) | **DONE** (EXP-7, branch; deploy-eligible) |
| R7 | **HIGH** | FSC (all variants) / skills | absorption target divided by 100 **twice** → effective 0.01% vs Excel 100%; any single absorbed learner maxes the 3-pt bonus. `fsc-{generic,banks,lti,sti}.ts` + `skills.ts:392` | Config 1.0→100 (all 4 FSC) + removed mapper /100 (single-divide → target 1.0); API path auto-fixed (single-divides); corrected golden + new pro-rata test | **DONE** (EXP-8, branch; deploy-eligible) |
| R18 | MEDIUM | FSC (all variants) / skills | absorption DENOMINATOR is `totalBlackLearners`, but Excel J40 uses unemployed-LAI completers — so absorption can never reach the full 3 for a realistic mixed workforce (same class as ICT R11). Found while fixing R7. | set `absorptionBasisUnemployedLAI` for FSC (mirror ICT) — needs a golden + expert confirm | OPEN |
| R8 | **HIGH** | RCOGP QSE / skills | absorption target 1% vs Excel 100% (the "1" in C30 is the fraction 1.0). `sectorConfig.ts:1161` | 1.0 → 100 | OPEN |
| R9 | MEDIUM | ICT Generic / skills | absorption target 2.5% vs Excel 100% (D54=1). `sectorConfig.ts:591` | 2.5 → 100 | OPEN |
| R10 | MEDIUM | RCOGP Generic / skills | absorption target 2.5% vs Excel 5% (D47=0.05). `sectorConfig.ts:482` | 2.5 → 5.0 | OPEN |
| R11 | MEDIUM | ICT Generic / skills | unemployed-LAI headcount (2.1.2.2) counts ALL unemployed Black learners, not only LAI participants. `skills.ts:156` | gate increment on `isLAIProgram(prog)` (ledger-flagged) | OPEN |
| R12 | MEDIUM | AGRI Generic / procurement | BWO30 line uses 12% (spend target) as the per-supplier ownership qualification instead of 30%. `agri-generic.ts:190` overrides the correct 0.30 default | remove the bad `blackWomenThreshold: pr.bwo30Target` override | OPEN |
| R13 | LOW | FSC Generic / skills | sub-min inline comment wrong ("9.2 / 40%×23"); computed value 8.0 is correct | comment-only fix | OPEN |
| R19 | **HIGH** | Bulk upload / all sectors | real export workbooks put Company **Name + Sector + Scorecard Type on the Financials sheet header**, not the "Information Request" checklist sheet the importer reads → **every standalone upload was criticalBlocked**. Found by the Toolkit Testing Data harness (16 files). | Added `deriveCompanyMetaFromSheets` + `mapSectorString` to `normalizeExcelBuffer` (scans any sheet header for Measured Entity / Sector-Codes; maps the sector string → sector + scorecardType + FSC/construction sub-sector). **12/16 now import cleanly.** | **DONE** (EXP-10, branch; deploy-eligible) |
| R20 | **HIGH** | Bulk upload / FSC Banks·LTI·STI | the 4 FSC sub-variant workbooks still block: `Prior Year Revenue (FSC only): Required` + a Yes/No field — these sub-sectors need prior-year revenue + AFS data the importer doesn't extract from the multi-column Financials layout. | Extract `priorYearRevenue` (Prior column) + AFS additions for FSC Banks/LTI/STI; set `fscReinsurer` default | OPEN |
| R21 | **HIGH** | Bulk upload / financials (all) | the Financials sheet is `Metric \| Prior \| Measured \| Forecast`, but `parseMetaFromSheet` reads only column B = the **Prior** value → `revenue`/`npat`/`payroll` are populated with **prior-year** figures, not the measured year → wrong NPAT → wrong skills/ESD/SED targets for every uploaded workbook. | Make the financials meta parse pick the **Measured** column (header-aware), not the first value column | OPEN |

### Needs B-BBEE expert sign-off (route to Zoleka/expert — do NOT auto-fix; modeling judgment or big blast radius)
| # | Severity | Sector / pillar | Question for the expert |
|---|---|---|---|
| R14 | **HIGH** | RCOGP QSE + ICT QSE (shared `ownership.ts`) | The ≥25%/≥30% "full ownership" voting shortcut auto-awards full economic-interest, designated-group and 8-pt net value (no realisation data) and auto-passes the 3.2 net-value sub-min. Excel scores each row from its own actuals. Ledger says remove it — confirm before touching shared ownership.ts (large blast radius). |
| R15 | MEDIUM | RCOGP Generic + QSE / ESD | Guarantee SD/ED benefit factor: TS uses 3% (amended Codes); the RCOGP toolkit reference cell says 50%. Which authority governs? |
| R16 | MEDIUM | RCOGP Generic / MC | Board band is built from designation; Excel uses the Yes/No `Board?` flag (a board member with a non-director designation is excluded). Needs an `isBoardMember` field added to the model. |
| R17 | MEDIUM | AGRI Generic / skills | Cat F&G + admin recognition cap: TS uses 25% F&G + separate 15% admin; AGRI toolkit folds F&G+admin into a single 15% subtotal. May be an intentional 2019-amendment choice. |
