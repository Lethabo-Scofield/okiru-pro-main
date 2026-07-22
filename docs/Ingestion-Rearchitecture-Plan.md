# Ingestion re-architecture — the plan

**Status:** agreed 2026-07-22 · **Branch:** `autoresearch/auto`

## Why

Four consecutive ingestion bugs this session — header-row detection, Management
Control designation vocabulary, SED sheet-name hints, TMPS harvest — were the
same bug: *the workbook said X, our string matcher expected Y*. Each fix was
real (Thandanani 26.00 → 69.57 against a verified 102.00), but patching cracks
does not converge, because the meaning of a workbook lives in scattered
string-matching: sheet hints in one file, column aliases in another, designation
vocabularies in a third.

**The principle:**

> **AI decides what things MEAN. Code decides what they SCORE.**

Semantic questions (*is this sheet Social Development? is this column the
leviable amount?*) vary endlessly per client and are what a model is good at.
Every failure this session was on this side. Arithmetic (*what does 100% black
ownership score under Transport QSE?*) must stay deterministic and auditable —
it is verified against certificate 13609 and never goes near a model. **Zero**
failures this session were arithmetic.

**What makes it deterministic:** the AI emits a **mapping, not values**. See
Phase 1.

**Proof already done (2026-07-22):** headers-only markdown of the SED workbook is
**16,446 chars vs 348,922** for the full file (21× reduction, fits any context
window). In that markdown all four bug classes are visible at once: the sheet
names itself in its row-0 banner ("Socio-Economic Development"), the real header
row is row 7 under a banner and legend, a labelled total sits at row 4 (`Total
Value of Contributions made: 16700` — the real figure, unread by us), and the
column semantics are plain. The scale risk is answered; the reading is proven.

---

## Phase 0 — Protect what works *(do first, blocks everything)*

| | |
|---|---|
| **Goal** | A baseline that can prove the new path never regresses the old. |
| **Gate** | Lake Trading scores **63.53** on demand, reproducibly, in CI. |

1. Restore `docs/Toolkit Testing Data` to the checkout (absent today — the Lake
   fitness harness **cannot run**, which is why the MC designation change ships
   unverified against it).
2. Record a golden per-element baseline for every test workbook, not just totals.
3. Make that harness the gate every later phase must pass.

**Risk if skipped:** every later phase is unfalsifiable. Do not skip.

---

## Phase 1 — Template mapping engine *(the core)*

| | |
|---|---|
| **Goal** | Understand a workbook once; apply that understanding deterministically forever. |
| **Gate** | Same file in ⇒ byte-identical sections out, across runs and replicas, with no model call after the first. |

1. **Fingerprint** = sheet names + header rows only. **Never the data** — the
   same template with different numbers must hash identically.
2. **Propose** (first sighting only): headers-only markdown → model → proposed
   `sheet → section` and `column → field` mappings, plus labelled totals
   (TMPS, leviable amount, total contributions), each with confidence and a
   cell reference.
3. **Validate**: every proposed target must exist in the calculator allowlist.
   Anything else is *reported as unmapped*, never silently dropped.
4. **Persist** against the fingerprint (Redis is already wired for the parser).
5. **Replay**: later uploads apply the stored mapping with **no model call**.

**Non-negotiables**
- Temperature 0.
- The model never emits a score, a total, or a derived value — only *where
  things are*.
- A low-confidence mapping is quarantined for review, not applied.
- Cell-level provenance on every mapped field (feeds Phase 3).

**Risks:** mapping drift between template versions (mitigate: fingerprint
includes header text, so a changed template is a new fingerprint); model
proposing a plausible-but-wrong column (mitigate: confidence + Phase 3 review +
Phase 0 golden baseline).

---

## Phase 2 — Unify the two paths

| | |
|---|---|
| **Goal** | One ingestion pipeline, not two. |
| **Gate** | New path matches or beats the old on every Phase 0 workbook, per element. |

The parser path **already works this way** (classify → matrix prompts → entities
→ resolve → map, with confidence and provenance). The Excel path is a separate
pre-AI pipeline. This is largely **unification, not invention**.

1. Run both paths side by side; diff per element per workbook.
2. Cut over **per section**, only where the new path matches or beats the old.
3. Retire hint lists only after their section has cut over.

**Do not** delete the hint-based path until every section has cut over — it is
load-bearing for Lake Trading.

---

## Phase 3 — Show the user what we know *(asked for repeatedly)*

| | |
|---|---|
| **Goal** | Confidence and validation visible, so a low score is explainable. |
| **Gate** | Every scored figure traces to a file and a cell; every gap is named. |

The data already exists and reaches nobody:
- per-field confidence + provenance (Phase 1)
- auditor-test verdicts — `pass` / `fail` / `cannot_tell` (built, `auditorValidation.ts`)
- `needsReview` conflicts where files disagree (built, `entityCalculatorMapping.ts`)
- unmapped fields (built, reported not dropped)

Surface as: *"Black ownership 100% — Ownership!D4, high confidence"* vs *"TMPS —
not found in your files"*. **An unmapped field must never render as 0.** That
single rule prevents the entire class of silent-zero failures this session found.

---

## Phase 4 — Close the Thandanani gaps

Reference case: **102.00 = Level 1** (Transport QSE, certificate 13609). We are
at **69.57**.

| Gap | Points | Status |
|---|---:|---|
| Procurement | 25 | TMPS harvested (R1 030 806.68) but `mergeWorkbooks` takes the gathering file's `tmps: 0` first. **Needs a decision: does a 0 total mean "not stated"?** |
| SED | 25 | Sheet now routes (6 rows) but rows do not map to contribution amounts. Phase 1 should fix this outright. |
| Ownership | 4 | Workbook has Voting Rights = 1, Economic Interest **blank**. Report reconciles via *"Economic & Voting Rights are the same: YES"* — the **agency's determination**, not data. **Expert-blocked.** |
| Employment Equity | — | We score 23.57, report says **0**. Report's EE table puts all 12 employees in `W`; workbook says African/Indian. Only place we score *higher*. **Expert-blocked — data provenance, not code.** |

---

## Blocked on people, not code

Track separately so they do not stall engineering:

1. **Chengetai** — does blank Economic Interest inherit Voting Rights as a
   general rule, or was that case-specific? (Ownership, 4 pts)
2. **Chengetai** — the EE race discrepancy: different period, or excluded
   employees? (EE, and it is the only place we over-score)
3. **Product** — does a `0` labelled total mean "not stated"? (Procurement, 25 pts)
4. **Gazetted Codes** — pull the amended Codes + Integrated Transport Sector Code
   as citable sources for (1) and (3). *The rules were never the problem; these
   two judgement calls are the only place a citation helps.*

---

## Known constraints

- **The calculator allowlist is ~18 keys.** However good the mapping becomes,
  this caps how much of a scorecard is reachable. **Size this early** rather than
  discovering it at 85 points.
- **A submission is not one file.** The Thandanani gathering workbook has
  Procurement and Social Development completely empty; the evidence is in
  separate workbooks. Multi-file merge is built and must stay a first-class
  assumption.
- **The Transport engine is correct.** Four-of-seven, legacy bands, ≥100 = Level 1,
  verified against the certificate. Do not "fix" scoring to close a gap —
  every gap so far has been ingestion.

---

## Order, and why

Phase 0 → 1 → 2 → 3, with Phase 4 falling out of 1 and 2. Phase 3 could move
earlier if user-visible confidence matters more than closing the score gap —
it is independent of 1 and 2 and uses data that already exists.
