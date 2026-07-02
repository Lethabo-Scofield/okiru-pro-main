# autoresearch

An autonomous research org that runs on the okiru-pro codebase overnight. Inspired
by Karpathy's program.md-driven setup: you don't edit the scoring code as a
human — you program the **markdown** here, and an AI agent loops on it, runs
experiments against a fitness function, keeps improvements, and logs everything.

```
autoresearch/
  program.md      ← the org's "code": the loop protocol, keep/discard rules, gates
  MISSION.md      ← what we're optimizing and why (match the Excel toolkit, ship-ready)
  BACKLOG.md      ← prioritized missions (M1 score gap, M2 construction, M3 misalign…)
  RUN.md          ← how to run it as a /loop; full-auto-with-gates safety
  specs/          ← cited ground truth (Lake Trading 63.56, Construction sector codes)
  fitness/        ← the fitness function: generator + the real bulk-upload scorer
  log/            ← EXPERIMENTS.md (every iteration) + RISKS.md (risk register)
```

## The fitness function

`fitness/generate-info-sheet.mjs` reads the **real filled toolkit**
(`docs/Lake Trading  Toolkit (RCOGP).xlsx`) and emits a "BEE Information
Gathering" Excel. `apps/web/src/__tests__/autoresearchFitness.test.ts`
bulk-uploads it through the production importer → projection → calculators and
checks the grand total against the Excel ground truth **63.56**.

- **PIPELINE gate** (must stay green): the bulk upload ingests every pillar. This
  doubles as a regression guard for the create-scorecard bulk-upload feature.
- **SCORE gate** (the research goal): drive the total to 63.56 by fixing
  engine↔Excel misalignments — currently ~56.6 (gaps in MC and Ownership).

## Quick start

```
node autoresearch/fitness/generate-info-sheet.mjs
cd apps/web && npx vitest run src/__tests__/autoresearchFitness.test.ts --pool=forks --poolOptions.forks.singleFork=true
# then, to run the org:  /loop autoresearch: read autoresearch/program.md and run the next experiment
```

See `RUN.md` for the full-auto commit/deploy gates.
