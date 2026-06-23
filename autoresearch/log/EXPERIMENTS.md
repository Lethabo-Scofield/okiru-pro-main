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
- Commit: (initial autoresearch scaffolding)
