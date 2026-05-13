import { workerData, parentPort } from 'worker_threads';
import { parseExcelBuffer } from '../../pipeline/excelParser.js';
import { buildPipelineResult } from '../../pipeline/buildResult.js';

const { bufferArray, filename } = workerData as { bufferArray: number[]; filename: string };
const buffer = Buffer.from(bufferArray);

try {
  const parseResult = parseExcelBuffer(buffer, filename);
  const pipelineResult = buildPipelineResult(parseResult, filename);
  parentPort!.postMessage({ ok: true, result: pipelineResult });
} catch (err: any) {
  parentPort!.postMessage({ ok: false, error: err?.message ?? String(err) });
}
