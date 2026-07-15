# AI Parser — Pay-as-you-go Pricing & Upload Flow

**Owner:** Brian · **For:** Lethabo · **Status:** Spec / to build · **Date:** 2026-07-13

---

## 1. Goal

Charge users **per document** for the AI parser, **pay-as-you-go**, and — critically —
**show the price *before* we spend any AI effort**. Pricing scales with the *effort*
the system has to spend on a document: a clean digital PDF is cheap; a scanned /
photographed document needs OCR + vision and costs more.

The price must be a **quote the user accepts and pays before parsing runs**. No
surprise billing after the fact.

This wires into the flow we already built (document upload → provisional live-score
page → workbook). This spec adds the **detect → quote → pay** steps in front of it, and
**colour-coded cells** in the workbook after it.

---

## 2. The target flow (page by page)

```
1. Upload document(s)
      └─ we DETECT type + effort tier and ESTIMATE tokens  (no AI spent yet)
2. Show PRICE quote        ← the number the user sees before paying
3. Charge payment (pay-as-you-go)  ← parser does not run until paid
4. Fill in basic info      (company name, sector, size — cheap, no AI)
5. PARSE                    ← the paid AI effort actually runs here
6. Show PRE-SCORE           ← the provisional live-score page (already built)
7. Validation → manual workbook, colour-coded, user can edit
```

Steps 5–6 already exist (`DocumentUploadStart` → `/create-scorecard/:id/estimate`).
Steps 1–3 and the colour-coding in 7 are the new work.

> **Design rule:** everything up to and including the **quote (steps 1–2) must be free
> and deterministic** — no LLM, no OCR, no paid API. We only spend real effort **after**
> payment clears (step 5).

---

## 3. Feature 1 — Detect document type & effort tier (free, deterministic)

We already extract text deterministically per file type in
`okiru-ai-parser/src/services/fileExtraction.ts`:

| Input | Extractor (existing) | Effort |
|---|---|---|
| PDF **with** a text layer | `extractPdfText` (pdfjs) | **Low** — text is already there |
| PDF **without** text (scanned) | falls through to OCR | **High** — needs OCR |
| Word `.docx` | `extractDocxText` (mammoth) | Low |
| Excel `.xlsx` / CSV | `xlsx` / `extractCsvText` | Low |
| Image (png/jpg/tiff/webp) — a scan or photo | `extractImageText` (**tesseract.js OCR**) | **High** |

**How to tell a digital PDF from a scanned PDF (this is the whole trick):**
run `extractPdfText` (pdfjs) first. If it returns a healthy amount of text →
**digital** (Tier A). If it returns empty / near-empty (e.g. < ~50 chars across the
whole doc, or < ~10 chars/page) → the PDF is **image-only / scanned** (Tier B) and will
need OCR.

Deliverable: a function `detectDocumentEffort(file) → { kind, tier, pages, textChars }`
that runs only the cheap deterministic extractors. `kind ∈ {pdf-digital, pdf-scanned,
docx, xlsx, csv, image}`. Put it next to `rawExtractionInputFromUpload` in
`fileExtraction.ts` (it reuses the same extractors).

---

## 4. Feature 2 — Predict tokens & price *before* AI runs

The user's requirement: **"We need to know the price before actual AI tokens used."**

### 4a. Token estimate

- **Digital / text docs (Tier A):** we already have the extracted text at detect time,
  so count tokens **exactly**. Use a real tokenizer — add `gpt-tokenizer` (or `tiktoken`)
  and count on the extracted string. (Rule-of-thumb fallback: `tokens ≈ chars / 4`, but
  ship the real tokenizer so the quote matches reality.)
- **Scanned docs / images (Tier B):** there is **no text yet** (that's what OCR produces,
  and OCR is the paid effort). Estimate from **page/image count × average tokens-per-page**.
  Calibrate `AVG_TOKENS_PER_SCANNED_PAGE` from a sample of real B-BBEE certificates /
  affidavits (start ~700–900 tokens/page, then tune). For multi-page scanned PDFs,
  `pages` comes from pdfjs even when the text layer is empty.

Return an **estimate with a confidence band** for Tier B (e.g. ±20%), because we can't
know exact tokens until OCR runs. Quote the **upper bound** so we never under-charge; if
actual is lower, that's fine (or refund the delta — see §5 open decision).

### 4b. Price formula

```
price = base_fee
      + (estimated_tokens × rate_per_1k_tokens / 1000) × effort_multiplier
```

- `base_fee` — a small flat per-document fee (covers fixed overhead).
- `rate_per_1k_tokens` — the per-token rate.
- `effort_multiplier` — **1.0 for Tier A (digital)**, **higher (e.g. 2.0–3.0) for Tier B
  (scanned/OCR)**. This is where *"scanned will have a higher pricing rate"* lives.

Put the constants in **config, not code** (so Brian can tune pricing without a deploy).
All numbers below are **placeholders for Brian to set** (§9).

### 4c. New endpoint

```
POST /api/parser/quote     (multipart: files[])   → free, no AI
  → {
      documents: [{ filename, kind, tier, pages, estimated_tokens, price }],
      subtotal, currency, quote_id, expires_at
    }
```

`quote_id` is what step 3 charges against. The quote should **expire** (e.g. 15 min) so a
stale price can't be paid much later. The parse step (§6) must **verify the quote_id is
paid** before doing any work.

---

## 5. Feature 3 — Pay-as-you-go payment gate

After the quote, the user pays **before** parsing.

```
2. Quote shown  →  3. Pay (quote_id)  →  parser unlocked for this case
```

- Payment provider is a **decision for Brian** (§9). In ZA the usual options are
  **Paystack**, **PayFast**, or **Stripe**. Pick one; the flow is the same:
  create a charge for `subtotal` against `quote_id`, and on success mark the case
  `paid` server-side.
- **The server must gate parsing on payment:** `resolve-case-files` (the parse call)
  must reject (`402 Payment Required`) unless the `quote_id` for those files is `paid`.
  Never trust the client to say "paid".
- **Do NOT let the browser handle card details directly in our code.** Use the
  provider's hosted checkout / SDK (redirect or drop-in). We store only the provider's
  payment reference + status, never card data.
- Keep a `parser_charges` record: `{ quote_id, user, org, documents, tokens_estimated,
  price_quoted, provider_ref, status, tokens_actual, created_at }`. `tokens_actual` is
  filled after parse for reconciliation/analytics.

**Open decision:** reconcile estimate vs actual? Options: (a) charge the quote and keep
any difference; (b) charge the quote, refund if actual tokens come in materially lower;
(c) authorise the quote (upper bound) then capture actual. Recommend (a) for v1
(simplest, and the quote is already the upper bound) — revisit if users complain.

---

## 6. Feature 4 — Parse → provisional score (mostly built)

Once paid:

1. **Fill in basic info** — company name, sector, size. This already exists in
   `DocumentUploadStart` (the sector selector + company name). It's free and needs no AI.
2. **Parse** — call the existing `POST /api/parser/resolve-case-files` (now gated on
   payment). This is where OCR / extraction / classification actually runs.
3. **Pre-score** — the provisional live-score page we just shipped
   (`/create-scorecard/:id/estimate`, `WorkbookScoreSummary provisional`). No change
   needed beyond making the upload flow route through the pay gate first.

Record `tokens_actual` on the `parser_charges` row here (from the real extraction) for
reconciliation and future pricing calibration.

---

## 7. Feature 5 — Validation in the manual workbook, with colour-coded cells

After the pre-score, the user opens the workbook (the "Open workbook to refine" button)
to validate and edit. Requirement: **colour-code certain cells** so the user instantly
sees what came from their documents vs what they must complete.

**Cell colour legend (by provenance + confidence):**

| Colour | Meaning | Source of the signal |
|---|---|---|
| 🟩 Green | Auto-filled from a document, high confidence | parser field confidence high |
| 🟨 Amber | Auto-filled but **needs review** (low confidence / conflict) | parser `review_required`, `documents_needing_review`, low field confidence |
| 🟥 Red | Required for scoring but **the documents didn't provide it** | `validation.missing_fields`, mapper coverage `no-document` |
| ⬜ Neutral | Manual entry expected (no document covers it) | not in the parser's scope |

The data for this already exists — we surface it today in `DocumentUploadStart`
(per-document missing content) and in `parserWorkbookMap.ts` (`coverage[]` with
`mapped` / `needs-detail` / `no-document`, plus per-field confidence from the parser).
The new work is **carrying that provenance onto the workbook cells** and rendering the
colours in the grid (`apps/web/src/components/workbook/` — the `SpreadsheetGrid` /
section grids). Store a per-cell provenance map alongside the imported sections so the
grid can look up each cell's colour, with a small legend above the grid.

Then the user edits freely; once a user edits an amber/red cell, it becomes a normal
(neutral) user-entered cell.

---

## 8. Where each piece lives (build map)

| Piece | Location |
|---|---|
| `detectDocumentEffort` (type + tier + pages + textChars) | `okiru-ai-parser/src/services/fileExtraction.ts` |
| Token estimator (tokenizer for Tier A; page-based for Tier B) | new `okiru-ai-parser/src/services/tokenEstimate.ts` (+ add `gpt-tokenizer` dep) |
| Pricing constants (base_fee, rate, multipliers) | config / env — **not** hardcoded |
| `POST /api/parser/quote` | `okiru-ai-parser/src/routes/parser.ts` |
| Payment gate on `resolve-case-files` (402 if unpaid) | `okiru-ai-parser/src/routes/parser.ts` + a `parser_charges` store |
| Payment checkout + webhook | new route (provider-specific); web proxy already forwards `/api/parser/*` |
| Upload → quote → pay UI (steps 1–3) | `apps/web/src/components/scorecard/DocumentUploadStart.tsx` (add the quote + pay stage before extraction) |
| Colour-coded cells + legend | `apps/web/src/components/workbook/` (SpreadsheetGrid / section grids) + carry provenance from `parserWorkbookMap.ts` |

Reuse, don't rebuild: the provisional score page, the sector selector, the
missing-content flags, and `parserWorkbookMap` coverage all already exist.

---

## 9. Decisions needed from Brian (please fill in before build)

1. **The actual numbers:** `base_fee`, `rate_per_1k_tokens`, Tier A multiplier (1.0?),
   Tier B (scanned) multiplier (2×? 3×?), currency (ZAR?), and the minimum charge.
2. **Payment provider:** Paystack / PayFast / Stripe? (drives the checkout + webhook work)
3. **"Tokens" definition:** the parser today is **deterministic (no LLM)**, so "input
   tokens" is currently a **billing unit** derived from document content size + effort —
   not literal LLM tokens. Confirm that's the intent, OR confirm we're adding an LLM
   extraction step that consumes real tokens we pass through. Either works; the estimator
   is the same. This just changes how we describe it to users.
4. **Estimate vs actual reconciliation:** charge the quote flat (recommended v1), or
   refund/settle the difference? (§5)
5. **Free tier?** Any free allowance (e.g. first N documents, or digital docs under a
   token threshold) before charging kicks in?
6. **Who pays** — the individual user, or billed to the organisation/account?

---

## 10. Suggested build order

1. `detectDocumentEffort` + token estimator + `POST /api/parser/quote` (free, testable
   on real sample docs — validates the digital-vs-scanned split and token accuracy).
2. `parser_charges` store + payment gate (`402` on `resolve-case-files` until paid) — get
   the gating right *before* wiring real money.
3. Payment provider checkout + webhook (mark `paid`).
4. Upload UI: insert the quote + pay stage before extraction in `DocumentUploadStart`.
5. Colour-coded workbook cells + legend.

Ship 1–2 behind a flag first so we can validate quote accuracy against real certificates
and affidavits before charging anyone.

---

*Grounded in the current code: `okiru-ai-parser/src/services/fileExtraction.ts`
(pdfjs text layer, tesseract OCR, mammoth, xlsx), `okiru-ai-parser/src/routes/parser.ts`,
`apps/web/src/components/scorecard/DocumentUploadStart.tsx`,
`apps/web/src/lib/parserWorkbookMap.ts`, and the provisional score page
`WorkbookScoreSummary` (`/create-scorecard/:id/estimate`).*
