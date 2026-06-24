
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
