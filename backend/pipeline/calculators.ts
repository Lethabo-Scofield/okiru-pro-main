import type { ParseResult } from './excelParser.js';

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const RECOGNITION_TABLE: Record<number, number> = {
  1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00,
  5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0
};

const GRADUATION_TABLE: Record<number, number> = {
  1: 0.1, 2: 0.2, 3: 0.4, 4: 0.6,
  5: 0.8, 6: 1.0, 7: 1.0, 8: 1.0, 9: 1.0, 10: 1.0
};

function getGraduationFactor(years: number): number {
  if (years <= 0) return 0;
  let factor = 0;
  for (const y of Object.keys(GRADUATION_TABLE).map(Number).sort((a, b) => a - b)) {
    if (y <= years) factor = GRADUATION_TABLE[y]; else break;
  }
  return factor;
}

export function calcOwnership(shareholders: ParseResult['shareholders'], companyValue = 0, outstandingDebt = 0, yearsHeld = 0) {
  if (shareholders.length === 0) {
    return { total: 0, subMinMet: false, blackOwnership: 0, blackWomenOwnership: 0, economicInterest: 0 };
  }

  const totalSharesRaw = shareholders.reduce((a, s) => a + (s.shares || 0), 0);
  const hasShares = totalSharesRaw > 0;

  let shareholdingWeights: number[];
  if (hasShares) {
    shareholdingWeights = shareholders.map(s => (s.shares || 0) / totalSharesRaw);
  } else {
    const n = shareholders.length;
    shareholdingWeights = shareholders.map(() => 1 / n);
  }

  let totalBlackVoting = 0, totalBlackWomenVoting = 0, totalEI = 0, netValueAgg = 0;

  for (let i = 0; i < shareholders.length; i++) {
    const sh = shareholders[i];
    const weight = shareholdingWeights[i];

    totalBlackVoting += weight * sh.blackOwnership;
    totalBlackWomenVoting += weight * sh.blackWomenOwnership;
    totalEI += weight * sh.blackOwnership;

    const debtAttr = outstandingDebt * weight;
    const carrying = (sh.shareValue || 0) * weight;
    const allocated = companyValue * weight;
    if (carrying > 0 && sh.blackOwnership > 0) {
      netValueAgg += Math.max(0, (allocated - debtAttr) / carrying) * sh.blackOwnership;
    }
  }

  const hasNetValue = companyValue > 0 && shareholders.some(s => (s.shareValue || 0) > 0);

  const votingTarget = 0.25;
  const votingPts = Math.min((totalBlackVoting / votingTarget) * 4, 4);
  const womenTarget = 0.10;
  const womenPts = Math.min((totalBlackWomenVoting / womenTarget) * 2, 2);

  let eiPts: number;
  const eiTarget = 0.25;
  if (yearsHeld > 0) {
    const gradFactor = getGraduationFactor(yearsHeld);
    const adjustedTarget = eiTarget * gradFactor;
    eiPts = adjustedTarget > 0 ? Math.min((totalEI / adjustedTarget) * 8, 8) : Math.min((totalEI / eiTarget) * 8, 8);
  } else {
    eiPts = Math.min((totalEI / eiTarget) * 8, 8);
  }

  let nvPts: number;
  if (hasNetValue) {
    nvPts = Math.min(netValueAgg * 8, 8);
  } else {
    nvPts = totalBlackVoting >= 1.0 ? 8 : Math.min((totalBlackVoting / 0.25) * 8, 8);
  }

  const subMinMet = nvPts >= 3.2 || (totalBlackVoting >= 0.4 * 0.25 && nvPts >= 3.2) || totalBlackVoting >= 1.0;
  const total = Math.min(votingPts + womenPts + eiPts + nvPts, 25);

  return { total, subMinMet, blackOwnership: totalBlackVoting, blackWomenOwnership: totalBlackWomenVoting, economicInterest: totalEI };
}

export function calcManagementAndEE(employees: ParseResult['employees']) {
  const isBlack = (r: string) => ['African', 'Coloured', 'Indian'].includes(r);
  const grouped: Record<string, typeof employees> = {};
  for (const e of employees) {
    const d = e.designation || 'Junior';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(e);
  }

  const board = grouped['Board'] || [];
  const exec = grouped['Executive'] || [];
  const senior = grouped['Senior'] || [];
  const middle = grouped['Middle'] || [];
  const junior = grouped['Junior'] || [];

  const countBlack = (arr: typeof employees) => arr.filter(e => isBlack(e.race)).length;
  const countBW = (arr: typeof employees) => arr.filter(e => isBlack(e.race) && e.gender === 'Female').length;
  const countDisabled = (arr: typeof employees) => arr.filter(e => e.isDisabled).length;

  let boardBlackPts = 0, boardBWPts = 0;
  if (board.length > 0) {
    const blackPct = countBlack(board) / board.length;
    const bwPct = countBW(board) / board.length;
    boardBlackPts = blackPct >= 0.5 ? 1 : 0;
    boardBWPts = bwPct >= 0.25 ? 1 : 0;
  }

  let execBlackPts = 0, execBWPts = 0;
  if (exec.length > 0) {
    const blackPct = countBlack(exec) / exec.length;
    const bwPct = countBW(exec) / exec.length;
    execBlackPts = Math.min(2, (blackPct / 0.6) * 2);
    execBWPts = Math.min(2, (bwPct / 0.3) * 2);
  }

  const mcTotal = Math.min(8, r2(boardBlackPts + boardBWPts + execBlackPts + execBWPts));

  let seniorBlackPts = 0;
  if (senior.length > 0) {
    seniorBlackPts = Math.min(5, (countBlack(senior) / senior.length) * 5);
  }

  let middleBlackPts = 0;
  if (middle.length > 0) {
    middleBlackPts = Math.min(4, (countBlack(middle) / middle.length) * 4);
  }

  let juniorBlackPts = 0;
  if (junior.length > 0) {
    juniorBlackPts = Math.min(4, (countBlack(junior) / junior.length) * 4);
  }

  const disabledAll = countDisabled(employees);
  const disabledPct = employees.length > 0 ? disabledAll / employees.length : 0;
  const disabledPts = Math.min(2, disabledPct >= 0.02 ? 2 : (disabledPct / 0.02) * 2);

  const eeTotal = Math.min(11, r2(seniorBlackPts + middleBlackPts + juniorBlackPts + disabledPts));

  return {
    mcTotal,
    eeTotal,
    combinedTotal: r2(mcTotal + eeTotal),
    blackBoardPct: board.length ? countBlack(board) / board.length : 0,
    blackExecPct: exec.length ? countBlack(exec) / exec.length : 0,
    disabledPct: employees.length ? disabledAll / employees.length : 0,
  };
}

export function calcSkills(trainings: ParseResult['trainingPrograms'], leviableAmount: number) {
  const targetOverall = leviableAmount * 0.035;
  const targetBursary = leviableAmount * 0.025;
  let totalBlackSpend = 0, bursarySpend = 0;

  for (const t of trainings) {
    if (t.isBlack) {
      totalBlackSpend += t.cost;
      if (t.category === 'bursary') bursarySpend += t.cost;
    }
  }

  const generalScore = targetOverall > 0 ? Math.min(20, (totalBlackSpend / targetOverall) * 20) : 0;
  const bursaryScore = targetBursary > 0 ? Math.min(5, (bursarySpend / targetBursary) * 5) : 0;
  const total = Math.min(generalScore + bursaryScore, 25);
  const subMinMet = generalScore >= 8;

  return { total, subMinMet, totalBlackSpend };
}

export function calcProcurement(suppliers: ParseResult['suppliers'], tmps: number) {
  const target = tmps * 0.8;
  let recognisedSpend = 0, bonusPoints = 0;

  for (const s of suppliers) {
    const recognition = RECOGNITION_TABLE[s.beeLevel] || 0;
    recognisedSpend += s.spend * recognition;
    if (s.blackOwnership >= 0.51) bonusPoints += (s.spend / Math.max(tmps, 1)) * 2;
  }

  const baseScore = target > 0 ? Math.min(25, (recognisedSpend / target) * 25) : 0;
  const bonus = Math.min(2, bonusPoints);
  const total = Math.min(baseScore + bonus, 27);
  const subMinMet = baseScore >= 10;

  return { total, subMinMet, recognisedSpend };
}

function getBenefitFactor(type: string): number {
  switch (type) {
    case 'grant': return 1.0;
    case 'grant_contribution': return 1.0;
    case 'interest_free_loan': return 0.7;
    case 'professional_services': return 0.8;
    default: return 1.0;
  }
}

export function calcEsd(contributions: ParseResult['esdContributions'], npat: number) {
  const targetSD = npat * 0.02;
  const targetED = npat * 0.01;
  let sdSpend = 0, edSpend = 0;

  for (const c of contributions) {
    if (c.amount <= 0) continue;
    const recognized = c.amount * getBenefitFactor(c.type);
    if (c.category === 'supplier_development') sdSpend += recognized;
    else edSpend += recognized;
  }

  const totalContributions = sdSpend + edSpend;
  if (totalContributions <= 0) return { total: 0, totalContributions: 0 };

  const sdScore = targetSD > 0 ? Math.min(10, (sdSpend / targetSD) * 10) : 0;
  const edScore = targetED > 0 ? Math.min(5, (edSpend / targetED) * 5) : 0;
  const total = Math.min(sdScore + edScore, 15);
  return { total, totalContributions };
}

export function calcSed(contributions: ParseResult['sedContributions'], npat: number) {
  const target = npat * 0.01;
  const totalSpend = contributions.reduce((a, c) => a + (c.amount > 0 ? c.amount : 0), 0);
  if (totalSpend <= 0) return { total: 0, totalSpend: 0 };
  const score = target > 0 ? Math.min(5, (totalSpend / target) * 5) : 0;
  return { total: score, totalSpend };
}
