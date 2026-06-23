# autoresearch — BACKLOG (prioritized missions)

Work top-to-bottom. One experiment per loop. Update status as you go:
`OPEN` → `IN PROGRESS` → `DONE` / `BLOCKED (reason)`.

---

## M1 — Close the Lake Trading score gap (56.58 → 63.56)  [OPEN, highest priority]

The fitness function is RED. Two sub-gaps (see `specs/lake-trading-target.md`):

- **M1a — Management Control (engine 6.79 vs Excel 11.77, −4.98).** The dominant
  gap. Reconcile the MC/EE engine to the Excel "MC Scorecard" for the real
  12-person register. Investigate `apps/web/Toolkit/src/lib/calculators/management.ts`,
  the per-demographic EAP path, and `projectWorkbookToClient`'s employee mapping.
  Cross-check `docs/toolkits/extracted_formulas/RCOGP_Generic.md`. Note: memory
  `eap-methodology-decision` says MC EAP should be per-demographic/effective —
  reconcile that decision with the Excel's 11.77 (the Excel is the ground truth).
- **M1b — Ownership (engine 23 vs Excel 25, −2.00).** Check that the generated
  ownership row's `blackWomenOwnership` / `blackNewEntrantOwnership` /
  `designatedGroupOwnership` and net-value inputs survive
  `projectWorkbookToClient` into the calculator. Likely a projection mapping or a
  generator field-name fix.

Definition of done: SCORE ≈ 63.56, PIPELINE gate green, full suite green.

## M2 — Construction sub-sector model  [OPEN]

Implement the real Construction model (see `specs/construction-sector-codes.md`
and memory `construction-sector-model`):
- Add a `constructionSubSector` meta field (Contractor | BEP) in
  `getCompanyInfoMetaFields` (mirror `fscSubSector`); make `scorecardType` mean
  the size axis (Generic/QSE/EME) again for construction.
- Encode the Contractor + BEP Generic targets into `apps/api/pipeline/sectorConfig.ts`
  and `apps/web/Toolkit/src/lib/sectors/`. Where unspecified (QSE/EME), match RCOGP.
- Add a construction golden test (a small known scorecard) so it has a fitness
  signal of its own. Do NOT regress RCOGP.

## M3 — Misalignment hunt (all sectors)  [OPEN]

Systematically diff each TS calculator/sector config against the verbatim Excel
in `docs/toolkits/extracted_formulas/` and the toolkit `.xlsx` files. Log each
divergence in `log/RISKS.md` with the cell/rule, then fix highest-impact first.
Re-use the connection-spec convention (memory `toolkit-connection-extraction`).

## M4 — Production-readiness cleanup  [OPEN]

Remove things that block go-live: dead/secondary code paths (memory
`okiru-app-architecture`), duplicated logic (the two feedback handlers; the two
yes/no coercers; EAP tables duplicated frontend+API per memory
`eap-targets-were-hardcoded-in-two-places`), silent-failure modes, and any
TODO/FIXME that is a real bug. Each cleanup must keep the full suite green.

## M6 — Smart spreadsheet normalization (user feedback)  [IN PROGRESS]

Make any spreadsheet import "claude smart". Driven by direct user feedback (skills
sheet misplaced; "true" not recognised as Yes; headcount should link to the
employee register). Fitness probe:
`apps/web/src/lib/__tests__/normalizationIntelligence.test.ts` — extend it with
each new messy case before/after fixing.

- [done EXP-2] Yes/No synonym coercion unified on the shared `BOOLEAN_TRUE`/`FALSE`
  set (true/t/✓/x/checked/compliant/yebo ↔ no/false/n-a/none) in the importer's
  `coerceValue` — yes/no *select* columns now normalise to booleans instead of
  storing the raw string (which then failed strict-select validation).
- [done EXP-2] Skills sheet-name hints broadened (learning, L&D, learnerships,
  WSP/ATR, bursaries, skills report); employees/management hints broadened
  (workforce, exco, leadership, headcount).
- [done EXP-2] Skills headcount auto-derives from the employee register when not
  supplied (`projectWorkbookToClient`) — no double entry.
- [next] Fuzzy column-header matching (token overlap / edit distance) for headers
  not covered by aliases; richer race/size/level/designation synonym maps;
  per-cell mapping confidence + a "review low-confidence mappings" surface; lean
  on the AI fallback (`normalizeExcelFileWithAi`) for genuinely novel sheets.

## M5 — Risk register  [OPEN, continuous]

Maintain `log/RISKS.md`: correctness, security, data-loss, operational. For each:
severity, repro, affected file:line, proposed fix. Spawn a fix experiment for
HIGH-severity items.

---

### Done
- (seed) Fitness harness built; bulk-upload PIPELINE gate green; baseline 56.58.
- ESD construction = SD-only wired (commit 7b7e5040).
