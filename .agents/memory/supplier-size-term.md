---
name: Supplier size term (Generic/QSE/EME)
description: Where the B-BBEE supplier-size enum is produced, so a rename touches every source.
---

The workbook/import supplier-size enum ("Generic"/"QSE"/"EME", historically "Large") is
produced from **two independent code paths**, not one:

1. `apps/web/src/components/workbook/sections.ts` — `SUPPLIER_SIZE_OPTIONS` (the select
   options) + `SUPPLIER_SIZE_MAP` (alias→canonical), consumed by `workbookExcelNormalizer.ts`.
2. `apps/web/src/lib/excelImport.ts` — `inferSupplierSize()` and `parseSupplierGridRows()`
   compute/default a size string completely separately (used by the BEE-gathering import in
   `InformationRequest.tsx`). Demo data in `lakeTradingWorkbookFixture.ts` hardcodes one too.

**Why:** A rename done only in `sections.ts` looks complete (its tests pass) but the
excelImport path still emits the old term, so legacy values leak back in through a different
upload flow.

**How to apply:** Any change to supplier-size vocabulary must update BOTH sources plus the
fixture, and keep legacy aliases mapping to the new canonical term for backward compatibility.
