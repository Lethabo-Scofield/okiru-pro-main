# Parser re-architecture — the plan

**Status:** agreed 2026-07-22 · **Branch:** `autoresearch/auto`

## Two products, deliberately separate — do not merge them

| | **Spreadsheet import** | **The parser** |
|---|---|---|
| Input | Our template, filled in | **Anything the client has** |
| How it maps | Fixed sheet/column mapping to a known template | Understands each document |
| If the file is unfamiliar | Correctly refuses / asks for the template | Must still read it |
| Commercial | Free path | **The paid product** |
| Correct engineering | Template-bound mapping is *right* here | String matching is *wrong* here |

An earlier draft of this plan proposed unifying them. **That was a mistake.** The
spreadsheet importer requires a specific template *by design* — sheet mapping
against a known shape is the correct implementation of a template-bound feature,
and its heuristics are legitimate maintenance, not technical debt.

The parser is a different promise: **arbitrary documents in, correct scorecard
entities out.** That is what clients pay for, and it is the only place the
"AI decides what things MEAN" architecture belongs.

*(Fixes made to the importer this session — header-row detection, MC designation
vocabulary, SED sheet routing, TMPS harvest — remain valid work on that feature.
They are not the strategic direction and are not what Phase 4 measures.)*

## Why

Four consecutive bugs in the SPREADSHEET IMPORTER this session — header-row detection, Management
Control designation vocabulary, SED sheet-name hints, TMPS harvest — were the
same bug: *the workbook said X, our string matcher expected Y*. Each fix was
real (Thandanani 26.00 → 69.57 against a verified 102.00), but patching cracks
does not converge where input is unconstrained. In the importer that is
acceptable — the template is known. In the PARSER it is fatal, because the
meaning of an arbitrary document cannot live in scattered
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

## Phase 0 — Protect what works ✅ **GATE MET 2026-07-22**

| | |
|---|---|
| **Goal** | A baseline that can prove the new path never regresses the old. |
| **Gate** | ✅ Lake Trading scores **63.56**, verified after this session's scoring-adjacent changes. |

`docs/Toolkit Testing Data` restored (16 workbooks). Everything this session
changed has now been checked against it:

| Check | Result |
|---|---|
| Lake Trading grand total | **63.56 — PASSES** (`AUTORESEARCH=1`, hard gate) |
| Toolkit Testing Data | **14/16 Level 1** — unchanged from the recorded baseline |
| Parser suite | 286/286 |
| Web failures | 28, all pre-existing — `excelImport.test.ts` verified to fail identically with this session's changes stashed |

This matters because the session removed a designation mapping, changed a skills
denominator (`sum_of_leviable_amount`: numerator → denominator) and altered
header-row detection — all scoring-adjacent, all previously unverifiable.
**None regressed Lake.**

**Still to do for a full Phase 0:**
1. Golden **per-element** baselines, not just totals — a total can stay 63.56
   while two pillars move in opposite directions.
2. Wire the harness into CI so the gate runs without being remembered.

**Note on the harness:** `toolkitTestData.score.harness.test.ts` reports
**14/16** and FAILS by design — its goal is 16/16 (the autoresearch target). That
is a research gate, not a regression signal. The regression signal is Lake at
63.56 and the 14/16 count holding.

---

## Phase 1 — Extraction that is worth paying for *(the core)*

| | |
|---|---|
| **Goal** | Any document a client owns → every scorecard entity it contains, normalised, with provenance and confidence. |
| **Gate** | On the 26-document Thandanani pack: nothing silently dropped, every extracted value traceable to a file, and a re-run produces identical output. |

The parser already has the right skeleton — classify → matrix prompts → extract →
resolve across documents → map to calculator keys, with validation. What it does
not yet have is the depth that justifies the price.

**1. Stop truncating.** `AI_EXTRACTION_MAX_CHARS = 60,000` and
`MAX_VISION_PAGES = 12` silently discard evidence. A 300-page pack is read to
page 12 and the rest is *scored as absent*. Chunk and fan out instead
(Phase 2b) — never truncate. Where a limit must exist, it is **reported**, not
silent.

**2. Multi-pass per document, not one shot.** Today each document gets one prompt
and whatever comes back. Insane-level means:
- **Pass A — locate.** What kind of document, what regions does it have (header
  block, table, signature block, annexures)?
- **Pass B — extract.** The matrix prompt for that type, run against the located
  regions, not the whole blob.
- **Pass C — sweep.** *"Which expected fields are still missing? Look again,
  specifically for these."* A second look targeted at gaps recovers what a
  single pass misses, and costs almost nothing relative to the value.
- **Pass D — verify.** Re-read the source for each extracted value and confirm
  it says that. Catches the confident hallucination that confidence scores do
  not.

**3. Documents outside the 109-type matrix must still yield entities.** Today an
unrecognised type is a dead end. The parser should fall back to
*entity-directed* extraction: "find any of these scorecard entities anywhere in
this document", using the allowlist as the target set. A supplier certificate in
an unfamiliar layout is still a supplier certificate.

**4. Tables inside documents.** A share register, a spend schedule and an EE
report are tables wherever they appear — in a PDF, a scan, or a deck. Table
structure must survive extraction as rows, not be flattened to prose.
(Document Intelligence would do this natively; it is not provisioned, so vision
+ markdown carries it today.)

**5. Normalisation is part of the product, not a detail.** `R 4 157 140`,
`(4 157 140)`, `4157140.00`, `4.16m` are one number. `14 March 2027`,
`2027-03-14`, `14/03/2027` are one date. `Level Two`, `Level 2`, `2` are one
level. SA ID numbers carry a checksum, a birth date and a citizenship digit that
**cross-check** the extracted person. Every normaliser is deterministic code with
its own tests — the model reads, code normalises.

**6. Caching, so quality does not cost latency.** Key extraction results by
document content hash. Re-uploading the same certificate re-uses the result;
adding one new document to a pack re-reads only that document. This is what makes
multi-pass affordable in wall-clock terms.

**Non-negotiables**
- Temperature 0 everywhere.
- The model never computes, sums, decides a level, or resolves a conflict between
  documents. It reads. Code does the rest.
- Every value carries **file + location + confidence**.
- A field the parser could not find is **reported as not-found**, never defaulted
  and never scored as zero.

**Risks:** multi-pass raises cost per document (accepted — cost is not a
constraint); more passes mean more chances to hallucinate (mitigated by Pass D
and by verification against the source text, not against the model's own prior
answer).

---

### 1a. How the AI actually understands — the heart of this

**The judgements the parser must make on an arbitrary document:**

1. **What is this?** — a SANAS certificate, an affidavit, a share register, a
   payroll export, a strategy deck. Titles vary, and most documents never restate
   their own type; identity comes from letterheads, form codes (COR14.3, EEA2,
   EMP201), and the shape of the content.
2. **Which parts matter?** — a 40-page pack may carry one scoring fact. Locate
   the header block, the table, the signature block; ignore the boilerplate.
3. **What does each value mean here?** — the same number is a spend, a
   percentage, a date serial or a headcount depending on context.
4. **Whose is it?** — the measured entity's own black ownership, or a listed
   supplier's? Getting this backwards puts a supplier's B-BBEE level on the
   client's scorecard.
5. **Is it still valid?** — expiry, signature, certification date. Extraction
   says what a document contains; validity says whether it counts.

None is a hard *reading* problem. Every one is "the client's document is shaped
differently than we guessed" — an infinite space, which is exactly why
enumerating it in rules never converges and a model that reads meaning does.

**The importer bugs make the point concretely.** They are the same class of
judgement, in a setting where we could see the ground truth — which is why they
are useful evidence even though the importer stays template-bound:

**What it reads.** The structure-preserving **markdown** — which is what the
markdown conversion was built for. Headings, tables, reading order and labels
survive; a flattened text blob loses exactly the structure these judgements
depend on. For a scanned document the markdown comes from vision transcription;
for a workbook, from sheet
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

## Phase 1b — Remove the allowlist ceiling ✅ **DONE 2026-07-22**

| | |
|---|---|
| **Goal** | The allowlist stops being a cap on reachable score. |
| **Gate** | ✅ Every input any calculator actually reads has a key, proven by a failing-on-drift test. |

**Delivered** (`e410fdc7`, `bb41e47f`): allowlist **21 → 70 keys**, derived from
what `ownership.ts` / `management.ts` / `skills.ts` / `procurement.ts` /
`esd-sed.ts` actually read. Drift guard added
(`calculator_allowlist_coverage.test.ts`). The expert's real field names — read
out of the 109-document matrix, 529 distinct fields — are now mapped onto them.
The gate is unchanged: `admitCalculatorEntry` still validates key and runtime
type, arbitrary paths still refused.

**A real scoring bug fell out of it.** `sum_of_leviable_amount` was mapped to
`skills.total_spend`. The Leviable Amount is the **denominator** (the SDL payroll
base); it was mapped to the **numerator**. Any case carrying an EMP201 would have
reported training spend as **100% of payroll** and scored Skills Development full
marks off a payroll return with no training evidence. The old mapping's own
comment called it "the denominator" while the code mapped it to spend — and a
test had been asserting the buggy behaviour. Both corrected.

**Two numbers now, deliberately distinct:** the allowlist describes **70** keys
the scorecard can consume; `PARSER_PILLAR_COVERAGE` still declares **17** per
document type. The printed measure (`ontology reaches 17/70`) tracks the second,
not the mapping table, so it currently *understates* real reach. Making it
measure the mapping table is the next task.

---

### Historical note (the state this phase started from)

`schemas/calculator_allowlist.ts` had **~18 keys**. It was written to gate
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

## Phase 2 — One destination, two front doors

| | |
|---|---|
| **Goal** | Two front doors, one contract — not one pipeline. |
| **Gate** | A client uploading a filled template AND loose documents gets one scorecard with conflicts surfaced, not two competing answers. |

**They stay separate.** See the top of this document. What they share is the
*destination*, not the pipeline:

```
parser (any document)  ─┐
                        ├─→ calculator keys → workbook → toolkit → score
importer (our template) ┘
```

1. **One shared contract**: the calculator allowlist (Phase 1b) plus the
   normalisers from Phase 1.5. Both paths emit the same typed, provenanced
   values; neither invents its own vocabulary.
2. **One shared reconciler**: `resolveCaseEntities` / `mergeWorkbooks` — so a
   client who uploads *both* a filled template *and* loose documents gets one
   coherent scorecard with conflicts surfaced, not two competing answers.
3. **Separate mapping layers, permanently.** The importer keeps its sheet/column
   mapping (correct for a known template). The parser keeps its
   document-understanding layer (correct for unknown input). Neither borrows the
   other's approach.

**Do not** rewrite the importer to use the parser, or teach the parser about our
template. Both would be worse at their own job.

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

## Phase 4 — Prove the parser on the real evidence pack

**Measured through the PARSER, not the spreadsheet importer.** The importer's
69.57 came from three of our own template workbooks; it says nothing about the
paid product. The parser's test is the one that matters:

> Give the parser the **26 real Thandanani documents** — scanned share
> certificate and register, salary report, EE report, invoices, strategy decks,
> proposals, the audit pack — and see what scorecard comes out against a verified
> **102.00 = Level 1** (Transport QSE, certificate 13609).

That is the actual client experience: they upload what they have, not a filled-in
template.

**Reporting per document, not just a total.** For each of the 26:
readable? · type identified? · entities expected vs extracted · what reached the
calculator · what was reported as a gap. A total alone hides which documents the
parser is failing.

**Known starting position (2026-07-22):** classification is honest but not yet
accurate — the scanned Share Register extracts real entities
(`total_shares_in_issue`, `share_classes`, `holdings_table`) which then report
`no_mapping`, because the allowlist has nowhere for them to land. **Phase 1b
unblocks this**, which is why it comes first.

**Expert-blocked regardless of extraction quality** — these are determinations,
not readable data, and no amount of extraction quality resolves them:

| Question | Points | Why code cannot answer it |
|---|---:|---|
| Blank Economic Interest with Voting Rights = 1 | 4 | The report reconciles via *"Economic & Voting Rights are the same: YES"* — the **agency's** determination |
| EE race discrepancy | — | Report's EE table puts all 12 employees in `W`; the workbook says African/Indian. The only place we score *higher* than the verification |

*(The importer-side gaps — TMPS merge precedence, SED contribution amounts —
remain tracked as maintenance on that feature, not as parser work.)*

---

## Blocked on people, not code

### ANSWERED from published sources (2026-07-22)

**Q: Does blank Economic Interest inherit Voting Rights?**
**A: No — not as a general rule.** The Amended Codes treat Voting Rights (2.1)
and Economic Interest (2.2) as **separate indicators with separate points** —
governance versus financial benefit. They are measured independently, and the
Thandanani report scores them separately (6 pts voting, 9 pts economic).

So **do not auto-inherit.** What the report's *"Economic & Voting Rights are the
same: YES"* records is a **case-specific finding** about the share structure: a
single class of ordinary shares carries equal voting and economic rights, so the
two numbers coincide. That is a determination about *this* register, not a rule.

*Implementation:* the parser may infer equality **only** when the share register
shows one ordinary class with no preference/restricted-voting indicators — and
must flag it for confirmation, never apply it silently. The matrix already asks
for `preference_shares_present`, `restricted_voting_indicators`,
`voting_rights_per_class` and `share_class`, which is exactly the evidence that
decides it. **Still worth Chengetai confirming** before it is wired in.

**Q: Is Transport QSE really any four of seven at 25 points each?**
**A: Yes — independently confirmed.** QSE transport entities choose **any four**
of the seven elements, each weighted **25 points**, totalling **100**. This
validates the engine and the base-100 denominator, and therefore that
Thandanani's **102 ≥ 100 = Level 1**.

**New finding — a latent bug the same source exposed.** Transport QSE thresholds
are **R5m–R35m** revenue, not the generic codes' R10m–R50m.
`inferScorecardTypeFromRevenue` applies the generic bands to every sector, so a
transport entity on R40m would be tagged **QSE when it should be Large**, and
scored on the wrong scorecard entirely. Thandanani (R10.8m) is QSE under both, so
this case is unaffected — which is exactly why it went unnoticed. **Tracked as its
own defect.**

### Still open

1. **Chengetai** — confirm the single-ordinary-class inference above before it is
   wired in. (Ownership, 4 pts)
2. **Chengetai** — the EE race discrepancy: different period, or excluded
   employees? (EE, and it is the only place we over-score). *Not answerable from
   published rules — it is a question about which evidence was measured.*
3. **Product** — does a `0` labelled total mean "not stated"? (Procurement, 25 pts)
   *Not addressed by the Codes; it is a data-entry convention question.*

**Sources:** thedtic.gov.za (Codes of Good Practice), BEE Ratings-SA (ownership
measurement principles), SERR Synergy (Transport Sector overview). Published
commentary, not the gazette itself — treat as strong corroboration, and confirm
anything score-changing with Chengetai.

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
