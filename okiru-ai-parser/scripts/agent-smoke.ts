/**
 * Run the agent loop (src/services/agentExtraction.ts) on a FEW named documents
 * of an evidence pack, through a cassette, and score what it submitted.
 *
 *   npx tsx scripts/agent-smoke.ts --pack "<pack dir>" --files "<a.pdf>|<b.pdf>"
 *        --first-pass "<a previous pack-eval case.json>" [--mode auto|replay|record]
 *        [--cassette <dir>] [--out <dir>] [--max-turns 8] [--force]
 *
 * Capped by design: at most 2 documents, PARSER_AGENT_MAX_TURNS (default 8)
 * turns each, PARSER_AGENT_MAX_TOKENS_PER_DOC tokens each. A document runs only
 * when the gate (mode hard) calls it hard, unless --force.
 *
 * Reading the files is free: they are read with every model and OCR credential
 * removed from the environment, so a scan comes only from the Document
 * Intelligence raw cache (<pack>/.eval/di-cache) and nothing is paid until the
 * agent's own turns. The first pass is taken from --first-pass (what the
 * pipeline already read for these documents), not re-run.
 *
 * Writes <out>/agent-smoke.json (values included; the folder is the pack's
 * gitignored .eval) and prints counts and field names only.
 * Credentials: run through scripts/esg-pack-eval.ps1's loader, never printed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { extractionInputsFromUpload, type UploadedFileLike } from '../src/services/fileExtraction.js';
import { createAzureExtractionModel, type DocumentExtraction } from '../src/services/aiExtraction.js';
import { withCassette, type CassetteMode } from '../src/services/modelCassette.js';
import {
  agentGateDecision,
  agentLimitsFromEnv,
  agentTargetForDocument,
  hardSignals,
  mergeAgentValues,
  pageImageProviderFor,
  runAgentExtraction,
  type DeterministicDocument,
} from '../src/services/agentExtraction.js';
import { scorePack, type AnswerKey, type PackCase } from '../__tests__/eval/packScore.js';

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const CREDENTIAL_KEYS = [
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY',
  'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', 'AZURE_DOCUMENT_INTELLIGENCE_KEY',
  'PARSER_OCR_ENDPOINT',
];

/** Read with no credentials in the environment: cache-only, never paid. */
async function readFree(upload: UploadedFileLike) {
  const saved = Object.fromEntries(CREDENTIAL_KEYS.map((key) => [key, process.env[key]]));
  for (const key of CREDENTIAL_KEYS) delete process.env[key];
  try {
    return await extractionInputsFromUpload(upload);
  } finally {
    for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  const pack = arg('pack');
  const files = (arg('files') ?? '').split('|').map((f) => f.trim()).filter(Boolean);
  const firstPassPath = arg('first-pass');
  const mode = (arg('mode') ?? 'auto') as CassetteMode;
  if (!pack || !existsSync(pack)) throw new Error('--pack <dir> is required');
  if (files.length === 0 || files.length > 2) throw new Error('--files takes one or two file names, separated by |');
  if (!firstPassPath || !existsSync(firstPassPath)) throw new Error('--first-pass <case.json> is required');
  const evalDir = join(pack, '.eval');
  process.env.PARSER_DI_CACHE_DIR ??= join(evalDir, 'di-cache');
  const out = arg('out') ?? join(evalDir, 'runs', `agent-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(out, { recursive: true });
  const cassetteDir = arg('cassette') ?? join(evalDir, 'cassette-agent');

  const live = mode === 'replay' ? null : createAzureExtractionModel();
  if (mode !== 'replay' && !live) throw new Error('model credentials missing (load them like scripts/esg-pack-eval.ps1)');
  const model = withCassette(live, cassetteDir, mode);
  const limits = { ...agentLimitsFromEnv(), ...(arg('max-turns') ? { maxTurns: Number(arg('max-turns')) } : {}) };
  if (limits.maxTurns > 8) throw new Error('the smoke is capped at 8 turns per document');

  const firstCase = JSON.parse(readFileSync(firstPassPath, 'utf8')) as {
    documents_detected?: Array<DeterministicDocument & { document_type: string; extracted_fields?: Record<string, { normalized_value?: unknown }> }>;
    ai_entities?: { extractions?: DocumentExtraction[] } | null;
  };

  const uploads: UploadedFileLike[] = [];
  const report: Array<Record<string, unknown>> = [];
  const agentExtractions: DocumentExtraction[] = [];
  const mergedExtractions: DocumentExtraction[] = [];

  for (const file of files) {
    const path = join(pack, file);
    const mimetype = MIME[extname(file).toLowerCase()];
    if (!existsSync(path) || !mimetype) throw new Error(`cannot read ${file}`);
    const buffer = readFileSync(path);
    const upload: UploadedFileLike = { originalname: basename(path), mimetype, buffer, size: buffer.length };
    uploads.push(upload);
    const [input] = await readFree(upload);

    const firstPass = (firstCase.ai_entities?.extractions ?? []).filter((e) => e.sourceFile === input.filename);
    const deterministic = (firstCase.documents_detected ?? []).find((d) => d.filename === input.filename);
    const target = agentTargetForDocument(firstPass, deterministic);
    if (!target) {
      console.log(`skip ${file}: no target type`);
      continue;
    }
    const decision = agentGateDecision('hard', hardSignals(input, firstPass, target, deterministic));
    if (!decision.run && !process.argv.includes('--force')) {
      console.log(`skip ${file}: not hard`);
      continue;
    }
    const found = [...new Set(firstPass.flatMap((e) => e.values.map((v) => v.field)))];
    const run = await runAgentExtraction(model, input, target, {
      limits,
      pageImage: pageImageProviderFor(uploads)(input.filename) ?? undefined,
      firstPass: { found, missing: target.fields.map((f) => f.name).filter((f) => !found.includes(f)) },
    });
    const merged = mergeAgentValues(firstPass, target, input.filename, run);
    agentExtractions.push(...mergeAgentValues([], target, input.filename, run).extractions);
    mergedExtractions.push(...merged.extractions);
    report.push({
      file,
      target: target.specId,
      skill: target.skillId ?? null,
      gate: decision.reasons,
      scanned: hardSignals(input, firstPass, target).scanned,
      turns: run.turns,
      tokens: run.tokens,
      toolCalls: run.toolCalls,
      stopReason: run.stopReason,
      error: run.error ?? null,
      values: run.values,
      rejected: run.rejected,
      filled: merged.filled,
      conflicts: merged.conflicts,
    });
    console.log(`${file.slice(0, 3)}…: target ${target.specId} (${decision.reasons.join('; ')})`);
    console.log(`  turns ${run.turns}, tokens ${run.tokens}, tool calls ${run.toolCalls}, stop ${run.stopReason}${run.error ? ' (error)' : ''}`);
    console.log(`  accepted ${run.values.length} cited value(s): ${run.values.map((v) => `${v.field}@${v.page ? `p${v.page}` : v.cellRef}`).join(', ')}`);
    console.log(`  rejected ${run.rejected.length}: ${run.rejected.map((r) => `${r.field ?? '?'} (${r.reason.split(':')[0]})`).join(', ')}`);
    console.log(`  merge: filled ${merged.filled.length}, conflicts ${merged.conflicts.length}`);
  }

  // Score against the answer key for THESE documents only.
  const keyPath = join(evalDir, 'answer-key.json');
  let scores: Record<string, unknown> | null = null;
  if (existsSync(keyPath)) {
    const fullKey = JSON.parse(readFileSync(keyPath, 'utf8')) as AnswerKey;
    const key: AnswerKey = { ...fullKey, documents: fullKey.documents.filter((d) => files.includes(d.file)) };
    const agentOnly = scorePack({ documents_detected: [], ai_entities: { extractions: agentExtractions } }, key);
    const firstOnly = scorePack({
      documents_detected: (firstCase.documents_detected ?? []).filter((d) => files.includes(d.filename)) as PackCase['documents_detected'],
      ai_entities: { extractions: (firstCase.ai_entities?.extractions ?? []).filter((e) => files.includes(e.sourceFile)) },
    }, key);
    const withAgent = scorePack({
      documents_detected: (firstCase.documents_detected ?? []).filter((d) => files.includes(d.filename)) as PackCase['documents_detected'],
      ai_entities: { extractions: mergedExtractions },
    }, key);
    scores = {
      agentOnly: agentOnly.totals.ai,
      firstPassUnion: firstOnly.totals.union,
      withAgentUnion: withAgent.totals.union,
      agentFields: agentOnly.perField.map((f) => ({ file: f.file, label: f.label, keyed: f.keyed, status: f.ai.status })),
    };
    const counts = (c: { correct: number; wrong: number; invented: number; expected: number }) => `${c.correct}/${c.expected} correct, ${c.wrong} wrong, ${c.invented} invented`;
    console.log(`answer key (these documents): agent alone ${counts(agentOnly.totals.ai)}`);
    console.log(`  first pass (det+ai) ${counts(firstOnly.totals.union)} -> with agent ${counts(withAgent.totals.union)}`);
    const byStatus = (status: string) => agentOnly.perField.filter((f) => f.ai.status === status).map((f) => f.label);
    console.log(`  agent correct: ${byStatus('correct').join('; ') || '-'}`);
    console.log(`  agent wrong: ${byStatus('wrong').join('; ') || '-'}`);
    console.log(`  agent invented: ${byStatus('invented').join('; ') || '-'}`);
  }

  writeFileSync(join(out, 'agent-smoke.json'), JSON.stringify({ mode, limits, cassette: model.stats, documents: report, scores }, null, 2));
  console.log(`cassette: ${JSON.stringify(model.stats)}`);
  console.log(`written: ${join(out, 'agent-smoke.json')}`);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
