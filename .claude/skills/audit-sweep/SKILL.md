---
name: audit-sweep
description: Hunt the okiru codebase for recurring "Wave-1" defect classes — phantom saves (success toast but no persistence), comments/placeholders rendered as UI, toast-only validation, dead inputs (collected but never scored), bulk-vs-manual divergence, fail-open authorization, re-hydration clobber, and sector-coverage gaps. Run after changes or before a release to find more issues like the ones the 2026-06-29 audit surfaced. This is the invocable "misalignment finder" referenced in autoresearch/program.md.
---

# audit-sweep — recurring-defect hunter

The 2026-06-29 multi-agent audit found 64 issues that cluster into a small number
of **repeatable patterns**. A one-time audit goes stale the moment code changes.
This skill turns those patterns into a re-runnable search so the same classes of
bug can't quietly come back.

It **detects and reports** — it does not edit code. Fixing is a separate, explicit
step the user approves (the audit's Wave 1/2/3 plan). Detection must never weaken a
test or change a scoring target.

## Arguments

`/audit-sweep [mode] [scope]`

- **mode**: `quick` (default) = inline ripgrep sweep + manual triage, no agents,
  fast. `deep` = fan out a verified Workflow (one finder per pattern → adversarial
  verify → prioritized report). Use `deep` for a release gate or when the user said
  "find everything"; requires the multi-agent opt-in (ultracode or an explicit ask).
- **scope** (optional): a path or pillar to limit the sweep, e.g.
  `apps/web/Toolkit/src/pages/pillars/SED.tsx` or `ownership`. Default = whole repo,
  with the **live Toolkit** (`apps/web/Toolkit/src/`) and its store/api/calculators
  first, since that is the user-facing path.

Examples: `/audit-sweep`, `/audit-sweep deep`, `/audit-sweep quick procurement`.

## The defect-pattern catalog

Each pattern has: the smell, why it bites the user, a ripgrep **signature** to find
candidates, the **verify** check that separates a real bug from a false positive,
and a **fix hint**. Use the Grep tool (ripgrep) for signatures. A signature only
finds *candidates* — every hit MUST be verified at file:line before it's reported.

### P1 — Phantom save (success toast, no persistence) · CRITICAL
- **Smell:** a store action mutates local state + shows a success toast but never
  calls `api.*`, so the edit is lost on the next `loadClientData` re-hydration.
- **User impact:** "updating doesn't work for real" — the canonical Wave-1 bug
  (`updateEmployee`, store.ts).
- **Signature:** in `apps/web/Toolkit/src/lib/store.ts`, list every
  `(update|add|remove|set)[A-Z]\w*:\s*\(` action. For each, check its body contains
  an `api\.` call. Then open `apps/web/Toolkit/src/lib/api.ts` and confirm the
  matching `api.<action>` method actually exists.
- **Verify:** action mutates `set(...)` / `_recalculateAll()` but body has **no**
  `api.` call **and/or** `api.ts` has no matching method — AND a `toast(...)` claims
  success. Compare against a known-good sibling (`updateShareholder`,
  `updateSupplier`, `updateTrainingProgram` all persist).
- **Fix hint:** add `api.<action>` (PATCH/POST/DELETE) + backend route; call it in
  the store action; don't toast success before the call is wired.

### P2 — Partial-payload save (fields silently dropped) · HIGH
- **Smell:** an `add*`/`bulk*` action builds the API payload from only a subset of
  the collected fields.
- **User impact:** "R0 across 500 employees"; foreign-exclusion / active-period
  filtering break after reload because `isForeign/province/hireDate/terminationDate`
  weren't sent.
- **Signature:** diff the object literal sent to `api.add*` against the form/type
  shape. In store.ts and the pillar page, compare the keys in the manual builder
  (e.g. `handleAdd`) vs the bulk builder (`handleBulkSave`) vs the `Employee`/type.
- **Verify:** a field exists in the form/type and the manual path but is absent from
  the bulk/API payload.
- **Fix hint:** include all persisted fields; route bulk through the existing
  `bulkAdd*` endpoint instead of N individual POSTs.

### P3 — Comment / placeholder rendered as UI · HIGH
- **Smell:** a `//` line inside JSX (JSX has no `//` comments — it renders as text);
  or TODO/Issue/placeholder text sitting as a JSX child.
- **User impact:** dev text leaks into the live UI (the `// Issue 1` in the Edit
  Employee modal).
- **Signature:** `rg -n "^\s*// " apps/web/**/*.tsx` then check whether the hit sits
  between JSX tags (a `//` line whose previous or next non-blank line starts with
  `<` or `{`). Also `rg -n ">\s*(TODO|FIXME|Issue \d|XXX|placeholder)" **/*.tsx`.
- **Verify:** the `//` line is inside a `return (...)`/JSX block (not above a
  declaration). Comments above functions/consts are clutter, not a render bug —
  report those as low/clutter, not as a UI leak.
- **Fix hint:** delete or convert to `{/* ... */}`. Add the lint rule in P-LINT.

### P4 — Garbled / templated labels · LOW
- **Smell:** a label built by string concatenation that double-words or mislabels
  for some values (`{level} Management` → "Board Management", "Senior Management
  Management").
- **Signature:** `rg -n "\{[a-zA-Z]+\}\s+[A-Z][a-z]+<" **/*.tsx` and template
  literals building user-visible headings from a category variable.
- **Verify:** enumerate the values the variable can take; flag any that read wrong.
- **Fix hint:** use an explicit label map, not concatenation.

### P5 — Wrong/misleading action icon · LOW
- **Smell:** an edit/save/delete button using a semantically wrong lucide icon
  (e.g. `Filter` funnel on an edit button).
- **Signature:** in action `<Button ... onClick={() => handleEdit...}>`, check the
  icon component; `rg -n "handleEdit" -A2` and inspect the icon.
- **Fix hint:** `Pencil`/`Edit` for edit, `Trash2` for delete, `Save` for save.

### P6 — Toast-only validation (no inline field error) · MEDIUM
- **Smell:** a handler validates and `toast(... required ..., variant:"destructive")`
  but the field has no `aria-invalid`, no error message, no red border; ephemeral
  feedback that doesn't point at the field.
- **User impact:** "said I need a name but it didn't reflect."
- **Signature:** `rg -n "variant:\s*[\"']destructive[\"']" apps/web/**/pillars/*.tsx`
  and `rg -n "is required" **/pillars/*.tsx`. Then check the same file for
  `aria-invalid` / per-field error state (usually absent).
- **Verify:** the only feedback is the toast; the input has no error binding. Also
  check whitespace handling: `!value` (accepts whitespace) vs `value.trim()`
  (correct) — a manual/bulk mismatch is its own finding.
- **Fix hint:** add `aria-invalid` + `aria-describedby` + inline message; reuse the
  import path's `WorkbookValidationPanel` model so manual ≠ import ≠ bulk goes away.

### P7 — Dead input (collected but never scored) · MEDIUM
- **Smell:** a field is collected in a form/type/workbook column but no calculator
  reads it (`annualSalary`; shareholder `votingRightsPercent`/`economicInterestPercent`).
- **User impact:** users fill data that changes nothing; "connections feel shallow."
- **Signature:** list form field keys set via `setFormState({...formState, <key>:`.
  For each `<key>`, `rg -n "<key>" apps/web/Toolkit/src/lib/calculators/`. Zero hits
  in calculators = candidate dead input.
- **Verify:** confirm no calculator (or projection) consumes it. Distinguish
  "displayed only" (acceptable) from "implies it affects score" (bug).
- **Fix hint:** either wire it into scoring (with a golden-test update + cited
  source) or remove the input. Never invent a scoring target to justify it.

### P8 — Bulk-vs-manual taxonomy divergence · MEDIUM
- **Smell:** a normalization map's value set ≠ the manual Select options, so the same
  entity scores differently by entry path (`DESIGNATION_MAP` can't emit "Executive
  Director"/"Other Executive Management").
- **Signature:** for a `*_MAP` and the matching `<SelectItem value=...>` list /
  `VALID_*` array, diff the value sets. `rg -n "SelectItem value=" <file>` vs the map
  values.
- **Verify:** a manual option is unreachable via the import map (or vice-versa).
- **Fix hint:** one shared taxonomy + normalizer used by both paths.

### P9 — Fail-open authorization · CRITICAL
- **Smell:** a permission hook/middleware grants access when role/member is
  missing, on fetch error, or on empty scopes.
- **User impact:** the RBAC you asked for doesn't actually restrict anyone.
- **Signature:** `rg -n "return true" apps/web/src/hooks/use*ermission*.ts apps/web/src/hooks/use*orkspace*.ts`
  and `rg -n "FULL_ACCESS|catch.*=> .*(true|FULL)" apps/web/src apps/api/src`. Also
  check live routes: `rg -n "clients/:clientId/data|verifyClientAccess" apps/web/server apps/api/src`
  for whether `pillarScopes` is consulted.
- **Verify:** the default path on no-role / error / empty-scope returns access; or a
  live data/write route enforces org/creator only, not pillar scope.
- **Fix hint:** fail **closed** — missing role / error / empty scope = no access for
  mutations; enforce `pillarScopes` server-side on the data + write routes.

### P10 — Fire-and-forget persistence & re-hydration clobber · HIGH
- **Smell:** mutations use `.catch(console.error)` with no user-visible failure and
  no autosave; a load/hydrate function reassigns state arrays, dropping unsaved edits.
- **Signature:** `rg -n "\.catch\(console\.error\)" apps/web/Toolkit/src/lib/store.ts`
  and inspect `loadClientData`/hydrate for array reassignment without a dirty-guard.
- **Verify:** a rejected save is invisible to the user; or re-hydration overwrites
  local pending state.
- **Fix hint:** surface failures (toast + dirty/error state) and/or debounced
  autosave with retry; guard re-hydration when there are pending local writes.

### P11 — Sector-coverage gap (scored, but no input) · HIGH
- **Smell:** a config element with `maxPoints > 0` (or a calculator input) has no form
  field / workbook column for that sector; or a page hardcodes one sector's target
  for all sectors.
- **User impact:** a sector can't reach the score it should; wrong targets shown.
- **Signature:** `rg -n "MaxPts|maxPoints" apps/web/Toolkit/src/lib/sectors/` for
  elements (`ceMaxPts`, `fundisaMaxPts`, construction indicators); check each has a
  matching input in `pages/pillars/`. `rg -n "0\.01|\* 5\b|1%" **/pillars/*.tsx` for
  hardcoded RCOGP targets.
- **Verify:** the element scores for a sector but no UI/column collects its inputs;
  or a literal target overrides the per-sector config.
- **Fix hint:** render the input gated on the sector config; drive targets from
  `calculatorConfig`, never literals.

### P12 — Health / observability lie · MEDIUM
- **Smell:** `/health` returns 200 unconditionally (never checks DB), so k8s probes
  stay green during an outage; unhandled-500s logged only when `!isProd`.
- **Signature:** `rg -n "status.*ok|res.*200" apps/*/src/routes/health.ts`;
  `rg -n "!isProd" apps/api/index.ts`.
- **Fix hint:** make `/health` ping Mongo/Arango and 503 on failure; always log 500s.

### P-LINT — prevention (recommend, don't auto-add)
- After a sweep, recommend an ESLint rule banning JSX text nodes that start with
  `//`, and a CI grep gate for `.catch(console.error)` on store mutations, so P1/P3
  can't regress. Only add it if the user says yes.

## Run procedure

### Quick mode (default)
1. Announce the scope and which patterns you'll run.
2. For each pattern P1–P12 in scope, run its **signature** with the Grep tool.
3. For every candidate hit, **open the file at the line and apply the Verify check**.
   Discard false positives explicitly (e.g. a `//` above a declaration is clutter,
   not a render bug).
4. Produce the report (format below). Do **not** edit code.

### Deep mode
1. Confirm the multi-agent opt-in is active (ultracode on, or the user asked for a
   workflow). If not, run quick mode and say why.
2. Launch a **Workflow**: phase **Detect** = one finder agent per pattern (or per
   pattern-group), each given that pattern's smell + signature + verify + the repo
   layout, returning structured findings `{title, severity, pattern, file, evidence,
   userImpact, recommendedFix, confidence}`. phase **Verify** = an adversarial
   verifier per finding that re-opens the file and confirms evidence at file:line,
   killing false positives (`isReal`, `correctedSeverity`). Default to pipeline();
   only barrier when you must dedupe across all findings first.
3. Parse the result into the report. (See the 2026-06-29 run for the exact script
   shape: 6 finders → verify → ratings.)

## Guardrails (inherit the autoresearch gates)
- **Detect only.** This skill reports; it never edits, never weakens a test, never
  changes a scoring target. Fixes are a separate, user-approved step.
- **Scoring is sacred.** If a finding implies a scoring change, flag it as a
  *hypothesis* for the autoresearch loop (program.md) — validate against the real
  `.xlsx`/`specs/` first. Lake Trading fitness must stay **63.56**; the full vitest
  suite (minus the known pre-existing failures in RUN.md) must stay green.
- **No false positives in the report.** Every reported item is verified at file:line.
- **Live path first.** The Toolkit micro-app (`apps/web/Toolkit/src/`) is what users
  touch — prioritize it over the duplicated build forms.

## Output format
Print:
1. **Scope & patterns run** (and any skipped, with why).
2. **Confirmed findings**, grouped by pattern, each:
   `[severity] title — file:line — userImpact — fix hint`.
3. **Counts**: candidates found vs confirmed vs rejected, per pattern.
4. **New since last sweep** (diff against `autoresearch/log/RISKS.md` if present).
5. **Append** confirmed findings to `autoresearch/log/RISKS.md` under a dated
   `## audit-sweep <date>` heading so the next run can diff.
6. Offer the prioritized fix waves; do not start fixing without a go-ahead.
