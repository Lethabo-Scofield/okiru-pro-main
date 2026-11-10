/**
 * Server-authoritative review of a draft: the impact run, line verdicts, attribution of
 * differences to the changed rules, and the calculation invariants.
 *
 * Verdicts (per fixture x pillar line):
 *   match        no difference beyond the 0.005-point tolerance
 *   deliberate   a difference explained by a changed rule (needs a justification)
 *   unexplained  a difference in a pillar no changed rule can reach  -> blocks submission
 *   missing      the line could not be calculated on one side        -> blocks submission
 */
import { runImpact, IMPACT_PILLARS, type ImpactPillar, type ImpactReport, type FixtureImpact } from '../../../../web/Toolkit/src/lib/rules/impact/runImpact';
import { buildEffectiveConfig } from '../../../../web/Toolkit/src/lib/rules/buildEffectiveConfig';
import { getRules } from '../../../../web/Toolkit/src/lib/rules/registry';
import { getAtPath } from '../../../../web/Toolkit/src/lib/rules/paths';
import { SCORECARD_SOURCES, type ScorecardId } from '../../../../web/Toolkit/src/lib/rules/scorecards';
import type { RuleOverrides, RuleDef } from '../../../../web/Toolkit/src/lib/rules/types';

export const SCORE_TOLERANCE = 0.005;

export type Verdict = 'match' | 'deliberate' | 'unexplained' | 'missing';

/** Which scorecard pillars a rule's element can legitimately move. */
const ELEMENT_PILLARS: Record<string, ImpactPillar[]> = {
  'Ownership': ['ownership'],
  'Management Control': ['managementControl'],
  'Employment Equity': ['managementControl'],
  'Skills Development': ['skillsDevelopment'],
  'Preferential Procurement': ['procurement'],
  'Enterprise & Supplier Development': ['supplierDevelopment', 'enterpriseDevelopment'],
  'Socio-Economic Development': ['socioEconomicDevelopment'],
};

export interface ChangedRule { ruleKey: string; path: string; layer: 'source' | 'calculator'; from: unknown; to: unknown; element: string }

export function changedRules(scorecardId: ScorecardId, base: RuleOverrides, proposed: RuleOverrides): ChangedRule[] {
  const out: ChangedRule[] = [];
  for (const rule of getRules(scorecardId)) {
    const layer = rule.binding.layer;
    const path = rule.binding.path;
    const shipped = getAtPath(layer === 'source' ? SCORECARD_SOURCES[scorecardId].source : SCORECARD_SOURCES[scorecardId].shipped, path);
    const a = base[layer]?.[path] ?? shipped;
    const b = proposed[layer]?.[path] ?? shipped;
    if (a !== b) out.push({ ruleKey: rule.key, path, layer, from: a, to: b, element: rule.element });
  }
  return out;
}

export interface LineVerdict {
  fixtureId: string;
  profile: string;
  pillar: ImpactPillar | 'error';
  base: number;
  proposed: number;
  delta: number;
  verdict: Verdict;
  /** Changed rules that can explain the difference. */
  attributedTo: string[];
}

export interface InvariantResult { id: string; ok: boolean; detail: string }

export interface ReviewResult {
  report: ImpactReport;
  changed: ChangedRule[];
  lines: LineVerdict[];
  counts: Record<Verdict, number>;
  /** Changed rules that produced at least one deliberate line: each needs a justification. */
  requiresAcknowledgement: string[];
  invariants: InvariantResult[];
  level1: InvariantResult;
  blocking: string[];
}

export function classifyLines(report: ImpactReport, changed: ChangedRule[]): LineVerdict[] {
  const lines: LineVerdict[] = [];
  const reachable = (pillar: ImpactPillar) => changed.filter((c) => (ELEMENT_PILLARS[c.element] ?? []).includes(pillar)).map((c) => c.ruleKey);

  for (const f of report.fixtures) {
    if (f.error) {
      lines.push({ fixtureId: f.fixtureId, profile: f.profile, pillar: 'error', base: 0, proposed: 0, delta: 0, verdict: 'missing', attributedTo: [] });
      continue;
    }
    const moved = new Map(f.pillars.map((p) => [p.pillar, p]));
    for (const pillar of IMPACT_PILLARS) {
      const p = moved.get(pillar);
      if (!p) continue; // pillar absent on this scorecard or unchanged -> nothing to review
      if (Math.abs(p.delta) <= SCORE_TOLERANCE) {
        lines.push({ fixtureId: f.fixtureId, profile: f.profile, pillar, base: p.base, proposed: p.proposed, delta: p.delta, verdict: 'match', attributedTo: [] });
        continue;
      }
      const attributed = reachable(pillar);
      lines.push({
        fixtureId: f.fixtureId, profile: f.profile, pillar, base: p.base, proposed: p.proposed, delta: p.delta,
        verdict: attributed.length ? 'deliberate' : 'unexplained', attributedTo: attributed,
      });
    }
  }
  return lines;
}

/* ------------------------------------------------------------------ invariants */

const POINTS_KEYS_BY_GROUP: Record<string, { sum: RegExp; pillar: string }> = {
  ownership: { sum: /MaxPts$/, pillar: 'ownership' },
  skills: { sum: /MaxPts$/, pillar: 'skillsDevelopment' },
  procurement: { sum: /MaxPts$/, pillar: 'preferentialProcurement' },
};

function sumGroup(source: unknown, group: string, re: RegExp): number {
  const node = (source as { targets?: Record<string, Record<string, unknown>> }).targets?.[group] ?? {};
  return Object.entries(node).filter(([k, v]) => re.test(k) && typeof v === 'number').reduce((a, [, v]) => a + (v as number), 0);
}

export function checkInvariants(scorecardId: ScorecardId, proposed: RuleOverrides, rules: readonly RuleDef[] = getRules(scorecardId)): InvariantResult[] {
  const results: InvariantResult[] = [];
  const entry = SCORECARD_SOURCES[scorecardId];
  const push = (id: string, ok: boolean, detail: string) => results.push({ id, ok, detail: ok ? 'ok' : detail });

  let cfg: ReturnType<typeof buildEffectiveConfig> | null = null;
  try {
    cfg = buildEffectiveConfig(scorecardId, proposed, { rules });
    push('config-builds', true, '');
  } catch (e) {
    push('config-builds', false, (e as Error).message);
    return results;
  }

  // Overrides build the same way empty overrides do: shipped scores unchanged with no overrides.
  const shippedOk = JSON.stringify(buildEffectiveConfig(scorecardId, { source: {}, calculator: {} })) === JSON.stringify(entry.shipped);
  push('empty-overrides-reproduce-shipped', shippedOk, 'empty overrides no longer reproduce the shipped configuration');

  // Percentages / fractions / factors stay inside their valid range.
  const ranges = rules.filter((r) => ['fraction', 'percent', 'factor'].includes(r.unit)).filter((r) => {
    const v = proposed[r.binding.layer]?.[r.binding.path];
    return typeof v === 'number' && (v < r.min || v > r.max);
  });
  push('percentages-in-range', ranges.length === 0, `out of range: ${ranges.map((r) => r.binding.path).join(', ')}`);

  // A target that is positive in the shipped rules must not be set to zero (division / unsafe fallback).
  const zeroed = rules.filter((r) => r.unit === 'fraction' || r.unit === 'percent').filter((r) => {
    const v = proposed[r.binding.layer]?.[r.binding.path];
    const shipped = getAtPath(r.binding.layer === 'source' ? entry.source : entry.shipped, r.binding.path);
    return v === 0 && typeof shipped === 'number' && shipped > 0;
  });
  push('no-target-set-to-zero', zeroed.length === 0, `would trigger a zero-target fallback: ${zeroed.map((r) => r.binding.path).join(', ')}`);

  // Indicator maxima still reconcile with the pillar maximum, exactly as the shipped config does.
  const mutated = structuredClone(entry.source) as unknown as Record<string, any>;
  for (const [path, value] of Object.entries(proposed.source ?? {})) {
    const m = /^targets\.([A-Za-z]+)\.([A-Za-z0-9_]+)$/.exec(path);
    if (m && mutated.targets?.[m[1]]) mutated.targets[m[1]][m[2]] = value;
  }
  const drift: string[] = [];
  for (const [group, meta] of Object.entries(POINTS_KEYS_BY_GROUP)) {
    const pillarMax = (entry.source.pillarConfigs as unknown as Record<string, { maxPoints?: number } | undefined>)[meta.pillar]?.maxPoints;
    if (typeof pillarMax !== 'number') continue;
    const shippedGap = sumGroup(entry.source, group, meta.sum) - pillarMax;
    const proposedGap = sumGroup(mutated, group, meta.sum) - pillarMax;
    if (Math.abs(proposedGap - shippedGap) > 1e-9) drift.push(`${group} (${shippedGap} -> ${proposedGap})`);
  }
  push('element-maxima-reconcile', drift.length === 0, `indicator points no longer reconcile with the pillar maximum: ${drift.join(', ')}`);

  // Level thresholds and recognition stay ordered and valid.
  const lt = (cfg as unknown as { levelThresholds?: Array<{ level: number; minPoints: number; recognition: number }> }).levelThresholds
    ?? entry.source.levelThresholds;
  const sorted = [...lt].sort((a, b) => a.level - b.level);
  const ordered = sorted.every((t, i) => i === 0 || (t.minPoints <= sorted[i - 1].minPoints && t.recognition <= sorted[i - 1].recognition));
  push('level-thresholds-ordered', ordered, 'level thresholds / recognition are not in order');
  push('recognition-valid', sorted.every((t) => Number.isFinite(t.recognition) && t.recognition >= 0 && t.recognition <= 200), 'a recognition value is out of range');

  // Benefit factors never exceed 100%.
  const factors = (cfg as unknown as { benefitFactors?: Array<{ factor: number }> }).benefitFactors ?? [];
  push('benefit-factors-valid', factors.every((f) => f.factor >= 0 && f.factor <= 1), 'a benefit factor is outside 0..1');

  return results;
}

/** If a fully empowered synthetic client reaches Level 1 today, it still must. */
export function level1Check(report: ImpactReport): InvariantResult {
  const full = report.fixtures.find((f) => f.profile === 'full');
  if (!full || full.error) return { id: 'level-1-reachable', ok: false, detail: 'the fully empowered fixture could not be calculated' };
  const ok = !(full.baseLevel === 1 && full.proposedLevel !== 1);
  return { id: 'level-1-reachable', ok, detail: ok ? 'ok' : `the fully empowered fixture falls from Level 1 to Level ${full.proposedLevel}` };
}

export function reviewDraft(scorecardId: ScorecardId, base: RuleOverrides, proposed: RuleOverrides): ReviewResult {
  const changed = changedRules(scorecardId, base, proposed);
  const report = runImpact(scorecardId, base, proposed);
  const lines = classifyLines(report, changed);
  const counts: Record<Verdict, number> = { match: 0, deliberate: 0, unexplained: 0, missing: 0 };
  for (const l of lines) counts[l.verdict]++;

  const requiresAcknowledgement = changed
    .filter((c) => lines.some((l) => l.verdict === 'deliberate' && l.attributedTo.includes(c.ruleKey)))
    .map((c) => c.ruleKey);
  const invariants = checkInvariants(scorecardId, proposed);
  const level1 = level1Check(report);

  const blocking: string[] = [];
  if (counts.unexplained) blocking.push(`${counts.unexplained} unexplained scoring line(s)`);
  if (counts.missing) blocking.push(`${counts.missing} missing scoring line(s)`);
  for (const i of [...invariants, level1]) if (!i.ok) blocking.push(`invariant ${i.id}: ${i.detail}`);
  return { report, changed, lines, counts, requiresAcknowledgement, invariants, level1, blocking };
}

export type { FixtureImpact };
