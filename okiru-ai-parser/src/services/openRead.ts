/**
 * The open read's model calls (openFacts.ts is the pure half).
 *
 *  - readOpenDocument: read a document no listed type fits with the domain's
 *    OPEN skill (skills/<domain>/_open.md): its own type label, its identity,
 *    the elements it could evidence, and its facts — each cited, each checked
 *    against the document before it is kept.
 *  - proposeOpenMappings: ONE call per case over every open fact (Other
 *    documents and listed documents' other details): which calculator input,
 *    if any, does each fact mean? "AI decides what things MEAN, code decides
 *    what they SCORE": the model only names a slot from the allowlist; code
 *    coerces the fact's value the way a declared mapping would, refuses what
 *    the allowlist refuses, and files the result as a SUGGESTION on the
 *    document. Nothing here writes a payload: a proposal reaches the workbook
 *    only when a person confirms it in the review.
 *
 * Fail-safe like every other model step: no model, a failed call or an
 * unusable reply returns null / no proposals, and the case is as it was.
 */
import { createLogger } from '../logger.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';
import { parseModelJson, type DocumentExtraction, type ExtractionModel } from './aiExtraction.js';
import { boundedAll, chunkConcurrency } from './concurrentMap.js';
import { chunkDocument } from './documentChunking.js';
import { extractionDomain, type ExtractionDomain } from './extractionDomain.js';
import { openFactSlot, openFactSlots } from './entityCalculatorMapping.js';
import { esgOpenFactSlot, esgOpenFactSlots } from './esgEntityCalculatorMapping.js';
import {
  absorbOpenAgentValues,
  activeOpenSkill,
  isOtherDocument,
  openAgentTarget,
  openReadFromReplies,
  openReadTooLittle,
  otherExtraction,
  type OpenMappingProposal,
  type OpenRead,
} from './openFacts.js';
import { agentPassForDocument, chooseAgentTarget, namesListedType, type AgentCasePass, type DeterministicDocument } from './agentExtraction.js';
import { isOtherClassification, type DocumentClassificationResult } from './documentClassification.js';
import { openSkillPromptText } from './skills.js';
import { decisionFingerprint, rememberDecision } from './semanticDecisionCache.js';

const logger = createLogger('OpenRead');

/** Parts of a long Other document read: the identity and the facts a reader notes sit early. */
export const MAX_OPEN_CHUNKS = 3;

/** Below this a proposal is not worth a person's time. */
export const PROPOSAL_FLOOR = 0.5;

const ROLE: Record<ExtractionDomain, string> = {
  bbbee: 'You are a B-BBEE verification analyst reading a client document that is NONE of the document types the platform has a reading guide for.',
  esg: 'You are an ESG assurance analyst reading a client document that is NONE of the document types the platform has a reading guide for.',
};

export function openReadSystemPrompt(domain: ExtractionDomain): string {
  return [
    ROLE[domain],
    'OPEN READ: report what the document IS and what it STATES, following the open skill. Return ONLY a JSON object.',
    'Rules that matter more than completeness:',
    '- Never invent or infer a value. If the document does not state it, use null.',
    '- Copy values exactly as printed; never compute, total or convert anything.',
    '- Every fact needs a quote copied word for word from the document, with the value inside it. A fact you cannot quote is left out.',
    '- Add an "exceptions" array for anything a reviewer should know (an unreadable part, a missing page).',
  ].join('\n');
}

function exceptionsOf(reply: Record<string, unknown>): string[] {
  const raw = reply.exceptions;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((item) => String(item ?? '').trim()).filter(Boolean);
}

export interface OpenReadOutcome {
  open: OpenRead;
  exceptions: string[];
}

/**
 * Read one Other document with the open skill. Null when there is no open
 * skill (mode off, skills off), nothing to read, or every call failed.
 */
export async function readOpenDocument(
  model: ExtractionModel,
  input: Pick<RawExtractionInput, 'filename' | 'markdown' | 'raw_text'>,
  options: { domain?: ExtractionDomain; fallbackLabel?: string | null } = {},
): Promise<OpenReadOutcome | null> {
  const domain = options.domain ?? 'bbbee';
  const skill = activeOpenSkill(domain);
  if (!skill) return null;
  const source = input.markdown?.trim() || input.raw_text || '';
  if (source.trim().length < 20) return null;

  const global = extractionDomain(domain).skills()?.global ?? null;
  const { text: skillText, keys } = openSkillPromptText(skill, global);
  const { chunks } = chunkDocument(source);
  const read = chunks.slice(0, MAX_OPEN_CHUNKS);
  const system = openReadSystemPrompt(domain);
  const userFor = (chunk: { text: string; index: number }) => [
    skillText,
    `\nEXPECTED JSON KEYS: ${keys.join(', ')}`,
    read.length > 1 ? `\nNOTE: this is part ${chunk.index + 1} of ${chunks.length} of a long document. Return only what is visible in THIS part.` : '',
    `\nDOCUMENT (${input.filename}):\n${chunk.text}`,
  ].join('\n');

  const replies = await boundedAll(read, chunkConcurrency(), async (chunk) => {
    try {
      return parseModelJson(await model.complete(system, userFor(chunk)));
    } catch (err) {
      logger.warn('Open read failed for a part of the document', { file: input.filename, chunk: chunk.index, reason: (err as Error).message });
      return null;
    }
  });
  const parsed = replies.filter((reply): reply is Record<string, unknown> => reply !== null);
  if (parsed.length === 0) return null;

  const open = openReadFromReplies(parsed, input, domain, options.fallbackLabel ?? null);
  const exceptions = Array.from(new Set(parsed.flatMap(exceptionsOf)));
  if (chunks.length > read.length) {
    exceptions.push(`Only the first ${read.length} of ${chunks.length} parts of this long document were read for its details.`);
  }
  logger.info('Open read of an Other document', {
    file: input.filename, label: open.label, facts: open.facts.length, dropped: open.dropped,
  });
  return { open, exceptions };
}

// ─── The case extractors' step ──────────────────────────────────────────────

/**
 * The rule-based reader CONFIDENTLY typed the document as a listed type: its
 * type decision was 'classified' (a pick backed by the document's content, or
 * a confident reader's pick) and it names a listed type. Such a document is
 * that type even when Pass A calls it OTHER: Pass A's OTHER is the looser call
 * ("not scorecard evidence"), and the deterministic path lets a confident
 * keyword pick stand over the adjudicator's "none of these" too.
 */
export function confidentlyRuleTyped(deterministic: DeterministicDocument | undefined): boolean {
  if (!deterministic || !namesListedType(deterministic.document_type)) return false;
  return deterministic.parser_output?.audit_trail?.classification_status === 'classified';
}

/**
 * Pass A's verdict that the document is none of the listed types, as the case
 * extractors act on it: only with the open read on, and never over a stronger
 * signal — a confident rule-based typing (B-BBEE), or the element the person
 * filed the document under (ESG, C1: the element the person filed it under
 * beats a guess).
 */
export function otherByClassifier(
  domain: ExtractionDomain,
  classification: DocumentClassificationResult | null,
  stronger: { ruleTyped?: boolean; filedUnder?: string | null } = {},
): boolean {
  if (activeOpenSkill(domain) === null || !isOtherClassification(classification)) return false;
  return !stronger.ruleTyped && !stronger.filedUnder;
}

/**
 * The case extractors' (B-BBEE and ESG) Other-document step for ONE standalone
 * document, after its listed reads ran (or were skipped because Pass A said it
 * is none of the listed types):
 *
 *  - Pass A said it is none of the listed types (`byClassifier`): it is read
 *    with the open skill and filed as an Other document ("Other document —
 *    <label>").
 *  - Otherwise, when no listed reader read a value from it AND no classifier
 *    named a listed type for it (`typed`: Pass A's skill, or the rule-based
 *    classifier's type), it is an Other document too. A document a classifier
 *    typed is that type even when its first read found nothing (a hard scan):
 *    the agent reads it as that type, never as an Other document.
 *  - A document a listed reader read stays that type; nothing changes.
 *
 * Returns the results with the Other document's extraction added, and whether
 * it was added. Never throws.
 */
export async function addOtherDocumentRead(
  model: ExtractionModel,
  input: Pick<RawExtractionInput, 'filename' | 'markdown' | 'raw_text'>,
  results: DocumentExtraction[],
  options: { domain: ExtractionDomain; classifierLabel?: string | null; byClassifier: boolean; typed?: boolean },
): Promise<{ results: DocumentExtraction[]; other: boolean }> {
  // A read's own notes are no value: an ESG spec that lists "exceptions" among
  // its fields files the model's notes as one (notesAsExceptions moves them
  // later), and a refusal ("not a municipal electricity bill") is only notes.
  const readSomething = results.some((r) => r.values.some((value) => value.field !== 'exceptions'));
  if (!activeOpenSkill(options.domain) || readSomething) return { results, other: false };
  if (!options.byClassifier && options.typed) return { results, other: false };
  // A listed read that FAILED (a rate limit, a timeout) read nothing because it
  // never ran: that is a failure to show, not an Other document to hide it.
  if (!options.byClassifier && results.some((r) => r.error)) return { results, other: false };
  try {
    const outcome = await readOpenDocument(model, input, { domain: options.domain, fallbackLabel: options.classifierLabel ?? null });
    if (!outcome) return { results, other: false };
    const why = options.byClassifier
      ? 'Read as an Other document: it is none of the listed document types, so it was read for what it states rather than under the nearest listed type.'
      : 'Read as an Other document: no listed document type read anything from it, so it was read for what it states.';
    return { results: [...results, otherExtraction(input.filename, outcome.open, [why, ...outcome.exceptions])], other: true };
  } catch (err) {
    logger.warn('Open read failed; the document keeps its listed reads', { file: input.filename, reason: (err as Error).message });
    return { results, other: false };
  }
}

/**
 * The agent loop on an Other document: its target is the open skill's
 * identity fields and facts, every value cited (the agent's own citation
 * checks). It runs (in hard mode) only when the open read read too little;
 * what it reads joins the open read, and the extraction's values stay empty.
 */
export async function agentOnOtherDocument(
  model: ExtractionModel,
  input: RawExtractionInput,
  results: DocumentExtraction[],
  pass: AgentCasePass,
  domain: ExtractionDomain,
  options: { byClassifier?: boolean } = {},
): Promise<DocumentExtraction[]> {
  // An Other document only because no listed read read anything (a hard scan,
  // say), whose own words clearly name a listed type: the agent reads it as
  // that type first — that is what the agent exists for, and its values can
  // then reach scoring. Only when that reads nothing does the open read stand.
  // Pass A's own "none of the listed types" is respected as it is.
  if (!options.byClassifier) {
    const listed = results.filter((r) => !isOtherDocument(r));
    const deterministic = pass.context.deterministic?.find((d) => d.filename === input.filename);
    if (chooseAgentTarget(listed, deterministic, input, domain)?.source === 'skill_signals') {
      const read = await agentPassForDocument(model, input, listed, pass);
      if (read.some((r) => r.values.some((value) => value.field !== 'exceptions'))) return read;
      return results;
    }
  }
  const target = openAgentTarget(domain);
  if (!target?.rows) return results;
  const open = results.find(isOtherDocument)?.open;
  const read = await agentPassForDocument(model, input, results, pass, {
    target,
    hardReasons: openReadTooLittle(open) ? ['other document with too little read'] : [],
  });
  return absorbOpenAgentValues(read, target.rows.field);
}

// ─── Proposed mappings ──────────────────────────────────────────────────────

const PROPOSAL_SYSTEM_PROMPT = [
  'You match facts read from client documents to the calculator inputs they mean, if any.',
  'Each fact is numbered and shown with the document it came from, its label as printed and its value.',
  'The ONLY inputs that exist are the slots listed. Decide which slot, if any, each fact means.',
  'Return ONLY a JSON object: {"proposals": [{"fact": <number>, "key": "<slot key>", "confidence": <0..1>}]}.',
  'Rules:',
  '- Use ONLY slot keys from the list. Never invent one.',
  '- OMIT a fact no slot clearly means. Most facts mean no slot; an empty list is a good answer.',
  '- Match on MEANING, not on shared words. Never map to a slot with a different unit, period or denominator:',
  '  a monthly figure is not an annual one, a rand amount is not a quantity, a count is not a percentage.',
  '- A proposal is shown to a person as a suggestion and is never applied without them. A wrong one wastes',
  '  their time: be conservative, and give a confidence below 0.5 when you are unsure.',
].join('\n');

interface FactRef {
  extraction: DocumentExtraction;
  index: number;
}

function slotsFor(domain: ExtractionDomain) {
  return domain === 'esg' ? esgOpenFactSlots() : openFactSlots();
}

function slotFor(domain: ExtractionDomain, key: string, value: unknown) {
  return domain === 'esg' ? esgOpenFactSlot(key, value) : openFactSlot(key, value);
}

/**
 * Propose calculator inputs for the case's open facts and file each proposal
 * on the fact's document (`open.proposals`, status 'suggested'). Returns how
 * many were proposed. Mutates only the `open` blocks; never a value, never a
 * payload.
 */
export async function proposeOpenMappings(
  model: ExtractionModel | null,
  extractions: DocumentExtraction[],
  domain: ExtractionDomain = 'bbbee',
): Promise<number> {
  if (!model) return 0;
  const refs: FactRef[] = [];
  for (const extraction of extractions) {
    extraction.open?.facts.forEach((_, index) => refs.push({ extraction, index }));
  }
  if (refs.length === 0) return 0;

  const slots = slotsFor(domain);
  const allowed = new Set(slots.map((slot) => slot.key));
  const lines = refs.map(({ extraction, index }, n) => {
    const fact = extraction.open!.facts[index];
    return `${n + 1}. [${extraction.documentName}] ${fact.label}: ${fact.value}${fact.unit ? ` (${fact.unit})` : ''}`;
  });
  const user = [
    'FACTS:',
    ...lines,
    '\nSLOTS (key — meaning):',
    ...slots.map((slot) => `- ${slot.key} — ${slot.description}`),
    '\nReturn the JSON object now.',
  ].join('\n');

  const fingerprint = decisionFingerprint(['open-fact-map-v1', domain, lines.join('\n'), [...allowed].sort().join(',')]);
  let decided: Array<{ fact: number; key: string; confidence: number }> = [];
  try {
    const decision = await rememberDecision<Array<{ fact: number; key: string; confidence: number }>>('open-fact-map', fingerprint, async () => {
      const think = model.completeHard?.bind(model) ?? model.complete.bind(model);
      const parsed = parseModelJson(await think(PROPOSAL_SYSTEM_PROMPT, user));
      const list = Array.isArray(parsed?.proposals) ? parsed!.proposals as unknown[] : null;
      if (!list) return null;
      return list.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const record = item as Record<string, unknown>;
        const fact = Number(record.fact);
        const key = String(record.key ?? '').trim();
        const confidence = Number(record.confidence);
        return Number.isInteger(fact) && key ? [{ fact, key, confidence: Number.isFinite(confidence) ? confidence : 0 }] : [];
      });
    });
    decided = decision.value ?? [];
  } catch (err) {
    logger.warn('Open-fact mapping proposals failed; the facts stay unmapped', { reason: (err as Error).message });
    return 0;
  }

  let proposed = 0;
  const taken = new Set<string>();
  for (const { fact, key, confidence } of decided) {
    const ref = refs[fact - 1];
    if (!ref || !allowed.has(key) || confidence < PROPOSAL_FLOOR) continue;
    const once = `${fact}\u0000${key}`;
    if (taken.has(once)) continue;
    const open = ref.extraction.open!;
    const item = open.facts[ref.index];
    // The same coercion and allowlist a declared mapping would apply: a
    // proposal the calculator could never take is not made.
    const slot = slotFor(domain, key, item.value);
    if (!slot) continue;
    taken.add(once);
    const proposal: OpenMappingProposal = {
      fact: ref.index,
      label: item.label,
      value: item.value,
      calculatorKey: key,
      field: slot.field,
      coerced: slot.coerced,
      confidence: Math.min(1, Math.max(0, confidence)),
      evidence: { sourceFile: ref.extraction.sourceFile, page: item.page, cell: item.cell, quote: item.quote },
      status: 'suggested',
    };
    // A new open block, never the old one changed: an extraction served from
    // the extraction cache shares its open block with the cached entry.
    ref.extraction.open = { ...open, proposals: [...(open.proposals ?? []), proposal] };
    proposed += 1;
  }
  if (proposed > 0) logger.info('Proposed calculator inputs for open facts (suggestions only)', { facts: refs.length, proposed });
  return proposed;
}
