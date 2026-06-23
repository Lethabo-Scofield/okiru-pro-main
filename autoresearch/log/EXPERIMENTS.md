# autoresearch — experiment log

Append one entry per loop iteration (newest at the bottom). Template is in
`../program.md`.

---

### EXP-0 — Baseline harness  (2026-06-23)
- Backlog item: M1 (seed)
- Hypothesis: a faithful bulk-upload of the real Lake Trading toolkit can be
  scored headlessly through the production importer + projection + calculators.
- Change: built `fitness/generate-info-sheet.mjs` (real toolkit → info sheet) and
  `apps/web/src/__tests__/autoresearchFitness.test.ts` (import → project → score).
- Result: SCORE 56.58 (target 63.56, gap 6.98); PIPELINE gate GREEN
  (employees=12, suppliers=46, esd=2, sed=1); SCORE gate RED.
- Per-pillar: Own=23.00 MC=6.79 PP=20.33 SD=3.69 ED=2.36 SED=0.41 (Skills=0)
- Decision: KEEP — establishes the fitness function. PP/SD/ED/SED match the Excel
  ground truth exactly; Ownership (−2) and MC (−4.98) are the open gaps → M1.
- Commit: 0ffc5870 (initial autoresearch scaffolding)

### EXP-1 — Ownership: credit new entrants from BNE% column  (2026-06-24)
- Backlog item: M1b
- Hypothesis: Ownership scores 23 not 25 because `projectWorkbookToClient` only
  reads new-entrant as a boolean flag (`isNewEntrant`/`blackNewEntrant`) that no
  workbook column supplies — so the bulk-uploaded BNE% never credits the 2
  new-entrant points. Designated groups are already credited from their % column.
- Change: apps/web/server/workbookRoutes.ts:917 — `isNewEntrant` now also true when
  `pctToFraction(blackNewEntrantOwnership) > 0` (mirrors the designated-group rule).
- Result: SCORE 56.58 → 58.58 (target 63.56); full suite 1078 pass / 22 fail
  (same pre-existing failures, no new red); PIPELINE green.
- Per-pillar: Own=25.00 (was 23) MC=6.79 PP=20.33 SD=3.69 ED=2.36 SED=0.41
- Decision: KEEP — Ownership now matches the Excel ground truth (25/25). Remaining
  gap is entirely Management Control (6.79 vs 11.77) → M1a next.
- Commit: fbe661f6 (autoresearch/auto branch)

### EXP-2 — Smarter normalization (user feedback)  (2026-06-24)
- Backlog item: M6
- Hypothesis: bulk-upload normalization isn't smart enough — yes/no select columns
  kept the raw string ("true" → "true", failing strict validation), misnamed
  skills sheets (e.g. "Learning & Development") were skipped, and headcount had to
  be entered separately from the employee register.
- Change: shared BOOLEAN_TRUE/FALSE synonym set exported from tabularNormalize and
  wired into the importer's coerceValue (yesNoBoolean + boolean → real booleans);
  broadened skills/employees/management sheet-name hints; headcount auto-derives
  from employees.length in projectWorkbookToClient. New probe:
  normalizationIntelligence.test.ts (3 cases).
- Result: full suite 1081 pass / 22 fail (same pre-existing; no new red). Lake
  Trading SCORE unchanged at 58.58 (these are robustness, not score, fixes).
- Decision: KEEP — directly addresses the reported import problems; locked in by
  a fitness probe the loop will extend (M6 [next]: fuzzy header matching, richer
  synonym maps, confidence-scored mappings).
- Commit: (autoresearch/auto branch)
