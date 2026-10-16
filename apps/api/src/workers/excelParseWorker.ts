import { workerData, parentPort } from 'worker_threads';
import { parseExcelBuffer } from '../../pipeline/excelParser.js';
import { buildImportResult } from '../../pipeline/importResult.js';

const { buffer: uint8, filename } = workerData as { buffer: Uint8Array; filename: string };
const buffer = Buffer.from(uint8);

try {
  const parseResult = parseExcelBuffer(buffer, filename);
  // Parsed data only — the browser scores it with the Toolkit calculators.
  const importResult = buildImportResult(parseResult, filename);
  // Sheet snippets are forwarded to the main thread for LLM reconciliation,
  // and stripped before the response is sent to the client.
  parentPort!.postMessage({
    ok: true,
    result: importResult,
    snippets: parseResult.sheetSnippets ?? [],
  });
} catch (err: any) {
  parentPort!.postMessage({ ok: false, error: err?.message ?? String(err) });
}
