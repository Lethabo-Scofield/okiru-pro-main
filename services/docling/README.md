# Docling conversion sidecar

Layout-aware document → markdown conversion for the extraction pipeline.

## Why

The Node services convert documents from a **text layer** only (pdfjs / mammoth).
That loses table structure and, on multi-column layouts, reading order. Docling
runs a layout model + TableFormer to recover real **table structure** and reading
order, then exports markdown — the format LLM extractors read most reliably.

This matters most for B-BBEE certificates, where the values live inside tables.

## Optional by design

The sidecar is an **enhancement, never a dependency**. The Node client
(`okiru-ai-parser/src/services/doclingClient.ts`) returns `null` on any failure —
disabled, unreachable, timeout, bad response — and the caller falls back to the
built-in converters. An outage degrades markdown quality; it never breaks
extraction.

It also only ever replaces the `markdown` field, never `raw_text`, so the
deterministic regex extractor is unaffected.

## Run

```bash
uv sync                       # docling is declared in pyproject.toml
uvicorn services.docling.app:app --port 3400

# then point the parser at it
export DOCLING_URL=http://localhost:3400
```

Leaving `DOCLING_URL` unset disables the sidecar entirely (default).

## Endpoints

| Method | Path       | Purpose |
|--------|------------|---------|
| GET    | `/health`  | Liveness + whether models are loaded |
| POST   | `/warmup`  | Force the (slow) model load up front |
| POST   | `/convert` | multipart `file` → `{ markdown, tables, pages, engine, duration_ms }` |

## Operational notes

- **Cold start DOWNLOADS models and is very slow** — measured at well over 10
  minutes on CPU for a first conversion, because Docling fetches its layout model,
  TableFormer, and the RapidOCR weights from HuggingFace on demand. This is a
  deployment requirement, not a footnote:
  - **Pre-bake the models into the Docker image** (or mount a warm
    `HF_HOME` / model cache volume) so production never downloads at request time.
  - **Call `/warmup` at boot**, before the service takes traffic.
  - Consider `pip install hf_xet` — Docling logs that the faster Xet transfer is
    unavailable and it falls back to plain HTTP downloads.
  - The 120s client timeout (`DOCLING_TIMEOUT_MS`) is sized for a *warm* service.
    A cold one will blow through it — and the client will correctly fall back to
    the built-in converters, which is the safe outcome but means you get no
    Docling benefit until it is warm.
- `DOCLING_MAX_UPLOAD_BYTES` (default 50MB) bounds upload size.
- `DOCLING_TIMEOUT_MS` (default 120s, client-side) bounds a conversion.
- We wrap Docling ourselves rather than using `docling-serve`, which is not
  installed in this environment.

## Measuring whether it helps

Docling must earn its place — run the extraction eval before/after enabling it:

```bash
cd okiru-ai-parser
pnpm eval:extraction            # baseline, sidecar off
DOCLING_URL=http://localhost:3400 pnpm eval:extraction
```

Keep it only if the scorecard improves on the table-heavy fixtures.
