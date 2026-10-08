/**
 * Run an evidence pack through the real extraction pipeline, repeatably.
 *
 *   npx tsx scripts/pack-eval.ts --domain bbbee|esg --pack "<pack dir>" [--out <dir>] [--mode auto|replay|record]
 *
 * This is the parser half of the answer-key gates. It reads every supported
 * file in the pack exactly as an upload would — the same reader, the same
 * per-sheet split — and writes the case the upload route would have returned:
 *
 *  - esg:   the ESG case extraction (sprint task B1). The web half
 *           (apps/web/src/lib/esg/__eval__) places that case, scores it and
 *           writes score/coverage/fleet beside it. Unchanged by the bbbee work:
 *           same case.json, same inputs cache, same cassette keys.
 *  - bbbee: what /resolve-case-files does — the deterministic CaseParserService
 *           (matrix ontology + model type adjudicator) AND the model extraction
 *           (extractCaseEntities), on the same inputs. case.json is
 *           {...caseResult, ai_entities, unreadable_files}; the parser-side
 *           gate (__tests__/eval/packEval.test.ts) scores it against the key.
 *
 * What makes it cheap enough to run on every change:
 *  - Model calls go through a cassette (modelCassette.ts): a prompt seen before
 *    is answered from disk, so only calls a code change actually altered are paid.
 *  - Document Intelligence's RAW answer is kept per file (PARSER_DI_CACHE_DIR,
 *    defaulted to <pack>/.eval/di-cache), so re-reading a scan is free and a
 *    change to how text is built from it still takes effect.
 *  - PDFs and Word files are kept by content hash AND by the reader's
 *    own version (EXTRACTOR_VERSION plus a fingerprint of the reading code), so
 *    a change to how a file becomes text is never hidden by a cached input.
 *    Both domains (ESG since its agent pass: its old content-hash-only entries
 *    predate the scanned marker and the page split, so a scan read from them
 *    looked like one digital page with no tables and no page images).
 *    Spreadsheets are always re-read, because that is the code under test.
 *
 * What makes a replay the same run as the recording (both domains; ESG since
 * the ESG agent pass, before which its replays missed the vehicle-tab calls):
 *  - file_ids come from the content, not the clock;
 *  - the template decision cache is off (PARSER_DECISION_CACHE=false). It is
 *    keyed by template while its prompt carries ONE workbook's sample rows, so
 *    with three workbooks on one template, whichever sheet reached the model
 *    first decided which prompt was asked — a race. Off, every sheet asks its
 *    own prompt and the cassette pins each answer;
 *  - the in-process extraction cache is off (AI_EXTRACTION_CACHE=false);
 *  - a call that failed in the recorded run (429s past their retries, a dropped
 *    connection) is kept as its failure and replays as that failure
 *    (modelCassette.ts), so the pipeline takes the same path.
 *
 * A replay that misses the cassette is not the recorded run: every miss is
 * attributed to the documents its prompt names, written to summary.json, printed
 * loudly, and the process exits non-zero.
 *
 * Everything written lands under the pack's own `.eval` folder. The pack is
 * client data and is gitignored; so are its recordings, inputs and results.
 * Model credentials come from the environment (see scripts/esg-pack-eval.ps1).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_UPLOAD_MIME_TYPES, extractionInputsFromUpload, type UploadedFileLike } from '../src/services/fileExtraction.js';
import { extractEsgCaseEntities } from '../src/services/esgCaseExtraction.js';
import { extractCaseEntities } from '../src/services/caseExtraction.js';
import { pageImageProviderFor } from '../src/services/agentExtraction.js';
import { createAzureExtractionModel, type ExtractionModel } from '../src/services/aiExtraction.js';
import { modelTypeAdjudicator } from '../src/services/documentTypeAdjudication.js';
import { withCassette, type CassetteMode, type CassetteStats } from '../src/services/modelCassette.js';
import { CaseParserService } from '../parser/case_parser_service.js';
import { InMemoryOntologyRepository } from '../graph/ontology_queries.js';
import { buildOntologyRecordsFromWorkbook, DEFAULT_ONTOLOGY_MATRIX_PATH } from '../graph/ontology_loader.js';
import type { RawExtractionInput } from '../schemas/document_types.js';

export type PackDomain = 'bbbee' | 'esg';

/**
 * Bump when the way a file becomes a RawExtractionInput changes in a way the
 * source fingerprint below cannot see (a dependency upgrade, an external
 * service setting). Code changes are caught by the fingerprint on their own.
 */
export const EXTRACTOR_VERSION = 1;

const PARSER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

/** The pack's own notes, answer key and gate baseline are not evidence. */
export const NOT_EVIDENCE = new Set(['MANIFEST.md', 'EXPECTED_VALUES.md', 'answer-key.json', 'baseline.json']);

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function walk(dir: string): string[] {
  // The file system's own order, as before: input order decides "first
  // document wins", so re-sorting would move existing ESG results.
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.')) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * A hash of the reading code: fileExtraction.ts and every module it imports,
 * transitively, inside the parser. Any edit to how a file becomes text changes
 * it, so the inputs cache can never serve text an old reader produced.
 */
function extractorFingerprint(): string {
  const hash = createHash('sha256').update(`v${EXTRACTOR_VERSION}`);
  const seen = new Set<string>();
  const queue = [join(PARSER_ROOT, 'src', 'services', 'fileExtraction.ts')];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      queue.push(resolve(dirname(file), match[1].replace(/\.js$/, '.ts')));
    }
  }
  for (const file of [...seen].sort()) {
    // Line endings are a checkout setting, not a code change.
    hash.update(relative(PARSER_ROOT, file).replace(/\\/g, '/')).update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex').slice(0, 16);
}

async function readInputs(
  file: UploadedFileLike,
  ext: string,
  cacheDir: string,
  version: string | null,
  domain: PackDomain,
): Promise<RawExtractionInput[]> {
  if (ALWAYS_REREAD.has(ext)) return extractionInputsFromUpload(file, { domain });
  const key = createHash('sha256').update(file.buffer).digest('hex');
  const cached = join(cacheDir, version ? `${key}.${version}.json` : `${key}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')) as RawExtractionInput[];
  const inputs = await extractionInputsFromUpload(file, { domain });
  writeFileSync(cached, JSON.stringify(inputs));
  return inputs;
}

/** A content-derived id, so the same pack always yields the same ids. */
function stableFileIds(inputs: RawExtractionInput[], buffer: Buffer): RawExtractionInput[] {
  const sha = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  return inputs.map((input) => {
    const sheet = typeof input.metadata?.sheet_name === 'string' && inputs.length > 1
      ? `_${input.metadata.sheet_name.replace(/\W+/g, '_')}`
      : '';
    return { ...input, file_id: `pack_${sha}${sheet}` };
  });
}

export interface CassetteMiss {
  method: string;
  /** The pack documents the missed prompt names; empty when it names none. */
  files: string[];
  /** The opening of the prompt, to find the call when it names no document. */
  promptStart: string;
}

/**
 * Wrap the cassette so every miss says which documents it cost. A replay miss
 * is swallowed per spec by the pipeline (the document simply reads fewer
 * values), so without this a stale cassette looks like a worse parser.
 */
function attributingMisses(
  model: ExtractionModel & { stats: CassetteStats },
  inputs: () => RawExtractionInput[],
): ExtractionModel & { stats: CassetteStats; missed: CassetteMiss[] } {
  const missed: CassetteMiss[] = [];
  const wrap = (method: 'complete' | 'completeHard' | 'completeReview') => {
    const inner = model[method] ?? model.complete;
    return async (system: string, user: string): Promise<string> => {
      try {
        return await inner.call(model, system, user);
      } catch (err) {
        if (/cassette has no answer/i.test((err as Error).message)) {
          const prompt = `${system}\n${user}`;
          // The sheet's own name ("Book.xlsx › Finance") when the prompt has it;
          // only failing that, the workbook it came from.
          const names = new Set(inputs().map((input) => input.filename).filter((name) => prompt.includes(name)));
          if (names.size === 0) {
            for (const input of inputs()) {
              const parent = input.metadata?.parent_file;
              if (typeof parent === 'string' && prompt.includes(parent)) names.add(parent);
            }
          }
          missed.push({ method, files: [...names].sort(), promptStart: user.slice(0, 160) });
        }
        throw err;
      }
    };
  };
  // Agent turns (PARSER_AGENT_EXTRACTION) go through the cassette's
  // completeAgent path; a miss there names the documents the transcript does.
  const completeWithTools: ExtractionModel['completeWithTools'] = model.completeWithTools
    ? async (messages, tools, options) => {
        try {
          return await model.completeWithTools!(messages, tools, options);
        } catch (err) {
          if (/cassette has no answer/i.test((err as Error).message)) {
            const transcript = JSON.stringify(messages);
            const names = inputs().map((input) => input.filename).filter((name) => transcript.includes(name));
            missed.push({ method: 'completeAgent', files: [...new Set(names)].sort(), promptStart: transcript.slice(0, 160) });
          }
          throw err;
        }
      }
    : undefined;
  return {
    name: model.name,
    complete: wrap('complete'),
    completeHard: wrap('completeHard'),
    completeReview: wrap('completeReview'),
    ...(completeWithTools ? { completeWithTools } : {}),
    stats: model.stats,
    missed,
  };
}

async function main(): Promise<void> {
  const domain = (arg('domain') ?? 'esg') as PackDomain;
  if (domain !== 'bbbee' && domain !== 'esg') throw new Error('--domain must be bbbee or esg');
  const pack = arg('pack');
  if (!pack || !existsSync(pack)) throw new Error('--pack <dir> is required and must exist');
  const mode = (arg('mode') ?? 'auto') as CassetteMode;
  if (!['auto', 'replay', 'record'].includes(mode)) throw new Error('--mode must be auto, replay or record');
  const evalDir = join(pack, '.eval');
  const out = arg('out') ?? join(evalDir, 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
  const inputCache = join(evalDir, 'inputs');
  mkdirSync(out, { recursive: true });
  mkdirSync(inputCache, { recursive: true });
  // Scans are read from the raw Document Intelligence cache when present; a
  // replay has no credentials and depends on it.
  process.env.PARSER_DI_CACHE_DIR ??= join(evalDir, 'di-cache');
  // See the header: both caches would let concurrency decide which prompt is
  // asked. ESG too: with the decision cache on, the twenty-odd vehicle tabs of
  // one fuel-log template raced to be the one sheet whose rows the column
  // mapping prompt showed, so a replay asked a different tab's prompt than the
  // recording (22 of the 24 ESG misses).
  process.env.PARSER_DECISION_CACHE ??= 'false';
  process.env.AI_EXTRACTION_CACHE ??= 'false';

  const live = mode === 'replay' ? null : createAzureExtractionModel();
  if (mode !== 'replay' && !live) {
    throw new Error(`--mode ${mode} needs model credentials (AZURE_OPENAI_*); run through scripts/esg-pack-eval.ps1`);
  }
  let inputs: RawExtractionInput[] = [];
  const model = attributingMisses(withCassette(live, join(evalDir, 'cassette'), mode), () => inputs);
  const started = Date.now();
  const inputsVersion: string | null = extractorFingerprint();

  const files = walk(pack).filter((path) => !NOT_EVIDENCE.has(basename(path)));
  const read: RawExtractionInput[] = [];
  // Kept for the agent pass's page images (scans only; off unless PARSER_AGENT_EXTRACTION is set).
  const uploads: UploadedFileLike[] = [];
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
    uploads.push(upload);
    try {
      const fileInputs = stableFileIds(await readInputs(upload, ext, inputCache, inputsVersion, domain), buffer);
      read.push(...fileInputs);
      console.log(`read  ${name}  (${fileInputs.length} input${fileInputs.length === 1 ? '' : 's'})`);
    } catch (err) {
      skipped.push({ file: name, reason: (err as Error).message });
      console.log(`skip  ${name}: ${(err as Error).message}`);
    }
  }
  inputs = read;
  const unreadable_files = skipped.map((s) => ({ file_name: s.file, reason: s.reason }));
  const progress = (p: { done: number; total: number; fileName?: string }) => {
    process.stdout.write(`\rresolving ${p.done}/${p.total}  ${(p.fileName ?? '').slice(0, 60).padEnd(60)}`);
  };

  let caseResult: Record<string, unknown>;
  let entities: { extractions?: Array<{ values?: unknown[] }> } | null;
  let deterministic: { documents: number; status: string } | null = null;
  if (domain === 'esg') {
    // The agent pass is off unless PARSER_AGENT_EXTRACTION is hard|all, as in
    // the streaming route; ESG has no rule-based reader, so the gate types a
    // document by Pass A alone.
    entities = await extractEsgCaseEntities(inputs, model, progress, {
      agent: { pageImages: pageImageProviderFor(uploads) },
    });
    process.stdout.write('\n');
    caseResult = {
      status: entities ? 'resolved' : 'failed',
      case_id: `esg_pack_eval_${Date.now()}`,
      domain: 'esg',
      documents: inputs.map((input) => ({ file_name: input.filename })),
      ai_entities: entities,
      esg_entities: entities,
      unreadable_files,
    };
  } else {
    // The same ontology the route's local fallback builds (routes/parser.ts
    // getFallbackRepository): the bundled canonical and matrix types,
    // overwritten by name with the matrix workbook's records.
    const repository = new InMemoryOntologyRepository();
    await repository.upsertOntology(buildOntologyRecordsFromWorkbook(
      process.env.ONTOLOGY_MATRIX_PATH || join(PARSER_ROOT, DEFAULT_ONTOLOGY_MATRIX_PATH),
    ));
    const service = new CaseParserService(repository, { adjudicator: modelTypeAdjudicator(model) });
    const result = await service.resolveCase(inputs, 'bbbee_pack_eval');
    deterministic = { documents: result.documents_detected.length, status: result.status };
    console.log(`deterministic pass: ${result.documents_detected.length} documents, status ${result.status}`);
    const ai = await extractCaseEntities(inputs, model, progress, {
      agent: { deterministic: result.documents_detected, pageImages: pageImageProviderFor(uploads) },
    });
    process.stdout.write('\n');
    entities = ai;
    caseResult = { ...result, domain: 'bbbee', ai_entities: ai, unreadable_files };
  }
  writeFileSync(join(out, 'case.json'), JSON.stringify(caseResult));

  const values = (entities?.extractions ?? []).reduce((sum, e) => sum + (Array.isArray(e.values) ? e.values.length : 0), 0);
  const missesByFile: Record<string, number> = {};
  for (const miss of model.missed) {
    for (const file of miss.files.length > 0 ? miss.files : ['(prompt names no document)']) {
      missesByFile[file] = (missesByFile[file] ?? 0) + 1;
    }
  }
  const summary = {
    domain,
    pack,
    out,
    mode,
    inputsCacheVersion: inputsVersion ?? 'content-hash only',
    files: files.length,
    inputs: inputs.length,
    skipped,
    deterministic,
    extractions: entities?.extractions?.length ?? 0,
    valuesRead: values,
    cassette: model.stats,
    cassetteMissesByFile: missesByFile,
    cassetteMissed: model.missed,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  const { cassetteMissed: _detail, ...printable } = summary;
  console.log(JSON.stringify(printable, null, 2));

  if (mode === 'replay' && model.stats.misses > 0) {
    console.error([
      '',
      '!!! REPLAY MISSED THE CASSETTE !!!',
      `${model.stats.misses} model call(s) had no recorded answer, so the documents below were read with`,
      'fewer model answers than the recorded run. This is NOT the recorded run; its score means nothing.',
      ...Object.entries(missesByFile).map(([file, n]) => `  ${n} x ${file}`),
      'Re-run in auto mode (paid) to record the new prompts, then replay again.',
      '',
    ].join('\n'));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
