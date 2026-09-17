# ESG specification generator

Rebuilds `docs/esg/Okiru_ESG_Specification_for_Experts.docx` (the plain-English
specification for BEE / ESG professionals) from the live code, so the document
can be regenerated after a methodology or matrix change.

1. Dump the live tables to JSON (run from the folder that will hold the JSON):
   - `okiru-ai-parser/node_modules/.bin/tsx dump_matrix.ts <outDir>` (document matrix + permitted-value list)
   - `node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json dump_web.ts <outDir>` (input cells, register grids, scorecard rows; run from `apps/web`)
   - `node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json dump_bridge.ts <outDir>` (value → cell binding tables; run from `apps/web`)
2. `npm install docx@9` in `<outDir>`, copy `build_esg_spec.cjs` there, and run `node build_esg_spec.cjs <outDir>`.
3. Open the `.docx` in Word once and update the table of contents (or export to PDF via Word), then copy it to `docs/esg/`.

The narrative (indicator rules in words, edge cases, expert questions) is hand-written
inside `build_esg_spec.cjs`; the tables come from the JSON dumps.

## Open-questions questionnaire

`build_esg_questionnaire.cjs` builds `docs/esg/Okiru_ESG_Open_Questions.pdf` — the
fillable form we send an ESG expert. Content lives in `esg_questions.json`;
the generator only lays it out.

    node docs/esg/spec-generator/build_esg_questionnaire.cjs [outPath]

Every answer box is a real AcroForm field, so the expert types into the PDF and
returns it. Only questions a DEVELOPER CANNOT ANSWER belong in it — a threshold
nobody signed off, a factor with no cited source, a field whose unit is
ambiguous, a rule that only fits a road-freight distributor. Bugs we fix
ourselves and they do not go in here.
