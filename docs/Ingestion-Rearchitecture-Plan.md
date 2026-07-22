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

### 1a. How the AI actually understands — the heart of this

This is the part that replaces four scattered heuristic systems, so it is worth
being precise about *what the model is reasoning over* and *why a matcher cannot*.

**What it reads.** Not raw cells — the structure-preserving markdown: sheet
names, the first ~9 rows of every sheet (banner, legend, header), 2–3 sample
data rows, and the position of every labelled total. Headers-only for the whole
17-sheet SED workbook is **16,446 chars**.

**The five judgements it makes, each of which broke a heuristic this session:**

| Judgement | What the matcher did | What the model sees |
|---|---|---|
| **Self-description** — what IS this sheet? | Matched the *sheet name* `"Social Development"` against a hint list; missed; skipped the sheet; SED scored 0 with 77 rows in the file | Row 0 banner says **"Socio-Economic Development"**. The sheet announces itself *inside itself* — a place sheet-name matching structurally cannot look |
| **Where the data starts** | Took the first row with ≥2 cells = the banner; hunted for shareholder columns in title text; returned 0 rows | Banner → legend ("Use dropdown") → header (row 7) → data (row 8). Obvious from layout |
| **Vocabulary equivalence** | Knew `"Executive Director"` but not `"Top Management"`; one Black top manager scored 0/27 | Both name the top occupational band. Same concept, two industry vocabularies |
| **Which column is which** | Two columns both claim to be a designation; took the job title (`"Member"`) over the occupational level | A job title and an occupational level are different kinds of thing; only one is a scorecard band |
| **Labelled totals** | Needed a bespoke harvester per total, per sheet | `Total Value of Contributions made: 16700` and `Total Procurement Expenditure…: 1030806.68` are self-labelled. Reads them as a class, not as special cases |

Note what these have in common: **none is a hard reading problem.** They are all
"the client wrote it differently than we guessed." That is an infinite space —
which is exactly why enumerating it in hint lists never converges, and why a
model that reads meaning does.

**Three passes, each with a different job:**

1. **Structure** — for each sheet: where is the banner, the legend, the header
   row, the first data row, the labelled totals? Output is *coordinates*, and it
   is checkable: does the claimed header row actually sit above the claimed data?
2. **Semantics** — what element does this sheet serve, and what does each column
   mean in scorecard terms? Output is a *mapping* to allowlisted fields.
3. **Verification** — apply the proposed mapping to the sample rows and ask:
   do the resulting values make sense? A `% Black participation` of 45382 is an
   Excel date serial in the wrong column; a contribution of `"Donation"` is a
   type in the amount column. **This pass catches the plausible-but-wrong mapping
   that confidence alone would not**, and it is cheap because it runs on 3 rows.

**What the model is never asked.** It does not compute a percentage, sum a
column, decide a level, or resolve a conflict between two files. Those are code.
The single question it answers is: *"what does this cell mean?"*

**Why this is safe to trust:** the mapping is proposed once, validated against
the allowlist, verified against sample data, given a confidence, stored, and
then **replayed deterministically forever**. A wrong mapping is a *visible*,
reviewable, correctable artefact with a cell reference — not a silent zero
discovered months later by comparing against a certificate.

---

## Phase 1b — Remove the allowlist ceiling *(runs alongside Phase 1)*

| | |
|---|---|
| **Goal** | The allowlist stops being a cap on reachable score. |
| **Gate** | Every input any calculator actually reads has a key. Proven by a test that fails when one does not. |

Today `schemas/calculator_allowlist.ts` has **~18 keys**. It was written to gate
what the *parser* could emit, not to describe what the *scorecard* consumes — so
however good the mapping becomes, most of a scorecard is unreachable. Perfect
extraction of `total_shares_in_issue`, `holdings_table`, `leviable_amount` or
`consumer_education_spend` currently lands nowhere.

**Do not hand-extend it.** A hand-written list is the same failure mode one layer
up: it drifts from the calculators and nobody notices until a score is wrong.

**Derive it instead.** The calculators are the source of truth for what the
scorecard consumes:

1. Enumerate every field each calculator reads from its input
   (`ownership.ts`, `management.ts`, `skills.ts`, `procurement.ts`,
   `esd-sed.ts`, `transport.ts`, `afs.ts`, `empowermentFinancing.ts`,
   `constructionScoring.ts`).
2. Generate the allowlist from that enumeration, with its runtime type.
3. **Drift guard:** a test that fails when a calculator reads a field with no
   key — the same pattern as `manifestConfigConsistency.test.ts` and
   `documentMarkdown.sync.test.ts`, both of which already catch this class.

**Keep the safety property.** The allowlist exists so a mapping mistake cannot
inject an arbitrary calculator path. Deriving it *widens* the set to everything
legitimately scoreable; it does not remove the gate. `admitCalculatorEntry`
still validates key and runtime type on every value.

**Sequencing:** this gates how much of Thandanani's remaining 32.43 is reachable,
so size it **before** committing to a target score. Do it early in Phase 1, not
after.

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

## Phase 2b — Parallel processing across instances

| | |
|---|---|
| **Goal** | A submission of any size is processed in full, never truncated to fit a window. |
| **Gate** | A 26-document, 100MB+ pack processes end to end with no input dropped, and produces the same result on a re-run. |

**Why.** Evidence packs are not one file and do not fit one context window. The
real Thandanani pack is 26 documents; a single toolkit workbook is 24MB / 617k
chars. Today's answer is truncation (`AI_EXTRACTION_MAX_CHARS = 60,000`,
`MAX_VISION_PAGES = 12`) — silently dropping evidence, which is precisely the
failure mode this whole plan exists to end. **Cost is explicitly not a
constraint**, so the correct answer is to shard and fan out rather than truncate.

*(This reverses an earlier standing preference against multi-agent workflows,
which was a cost decision. Recorded so the reversal is deliberate and not
mistaken for drift.)*

**Shape — fan out on the semantic work, keep reconciliation in code:**

| Stage | Runs as | Parallelism | Notes |
|---|---|---|---|
| Shard | code | — | One unit per document; large workbooks split **per sheet** |
| Classify | model | per shard | What is this? Cheap, headers only |
| Extract | model | per shard | The element's own prompts; each shard sees only its own document |
| Verify | model | per shard | Sample-row sanity (pass 3 above) |
| **Reconcile** | **code** | — | `resolveCaseEntities` + `mergeWorkbooks` — **already built** |
| Score | code | — | Deterministic, verified |

**The safety property that makes this sound:** reconciliation is **code, not an
agent**. Agents never negotiate with each other, never see each other's output,
and never vote. Each returns typed values with provenance; deterministic code
merges them, detects conflicts, and refuses to score contested fields. Without
that, N agents means N opinions and an irreproducible score.

**Rules**
- Fan-out is **bounded by the input** (documents × sheets), never speculative.
- Every shard is independently retryable and idempotent; a failed shard is a
  *reported gap*, never a silent zero.
- Temperature 0 everywhere; shard results keyed by content hash so a re-run
  reuses them.
- Order-independent merge — results must not depend on which shard finishes
  first. Worth an explicit test: shuffle the shard order, expect identical output.
- **Remove the truncation limits once sharding lands.** They are the bug this
  phase exists to fix; leaving them in place silently defeats it.

**Interaction with Phase 1:** mapping is per *template fingerprint*, so sharding
a workbook by sheet does not multiply model cost after first sighting — shards
replay the stored mapping. Fan-out is for *documents*, which have no fixed
template, and for first-sighting mapping.

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

- ~~**The calculator allowlist is ~18 keys.**~~ → now **Phase 1b**, derived from
  the calculators with a drift guard. Size it before committing to a target score.
- **Truncation is currently silent.** `AI_EXTRACTION_MAX_CHARS = 60,000` and
  `MAX_VISION_PAGES = 12` drop evidence without telling anyone. Phase 2b removes
  them; until then, treat any large-document result as partial.
- **A submission is not one file.** The Thandanani gathering workbook has
  Procurement and Social Development completely empty; the evidence is in
  separate workbooks. Multi-file merge is built and must stay a first-class
  assumption.
- **The Transport engine is correct.** Four-of-seven, legacy bands, ≥100 = Level 1,
  verified against the certificate. Do not "fix" scoring to close a gap —
  every gap so far has been ingestion.

---

## Order, and why

**0 → 1 (+1b) → 2 (+2b) → 3**, with Phase 4 falling out of 1 and 2.

- **1b runs early inside Phase 1**, not after — it sets the ceiling on everything
  measurable, so a target score agreed before it is guesswork.
- **2b can start as soon as 1 is proven**; it is orthogonal to the cut-over and
  removes silent truncation, which is a correctness fix in its own right.
- **3 can move ahead of 1 and 2 entirely** if users seeing *why* a score is low
  matters more than closing the gap. It depends on data that already exists.
  That is a product call, not a technical constraint.

**The one-line summary:** the model reads meaning, code does arithmetic, mappings
are cached per template so results are reproducible, work fans out so nothing is
truncated, and every gap is shown rather than scored as zero.
