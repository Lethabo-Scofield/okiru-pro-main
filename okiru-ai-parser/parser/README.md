# okiru-ai-parser: B-BBEE AI Parser / Document Intelligence

This module sits after the existing hidden extraction phase. It accepts raw extracted text, tables, metadata, and file info, then returns strict calculator-ready parser output with traceability and review flags.

Flow:

```text
Document upload
-> existing hidden extraction phase
-> raw text/tables/metadata
-> parser resolve
-> Neo4j parser ontology lookup
-> deterministic extraction/normalization/validation
-> safe calculator payload
-> existing manual workbook/calculator flow
```

## Modules

- `parser/ingest.ts` validates the raw extraction contract.
- `parser/classify_document.ts` classifies against ontology document types.
- `parser/extract_fields.ts` extracts only expected ontology fields.
- `parser/normalize.ts` normalizes money, percentages, dates, booleans, and B-BBEE levels.
- `parser/validate.ts` applies deterministic rules and confidence thresholds.
- `parser/calculator_mapper.ts` maps only safe fields into calculator keys.
- `parser/parser_service.ts` orchestrates the full flow.
- `graph/*` owns the separate Neo4j parser ontology and workbook importer.
- `schemas/*` defines strict input/output contracts.
- `src/server.ts` exposes this as a standalone API service.

## API

### Upload And Resolve A File

```http
POST /api/parser/resolve-file
Content-Type: multipart/form-data
```

Use multipart field name `file`. Supported inputs:

- PDF
- DOCX
- XLSX / XLS
- CSV / TXT
- PNG / JPEG / TIFF / WebP images

Example:

```bash
curl -F "file=@supplier_certificate.pdf" http://127.0.0.1:3200/api/parser/resolve-file
```

The service first extracts text/tables from the uploaded file, then runs the same strict parser pipeline.

## Document Type Resolution

The parser identifies the business document type before it extracts fields. File format only tells the service how to read the upload; document type tells the service which ontology rules to use.

```text
PDF / DOCX / XLSX / CSV / image
-> text and table extraction
-> document-type resolver
-> ontology DocumentType
-> expected fields, patterns, validation rules, calculator mapping
```

The resolver scores every ontology `DocumentType` using:

- exact document name / alias matches
- important tokens from the document name
- important tokens from the auditor description
- expected field labels and regex patterns
- generic B-BBEE evidence signals

The response audit trail includes the top candidates:

```json
{
  "classification_candidates": [
    {
      "document_type": "B-BBEE Certificate",
      "pillar": "ESD",
      "confidence": 0.93,
      "matched_evidence": ["B-BBEE Certificate", "bee_level"],
      "reasons": ["exact alias/name matched: B-BBEE Certificate"]
    }
  ],
  "classification_reason": "Document type classified with sufficient confidence and margin"
}
```

Classification policy:

```text
>= 0.85 and margin over runner-up >= 0.15 -> classified
0.60 to 0.84 -> review_required before extraction
< 0.60 -> failed / unsupported
runner-up too close -> review_required before extraction
```

When classification is ambiguous, the service returns no extracted fields and no calculator payload. A human must choose the document type before the parser can safely continue.

### Resolve Parser Output

```http
POST /api/parser/resolve
```

Body is the raw extraction result produced by an external extraction phase:

```json
{
  "file_id": "doc_001",
  "filename": "certificate.pdf",
  "mime_type": "application/pdf",
  "raw_text": "...",
  "tables": [],
  "metadata": {}
}
```

The response is the strict parser output schema from `schemas/parser_output.ts`.

### Load Ontology

```http
POST /api/parser/load-ontology
```

This endpoint is protected with `PARSER_ADMIN_TOKEN` in production. Send it as `x-parser-admin-token` or `Authorization: Bearer <token>`. It loads the source matrix into Neo4j. By default it reads:

```text
/mnt/data/BBBEE_Verification_Document_Matrix_v3 (1).xlsx
```

Override path for local/admin runs:

```json
{
  "workbook_path": "C:\\path\\to\\BBBEE_Verification_Document_Matrix_v3 (1).xlsx"
}
```

## Neo4j Configuration

```env
NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=
NEO4J_DATABASE=
```

Neo4j is intentionally separate from existing ArangoDB sector, scorecard, and calculation logic.

## Safety Policy

- `>= 0.85`: can pass if validation passes.
- `0.60` to `0.84`: `review_required`.
- `< 0.60`: failed or unsupported.

Calculator payloads include only fields that were extracted, normalized, validated, have acceptable field confidence, and have a calculator mapping. Missing required fields, expired certificates, invalid values, or low confidence create review/failed output instead of silently guessing.

## Tests

Install dependencies:

```bash
pnpm install
```

Run tests:

```bash
pnpm test
pnpm typecheck
```

Run the service:

```bash
pnpm dev
```

Then upload a file:

```bash
curl -F "file=@C:/path/to/certificate.pdf" http://127.0.0.1:3200/api/parser/resolve-file
```

## Integration Points

The hidden extraction phase is not replaced here. It must call `POST /api/parser/resolve` or instantiate `ParserService` with the raw extraction result.

The existing manual workbook/calculator flow is not mutated here. It should consume `calculator_payload` only when `status` is `passed`, or after a human explicitly approves a review case.
