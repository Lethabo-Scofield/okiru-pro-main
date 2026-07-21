# Extraction eval fixtures

Drop **real** documents here to add them to the extraction scorecard. Each file
needs an expectations sidecar named `<same-stem>.expected.json`.

```
fixtures/
  lake_trading_cert.pdf
  lake_trading_cert.expected.json
```

Supported extensions: `.pdf .docx .xlsx .csv .pptx .png .jpg .jpeg .txt`
(a file without a matching `.expected.json` is ignored).

## Sidecar format

A flat map of expected outputs. Plain keys target the extracted field's
`normalized_value`; keys starting with `@` target document-level metrics.

```json
{
  "@document_type": "B-BBEE Certificate",
  "@status": "passed",
  "supplier_name": "Lake Trading (Pty) Ltd",
  "bee_level": 2,
  "black_ownership": 51,
  "expiry_date": "2027-03-31"
}
```

Document-level keys: `@document_type`, `@status`, `@measured_procurement_spend`,
`@supplier_rows` (count).

## Running

```
pnpm eval:extraction          # score + fail on regression vs baseline.json
pnpm eval:extraction:update   # rewrite baseline.json after an intended change
```

Real scanned certificates are the most valuable fixtures — they exercise the OCR
path the synthetic text fixtures can't. Do not commit confidential client docs;
prefer redacted or synthetic samples.
