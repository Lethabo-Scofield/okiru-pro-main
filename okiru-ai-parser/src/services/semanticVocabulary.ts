/**
 * Map a document's OWN wording onto a closed vocabulary — the model decides
 * what a label MEANS, the code decides what it SCORES.
 *
 * WHY THIS EXISTS
 *
 * Contribution types were classified by substring: `t.includes("grant")`,
 * `t.includes("loan")`, and an else-branch that returned "direct_cost" for
 * everything left over. direct_cost is recognised at 100%, so every label the
 * substring rules did not anticipate — "Bursary", "School feeding scheme",
 * "Donation in kind", "Sponsorship" — was silently scored in full. That default
 * is now an abstention, which is honest but blunt: a real bursary should score,
 * and under substring rules it never will, because nobody thought to add
 * `includes("bursary")`.
 *
 * This is the gap between the parser and a person reading the same page. A
 * person does not pattern-match "grant"; they know a bursary is a grant and a
 * payment holiday is not. So ask the model that question — once — and then
 * apply its answer deterministically to every row.
 *
 * THE SPLIT OF LABOUR, WHICH IS THE WHOLE POINT
 *
 *   - The model answers ONE small, closed question: "for each of these labels,
 *     which of these N canonical categories is it, or none?" It never sees an
 *     amount, never picks a benefit factor, never computes a score.
 *   - The code owns the vocabulary, the factors and the arithmetic. A label the
 *     model cannot place stays unplaced and scores nothing — the abstention is
 *     preserved, it just stops catching labels that were only ever unfamiliar.
 *
 * DETERMINISM
 *
 * Answers are cached by a fingerprint of (vocabulary + labels), through the same
 * `rememberDecision` store the sheet-column mapper uses. Two uploads carrying the
 * same wording resolve identically, on either replica, and a considered "none"
 * is remembered rather than re-rolled. gpt-5 deployments reject a temperature
 * override, so caching the decision is what makes it stable.
 *
 * FAIL-SAFE
 *
 * No model configured, a transient error, or a reply that is not usable all
 * return an EMPTY map. Empty means "nothing recognised", which lands on the
 * abstention — never on a guess, and never on the old 100% default.
 */
import { createLogger } from '../logger.js';
import type { ExtractionModel } from './aiExtraction.js';
import {
  decisionFingerprint,
  rememberDecision,
  type RememberedDecision,
} from './semanticDecisionCache.js';

const logger = createLogger('SemanticVocabulary');

/** How many distinct labels we will classify in one ask. */
const MAX_LABELS = 60;

const SYSTEM_PROMPT = [
  'You classify short labels from a South African B-BBEE workbook onto a fixed vocabulary.',
  'Return ONLY a JSON object mapping each label EXACTLY as given to one vocabulary term.',
  'Rules:',
  '- Use only the vocabulary terms provided. Never invent a term.',
  '- Match on MEANING, not on shared words. A "bursary" is a grant; a',
  '  "payment holiday" is not a grant even though both involve money.',
  '- If a label does not clearly belong to any term, map it to null.',
  '  A wrong classification scores real points against a company, so null is',
  '  the correct answer whenever you are unsure.',
  '- Do not explain. Return the JSON object and nothing else.',
].join('\n');

/** Recover the outermost JSON object from a reply that may carry prose. */
function parseObject(reply: string): Record<string, unknown> | null {
  const trimmed = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const attempt = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const direct = attempt(trimmed);
  if (direct) return direct;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? attempt(trimmed.slice(start, end + 1)) : null;
}

export interface VocabularyMapping {
  /** Raw label (as it appeared) → canonical vocabulary term. */
  resolved: Record<string, string>;
  /** Labels the model considered and could not place. Reported, never guessed. */
  unresolved: string[];
}

/**
 * Ask which vocabulary term each unfamiliar label means.
 *
 * `labels` should already exclude anything the deterministic rules matched —
 * there is no reason to spend a model call re-deciding "Grant".
 */
export async function mapLabelsToVocabulary(
  model: ExtractionModel | null,
  params: {
    /** The closed set of canonical terms the code knows how to score. */
    vocabulary: string[];
    /** Distinct raw labels that the deterministic rules could not place. */
    labels: string[];
    /** What one label describes, so the model has context ("a B-BBEE contribution type"). */
    what: string;
    /** Cache namespace, so contribution types and, later, other vocabularies do not collide. */
    kind: string;
  },
): Promise<VocabularyMapping> {
  const empty: VocabularyMapping = { resolved: {}, unresolved: [...new Set(params.labels)] };

  const labels = [...new Set(params.labels.map((l) => l.trim()).filter(Boolean))].slice(0, MAX_LABELS);
  if (!model || labels.length === 0 || params.vocabulary.length === 0) return empty;

  const vocabulary = [...params.vocabulary].sort();
  const fingerprint = decisionFingerprint([
    'vocab',
    params.kind,
    vocabulary.join(','),
    ...[...labels].sort(),
  ]);

  const user = [
    `WHAT ONE LABEL DESCRIBES: ${params.what}`,
    `\nVOCABULARY (use only these): ${vocabulary.join(', ')}`,
    `\nLABELS TO CLASSIFY (return every one of these keys):`,
    ...labels.map((l) => `- ${l}`),
  ].join('\n');

  let decision: RememberedDecision<Record<string, string | null>>;
  try {
    decision = await rememberDecision<Record<string, string | null>>(
      `vocab:${params.kind}`,
      fingerprint,
      async () => {
        // A throw here is transient and must stay uncached. A reply that places
        // nothing is a real decision and is remembered.
        const reply = await model.complete(SYSTEM_PROMPT, user);
        const parsed = parseObject(reply);
        if (!parsed) return {};
        const out: Record<string, string | null> = {};
        for (const label of labels) {
          const raw = parsed[label];
          const term = typeof raw === 'string' ? raw.trim() : '';
          // The vocabulary is the authority: a term the model invented is not a
          // classification, it is a hallucination with a score attached.
          out[label] = term && vocabulary.includes(term) ? term : null;
        }
        return out;
      },
    );
  } catch (err) {
    logger.warn('Vocabulary mapping unavailable — labels stay unclassified', {
      kind: params.kind,
      labels: labels.length,
      reason: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }

  const resolved: Record<string, string> = {};
  const unresolved: string[] = [];
  for (const label of labels) {
    const term = decision.value?.[label] ?? null;
    if (term) resolved[label] = term;
    else unresolved.push(label);
  }

  if (Object.keys(resolved).length > 0) {
    logger.info('Classified labels onto the scoring vocabulary', {
      kind: params.kind,
      resolved: Object.keys(resolved).length,
      unresolved: unresolved.length,
      replayed: decision.replayed,
    });
  }

  return { resolved, unresolved };
}
