# Toolkit hardening — approved plan (2026-09-19)

Scope approved: "Everything, general fixes". Light mode: remove. Reports: fix data, keep exports enabled.

## A. Settings (direct asks)
A1 Remove CalculationFormulasPanel + CALC_FORMULAS (sector-blind, Excel-cell misinformation)
A2 Remove Light/System theme options, pin dark
A3 "Settings Saved" toast must await persistence, not fire optimistically

## B. Routing
B1 Dead `<Link to="/company-info">` in CalculatorConfigGate -> real target
B2 Reports + Scenarios wrapped in CalculatorConfigGate (today they render all-zero as fact)

## C. Exports — truth
C1 `state: any` -> typed against the store (root cause of C2/C3)
C2 `preferentialProcurement` -> `procurement` (PP prints 0/0 today)
C3 `tradeName` -> `tradingName`
C4 Random cert numbers -> deterministic
C5 `subMinimumMet === undefined` -> "n/a", not "Failed"
C6 employmentEquity hardcoded "0.00" -> real pillar value
C7 `|| 25` target fallbacks -> sector config
C8 exportExcel mutates live store objects -> clone
C9 `catch {}` on logExport / addImage -> surface

## D. Duplicates (parity with workbook)
D1 Manual add paths route through findDuplicates + bulkImportSpecs identities,
   same amber warning the bulk importer already shows

## E. Silent failures
E1 ToolkitView session-load failure -> error UI, not empty store
E2 scorecardType derivation (<10m -> 'Generic') -> use client's real type / EME
E3 sectorCode default 'RCOGP' -> explicit error

## F. Permissions parity  ** BEHAVIOUR CHANGE — lockout risk **
F1 apps/api pillar access reads client.workspaceId first (currently ProcessorSession only -> passes open)
F2 PATCH /api/clients/:clientId gains a role/pillar check
F3 Toolkit UI consults permissions (disable edit for viewers)

## G. Reports "Recent Exports" — permanently-empty furniture (getExportLogs has 0 callers)
## H. Scenarios — frozen clone never recomputed; edits never persisted
