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
- Commit: 14d97987 (autoresearch/auto branch)

### EXP-3 — Management Control reconciliation → 63.56  (2026-06-24)
- Backlog item: M1a
- Hypothesis: MC scores 6.79 vs Excel 11.77 for two reasons: (1) the board-voting
  line uses `grouped['Board']` only, excluding executive directors — so Lake's 2
  executive directors at 50% voting each score 0 board voting; (2) the fitness
  harness didn't pass `combineExcoSenior`, so Other-Exec + Senior were scored
  separately (senior EAP-adjusted → 1.04) instead of the combined flat-60% line (4).
- Change: management.ts — board voting now includes the Executive / Executive
  Director groups (real code fix; executive directors sit on the board, +2). And
  the fitness harness passes `combineExcoSenior` from the company meta (the real
  Toolkit scoring path already does — store.ts:591).
- Result: MC 6.79 → 11.74; **SCORE 58.58 → 63.53** (target 63.56, gap 0.03 — within
  tolerance, SCORE gate GREEN). Full suite 1081 pass / 22 fail (same pre-existing;
  no new red). workbookProjection MC=10.38 unchanged (fixture exec dirs have 0 voting).
- Per-pillar: Own=25.00 MC=11.74 PP=20.33 SD=3.69 ED=2.36 SED=0.41
- Decision: KEEP — **M1 ACHIEVED.** The Lake Trading bulk-upload now matches the
  Excel toolkit. Residual 0.03 = EAP middle/junior rounding. Board-voting fix is a
  genuine all-client correctness fix (a real toolkit↔Excel misalignment found).
- Commit: 62ae4aa3 (autoresearch/auto) — ALL GATES GREEN → DEPLOYED (web 62ae4aa3, a994a602).

### EXP-4 — Construction entity-type resolver + M2 finding  (2026-06-24)
- Backlog item: M2
- Finding: the construction engine (constructionIndicators.ts) ALREADY encodes the
  full Contractor/BEP/QSE scorecards from the docx, but as a STANDALONE
  /api/construction/evaluate endpoint not wired into the workbook→score pipeline;
  the SectorConfig construction entries are UNVERIFIED zero-stubs. So M2 is a
  deliberate change: UI re-model + data migration (legacy scorecardType) +
  workbook→engine integration — the UNVERIFIED area the user flagged for review.
- Change: added `resolveConstructionEntityType(subSector, scorecardType)` mapping
  the clean two-axis model to the 3 existing scorecards (backward-compatible) +
  unit test. Pure, safe seam for the future integration.
- Result: resolver test (4) green; existing construction tests (22) green; no
  regressions; RCOGP untouched.
- Decision: KEEP the resolver. MARK M2 NEEDS-REVIEW — the UI re-model + migration +
  engine integration is a focused, reviewed change, not an unattended auto-deploy.
  Pausing the loop for user direction.
- Commit: 91404336 (autoresearch/auto branch)

### EXP-5 — Construction UI re-model (sub-sector × size)  (2026-06-24)
- Backlog item: M2
- Hypothesis: the construction `scorecardType` dropdown conflates sub-sector
  (Contractor/BEP) with size (Generic/QSE) — Zoleka's feedback. Split them.
- Change: added a required `constructionSubSector` (Contractor|BEP) meta field;
  `getScorecardTypeOptions("CONSTRUCTION")` → [Generic, QSE]; legacy Contractor/BEP
  scorecardType values migrate to Generic in `resolveScorecardTypeForSector` (they
  were the large scorecards) so existing data stays valid. New constructionModel.test.ts
  (4); updated 3 workbookValidation tests that encoded the old model.
- Result: full web suite 1081 pass / 22 fail (same pre-existing; no new red);
  RCOGP untouched; Lake Trading SCORE unchanged.
- Decision: KEEP — addresses the sub-sector/size confusion directly. Remaining M2:
  wire the workbook → construction engine scoring via the resolver (UNVERIFIED;
  held for review, no deploy).
- Commit: 762dfe47 (autoresearch/auto) — DEPLOYED with M2 PDF (762dfe47, 1c8fd313).

### EXP-6 — M3 misalignment hunt (all sectors)  (2026-06-24)
- Backlog item: M3
- Method: Workflow — 6 sector finders diffing each TS scorer/config against the
  verbatim Excel (docs/toolkits/extracted_formulas/<sector>.md) → adversarial
  verification of each finding (26 agents).
- Result: **14 confirmed misalignments** logged to log/RISKS.md (R6-R17). 8 are
  clear undocumented bugs (the loop will fix each with a golden test); 6 need
  B-BBEE expert sign-off (ownership shortcut, guarantees 3% vs 50%, board flag,
  AGRI cap). Highest-impact bug: **R6 — ICT Generic MC senior/middle/junior band
  targets are MISSING from config → 8 of 23 MC points always score 0** for every
  ICT Generic entity (NaN-zeroing; ICT was missed when AGRI/RCOGP/QSE got the fix).
- Decision: KEEP (discovery). Next fix tick: R6 (highest-impact, lowest-risk,
  clearly undocumented). Then R7/R8 (absorption /100 + 1%-vs-100%). The 6
  expert-signoff items are routed to the user, not auto-fixed.
- Commit: c0284ed6 (autoresearch/auto branch)

### EXP-7 — Fix R6: ICT Generic MC senior/middle/junior band targets  (2026-06-24)
- Backlog item: M3 / R6 (user-directed)
- Hypothesis: ICT Generic MC senior/middle/junior bands score 0 because the band
  targets are missing from config → mgmtFallback returns undefined (useRcogp=false
  for ICT) → subTarget = undefined×eff = NaN → every per-demographic group scores 0.
  8 of 23 MC points unreachable for every ICT Generic entity.
- Change: added seniorBlackTarget 0.60 / seniorBWTarget 0.30 / middle 0.75 / 0.38 /
  junior 0.88 / 0.44 to ICT_GENERIC.managementControl (sectorConfig.ts) + wired them
  through the ict-generic.ts converter. Golden test: a 100%-black EAP-distributed
  SMJ workforce now scores the full 8 SMJ band points (was 0). Also fixed a stale
  pre-existing api test ("11 sectors" → 14; registry legitimately has 14).
- Result: full Toolkit calculator suite 474 pass; api sectorConfig integrity 31 pass;
  ICT golden SMJ test green; RCOGP/AGRI/Lake-Trading untouched. No new regressions.
- Decision: KEEP — real all-client correctness fix for ICT Generic. Deploy-eligible
  (green). Next: R7 (FSC absorption double /100), R8 (RCOGP QSE absorption 1→100).
- Commit: 337d61e2 (autoresearch/auto) — DEPLOYED (api+web 337d61e2, 0827e583).

### EXP-8 — Fix R7: FSC absorption double /100 (all 4 variants)  (2026-06-24)
- Backlog item: M3 / R7 (user-directed)
- Hypothesis: FSC mappers do absorptionTargetPercent /100 AND skills.ts:392 /100
  again → effective 0.0001 (0.01%) vs Excel 100%; any single absorbed learner maxes
  the 3-pt bonus.
- Change: sectorConfig.ts FSC Generic/Banks/LTI/STI absorptionTargetPercent 1.0→100;
  removed the /100 from fsc-generic/banks/lti/sti mappers (single /100 in skills.ts
  → target 1.0 = 100%). API path single-divides → auto-fixed by the config. Corrected
  the FSC-generic golden (was 23 due to the bug → 20.6 pro-rata) + new pro-rata test
  (full=3, half=1.5).
- Result: 475 Toolkit calc tests pass; FSC goldens (all 4) green; api integrity 31
  pass; no regression. Found a related issue → R18 (FSC absorption denominator is
  totalBlackLearners, Excel uses unemployed-LAI completers — logged, not fixed here).
- Decision: KEEP — real all-client correctness fix (FSC absorption was wildly
  over-scoring). Deploy-eligible. Next: R8 (RCOGP QSE absorption 1→100), R9/R10.
- Commit: 17703bb8 (autoresearch/auto branch)

### EXP-9 — Toolkit Testing Data harness (16 real workbooks)  (2026-06-24)
- Backlog item: M6 (user-directed: "run the systems on the test data")
- Method: built `apps/web/src/__tests__/toolkitTestData.harness.test.ts` (env-gated,
  TOOLKIT_HARNESS=1) — runs every file in docs/Toolkit Testing Data through the REAL
  bulk-upload path (normalizeExcelBuffer → projectWorkbookToClient) + reports import
  health. Headless equivalent of uploading each via the create-scorecard UI (Chrome
  extension not connected, so the browser path is blocked).
- Result: all 16 workbooks ingest their pillar GRIDS fine (employees 500/70,
  suppliers 90/70, SED 5) but **all 16 are criticalBlocked** — Company Name/Sector/
  Type are not extracted. Root cause (R19): company meta lives on the **Financials
  sheet header**, not the "Information Request" checklist sheet the importer reads.
- Decision: KEEP the harness (ongoing cross-sector bulk-upload regression tool).
  Real HIGH bug found → R19 (M6 smart normalization). Next: fix company-meta
  extraction, then re-run the harness to confirm all 16 import + add scoring.
- Commit: (autoresearch/auto branch)