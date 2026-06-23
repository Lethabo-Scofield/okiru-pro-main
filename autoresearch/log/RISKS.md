# autoresearch — risk register

One row per risk. Severity: HIGH / MEDIUM / LOW. HIGH items should spawn a fix
experiment (see BACKLOG M5).

| # | Severity | Area | Risk | Evidence (file:line / source) | Proposed fix | Status |
|---|---|---|---|---|---|---|
| R1 | HIGH | Correctness | MC engine under-scores vs Excel for Lake Trading (6.79 vs 11.77) — real client scores would be wrong | fitness EXP-0; `management.ts`; Excel "MC Scorecard" | Reconcile MC/EE EAP model to Excel (M1a) | OPEN |
| R2 | MEDIUM | Correctness | Ownership projection drops points (23 vs 25) on bulk-upload | fitness EXP-0; `projectWorkbookToClient` ownership map | Fix projection/generator field mapping (M1b) | OPEN |
| R3 | MEDIUM | Correctness | Construction sub-sector (Contractor/BEP) overloaded onto scorecardType; configs UNVERIFIED | memory `construction-sector-model`; `sectorConfig.ts` | Implement sub-sector model (M2) | OPEN |
| R4 | MEDIUM | Maintainability | Duplicated feedback handlers (apps/api vs apps/web/server) — edits to the wrong one are silent no-ops | memory `devmode-feedback-infra` | Unify or clearly mark the dead one (M4) | OPEN |
| R5 | LOW | Data integrity | Bulk-upload empty-section overwrite can blank populated pillars on partial import | review of `/api/workbook/:id/import` | Already mitigated client-side (populated-only); add server guard (M4) | OPEN |

Add new risks as the misalignment hunt (M3) surfaces them.
