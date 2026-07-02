# Lake Trading — fitness ground truth (RCOGP Generic)

Entity: **Silver Lake Trading 447 (Pty) Ltd**. Period 01 Mar 2025 – 28 Feb 2026.
Source: the real filled toolkit `docs/Lake Trading  Toolkit (RCOGP).xlsx`,
"Summary Scorecard" tab, "Actual" column.

## Excel ground truth = 63.56  (Level 7 achieved / Level 8 discounted)

| Pillar | Excel target | Engine baseline (EXP-0) | Gap |
|---|---|---|---|
| Ownership | **25.00** | 23.00 | −2.00 |
| Management Control | **11.77** | 6.79 | −4.98 |
| Skills Development | 0.00 | 0.00 | 0 |
| Preferential Procurement | 20.33 | 20.33 | ✅ 0 |
| Supplier Development | 3.69 | 3.69 | ✅ 0 |
| Enterprise Development | 2.36 | 2.36 | ✅ 0 |
| Socio-Economic Development | 0.41 | 0.41 | ✅ 0 |
| **Total** | **63.56** | **56.58** | **−6.98** |

## Diagnosis (where the loop must work)

- **PP / SD / ED / SED already match exactly** — the generator + bulk-upload path
  is faithful for these. Do not touch them except to keep them green.
- **Management Control (−4.98)** is the dominant gap. The okiru engine uses a
  per-demographic provincial-EAP model that under-scores vs the Excel toolkit's
  aggregate band model for this 12-person register (2 Exec Directors — one
  African, one White; 2 Senior, 4 Middle, 4 Junior). See memory
  `eap-methodology-decision`. Reconcile the MC/EE engine to the Excel "MC
  Scorecard" tab. Validate against `docs/toolkits/extracted_formulas/RCOGP_*`.
- **Ownership (−2.00)** — full Excel marks (voting 4, voting-female 2, EI 4,
  EI-female 2, designated 3, new-entrant 2, net value 8). The engine yields 23;
  likely the projection drops `blackWomenOwnership` / new-entrant / designated
  flags or the net-value inputs from the generated sheet. Check
  `projectWorkbookToClient` ownership mapping and the generator's ownership row.

## Foundation inputs (real)
Revenue 274,953,097; NPAT 33,862,998; Leviable 2,069,572; TMPS 133,730,345.99;
EAP province Gauteng (2025); Industry norm "Mining and quarrying"; Headcount 12;
Combine Other Executive & Senior Management = Yes.

## Regenerate / score
```
node autoresearch/fitness/generate-info-sheet.mjs        # real toolkit → info sheet
cd apps/web && npx vitest run src/__tests__/autoresearchFitness.test.ts \
  --pool=forks --poolOptions.forks.singleFork=true
```
