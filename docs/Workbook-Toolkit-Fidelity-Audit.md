# Workbook → Toolkit Fidelity Audit — dead logic links

**Author:** audit-sweep (quick mode, pattern P7) · **Date:** 2026-07-13 · **Status:** report (detect-only, no code changed)

**Scope:** every workbook input key (`apps/web/src/components/workbook/sections.ts`) traced
through `projectWorkbookToClient` (`apps/web/server/workbookRoutes.ts`) →
`loadClientData` (`apps/web/Toolkit/src/lib/store.ts`) → the calculators
(`apps/web/Toolkit/src/lib/calculators/`). A "dead link" = a value the workbook **collects**
but that **never reaches or affects a calculator** — because it's dropped in projection,
dropped in the store hydration, name-mismatched, or read by no calculator.

Every finding below is verified at file:line. **Nothing here has been fixed** — fixes that
touch scoring must be validated against the real spec/workbook first (Lake fitness 63.53
must hold), so they're proposed, not applied.

---

## The root cause (fix this one thing and several findings collapse)

`loadClientData` rebuilds the Toolkit state from the projected client. For **ESD and SED
contributions** it reduces each contribution to a tiny shape:

```ts
// store.ts — sedState.contributions  (and the esdState equivalent)
contributions: (data.sed?.contributions || []).map((c) => ({
  id: c.id, beneficiary: c.beneficiary, type: c.type, amount: c.amount || 0, category: c.category,
}))
```

The **projection** (`projectWorkbookToClient`) actually produces a much richer contribution —
`blackBenefitPercent`, `primeRate`, `actualRate`, `currentSize`, `percentBenefitingBlack`,
dates — but this reducer **throws all of that away**. So any calculator improvement that
wants those fields can't see them. This single drop point is the source of findings **#1,
#4, #5** below.

**Recommended structural fix:** carry the full projected contribution shape through
`loadClientData` (spread the projected object instead of hand-picking 4 keys), so the
calculators *can* consume the extended fields. Then wire each field into scoring
individually, with a golden-test update and a cited spec. Do the plumbing first (safe,
no score change), then the scoring (validated).

---

## Confirmed findings

### 🟠 #1 — SED `percentBenefitingBlack` is dead · scoring-relevant · MEDIUM
- **Collected:** `SED_COLUMNS` (sections.ts:1256+). **Projected:** workbookRoutes.ts:1250-1251
  (`percentBenefitingBlack` + `blackBenefitPercent`). **Dropped:** store.ts sed reducer.
  **Unused:** esd-sed.ts:324-327 (`amount × typeFactor`, no black-% term).
- **Impact:** a SED contribution benefiting e.g. 40% black beneficiaries scores as if 100%
  benefits black. Under Statement 500 only the black-benefiting portion is recognised.
- **Fix (hypothesis — validate against the SED spec first):** scale/gate recognised SED
  spend by the black-benefit % (≥75% gate vs pro-rate — confirm which from the workbook).

### 🟠 #2 — ESD `primeRate` / `actualRate` are dead · scoring-relevant · MEDIUM
- **Collected:** `ESD_COLUMNS` (sections.ts:1224+). **Projected:** workbookRoutes.ts:1230-1231.
  **Dropped:** store.ts esd reducer. **Unused:** the ESD benefit factor comes only from the
  manually-selected contribution `type` (esd-sed.ts:116-118).
- **Impact:** the loan interest-rate discount has **zero** score effect. An interest-free or
  below-prime loan (which earns a higher benefit factor under the ESD Benefit Factor Matrix)
  scores identically to a market-rate loan. The user fills in prime vs actual rate and
  nothing changes.
- **Fix (hypothesis — validate against the ESD Benefit Factor Matrix):** derive the loan
  benefit factor from `(primeRate − actualRate)` rather than a hand-picked type, or at least
  feed the rates into the factor selection.

### 🟡 #3 — Ownership per-row `rowOutstandingDebt`, `transactionSoa`, `loanDate` are dead · MEDIUM
- **Collected:** `OWNERSHIP_COLUMNS` (sections.ts:784+). **Read by nothing** (projection /
  store / calculator all zero). Net value uses the **aggregate** `outstandingDebt`
  (ownership.ts:109,156 — `debtAttributable = outstandingDebt × pct`), sourced from
  financials / ownershipMeta (workbookRoutes.ts:1294,1535).
- **Impact:** per-shareholder funded-deal debt a user enters never affects net value. The
  engine models acquisition debt only in aggregate.
- **Fix:** either wire per-shareholder acquisition debt into net value, or remove the three
  columns so users aren't entering data that does nothing. (Name mismatch too: the column is
  `rowOutstandingDebt`; the only key ever read is a section-level `outstandingDebt`.)

### 🟡 #4 — ESD `currentSize` (beneficiary EME/QSE) is dead · LOW-MED
- **Projected:** workbookRoutes.ts:1224. **Dropped:** store.ts esd reducer. **Unused:** calc.
- **Impact:** beneficiary EME/QSE status (which can affect ESD qualification/recognition)
  is collected but not applied.

### 🟡 #5 — Procurement `firstProcurementDate`, `sizeAtFirstProcurement` are dead · LOW-MED
- **Collected:** `PROCUREMENT_COLUMNS`. No calculator reads them. They look like an
  unimplemented **first-time / new-supplier** recognition path.

### ⚪ #6 — Collected but not a scoring dimension (cleanup, not defects) · LOW
- Management `salary` (management.ts references neither `salary` nor `annualSalary` — RCOGP MC
  is headcount/voting-weighted, not salary-weighted), MC `department`, MC `startDate`→hireDate
  (MC has no active-period filter), skills `manHours` / `municipality` / `trainingProvider`,
  procurement `measuredUnder`, ownership `unmodifiedBlackOwnership`, ESD `invoiceDate` /
  `paymentDate`, skills-meta `selectPeriod` / `dataDate`.
- **Not bugs** — these are display / evidence / audit fields. Only a problem if the UI implies
  they change the score. Worth a one-line "informational, not scored" hint in the UI.

---

## Explicitly cleared (traced, and they *do* flow — not dead)
- `occupationalLevel` → `designation`; `numberOfShares` → `shares`; `economicInterest` →
  `economicInterestPercent`; `contributionType` → `type`; all skills cost components →
  training cost; `categoryCode`, `province`, `headcount`, `yearsHeld`, `shareValue`,
  `courseCost` → all reach a calculator.
- `designatedGroupOwnership` / `blackNewEntrantOwnership` → used to set the
  `isDesignatedGroup` / `blackNewEntrant` **flags** (workbookRoutes.ts:1028-1030); only their
  magnitude is unused (the calc derives value from share weight). Working as designed.

## Related, already fixed this session
- **Generic → RCOGP** sector-code break (`toCalculatorSectorCode`) — an *entire* imported
  Generic scorecard scored 0 because the industry label "Generic" wasn't mapped to the
  calculator code "RCOGP". Fixed + regression test (commit f564e6d4). Same class of defect:
  a workbook value that silently failed to reach the calculator.

---

## Coverage & confidence
- **Traced:** ownership, management, skills (+meta), procurement, ESD, SED, financials, company
  info — ~70 input keys.
- **Confirmed dead:** 6 findings (2 scoring-relevant), + 1 structural root cause, + a cleanup
  bucket. Every item verified at file:line.
- **Not yet done:** P11 **sector-coverage** (a scored element with `maxPoints > 0` but no
  workbook input) for Construction / FSC / Transport / AGRI — this needs a per-sector config
  vs form-field cross-check and is the recommended next audit pass.

## Recommended fix waves (all held for your approval — nothing touched)
1. **Plumbing (safe, no score change):** carry the full projected contribution shape through
   `loadClientData` so ESD/SED extended fields survive. Add a test that the store contribution
   equals the projected contribution.
2. **Scoring (validated):** wire `percentBenefitingBlack` (SED) and `primeRate/actualRate`
   (ESD) into their calculators — each with a cited spec + golden-test update, and Lake fitness
   held at 63.53.
3. **Decide per column:** for the dead ownership-debt / procurement-date / currentSize columns —
   either wire them or remove them from the workbook so users don't fill dead fields.
4. **Next audit:** P11 sector-coverage cross-check.
