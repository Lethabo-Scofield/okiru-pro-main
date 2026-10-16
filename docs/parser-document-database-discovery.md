# Parser Document Database Discovery

## Scope and verification ncxws1e23> fv

The standalone parser HTTP server could not be made to bind to port 3200 in this environment. The normal UI flow was therefore verified through code tracing and the parser's API-level, file-extraction, case-parsing, validation, and evaluation tests. No production data was changed.

Verification completed on 7 August 2026:

- Targeted parser suite: 5 test files and 31 tests passed.
- Extraction evaluation: 11/11 expected fields detected across the digital certificate, sworn affidavit, XLSX supplier schedule, and PPTX fixtures.
- TypeScript: `pnpm typecheck` passed in `okiru-ai-parser`.
- The evaluation also demonstrated an important distinction: a field can be detected while the containing document is still low-confidence and therefore unsafe for calculation.

## A. Current Parser Flow

### Normal scorecard upload flow

```text
DocumentUploadStart
  -> POST /api/parser/quote-files
  -> user proceeds through the current payment/placeholder gate
  -> POST /api/parser/resolve-case-files-stream
  -> Multer in-memory upload
  -> extractionInputsFromUpload / extractionInputFromUpload
  -> file-specific text and table extraction
  -> classifyDocument
  -> extractFields
  -> normalizeValue
  -> validateExtraction
  -> ParserService.resolve
  -> CaseParserService.resolveCase
  -> optional cross-document AI entity extraction
  -> parserWorkbookMap
  -> prefilled scorecard workbook and review indicators
```

The web server proxies `/api/parser/*` to the standalone parser and preserves server-sent events for the streaming route.

### File reading and OCR

`okiru-ai-parser/src/services/fileExtraction.ts` converts each upload to the parser's `RawExtractionInput` structure:

- PDF: `pdfjs-dist` extracts the digital text layer and layout-oriented markdown.
- DOCX: `mammoth` extracts text and HTML-derived markdown.
- XLS/XLSX/XLSM: `xlsx` extracts rows and tables. Multi-sheet workbooks become one parser input per sheet.
- CSV and TXT: deterministic text/table readers.
- PPT/PPTX: slide content is converted to text/markdown.
- PNG/JPEG/TIFF/WEBP: `sharp` preprocessing followed by `tesseract.js` OCR.
- Scanned or nearly empty documents: Azure Document Intelligence is preferred when configured, followed by the configured scanned-PDF vision path. Empty extraction ultimately fails rather than becoming a valid parser result.
- Optional Docling output can improve the markdown sent to AI extraction, but does not replace the deterministic `raw_text` consumed by rules.

The default extraction timeout is 60 seconds. Other guards include PDF page, spreadsheet row, and image-size limits.

### Classification, extraction, and validation

`ParserService.resolve` validates the raw input, loads document definitions from the parser repository, classifies the document, extracts expected fields, normalizes values, applies validation rules, and builds an audit trail.

Ontology lookup uses Neo4j when configured and reachable. Otherwise it falls back to the bundled in-memory ontology/workbook, except where production configuration explicitly requires Neo4j. Neo4j stores parser definitions and relationships; it does not persist uploaded documents or parser runs.

`CaseParserService.resolveCase` runs document parsing per input, then combines only safe document results. It also reports missing required document groups, conflicting values, and documents requiring review. The current generic case rules expect B-BBEE evidence and a supplier spend schedule.

The optional case AI extraction is additive. If no model is configured, deterministic parsing still returns a complete case response. AI-derived entities are returned separately as `ai_entities` and do not weaken deterministic calculator filtering.

## B. Important Files

| File | Responsibility |
| --- | --- |
| `okiru-ai-parser/src/routes/parser.ts` | Parser HTTP routes, upload limits, streaming events, quotes, payment gate, and ontology loading. |
| `okiru-ai-parser/src/services/fileExtraction.ts` | File-type dispatch, text/table extraction, OCR, scanned-document fallbacks, and workbook sheet splitting. |
| `okiru-ai-parser/parser/parser_service.ts` | Single-document orchestration and final parser output. |
| `okiru-ai-parser/parser/case_parser_service.ts` | Multi-document case parsing, safe merge, required-document checks, conflicts, and case audit. |
| `okiru-ai-parser/parser/classify_document.ts` | Weighted ontology-based document classification and ambiguity handling. |
| `okiru-ai-parser/parser/extract_fields.ts` | Ontology regex, labelled fallback, heuristics, source capture, and field confidence. |
| `okiru-ai-parser/parser/normalize.ts` | Typed normalization used before validation. |
| `okiru-ai-parser/parser/validate.ts` | Required-field, confidence, range, date, expiry, and calculator-safety rules. |
| `okiru-ai-parser/schemas/parser_output.ts` | Runtime Zod contracts for raw input, fields, document output, and case output. |
| `okiru-ai-parser/ontology/*` and `okiru-ai-parser/graph/*` | Bundled ontology, Neo4j adapter, and fallback repository. |
| `apps/web/server/apiProxy.ts` | Web-to-parser reverse proxy, including SSE forwarding. |
| `apps/web/src/components/scorecard/DocumentUploadStart.tsx` | Current create-scorecard upload, quote, streaming progress, case results, and coverage UI. |
| `apps/web/src/lib/parserWorkbookMap.ts` | Maps parser case output into scorecard workbook sections. |
| `apps/web/src/lib/documentVerdicts.ts` | Derives per-file found/review/missing verdicts for upload feedback. |
| `apps/web/src/pages/DocumentProcessor.tsx` | Older OCR Pro/admin flow with upload, classification, extraction, score preview, and detailed review stages. |
| `apps/web/src/components/upload/ExtractionReviewPane.tsx` | Reusable split document-preview and extracted-data review layout. |
| `apps/api/src/routes/documents.ts` | Authenticated raw document upload, immediate parsing/chunking, retrieval, download, and entity extraction. This is a separate application document path, not parser-run persistence. |
| `apps/api/src/routes/processorSessions.ts` | Saves resumable processor-session metadata and reduced extraction results. |
| `apps/api/models.ts` | Mongo models for `Document`, `DocumentChunk`, `ProcessorSession`, and `SessionBlob`. |

## C. Existing Data Models

### Parser transport models

The standalone parser defines Zod transport contracts rather than persisted database entities:

- `RawExtractionInput`: file identity, MIME type, flat text, optional markdown, tables, and metadata.
- `ExtractedFieldOutput`: raw value, normalized value, data type, confidence, and source.
- `ParserOutput`: one classified and validated document.
- `ParserCaseOutput`: a group of documents, merged safe payload, missing documents, review list, conflicts, and audit summary.

### Mongo models in the main API

`Document` stores the original upload:

- file name/type/hash/size
- uploader and optional entity
- upload time
- raw `Buffer`
- processing status and chunk count

`DocumentChunk` belongs to a `Document` and stores searchable text chunks with page/sheet/section metadata and an estimated token count.

`ProcessorSession` stores resumable UI/process state, including company information, current step, file summaries, classifications, document statuses, completion state, and references to larger session data.

`SessionBlob` stores large session fields by `sessionId + field`, including reduced extraction results, scorecard results, foundation data, pillar data, and integrated toolkit state.

These models do not form a persistent, versioned parser-result history. There is no model linking a parser run to its exact ontology version, complete field provenance, validation decisions, warnings, and review actions.

## D. Existing APIs

### Standalone parser (`okiru-ai-parser`)

| Method and path | Purpose |
| --- | --- |
| `GET /api/parser/document-types` | Lists ontology document types. |
| `GET /api/parser/required-documents` | Returns required document groups, including sector-aware requirements. |
| `POST /api/parser/resolve` | Parses an already extracted `RawExtractionInput`. |
| `POST /api/parser/resolve-file` | Uploads and parses one multipart `file`. |
| `POST /api/parser/resolve-case` | Parses a JSON array of extracted documents as one case. |
| `POST /api/parser/resolve-case-files` | Uploads multipart `files` and resolves one case. Payment enforcement is configuration-dependent. |
| `POST /api/parser/resolve-case-files-stream` | Same case workflow with per-document SSE progress and result events. |
| `POST /api/parser/quote-files` | Inspects file structure and returns the current upfront parser quote. |
| Parser quote/payment routes | Create/read quote state, handle/simulate payment, and gate paid parsing. Quote persistence is Redis or in-memory, not document-result persistence. |
| `POST /api/parser/load-ontology` | Loads ontology definitions. |

### Main API document/session routes

- `POST /api/documents/upload`: stores a raw file and immediately creates text chunks.
- `GET /api/documents`: lists the authenticated user's documents without raw buffers.
- `GET /api/documents/:id`: returns document metadata.
- `GET /api/documents/:id/chunks`: returns persisted chunks.
- `GET /api/documents/:id/download`: returns the original file.
- `POST /api/documents/extract-entities`: runs application entity extraction from an upload or stored document.
- Processor-session list/detail/upsert/patch/delete routes persist resumable OCR Pro state for the authenticated user and organisation.

The current create-scorecard parser calls the standalone parser through the web proxy. It does not first create a main-API `Document` record.

## E. Extraction Result Structure

A field is represented as:

```json
{
  "raw_value": "Level Two Contributor",
  "normalized_value": 2,
  "data_type": "integer",
  "confidence": 0.9,
  "source": {
    "page": 1,
    "table": null,
    "text_snippet": "B-BBEE Status: Level Two Contributor"
  }
}
```

A missing expected field remains present in `extracted_fields` with `raw_value` and `normalized_value` set to `null`, confidence `0`, and null source values. This makes a failed search distinguishable from a field the ontology never requested.

The document result contains:

```text
file_id, filename, document_type, pillar
overall_confidence
status: passed | review_required | failed
extracted_fields
calculator_payload
supplier_rows and measured_procurement_spend
validation: passed, warnings, errors, missing_fields
audit_trail:
  source_file, matched_patterns, rules_applied, graph_version
  requires_human_review
  classification_candidates and classification_reason
  rejected_calculator_keys
```

The case result adds:

```text
case_id and case status
documents_detected
fields_extracted grouped by filename
merged calculator_payload
supplier_rows with source_file
missing_required_documents
documents_needing_review with reasons
conflicting_fields
per-document audit summaries
optional ai_entities
```

## F. Extraction Quality

There is no separate metric named `extractionQuality`. Existing quality is represented by numeric confidence plus categorical statuses and validation details.

### Per-field quality

Every extracted field has a confidence from 0 to 1. Current rule-based confidence sources include:

- ontology regex match: normally `0.90`
- labelled fallback match: normally `0.72`
- field-specific heuristics: approximately `0.75` to `0.88`
- successful checksum evidence: can raise confidence to `0.95`
- failed normalization: caps confidence at `0.45`
- invalid checksum: caps confidence at `0.40`
- missing field: `0`

A field below `0.85` is unsafe and generates review feedback. Validation rules can also reject a high-confidence value for range, type, expiry, or other semantic reasons.

### Per-document quality

Classification uses weighted alias, filename/name, description, expected-field, and generic B-BBEE evidence. It returns candidate confidences, matched evidence, a winning margin, and a reason.

Thresholds are:

- `>= 0.85`, with a sufficient margin: classified/high confidence.
- `>= 0.60` and `< 0.85`: review territory.
- `< 0.60`: too low and failed.
- winning candidates within `0.15`: ambiguous and require review.

Final document status also includes field validation:

- `passed`: classification and all required validation are safe.
- `review_required`: medium/ambiguous classification, missing fields, low-confidence fields, or validation problems.
- `failed`: unsupported/very-low-confidence document or validation failure severe enough to reject the document.

`overall_confidence` is primarily document-classification confidence. It is not a simple average of OCR and field confidences. OCR engines do not currently contribute a consistently persisted OCR-confidence metric to the parser output.

### Calculator safety

The parser calculates `safe_fields` and `unsafe_fields` internally. They are not exposed as top-level output fields. More conservatively, `calculator_payload` is populated only when the whole document status is `passed`; `review_required` and `failed` documents return an empty calculator payload. In a case, only passed document payloads are merged, and conflicting values are withheld.

Missing expected fields appear in `validation.missing_fields`. Low confidence, ambiguity, invalid values, and expiry appear in warnings/errors and in `documents_needing_review.reasons`. Matching and rejected calculator keys remain auditable.

### Per-case quality

The case has its own categorical status. It requires review when a required document group is missing, any document needs review/fails, or safe values conflict. It does not currently expose one numeric session-level quality score.

## G. Persistence

### Persisted today

- The main API can persist original uploads and their text chunks in Mongo through `/api/documents/upload`.
- OCR Pro processor sessions persist resumable state in `ProcessorSession` and large fields in `SessionBlob`.
- Persisted extraction results are deliberately reduced to file/template identifiers and entity name, value, confidence, status, pillar, and field type.
- Quote/payment state can be stored in Redis; otherwise it is process memory.
- Neo4j can persist ontology definitions.

### Temporary or lost today

- Parser uploads are held in Multer memory during standalone parser requests.
- Complete `ParserOutput` and `ParserCaseOutput` are request/session state, not dedicated database records.
- The current create-scorecard upload component keeps its parser case in React state before mapping it to workbook fields.
- Processor-session persistence strips field provenance/text snippets, definitions, and verification details.
- The complete parser audit trail, classification candidates, missing-field history, conflicting fields, rejected calculator keys, and exact parser/ontology version are not retained as a durable parser run.
- Human edits/approvals do not form a durable, append-only review history tied to the original extraction.

## H. What Can Be Reused

- `RawExtractionInput`, `ParserOutput`, and `ParserCaseOutput` are strong starting contracts for stored input/output snapshots.
- `fileExtraction.ts` should remain the shared file/OCR boundary rather than adding readers in a database feature.
- The ontology repository, classifier, normalizer, extractor, and validator already provide the core parsing decisions.
- Existing field source, confidence, warnings/errors, missing fields, audit trail, conflicts, and review reasons should be stored without redefining quality.
- `CaseParserService` already supplies the per-file and per-case separation a document library needs.
- `ExtractionReviewPane` and the detailed `DocumentProcessor` field/status components provide reusable review interaction patterns.
- `DocumentUploadStart`, `documentVerdicts`, and `parserWorkbookMap` provide the current user-facing upload and scorecard handoff.
- `Document` and `DocumentChunk` already solve authenticated raw-file storage and chunk ownership in the main API, although integration with parser uploads must be designed deliberately.
- `ProcessorSession` and `SessionBlob` demonstrate authenticated, organisation-scoped resumability, but their lossy snapshots should not be treated as extraction history.

## I. Confirmed Gaps

1. No persistent parser-document record is created by the current create-scorecard parser upload.
2. No persistent parser-run entity captures attempts, timestamps, parser version, ontology version, status, or reruns.
3. No durable per-field result history preserves raw/normalized values, confidence, source, validation decisions, and later corrections together.
4. No durable per-file audit retains complete warnings, errors, missing fields, classification candidates, matched rules, or rejected calculator keys.
5. No append-only human review/approval history records who confirmed or changed a value and why.
6. No document library UI lists previously parsed documents independently of a processor session or scorecard flow.
7. No parser-result search or filtering exists for document type, status, missing field, confidence, review state, or parser version.
8. Raw main-API documents/chunks and standalone parser requests are not linked by a shared persisted document/run identifier.
9. OCR confidence and extraction-mode diagnostics are not represented consistently in the standalone parser output contract.
10. `safe_fields` and `unsafe_fields` are validation internals, not exposed as durable result categories; only the final calculator payload and rejected keys reveal the safety decision externally.
11. Session persistence is intentionally lossy and cannot support full provenance or historical comparison.
12. The requested Capiso evidence pack is absent from this checkout, so its exact per-file extraction and Review-stage behavior remains unverified.

## Commands used

```powershell
cd C:\dev\Okiru.pro-monorepo\okiru-ai-parser

pnpm test -- __tests__/parser/real_world_samples.test.ts __tests__/parser/case_parser_service.test.ts __tests__/parser/file_extraction.test.ts __tests__/parser/auditor_validation.test.ts tests/validation.test.ts
pnpm eval:extraction
pnpm typecheck
```

## Recommended boundary for the next ticket

The next ticket should persist the existing raw document identity, parser input snapshot, complete parser output, and review events. It should reference rather than duplicate the current extraction/classification/validation implementations. Before that ticket is accepted, the missing `Capiso RCO GP` pack should be added or supplied so its per-document baseline can be captured as a regression fixture.
