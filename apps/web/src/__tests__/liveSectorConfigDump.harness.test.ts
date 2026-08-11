/**
 * Dump the LIVE pillar weightings of every sector config, so the Excel-toolkit
 * comparison can be made against what the engine actually scores with.
 *
 * Why this exists: docs/toolkits/compare_all.py carried the "codebase" side of
 * the comparison as a hand-copied dict of numbers. It drifted (it still claimed
 * RCOGP QSE = 124 after the live config moved to 108), so the comparison was
 * reporting mismatches against a snapshot rather than against the engine.
 *
 * Run: SECTOR_DUMP=<path.json> npx vitest run src/__tests__/liveSectorConfigDump.harness.test.ts
 */
import { writeFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import * as configs from '../../../api/pipeline/sectorConfig';
import type { SectorConfig } from '../../../api/pipeline/sectorConfig';

const OUT = process.env.SECTOR_DUMP;
const suite = OUT ? describe : describe.skip;

const PILLARS = [
  'ownership',
  'managementControl',
  'employmentEquity',
  'skillsDevelopment',
  'preferentialProcurement',
  'supplierDevelopment',
  'enterpriseDevelopment',
  'socioEconomicDevelopment',
  'yesInitiative',
] as const;

suite('live sector config dump', () => {
  it('writes every sector\'s pillar weightings', () => {
    const out: Record<string, unknown> = {};

    for (const [name, value] of Object.entries(configs)) {
      const sc = value as SectorConfig;
      if (!sc || typeof sc !== 'object' || !('pillarConfigs' in sc) || !('sectorCode' in sc)) continue;

      const pillars: Record<string, { max: number; base: number | null; bonus: number }> = {};
      for (const p of PILLARS) {
        const pc = (sc.pillarConfigs as Record<string, { maxPoints: number; basePoints?: number } | undefined>)[p];
        if (!pc) continue;
        const base = pc.basePoints ?? null;
        pillars[p] = {
          max: pc.maxPoints,
          base,
          // Bonus is only KNOWN where the config declares basePoints. Elsewhere
          // it is reported as 0 = "not declared", never guessed.
          bonus: base == null ? 0 : Math.max(0, pc.maxPoints - base),
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = sc.targets as any;
      const mc = t?.managementControl ?? {};
      const ee = t?.employmentEquity ?? {};
      const sk = t?.skills ?? {};
      const pr = t?.procurement ?? {};
      const esd = t?.esd ?? {};

      /**
       * Target vs maximum reachable.
       *
       * `totalMaxPoints` is the DENOMINATOR the level thresholds are read
       * against. `reachable` is the highest score actually attainable once bonus
       * points are added — they are earned ON TOP of the weighting, which is why
       * a real certificate can report 102 out of 100.
       *
       * Elective sectors complicate the sum: Transport QSE measures any FOUR of
       * seven elements, so its reachable max is the four highest CAPS
       * (28+27+27+25 = 107), not the sum of all seven.
       */
      const groupSizes = (sc as { electiveGroupSizes?: Record<string, number> }).electiveGroupSizes ?? {};
      const grouped = new Map<string, number[]>();
      let ungroupedMax = 0;
      let ungroupedBase = 0;
      // Iterate the config's OWN keys, not the fixed PILLARS list — FSC
      // sub-sectors add empowermentFinancing and accessToFinancialServices, and
      // omitting them understated FSC Banks' reachable max as 105 against a
      // 132-point scorecard.
      const allPillarKeys = Object.keys(sc.pillarConfigs ?? {});
      for (const p of allPillarKeys) {
        const pc = (sc.pillarConfigs as Record<string, { maxPoints: number; basePoints?: number; chooseOneGroup?: string } | undefined>)[p];
        if (!pc || pc.maxPoints <= 0) continue;
        if (pc.chooseOneGroup) {
          if (!grouped.has(pc.chooseOneGroup)) grouped.set(pc.chooseOneGroup, []);
          grouped.get(pc.chooseOneGroup)!.push(pc.maxPoints);
        } else {
          ungroupedMax += pc.maxPoints;
          ungroupedBase += pc.basePoints ?? pc.maxPoints;
        }
      }
      let reachable = ungroupedMax;
      for (const [group, caps] of grouped) {
        const take = groupSizes[group] ?? 1;
        reachable += caps.sort((a, b) => b - a).slice(0, take).reduce((n, c) => n + c, 0);
      }
      const bonusAvailable = Object.values(pillars).reduce((n, p) => n + p.bonus, 0);

      out[name] = {
        sectorCode: sc.sectorCode,
        scorecardType: sc.scorecardType,
        totalMaxPoints: sc.totalMaxPoints,
        /** Highest attainable score including bonus. */
        reachableMax: reachable,
        /** Bonus declared across pillars (only where basePoints is set). */
        bonusAvailable,
        /** Sum of element weightings for pillars outside any elective group. */
        ungroupedBase,
        pillarSum: Object.values(pillars).reduce((n, p) => n + p.max, 0),
        pillars,
        // Flat view keyed exactly as docs/toolkits/compare_all.py expects, so the
        // Excel comparison reads the LIVE engine instead of a hand-copied dict.
        compare: {
          grand_total: sc.totalMaxPoints,
          ownership: pillars.ownership?.max ?? null,
          mc: pillars.managementControl?.max ?? null,
          ee: pillars.employmentEquity?.max ?? null,
          skills: pillars.skillsDevelopment?.max ?? null,
          pp: pillars.preferentialProcurement?.max ?? null,
          sd: pillars.supplierDevelopment?.max ?? null,
          ed: pillars.enterpriseDevelopment?.max ?? null,
          sed: pillars.socioEconomicDevelopment?.max ?? null,

          mc_board_black_pts: mc.boardBlackMaxPts ?? null,
          mc_board_bw_pts: mc.boardBWMaxPts ?? null,
          mc_exec_black_pts: mc.execBlackMaxPts ?? null,
          mc_exec_bw_pts: mc.execBWMaxPts ?? null,
          mc_other_exec_black_pts: mc.otherExecBlackMaxPts ?? null,
          mc_other_exec_bw_pts: mc.otherExecBWMaxPts ?? null,
          mc_senior_pts: mc.seniorMaxPts ?? null,
          mc_senior_bw_pts: mc.seniorBWMaxPts ?? null,
          mc_middle_pts: mc.middleMaxPts ?? null,
          mc_middle_bw_pts: mc.middleBWMaxPts ?? null,
          mc_junior_pts: mc.juniorMaxPts ?? null,
          mc_junior_bw_pts: mc.juniorBWMaxPts ?? null,
          ee_disabled_pts: ee.disabledMaxPts ?? null,

          skills_learning_pts: sk.learningProgrammesMaxPts ?? null,
          skills_bursary_pts: sk.bursaryMaxPts ?? null,
          skills_disabled_pts: sk.disabledLearningMaxPts ?? null,
          skills_learnership_pts: sk.learnershipsMaxPts ?? null,
          skills_absorption_pts: sk.absorptionMaxPts ?? null,

          pp_all_pts: pr.allSuppliersMaxPts ?? null,
          pp_qse_pts: pr.qseMaxPts ?? null,
          pp_eme_pts: pr.emeMaxPts ?? null,
          pp_bo51_pts: pr.bo51MaxPts ?? null,
          pp_bwo30_pts: pr.bwo30MaxPts ?? null,
          pp_dg_pts: pr.dgMaxPts ?? null,

          esd_sd_pts: esd.sdMaxPts ?? null,
          esd_ed_pts: esd.edMaxPts ?? null,
          esd_grad_bonus: esd.edGraduationBonus ?? null,
          esd_jobs_bonus: esd.edJobsBonus ?? null,

          sed_pts: t?.sed?.maxPts ?? null,
        },
      };
    }

    writeFileSync(OUT!, `${JSON.stringify(out, null, 2)}\n`);
    expect(Object.keys(out).length).toBeGreaterThan(10);
  });
});
