/**
 * Semantic field placement — the fallback for fields no one declared.
 *
 * THE PROBLEM THIS SOLVES
 *
 * `entityCalculatorMapping` decides where an extracted value belongs from a
 * hand-written table. That table is correct but finite: a field whose name
 * nobody anticipated — `bbbee_ownership_black_pct` where the table says
 * `black_ownership_percentage` — is reported `no_mapping` and never reaches a
 * pillar. Extraction found it, understood it, and then dropped it on the floor
 * because a line was missing from a list. Those orphans are what the UI ends up
 * showing as an undifferentiated pile of "values we read but did not use".
 *
 * THE SPLIT OF LABOUR IS THE SAME ONE THE SHEET MAPPER ALREADY USES
 *
 * The model answers ONE small semantic question — "which of these calculator
 * keys, if any, does the field `x` mean?" — and the CODE does everything else:
 * coercion, range checks, and the allowlist. The model never supplies a value,
 * never supplies a key that is not already allowlisted, and never overrides a
 * declared mapping. It only ever proposes a destination for something that
 * would otherwise have been discarded.
 *
 * WHY IT IS SAFE TO LET A MODEL DECIDE THIS
 *
 *  - It cannot invent a key. Every proposal is checked against the allowlist and
 *    dropped if it is not there.
 *  - It cannot invent a value. The value is the one extraction already grounded
 *    against the source document; only its DESTINATION is in question.
 *  - It cannot overrule a human. Declared mappings are applied first and are
 *    never reconsidered — this runs only on the leftovers.
 *  - It cannot silently move a score. Every semantically-placed entry is flagged
 *    `viaSemanticMapping`, so the UI can mark it for review and an auditor can
 *    see exactly which numbers got there by inference.
 *  - It cannot drift. The answer is cached per fingerprint (the set of field
 *    names asked about), so the same case maps the same way on every run — the
 *    determinism rule from semanticDecisionCache.
 *
 * With no model configured this returns nothing and the caller keeps its
 * declared-only behaviour exactly as before.
 */
import { createLogger } from '../logger.js';
import type { ExtractionModel } from './aiExtraction.js';
import { parseModelJson } from './aiExtraction.js';
import { decisionFingerprint, rememberDecision } from './semanticDecisionCache.js';

const logger = createLogger('SemanticFieldMapping');

/** One key the model is allowed to choose, as it is described to the model. */
export interface MappableKey {
  key: string;
  description: string;
}

/** The model's answer: extracted field name → allowlisted calculator key. */
export type SemanticFieldMap = Record<string, string>;

/**
 * Whether semantic placement runs at all. On by default; set
 * PARSER_SEMANTIC_MAPPING=false to fall back to declared mappings only.
 */
export function semanticMappingEnabled(): boolean {
  return process.env.PARSER_SEMANTIC_MAPPING !== 'false';
}

const SYSTEM_PROMPT = [
  'You place already-extracted data fields into a fixed set of scoring slots.',
  'You are given field names that a document extractor produced, and the ONLY',
  'slots that exist. Decide which slot each field means, if any.',
  'Rules:',
  '- Return ONLY a JSON object mapping field name -> slot key.',
  '- Use ONLY slot keys from the provided list. Never invent one.',
  '- OMIT a field entirely when no slot clearly means the same thing.',
  '- Match on MEANING, not on wording. `bbbee_ownership_black_pct` and',
  '  `black_ownership_percentage` are the same fact.',
  '- Be conservative. A wrong slot corrupts a published compliance score, and a',
  '  field left out is merely reported to a human for review. When two slots',
  '  could fit, or you are unsure, omit the field.',
  '- Never map a field to a slot that means a DIFFERENT unit or denominator.',
  '  A payroll base is not training spend; a total is not a percentage.',
].join('\n');

function userPrompt(fields: string[], keys: MappableKey[], context?: string): string {
  return [
    context ? `CONTEXT: these fields came from ${context}.` : '',
    '\nFIELDS TO PLACE:',
    ...fields.map((field) => `- ${field}`),
    '\nAVAILABLE SLOTS (key — meaning):',
    ...keys.map((k) => `- ${k.key} — ${k.description}`),
    '\nReturn the JSON object now. Omit any field you are not confident about.',
  ].filter(Boolean).join('\n');
}

/**
 * Ask which calculator key each unmapped field means.
 *
 * Returns only proposals that survive validation: the field was actually asked
 * about, and the key is one of the offered keys. A model that answers with
 * anything else is ignored rather than trusted.
 *
 * Never throws into the extraction path — a failure here leaves the fields
 * unmapped, exactly as they already were.
 */
export async function proposeFieldMappings(
  model: ExtractionModel | null,
  fields: string[],
  keys: MappableKey[],
  options: { context?: string } = {},
): Promise<SemanticFieldMap> {
  if (!model || !semanticMappingEnabled()) return {};
  const askable = [...new Set(fields.filter((f) => f && f.trim()))].sort();
  if (askable.length === 0 || keys.length === 0) return {};

  const allowed = new Set(keys.map((k) => k.key));
  // Fingerprint the QUESTION, not the case: the same set of orphan fields
  // against the same slots must always get the same answer.
  const fingerprint = decisionFingerprint([
    'semantic-field-map-v1',
    options.context,
    askable.join(','),
    keys.map((k) => k.key).sort().join(','),
  ]);

  try {
    const decision = await rememberDecision<SemanticFieldMap>('field-map', fingerprint, async () => {
      const reply = await model.complete(SYSTEM_PROMPT, userPrompt(askable, keys, options.context));
      const parsed = parseModelJson(reply);
      if (!parsed) return null;

      const accepted: SemanticFieldMap = {};
      for (const [field, key] of Object.entries(parsed)) {
        if (!askable.includes(field)) continue;      // not a field we asked about
        if (typeof key !== 'string') continue;
        if (!allowed.has(key)) {
          logger.warn('Ignored a semantic mapping to a key that is not on the allowlist', { field, key });
          continue;
        }
        accepted[field] = key;
      }
      // A considered "nothing maps" is a real answer and worth remembering.
      return accepted;
    });

    const map = decision.value ?? {};
    if (Object.keys(map).length > 0) {
      logger.info('Semantic mapping placed fields the declared table did not cover', {
        placed: Object.keys(map).length,
        asked: askable.length,
        replayed: decision.replayed,
      });
    }
    return map;
  } catch (err) {
    // Transient model/cache failure: leave them unmapped rather than fail the case.
    logger.warn('Semantic field mapping unavailable — leaving fields unmapped', {
      reason: (err as Error).message,
      asked: askable.length,
    });
    return {};
  }
}
