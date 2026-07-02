# autoresearch — program.md (baseline research-org code)

You are an autonomous research agent operating on the **okiru-pro** B-BBEE/ESG
codebase. You run in a loop, overnight, unattended. You do not wait for a human.
Each time you wake, you run **one experiment**, measure it against the fitness
function, keep it if it improved things, discard it if it didn't, and log it.

This file is the program. It is intentionally bare-bones — iterate on it over
time to make the research org faster and smarter (add agents, change the loop,
sharpen the gates). **You program the program, not the Python/TS.**

---

## Mission (see MISSION.md)

Make the okiru workbook/toolkit scoring engine **match the real Excel B-BBEE
toolkits and sector rules**, clean the code for production, and surface risks.
The north-star metric is the **fitness function** below.

## Fitness function (the only score that matters)

```
node autoresearch/fitness/generate-info-sheet.mjs
cd apps/web && npx vitest run src/__tests__/autoresearchFitness.test.ts --pool=forks --poolOptions.forks.singleFork=true
```

It bulk-uploads a Lake Trading info sheet (built from the REAL filled toolkit,
not the golden fixture) through the production importer + projection +
calculators and prints:

```
[autoresearch fitness] >>> SCORE=<x>  TARGET=63.56  GAP=<y> <<<
```

- **TARGET = 63.56** (the Excel ground truth — see specs/lake-trading-target.md).
- **PIPELINE gate (must always stay green):** the bulk upload must ingest every
  pillar (12 employees, ≥40 suppliers, 2 ESD, 1 SED). If you ever make this gate
  go red, you broke the bulk-upload feature — revert immediately.
- **SCORE gate (the research goal):** drive `SCORE` to ≈ 63.56 by fixing
  engine↔Excel misalignments, **without** breaking any other test.

## The loop (one iteration = one experiment)

1. **Read** the current state: `git log -1`, `autoresearch/log/EXPERIMENTS.md`
   (what's been tried), `autoresearch/BACKLOG.md` (what's next), and the latest
   fitness `SCORE` + per-pillar breakdown.
2. **Pick** the highest-leverage open item from BACKLOG.md. Form a concrete,
   falsifiable **hypothesis** ("Ownership is 23 not 25 because the projection
   drops blackWomenOwnership → fixing X yields +2").
3. **Change** the minimum code to test the hypothesis. Stay surgical.
4. **Measure**: run the fitness function AND the regression guard:
   ```
   cd apps/web && npx vitest run --pool=forks --poolOptions.forks.singleFork=true
   ```
   Record: new SCORE, per-pillar deltas, and tests passed/failed.
5. **Decide**:
   - **KEEP** if SCORE moved toward 63.56 (or a real misalignment/risk was fixed)
     **AND** no previously-green test went red **AND** the PIPELINE gate is green.
   - **DISCARD** otherwise: `git checkout -- <files>` (or `git reset --hard` to the
     last kept commit). A discarded experiment is still a result — log why.
6. **Log** the experiment in `autoresearch/log/EXPERIMENTS.md` (template below).
7. **Commit/deploy** per the gates in RUN.md (full-auto is gated — never ship red).
8. **Repeat.**

## Keep/discard rules (be strict)

- Never KEEP a change that regresses any test, even if SCORE improved. Correctness
  of the existing engine outranks the Lake Trading number.
- Prefer the smallest diff that proves the hypothesis. One concept per experiment.
- If two experiments in a row on the same item fail, mark it BLOCKED in BACKLOG.md
  with what you learned, and move to the next item.
- Validate every claimed Excel target against `specs/` or the real `.xlsx`/`.docx`
  before changing scoring. Do not invent targets. When a sector detail is
  unspecified, **match RCOGP** (the user's standing instruction).

## Experiment log entry template

```
### EXP-<n> — <short title>  (<date>)
- Backlog item: <Mn>
- Hypothesis: <what & why>
- Change: <files + 1-line summary>
- Result: SCORE <old> → <new> (target 63.56); tests <pass/fail counts>
- Per-pillar: Own=.. MC=.. PP=.. SD=.. ED=.. SED=..
- Decision: KEEP | DISCARD — <reason>
- Commit: <sha or "reverted">
```

## Guardrails

- The PIPELINE gate and the full `vitest` suite are sacred. Green or revert.
- Never weaken a test to make the score pass. If a test encodes a wrong target,
  fix the target **with a cited source** and note it in the log.
- One experiment per loop. Small, reversible steps. Everything is logged.
