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
- Commit: dc86cb61 (autoresearch/auto branch)

### EXP-10 — Fix R19: derive company meta from any sheet header  (2026-06-24)
- Backlog item: M6 / R19 (user-directed)
- Change: added `deriveCompanyMetaFromSheets` + `mapSectorString` to
  `normalizeExcelBuffer` — scans every sheet's header for "Measured Entity" /
  "Sector / Codes" and maps the sector string ("Generic - Amended Codes"→RCOGP,
  "ICT Sector Code"→ICT, "Construction…(Contractor)"→CONSTRUCTION+Contractor,
  "Financial Sector Code (FSC) - Banks"→FSC+Banks, "…QSE scorecard"→QSE, etc.) to
  sector + scorecardType + FSC/construction sub-sector. Existing explicit meta wins.
- Result: harness **12/16 import cleanly** (was 0/16). Full web suite 1088 pass /
  22 pre-existing fail — no new regressions. The 4 FSC Banks/LTI/STI still block on
  prior-year/AFS data → R20. Also found R21 (financials read the Prior column, not
  Measured → wrong NPAT for all uploads).
- Decision: KEEP — major bulk-upload unblock (real all-sector fix). Deploy-eligible.
  Next: R20 (FSC sub-variant import), R21 (financials Measured-column), then add
  scoring to the harness.
- Commit: 309e936b (autoresearch/auto branch)

### EXP-11 — Fix R8: RCOGP QSE absorption target 1% → 100%  (2026-06-24)
- Backlog item: M5 / R8 (next single M3 fix; loop-directed)
- Hypothesis check FIRST (R8 contradicted a deliberate prior golden + ledger D-04, which
  claimed 1% is correct). Verified against the verbatim Excel: `RCOGP_QSE` Skills Scorecard
  `E23 = 'Skills Calcs'!C30 = 1` is the *display* target; the actual SCORE is
  `Skills Calcs!J28 = IFERROR(MIN(I28/I30 × E28, E28), 0)` = `MIN(absorbed/completers × 5, 5)`
  — NO % divisor, so full 5 pts require **100%** absorption. The ledger D-04 "1% target" was a
  misread of the display cell. Code `safeRatio(rate, pct/100, 5)` matches J28 iff pct = 100.
- Change: `sectorConfig.ts:1168` RCOGP_QSE `absorptionTargetPercent` 1.0 → 100 (Toolkit + API
  share this config; both do a single `/100`, confirmed pillarCalculators.ts:735 /
  sectorCalculators.ts:181). Updated `rcogp-qse.ts` passthrough comment. Corrected 2
  rcogp-qse golden tests (config 1.0→100; "maxes at 100% not 1%") + added a pro-rata test
  (50% → 2.5, strictly <5) and a tail test (1/200 → ~0). Corrected the ledger D-04 entry.
- Result: rcogp-qse golden 39/39; full Toolkit calculator suite **476/476**; API sectorConfig
  integrity 31/31. No RCOGP-Generic / AGRI / Lake-Trading regression (those use 2.5 / 100 /
  Generic, untouched). FSC (R7) was already 100 — now consistent.
- Decision: KEEP — corrects a real under-target (absorption maxed at 1% instead of 100%, over-
  scoring QSE skills by up to ~5 pts). Deploy-eligible. Spotted the identical bug in ICT QSE
  (`sectorConfig.ts:1260` still 1.0) → logged as R22 for the next iteration (kept R8 atomic).
- Commit: 93cab297 (autoresearch/auto branch)

### EXP-12 — Fix R21: bulk-upload financials (Measured column) — found a bigger bug  (2026-06-24)
- Backlog item: M6 / R21 (user-directed: "do r21, then deploy")
- Scout FIRST (dumped the real Financials sheets): layout is
  `Metric | Prior FYE… | Measured FYE… | Forecast FYE…`. Then a synthetic unit test
  surfaced the REAL root cause via `mappedSheets` — a sheet named "Financials" mapped to
  **afs-additions**, not financial-information: `norm("access to financial services")` =
  "accesstofinancialservices" CONTAINS "financials", and matchSheetName's longest-substring
  pass-2 (25 > 9) beat the "financial" hint. afs-additions has `meta: []`, so
  revenue/NPAT/payroll were **silently dropped on every upload** (scoring used deemed NPAT) —
  worse than the documented "reads Prior column".
- Change (`workbookExcelNormalizer.ts`): (A) added exact hint `"financials"` so pass-1 exact
  match wins before the substring pass; (B) added `findMeasuredColumn` + made
  `parseMetaFromSheet` prefer the Measured (current-year) column when a Prior|Measured|Forecast
  header is present, falling back to col B for ordinary single-value meta sheets.
- Result: a one-off verification over ALL 16 real workbooks — every file now maps
  Financials→financial-information AND parsed `revenue == Measured` (≠ Prior); NPAT/payroll
  populate too. Normalizer unit suite 58/58 (+2 R21 tests); harness still 12/16 clean (the 4
  FSC sub-variants are R20), no crashes; full web suite no new regressions (22 pre-existing
  DB/auth e2e fails). Logged the matchSheetName fragility as R23 (medium).
- Decision: KEEP — high-impact correctness fix (real measured financials now reach scoring
  for the first time). Deploy-eligible; shipping in this batch with R6/R7/R8/R19.
- Commit: 9015355c (autoresearch/auto branch)

### DEPLOY — tag 9015355c-202606241139  (2026-06-24, user-directed "deploy the ready fixes")
- Built+pushed api & web to ACR (compute unchanged, left at 5418f511-202606151030).
- Pinned prod overlay api+web → 9015355c-202606241139; kubectl apply; rolled api & web.
- Ships on top of the already-live R6 (337d61e2): **R7** (EXP-8 FSC absorption), **R8**
  (EXP-11 RCOGP QSE absorption→100%), **R19** (EXP-10 import company-meta), **R21** (EXP-12
  financials sheet mapping + Measured column). So all of R6/R7/R8/R19/R21 are now LIVE.
- Gates at deploy: SCORE 63.53≈63.56 ✓, PIPELINE ✓, full suite green (minus known pre-existing
  e2e). Verify: api+web pods on the new tag Running; okiru.pro/health → HTTP 200.
- Still UNSHIPPED on branch: none from this batch. Open backlog: R9–R13, R18, R20, R22, R23.

### EXP-13 — Fix R22: ICT QSE absorption target 1% → 100% (exact mirror of R8)  (2026-06-24)
- Backlog item: M5 / R22 (loop-directed, next single fix)
- Verified FIRST (per the R8 lesson, don't trust RISKS blindly): `ICT_QSE.json` score formula
  is `=IFERROR(MIN(I28/I30*E28,E28),0)` (and `MIN(I59/I61*E59,E59)` prior) = `MIN(absorbed/
  completers × 5, 5)` — NO % divisor, identical to RCOGP QSE → effective target 100%.
- Change: `sectorConfig.ts:1264` ICT_QSE `absorptionTargetPercent` 1.0 → 100 (Toolkit + API share
  the config, both single /100). Updated `ict-qse.ts` passthrough comment. Corrected the 2
  ict-qse golden assertions (config 1.0→100; "maxes at 100% not 1%") + added pro-rata (50%→2.5)
  and tail (1/200→~0) regressions.
- Result: ict-qse golden 52/52; full Toolkit calculator suite **477/477**; API sectorConfig
  integrity 31/31. No RCOGP/AGRI/Lake-Trading regression.
- Decision: KEEP — corrects the last QSE absorption under-target (ICT QSE was still maxing at 1%).
  Deploy-eligible (NOT shipped — holding for the user; R9–R13 still to do).
- Commit: 183b18c7 (autoresearch/auto branch)

### EXP-14 — R9 (ICT Generic absorption 2.5→100) — REJECTED on verification  (2026-06-24)
- Backlog item: M5 / R9 (loop-directed, verify-first)
- Verified against `ICT_Generic.json` BEFORE changing anything (the R8 lesson). Unlike QSE
  (`MIN(absorbed/completers × 5, 5)`, target 100%), ICT Generic absorption (2.1.3, scorecard
  row 54) scores `MIN(absorbed/target × 5, 5)` where **target is a ROUNDUP *headcount***:
  `Skills Toolkit!C70=ROUNDUP(C69×2.5%,0)`, `C76=ROUNDUP(C75×5%,0)`, labels `B70 "Absorption
  target (2.5%)"`, `B76/B82 "(5%)"` (conditional YES-tier). The `D54='Skills Calcs'!C76=1`
  the M3 hunt cited as "fraction 1.0=100%" is just the sample's rounded-up headcount (1 person),
  not a percentage.
- Decision: **REJECT** the 2.5→100 change — it would force 100% absorption to max the bonus,
  far harsher than Excel's 2.5–5%-of-headcount target. NO code change. The current 2.5% is in
  the right ballpark; the genuine gap is structural — code uses `absorbed/totalBlackLearners`,
  Excel uses `absorbed/ROUNDUP(2.5–5%×base headcount)` (+ the YES-tier conditional + EAP
  distribution). That's a modeling change entangled with R11, not an atomic clear-bug fix →
  reclassified R9 to needs-modeling / fold into R11.
- Lesson reinforced: a cached cell value ("1") is not a formula — always read the SCORE formula
  and the target's *source* formula. This is the 2nd RISKS/ledger claim the verify-first rule
  has caught wrong (after the ledger's R8 "1% target").
- Commit: 44578190 (autoresearch/auto branch, docs-only)

### EXP-15 — R10 (RCOGP Generic absorption 2.5→5) — REJECTED, same as R9  (2026-06-24)
- Backlog item: M5 / R10 (loop-directed, verify-first)
- Verified `RCOGP_Generic.json`: absorption (2.1.3, row 47) is structurally IDENTICAL to ICT
  Generic — `C69=ROUNDUP(C68×2.5%,0)`, `C75=ROUNDUP(C74×5%,0)`, `C81=ROUNDUP(C80×5%,0)`, labels
  `B69/B75/B81 "Absorption target (2.5%)/(5%)"`. ROUNDUP **headcount** target, NOT a 5% rate.
  The M3 hunt's `D47=0.05` is the 5% headcount multiplier inside ROUNDUP, misread as a divisor.
- Decision: **REJECT** the 2.5→5 change — wrong shape; would also perturb Lake Trading. NO code
  change. Consolidated R9+R10 (and the related R11 denominator question) into a new structural
  item **R24** (Generic absorption headcount-target model: ROUNDUP headcount + YES-tier 2.5/5%
  conditional + EAP split). R24 is non-atomic, touches the fitness sector, and the YES-tier rule
  likely needs expert confirm → out of the clear-bug loop's scope.
- Pattern: BOTH M3 "Generic absorption" rate claims (R9=100%, R10=5%) were wrong for the same
  reason — the M3 hunt read cached target values as rate divisors without reading the ROUNDUP
  source. 3rd and 4th wrong claims the verify-first rule has caught.
- Commit: 107fa906 (autoresearch/auto branch, docs-only)

### EXP-16 — Fix R12: AGRI BWO30 per-supplier qualification 12% → 30%  (2026-06-24)
- Backlog item: M5 / R12 (loop-directed, verify-first) — the first non-skills/non-absorption item
- Verified `AGRI_Generic.json`: scorecard line B55 = "Spend on empowering suppliers with **greater
  than 30%** black female ownership". `procurement.ts:146` filters suppliers by
  `blackWomenOwnership >= blackWomenThreshold` (intended default 0.30); the AGRI converter
  overrode it with `pr.bwo30Target` (0.12 = the SPEND target), so 12–29%-BWO suppliers wrongly
  counted toward the 4-pt line. CONFIRMED REAL (unlike R9/R10).
- Also checked the adjacent `blackOwnedThreshold: pr.bo51Target` (0.40): **inert** — procurement.ts
  hardcodes the ≥51% qualifier (`sup.blackOwnership >= 0.51`), never reads `pc.blackOwnedThreshold`.
  So that one is dead config, not a scoring bug. Kept R12 atomic to the live BWO30 bug.
- Change: `agri-generic.ts:190` `blackWomenThreshold: 0.30` (qualification distinct from the 12%
  spend target). +2 AGRI golden tests: 20%-BWO supplier → BWO30 line = 0 (was 4 under the bug);
  35%-BWO → maxes 4.
- Result: AGRI golden 44/44; full Toolkit suite **479/479**; fitness SCORE 63.53 (RCOGP/Lake
  Trading untouched — AGRI-only change). No regression.
- Decision: KEEP — real over-credit fix (under-qualified suppliers inflated the BWO30 line).
  Deploy-eligible (NOT shipped — holding for the user). Spotted the same conflation pattern in
  all 4 FSC sectors (`blackWomenThreshold: pr.bwo30Target` = 0.10) → logged R25 to verify FSC's
  BWO qualification % (RCOGP/ICT correctly use the 0.30 default).
- Commit: e5394035 (autoresearch/auto branch)

### EXP-17 — Fix R13: FSC Generic skills sub-min comment (comment-only)  (2026-06-24)
- Backlog item: M5 / R13 (LOW; the last clear-bug item)
- Verified: code computes `skillsSubMin = 40% × (maxPoints − absorptionMaxPts) = 40% × (23 − 3)
  = 8.0`. The inline comment said "9.2 pts (40% × 23)" — wrongly counted the 3-pt absorption
  bonus in the base. No scoring effect (the value 8.0 was already correct).
- Change: corrected the `fsc-generic.ts:196` comment to "8.0 = 40% × 20 base (excl. 3-pt
  absorption bonus)". FSC golden 38/38.
- Decision: KEEP (comment-only). Deploy-neutral.
- Commit: (autoresearch/auto branch)

---

## M3 CLEAR-BUG BACKLOG EXHAUSTED  (2026-06-24)
Ran EXP-7..EXP-17. Resolution of the 14 M3 "clear bug" candidates + harness/import finds:
- FIXED & SHIPPED (live on okiru.pro, tag 9015355c-202606241139): R6, R7, R8, R19, R21.
- FIXED & STAGED (committed, awaiting the user's deploy): R22, R12, R13.
- REJECTED by verify-first (the M3 claim was wrong; Excel evidence logged): R9, R10 — both
  "Generic absorption" claims; the toolkits use a ROUNDUP-headcount target, not a rate.
- STRUCTURAL / needs-modeling (NOT atomic; out of the clear-bug loop): R24 (=R9+R10+R11 Generic
  absorption headcount-target model), R18 (FSC absorption denominator), R20 (FSC sub-variant
  import), R23 (matchSheetName fragility), R25 (FSC BWO qualification %).
- EXPERT sign-off (do not auto-fix): R14, R15, R16, R17; plus R3 construction-engine integration.
Verify-first caught 4 wrong claims (ledger R8 "1%", R9 100%, R10 5%, and prevented forcing them).
The loop STOPS here — remaining work is modeling/expert, not clear-bug.