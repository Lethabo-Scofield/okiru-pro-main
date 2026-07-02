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

  // ── ESD/SED beneficiary-flag subsets (Phase 1) ──
  // Split the calculator's benefit-adjusted spend proportionally by the raw flagged
  // amounts so the subset uses the SAME basis as the main SD/SED indicator.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const esdContribs: any[] = Array.isArray(state.esd?.contributions) ? state.esd.contributions : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sedContribs: any[] = Array.isArray(state.sed?.contributions) ? state.sed.contributions : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sumAmt = (arr: any[], pred: (c: any) => boolean): number =>
    arr.filter(pred).reduce((s, c) => s + (Number(c?.amount) || 0), 0);

  const sdRawTotal = sumAmt(esdContribs, (c) => c?.category === 'supplier_development');
  const sdBwoRaw = sumAmt(esdContribs, (c) => c?.category === 'supplier_development' && c?.isBlackWomenOwnedBeneficiary === true);
  const supplierDevelopmentSpendBWO = sdRawTotal > 0 ? esd.sdSpend * (sdBwoRaw / sdRawTotal) : undefined;

  const sedRawTotal = sumAmt(sedContribs, () => true);
  const sedStructRaw = sumAmt(sedContribs, (c) => c?.isStructuredProject === true);
  const sedStructuredProjectsSpend = sedRawTotal > 0 ? sed.actualSpend * (sedStructRaw / sedRawTotal) : undefined;
  const sedLimitedRaw = sumAmt(sedContribs, (c) => c?.isLimitedServicesCommunity === true);
  const sedLimitedServicesPercent = sedRawTotal > 0 ? (sedLimitedRaw / sedRawTotal) * 100 : undefined;

  // ── Phase 1 derivations (from data the workbook DOES carry) ──
  const leviable = Number(client.leviableAmount ?? 0);
  // Cat A/B/C/D recognised black skills spend (from the skills calculator's own breakdown).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catBd: any[] = Array.isArray((skills as any).categoryBreakdown) ? (skills as any).categoryBreakdown : [];
  const catABCDSpend = catBd
    .filter((b) => ['A', 'B', 'C', 'D'].includes(String(b?.code)))
    .reduce((s, b) => s + (Number(b?.recognisedSpend) || 0), 0);
  // "Voting + Economic ≥ X%": achieved on BOTH iff the lower of the two reaches X.
  const bothPct = (a?: number, b?: number): number | undefined =>
    a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) ? undefined : Math.min(a, b) * 100;
  // Black-disabled skills spend as a % of total black skills spend (same cost basis).
  const blackDisabledSkillsPercent = sk.blackSpend > 0 ? (sk.disabledSpend / sk.blackSpend) * 100 : undefined;
  const absorptionPct = sk.totalBlackLearners > 0 ? (sk.absorbedCount / sk.totalBlackLearners) * 100 : undefined;

  // ── Phase 1 template-column derivations (construction-only employee/learner/ESD fields) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tps: any[] = Array.isArray(state.skills?.trainingPrograms) ? state.skills.trainingPrograms : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tpCost = (p: any): number =>
    (['courseCost', 'travelCost', 'accommodationCost', 'cateringCost', 'stationeryCost', 'facilityCost', 'trainingFacilityCost', 'salaryCost', 'otherCosts']
      .reduce((s, k) => s + (Number(p?.[k]) || 0), 0)) || Number(p?.totalCost) || Number(p?.cost) || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blackTp = (p: any) => (p?.isBlack ?? (p?.race && p.race !== 'White'));
  const blackTps = tps.filter(blackTp);
  const blackTpSpend = blackTps.reduce((s, p) => s + tpCost(p), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lvlOf = (p: any) => String(p?.learnerMgmtLevel ?? '');
  const execSrMidSpend = blackTps.filter((p) => /exec|senior|middle/i.test(lvlOf(p))).reduce((s, p) => s + tpCost(p), 0);
  const juniorSpend = blackTps.filter((p) => /junior/i.test(lvlOf(p))).reduce((s, p) => s + tpCost(p), 0);
  const blackEmps = emps.filter(isBlack);
  const profRegCount = emps.filter((e) => isBlack(e) && e?.professionallyRegistered === true).length;
  const youthCount = emps.filter((e) => isBlack(e) && e?.isYouthEmployee === true).length;
  const industryRegCount = blackTps.filter((p) => p?.industryRegistered === true).length;
  const mentoredCount = blackTps.filter((p) => p?.mentorship === true).length;
  const mentorPromotedCount = blackTps.filter((p) => p?.mentorshipPromotion === true).length;
  const pct = (n: number, d: number): number | undefined => (d > 0 ? (n / d) * 100 : undefined);

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
    // EME/QSE recognised spend from suppliers[].enterpriseType (Phase 1, no new input).
    ppEmeSpend: Number.isFinite(pr.spendEME) ? pr.spendEME : undefined,
    ppQseSpend: Number.isFinite(pr.spendQSE) ? pr.spendQSE : undefined,

    // ── Supplier Development / SED (RAW ZAR for _of_npat) ──
    supplierDevelopmentSpend: Number.isFinite(esd.sdSpend) ? esd.sdSpend : undefined,
    sedSpend: Number.isFinite(sed.actualSpend) ? sed.actualSpend : undefined,

    // ── ESD/SED beneficiary-flag subsets (Phase 1) ──
    supplierDevelopmentSpendBWO,
    sedStructuredProjectsSpend,
    sedLimitedServicesPercent,

    // ── Phase 1: construction-specific inputs DERIVED from workbook data ──
    // Ownership new entrants (economic interest fraction → percent).
    newEntrantsPercent: toPct(o.newEntrantEIPercentage),
    // QSE combined voting+economic bonus thresholds.
    votingAndEconomicBlackPercent: bothPct(o.blackVotingPercentage, o.economicInterestPercentage),
    votingAndEconomicBlackWomenPercent: bothPct(o.blackWomenVotingPercentage, o.economicInterestBWOPercentage),
    // Skills: secondary tier reuses the recognised black spend; disabled / Cat-ABCD /
    // absorption computed on the calculator's own basis.
    skillsSpendBlackSecondary: Number.isFinite(sk.blackSpend) ? sk.blackSpend : undefined,
    skillsSpendBlackDisabledPercent: blackDisabledSkillsPercent,
    skillsDisabilitiesProgrammesPercent: blackDisabledSkillsPercent,
    skillsCatABCDPercent: leviable > 0 ? (catABCDSpend / leviable) * 100 : undefined,
    absorptionPercent: absorptionPct,
    // PP from ≥35% / ≥51% black-women-owned suppliers (recognised ZAR).
    pp35BlackWomenOwnedSpend: Number.isFinite(pr.blackWomen35Spend) ? pr.blackWomen35Spend : undefined,
    ppBlackWomen51Spend: Number.isFinite(pr.blackWomen51Spend) ? pr.blackWomen51Spend : undefined,

    // ── Phase 1 template columns: only score when the workbook carries the data ──
    // Employees: professional registration + youth.
    blackProfessionalsPercent: pct(profRegCount, emps.length),
    professionalRegistrationPercent: pct(profRegCount, blackEmps.length),
    blackYouthPercent: pct(youthCount, emps.length),
    // Skills: industry-body registration, black-management by level, mentorship.
    skillsIndustryCandidatesPercent: pct(industryRegCount, blackTps.length),
    industryRegistrationPercent: pct(industryRegCount, blackTps.length),
    skillsBlackMgmtExecSeniorMiddlePercent: pct(execSrMidSpend, blackTpSpend),
    skillsBlackMgmtJuniorPercent: pct(juniorSpend, blackTpSpend),
    mentorshipProgrammeImplemented: mentoredCount > 0 ? true : undefined,
    mentorshipPromotionPercent: pct(mentorPromotedCount, blackTps.length),
    // ESD: recognised supplier & contractor development programme.
    supplierContractorDevProgrammeImplemented: esdContribs.some((c) => c?.supplierDevProgramme === true) ? true : undefined,
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
