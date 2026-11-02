/**
 * The impact engine: "what does this rule change do to real-shaped scorecards?"
 *
 * For every synthetic fixture it calculates the scorecard TWICE with the one shared
 * scorer (calculateScorecard) - once under the base rules, once under the proposed
 * rules - and reports what moved. Pure and deterministic: the browser runs it in a
 * worker for instant feedback, the server runs the identical code as the authoritative
 * pre-publish check, and the two must agree (see the parity test).
 */
import { calculateScorecard } from '../../scoring/calculateScorecard';
import { buildEffectiveConfig } from '../buildEffectiveConfig';
import type { ScorecardId } from '../scorecards';
import type { RuleOverrides } from '../types';
import { buildFixtures, type Fixture } from './fixtures';
import type { ScorecardResult } from '../../types';

export const IMPACT_PILLARS = [
  'ownership', 'managementControl', 'skillsDevelopment', 'procurement',
  'supplierDevelopment', 'enterpriseDevelopment', 'socioEconomicDevelopment', 'yesInitiative',
  'empowermentFinancing', 'accessToFinancialServices',
] as const;
export type ImpactPillar = (typeof IMPACT_PILLARS)[number];

export interface PillarDelta { pillar: ImpactPillar; base: number; proposed: number; delta: number }

export interface FixtureImpact {
  fixtureId: string;
  profile: string;
  error: string | null;
  baseTotal: number;
  proposedTotal: number;
  totalDelta: number;
  baseLevel: number;
  proposedLevel: number;
  levelChanged: boolean;
  /** Only pillars whose score moved. */
  pillars: PillarDelta[];
}

export interface ImpactReport {
  scorecardId: ScorecardId;
  fixtures: FixtureImpact[];
  summary: {
    fixturesRun: number;
    fixturesChanged: number;
    levelsChanged: number;
    errors: number;
    maxAbsTotalDelta: number;
    /** Pillars that moved in at least one fixture. */
    affectedPillars: ImpactPillar[];
  };
}

const ROUND = 1e-9;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

function scoreOf(result: ScorecardResult, pillar: ImpactPillar): number | null {
  const p = (result as unknown as Record<string, { score?: number } | undefined>)[pillar];
  return p && typeof p.score === 'number' ? p.score : null;
}

export function runImpact(
  scorecardId: ScorecardId,
  base: RuleOverrides,
  proposed: RuleOverrides,
  fixtures: Fixture[] = buildFixtures(scorecardId),
): ImpactReport {
  // Building both configs also validates both override sets; a bad proposal throws here.
  const baseCfg = buildEffectiveConfig(scorecardId, base);
  const proposedCfg = buildEffectiveConfig(scorecardId, proposed);

  const out: FixtureImpact[] = fixtures.map((fx) => {
    try {
      const a = calculateScorecard({ ...fx.state, calculatorConfig: baseCfg, ignoreSubMinimum: false }, null);
      const b = calculateScorecard({ ...fx.state, calculatorConfig: proposedCfg, ignoreSubMinimum: false }, null);
      const pillars: PillarDelta[] = [];
      for (const pillar of IMPACT_PILLARS) {
        const x = scoreOf(a, pillar);
        const y = scoreOf(b, pillar);
        if (x === null || y === null) continue;
        if (Math.abs(y - x) > ROUND) pillars.push({ pillar, base: round(x), proposed: round(y), delta: round(y - x) });
      }
      return {
        fixtureId: fx.id, profile: fx.profile, error: null,
        baseTotal: round(a.total.score), proposedTotal: round(b.total.score), totalDelta: round(b.total.score - a.total.score),
        baseLevel: a.achievedLevel, proposedLevel: b.achievedLevel, levelChanged: a.achievedLevel !== b.achievedLevel,
        pillars,
      };
    } catch (e) {
      return {
        fixtureId: fx.id, profile: fx.profile, error: e instanceof Error ? e.message : String(e),
        baseTotal: 0, proposedTotal: 0, totalDelta: 0, baseLevel: 0, proposedLevel: 0, levelChanged: false, pillars: [],
      };
    }
  });

  const affected = new Set<ImpactPillar>();
  for (const f of out) for (const p of f.pillars) affected.add(p.pillar);
  return {
    scorecardId,
    fixtures: out,
    summary: {
      fixturesRun: out.length,
      fixturesChanged: out.filter((f) => f.pillars.length > 0 || Math.abs(f.totalDelta) > ROUND).length,
      levelsChanged: out.filter((f) => f.levelChanged).length,
      errors: out.filter((f) => f.error).length,
      maxAbsTotalDelta: round(Math.max(0, ...out.map((f) => Math.abs(f.totalDelta)))),
      affectedPillars: IMPACT_PILLARS.filter((p) => affected.has(p)),
    },
  };
}
