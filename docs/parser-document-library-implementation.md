# Parser Document Library Implementation

## Architecture

```text
Document
  - canonical original file and tenant ownership
  - latest parser-run summary for fast library queries

ParserRun
  - immutable full parser output for one attempt
  - extracted fields, missing fields, provenance, validation, audit, and review reasons
  - reviewHistory reserved for later human corrections without changing parser evidence
```

The existing parser remains the source of truth. `overall_confidence` is displayed as classification confidence and is not presented as OCR accuracy. UI quality labels map directly from parser status: `passed` is Good, `review_required` is Needs review, and `failed` is Problem.

## Reused Logic

- `fileExtraction.ts`, `ParserService`, `CaseParserService`, classifier, extractor, normalizer, and validator remain unchanged as the processing pipeline.
- `ParserCaseOutput` now includes an additive lossless `parser_output` per detected document.
- `DocumentUploadStart` still passes the original case response to `parserWorkbookMap`.
- `ExtractionReviewPane` provides the document/detail split view.

## Database Changes

- Extended `documents` with organisation ownership, true content checksum, source, and latest-run query summaries.
- Added `parser_runs` for immutable, lossless parser attempts.
- Added indexes for tenant/date, tenant/status/type, document run history, and review status.
- Added an embedded future-compatible `reviewHistory` event schema. Original parser output is never overwritten.

## APIs

- `POST /api/parser-documents/upload`: persist or link a tenant-owned original.
- `POST /api/parser-documents/:id/runs`: append an immutable parser attempt.
- `GET /api/parser-documents`: paginated server-side filename, status, type, date, missing-field, low-confidence, and review filtering.
- `GET /api/parser-documents/:id`: document and latest full run.
- `GET /api/parser-documents/:id/runs`: run history summaries.
- `GET /api/parser-documents/:id/runs/:runId`: one complete historical run.
- `GET /api/parser-documents/:id/download`: tenant-scoped original file.

All routes require authentication and scope records to the session organisation, or to the user for personal workspaces. List/detail responses exclude raw buffers.

## UI

- `/documents`: authenticated, paginated document library with server-side search and filters.
- `/documents/:id`: original-file preview beside extracted fields, expected fields that could not be read, confidence, warnings, review reasons, provenance, and parser audit.
- Hub includes a Document Library entry.
- Create Scorecard persists originals before quote generation and parser runs after extraction without changing workbook mapping.

## Verification

- API typecheck passes.
- Parser typecheck passes.
- Parser case tests pass, including the lossless per-document output assertion.
- Parser-document route tests pass for upload/list safety, missing and low-confidence preservation, failed attempts, reruns, and tenant isolation.
- Browser verification confirms the authenticated library route renders without horizontal overflow or application console errors.

## Remaining Limitations

- Mongo `Document.rawContent` is capped at 15 MB in this flow to stay below MongoDB's 16 MB document limit. Larger originals need GridFS or blob-backed storage in a follow-up.
- Complete human review editing is not included. The schema supports append-only review events for that follow-up.
- Existing uploads and processor-session snapshots are not backfilled automatically.
- The current local API process predates these routes and could not be restarted because the workspace's local `bcrypt` dependency link is missing. Route behavior was verified through isolated HTTP integration tests instead.
- The web workspace still has unrelated pre-existing TypeScript failures outside the new files.
