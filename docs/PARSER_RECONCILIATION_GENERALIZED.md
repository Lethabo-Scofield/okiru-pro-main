# The generalized issue — and the one fix that heals every sector and the whole parser

This document states the single root cause behind the extraction-quality defects,
why it is the same across **all** sectors and the **entire** parser (not one case),
the fix, and the evidence that the fix generalizes. It is self-contained so it can
be handed to Claude or Codex for independent analysis.

---

## 1. The generalized issue (one sentence)

> The pipeline places extracted values into workbook cells by checking each value
> in **isolation** (does this token fit this cell's type?), and never reconstructs
> the **entity** to check whether the assembled result is a *possible company*. It
> has no entity model and therefore no invariants — so it emits workbooks that are
> valid cell-by-cell but globally impossible, and scores them literally.

This is **sector-independent**. What differs between sectors is only *configuration*
— which pillars exist, which targets apply, which documents are expected. The laws
that make a company coherent do not change between Transport, FSC, ICT, Construction,
AgriBEE or Generic:

- a company is never its own shareholder;
- ownership closes to 100%;
- one ID is one person with one population group;
- a date is a date, a count is not a percentage;
- a share carries its economic interest and voting by flow-through.

Every extraction defect observed — in any sector — is a violation of one of five
invariant classes:

| Class | The law | Example defect (any sector) |
|---|---|---|
| **representation** | every value carries a canonical type | Excel serial `46066` left as a number in a date cell; `"1"` in a gender cell |
| **identity** | one ID ⇒ one entity, one stable attribute set | the sole owner split into two rows; one person "African" here, "Indian" there |
| **well-formedness** | only real members belong to a set | the company listed as its own shareholder; an amountless "contribution" scored as R0 |
| **conservation** | the parts sum to the whole | shareholdings totalling 200% |
| **derivation** | entailed-but-absent dimensions are computed | 100% shareholding recorded with 0% economic interest |

Because the classes are laws and not sector rules, **one layer that enforces them
heals every sector**. Adding more per-sector field-mappers or per-document parsers
does not — the next document breaks in a new way, because the pipeline still has no
notion of what a coherent entity *is*.

---

## 2. The fix: a reconciliation layer as the single choke point

Insert one deterministic layer between extraction and scoring so the flow becomes:

```
documents → facts → RECONCILED ENTITY (satisfies the invariants) → cells → score
```

`apps/web/src/lib/reconciliation/reconcileEntity.ts`:

```
reconcileEntity(sections, { sectorCode, scorecardType })
  → { sections (cleaned), issues (severity-ranked, plain-language), summary, counts }
```

The passes run in a fixed order because each depends on the last: **representation →
identity → well-formedness → conservation → derivation**. It is pure and sector-blind
— it takes `sectorCode`/`scorecardType` only to decide the deemed-level regime
(100% black-owned QSE ⇒ Level 1; transport excluded), never to change a law.

It sits at the **one place every sector's extracted data already flows through** —
`DocumentUploadStart.handleCreate`, immediately after `mergeWorkbookSections` and
before the workbook is saved or scored. So it heals every sector by construction:
one choke point, one layer, no per-sector code. It is deliberately **not** in
`projectWorkbookToClient`, so the fitness baseline (clean, expert-filled workbooks)
is untouched.

Output feeds two UI surfaces (the same entity model, different faces): the
severity-triaged **review** (`ReconciliationReview.tsx` — handled / needs-you /
missing) and the **progress** phase banner (Reading → Reconciling).

---

## 3. Evidence that it generalizes

**Real case (Transport QSE, Thandanani).** Reconciliation took the actual extraction
from 89.53 → **98.78**, ownership **10.2 → 24.0**, with **zero blocking issues** —
purely by enforcing the invariants (removed the CC listed as its own 10,000-share
holder, dropped a 0% non-owner swept in from employees, merged the duplicated sole
member, derived his 100% economic interest). The residual gap to 102 is honest
coverage: the SED Rand amounts are genuinely absent from the documents.

**All 16 sectors (`reconciliationSweep.debug.test.ts`).** For every ground-truth
workbook — RCOGP, ICT, Construction, FSC Generic/Banks/LTI/STI, AgriBEE, Transport,
in Generic and QSE — the sweep (a) reconciles the clean workbook and (b) injects the
*same* universal corruption (company-as-own-shareholder + duplicated holder with a
zeroed economic interest + an Excel date serial) and reconciles again:

```
SAFETY  (clean workbook not harmed):   16/16
HEALING (injected corruption removed): 16/16   (self✓ dup✓ date✓ count✓ in every sector)
```

One layer, five laws — safe on every clean sector, heals the same defects in every
corrupted sector. That is the definition of a generalized fix.

---

## 4. "The entire parser" — where each half of the work lives

The parser (`okiru-ai-parser`) reads documents into **facts**. The web reconciler
assembles facts into a **coherent entity**. The invariants belong where the entity
is assembled (the reconciler), because a single document cannot know that "shares
sum to 100%" — that is a cross-document, whole-entity truth. So the reconciler heals
the parser's incoherence downstream regardless of which document produced it, for
every sector, today.

Two parser-side enhancements make the *facts* cleaner at source (they reduce work for
the reconciler; they do not replace it):

- **representation at source** — convert Excel date serials, and never emit a raw
  count where a percentage is expected. (The reconciler already covers this web-side.)
- **well-formedness at source** — the extractor should not place the measured entity
  into its own shareholder table. (The reconciler already removes it.)

The principle for the whole parser: **the parser proposes facts; the reconciler
disposes of them against the entity model.** Detection alone is not enough — the
existing AI validation already *detected* the 200% ownership and the race clash but
only warned a human while the raw rows still flowed to scoring. The fix makes
invariant-satisfaction a **gate the data must pass**, not a note on the side.

---

## 5. How to diagnose any case, any sector

- **Deep single case:** `thandananiDiagnostic.debug.test.ts` replays the full chain
  (map → inject → merge → reconcile → project → score) and writes a markdown + JSON
  bundle (extraction, projected entities, per-element sub-lines, AI validation,
  reconciliation issues, parked rows). Point `THANDANANI_JSON` at any saved
  extraction result.
- **Cross-sector:** `reconciliationSweep.debug.test.ts` runs the safety + healing
  proof across all 16 workbooks.
- **The engine + its laws:** `apps/web/src/lib/reconciliation/` (`reconcileEntity.ts`,
  `types.ts`, `__tests__/reconcileEntity.test.ts`).

Feed any of these, plus this document, to Codex/Claude and the analysis target is
unambiguous: is a given defect a violation of one of the five invariant classes, and
does the reconciler resolve it or escalate it?
