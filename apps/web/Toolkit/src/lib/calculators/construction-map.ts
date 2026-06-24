/**
 * Construction mapper — translates the Toolkit's collected pillar data into the
 * ConstructionScoringInput consumed by the verified evaluator
 * (apps/api/pipeline/constructionScoring.ts).
 *
 * UNIT RULES (the #1 wiring risk — see docs/construction-wiring-spec.md):
 *  - `percentage` / `bonus_threshold` / `eap_percentage` indicators expect a
 *    WHOLE-NUMBER percent (e.g. 30). Toolkit ownership/management rawStats are
 *    FRACTIONS 0–1, so multiply by 100.
 *  - `percentage_of_npat|leviable|tmps` indicators expect a RAW ZAR numerator
 *    (recognised spend); pass the rawStats spend directly — the engine divides.
 *  - `net_value` accepts a 0–1 (or 0–100) realisation factor.
 *
 * Indicators that need data the Toolkit doesn't yet collect (EME/QSE & 35%-women /
 * 51%-women PP recomputes, absorption, the skills count-percentages, youth /
 * professional / mentorship / industry-candidacy, and the BWO / structured-project /
 * limited-services flags) are deliberately LEFT OUT — the engine then reports them as
 * `missing_data` ("provide value"), which is correct, rather than a wrong score.
 * Phase 1 adds those inputs.
 */
import {
  type ConstructionScoringInput,
} from '../../../../../api/pipeline/constructionScoring';
import type { CalculatorConfig } from '../../../../shared/schema';
import { calculateOwnershipScore } from './ownership';
import { calculateManagementScore } from './management';
import { calculateSkillsScore } from './skills';
import { calculateProcurementScore } from './procurement';
import { calculateEsdScore, calculateSedScore } from './esd-sed';
import { resolveConstructionScorecardKey } from '../sectors/construction';

/** Convert a 0–1 fraction to a whole-number percent; undefined for non-finite. */
const toPct = (fraction: number | undefined | null): number | undefined =>
  fraction == null || !Number.isFinite(fraction) ? undefined : fraction * 100;

export function buildConstructionScoringInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any,
  cfg: CalculatorConfig,
): { entityType: string; input: ConstructionScoringInput } {
  const client = state.client ?? {};
  const subSectorRaw = String(client.constructionSubSector ?? 'Contractor');
  const subSector: 'Contractor' | 'BEP' = subSectorRaw === 'BEP' ? 'BEP' : 'Contractor';
  const entityType = resolveConstructionScorecardKey(client.scorecardType, subSectorRaw);
  const eapProvince = client.eapProvince;
  const npat = Number(client.npat ?? 0);

  // Run the Toolkit calculators purely to harvest rawStats (their points are ignored).
  const own = calculateOwnershipScore(state.ownership, cfg);
  const mgmt = calculateManagementScore(state.management, cfg, eapProvince);
  const skills = calculateSkillsScore(state.skills, cfg, eapProvince);
  const proc = calculateProcurementScore(state.procurement, cfg);
  const esd = calculateEsdScore(state.esd, npat, cfg);
  const sed = calculateSedScore(state.sed, npat, cfg);

  const o = own.rawStats;
  const m = mgmt.rawStats;
  const sk = skills.rawStats;
  const pr = proc.rawStats;

  // Combined Senior+Middle band (QSE construction) — computed from employees since
  // rawStats only exposes the bands separately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emps: any[] = Array.isArray(state.management?.employees) ? state.management.employees : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isBlack = (e: any) => e?.race && e.race !== 'White';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isBW = (e: any) => isBlack(e) && e?.gender === 'Female';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inSeniorMiddle = (e: any) => /senior|middle/i.test(String(e?.designation ?? ''));
  const sm = emps.filter(inSeniorMiddle);
  const seniorMiddleBlackPercent = sm.length > 0 ? (sm.filter(isBlack).length / sm.length) * 100 : undefined;
  const seniorMiddleBlackWomenPercent = sm.length > 0 ? (sm.filter(isBW).length / sm.length) * 100 : undefined;

  const raw: Record<string, number | boolean | undefined> = {
    // ── Ownership (fractions → ×100; net value 0–1) ──
    votingRightsBlackPercent: toPct(o.blackVotingPercentage),
    votingRightsBlackWomenPercent: toPct(o.blackWomenVotingPercentage),
    economicInterestBlackPercent: toPct(o.economicInterestPercentage),
    economicInterestBlackWomenPercent: toPct(o.economicInterestBWOPercentage),
    economicInterestDesignatedPercent: toPct(o.designatedGroupPercentage),
    netValueRealisation: Number.isFinite(o.netValuePercentage) ? o.netValuePercentage : undefined,

    // ── Management Control (fractions → ×100) ──
    boardBlackPercent: toPct(m.boardBlackPct),
    boardBlackWomenPercent: toPct(m.boardBWOPct),
    execBlackPercent: toPct(m.execBlackPct),
    execBlackWomenPercent: toPct(m.execBWOPct),
    execDirBlackPercent: toPct(m.execBlackPct),
    execDirBlackWomenPercent: toPct(m.execBWOPct),
    otherExecBlackPercent: toPct(m.otherExecBlackPct),
    otherExecBlackWomenPercent: toPct(m.otherExecBWOPct),
    seniorBlackPercent: toPct(m.seniorBlackPct),
    seniorBlackWomenPercent: toPct(m.seniorBWOPct),
    middleBlackPercent: toPct(m.middleBlackPct),
    middleBlackWomenPercent: toPct(m.middleBWOPct),
    juniorBlackPercent: toPct(m.juniorBlackPct),
    juniorBlackWomenPercent: toPct(m.juniorBWOPct),
    disabledBlackPercent: toPct(m.disabledBlackPct),
    seniorMiddleBlackPercent,
    seniorMiddleBlackWomenPercent,

    // ── Skills (RAW ZAR for _of_leviable; bursary is a within-spend ratio) ──
    skillsSpendBlackOverall: Number.isFinite(sk.blackSpend) ? sk.blackSpend : undefined,
    skillsBursariesPercent: sk.blackSpend > 0 ? (sk.bursarySpend / sk.blackSpend) * 100 : undefined,

    // ── Preferential Procurement (RAW recognised ZAR for _of_tmps) ──
    ppAllEmpoweringSpend: Number.isFinite(pr.empoweringSpend) ? pr.empoweringSpend : undefined,
    pp51BlackOwnedSpend: Number.isFinite(pr.blackOwned51Spend) ? pr.blackOwned51Spend : undefined,
    ppDesignated51Spend: Number.isFinite(pr.designatedGroupSpend) ? pr.designatedGroupSpend : undefined,

    // ── Supplier Development / SED (RAW ZAR for _of_npat) ──
    supplierDevelopmentSpend: Number.isFinite(esd.sdSpend) ? esd.sdSpend : undefined,
    sedSpend: Number.isFinite(sed.actualSpend) ? sed.actualSpend : undefined,
  };

  const indicators: Record<string, number | boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'boolean') indicators[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) indicators[k] = v;
  }

  return {
    entityType,
    input: {
      indicators,
      financials: {
        npat,
        leviableAmount: Number(client.leviableAmount ?? 0) || undefined,
        totalMeasuredProcurementSpend: Number(state.procurement?.tmps ?? 0) || undefined,
      },
      subSector,
    },
  };
}
