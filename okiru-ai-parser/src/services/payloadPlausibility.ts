/**
 * Is the calculator payload PLAUSIBLE as a set — not field by field, but as a
 * case an analyst would sign?
 *
 * Extraction verifies each value against its own document (grounding,
 * checksums). What nothing verified until now is the relationships BETWEEN
 * values, and that is where the expensive failures live: Thandanani arrived
 * with `procurement.tmps = 23` — the ROW COUNT of an earlier supplier
 * schedule, not a Rand amount — while the supplier rows beside it summed to
 * R3.17m. Every downstream ratio divided by 23, clamped to full marks, and
 * handed the whole Preferential Procurement pillar over. A person looking at
 * the same page would have said "23 is not a procurement total" in a second.
 *
 * That check is arithmetic, so the INVARIANTS here are code, not model calls:
 * a total can never be smaller than one of its own parts. What the model adds
 * — when one is available — is the analyst's next sentence: WHAT the figure
 * probably is (a count, an R'000 figure, a percentage), read from the source
 * excerpt it came from. The suggestion goes into the finding text for a human;
 * it is never applied to the payload. Findings are attached to the DOCUMENT
 * that supplied the figure, so the upload reveal shows them with provenance.
 */
import { createLogger } from '../logger.js';
import type { ExtractionModel } from './aiExtraction.js';
import {
  decisionFingerprint,
  rememberDecision,
} from './semanticDecisionCache.js';

const logger = createLogger('PayloadPlausibility');

export interface PlausibilityFinding {
  /** Calculator key the finding is about. */
  key: string;
  /** File that supplied the implausible value — where the flag is attached. */
  sourceFile: string;
  /** The finding, in analyst language, with figures. */
  message: string;
}

interface CalculatorEntryLike {
  key: string;
  value: unknown;
  sourceFiles: string[];
}

interface ExtractionLike {
  sourceFile: string;
  values: Array<{ field: string; value: unknown }>;
}

const rand = (n: number) => `R${Math.round(n).toLocaleString('en-ZA')}`;

/** Sum + max of the supplier schedule's spend column, across all extractions. */
function supplierSpendStats(extractions: ExtractionLike[]): { sum: number; largest: number; rows: number } {
  let sum = 0;
  let largest = 0;
  let rows = 0;
  for (const extraction of extractions) {
    for (const value of extraction.values) {
      if (value.field !== 'supplier_rows' || !Array.isArray(value.value)) continue;
      for (const row of value.value as Array<Record<string, unknown>>) {
        const spend = Number(row.claimed_spend_ex_vat ?? row.amount_ex_vat ?? row.spend ?? 0);
        if (!Number.isFinite(spend) || spend <= 0) continue;
        sum += spend;
        largest = Math.max(largest, spend);
        rows += 1;
      }
    }
  }
  return { sum, largest, rows };
}

/**
 * The deterministic invariants. Pure, synchronous, always on.
 */
export function payloadInvariantFindings(
  entries: CalculatorEntryLike[],
  extractions: ExtractionLike[],
): PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];

  const tmpsEntry = entries.find((entry) => entry.key === 'procurement.tmps');
  const tmps = Number(tmpsEntry?.value);
  if (tmpsEntry && Number.isFinite(tmps) && tmps > 0) {
    const { sum, largest, rows } = supplierSpendStats(extractions);
    // A single supplier's measured spend cannot exceed the measured total. The
    // schedule's SUM is deliberately not compared — Codes-excluded rows (loans,
    // levies) sit in schedules but not in TMPS, so genuine workbooks run a few
    // percent over (Lake Trading: 1.6%). The 2x margin keeps borderline
    // legitimate cases out; a real misplacement is orders of magnitude off.
    if (rows > 0 && largest > tmps * 2) {
      findings.push({
        key: 'procurement.tmps',
        sourceFile: tmpsEntry.sourceFiles[0] ?? '',
        message:
          `Total Measured Procurement Spend was read as ${rand(tmps)}, but the supplier schedule it must contain ` +
          `has ${rows} rows summing to ${rand(sum)} (largest single supplier ${rand(largest)}). ` +
          `The figure is misplaced or mis-scaled${rows === tmps ? ` — it equals the schedule's ROW COUNT` : ''}, ` +
          `so Preferential Procurement will score 0 until the real TMPS is entered in the workbook.`,
      });
    }
  }

  return findings;
}

const UNIT_READING_PROMPT = [
  'You are reading ONE figure from a South African financial document excerpt.',
  'Answer what the figure most likely IS in its source context.',
  'Return ONLY a JSON object: {"reading": "<one of: rand | thousands_of_rand | millions_of_rand | count | percentage | unknown>", "why": "<one short sentence quoting the evidence>"}.',
  'If the excerpt does not settle it, use "unknown". Never guess.',
].join('\n');

/**
 * Ask the model what an implausible figure probably is, from the text around
 * it. Cached by (key, figure, excerpt) so the same document answers the same
 * way on every replica; every failure returns null and the finding ships
 * without the suggestion.
 */
export async function explainImplausibleFigure(
  model: ExtractionModel | null,
  params: { key: string; figure: number; excerpt: string },
): Promise<string | null> {
  if (!model || !params.excerpt.trim()) return null;
  const fingerprint = decisionFingerprint([
    'figure-reading',
    params.key,
    String(params.figure),
    params.excerpt.slice(0, 2000),
  ]);
  try {
    const decision = await rememberDecision<{ reading: string; why: string }>(
      'figure-reading',
      fingerprint,
      async () => {
        // Reading a figure's meaning from context is a judgment question —
        // worth the reasoning tier.
        const think = model.completeHard?.bind(model) ?? model.complete.bind(model);
        const reply = await think(
          UNIT_READING_PROMPT,
          `FIGURE: ${params.figure} (extracted as "${params.key}")\n\nEXCERPT:\n${params.excerpt.slice(0, 2000)}`,
        );
        const start = reply.indexOf('{');
        const end = reply.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        const parsed = JSON.parse(reply.slice(start, end + 1)) as { reading?: unknown; why?: unknown };
        const reading = typeof parsed.reading === 'string' ? parsed.reading.trim() : '';
        const allowed = ['rand', 'thousands_of_rand', 'millions_of_rand', 'count', 'percentage', 'unknown'];
        if (!allowed.includes(reading) || reading === 'unknown') return null;
        return { reading, why: typeof parsed.why === 'string' ? parsed.why : '' };
      },
    );
    if (!decision.value) return null;
    const label: Record<string, string> = {
      rand: 'a Rand amount',
      thousands_of_rand: "an R'000 figure (multiply by 1,000)",
      millions_of_rand: 'a figure in millions of Rand',
      count: 'a COUNT, not an amount',
      percentage: 'a percentage, not an amount',
    };
    return ` In the source it reads as ${label[decision.value.reading]} — ${decision.value.why}`.trimEnd();
  } catch (err) {
    logger.warn('Figure-reading ask failed — finding ships without the suggestion', {
      key: params.key,
      reason: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** The text around the first occurrence of `figure` in `markdown`. */
export function excerptAround(markdown: string, figure: number, radius = 400): string {
  const needle = String(figure);
  const at = markdown.indexOf(needle);
  if (at < 0) return '';
  return markdown.slice(Math.max(0, at - radius), at + needle.length + radius);
}
