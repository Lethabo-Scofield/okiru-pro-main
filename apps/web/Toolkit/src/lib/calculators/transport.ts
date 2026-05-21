/**
 * Transport QSE pillar calculators — aligned with
 * apps/api/pipeline/rules/pillarCalculators.ts (calcTransportQse*).
 */
import type { ManagementData, Employee } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { isBlackRace, safeRatio, clampScore, round2 } from './shared';
import { getEAPTargets, normalizeProvince } from './eapTargets';
import type { Province } from './eapTargets';

export interface TransportPillarResult {
  score: number;
  maxPoints: number;
}

const countBlack = (emps: Employee[]): number =>
  emps.filter(e => isBlackRace(e.race)).length;

const countBlackWomen = (emps: Employee[]): number =>
  emps.filter(e => isBlackRace(e.race) && e.gender === 'Female').length;

function pctOf(emps: Employee[], countFn: (e: Employee[]) => number): number {
  return emps.length > 0 ? countFn(emps) / emps.length : 0;
}

function groupByDesignation(employees: Employee[]): Record<string, Employee[]> {
  const groups: Record<string, Employee[]> = {};
  for (const emp of employees) {
    if (emp.isForeign) continue;
    (groups[emp.designation] ??= []).push(emp);
  }
  return groups;
}

export function isTransportQseSector(sectorCode?: string, scorecardType?: string): boolean {
  const sector = (sectorCode ?? '').toUpperCase();
  const type = (scorecardType ?? '').toUpperCase();
  return (sector === 'TRANSPORT' || sector.includes('TRANSPORT')) && type === 'QSE';
}

/** Top management black 50.1% = 25 pts + bonus black women 25% = 2 pts (max 27). */
export function calculateTransportQseManagement(
  data: ManagementData,
  config: CalculatorConfig,
): TransportPillarResult {
  const maxTotal = config.pillarConfigs?.managementControl?.maxPoints ?? 27;
  const employees = data.employees || [];
  const grouped = groupByDesignation(employees);

  const topMgmt = [
    ...(grouped['Board'] || []),
    ...(grouped['Executive'] || []),
    ...(grouped['Executive Director'] || []),
    ...(grouped['Other Executive Management'] || []),
    ...(grouped['Senior'] || []),
  ];

  const blackPct = pctOf(topMgmt, countBlack);
  const bwPct = pctOf(topMgmt, countBlackWomen);
  let score = clampScore(safeRatio(blackPct, 0.501, 25), 25);
  score += clampScore(safeRatio(bwPct, 0.25, 2), 2);

  const result = { score: round2(clampScore(score, maxTotal)), maxPoints: maxTotal };
  console.log('[SCORING-TRACE] calculateTransportQseManagement result:', `${result.score} / ${result.maxPoints}`);
  return result;
}

/** EE pillar: black mgmt 7.5 + black women mgmt 7.5 + black employees 5 + black women employees 5 + EAP bonus 2 (max 27). */
export function calculateTransportQseEmploymentEquity(
  data: ManagementData,
  config: CalculatorConfig,
  eapProvince?: string,
): TransportPillarResult {
  const maxTotal = config.pillarConfigs?.employmentEquity?.maxPoints ?? 27;
  const employees = (data.employees || []).filter(e => !e.isForeign);
  const grouped = groupByDesignation(data.employees || []);

  const mgmtDesignations = new Set([
    'Board', 'Executive', 'Executive Director', 'Other Executive Management', 'Senior', 'Middle', 'Junior',
  ]);
  const mgmt = employees.filter(e => mgmtDesignations.has(e.designation));
  const juniorAll = [
    ...(grouped['Junior'] || []),
    ...(grouped['Semi-skilled'] || []),
    ...(grouped['Unskilled'] || []),
  ].filter(e => !e.isForeign);

  const senior = (grouped['Senior'] || []).filter(e => !e.isForeign);
  const middle = (grouped['Middle'] || []).filter(e => !e.isForeign);

  const province = normalizeProvince(eapProvince || 'National') as Province;
  const seniorEAP = getEAPTargets(province, 'Senior');
  const middleEAP = getEAPTargets(province, 'Middle');
  const juniorEAP = getEAPTargets(province, 'Junior');

  let score = 0;
  score += clampScore(safeRatio(pctOf(mgmt, countBlack), 0.4, 7.5), 7.5);
  score += clampScore(safeRatio(pctOf(mgmt, countBlackWomen), 0.2, 7.5), 7.5);
  score += clampScore(safeRatio(pctOf(employees, countBlack), 0.6, 5), 5);
  score += clampScore(safeRatio(pctOf(employees, countBlackWomen), 0.3, 5), 5);

  const bonus =
    pctOf(senior, countBlack) >= seniorEAP.blackTarget &&
    pctOf(senior, countBlackWomen) >= seniorEAP.blackWomenTarget &&
    pctOf(middle, countBlack) >= middleEAP.blackTarget &&
    pctOf(middle, countBlackWomen) >= middleEAP.blackWomenTarget &&
    (juniorAll.length === 0 ||
      (pctOf(juniorAll, countBlack) >= juniorEAP.blackTarget &&
        pctOf(juniorAll, countBlackWomen) >= juniorEAP.blackWomenTarget))
      ? 2
      : 0;
  score += bonus;

  const result = { score: round2(clampScore(score, maxTotal)), maxPoints: maxTotal };
  console.log('[SCORING-TRACE] calculateTransportQseEmploymentEquity result:', `${result.score} / ${result.maxPoints}`);
  return result;
}
