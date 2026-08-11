/**
 * Bonus/base audit across every sector — the fact-finding harness behind the
 * base-vs-bonus separation work.
 *
 * For each sector config it runs the REAL pillar calculators with empty
 * fixtures (weightings do not depend on data, only scores do) and reports, per
 * pillar: the declared cap, the sum of the sub-line weightings, the base/bonus
 * split derived from `isBonus`, and any line the calculator itself calls a
 * "bonus" while leaving the flag off.
 *
 * That last column is the gap list: an untagged bonus line is invisible to
 * Scorecard.tsx's bonusSplit(), so the merged cap gets printed as the element
 * weighting and the denominator inflates.
 *
 * Run: BONUS_AUDIT=<path.json> npx vitest run src/__tests__/bonusAudit.harness.test.ts --pool=forks
 */
import { writeFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { calculateOwnershipScore } from '@toolkit/lib/calculators/ownership';
import { calculateManagementScore } from '@toolkit/lib/calculators/management';
import { calculateSkillsScore } from '@toolkit/lib/calculators/skills';
import { calculateProcurementScore } from '@toolkit/lib/calculators/procurement';
import { calculateEsdScore, calculateSedScore } from '@toolkit/lib/calculators/esd-sed';
import {
  calculateTransportQseManagement,
  calculateTransportQseEmploymentEquity,
  calculateTransportLargeManagementControl,
  calculateTransportLargeEmploymentEquity,
  calculateTransportLargeSkills,
} from '@toolkit/lib/calculators/transport';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-generic';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-qse';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/ict-generic';
import { ICT_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/ict-qse';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/agri-generic';
import { FSC_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-generic';
import { FSC_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-qse';
import { FSC_BANKS_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-banks';
import { FSC_LTI_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-lti';
import { FSC_STI_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-sti';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/transport-generic';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/transport-qse';
import type { CalculatorConfig } from '../../shared/schema';

const OUT = process.env.BONUS_AUDIT;
const suite = OUT ? describe : describe.skip;

type Line = { name: string; weighting: number; score: number; isBonus?: boolean };

const EMPTY_OWN = {
  id: '1', clientId: 'C', shareholders: [], companyValue: 1_000_000,
  outstandingDebt: 0, yearsHeld: 5,
} as never;
const EMPTY_MGT = { id: '1', clientId: 'C', employees: [] } as never;
const EMPTY_SKILLS = { id: '1', clientId: 'C', leviableAmount: 1_000_000, trainingPrograms: [] } as never;
const EMPTY_PROC = { id: '1', clientId: 'C', tmps: 1_000_000, suppliers: [] } as never;
const EMPTY_ESD = { id: '1', clientId: 'C', contributions: [] } as never;
const EMPTY_SED = { id: '1', clientId: 'C', contributions: [] } as never;

const CONFIGS: Array<[string, CalculatorConfig]> = [
  ['RCOGP_GENERIC', RCOGP_GENERIC_CALCULATOR_CONFIG],
  ['RCOGP_QSE', RCOGP_QSE_CALCULATOR_CONFIG],
  ['ICT_GENERIC', ICT_GENERIC_CALCULATOR_CONFIG],
  ['ICT_QSE', ICT_QSE_CALCULATOR_CONFIG],
  ['AGRI_GENERIC', AGRI_GENERIC_CALCULATOR_CONFIG],
  ['FSC_GENERIC', FSC_GENERIC_CALCULATOR_CONFIG],
  ['FSC_QSE', FSC_QSE_CALCULATOR_CONFIG],
  ['FSC_BANKS', FSC_BANKS_CALCULATOR_CONFIG],
  ['FSC_LTI', FSC_LTI_CALCULATOR_CONFIG],
  ['FSC_STI', FSC_STI_CALCULATOR_CONFIG],
  ['TRANSPORT_GENERIC', TRANSPORT_GENERIC_CALCULATOR_CONFIG],
  ['TRANSPORT_QSE', TRANSPORT_QSE_CALCULATOR_CONFIG],
];

const isTransportQse = (n: string) => n === 'TRANSPORT_QSE';
const isTransportLarge = (n: string) => n === 'TRANSPORT_GENERIC';

function pillarsFor(name: string, cfg: CalculatorConfig): Record<string, Line[]> {
  const out: Record<string, Line[]> = {};
  const safe = (label: string, fn: () => Line[] | undefined) => {
    try {
      const lines = fn();
      if (lines && lines.length) out[label] = lines;
    } catch (e) {
      out[label] = [{ name: `ERROR: ${(e as Error).message}`, weighting: 0, score: 0 }];
    }
  };

  safe('ownership', () => calculateOwnershipScore(EMPTY_OWN, cfg).subLines as Line[]);

  if (isTransportQse(name)) {
    safe('managementControl', () => calculateTransportQseManagement(EMPTY_MGT, cfg).subLines as Line[]);
    safe('employmentEquity', () => calculateTransportQseEmploymentEquity(EMPTY_MGT, cfg, 'Gauteng').subLines as Line[]);
  } else if (isTransportLarge(name)) {
    safe('managementControl', () => calculateTransportLargeManagementControl(EMPTY_MGT, cfg).subLines as Line[]);
    safe('employmentEquity', () => calculateTransportLargeEmploymentEquity(EMPTY_MGT, cfg).subLines as Line[]);
  } else {
    safe('managementControl', () => calculateManagementScore(EMPTY_MGT, cfg, 'Gauteng').subLines as Line[]);
  }

  safe('skillsDevelopment', () =>
    (isTransportLarge(name)
      ? calculateTransportLargeSkills(EMPTY_SKILLS, cfg)
      : calculateSkillsScore(EMPTY_SKILLS, cfg, 'Gauteng')
    ).subLines as Line[]);

  safe('preferentialProcurement', () => calculateProcurementScore(EMPTY_PROC, cfg).subLines as Line[]);
  safe('supplierDevelopment', () => calculateEsdScore(EMPTY_ESD, 1_000_000, cfg).sdSubLines as Line[]);
  safe('enterpriseDevelopment', () => calculateEsdScore(EMPTY_ESD, 1_000_000, cfg).edSubLines as Line[]);
  safe('socioEconomicDevelopment', () => calculateSedScore(EMPTY_SED, 1_000_000, cfg).subLines as Line[]);

  return out;
}

suite('bonus/base audit — all sectors', () => {
  it('reports the base/bonus split and any untagged bonus lines', () => {
    const report: Record<string, unknown> = {};

    for (const [name, cfg] of CONFIGS) {
      const pillars = pillarsFor(name, cfg);
      const pc = (cfg.pillarConfigs ?? {}) as Record<string, { maxPoints?: number; basePoints?: number } | undefined>;
      const detail: Record<string, unknown> = {};

      for (const [pillar, lines] of Object.entries(pillars)) {
        const base = lines.filter((l) => !l.isBonus).reduce((n, l) => n + (l.weighting || 0), 0);
        const bonus = lines.filter((l) => l.isBonus).reduce((n, l) => n + (l.weighting || 0), 0);
        // A line the calculator itself calls a bonus but never flagged.
        const untagged = lines.filter((l) => /bonus/i.test(l.name) && !l.isBonus).map((l) => l.name);
        detail[pillar] = {
          declaredMax: pc[pillar]?.maxPoints ?? null,
          declaredBase: pc[pillar]?.basePoints ?? null,
          lineSum: Number((base + bonus).toFixed(2)),
          base: Number(base.toFixed(2)),
          bonus: Number(bonus.toFixed(2)),
          untaggedBonusLines: untagged,
          lines: lines.map((l) => ({ n: l.name, w: l.weighting, b: !!l.isBonus })),
        };
      }

      report[name] = {
        totalMaxPoints: cfg.totalMaxPoints,
        pillars: detail,
      };
    }

    writeFileSync(OUT!, `${JSON.stringify(report, null, 2)}\n`);
    expect(Object.keys(report).length).toBe(CONFIGS.length);
  });
});
