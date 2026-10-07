/**
 * Run an ESG evidence pack through the real extraction pipeline, repeatably.
 *
 *   npx tsx scripts/esg-pack-eval.ts --pack "<pack dir>" [--out <dir>] [--mode auto|replay|record]
 *
 * This is the parser half of the ESG answer-key gate (sprint task B1). It reads
 * every supported file in the pack exactly as an upload would — the same
 * reader, the same per-sheet split, the same ESG case extraction — and writes
 * the case the upload route would have returned. The web half
 * (apps/web/src/lib/esg/__eval__) places that case into a workbook and scores
 * it against the pack's answer key.
 *
 * What makes it cheap enough to run on every change:
 *  - Model calls go through a cassette (modelCassette.ts): a prompt seen before
 *    is answered from disk, so only calls a code change actually altered are paid.
 *  - PDFs and Word files are read once and kept by content hash. Their reading
 *    is OCR or a text layer, which the sheet and placement work never touches;
 *    spreadsheets are re-read every time, because that is the code under test.
 *
 * Everything written lands under the pack's own `.eval` folder. The pack is
 * client data and is gitignored; so are its recordings, inputs and results.
 * Model credentials come from the environment (see scripts/esg-pack-eval.ps1).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { SUPPORTED_UPLOAD_MIME_TYPES, extractionInputsFromUpload, type UploadedFileLike } from '../src/services/fileExtraction.js';
import { extractEsgCaseEntities } from '../src/services/esgCaseExtraction.js';
import { createAzureExtractionModel } from '../src/services/aiExtraction.js';
import { withCassette, type CassetteMode } from '../src/services/modelCassette.js';
import type { RawExtractionInput } from '../schemas/document_types.js';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xls': 'application/vnd.ms-excel',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/** Spreadsheets are the code under test and are always re-read; the rest is cached. */
const ALWAYS_REREAD = new Set(['.xlsx', '.xlsm', '.xls', '.csv']);

/** The pack's own notes are not evidence. */
const NOT_EVIDENCE = new Set(['MANIFEST.md', 'EXPECTED_VALUES.md']);

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.')) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

async function readInputs(file: UploadedFileLike, ext: string, cacheDir: string): Promise<RawExtractionInput[]> {
  if (ALWAYS_REREAD.has(ext)) return extractionInputsFromUpload(file);
  const key = createHash('sha256').update(file.buffer).digest('hex');
  const cached = join(cacheDir, `${key}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')) as RawExtractionInput[];
  const inputs = await extractionInputsFromUpload(file);
  writeFileSync(cached, JSON.stringify(inputs));
  return inputs;
}

async function main(): Promise<void> {
  const pack = arg('pack');
  if (!pack || !existsSync(pack)) throw new Error('--pack <dir> is required and must exist');
  const mode = (arg('mode') ?? 'auto') as CassetteMode;
  const evalDir = join(pack, '.eval');
  const out = arg('out') ?? join(evalDir, 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
  const inputCache = join(evalDir, 'inputs');
  mkdirSync(out, { recursive: true });
  mkdirSync(inputCache, { recursive: true });

  const model = withCassette(mode === 'replay' ? null : createAzureExtractionModel(), join(evalDir, 'cassette'), mode);
  const started = Date.now();

  const files = walk(pack).filter((path) => !NOT_EVIDENCE.has(basename(path)));
  const inputs: RawExtractionInput[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  for (const path of files) {
    const ext = extname(path).toLowerCase();
    const mimetype = MIME_BY_EXTENSION[ext];
    const name = relative(pack, path);
    if (!mimetype || !SUPPORTED_UPLOAD_MIME_TYPES.has(mimetype)) {
      skipped.push({ file: name, reason: `unsupported type ${ext}` });
      continue;
    }
    const buffer = readFileSync(path);
    const upload: UploadedFileLike = { originalname: basename(path), mimetype, buffer, size: buffer.length };
    try {
      const read = await readInputs(upload, ext, inputCache);
      inputs.push(...read);
      console.log(`read  ${name}  (${read.length} input${read.length === 1 ? '' : 's'})`);
    } catch (err) {
      skipped.push({ file: name, reason: (err as Error).message });
      console.log(`skip  ${name}: ${(err as Error).message}`);
    }
  }

  const entities = await extractEsgCaseEntities(inputs, model, (p) => {
    process.stdout.write(`\rresolving ${p.done}/${p.total}  ${p.fileName.slice(0, 60).padEnd(60)}`);
  });
  process.stdout.write('\n');

  const caseResult = {
    status: entities ? 'resolved' : 'failed',
    case_id: `esg_pack_eval_${Date.now()}`,
    domain: 'esg',
    documents: inputs.map((input) => ({ file_name: input.filename })),
    ai_entities: entities,
    esg_entities: entities,
    unreadable_files: skipped.map((s) => ({ file_name: s.file, reason: s.reason })),
  };
  writeFileSync(join(out, 'case.json'), JSON.stringify(caseResult));

  const values = (entities?.extractions ?? []).reduce((sum, e) => sum + (Array.isArray(e.values) ? e.values.length : 0), 0);
  const summary = {
    pack,
    out,
    mode,
    files: files.length,
    inputs: inputs.length,
    skipped,
    extractions: entities?.extractions?.length ?? 0,
    valuesRead: values,
    cassette: model.stats,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
