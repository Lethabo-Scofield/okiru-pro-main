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

export function calcMCSector(employees: ParseResult['employees'], cfg: SectorConfig) {
  const isBlack = (r: string) => ['African', 'Coloured', 'Indian'].includes(r);
  const grouped: Record<string, typeof employees> = {};
  for (const e of employees) { const d = e.designation || 'Junior'; if (!grouped[d]) grouped[d] = []; grouped[d].push(e); }

  const board = grouped['Board'] || [];
  const exec = grouped['Executive'] || [];
  const t = cfg.targets.managementControl;

  const countBlack = (arr: typeof employees) => arr.filter(e => isBlack(e.race)).length;
  const countBW = (arr: typeof employees) => arr.filter(e => isBlack(e.race) && e.gender === 'Female').length;

  let boardBlackPts = 0, boardBWPts = 0;
  if (board.length > 0) {
    boardBlackPts = Math.min(t.boardBlackMaxPts, (countBlack(board) / board.length / t.boardBlackTarget) * t.boardBlackMaxPts);
    boardBWPts = Math.min(t.boardBWMaxPts, (countBW(board) / board.length / t.boardBWTarget) * t.boardBWMaxPts);
  }

  let execBlackPts = 0, execBWPts = 0;
  if (exec.length > 0) {
    execBlackPts = Math.min(t.execBlackMaxPts, (countBlack(exec) / exec.length / t.execBlackTarget) * t.execBlackMaxPts);
    execBWPts = Math.min(t.execBWMaxPts, (countBW(exec) / exec.length / t.execBWTarget) * t.execBWMaxPts);
  }

  const maxPts = cfg.pillarConfigs.managementControl.maxPoints;
  return r2(Math.min(maxPts, boardBlackPts + boardBWPts + execBlackPts + execBWPts));
}

export function calcEESector(employees: ParseResult['employees'], cfg: SectorConfig) {
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

  const maxPts = cfg.pillarConfigs.employmentEquity.maxPoints;
  return r2(Math.min(maxPts, srPts + mdPts + jrPts + disPts));
}

export function calcSkillsSector(trainings: ParseResult['trainingPrograms'], leviableAmount: number, cfg: SectorConfig) {
  const t = cfg.targets.skills;
  const targetOverall = leviableAmount * (t.overallSpendPercent / 100);
  const targetBursary = leviableAmount * (t.bursarySpendPercent / 100);
  let totalBlackSpend = 0, bursarySpend = 0;
  for (const tr of trainings) {
    if (tr.isBlack) {
      totalBlackSpend += tr.cost;
      if (tr.category === 'bursary') bursarySpend += tr.cost;
    }
  }

  const generalScore = targetOverall > 0 ? Math.min(t.overallMaxPts, (totalBlackSpend / targetOverall) * t.overallMaxPts) : 0;
  const bursaryScore = targetBursary > 0 ? Math.min(t.bursaryMaxPts, (bursarySpend / targetBursary) * t.bursaryMaxPts) : 0;
  const maxPts = cfg.pillarConfigs.skillsDevelopment.maxPoints;
  const total = Math.min(generalScore + bursaryScore, maxPts);
  const subMinThreshold = cfg.pillarConfigs.skillsDevelopment.subMinimumPercent / 100;
  return { total: r2(total), subMinMet: generalScore >= (t.overallMaxPts * subMinThreshold), totalBlackSpend };
}

export function calcProcurementSector(suppliers: ParseResult['suppliers'], tmps: number, cfg: SectorConfig) {
  const target = tmps * 0.8;
  let recognisedSpend = 0, bonusPoints = 0;
  for (const s of suppliers) {
    const recognition = RECOGNITION_TABLE[s.beeLevel] || 0;
    recognisedSpend += s.spend * recognition;
    if (s.blackOwnership >= 0.51) bonusPoints += (s.spend / Math.max(tmps, 1)) * 2;
  }

  const maxPts = cfg.pillarConfigs.preferentialProcurement.maxPoints;
  const baseMax = maxPts - cfg.targets.procurement.bonusMaxPts;
  const baseScore = target > 0 ? Math.min(baseMax, (recognisedSpend / target) * baseMax) : 0;
  const bonus = Math.min(cfg.targets.procurement.bonusMaxPts, bonusPoints);
  const total = Math.min(baseScore + bonus, maxPts);
  const subMinThreshold = cfg.pillarConfigs.preferentialProcurement.subMinimumPercent / 100;
  return { total: r2(total), subMinMet: baseScore >= (baseMax * subMinThreshold), recognisedSpend };
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
  if (sdSpend + edSpend <= 0) return { total: 0, totalContributions: 0 };

  const sdScore = targetSD > 0 ? Math.min(t.sdMaxPts, (sdSpend / targetSD) * t.sdMaxPts) : 0;
  const edScore = targetED > 0 ? Math.min(t.edMaxPts, (edSpend / targetED) * t.edMaxPts) : 0;
  const maxPts = cfg.pillarConfigs.enterpriseSupplierDevelopment.maxPoints;
  return { total: r2(Math.min(sdScore + edScore, maxPts)), totalContributions: sdSpend + edSpend };
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
