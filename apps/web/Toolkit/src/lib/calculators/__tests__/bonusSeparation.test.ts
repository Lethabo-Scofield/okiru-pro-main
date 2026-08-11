/**
 * Guard against BONUS POINTS BEING SILENTLY MERGED INTO AN ELEMENT'S BASE WEIGHT.
 *
 * The Codes state an element's weighting and its bonus points SEPARATELY. Our
 * sector configs carry the merged cap in `maxPoints` (Transport QSE ownership 28
 * = 25 base + 3 bonus), so the ONLY thing that lets the scorecard tell the two
 * apart is the `isBonus` flag on the calculator's own sub-lines. When a
 * calculator forgets that flag two things break at once:
 *
 *   1. The reader sees "28" as the weight, contradicting the gazette they are
 *      measured against.
 *   2. The denominator inflates — an entity that earns all 25 base points reads
 *      25/28 = 89% "At Risk" when it has in fact achieved 100% of the base.
 *
 * These tests are the general detector, not a Transport point-fix:
 *   A. Any sub-line the calculator itself calls a "bonus" MUST carry isBonus.
 *   B. Where a sector declares `basePoints`, the non-bonus sub-lines must sum to
 *      exactly that — the base/bonus split has to reconcile against the config.
 *   C. Sub-lines (base + bonus) must still sum to the pillar's maxPoints cap.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateTransportQseManagement,
  calculateTransportQseEmploymentEquity,
  calculateTransportLargeManagementControl,
  calculateTransportLargeEmploymentEquity,
  calculateTransportLargeSkills,
} from '../transport';
import { calculateOwnershipScore } from '../ownership';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '../../sectors/transport-qse';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from '../../sectors/transport-generic';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '../../sectors/rcogp-generic';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '../../sectors/rcogp-qse';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '../../sectors/ict-generic';
import { ICT_QSE_CALCULATOR_CONFIG } from '../../sectors/ict-qse';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '../../sectors/agri-generic';
import { FSC_GENERIC_CALCULATOR_CONFIG } from '../../sectors/fsc-generic';
import { FSC_QSE_CALCULATOR_CONFIG } from '../../sectors/fsc-qse';
import { FSC_BANKS_CALCULATOR_CONFIG } from '../../sectors/fsc-banks';
import { FSC_LTI_CALCULATOR_CONFIG } from '../../sectors/fsc-lti';
import { FSC_STI_CALCULATOR_CONFIG } from '../../sectors/fsc-sti';
import { pillarBreakdownSubtitle, summarizeSubLines } from '../../sectors/sector-labels';
import type { CalculatorConfig } from '../../../../../shared/schema';
import { TRANSPORT_QSE, TRANSPORT_GENERIC } from '../../../../../../api/pipeline/sectorConfig';
import type { ManagementData, OwnershipData } from '../../types';

const EMPTY_MANAGEMENT: ManagementData = { id: '1', clientId: 'C-1', employees: [] };
// Weightings do not depend on the data — only scores do — so empty fixtures are
// enough to assert how each pillar's points are apportioned.
const EMPTY_SKILLS = { id: '1', clientId: 'C-1', leviableAmount: 1_000_000, trainingPrograms: [] } as never;
const EMPTY_PROCUREMENT = { id: '1', clientId: 'C-1', tmps: 1_000_000, suppliers: [] } as never;
const EMPTY_OWNERSHIP: OwnershipData = {
  id: '1',
  clientId: 'C-1',
  shareholders: [],
  companyValue: 1_000_000,
  outstandingDebt: 0,
  yearsHeld: 5,
};

type Line = { name: string; weighting: number; score: number; isBonus?: boolean };

const sum = (lines: Line[]) => lines.reduce((n, l) => n + l.weighting, 0);
const baseOf = (lines: Line[]) => sum(lines.filter((l) => !l.isBonus));
const bonusOf = (lines: Line[]) => sum(lines.filter((l) => l.isBonus));

/**
 * Every pillar that carries bonus points, as the UI actually receives it.
 * `basePoints`/`maxPoints` come from the sector config — the single source of
 * truth the sub-lines must reconcile against.
 */
const CASES: Array<{
  label: string;
  lines: Line[];
  basePoints: number;
  maxPoints: number;
}> = [
  {
    label: 'Transport QSE · Ownership',
    lines: calculateOwnershipScore(EMPTY_OWNERSHIP, TRANSPORT_QSE_CALCULATOR_CONFIG).subLines,
    basePoints: TRANSPORT_QSE.pillarConfigs.ownership.basePoints!,
    maxPoints: TRANSPORT_QSE.pillarConfigs.ownership.maxPoints,
  },
  {
    label: 'Transport QSE · Management Control',
    lines: calculateTransportQseManagement(EMPTY_MANAGEMENT, TRANSPORT_QSE_CALCULATOR_CONFIG).subLines!,
    basePoints: TRANSPORT_QSE.pillarConfigs.managementControl.basePoints!,
    maxPoints: TRANSPORT_QSE.pillarConfigs.managementControl.maxPoints,
  },
  {
    label: 'Transport QSE · Employment Equity',
    lines: calculateTransportQseEmploymentEquity(EMPTY_MANAGEMENT, TRANSPORT_QSE_CALCULATOR_CONFIG, 'Gauteng').subLines!,
    basePoints: TRANSPORT_QSE.pillarConfigs.employmentEquity!.basePoints!,
    maxPoints: TRANSPORT_QSE.pillarConfigs.employmentEquity!.maxPoints,
  },
  {
    // Transport Large declares no basePoints yet; the gazette split is
    // Ownership 24 = 22 + 2 bonus ESOP/BBOS (Transport Codes row 11).
    label: 'Transport Large · Ownership',
    lines: calculateOwnershipScore(EMPTY_OWNERSHIP, TRANSPORT_GENERIC_CALCULATOR_CONFIG).subLines,
    basePoints: 22,
    maxPoints: TRANSPORT_GENERIC.pillarConfigs.ownership.maxPoints,
  },
  {
    // MC 11 = 10 base + 1 bonus independent NEDs (Transport Codes row 31).
    label: 'Transport Large · Management Control',
    lines: calculateTransportLargeManagementControl(EMPTY_MANAGEMENT, TRANSPORT_GENERIC_CALCULATOR_CONFIG).subLines!,
    basePoints: 10,
    maxPoints: TRANSPORT_GENERIC.pillarConfigs.managementControl.maxPoints,
  },
  {
    // EE 18 = 15 base + 3 bonus EAP (Transport Codes row 43).
    label: 'Transport Large · Employment Equity',
    lines: calculateTransportLargeEmploymentEquity(EMPTY_MANAGEMENT, TRANSPORT_GENERIC_CALCULATOR_CONFIG).subLines!,
    basePoints: 15,
    maxPoints: TRANSPORT_GENERIC.pillarConfigs.employmentEquity!.maxPoints,
  },
];

/**
 * EVERY sector, EVERY pillar — the cross-sector half of the guard.
 *
 * The Transport cases above pin exact numbers because they were the reported
 * bug. These check the invariants that must hold sector-wide, so a new sector or
 * a changed weighting cannot quietly reintroduce a merged cap:
 *
 *   1. sub-lines reconcile to pillarConfigs.maxPoints (nothing phantom, nothing
 *      missing — this is what caught the MC "skilled technical" rows that
 *      carried Senior's weighting while scoring nothing);
 *   2. where the config declares basePoints, the NON-bonus lines sum to exactly
 *      it, so the declared weighting and the calculator cannot drift apart;
 *   3. no line is named "bonus" without carrying isBonus.
 */
const ALL_SECTORS: Array<[string, CalculatorConfig]> = [
  ['RCOGP Generic', RCOGP_GENERIC_CALCULATOR_CONFIG],
  ['RCOGP QSE', RCOGP_QSE_CALCULATOR_CONFIG],
  ['ICT Generic', ICT_GENERIC_CALCULATOR_CONFIG],
  ['ICT QSE', ICT_QSE_CALCULATOR_CONFIG],
  ['AgriBEE', AGRI_GENERIC_CALCULATOR_CONFIG],
  ['FSC Others', FSC_GENERIC_CALCULATOR_CONFIG],
  ['FSC QSE', FSC_QSE_CALCULATOR_CONFIG],
  ['FSC Banks', FSC_BANKS_CALCULATOR_CONFIG],
  ['FSC LTI', FSC_LTI_CALCULATOR_CONFIG],
  ['FSC STI', FSC_STI_CALCULATOR_CONFIG],
  ['Transport Large', TRANSPORT_GENERIC_CALCULATOR_CONFIG],
  ['Transport QSE', TRANSPORT_QSE_CALCULATOR_CONFIG],
];

/** The pillars this suite can build from empty fixtures, with their config key. */
function pillarLines(cfg: CalculatorConfig, sector: string): Array<[string, Line[]]> {
  const qse = cfg.sectorCode === 'TRANSPORT' && cfg.scorecardType === 'QSE';
  const large = cfg.sectorCode === 'TRANSPORT' && cfg.scorecardType !== 'QSE';
  const out: Array<[string, Line[]]> = [
    ['ownership', calculateOwnershipScore(EMPTY_OWNERSHIP, cfg).subLines],
    ['managementControl', qse
      ? calculateTransportQseManagement(EMPTY_MANAGEMENT, cfg).subLines!
      : large
        ? calculateTransportLargeManagementControl(EMPTY_MANAGEMENT, cfg).subLines!
        : calculateManagementScore(EMPTY_MANAGEMENT, cfg, 'Gauteng').subLines],
    ['skillsDevelopment', (large
      ? calculateTransportLargeSkills(EMPTY_SKILLS, cfg)
      : calculateSkillsScore(EMPTY_SKILLS, cfg, 'Gauteng')).subLines],
    ['preferentialProcurement', calculateProcurementScore(EMPTY_PROCUREMENT, cfg).subLines],
  ];
  if (qse) out.push(['employmentEquity', calculateTransportQseEmploymentEquity(EMPTY_MANAGEMENT, cfg, 'Gauteng').subLines!]);
  if (large) out.push(['employmentEquity', calculateTransportLargeEmploymentEquity(EMPTY_MANAGEMENT, cfg).subLines!]);
  void sector;
  return out as Array<[string, Line[]]>;
}

describe.each(ALL_SECTORS)('%s — every pillar reconciles', (sector, cfg) => {
  const pc = (cfg.pillarConfigs ?? {}) as Record<string, { maxPoints: number; basePoints?: number } | undefined>;

  for (const [pillar, lines] of pillarLines(cfg, sector)) {
    const declared = pc[pillar];
    if (!declared || declared.maxPoints <= 0 || !lines?.length) continue;

    it(`${pillar}: sub-lines sum to maxPoints (${declared.maxPoints})`, () => {
      expect(sum(lines)).toBeCloseTo(declared.maxPoints, 2);
    });

    it(`${pillar}: non-bonus lines sum to the declared weighting`, () => {
      // basePoints absent means "no bonus here" — then base must equal the cap.
      const expected = declared.basePoints ?? declared.maxPoints;
      expect(baseOf(lines)).toBeCloseTo(expected, 2);
    });

    it(`${pillar}: no line says "bonus" without the flag`, () => {
      expect(lines.filter((l) => /bonus/i.test(l.name) && !l.isBonus).map((l) => l.name)).toEqual([]);
    });
  }
});

describe('bonus points are separated from base weighting', () => {
  describe.each(CASES)('$label', ({ lines, basePoints, maxPoints }) => {
    it('emits sub-lines at all — a pillar with no breakdown can never show the split', () => {
      expect(lines.length).toBeGreaterThan(0);
    });

    it('tags at least one line isBonus', () => {
      expect(lines.some((l) => l.isBonus)).toBe(true);
    });

    it('base sub-lines sum to the element weighting, not the merged cap', () => {
      expect(baseOf(lines)).toBeCloseTo(basePoints, 2);
    });

    it('base + bonus sum to the pillar cap', () => {
      expect(sum(lines)).toBeCloseTo(maxPoints, 2);
      expect(bonusOf(lines)).toBeCloseTo(maxPoints - basePoints, 2);
    });
  });

  describe('what the user actually sees', () => {
    const client = {
      sectorCode: 'TRANSPORT',
      scorecardType: 'QSE',
      companySize: 'QSE',
      fscSubSector: undefined,
    } as Parameters<typeof pillarBreakdownSubtitle>[1];

    it('states Transport QSE ownership as "25 base + 3 bonus", not a merged 28', () => {
      const own = calculateOwnershipScore(EMPTY_OWNERSHIP, TRANSPORT_QSE_CALCULATOR_CONFIG);
      const subtitle = pillarBreakdownSubtitle(own.subLines, client, TRANSPORT_QSE_CALCULATOR_CONFIG);

      expect(subtitle).toContain('25 base + 3 bonus');
      expect(subtitle).not.toContain('(28 pts)');
    });

    it('reports the pillar footer weighting as base, with bonus called out separately', () => {
      const own = calculateOwnershipScore(EMPTY_OWNERSHIP, TRANSPORT_QSE_CALCULATOR_CONFIG);
      // The Ownership page footer binds to exactly this — it used to print a
      // hardcoded "25.00" for every sector regardless of the real weighting.
      expect(summarizeSubLines(own.subLines)).toMatchObject({ basePoints: 25, bonusPoints: 3 });

      const mc = calculateTransportQseManagement(EMPTY_MANAGEMENT, TRANSPORT_QSE_CALCULATOR_CONFIG);
      expect(summarizeSubLines(mc.subLines!)).toMatchObject({ basePoints: 25, bonusPoints: 2 });
    });

    it('does not turn generic-Codes base indicators into bonuses', () => {
      // The regression this guards: black-women voting rights is a BASE indicator
      // under the generic Codes. Tagging it globally (rather than per sector)
      // would have silently cut 2 points off every RCOGP client's ownership base.
      const own = calculateOwnershipScore(EMPTY_OWNERSHIP, RCOGP_GENERIC_CALCULATOR_CONFIG);
      expect(own.subLines.some((l) => l.isBonus)).toBe(false);
      expect(summarizeSubLines(own.subLines).basePoints).toBeCloseTo(25, 2);
    });
  });

  it('never labels a line "bonus" in prose without tagging it isBonus', () => {
    // The failure mode that produced this whole class of bug: a calculator names
    // the row "… (bonus)" for the reader but leaves the flag off, so the
    // scorecard has no machine-readable way to separate it.
    const untagged = CASES.flatMap(({ label, lines }) =>
      lines
        .filter((l) => /bonus/i.test(l.name) && !l.isBonus)
        .map((l) => `${label} → ${l.name}`),
    );
    expect(untagged).toEqual([]);
  });
});
