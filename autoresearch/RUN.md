# autoresearch — how to run (full-auto with gates)

The org runs as a self-pacing **/loop**. Each tick performs one experiment per
`program.md`. You chose **full-auto (commit + deploy)** — so the gates below are
the safety mechanism: the loop may commit and deploy, but **only a green build**.

## Start the loop

From an interactive Claude Code session in the repo root:

```
/loop autoresearch: read autoresearch/program.md and run the next experiment
```

(Omit an interval so the model self-paces; it will keep iterating until you stop
it or the SCORE gate passes and the backlog is clear.) To stop: interrupt the loop.

## The gate (run every iteration, in order)

1. **Regenerate + fitness:**
   ```
   node autoresearch/fitness/generate-info-sheet.mjs
   cd apps/web && npx vitest run src/__tests__/autoresearchFitness.test.ts --pool=forks --poolOptions.forks.singleFork=true
   ```
2. **Full regression suite:**
   ```
   cd apps/web && npx vitest run --pool=forks --poolOptions.forks.singleFork=true
   ```
   (Pre-existing failures to ignore: server e2e tests needing a live server —
   `routes.test.ts`, `clientsRoutes.e2e.test.ts`, `apiNewFieldsSchema.test.ts` —
   and `numericDateInput.test.ts`. Treat the rest as must-be-green.)

## Commit / deploy rules (full-auto, gated)

- **Per experiment:** commit the KEEP to branch `autoresearch/auto` (never `main`
  directly) with the EXPERIMENTS.md entry referenced. DISCARDs are reverted, not
  committed.
- **Deploy is allowed ONLY when ALL of:** SCORE gate green (≈63.56) **and** the
  full suite green (minus the known pre-existing failures) **and** the PIPELINE
  gate green **and** no test that was green is now red. Then follow `docs/SKILL.md`
  (az acr build → pin kustomization → kubectl apply → verify okiru.pro/health).
- **Never deploy a red build.** If any gate is red, stop deploying and keep
  iterating on a branch. The gate — not the loop — is what makes "full auto" safe.
- Tag every auto-deploy commit `chore(autoresearch): ...` so they're auditable,
  and append the deployed tag to `log/EXPERIMENTS.md`.

## Adding agents / changing the org

Edit `program.md` (the org's "code"). Examples to iterate toward: a dedicated
"misalignment finder" agent that only populates `log/RISKS.md`; a "verifier"
agent that adversarially re-checks each KEEP before commit; parallel experiments
on independent pillars. Keep the fitness function and gates fixed while you
evolve the org around them.

The **misalignment / defect finder now exists as an invocable skill**:
`/audit-sweep` (see `.claude/skills/audit-sweep/SKILL.md`). It hunts the recurring
"Wave-1" defect classes (phantom saves, comments rendered as UI, toast-only
validation, dead inputs, bulk-vs-manual divergence, fail-open auth, re-hydration
clobber, sector-coverage gaps) and appends confirmed findings to `log/RISKS.md`.
Run `/audit-sweep deep` before any deploy; treat any scoring-related finding as a
hypothesis for the loop above (validate against the real `.xlsx`/`specs/` first —
never change a target to make a finding "go away"). It detects only; fixing stays
a separate, gated step.
