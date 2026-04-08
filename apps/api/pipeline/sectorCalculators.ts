/**
 * Sector-Aware B-BBEE Calculators
 *
 * Parameterized versions of the scorecard calculators that accept a
 * SectorConfig, enabling accurate scoring for ICT, FSC, Agri, QSE,
 * and any other sector code without hardcoded thresholds.
 */

import type { ParseResult } from './excelParser.js';
import type { SectorConfig } from './sectorConfig.js';
import { RECOGNITION_TABLE, r2 } from './calculators.js';

export function calcOwnershipSector(
  shareholders: ParseResult['shareholders'],
  cfg: SectorConfig,
  companyValue = 0,
  outstandingDebt = 0,
) {
  const t = cfg.targets.ownership;
  if (shareholders.length === 0) {
    return { total: 0, subMinMet: false, blackOwnership: 0, blackWomenOwnership: 0, economicInterest: 0 };
  }

  const totalSharesRaw = shareholders.reduce((a, s) => a + (s.shares || 0), 0);
  const hasShares = totalSharesRaw > 0;
  const weights = hasShares
    ? shareholders.map(s => (s.shares || 0) / totalSharesRaw)
    : shareholders.map(() => 1 / shareholders.length);

  let totalBO = 0, totalBWO = 0, totalEI = 0, netValueAgg = 0;
  for (let i = 0; i < shareholders.length; i++) {
    const sh = shareholders[i];
    const w = weights[i];
    totalBO += w * sh.blackOwnership;
    totalBWO += w * sh.blackWomenOwnership;
    totalEI += w * sh.blackOwnership;
    if (companyValue > 0 && (sh.shareValue || 0) > 0 && sh.blackOwnership > 0) {
      const allocated = companyValue * w;
      const debt = outstandingDebt * w;
      const carrying = (sh.shareValue || 0) * w;
      netValueAgg += Math.max(0, (allocated - debt) / carrying) * sh.blackOwnership;
    }
  }

  const hasNetVal = companyValue > 0 && shareholders.some(s => (s.shareValue || 0) > 0);

  const votingPts = Math.min((totalBO / t.votingRightsTarget) * t.votingRightsMaxPts, t.votingRightsMaxPts);
  const womenPts = Math.min((totalBWO / t.womenVotingTarget) * t.womenVotingMaxPts, t.womenVotingMaxPts);
  const eiPts = Math.min((totalEI / t.economicInterestTarget) * t.economicInterestMaxPts, t.economicInterestMaxPts);

  let nvPts: number;
  if (hasNetVal) nvPts = Math.min(netValueAgg * t.netValueMaxPts, t.netValueMaxPts);
  else nvPts = totalBO >= 1.0 ? t.netValueMaxPts : Math.min((totalBO / 0.25) * t.netValueMaxPts, t.netValueMaxPts);

  const maxPts = cfg.pillarConfigs.ownership.maxPoints;
  const total = Math.min(votingPts + womenPts + eiPts + nvPts, maxPts);
  const subMin = cfg.pillarConfigs.ownership.subMinimumPercent / 100;
  const subMinMet = nvPts >= (t.netValueMaxPts * subMin) || totalBO >= 1.0;

  return { total: r2(total), subMinMet, blackOwnership: totalBO, blackWomenOwnership: totalBWO, economicInterest: totalEI };
}

// National EAP targets (Economically Active Population)
const NATIONAL_EAP = {
  Senior:          { blackTarget: 0.731, blackWomenTarget: 0.341 },
  Middle:          { blackTarget: 0.786, blackWomenTarget: 0.425 },
  Junior:          { blackTarget: 0.845, blackWomenTarget: 0.512 },
  SkilledTechnical:{ blackTarget: 0.786, blackWomenTarget: 0.425 },
};

export function calcMCSector(employees: ParseResult['employees'], cfg: SectorConfig) {
  const isBlack = (r: string) => ['African', 'Coloured', 'Indian'].includes(r);
  const grouped: Record<string, typeof employees> = {};
  for (const e of employees) { const d = e.designation || 'Junior'; if (!grouped[d]) grouped[d] = []; grouped[d].push(e); }

  const board = grouped['Board'] || [];
  const exec = [...(grouped['Executive'] || []), ...(grouped['Executive Director'] || [])];
  const otherExec = grouped['Other Executive Management'] || [];
  const senior = grouped['Senior'] || [];
  const middle = grouped['Middle'] || [];
  const junior = [...(grouped['Junior'] || []), ...(grouped['Semi-skilled'] || []), ...(grouped['Unskilled'] || [])];

  const t = cfg.targets.managementControl;
  const ee = cfg.targets.employmentEquity;

  const countBlack = (arr: typeof employees) => arr.filter(e => isBlack(e.race)).length;
  const countBW = (arr: typeof employees) => arr.filter(e => isBlack(e.race) && e.gender === 'Female').length;
  const pctBlack = (arr: typeof employees) => arr.length > 0 ? countBlack(arr) / arr.length : 0;
  const pctBW = (arr: typeof employees) => arr.length > 0 ? countBW(arr) / arr.length : 0;
  const ratio = (actual: number, target: number, maxPts: number) =>
    target > 0 ? Math.min(maxPts, (actual / target) * maxPts) : 0;

  const boardBlackPts = ratio(pctBlack(board), t.boardBlackTarget, t.boardBlackMaxPts);
  const boardBWPts    = ratio(pctBW(board),    t.boardBWTarget,    t.boardBWMaxPts);
  const execBlackPts  = ratio(pctBlack(exec),  t.execBlackTarget,  t.execBlackMaxPts);
  const execBWPts     = ratio(pctBW(exec),     t.execBWTarget,     t.execBWMaxPts);

  const otherExecBlackPts = ratio(pctBlack(otherExec), t.otherExecBlackTarget, t.otherExecBlackMaxPts);
  const otherExecBWPts    = ratio(pctBW(otherExec),    t.otherExecBWTarget,    t.otherExecBWMaxPts);

  const seniorBlackPts = ratio(pctBlack(senior), NATIONAL_EAP.Senior.blackTarget,      t.seniorMaxPts);
  const seniorBWPts    = ratio(pctBW(senior),    NATIONAL_EAP.Senior.blackWomenTarget,  t.seniorBWMaxPts);
  const middleBlackPts = ratio(pctBlack(middle), NATIONAL_EAP.Middle.blackTarget,       t.middleMaxPts);
  const middleBWPts    = ratio(pctBW(middle),    NATIONAL_EAP.Middle.blackWomenTarget,  t.middleBWMaxPts);
  const juniorBlackPts = ratio(pctBlack(junior), NATIONAL_EAP.Junior.blackTarget,       t.juniorMaxPts);
  const juniorBWPts    = ratio(pctBW(junior),    NATIONAL_EAP.Junior.blackWomenTarget,  t.juniorBWMaxPts);

  const disabledCount = employees.filter(e => e.isDisabled).length;
  const disabledPct = employees.length > 0 ? disabledCount / employees.length : 0;
  const disabledPts = ratio(disabledPct, ee.disabledTarget, ee.disabledMaxPts);

  const total = boardBlackPts + boardBWPts +
    execBlackPts + execBWPts +
    otherExecBlackPts + otherExecBWPts +
    seniorBlackPts + seniorBWPts +
    middleBlackPts + middleBWPts +
    juniorBlackPts + juniorBWPts +
    disabledPts;

  const maxPts = cfg.pillarConfigs.managementControl.maxPoints;
  return r2(Math.min(maxPts, total));
}

export function calcEESector(employees: ParseResult['employees'], cfg: SectorConfig) {
  const maxPts = cfg.pillarConfigs.employmentEquity?.maxPoints ?? 0;
  if (maxPts === 0) return 0;

  const isBlack = (r: string) => ['African', 'Coloured', 'Indian'].includes(r);
  const grouped: Record<string, typeof employees> = {};
  for (const e of employees) { const d = e.designation || 'Junior'; if (!grouped[d]) grouped[d] = []; grouped[d].push(e); }

  const senior = grouped['Senior'] || [];
  const middle = grouped['Middle'] || [];
  const junior = grouped['Junior'] || [];
  const t = cfg.targets.employmentEquity;

  const countBlack = (arr: typeof employees) => arr.filter(e => isBlack(e.race)).length;

  const srPts = senior.length > 0 ? Math.min(t.seniorMaxPts, (countBlack(senior) / senior.length) * t.seniorMaxPts) : 0;
  const mdPts = middle.length > 0 ? Math.min(t.middleMaxPts, (countBlack(middle) / middle.length) * t.middleMaxPts) : 0;
  const jrPts = junior.length > 0 ? Math.min(t.juniorMaxPts, (countBlack(junior) / junior.length) * t.juniorMaxPts) : 0;

  const disabledCount = employees.filter(e => e.isDisabled).length;
  const disPct = employees.length > 0 ? disabledCount / employees.length : 0;
  const disPts = Math.min(t.disabledMaxPts, disPct >= t.disabledTarget ? t.disabledMaxPts : (disPct / t.disabledTarget) * t.disabledMaxPts);

  return r2(Math.min(maxPts, srPts + mdPts + jrPts + disPts));
}

export function calcSkillsSector(trainings: ParseResult['trainingPrograms'], leviableAmount: number, cfg: SectorConfig) {
  const t = cfg.targets.skills;
  const targetOverall = leviableAmount * (t.overallSpendPercent / 100);
  const targetBursary = leviableAmount * (t.bursarySpendPercent / 100);
  const targetDisabled = leviableAmount * (t.disabledSpendPercent / 100);
  let totalBlackSpend = 0, bursarySpend = 0, disabledSpend = 0;
  let learnershipCount = 0, absorbedCount = 0, totalBlackLearners = 0;
  for (const tr of trainings) {
    if (tr.isBlack) {
      totalBlackSpend += tr.cost;
      totalBlackLearners++;
      if (tr.category === 'bursary') bursarySpend += tr.cost;
      if (tr.isDisabled) disabledSpend += tr.cost;
      if (tr.category === 'learnership' || tr.category === 'internship') learnershipCount++;
      if (tr.isAbsorbed) absorbedCount++;
    }
  }

  const learningScore = targetOverall > 0 ? Math.min(t.learningProgrammesMaxPts, (totalBlackSpend / targetOverall) * t.learningProgrammesMaxPts) : 0;
  const bursaryScore = targetBursary > 0 ? Math.min(t.bursaryMaxPts, (bursarySpend / targetBursary) * t.bursaryMaxPts) : 0;
  const disabledScore = targetDisabled > 0 ? Math.min(t.disabledLearningMaxPts, (disabledSpend / targetDisabled) * t.disabledLearningMaxPts) : 0;

  const learnershipTarget = Math.max(totalBlackLearners * (t.learnershipTargetPercent / 100), 1);
  const learnershipScore = Math.min(t.learnershipsMaxPts, (learnershipCount / learnershipTarget) * t.learnershipsMaxPts);

  const absorptionRate = totalBlackLearners > 0 ? absorbedCount / totalBlackLearners : 0;
  const absorptionScore = Math.min(t.absorptionMaxPts, (absorptionRate / (t.absorptionTargetPercent / 100)) * t.absorptionMaxPts);

  const maxPts = cfg.pillarConfigs.skillsDevelopment.maxPoints;
  const total = Math.min(learningScore + bursaryScore + disabledScore + learnershipScore + absorptionScore, maxPts);
  const subMinThreshold = cfg.pillarConfigs.skillsDevelopment.subMinimumPercent / 100;
  return { total: r2(total), subMinMet: total >= (maxPts * subMinThreshold), totalBlackSpend };
}

export function calcProcurementSector(suppliers: ParseResult['suppliers'], tmps: number, cfg: SectorConfig) {
  const t = cfg.targets.procurement;
  let empoweringSpend = 0, qseSpend = 0, emeSpend = 0;
  let bo51Spend = 0, bwo30Spend = 0, dgSpend = 0;
  let recognisedSpend = 0;

  for (const s of suppliers) {
    const recognition = RECOGNITION_TABLE[s.beeLevel] || 0;
    recognisedSpend += s.spend * recognition;

    if (s.beeLevel >= 1 && s.beeLevel <= 4) empoweringSpend += s.spend;
    if (s.enterpriseType === 'qse') qseSpend += s.spend;
    if (s.enterpriseType === 'eme') emeSpend += s.spend;
    if (s.blackOwnership >= 0.51) bo51Spend += s.spend;
    if ((s.blackWomenOwnership ?? 0) >= 0.30) bwo30Spend += s.spend;
    if (s.blackOwnership >= 0.51) dgSpend += s.spend;
  }

  const empScore = tmps > 0 ? Math.min(t.allSuppliersMaxPts, (empoweringSpend / (tmps * t.allSuppliersTarget)) * t.allSuppliersMaxPts) : 0;
  const qseScore = tmps > 0 ? Math.min(t.qseMaxPts, (qseSpend / (tmps * t.qseTarget)) * t.qseMaxPts) : 0;
  const emeScore = tmps > 0 ? Math.min(t.emeMaxPts, (emeSpend / (tmps * t.emeTarget)) * t.emeMaxPts) : 0;
  const bo51Score = tmps > 0 ? Math.min(t.bo51MaxPts, (bo51Spend / (tmps * t.bo51Target)) * t.bo51MaxPts) : 0;
  const bwo30Score = tmps > 0 ? Math.min(t.bwo30MaxPts, (bwo30Spend / (tmps * t.bwo30Target)) * t.bwo30MaxPts) : 0;
  const dgScore = tmps > 0 ? Math.min(t.dgMaxPts, (dgSpend / (tmps * t.dgTarget)) * t.dgMaxPts) : 0;

  const maxPts = cfg.pillarConfigs.preferentialProcurement.maxPoints;
  const baseTotal = empScore + qseScore + emeScore + bo51Score + bwo30Score + dgScore;
  const total = Math.min(baseTotal, maxPts);
  const subMinThreshold = cfg.pillarConfigs.preferentialProcurement.subMinimumPercent / 100;
  return { total: r2(total), subMinMet: baseTotal >= (maxPts * subMinThreshold), recognisedSpend };
}

export function calcEsdSector(contributions: ParseResult['esdContributions'], npat: number, cfg: SectorConfig) {
  const t = cfg.targets.esd;
  const targetSD = npat * (t.sdPercent / 100);
  const targetED = npat * (t.edPercent / 100);
  let sdSpend = 0, edSpend = 0;
  for (const c of contributions) {
    if (c.amount <= 0) continue;
    if (c.category === 'supplier_development') sdSpend += c.amount;
    else edSpend += c.amount;
  }
  if (sdSpend + edSpend <= 0) return { total: 0, sdScore: 0, edScore: 0, totalContributions: 0 };

  const sdScore = targetSD > 0 ? Math.min(t.sdMaxPts, (sdSpend / targetSD) * t.sdMaxPts) : 0;
  const edScore = targetED > 0 ? Math.min(t.edMaxPts, (edSpend / targetED) * t.edMaxPts) : 0;
  const maxPts = (cfg.pillarConfigs.supplierDevelopment?.maxPoints ?? 0) + (cfg.pillarConfigs.enterpriseDevelopment?.maxPoints ?? 0);
  return { total: r2(Math.min(sdScore + edScore, maxPts || (sdScore + edScore))), sdScore: r2(sdScore), edScore: r2(edScore), totalContributions: sdSpend + edSpend };
}

export function calcSedSector(contributions: ParseResult['sedContributions'], npat: number, cfg: SectorConfig) {
  const t = cfg.targets.sed;
  const target = npat * (t.spendPercent / 100);
  const totalSpend = contributions.reduce((a, c) => a + (c.amount > 0 ? c.amount : 0), 0);
  if (totalSpend <= 0) return { total: 0, totalSpend: 0 };
  const score = target > 0 ? Math.min(t.maxPts, (totalSpend / target) * t.maxPts) : 0;
  return { total: r2(score), totalSpend };
}

export function determineLevelSector(totalPoints: number, cfg: SectorConfig): { level: number; label: string; recognition: number } {
  for (const t of cfg.levelThresholds) {
    if (totalPoints >= t.minPoints) return { level: t.level, label: `LEVEL ${t.level}`, recognition: t.recognition };
  }
  return { level: 9, label: 'Non-Compliant', recognition: 0 };
}
