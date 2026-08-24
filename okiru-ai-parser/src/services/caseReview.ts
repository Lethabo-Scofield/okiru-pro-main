/**
 * The analyst's read of the WHOLE case — one chain-of-thought call, after
 * everything else has run.
 *
 * Every other model call in this pipeline answers a narrow question about one
 * document, one label, one figure. What none of them can do is what a person
 * does last: sit back, look at the assembled case, and ask whether it makes
 * sense as a B-BBEE submission. NPAT beside the SED schedule. A procurement
 * total beside its supplier list. A leviable amount that dwarfs revenue. The
 * misplacements that survive per-document checks are precisely the ones only
 * visible from this altitude — Thandanani's tmps=23 was grounded, typed and
 * mapped correctly, and wrong.
 *
 * WHAT THIS IS AND IS NOT
 *
 *  - It runs at the strongest reasoning tier (completeReview → completeHard →
 *    complete), because it is ONE call per case: the place chain-of-thought is
 *    affordable is exactly the place it is most useful.
 *  - It is prompted to REASON first and answer after — the answer format is a
 *    short JSON list of findings, each naming its evidence.
 *  - It is ADVISORY ONLY. Findings become exceptions on the case, attached
 *    where a reviewer sees them. It cannot add, move or edit a single payload
 *    value; every write path stays behind the declared table, the allowlist
 *    and the coercions.
 *  - It is cached by a fingerprint of the evidence it saw, so the same case
 *    reviews the same way on every replica and every retry.
 *  - Every failure — no model, bad JSON, timeout — yields an empty list, never
 *    a broken case. Off switch: PARSER_CASE_REVIEW=false.
 */
import { createLogger } from '../logger.js';
import type { ExtractionModel } from './aiExtraction.js';
import {
  decisionFingerprint,
  rememberDecision,
} from './semanticDecisionCache.js';

const logger = createLogger('CaseReview');

export function caseReviewEnabled(): boolean {
  return process.env.PARSER_CASE_REVIEW !== 'false';
}

export interface CaseReviewFinding {
  /** 'error' = would change the score if true; 'warning' = worth a look. */
  severity: 'error' | 'warning';
  /** The finding, in analyst language, naming its figures. */
  finding: string;
  /** What the reviewer should do about it. */
  fix: string;
}

const MAX_FINDINGS = 8;

function analystRole(domain: 'bbbee' | 'esg'): string {
  return domain === 'esg'
    ? 'You are a senior ESG assurance analyst reviewing an ASSEMBLED case before it is scored.'
    : 'You are a senior B-BBEE verification analyst reviewing an ASSEMBLED case before it is scored.';
}

const SYSTEM_PROMPT = [
  '{ANALYST_ROLE}',
  'You are given the extracted calculator values (with sources), the fields that could not be',
  'placed, the values documents disagreed on, and the calculator inputs still empty.',
  '',
  'Think step by step FIRST: do these numbers make sense together as one company?',
  'Check magnitudes against each other (a procurement total against its supplier schedule,',
  'training spend against the leviable amount, SED against NPAT, ownership percentages against 100).',
  'Ask what an auditor would query. Then answer.',
  '',
  'Return ONLY a JSON object: {"findings": [{"severity": "error"|"warning", "finding": "...", "fix": "..."}]}',
  'Rules:',
  `- At most ${MAX_FINDINGS} findings, most important first. An empty list is a good answer for a clean case.`,
  '- Every finding must cite the actual figures or field names it is about. No generalities.',
  '- Only findings a human can ACT on. "Data may be incomplete" is not a finding.',
  '- Do not repeat gaps the input already lists as known (unfilled keys are known; a finding about',
  '  one must say something MORE than that it is unfilled — e.g. that its value appears elsewhere).',
  '- Never propose a value to insert. Propose where the reviewer should look or what to correct.',
].join('\n');

interface CaseSummaryInput {
  payloadEntries: Array<{ key: string; value: unknown; sourceFiles: string[] }>;
  unmapped: Array<{ field: string; reason: string }>;
  needsReview: Array<{ field: string; values: unknown[] }>;
  unfilledKeys: string[];
  files: string[];
}

/** The case, flattened to the ~2 pages an analyst actually reads. */
export function summariseCase(input: CaseSummaryInput): string {
  const lines: string[] = [];
  lines.push(`FILES (${input.files.length}): ${input.files.join(' · ')}`);
  lines.push('', 'CALCULATOR VALUES:');
  for (const entry of input.payloadEntries.slice(0, 80)) {
    const value = Array.isArray(entry.value) ? `[${entry.value.length} rows]` : String(entry.value);
    lines.push(`- ${entry.key} = ${value}  (from ${entry.sourceFiles.join(', ') || 'unknown'})`);
  }
  if (input.needsReview.length > 0) {
    lines.push('', 'CONTESTED (documents disagree, excluded from scoring):');
    for (const item of input.needsReview.slice(0, 15)) {
      lines.push(`- ${item.field}: ${item.values.slice(0, 4).map(String).join(' vs ')}`);
    }
  }
  if (input.unmapped.length > 0) {
    lines.push('', `EXTRACTED BUT UNPLACED (${input.unmapped.length}):`);
    lines.push(input.unmapped.slice(0, 40).map((u) => u.field).join(', '));
  }
  if (input.unfilledKeys.length > 0) {
    lines.push('', `CALCULATOR INPUTS STILL EMPTY (known — only report if you can say more):`);
    lines.push(input.unfilledKeys.join(', '));
  }
  return lines.join('\n');
}

function parseFindings(reply: string): CaseReviewFinding[] {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1)) as { findings?: unknown };
    if (!Array.isArray(parsed.findings)) return [];
    return parsed.findings
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map((f) => ({
        severity: f.severity === 'error' ? 'error' as const : 'warning' as const,
        finding: typeof f.finding === 'string' ? f.finding.trim() : '',
        fix: typeof f.fix === 'string' ? f.fix.trim() : '',
      }))
      .filter((f) => f.finding.length > 0)
      .slice(0, MAX_FINDINGS);
  } catch {
    return [];
  }
}

/**
 * Review the assembled case. One call, strongest tier, cached, advisory.
 */
export async function reviewCase(
  model: ExtractionModel | null,
  input: CaseSummaryInput,
  options: { domain?: 'bbbee' | 'esg' } = {},
): Promise<CaseReviewFinding[]> {
  const domain = options.domain ?? 'bbbee';
  if (!model || !caseReviewEnabled()) return [];
  if (input.payloadEntries.length === 0) return [];

  const summary = summariseCase(input);
  const fingerprint = decisionFingerprint(['case-review', domain, summary]);

  try {
    const decision = await rememberDecision<CaseReviewFinding[]>(
      'case-review',
      fingerprint,
      async () => {
        const think = model.completeReview?.bind(model)
          ?? model.completeHard?.bind(model)
          ?? model.complete.bind(model);
        const findings = parseFindings(
          await think(SYSTEM_PROMPT.replace('{ANALYST_ROLE}', analystRole(domain)), summary),
        );
        logger.info('Case reviewed', { findings: findings.length });
        return findings;
      },
    );
    return decision.value ?? [];
  } catch (err) {
    logger.warn('Case review unavailable — the case ships unreviewed', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
