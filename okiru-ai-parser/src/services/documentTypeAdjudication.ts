/**
 * Model-backed document-type adjudication — the reader behind the lexical
 * classifier's shortlist. See `parser/type_adjudicator.ts` for the contract
 * and the reason it exists.
 *
 * WHAT MAKES THIS TEACH THE CONFUSION PAIRS GENERALLY
 *
 * The lexical classifier confuses types that share vocabulary: MOI ↔ Ownership
 * Confirmation (both say "shares", "director"), EE-compliance letter ↔ EMP201
 * (both say "SDL", "Skills Development"). Hand-adding negative keywords for each
 * pair would fix two pairs and leave the next hundred. Instead the model is
 * given, for EVERY candidate, what the document type is FOR (the verifier's
 * test) and what it typically CONTAINS (its expected fields) — the purpose and
 * layout are what distinguish look-alike documents, and they come from the
 * matrix, so every type on the shortlist arrives already "taught". The two
 * observed pairs are kept as worked examples of the rule, not as the rule.
 *
 * Fail-safe by construction: no model → null, call fails → null, "NONE" →
 * null, below the floor → null. The caller then keeps the lexical decision and
 * still extracts under it.
 */
import { createLogger } from '../logger.js';
import type { ExtractionModel } from './aiExtraction.js';
import { parseModelJson } from './aiExtraction.js';
import { getExtractionModel } from './caseExtraction.js';
import { modelClassificationEnabled } from './documentClassification.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';
import type {
  AdjudicationCandidate,
  AdjudicationInput,
  DocumentTypeAdjudicator,
  TypeAdjudication,
} from '../../parser/type_adjudicator.js';

const logger = createLogger('DocumentTypeAdjudication');

/** Enough to see the title block, the first table and the form's own layout. */
const ADJUDICATE_CHARS = 8000;

/**
 * Below this the model is not sure enough to overrule the lexical pass. Kept
 * BELOW the pass threshold on purpose: an adjudication at 0.7 still lands the
 * document under the right type for extraction, and the residual doubt rides
 * along as a review flag — the ladder in ParserService does the rest.
 */
export const ADJUDICATION_FLOOR = 0.6;

const SYSTEM_PROMPT = [
  'You are a B-BBEE verification analyst deciding WHAT ONE uploaded document is.',
  'A keyword scorer could not decide between the candidate document types listed',
  'in the user message — they share vocabulary. You decide by PURPOSE and LAYOUT:',
  'what the document is FOR, what a verifier would use it to prove, which form',
  'codes, titles, signatures and fields it actually carries. Never decide by a',
  'shared word.',
  '',
  'Return ONLY JSON: {"document_type": "<one candidate name VERBATIM, or NONE>",',
  '"confidence": <0..1>, "reason": "<one sentence naming the deciding feature>"}.',
  '',
  'Rules:',
  '- Pick exactly one candidate, copied verbatim, or NONE if the document is none of them.',
  '- confidence 0.85+ only when a distinctive feature is present (a form code, the',
  '  document\'s own title, its characteristic fields). 0.6–0.85 when the purpose is',
  '  clear but the layout is unusual or the copy is poor. Below 0.6 when you are guessing.',
  '- The keyword score shown per candidate is a weak prior, not evidence.',
  '',
  'Worked distinctions (examples of the rule, not the whole rule):',
  '- A Memorandum of Incorporation is the company\'s constitution — clauses, share',
  '  classes, director powers, adopted under the Companies Act. It is NOT an',
  '  Ownership Confirmation, which states WHO holds WHAT percentage as at a date,',
  '  usually signed by an auditor or company secretary.',
  '- A confirmation-of-compliance letter (EE Act / Skills Development Act / SDL)',
  '  is a signed declaration that the entity complies. It is NOT an EMP201, which',
  '  is a SARS monthly employer return with PAYE, SDL and UIF amounts and a period.',
  '- A SETA registration certificate names the SETA and an SDL number; a CIPC',
  '  registration document names a registration number and directors.',
].join('\n');

/** Per-process cache — a re-uploaded document is not re-adjudicated. */
const cache = new Map<string, TypeAdjudication | null>();

function cacheKey(filename: string, content: string, candidates: AdjudicationCandidate[]): string {
  let h = 0;
  const s = `${filename}|${candidates.map((c) => c.name).join('|')}|${content}`;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `${h}:${content.length}:${candidates.length}`;
}

/** The matrix's purpose text for a type, when it is a matrix type. */
function matrixPurpose(name: string): { description: string; expectedFields: string[] } | null {
  const lower = name.trim().toLowerCase();
  const doc = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.name.toLowerCase() === lower);
  if (!doc) return null;
  return { description: doc.auditorTests, expectedFields: doc.expectedFields };
}

/**
 * Enrich the caller's candidates with the matrix's purpose text where the
 * ontology description is only the name (matrix types deliberately keep their
 * description short for the lexical scorer — see matrix_ontology.ts).
 */
export function describeCandidates(candidates: AdjudicationCandidate[]): AdjudicationCandidate[] {
  return candidates.map((c) => {
    const purpose = matrixPurpose(c.name);
    const thinDescription = !c.description || c.description.trim().toLowerCase() === c.name.trim().toLowerCase();
    return {
      ...c,
      description: purpose && thinDescription ? purpose.description : c.description,
      expectedFields: c.expectedFields.length > 0 ? c.expectedFields : purpose?.expectedFields ?? [],
    };
  });
}

function menu(candidates: AdjudicationCandidate[]): string {
  return candidates
    .map((c, i) => {
      const fields = c.expectedFields.slice(0, 10).join(', ');
      return [
        `${i + 1}. "${c.name}" [${c.pillar}] (keyword score ${c.lexicalConfidence.toFixed(2)})`,
        `   For: ${c.description.replace(/\s+/g, ' ').slice(0, 320)}`,
        fields ? `   Typically contains: ${fields}` : null,
      ].filter(Boolean).join('\n');
    })
    .join('\n');
}

/**
 * Adjudicate one document against its shortlist with the given model.
 * Exported with the model injected so tests can drive it with a fake.
 */
export async function adjudicateDocumentType(
  model: ExtractionModel,
  input: AdjudicationInput,
  rawCandidates: AdjudicationCandidate[],
): Promise<TypeAdjudication | null> {
  const candidates = describeCandidates(rawCandidates.slice(0, 6));
  if (candidates.length === 0) return null;
  const content = String(input.markdown?.trim() || input.raw_text || '').slice(0, ADJUDICATE_CHARS);
  if (content.trim().length < 20) return null;

  const key = cacheKey(input.filename, content, candidates);
  if (cache.has(key)) return cache.get(key) ?? null;

  const user = [
    `DOCUMENT: ${input.filename}`,
    '',
    'CANDIDATE DOCUMENT TYPES:',
    menu(candidates),
    '',
    'DOCUMENT CONTENT:',
    content,
  ].join('\n');

  let reply: string;
  try {
    reply = await model.complete(SYSTEM_PROMPT, user);
  } catch (err) {
    logger.warn('Type adjudication failed — lexical classification stands', {
      file: input.filename, reason: (err as Error).message,
    });
    cache.set(key, null);
    return null;
  }

  const parsed = parseModelJson(reply);
  const picked = String(parsed?.document_type ?? '').trim();
  const match = candidates.find((c) => c.name.toLowerCase() === picked.toLowerCase());
  const confidenceRaw = Number(parsed?.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
  const reason = String(parsed?.reason ?? '').trim().slice(0, 300);

  if (!parsed || !match || picked.toUpperCase() === 'NONE' || confidence < ADJUDICATION_FLOOR) {
    logger.info('Type adjudication declined', { file: input.filename, picked: picked || null, confidence });
    cache.set(key, null);
    return null;
  }

  const result: TypeAdjudication = { documentType: match.name, confidence, reason };
  cache.set(key, result);
  logger.info('Document type adjudicated by model', {
    file: input.filename, documentType: match.name, confidence, reason,
  });
  return result;
}

/**
 * The adjudicator to hand ParserService in production: the configured
 * extraction model, or undefined when there is none (the deterministic
 * pipeline then runs exactly as before, minus the discard gate).
 */
export function modelTypeAdjudicator(model: ExtractionModel | null = getExtractionModel()): DocumentTypeAdjudicator | undefined {
  if (!model || !modelClassificationEnabled()) return undefined;
  return (input, candidates) => adjudicateDocumentType(model, input, candidates);
}

/** Test seam. */
export function resetAdjudicationCacheForTest(): void {
  cache.clear();
}
