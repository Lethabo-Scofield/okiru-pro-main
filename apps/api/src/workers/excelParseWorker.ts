import { workerData, parentPort } from 'worker_threads';
import { parseExcelBuffer } from '../../pipeline/excelParser.js';
import { buildPipelineResult } from '../../pipeline/buildResult.js';

const { buffer: uint8, filename } = workerData as { buffer: Uint8Array; filename: string };
const buffer = Buffer.from(uint8);

try {
  const parseResult = parseExcelBuffer(buffer, filename);
  const pipelineResult = buildPipelineResult(parseResult, filename);
  parentPort!.postMessage({ ok: true, result: pipelineResult });
} catch (err: any) {
  parentPort!.postMessage({ ok: false, error: err?.message ?? String(err) });
}
