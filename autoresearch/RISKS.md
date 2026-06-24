
## M7 — Workbook-weakness hunt: all 16 Toolkit Testing Data → Level 1 (2026-06-24)

**Goal (expert ground truth):** every workbook in `docs/Toolkit Testing Data` must score
**Level 1** on import. **Fitness:** `apps/web/src/__tests__/toolkitTestData.score.harness.test.ts`
(`TOOLKIT_SCORE=1 npx vitest run ...`). **Baseline: 0/14 scored are Level 1** (~45–68% vs the
~95–100% Level 1 needs; Transport ×2 = no bundled config, API sector).

Open weaknesses to investigate (find the ROOT CAUSE — under-INGESTION, not score inflation):
| # | Weakness | Evidence | Status |
|---|---|---|---|
| W1 | Systematic under-scoring on import (every sector ~half marks) | score harness baseline 0/14 | OPEN — likely financials (TMPS/NPAT) not feeding calculators + pillar data dropped |
| W2 | FSC sub-variants (Banks/LTI/STI) collapse to FSC Generic | harness shows all FSC = "Generic" config; meta.fscSubSector not derived | OPEN (also R20) |
| W3 | Name/surname not split on import | user report; employees ingest single `name` not first/last | OPEN |
| W4 | Lake Trading "shortcut" scores 62 live vs 63.53 headless | autoresearchFitness comment "~62.17 RED — MC per-demographic EAP under-scores" | OPEN — live vs fitness MC discrepancy |
| W5 | Upload (vs import) flow crashed twice (companyName, length) | fixed defensively; root = incomplete fallback previewResult object | DONE (bf9a0ea4) — watch for more |
| W6 | Validation too far-fetched / blocks legit data | user wants validation-robustness test | OPEN |
| W7 | Construction scores partial (NC) — 13 inputs missing | expected; Phase-1 tail | KNOWN |
| W8 | Transport not scorable headlessly (config from API) | harness "no bundled config" | OPEN — bundle a Transport config or score via API |

**Method:** Chrome-in-Claude IS connected (Browser 1) — use it to verify the LIVE path for
discrepancies (esp. W4). For each weakness: reproduce in the score harness, find why the data
is dropped/under-scored, fix the IMPORT/normalizer (not the targets), re-run the fitness, keep
the full suite green. **Goal: 16/16 Level 1.** Do not inflate scores — fix ingestion.

### M7 iteration 1 (2026-06-24) — ownership + ESD ingestion
- **W1a DONE** (ESD sheet "Enterprise & Supplier Developme" skipped → no SD/ED): added truncated-name hints. SD now ingests.
- **W-own DONE** (3 bugs: junk summary rows ingested as shareholders; flat 1-share weighting; blackOwnership=max(voting,EI) squared by the calc): filter junk, derive shares from voting%, set blackOwnership=1.0 for black individuals. Ownership 12→23-25/25.
- **Impact:** scores lifted from ~45–69 to ~66–90; best now AGRI ~90/132 (L3). Still **0/14 Level 1**. No regression (Lake 63.53; suites green).
- **Next (biggest remaining gaps):** W1b `ed0` everywhere (enterprise-dev contributions not categorized, ~7pts); FSC `sk1` (FSC skills broken, ~20pts on FSC); the remaining ~10–30pts to L1 per workbook.

### M7 iteration 2 (2026-06-24) — ESD category + skills column collision = 0->7 Level 1
- **W1b DONE** (ed0: ESD sheet has no category column; SD/ED encoded in Contribution Description): derive category from description. ED now scores.
- **W-skills DONE** (THE big one: "Salary Cost (category…)" + "Location" headers substring-matched "category" and overwrote the real Category column via last-write-wins → categoryCode got the Province value → category-based skills scored ~0 for ALL sectors): two-pass exact-match-first column mapping in parseGridFromSheet. Skills RCOGP 9→22, FSC 1→19.
- **Impact: 0/14 → 7/14 Level 1.** Lake 63.53 unchanged; suites green.
- **Remaining 7 not-L1:** mostly FSC Banks/STI variants (W2 — they use FSC Generic config + are criticalBlocked R20) + ICT Generic 116/140 (L2, close). Next: W2 fscSubSector derivation, then the per-workbook tail.
