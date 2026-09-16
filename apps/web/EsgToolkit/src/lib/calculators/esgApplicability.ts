/**
 * Indicators a company cannot be scored on, and what that does to the total.
 *
 * THE RULING THIS IMPLEMENTS
 *
 * "Should not form part of total." (Q16) — and, for a climate-disclosure
 * requirement a company marks not applicable, "Excluded." (Q15)
 * — Z. Mnanzana, 14 September 2026.
 *
 * Scoring an inapplicable indicator as zero is not neutral: it marks a company
 * down for something it could never have had. A business with no food in its
 * supply chain cannot hold a food-safety supplier rating, and the toolkit was
 * charging it the points anyway. The opposite mistake was live too — a climate
 * requirement marked "N/A" scored 5 of 5, so declaring a requirement
 * inapplicable was the cheapest way to raise a score in the whole product.
 *
 * Both are the same error: treating "this does not apply" as an answer on the
 * scale, at one end or the other. It belongs off the scale. An excluded
 * indicator leaves the NUMERATOR and the DENOMINATOR together, so the
 * percentage is measured across what the company actually had to do.
 *
 * WHY EXCLUSIONS ARE NAMED, NOT SILENT
 *
 * A shrinking denominator is a strong claim — it says "you were not required to
 * do this" — so every exclusion carries the indicator, the points removed and
 * the reason, and the report prints them. A denominator that quietly moves is
 * indistinguishable from a bug, and an assurance provider will ask.
 */
import {
  SCORECARD_INDICATORS,
  esgIndicatorMaxPoints,
  type EsgScorecardPillar,
} from "@/lib/esg/esgScorecardDefinitions";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

export type EsgExclusion = {
  /** Calculator row id — `d9`. */
  key: string;
  /** Verbatim indicator label, so the report never has to look it up. */
  indicator: string;
  /** Points removed from the pillar denominator. */
  maxPoints: number;
  /** Stated in the report. Never "excluded" on its own. */
  reason: string;
};

/** The shape every pillar scorer returns. */
export type EsgPillarResult = {
  score: number;
  /** The pillar's full allocation — unchanged, so the ledger stays comparable. */
  max: number;
  /**
   * What the overall percentage divides this pillar by, after exclusions.
   *
   * It starts from the workbook's flat 100 — NOT from the pillar's point
   * allocation, which is 108 for Environmental — because that flat divisor is
   * the workbook's own definition of the overall score and changing it is a
   * different decision from the one the expert made. Exclusions come off it.
   */
  scoringDenominator: number;
  rows: Record<string, number>;
  excluded: EsgExclusion[];
};

/** Build an exclusion from the indicator ledger, so labels and points cannot drift. */
export function exclude(
  pillar: EsgScorecardPillar,
  key: string,
  reason: string,
): EsgExclusion | null {
  const def = SCORECARD_INDICATORS[pillar].find((d) => d.key === key);
  if (!def) return null;
  return { key, indicator: def.indicator, maxPoints: def.maxPoints, reason };
}

/**
 * The denominator after exclusions, floored at zero.
 *
 * A pillar where everything is excluded has an applicable maximum of 0. That is
 * a real state — a company with no applicable indicators in a pillar — and the
 * caller must render it as "not scored", never as 0%.
 */
export function applicableMaxFor(pillarMax: number, excluded: EsgExclusion[]): number {
  const removed = excluded.reduce((a, x) => a + x.maxPoints, 0);
  return Math.max(0, pillarMax - removed);
}

/* ── client-declared applicability ──────────────────────────────────────── */

/**
 * Where a client says an indicator does not apply to them.
 *
 * Cells are keyed `<pillar-letter>:<row key>` — `e:d20`, `s:d26`, `g:d9` — so a
 * declaration survives the indicator being relabelled. The value is the client's
 * REASON, because "not applicable" without a reason is not something a report
 * can print or an assurance provider can test. An empty value is not a
 * declaration; silence never removes points from the denominator.
 */
export const ESG_APPLICABILITY_SECTION = "applicability";

const PILLAR_LETTER: Record<EsgScorecardPillar, string> = {
  environmental: "e",
  social: "s",
  governance: "g",
};

export function readDeclaredExclusions(
  workbook: EsgWorkbookData | null | undefined,
  pillar: EsgScorecardPillar,
): EsgExclusion[] {
  const cells = workbook?.sections?.[ESG_APPLICABILITY_SECTION]?.cells ?? {};
  const prefix = `${PILLAR_LETTER[pillar]}:`;
  const out: EsgExclusion[] = [];
  for (const [ref, raw] of Object.entries(cells)) {
    if (!ref.startsWith(prefix)) continue;
    const reason = String(raw ?? "").trim();
    if (!reason) continue;
    const key = ref.slice(prefix.length);
    const maxPoints = esgIndicatorMaxPoints(pillar, key);
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) continue;
    const def = SCORECARD_INDICATORS[pillar].find((d) => d.key === key);
    out.push({
      key,
      indicator: def?.indicator ?? key,
      maxPoints,
      reason: `Declared not applicable by the company: ${reason}`,
    });
  }
  return out;
}

/** Merge exclusion sources, keeping one entry per indicator. */
export function mergeExclusions(...groups: (EsgExclusion | null)[][]): EsgExclusion[] {
  const byKey = new Map<string, EsgExclusion>();
  for (const group of groups) {
    for (const x of group) {
      if (x && !byKey.has(x.key)) byKey.set(x.key, x);
    }
  }
  return Array.from(byKey.values());
}
