/**
 * The B-BBEE scoring function, extracted from the Toolkit store.
 *
 * PURE: no React, no Zustand, no networking, no UI. Given the captured pillar
 * data and a calculator configuration it returns a ScorecardResult - nothing else.
 * The browser store, the server-side impact engine and the parity tests all call
 * this one function, so there is exactly one scoring engine.
 *
 * This file is a behaviour-preserving move of the code that used to live inside
 * store.ts. store.ts still re-exports every symbol below, so existing imports keep
 * working unchanged.
 */
import { Client, OwnershipData, ManagementData, SkillsData, ProcurementData, ESDData, SEDData, ScorecardResult, AfsData, EmpowermentFinancingData, BreakdownLine } from '../types';
import { toBreakdownLines, eapDetailRows, skillsCategoryRows, type EapDetailCell } from '../calculators/breakdown';
import type { CalculatorConfig } from '../../../../shared/schema';
import { isConstructionSector } from '../sectors/construction';
import { buildConstructionScoringInput } from '../calculators/construction-map';
import { calculateConstructionScorecard } from '../../../../../api/pipeline/constructionScoring';
import { calculateOwnershipScore } from '../calculators/ownership';
import { calculateManagementScore } from '../calculators/management';
import { calculateSkillsScore, withSkillsWorkforce } from '../calculators/skills';
import { calculateProcurementScore } from '../calculators/procurement';
import { calculateEsdScore, calculateSedScore } from '../calculators/esd-sed';
import { calculateYESScore } from '../calculators/yes';
import { calculateAfsScore } from '../calculators/afs';
import { calculateEmpowermentFinancingScore } from '../calculators/empowermentFinancing';
import { calculateFscScorecard } from '../calculators/fscToolkit';
import {
  calculateTransportQseManagement,
  calculateTransportQseEmploymentEquity,
  isTransportQseSector,
  calculateTransportLargeManagementControl,
  calculateTransportLargeEmploymentEquity,
  calculateTransportLargeSkills,
  isTransportLargeSector,
} from '../calculators/transport';
import { round2, SectorConfigError, requireSectorConfig, allowsRcogpDefaults } from '../calculators/shared';

export interface PillarState {
  client: Client;
  ownership: OwnershipData;
  management: ManagementData;
  skills: SkillsData;
  procurement: ProcurementData;
  esd: ESDData;
  sed: SEDData;
  afs: AfsData;
  empowermentFinancing: EmpowermentFinancingData;
  scorecard: ScorecardResult;
}

export interface PipelineOverrides {
  ownership?: number;
  managementControl?: number;
  skillsDevelopment?: number;
  procurement?: number;
  supplierDevelopment?: number;
  enterpriseDevelopment?: number;
  socioEconomicDevelopment?: number;
  yesInitiative?: number;
  totalPoints?: number;
  achievedLevel?: number;
  discountedLevel?: number;
  isDiscounted?: boolean;
  recognitionLevel?: string;
  subMinimumsMet?: boolean;
}

export function hasValidPillarConfigs(config: CalculatorConfig | null | undefined): boolean {
  if (!config?.pillarConfigs) return false;
  const pc = config.pillarConfigs;
  const ownMax = pc.ownership?.maxPoints ?? 0;
  const mcMax = pc.managementControl?.maxPoints ?? 0;
  return (ownMax + mcMax) > 0 && (config.totalMaxPoints ?? 0) > 0;
}

// Ownership / MC / EE are here because Transport QSE elects any FOUR of its
// seven elements — none of the seven is compulsory. Sectors that only make the
// tail four elective simply never mark the first three with a group.
type PillarConfigKey =
  | 'ownership'
  | 'managementControl'
  | 'employmentEquity'
  | 'skillsDevelopment'
  | 'preferentialProcurement'
  | 'enterpriseDevelopment'
  | 'socioEconomicDevelopment';

const ELECTIVE_CONFIG_TO_SCORECARD: Record<PillarConfigKey, keyof ScorecardResult> = {
  ownership: 'ownership',
  managementControl: 'managementControl',
  employmentEquity: 'employmentEquity',
  skillsDevelopment: 'skillsDevelopment',
  preferentialProcurement: 'procurement',
  enterpriseDevelopment: 'enterpriseDevelopment',
  socioEconomicDevelopment: 'socioEconomicDevelopment',
};

/**
 * Elect the highest-scoring members of each elective group.
 *
 * How many are elected comes from `electiveGroupSizes[group]`, defaulting to 1.
 * Transport QSE elects FOUR of seven: where the entity has not chosen its four
 * elements, the verification agency measures the four it scores best on.
 */
function resolveChooseOneElectives(
  pConfig: CalculatorConfig['pillarConfigs'],
  rawScores: Record<PillarConfigKey, number>,
  electiveGroupSizes?: Record<string, number>,
): { chosenKey: PillarConfigKey | null; activeKeys: Set<PillarConfigKey> } {
  const groups = new Map<string, PillarConfigKey[]>();
  for (const key of Object.keys(ELECTIVE_CONFIG_TO_SCORECARD) as PillarConfigKey[]) {
    const group = pConfig?.[key]?.chooseOneGroup;
    if (group) {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(key);
    }
  }
  const activeKeys = new Set<PillarConfigKey>();
  let chosenKey: PillarConfigKey | null = null;
  for (const [group, keys] of Array.from(groups.entries())) {
    const size = electiveGroupSizes?.[group] ?? 1;
    const elected = [...keys].sort((a, b) => (rawScores[b] ?? 0) - (rawScores[a] ?? 0)).slice(0, size);
    for (const key of elected) activeKeys.add(key);
    chosenKey = elected[0] ?? null;
  }
  return { chosenKey, activeKeys };
}

/** Standard B-BBEE level thresholds — used when config.levelThresholds unavailable */
export const STANDARD_LEVEL_THRESHOLDS = [
  { level: 1, minPoints: 100, recognition: 135 },
  { level: 2, minPoints: 95, recognition: 125 },
  { level: 3, minPoints: 90, recognition: 110 },
  { level: 4, minPoints: 80, recognition: 100 },
  { level: 5, minPoints: 75, recognition: 80 },
  { level: 6, minPoints: 70, recognition: 60 },
  { level: 7, minPoints: 55, recognition: 50 },
  { level: 8, minPoints: 40, recognition: 10 },
];

/**
 * Convert total points to BEE level.
 * Uses calculatorConfig.levelThresholds if available, otherwise standard RCOGP thresholds.
 */
export function pointsToLevel(totalPoints: number, config?: CalculatorConfig | null): number {
  const thresholds = config?.levelThresholds || STANDARD_LEVEL_THRESHOLDS;
  
  // Sort by minPoints descending to find highest qualifying level
  const sorted = [...thresholds].sort((a, b) => b.minPoints - a.minPoints);
  
  for (const t of sorted) {
    if (totalPoints >= t.minPoints) {
      return t.level;
    }
  }
  
  // Default to level 9 (Non-Compliant) if below all thresholds
  return 9;
}

export function levelToRecognition(level: number, config?: CalculatorConfig | null): string {
  if (level >= 9) return '0%';
  
  const thresholds = config?.levelThresholds || STANDARD_LEVEL_THRESHOLDS;
  const threshold = thresholds.find((t: any) => t.level === level);
  if (threshold?.recognition) {
    return `${threshold.recognition}%`;
  }
  
  return '0%';
}

function assertSectorConfigLoaded(cfg: CalculatorConfig, client: Client): void {
  const sectorCode = cfg.sectorCode ?? client.sectorCode;
  const scorecardType = cfg.scorecardType ?? client.scorecardType ?? client.companySize ?? 'Generic';

  if (allowsRcogpDefaults(sectorCode, scorecardType)) return;

  if (!hasValidPillarConfigs(cfg)) {
    throw new SectorConfigError(
      `Sector configuration not loaded for ${sectorCode} ${scorecardType}. Select a sector and wait for config to load before scoring.`,
    );
  }

  requireSectorConfig(sectorCode, 'skills', cfg.skills as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'procurement', cfg.procurement as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'management', cfg.management as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'managementControl', cfg.managementControl as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'esd', cfg.esd as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'sed', cfg.sed as Record<string, unknown>, scorecardType);
}

/**
 * Flow-through black ownership from the entered shareholders — the measure the
 * Amended Codes deem EME/QSE levels on (share-weighted, voting and economic
 * interest from the same beneficial-ownership data the ownership calculator
 * uses).
 */
function flowThroughBlackOwnership(state: PillarState): { voting: number; ei: number } {
  const shareholders = state.ownership?.shareholders ?? [];
  const totalShares = shareholders.reduce((acc, sh) => acc + (sh.shares || 0), 0);
  let voting = 0;
  for (const sh of shareholders) {
    const pct = totalShares > 0
      ? (sh.shares || 0) / totalShares
      : shareholders.length > 0 ? 1 / shareholders.length : 0;
    voting += pct * (sh.blackOwnership || 0);
  }
  return { voting, ei: voting };
}

/** Exported so the toolkit parity harness scores with the live function. */
export function calculateScorecard(
  state: PillarState & { calculatorConfig?: CalculatorConfig | null; ignoreSubMinimum?: boolean },
  overrides?: PipelineOverrides | null,
): ScorecardResult {
  const cfg = state.calculatorConfig;

  // NOTE: EMEs used to short-circuit here and return a deemed level (L4, or
  // L2/L1 on black ownership) without scoring anything. That affidavit route is
  // a VERIFICATION outcome, not a measurement — so it now sits with the auditor
  // and an EME is scored on its points like every other entity. An EME that has
  // not captured scorecard data will therefore score low rather than showing a
  // lawful-looking Level 4 it did not earn here.

  if (!cfg) throw new Error('calculatorConfig must be loaded before calculating scorecard. Please select a sector first.');

  // Construction scores via the expert-verified indicator-matrix evaluator, not the
  // pillar calculators. Map the Toolkit data → ConstructionScoringInput, evaluate, and
  // adapt the 5-element output into ScorecardResult (construction folds PP+SD into the
  // ESD element → mapped to the procurement slot; SD/ED/EE/YES slots are zeroed).
  if (isConstructionSector(state.client.sectorCode)) {
    const { entityType, input } = buildConstructionScoringInput(state, cfg);
    const out = calculateConstructionScorecard(entityType, input);
    const el = out.elementScores;
    const lvl = pointsToLevel(out.totalScore, cfg);
    // Attach the construction evaluator's own per-indicator rows as the pillar
    // breakdown, so the page renders the lines the CONSTRUCTION matrix scored —
    // never the generic calculator's lines.
    const mkPillar = (e: {
      achievedPoints: number;
      availablePoints: number;
      indicators?: Array<{ name: string; achievedPoints: number; availablePoints: number }>;
    }) => ({
      score: round2(e.achievedPoints), target: e.availablePoints, weighting: e.availablePoints,
      subLines: (e.indicators ?? []).map((ind): BreakdownLine => ({
        name: ind.name,
        target: `${ind.availablePoints} pts`,
        weighting: ind.availablePoints,
        score: round2(ind.achievedPoints),
      })),
    });

    // CSC000 §5 priority-element sub-minimums, previously not applied at all
    // (audit 2026-07-26 item 5): 40% of the ownership NET VALUE indicator, 40%
    // of Skills, 40% of the combined PP&SD element; Generic-class entities
    // (Contractor / BEP) need all three, QSEs need Ownership plus either.
    // Failing discounts one level.
    const fortyPct = (achieved: number, available: number) =>
      available <= 0 || achieved >= available * 0.4;
    const netValueIndicator = el.ownership.indicators.find((ind) => /net\s*value/i.test(ind.name));
    const ownPriorityMet = netValueIndicator
      ? fortyPct(netValueIndicator.achievedPoints, netValueIndicator.availablePoints)
      : fortyPct(el.ownership.achievedPoints, el.ownership.availablePoints);
    const skillsPriorityMet = fortyPct(el.skillsDevelopment.achievedPoints, el.skillsDevelopment.availablePoints);
    const esdPriorityMet = fortyPct(el.enterpriseSupplierDevelopment.achievedPoints, el.enterpriseSupplierDevelopment.availablePoints);
    const constructionQse = /qse/i.test(String(out.scorecardType ?? entityType));
    const priorityFailed = constructionQse
      ? (!ownPriorityMet || !(skillsPriorityMet || esdPriorityMet))
      : (!ownPriorityMet || !skillsPriorityMet || !esdPriorityMet);
    const discounted = !state.ignoreSubMinimum && lvl < 9 && priorityFailed;
    const cDiscountedLevel = discounted ? Math.min(lvl + 1, 8) : lvl;

    const result: ScorecardResult = {
      ownership: { ...mkPillar(el.ownership), subMinimumMet: ownPriorityMet },
      managementControl: mkPillar(el.managementControl),
      skillsDevelopment: { ...mkPillar(el.skillsDevelopment), subMinimumMet: skillsPriorityMet },
      procurement: { ...mkPillar(el.enterpriseSupplierDevelopment), subMinimumMet: esdPriorityMet },
      supplierDevelopment: { score: 0, target: 0, weighting: 0, subMinimumMet: true },
      enterpriseDevelopment: { score: 0, target: 0, weighting: 0, subMinimumMet: true },
      socioEconomicDevelopment: mkPillar(el.socioEconomicDevelopment),
      yesInitiative: { score: 0, target: 0, weighting: 0 },
      total: { score: round2(out.totalScore), target: out.totalAvailable, weighting: out.totalAvailable },
      achievedLevel: lvl,
      discountedLevel: cDiscountedLevel,
      isDiscounted: discounted,
      recognitionLevel: levelToRecognition(cDiscountedLevel, cfg),
    };
    // Attach the raw construction output (per-indicator detail) for the results view.
    (result as unknown as { construction?: unknown }).construction = out;
    return result;
  }

  assertSectorConfigLoaded(cfg, state.client);
  // FSC scores the way its own Empower toolkit does (calculators/fscToolkit.ts).
  if (cfg.fscToolkit && !(overrides && overrides.totalPoints !== undefined && overrides.totalPoints > 0)) {
    return calculateFscScorecard(state, cfg);
  }
  const transportQse = isTransportQseSector(state.client.sectorCode, state.client.scorecardType);
  const transportLarge = !transportQse && isTransportLargeSector(state.client.sectorCode, state.client.scorecardType);
  const eeMax = cfg.pillarConfigs?.employmentEquity?.maxPoints ?? 0;

  const ownScore = calculateOwnershipScore(state.ownership, cfg);

  let mgtScoreTotal: number;
  let eeScoreTotal = 0;
  // Breakdown emitted by the calculator that actually SCORED the pillar, so the
  // UI can render lines that reconcile to the total (Transport uses a different
  // calculator than the generic breakdown — showing generic lines against a
  // Transport score is why "breakdowns don't link"). Undefined ⇒ UI falls back
  // to re-deriving from the generic calculator (correct for RCOGP/ICT/FSC/AGRI).
  let mcSubLines: BreakdownLine[] | undefined;
  let mcCoverageNotes: string[] | undefined;
  let eeSubLines: BreakdownLine[] | undefined;
  if (transportQse) {
    const tqMc = calculateTransportQseManagement(state.management, cfg);
    mgtScoreTotal = tqMc.score;
    mcSubLines = tqMc.subLines;
    mcCoverageNotes = tqMc.coverageNotes;

    const tqEe = calculateTransportQseEmploymentEquity(state.management, cfg, state.client.eapProvince);
    eeScoreTotal = tqEe.score;
    eeSubLines = tqEe.subLines;
  } else if (transportLarge) {
    // Transport Large: MC 11 + EE 18 are SEPARATE pillars (Transport Codes
    // "Road Freight Large" rows 23-31 / 33-43). Previously this branch fell
    // through to the generic MC calculator and EE stayed 0 — the 18 EE points
    // were counted in the target but never scored.
    const tlMc = calculateTransportLargeManagementControl(state.management, cfg);
    mgtScoreTotal = tlMc.score;
    mcSubLines = tlMc.subLines;

    const tlEe = calculateTransportLargeEmploymentEquity(state.management, cfg);
    eeScoreTotal = tlEe.score;
    eeSubLines = tlEe.subLines;
  } else {
    const mgtScore = calculateManagementScore(state.management, cfg, state.client.eapProvince, state.client.eapYear);
    mgtScoreTotal = mgtScore.exactTotal ?? mgtScore.total;
    // Generic sectors: the breakdown is this SAME calculator's own lines, plus
    // its per-demographic effective-EAP detail rows — carried on the scorecard
    // so the page renders the scored lines, never a re-run.
    mcSubLines = [
      ...toBreakdownLines(mgtScore.subLines),
      ...eapDetailRows(mgtScore.eapBreakdowns as Record<string, EapDetailCell[]>, mgtScore.eapProvince),
    ];
  }

  // Transport Large Skills is structurally different (5th indicator = black
  // women in B/C/D programmes, not absorption) — use the mirrored calculator.
  // Skills reads its workforce from Management Control: the headcount when none
  // was entered, and the black workforce mix the toolkit shares training-admin
  // costs by (every employee except non-executive directors).
  const skillScore = transportLarge
    ? calculateTransportLargeSkills(state.skills, cfg)
    : calculateSkillsScore(
      {
        ...withSkillsWorkforce(state.skills, state.management),
        // Read only by a sector that counts training within the period (AgriBEE).
        measurementPeriodStart: state.skills.measurementPeriodStart ?? (state.client.measurementPeriodStart || undefined),
      },
      cfg, state.client.eapProvince, state.client.eapYear,
    );

  // The measurement period's end dates the time-bound rules (a graduated
  // supplier's five years; the ESD "years since first assistance").
  const periodEnd = state.client.measurementPeriodEnd;
  const procScore = calculateProcurementScore(
    { ...state.procurement, measurementPeriodEnd: state.procurement.measurementPeriodEnd ?? periodEnd },
    cfg,
  );

  const esdScore = calculateEsdScore(
    { ...state.esd, measurementPeriodEnd: state.esd.measurementPeriodEnd ?? periodEnd },
    state.client.npat,
    cfg,
  );
  const sedScore = calculateSedScore(state.sed, state.client.npat, cfg, {
    isReinsurer: Boolean(state.client.fscReinsurer),
  });

  // FSC sub-sector AFS scoring (Banks/LTI/STI only)
  const afsScore = cfg.accessToFinancialServices
    ? calculateAfsScore(state.afs, cfg)
    : null;
  if (afsScore) {
  }

  // FSC Banks/LTI Empowerment Financing — EF-proper only (Targeted Investments
  // 12 + Transaction Financing 3); SD/ED stay in the ESD pillar. Returns null
  // for STI / Others / non-FSC (targetedInvestmentMaxPts+transactionFinancingMaxPts = 0).
  const efScore = cfg.empowermentFinancing
    ? calculateEmpowermentFinancingScore(state.empowermentFinancing, cfg)
    : null;
  if (efScore) {
  }
  // CRITICAL: Wire YES calculator - construct YESData from skills and management state
  // Training programs with isYesEmployee=true are treated as YES candidates
  const yesCandidates = state.skills.trainingPrograms
    ?.filter(p => p.isYesEmployee)
    ?.map(p => ({
      id: p.id,
      name: p.learnerName || 'YES Candidate',
      // No demographic defaults: a blank race must never score as a black
      // youth. isBlack requires a STATED black race — `race !== 'White'`
      // counted undefined as black and produced YES/absorption points with
      // no demographic evidence.
      race: p.race || '',
      gender: p.gender || '',
      isDisabled: p.isDisabled || false,
      isBlack: ['African', 'Coloured', 'Indian', 'Chinese'].includes(String(p.race ?? '').trim()),
      startDate: p.startDate || new Date().toISOString(),
      isAbsorbed: p.isAbsorbed || false,
      cost: (p as any).totalCost || ((p as any).cost || 0),
    })) || [];

  const yesData = {
    id: (state as { yes?: { id?: string } }).yes?.id || '',
    clientId: state.client?.id || '',
    totalEmployees: state.management.employees?.length || 0,
    yesHeadcountTarget: Math.max(Math.ceil((state.management.employees?.length || 0) * 0.025), 1),
    candidates: yesCandidates,
    yesYouthEnrolled: yesCandidates.length,
    yesBlackYouthCount: yesCandidates.filter(c => c.isBlack).length,
    yesBlackYouthPercentage: yesCandidates.length > 0 ? (yesCandidates.filter(c => c.isBlack).length / yesCandidates.length) * 100 : 0,
    yesAbsorbedCount: yesCandidates.filter(c => c.isAbsorbed).length,
    yesAbsorptionRate: yesCandidates.length > 0 ? (yesCandidates.filter(c => c.isAbsorbed).length / yesCandidates.length) * 100 : 0,
    totalYesCost: yesCandidates.reduce((sum, c) => sum + c.cost, 0),
    yesCostPerCandidate: yesCandidates.length > 0 ? yesCandidates.reduce((sum, c) => sum + c.cost, 0) / yesCandidates.length : 0,
  };
  const avgNpat3yr = (() => {
    const history = state.client.financialHistory || [];
    const npatValues = history.map(fy => fy.npat ?? 0).filter(n => n > 0);
    if (npatValues.length === 0) return state.client.npat || 0;
    const recent = npatValues.slice(-3);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  })();
  const yesScore = calculateYESScore(yesData as unknown as Parameters<typeof calculateYESScore>[0], cfg, state.client.revenue || 0, avgNpat3yr);

  if (overrides && overrides.totalPoints !== undefined && overrides.totalPoints > 0) {
    const ov = overrides;
    const ownPts = ov.ownership ?? ownScore.total;
    const mcPts = ov.managementControl ?? mgtScoreTotal;
    const skPts = ov.skillsDevelopment ?? skillScore.total;
    const prPts = ov.procurement ?? procScore.total;
    const sdPts = ov.supplierDevelopment ?? esdScore.sdTotal;
    const edPts = ov.enterpriseDevelopment ?? esdScore.edTotal;
    const sedPts = ov.socioEconomicDevelopment ?? sedScore.total;
    const yesPts = ov.yesInitiative ?? yesScore.score;
    const total = ov.totalPoints ?? (ownPts + mcPts + skPts + prPts + sdPts + edPts + sedPts + yesPts);

    const level = ov.achievedLevel ?? pointsToLevel(total, cfg);
    const disc = ov.discountedLevel ?? level;
    const isDisc = ov.isDiscounted ?? false;
    const recog = ov.recognitionLevel ?? levelToRecognition(disc, cfg);

    const allSubMinMet = ov.subMinimumsMet;
    const ownSubMin = allSubMinMet !== undefined ? allSubMinMet : (ownPts >= 10 || ownScore.subMinimumMet);
    const skSubMin = allSubMinMet !== undefined ? allSubMinMet : skillScore.subMinimumMet;
    const procBase = typeof procScore.base === 'number' ? procScore.base : prPts;
    const prSubMin = allSubMinMet !== undefined ? allSubMinMet : (procBase >= 11.6);
    const sdSubMin = allSubMinMet !== undefined ? allSubMinMet : esdScore.sdSubMinimumMet;
    const edSubMin = allSubMinMet !== undefined ? allSubMinMet : esdScore.edSubMinimumMet;

    // Get dynamic targets from config or use defaults
    const pConfig = cfg?.pillarConfigs;
    const ownTarget = pConfig?.ownership?.maxPoints ?? 25;
    const mcTarget = pConfig?.managementControl?.maxPoints ?? 19;
    const skillsTarget = pConfig?.skillsDevelopment?.maxPoints ?? 25;
    const procTarget = pConfig?.preferentialProcurement?.maxPoints ?? 29;
    const sdTarget = pConfig?.supplierDevelopment?.maxPoints ?? 10;
    const edTarget = pConfig?.enterpriseDevelopment?.maxPoints ?? 7;
    const sedTarget = pConfig?.socioEconomicDevelopment?.maxPoints ?? 5;
    const yesTarget = pConfig?.yesInitiative?.maxPoints ?? 0; // YES is level boost, not scored points
    // Use totalMaxPoints from config (verified Excel value) instead of calculating
    const totalTarget = cfg?.totalMaxPoints ?? (ownTarget + mcTarget + skillsTarget + procTarget + sdTarget + edTarget + sedTarget + yesTarget);

    // CRITICAL FIX: Apply round2 to all scores for consistent 2 decimal display
    return {
      ownership: { score: round2(ownPts), target: ownTarget, weighting: ownTarget, subMinimumMet: ownSubMin },
      managementControl: { score: round2(mcPts), target: mcTarget, weighting: mcTarget },
      skillsDevelopment: { score: round2(skPts), target: skillsTarget, weighting: skillsTarget, subMinimumMet: skSubMin },
      procurement: { score: round2(prPts), target: procTarget, weighting: procTarget, subMinimumMet: prSubMin },
      supplierDevelopment: { score: round2(sdPts), target: sdTarget, weighting: sdTarget, subMinimumMet: sdSubMin },
      enterpriseDevelopment: { score: round2(edPts), target: edTarget, weighting: edTarget, subMinimumMet: edSubMin },
      socioEconomicDevelopment: { score: round2(sedPts), target: sedTarget, weighting: sedTarget },
      yesInitiative: { score: round2(yesPts), target: yesTarget, weighting: yesTarget },
      total: { score: round2(total), target: totalTarget, weighting: totalTarget },
      achievedLevel: level, discountedLevel: disc, isDiscounted: isDisc, recognitionLevel: recog,
    };
  }

  const pConfig = cfg?.pillarConfigs;
  const ownTarget = pConfig?.ownership?.maxPoints ?? 25;
  const mcTarget = pConfig?.managementControl?.maxPoints ?? 19;
  const eeTarget = pConfig?.employmentEquity?.maxPoints ?? 0;
  const skillsTarget = pConfig?.skillsDevelopment?.maxPoints ?? 25;
  const procTarget = pConfig?.preferentialProcurement?.maxPoints ?? 29;
  const sdTarget = pConfig?.supplierDevelopment?.maxPoints ?? 10;
  const edTarget = pConfig?.enterpriseDevelopment?.maxPoints ?? 7;
  const sedTarget = pConfig?.socioEconomicDevelopment?.maxPoints ?? 5;
  const yesTarget = pConfig?.yesInitiative?.maxPoints ?? 0;

  const electiveRawScores: Record<PillarConfigKey, number> = {
    ownership: ownScore.total,
    managementControl: mgtScoreTotal,
    employmentEquity: eeScoreTotal,
    skillsDevelopment: skillScore.total,
    preferentialProcurement: procScore.total,
    enterpriseDevelopment: esdScore.edTotal,
    socioEconomicDevelopment: sedScore.total,
  };
  const hasChooseOne = Object.values(pConfig ?? {}).some(p => p?.chooseOneGroup);
  const { chosenKey: chosenElectiveKey, activeKeys: activeElectiveKeys } = hasChooseOne
    ? resolveChooseOneElectives(pConfig, electiveRawScores, cfg?.electiveGroupSizes)
    : { chosenKey: null, activeKeys: new Set<PillarConfigKey>() };

  const electiveScoreForTotal = (key: PillarConfigKey, score: number): number => {
    if (!hasChooseOne) return score;
    return activeElectiveKeys.has(key) ? score : 0;
  };

  // The grand total adds each element before rounding, as the toolkit does;
  // every element is still shown rounded to the cent.
  const exact = (r: { total: number; exactTotal?: number }) => r.exactTotal ?? r.total;
  const skillsForTotal = electiveScoreForTotal('skillsDevelopment', exact(skillScore));
  const procForTotal = electiveScoreForTotal('preferentialProcurement', exact(procScore));
  const edForTotal = electiveScoreForTotal('enterpriseDevelopment', esdScore.edExactTotal ?? esdScore.edTotal);
  const sedForTotal = electiveScoreForTotal('socioEconomicDevelopment', exact(sedScore));

  const sdForTotal = sdTarget > 0 ? (esdScore.sdExactTotal ?? esdScore.sdTotal) : 0;
  const afsForTotal = afsScore?.total ?? 0;
  const efForTotal = efScore?.total ?? 0;

  // Ownership / MC / EE are only unconditional where the sector does not make
  // them electives. Transport QSE does, so an unelected element contributes 0 —
  // which is how a real certificate shows Employment Equity 0.00 without that
  // zero dragging the entity's level down.
  const compulsoryTotal = electiveScoreForTotal('ownership', exact(ownScore))
    + electiveScoreForTotal('managementControl', mgtScoreTotal)
    + (eeTarget > 0 ? electiveScoreForTotal('employmentEquity', eeScoreTotal) : 0);
  const electiveTotal = skillsForTotal + procForTotal + edForTotal + sedForTotal;
  // The B-BBEE total is the elements only. YES points are shown beside it and
  // never move the level (toolkit Summary F69 = the seven elements; F71 adds
  // the YES points for display).
  const totalPoints = compulsoryTotal + electiveTotal + sdForTotal + afsForTotal + efForTotal;

  const totalTarget = cfg?.totalMaxPoints ?? (
    ownTarget + mcTarget + eeTarget +
    (hasChooseOne ? 25 : skillsTarget + procTarget + edTarget + sedTarget) +
    sdTarget + yesTarget
  );


  const level = pointsToLevel(totalPoints, cfg);

  // The ownership sub-minimum is 40% of NET VALUE points specifically
  // (Statement 000 §3.3.3) — the calculator's own subMinimumMet measures that.
  // The old `total >= ownTarget*0.4` OR-branch let 40% of TOTAL ownership
  // points stand in for it, waving through entities whose net-value line
  // failed. (Audit 2026-07-26 item 12c.)
  const ownSubMinMet = ownScore.subMinimumMet;
  const skSubMinMet = skillScore.subMinimumMet;
  const prSubMinMet = procScore.subMinimumMet;
  const sdSubMinMet = esdScore.sdSubMinimumMet;
  const edSubMinMet = esdScore.edSubMinimumMet;

  /** Hide sub-min badges when the sector sets subMinimumPercent to 0 or maxPoints to 0. */
  const showSubMin = (pillarKey: keyof NonNullable<CalculatorConfig['pillarConfigs']>): boolean => {
    const p = pConfig?.[pillarKey];
    if (!p) return true;
    const pct = 'subMinimumPercent' in p ? (p as { subMinimumPercent?: number }).subMinimumPercent : undefined;
    if (pct === 0) return false;
    if ('maxPoints' in p && (p as { maxPoints?: number }).maxPoints === 0) return false;
    return pct == null || pct > 0;
  };
  // Discounting follows the PRIORITY ELEMENTS, per entity size (Statement 000
  // §3.3, FSC §3.3.2, AgriBEE §5.2.2 — audit 2026-07-26 item 6):
  //  - Generic: Ownership (net value) AND Skills AND ESD (whose sub-minimum is
  //    40% on each of PP / SD / ED).
  //  - QSE: Ownership AND (Skills OR ESD) — one of the two suffices.
  // The old rule demanded all five for everyone, discounting QSEs the codes
  // say are compliant.
  const esdElementSubMinMet = prSubMinMet && sdSubMinMet && edSubMinMet;
  // A sector whose toolkit discounts a QSE like a Generic entity opts out of
  // the either-or rule (discounting.qseRequiresAllPriorityElements, ICT QSE).
  const isQseScorecard = /qse/i.test(String(state.client.scorecardType ?? ""))
    && cfg.discounting?.qseRequiresAllPriorityElements !== true;
  const anySubMinFailed = isQseScorecard
    ? (!ownSubMinMet || !(skSubMinMet || esdElementSubMinMet))
    : (!ownSubMinMet || !skSubMinMet || !esdElementSubMinMet);
  const isDiscounted = !state.ignoreSubMinimum && level < 9 && anySubMinFailed;
  // One level down; a Level 8 that is discounted is Non-compliant (toolkit
  // 'Scorecard Calculations'!C13:C14 drop to the next threshold, below 40 is 0).
  let discountedLevel = isDiscounted ? (level >= 8 ? 9 : level + 1) : level;
  const preYesDiscountedLevel = discountedLevel;

  // YES lifts the level only for an entity whose prior-year level is known and
  // whose measured level is no worse than it (toolkit YES!C19:C22). The current
  // certificate level is that prior-year level.
  const priorYearLevel = state.client.beeCertificateLevel;
  const yesLevelGateMet = typeof priorYearLevel === 'number' && level <= priorYearLevel;
  if (yesLevelGateMet && yesScore.yesBeeLevelIncrease > 0 && discountedLevel > 1) {
    discountedLevel = Math.max(1, discountedLevel - yesScore.yesBeeLevelIncrease);
  }

  // The level is the points, and nothing else lifts it.
  //
  // A deemed-level FLOOR used to sit here (Amended Codes Statement 000 §4: a
  // ≥51%/100% black-owned EME/QSE holds Level 2/1 by annual sworn affidavit).
  // It was removed deliberately — that entitlement is granted on an affidavit
  // that never passes through a scorecard, so asserting it from ownership
  // figures we extracted is a consulting judgement, not a measurement. The
  // verification auditor makes that call. Sub-minimum discounting and the YES
  // uplift stay: both are gazetted adjustments TO a scored result.
  const finalAchievedLevel = level;
  const finalDiscountedLevel = discountedLevel;

  const mkElectiveMeta = (key: PillarConfigKey) => ({
    isChosenElective: hasChooseOne && activeElectiveKeys.has(key),
    isElectiveNotChosen: hasChooseOne && !activeElectiveKeys.has(key),
  });

  const skillsWeight = hasChooseOne
    ? (activeElectiveKeys.has('skillsDevelopment') ? skillsTarget : 0)
    : skillsTarget;
  const procWeight = hasChooseOne
    ? (activeElectiveKeys.has('preferentialProcurement') ? procTarget : 0)
    : procTarget;
  const edWeight = hasChooseOne
    ? (activeElectiveKeys.has('enterpriseDevelopment') ? edTarget : 0)
    : edTarget;
  const sedWeight = hasChooseOne
    ? (activeElectiveKeys.has('socioEconomicDevelopment') ? sedTarget : 0)
    : sedTarget;

  // Every pillar carries the breakdown from the calculator that SCORED it — the
  // page renders these, never a re-run. SED is a single-line pillar; the
  // calculator writes the line with its own arithmetic.
  const sedBreakdown: BreakdownLine[] = sedScore.subLines?.length
    ? toBreakdownLines(sedScore.subLines).map((l) => ({ ...l, weighting: sedTarget }))
    : [{
        name: 'Annual value of all SED contributions',
        target: `${((cfg.sed?.npatTarget ?? 0.01) * 100).toFixed(0)}% of NPAT`,
        weighting: sedTarget,
        score: round2(sedScore.total),
        note: `SED spend R${round2(sedScore.actualSpend).toLocaleString()} / target R${round2(sedScore.target).toLocaleString()}`,
      }];

  return {
    ownership: {
      score: round2(ownScore.total),
      target: ownTarget,
      weighting: ownTarget,
      subMinimumMet: showSubMin('ownership') ? ownSubMinMet : undefined,
      subLines: toBreakdownLines(ownScore.subLines),
    },
    managementControl: { score: round2(mgtScoreTotal), target: mcTarget, weighting: mcTarget, subLines: mcSubLines, coverageNotes: mcCoverageNotes },
    ...(eeTarget > 0 ? {
      employmentEquity: { score: round2(eeScoreTotal), target: eeTarget, weighting: eeTarget, subLines: eeSubLines },
    } : {}),
    skillsDevelopment: {
      score: round2(skillScore.total),
      target: skillsWeight,
      weighting: skillsWeight,
      subMinimumMet: showSubMin('skillsDevelopment') ? skSubMinMet : undefined,
      ...mkElectiveMeta('skillsDevelopment'),
      subLines: [...toBreakdownLines(skillScore.subLines), ...skillsCategoryRows(skillScore.categoryBreakdown)],
    },
    procurement: {
      score: round2(procScore.total),
      target: procWeight,
      weighting: procWeight,
      subMinimumMet: showSubMin('preferentialProcurement') ? prSubMinMet : undefined,
      ...mkElectiveMeta('preferentialProcurement'),
      subLines: toBreakdownLines(procScore.subLines),
      coverageNotes: procScore.coverageNotes,
    },
    supplierDevelopment: {
      score: round2(esdScore.sdTotal),
      target: sdTarget,
      weighting: sdTarget,
      subMinimumMet: showSubMin('supplierDevelopment') ? sdSubMinMet : undefined,
      subLines: toBreakdownLines(esdScore.sdSubLines),
    },
    enterpriseDevelopment: {
      score: round2(esdScore.edTotal),
      target: edWeight,
      weighting: edWeight,
      subMinimumMet: showSubMin('enterpriseDevelopment') ? edSubMinMet : undefined,
      ...mkElectiveMeta('enterpriseDevelopment'),
      subLines: toBreakdownLines(esdScore.edSubLines),
    },
    socioEconomicDevelopment: {
      score: round2(sedScore.total),
      target: sedWeight,
      weighting: sedWeight,
      ...mkElectiveMeta('socioEconomicDevelopment'),
      subLines: sedBreakdown,
    },
    yesInitiative: { score: round2(yesScore.score + yesScore.yesBonusPoints), target: yesTarget, weighting: yesTarget },
    ...(afsScore ? {
      accessToFinancialServices: {
        score: round2(afsScore.total),
        target: afsScore.maxPoints,
        weighting: afsScore.maxPoints,
        subLines: afsScore.lines.map(l => ({ name: l.name, target: l.target, weighting: l.maxPoints, score: l.score })),
      },
    } : {}),
    ...(efScore ? {
      empowermentFinancing: {
        score: round2(efScore.total),
        target: efScore.maxPoints,
        weighting: efScore.maxPoints,
        subLines: efScore.lines.map(l => ({
          name: l.name,
          target: `100% of ${l.code === 'EF-TI' ? 'exposure' : 'TF portfolio'}`,
          weighting: l.maxPoints,
          score: l.score,
          note: l.target > 0 ? `Achieved R${Math.round(l.achieved).toLocaleString()} of R${Math.round(l.target).toLocaleString()}` : undefined,
        })),
      },
    } : {}),
    total: { score: round2(totalPoints), target: totalTarget, weighting: totalTarget },
    achievedLevel: finalAchievedLevel,
    discountedLevel: finalDiscountedLevel,
    preYesDiscountedLevel,
    isDiscounted,
    recognitionLevel: levelToRecognition(finalDiscountedLevel),
    chosenElectivePillar: chosenElectiveKey ? ELECTIVE_CONFIG_TO_SCORECARD[chosenElectiveKey] : null,
  };
}
