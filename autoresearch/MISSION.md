# autoresearch — MISSION

## Why this exists

okiru-pro computes B-BBEE scorecards in TypeScript that must reproduce the
official Excel B-BBEE toolkits (RCOGP, ICT, FSC, AGRI, Transport, Construction)
exactly. Divergences = wrong client scores = a non-shippable product. This
research org runs autonomously to close those divergences, harden the code for
production, and surface risks — measured by a single fitness function.

## Objectives (in priority order)

1. **Match the Excel toolkit.** Reproduce known ground-truth scores. The bootstrap
   target is **Lake Trading RCOGP Generic = 63.56** (see `specs/lake-trading-target.md`).
   The engine currently scores ~56.6 on a faithful bulk-upload of the real
   toolkit; the gap is concentrated in **Management Control** and **Ownership**.
2. **Find & fix all workbook/toolkit ↔ Excel misalignments** across sectors, not
   just Lake Trading. Each fix must be backed by a real toolkit cell/rule.
3. **Clean the code for production.** Remove dead/secondary code paths, fix
   silent-failure modes, unify duplicated logic (e.g. the two feedback handlers,
   the two yes/no coercers), and eliminate anything that blocks go-live.
4. **Identify risks.** Maintain a risk register (`log/RISKS.md`): correctness,
   security, data-loss, and operational risks with severity + repro.

## Definition of done (per objective 1)

- `autoresearch/fitness/autoresearchFitness.test.ts` SCORE gate passes (≈63.56).
- The full `apps/web` vitest suite is green (no regressions).
- The PIPELINE gate (bulk upload ingests every pillar) stays green.

## Non-negotiables

- Never weaken or delete a test to move the number. Fix the engine, not the test.
- Every scoring change cites a source (a toolkit cell, a sector-code rule, the
  `docs/toolkits/extracted_formulas/` verbatim, or a `specs/` entry).
- When a sector detail is unspecified, **match RCOGP** (standing user instruction).
- Bulk upload is a live, user-facing feature (Zoleka/Chengetai reports). The
  PIPELINE gate guards it — keep it green.
