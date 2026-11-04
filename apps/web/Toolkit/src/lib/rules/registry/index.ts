/**
 * Typed rule registry for the nine Studio scorecards.
 *
 * Every rule is a numeric leaf of the scorecard's SOURCE SectorConfig (`targets.*`,
 * `benefitFactors[...]`, `levelThresholds[...]`), enumerated by walking the shipped
 * object so the registry can never list a path that does not exist. Units, bounds
 * and editability come from the suffix conventions the source files already use
 * (`...Target` fraction, `...Percent` percent, `...MaxPts`/`...Bonus` points).
 *
 * Unwired leaves (paths the scorecard's converter ignores) are excluded through
 * UNWIRED_SOURCE_PATHS, which the registry tests keep honest in both directions.
 */
import { SCORECARD_IDS, SCORECARD_SOURCES, type ScorecardId } from '../scorecards';
import { UNWIRED_SOURCE_PATHS } from './unwired';
import { NO_SCORE_EFFECT } from './noScoreEffect';
import { getAtPath } from '../paths';
import type { RuleDef, RuleUnit, Editability } from '../types';

const ELEMENT_BY_GROUP: Record<string, { element: string; lines: string }> = {
  ownership: { element: 'Ownership', lines: 'Ownership' },
  managementControl: { element: 'Management Control', lines: 'Management Control' },
  employmentEquity: { element: 'Employment Equity', lines: 'Management Control' },
  skills: { element: 'Skills Development', lines: 'Skills Development' },
  procurement: { element: 'Preferential Procurement', lines: 'Preferential Procurement' },
  esd: { element: 'Enterprise & Supplier Development', lines: 'Enterprise & Supplier Development' },
  sed: { element: 'Socio-Economic Development', lines: 'Socio-Economic Development' },
};

function classify(key: string): { unit: RuleUnit; min: number; max: number; editability: Editability } {
  if (/Percent$/.test(key)) return { unit: 'percent', min: 0, max: 100, editability: 'expert' };
  if (/Target$/.test(key)) return { unit: 'fraction', min: 0, max: 1, editability: 'expert' };
  if (/(MaxPts|Pts|Bonus|maxPts)$/.test(key)) return { unit: 'points', min: 0, max: 50, editability: 'developer' };
  return { unit: 'points', min: 0, max: 100, editability: 'developer' };
}

function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((w) => (w === 'BW' ? 'Black Women' : w === 'EI' ? 'Economic Interest' : w === 'Pts' || w === 'pts' ? 'points' : w === 'Max' ? 'maximum' : w))
    .join(' ');
  return words.replace(/^./, (c) => c.toUpperCase()).replace(/maximum points/i, 'maximum points');
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function makeRule(
  scorecardId: ScorecardId, path: string, element: string, category: string, label: string,
  help: string, c: { unit: RuleUnit; min: number; max: number; editability: Editability },
): RuleDef {
  return {
    key: `${scorecardId}:source:${path}`,
    scorecardId,
    element,
    category,
    label,
    help,
    type: 'number',
    unit: c.unit,
    min: c.min,
    max: c.max,
    binding: { layer: 'source', path },
    editability: c.editability,
    affectedLines: [`${element}: ${label}`],
    rulings: [`Default for ${SCORECARD_SOURCES[scorecardId].label}`],
    invariants: [
      'value-within-bounds',
      ...(c.unit === 'points' ? ['pillar-points-do-not-exceed-pillar-maximum'] : []),
      ...(c.unit === 'fraction' || c.unit === 'percent' ? ['target-achievable'] : []),
    ],
  };
}

function build(scorecardId: ScorecardId): RuleDef[] {
  const { source } = SCORECARD_SOURCES[scorecardId];
  const rules: RuleDef[] = [];
  const unwired = UNWIRED_SOURCE_PATHS[scorecardId] ?? [];

  for (const [group, meta] of Object.entries(ELEMENT_BY_GROUP)) {
    const node = (source.targets as unknown as Record<string, unknown>)[group];
    if (!node || typeof node !== 'object') continue;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (!isNum(value)) continue;
      const path = `targets.${group}.${key}`;
      if (unwired.includes(path)) continue;
      rules.push(makeRule(scorecardId, path, meta.element, group, humanize(key),
        `Default value ${value}.`, classify(key)));
    }
  }

  for (const bf of source.benefitFactors ?? []) {
    for (const field of ['sdFactor'] as const) {
      const value = bf[field];
      const path = `benefitFactors[contributionType=${bf.contributionType}].${field}`;
      if (!isNum(value) || unwired.includes(path)) continue;
      const label = `${humanize(bf.contributionType.replace(/_/g, ' '))} - benefit factor`;
      const help = 'Share of the contribution that counts toward the ESD target (one factor serves both supplier and enterprise development).';
      // A sector following an Empower toolkit replaces some factors after conversion (guarantees: 50%, not the
      // Codes' 3%). The number that scores is the replaced one, so that is the rule to show and to edit.
      const calcPath = `benefitFactors[type=${bf.contributionType}].factor`;
      const effective = getAtPath(SCORECARD_SOURCES[scorecardId].shipped, calcPath);
      if (isNum(effective) && effective !== value) {
        const rule = makeRule(scorecardId, calcPath, 'Enterprise & Supplier Development', 'benefitFactors', label, `${help} Default value ${effective}.`,
          { unit: 'factor', min: 0, max: 1, editability: 'expert' });
        rules.push({ ...rule, key: `${scorecardId}:calculator:${calcPath}`, binding: { layer: 'calculator', path: calcPath } });
        continue;
      }
      rules.push(makeRule(scorecardId, path, 'Enterprise & Supplier Development', 'benefitFactors', label, `${help} Default value ${value}.`,
        { unit: 'factor', min: 0, max: 1, editability: 'expert' }));
    }
  }

  // Only rules proven to move a score are offered to experts (see noScoreEffect.ts and ruleMovesScore.test.ts).
  const dead = new Set(NO_SCORE_EFFECT[scorecardId] ?? []);
  return rules.map((r) => (dead.has(r.binding.path)
    ? { ...r, editability: 'developer' as const, lockedReason: LOCKED_REASON }
    : r.editability === 'developer' ? { ...r, lockedReason: DEVELOPER_REASON } : r));
}

const LOCKED_REASON = 'The scorer does not use this number today, so changing it would change nothing. Send it to the developers to connect.';
const DEVELOPER_REASON = 'This changes how the scorecard is built, so it goes to the developers.';

const cache = new Map<ScorecardId, readonly RuleDef[]>();

export function getRules(scorecardId: ScorecardId): readonly RuleDef[] {
  let rules = cache.get(scorecardId);
  if (!rules) {
    rules = Object.freeze(build(scorecardId));
    cache.set(scorecardId, rules);
  }
  return rules;
}

/** Stable fingerprint of what a scorecard's rule set IS (keys, bindings, bounds, units). */
export async function registryHashOf(scorecardId: ScorecardId): Promise<string> {
  const { hashOf } = await import('../canonical');
  return hashOf(getRules(scorecardId).map((r) => [r.key, r.binding.layer, r.binding.path, r.unit, r.min, r.max, r.editability]));
}

export function getAllRules(): RuleDef[] {
  return SCORECARD_IDS.flatMap((id) => [...getRules(id)]);
}

export function findRule(scorecardId: ScorecardId, layer: 'source' | 'calculator', path: string): RuleDef | undefined {
  return getRules(scorecardId).find((r) => r.binding.layer === layer && r.binding.path === path);
}

/** Every candidate source path, ignoring the unwired list. Used by the registry tests. */
export function enumerateCandidateSourcePaths(scorecardId: ScorecardId): string[] {
  const saved = UNWIRED_SOURCE_PATHS[scorecardId];
  try {
    UNWIRED_SOURCE_PATHS[scorecardId] = [];
    return build(scorecardId).filter((r) => r.binding.layer === 'source').map((r) => r.binding.path);
  } finally {
    if (saved) UNWIRED_SOURCE_PATHS[scorecardId] = saved;
    else delete UNWIRED_SOURCE_PATHS[scorecardId];
  }
}
