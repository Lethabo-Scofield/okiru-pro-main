/**
 * The promise behind the Rules Studio: a rule an expert can edit really changes a score.
 *
 * For every scorecard and every registered rule, this moves the rule and re-scores the Excel-checked
 * parity companies with the real scorer. Benefit factors are also tried on a company holding one
 * contribution of that type, because most companies do not have every type.
 *
 *   - a rule offered to experts must move a score on at least one company
 *   - a rule locked in registry/noScoreEffect.ts must not, so the list cannot go stale
 *   - empty overrides must reproduce each live configuration, or a published version would silently
 *     drop the Empower toolkit methods
 *
 * Run with RULE_EFFECT_OUT=<file> to write every rule's result to a file.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { calculateScorecard } from '../../scoring/calculateScorecard';
import { buildEffectiveConfig } from '../buildEffectiveConfig';
import { SCORECARD_IDS, SCORECARD_SOURCES, type ScorecardId } from '../scorecards';
import { getRules } from '../registry';
import { NO_SCORE_EFFECT } from '../registry/noScoreEffect';
import { getAtPath } from '../paths';
import type { RuleDef } from '../types';
import { adaptToolkitCase } from '../../../test/parity/caseAdapter';
import { adaptRcogpQseToolkitCase } from '../../../test/parity/caseAdapter.rcogp_qse';
import * as ictGeneric from '../../../test/parity/caseAdapter.ict_generic';
import { adaptIctQseToolkitCase } from '../../../test/parity/caseAdapter.ict_qse';
import { adaptAgriGenericCase } from '../../../test/parity/caseAdapter.agri_generic';
import { adaptFscToolkitCase } from '../../../test/parity/caseAdapter.fsc';

const ROOT = path.resolve(__dirname, '../../../../../../../docs/toolkits/parity/expected');
const load = (dir: string, filter: (f: string) => boolean = () => true) =>
  readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.json') && filter(f))
    .map((f) => JSON.parse(readFileSync(path.join(ROOT, dir, f), 'utf8')).sampleCase);

function statesFor(id: ScorecardId): any[] {
  if (id === 'rcogp-generic') return load('.', (f) => f.startsWith('gen_')).map((c) => adaptToolkitCase(c).state);
  if (id === 'rcogp-qse') return load('rcogp_qse').map((c) => adaptRcogpQseToolkitCase(c).state);
  if (id === 'ict-generic') {
    const adapt = Object.values(ictGeneric).find((v) => typeof v === 'function' && /adapt/i.test((v as any).name)) as any;
    return load('ict_generic').map((c) => adapt(c).state);
  }
  if (id === 'ict-qse') return load('ict_qse').map((c) => adaptIctQseToolkitCase(c).state);
  if (id === 'agri-generic') return load('agri_generic').map((c) => adaptAgriGenericCase(c).state);
  const sub = ({ 'fsc-others': 'Others', 'fsc-banks': 'Banks', 'fsc-lti': 'LTI', 'fsc-sti': 'STI' } as Record<string, string>)[id];
  return load('fsc').map((c) => adaptFscToolkitCase(c).state).filter((s: any) => (s.client.fscSubSector ?? 'Others') === sub);
}

const score = (s: any, cfg: any) => calculateScorecard({ ...s, scorecard: {} as any, calculatorConfig: cfg });
const signature = (r: any) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(r)
        .filter(([, v]: any) => v && typeof v === 'object' && typeof v.score === 'number')
        .map(([k, v]: any) => [k, Math.round(v.score * 1e4) / 1e4]),
    ),
  );

/** A copy of a company whose only ESD contribution is one row of this type, small enough not to hit the cap. */
function withOnlyContribution(state: any, type: string): any | null {
  const rows = state.esd?.contributions ?? [];
  const template = rows.find((c: any) => c.category === 'supplier_development') ?? rows.find((c: any) => c.category === 'enterprise_development');
  if (!template) return null;
  const npat = Number(state.client?.npat) || 10_000_000;
  return { ...state, esd: { ...state.esd, contributions: [{ ...template, type, amount: Math.max(1000, npat * 0.001) }] } };
}

const factorType = (p: string) => /benefitFactors\[(?:contributionType|type)=([^\]]+)\]/.exec(p)?.[1] ?? null;

interface Effect { path: string; moved: number; configChanged: boolean; current: number }

function effectOf(id: ScorecardId, r: RuleDef, states: any[]): Effect {
  const src = SCORECARD_SOURCES[id];
  const { layer, path: p } = r.binding;
  const current = getAtPath(layer === 'source' ? src.source : src.shipped, p) as number;
  const alternatives = [...new Set([current * 0.5, Math.min(r.max, current * 1.5), current === 0 ? r.max / 2 : current * 0.9])]
    .filter((v) => v !== current && v >= r.min && v <= r.max);
  const type = factorType(p);
  const probes = [...states, ...(type ? states.map((s) => withOnlyContribution(s, type)).filter(Boolean) : [])];
  const base = probes.map((s) => signature(score(s, src.shipped)));
  let moved = 0;
  let configChanged = false;
  for (const v of alternatives) {
    const cfg = buildEffectiveConfig(id, { source: layer === 'source' ? { [p]: v } : {}, calculator: layer === 'calculator' ? { [p]: v } : {} });
    if (JSON.stringify(cfg) !== JSON.stringify(src.shipped)) configChanged = true;
    probes.forEach((s, i) => { if (signature(score(s, cfg)) !== base[i]) moved++; });
  }
  return { path: p, moved, configChanged, current };
}

describe('a rule an expert can edit really changes a score', () => {
  const effects = new Map<ScorecardId, Map<string, Effect>>();

  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dump: Record<string, unknown> = {};
    for (const id of SCORECARD_IDS) {
      const states = statesFor(id);
      const m = new Map(getRules(id).map((r) => [r.key, effectOf(id, r, states)]));
      effects.set(id, m);
      dump[id] = { cases: states.length, rules: getRules(id).map((r) => ({ key: r.key, editability: r.editability, unit: r.unit, ...m.get(r.key)! })) };
    }
    if (process.env.RULE_EFFECT_OUT) writeFileSync(process.env.RULE_EFFECT_OUT, JSON.stringify(dump, null, 1));
  }, 560_000);

  for (const id of SCORECARD_IDS) {
    it(`${id}: an empty change reproduces the live configuration`, () => {
      expect(JSON.stringify(buildEffectiveConfig(id, { source: {}, calculator: {} }))).toBe(JSON.stringify(SCORECARD_SOURCES[id].shipped));
    });

    it(`${id}: every rule offered to experts moves a score`, () => {
      const dead = getRules(id).filter((r) => r.editability === 'expert' && effects.get(id)!.get(r.key)!.moved === 0).map((r) => r.binding.path);
      expect(dead).toEqual([]);
    });

    it(`${id}: every rule locked for having no effect still has none`, () => {
      const list = new Set(NO_SCORE_EFFECT[id] ?? []);
      const live = getRules(id).filter((r) => list.has(r.binding.path) && effects.get(id)!.get(r.key)!.moved > 0).map((r) => r.binding.path);
      expect(live).toEqual([]);
    });
  }
});
