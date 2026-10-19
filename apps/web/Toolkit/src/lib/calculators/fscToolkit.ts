/**
 * FSC (Amended Financial Sector Code) scored the way its Empower toolkit
 * — "BBBEE Toolkit (FSC) Template v1.0" — scores it, checked line by line
 * against the workbook recalculated by Excel (docs/toolkits/parity, the FSC
 * cases). Selected by CalculatorConfig.fscToolkit; no other sector reaches
 * this file.
 *
 * Where the FSC template's arithmetic matches RCOGP Generic's toolkit, the
 * shared calculators score it (ownership's toolkit method, procurement, ESD).
 * What is FSC's own lives here:
 *  - net value: unencumbered black ownership against 25%, plus each indebted
 *    black stake's net value graduated by its loan term (Formula A, capped by
 *    Formula B) — 'Ownership Scorecard'!J17, 'Oustanding Debts Calcs';
 *  - management control by headcount, with the management bands' points
 *    moving to other bands when a band has nobody in it ('MC Calcs
 *    (Toolkit)'), and African sub-lines against the African share of the EAP;
 *  - skills spend per management level against that level's payroll, plus
 *    unemployed / disabled spend and learnership / absorption headcounts;
 *  - the procurement bonuses for intermediated black professional services
 *    and black stock brokers / fund managers (against the allocated trade value);
 *  - SED, consumer education, additional consumer education and the Fundisa
 *    Retail Fund as separate lines (one table, split by its Pillar column);
 *  - level thresholds scaled to the scorecard's own base points
 *    ('Scorecard Calculations'!Y3:Y10 = W ÷ 111 × F12).
 *
 * Where the template's formulas are evidently broken they are not copied; each
 * is listed in docs/toolkits/parity/findings/fsc.md and reworked by the parity
 * referee (lib/parity/toolkitParity.fsc.ts) from the toolkit's own figures.
 */
import type {
  AfsData, EmpowermentFinancingData, BreakdownLine, Client, Contribution, Employee, ManagementData, OwnershipData, ProcurementData,
  ScorecardResult, SEDData, SkillsData, Supplier, TrainingProgram, ESDData,
} from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { ownershipHolderWeights } from './ownership';
import { calculateProcurementScore, qualifiesForEnhancedRecognition } from './procurement';
import { calculateEsdScore } from './esd-sed';
import { calculateYESScore } from './yes';
import { calculateAfsScore } from './afs';
import { clampScore, isBlackRace, normalizeDesignationForScoring, round2 } from './shared';
import { getEffectiveEap, normalizeProvince, type Province } from './eapTargets';
import { parseCalcDate, yearFrac30360US } from './toolkitDates';
import { toBreakdownLines } from './breakdown';
import { formatRand, ratioLineNote } from './calcNotes';
import {
  benefitFactorFor,
  canonicalContributionType,
  TOOLKIT_BENEFIT_FACTORS_SED,
  EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES,
} from '../../../../../api/pipeline/rules/benefitFactors';

export type FscSubSector = 'Others' | 'Banks' | 'LTI' | 'STI';

export interface FscScorecardInput {
  client: Client;
  ownership: OwnershipData;
  management: ManagementData;
  skills: SkillsData;
  procurement: ProcurementData;
  esd: ESDData;
  sed: SEDData;
  afs: import('../types').AfsData;
  empowermentFinancing: import('../types').EmpowermentFinancingData;
  ignoreSubMinimum?: boolean;
}

interface Line { name: string; target: string; weighting: number; score: number; isBonus?: boolean; note?: string }

const pct = (f: number, dp = 1): string => `${Number((f * 100).toFixed(dp))}%`;
/** MIN(actual ÷ target × points, points), 0 where the target is 0 (the toolkit's IFERROR). */
const pts = (actual: number, target: number, max: number): number =>
  target > 0 && Number.isFinite(actual) ? Math.min((actual / target) * max, max) : 0;
const isBlackSa = (race: string | null | undefined, foreign: boolean | undefined): boolean =>
  isBlackRace(race) && !foreign;

// ─────────────────────────────────────────────────────────────────────────────
// Ownership
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 'Ownership Calcs Formula'!A3:B11 — graduation factor by loan year. The
 * table stops at year 9 (100%); a loan in its tenth year or later is fully
 * graduated (the toolkit's lookup finds nothing there and scores the stake 0).
 */
const NET_VALUE_GRADUATION: Record<number, number> = {
  1: 0.1, 2: 0.2, 3: 0.4, 4: 0.5, 5: 0.6, 6: 0.7, 7: 0.8, 8: 0.9, 9: 1.0,
};
const graduationFor = (year: number) => (year >= 9 ? 1 : NET_VALUE_GRADUATION[year] ?? 0);

/**
 * Ownership ('Ownership Scorecard', 'Ownership Data', 'Oustanding Debts
 * Calcs'): holders weighed by share value; each black holder's acquisition
 * debt netted against the company value, the stake counting in full once its
 * net value reaches 40% of it (the toolkit's first debt row — its later rows
 * use another formula, and credit the whole stake as black), for the black
 * share of the stake only.
 */
export function fscOwnership(data: OwnershipData, cfg: CalculatorConfig, sub: FscSubSector, dataDate: string | undefined) {
  void cfg;
  const others = sub === 'Others';
  const eiMax = others ? 4 : 3;
  const neMax = others ? 2 : 3;
  const nvMax = others ? 8 : 6;
  const holders = data.shareholders || [];
  const { weights } = ownershipHolderWeights(holders);
  const value = Number(data.companyValue) > 0 ? Number(data.companyValue) : 0;
  const asOf = parseCalcDate(dataDate);
  const frac = (v: unknown) => Math.max(0, Number(v) || 0);
  let black = 0, women = 0, designated = 0, entrants = 0;
  let free = 0, freeWomen = 0, netBlack = 0, netWomen = 0;
  let formulaA = 0, formulaBRaw = 0;
  const debtNotes: string[] = [];
  holders.forEach((sh, i) => {
    const w = weights[i] ?? 0;
    const bo = frac(sh.blackOwnership);
    const bwo = frac(sh.blackWomenOwnership);
    black += w * bo;
    women += w * bwo;
    designated += w * (sh.designatedGroupOwnership != null ? frac(sh.designatedGroupOwnership) : sh.isDesignatedGroup ? bo : 0);
    entrants += w * (sh.blackNewEntrantOwnership != null ? frac(sh.blackNewEntrantOwnership) : sh.blackNewEntrant ? bo : 0);
    const debt = frac(sh.outstandingDebt);
    if (!(bo > 0 && debt > 0)) { free += w * bo; freeWomen += w * bwo; return; }
    if (value <= 0 || w <= 0) return;
    const deemed = (value * w - debt) / value;
    const credited = w * Math.min(1, deemed / (0.4 * w)) * bo;
    netBlack += credited;
    netWomen += deemed * bwo;
    // The loan's year (ROUNDUP(term + 1)); no loan date reads as year 1.
    const loan = parseCalcDate(sh.loanDate);
    const year = loan && asOf ? Math.ceil(yearFrac30360US(loan, asOf) + 1 - 1e-12) : 1;
    const g = graduationFor(year);
    const a = g > 0 ? Math.max(Math.min((credited * 8) / (0.25 * g), 8), 0) : 0;
    formulaA += a;
    formulaBRaw += (credited / 0.25) * 8;
    debtNotes.push(`${sh.name}: net ${pct(credited, 2)} of the company, loan year ${year} (graduation ${pct(g, 0)}) → Formula A ${a.toFixed(2)}`);
  });
  const ei = free + netBlack;
  const eiWomen = freeWomen + netWomen;
  const lines: Line[] = [];
  const add = (name: string, measure: number, target: number, max: number, what: string, isBonus = false) => {
    const score = Math.max(pts(measure, target, max), 0);
    lines.push({ name, target: pct(target, 0), weighting: max, score, isBonus: isBonus || undefined,
      note: `${what} ${pct(measure, 2)} ÷ ${pct(target, 0)} × ${max} = ${score.toFixed(2)}` });
  };
  add('Exercisable voting rights of black individuals', black, 0.25, 4, 'Black voting rights');
  add('Exercisable voting rights of black females', women, 0.10, 2, "Black women's voting rights");
  add('Economic interest of black individuals', ei, 0.25, eiMax, 'Black economic interest after acquisition debt');
  add('Economic interest of black females', eiWomen, 0.10, 2, "Black women's economic interest after acquisition debt");
  add('Economic interest of black designated groups or participants in ownership schemes', designated, 0.03, 3, "Designated groups' economic interest");
  add('Economic interest of black new entrants', entrants, 0.02, neMax, "Black new entrants' economic interest");

  // Net value ('Ownership Scorecard'!J17): unencumbered black economic
  // interest against the 25% target, plus the indebted black stakes' net
  // value — Formula A (graduated by the loan's year) or Formula B, the lesser
  // — at most 8.
  const formulaB = Math.min(formulaBRaw, 8);
  const unencumbered = Math.min((free / 0.25) * nvMax, nvMax);
  const netValue = Math.min(unencumbered + Math.min(formulaA, formulaB), 8);
  const subMinThreshold = nvMax * 0.4;
  lines.push({
    name: 'Net value',
    target: `≥ ${subMinThreshold} pts`,
    weighting: nvMax,
    score: netValue,
    note: `Unencumbered black economic interest ${pct(free, 2)} ÷ 25% × ${nvMax} = ${unencumbered.toFixed(2)}`
      + (debtNotes.length ? `; indebted black stakes: ${debtNotes.join('; ')}; Formula A ${formulaA.toFixed(2)}, Formula B ${formulaB.toFixed(2)} → the lesser` : '')
      + `. Sub-minimum ${subMinThreshold} points: ${netValue >= subMinThreshold ? 'met' : 'not met'}.`,
  });
  if (!others) {
    // Bonus: voting rights beyond 15% (against 10%, 3 points), and economic
    // interest at 32.5% (1 point) or 40% (2 points).
    add('Direct / indirect ownership in excess of 15%', black > 0 ? black - 0.15 : 0, 0.10, 3, 'Black voting rights above 15%', true);
    const tier = ei >= 0.4 ? 2 : ei >= 0.325 ? 1 : 0;
    lines.push({ name: 'Economic interest and voting rights above 32.5%', target: '32.5% / 40%', weighting: 2, score: tier, isBonus: true,
      note: `Black economic interest ${pct(ei, 2)}: ${tier} of 2 (1 point at 32.5%, 2 at 40%).` });
  }
  const exact = lines.reduce((acc, l) => acc + l.score, 0);
  return { lines, exact, netValue, subMinimumMet: netValue >= subMinThreshold, max: lines.reduce((acc, l) => acc + l.weighting, 0) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Management control ('MC Toolkit', 'MC Calcs (Toolkit)')
// ─────────────────────────────────────────────────────────────────────────────

type Band = 'otherExec' | 'senior' | 'middle' | 'junior';

/**
 * Points per management band. A band nobody is employed in is "not
 * included": its points move to the bands that are, and the other-executive
 * band takes 10 + 4 when no senior, middle or junior manager is employed.
 */
export function fscManagementBandPoints(included: Record<'senior' | 'middle' | 'junior', boolean>, combined: boolean) {
  const base = {
    black: { senior: 2, middle: 2, junior: 1 },
    female: { senior: 1, middle: 1, junior: 1 },
    african: { senior: 1, middle: 1, junior: 1 },
  } as const;
  const bands = ['senior', 'middle', 'junior'] as const;
  // Bands that count for the reallocation: senior only when not combined.
  const pool = combined ? (['middle', 'junior'] as const) : bands;
  const out = {} as Record<'black' | 'female' | 'african', Record<Band, number>>;
  for (const kind of ['black', 'female', 'african'] as const) {
    const k: Record<'senior' | 'middle' | 'junior', number> = {
      senior: !combined && included.senior ? base[kind].senior : 0,
      middle: included.middle ? base[kind].middle : 0,
      junior: included.junior ? base[kind].junior : 0,
    };
    const sumOthers = k.senior + k.middle + k.junior;
    const sumMJ = k.middle + k.junior;
    let otherExec: number;
    if (kind === 'black') otherExec = combined && included.senior && sumMJ > 0 ? 3 : sumOthers === 0 ? 10 : 2;
    else if (kind === 'female') otherExec = combined && included.senior && sumMJ > 0 ? 2 : sumOthers === 0 ? 4 : 1;
    else otherExec = combined && included.senior && sumMJ > 0 ? 2 : 0;
    const includedCount = pool.filter((b) => included[b]).length;
    const notIncludedPts = includedCount === 0 ? 0 : pool.filter((b) => !included[b]).reduce((s, b) => s + base[kind][b], 0);
    const share = includedCount > 0 ? notIncludedPts / includedCount : 0;
    out[kind] = {
      otherExec,
      senior: !included.senior || combined ? 0 : k.senior + share,
      middle: !included.middle ? 0 : k.middle + share,
      junior: !included.junior ? 0 : k.junior + share,
    };
  }
  return out;
}

export function fscManagement(data: ManagementData, province: string | undefined, eapYear: number | undefined) {
  const employees = data.employees || [];
  const combined = data.combineExcoSenior === true;
  const by = (d: string) => employees.filter((e) => normalizeDesignationForScoring(e.designation) === d);
  const board = [...by('Board'), ...by('Executive'), ...by('Executive Director')];
  const execDirs = [...by('Executive'), ...by('Executive Director')];
  const otherExecOnly = by('Other Executive Management');
  const senior = by('Senior');
  const middle = by('Middle');
  const junior = by('Junior');
  const included = { senior: senior.length > 0, middle: middle.length > 0, junior: junior.length > 0 };
  const points = fscManagementBandPoints(included, combined);

  const black = (e: Employee) => isBlackSa(e.race, e.isForeign);
  const share = (emps: Employee[], f: (e: Employee) => boolean) => (emps.length > 0 ? emps.filter(f).length / emps.length : 0);
  const isBlack = black;
  const isBlackFemale = (e: Employee) => black(e) && e.gender === 'Female';
  const isAfrican = (e: Employee) => black(e) && String(e.race).trim() === 'African';

  const eff = getEffectiveEap(normalizeProvince(province || 'National') as Province, eapYear);
  const africanEap = (eff.AM ?? 0) + (eff.AF ?? 0);

  const lines: Line[] = [];
  const add = (name: string, actual: number, target: number, max: number, detail: string) => {
    const score = pts(actual, target, max);
    lines.push({ name, target: pct(target), weighting: max, score, note: `${detail}: ${pct(actual)} ÷ ${pct(target)} × ${round2(max)} = ${score.toFixed(2)}` });
  };
  add('Exercisable voting rights of black board members', share(board, isBlack), 0.5, 2, 'Black board members by headcount');
  add('Exercisable voting rights of black female board members', share(board, isBlackFemale), 0.25, 1, 'Black women board members by headcount');
  add('Black executive directors', share(execDirs, isBlack), 0.5, 2, 'Black executive directors');
  add('Black female executive directors', share(execDirs, isBlackFemale), 0.25, 1, 'Black women executive directors');

  // Other executive management, combined with senior management when the
  // entity does not distinguish them and employs senior managers.
  const otherExec = combined && included.senior ? [...otherExecOnly, ...senior] : otherExecOnly;
  const oe = points;
  const oeBlackTarget = oe.black.otherExec === 10 ? 0.75 : 0.60;
  const oeFemaleTarget = oe.female.otherExec === 4 ? 0.38 : 0.30;
  const oeAfricanTarget = oe.african.otherExec === 0 ? 0 : africanEap * 0.60;
  const label = combined && included.senior ? 'other executive & senior management' : 'other executive management';
  add('Black other executive management', share(otherExec, isBlack), oeBlackTarget, oe.black.otherExec, `Black ${label}`);
  add('Black female other executive management', share(otherExec, isBlackFemale), oeFemaleTarget, oe.female.otherExec, `Black women in ${label}`);
  add('Black African other executive management', combined && included.senior ? share(otherExec, isAfrican) : 0, oeAfricanTarget, oe.african.otherExec, `Africans in ${label}`);

  const bandLines = (band: 'senior' | 'middle' | 'junior', emps: Employee[], tBlack: number, tFemale: number, title: string) => {
    const counted = band === 'senior' && combined ? [] : emps;
    const on = included[band] && !(band === 'senior' && combined);
    add(`Black employees in ${title}`, share(counted, isBlack), on ? tBlack : 0, points.black[band], `Black ${title}`);
    add(`Black female employees in ${title}`, share(counted, isBlackFemale), on ? tFemale : 0, points.female[band], `Black women in ${title}`);
    add(`Black African employees in ${title}`, share(counted, isAfrican), on ? africanEap * tBlack : 0, points.african[band], `Africans in ${title} (target ${pct(tBlack, 0)} of the African EAP share ${pct(africanEap)})`);
  };
  bandLines('senior', senior, 0.60, 0.30, 'senior management');
  bandLines('middle', middle, 0.75, 0.38, 'middle management');
  bandLines('junior', junior, 0.88, 0.44, 'junior management');

  // Disability: black employees with a disability over every employee
  // (non-executive directors are not employees).
  const staff = employees.filter((e) => normalizeDesignationForScoring(e.designation) !== 'Board');
  const disabledShare = staff.length > 0 ? staff.filter((e) => e.isDisabled && black(e)).length / staff.length : 0;
  add('Black employees with disabilities', disabledShare, 0.02, 1, 'Black employees with disabilities');

  const exact = lines.reduce((s, l) => s + l.score, 0);
  const max = lines.reduce((s, l) => s + l.weighting, 0);
  return { lines, exact, max };
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills ('Skills Toolkit')
// ─────────────────────────────────────────────────────────────────────────────

interface SkillsRow {
  black: boolean; female: boolean; african: boolean; disabled: boolean;
  position: string; employed: boolean; lai: boolean; completed: boolean; absorbed: boolean;
  /** Category A-F course cost + B/C/D salaries. */
  af: number;
  /** Category G costs + other legitimate costs (travel, accommodation …; not for category A). */
  gOther: number;
}

function skillsRow(p: TrainingProgram): SkillsRow {
  const cat = String(p.categoryCode ?? '').trim().toUpperCase();
  const extras = (p.travelCost || 0) + (p.accommodationCost || 0) + (p.cateringCost || 0)
    + (p.stationeryCost || 0) + (p.facilityCost || 0) + (p.otherCosts || 0);
  const lai = cat === 'B' || cat === 'C' || cat === 'D';
  const af = (cat === 'G' ? 0 : (p.courseCost || 0)) + (lai ? (p.salaryCost || 0) : 0);
  const gOther = cat === 'G' ? (p.courseCost || 0) + extras : cat === 'A' ? 0 : extras;
  const black = isBlackSa(p.race, p.isForeign);
  return {
    black,
    female: black && p.gender === 'Female',
    african: black && String(p.race).trim() === 'African',
    disabled: Boolean(p.isDisabled),
    position: String(p.managementPosition ?? '').trim(),
    employed: p.employmentStatus !== 'Unemployed',
    lai,
    completed: Boolean(p.isCompleted),
    absorbed: Boolean(p.isAbsorbed),
    af,
    gOther,
  };
}

const LEVELS = [
  { key: 'execSenior', positions: ['Executive Management', 'Senior Management'], title: 'senior & executive management', black: [0.02, 1], female: [0.01, 0.5], african: 0.5, demo: ['seniorBlack', 'seniorFemale', 'seniorAfrican'] },
  { key: 'middle', positions: ['Middle Management'], title: 'middle management', black: [0.03, 1], female: [0.015, 0.5], african: 0.5, demo: ['middleBlack', 'middleFemale', 'middleAfrican'] },
  { key: 'junior', positions: ['Junior Management'], title: 'junior management', black: [0.05, 1], female: [0.025, 1], african: 1, demo: ['juniorBlack', 'juniorFemale', 'juniorAfrican'] },
  { key: 'nonManagement', positions: ['Non-Management'], title: 'non-management', black: [0.08, 2], female: [0.04, 1], african: 1, demo: ['nonMgmtBlack', 'nonMgmtFemale', 'nonMgmtAfrican'] },
] as const;

/**
 * The black / black-female / African share of the workforce in each level and
 * of black employees with disabilities, over all employees — what the toolkit
 * shares the training manager's salary and training overhead out by
 * ('Employee Demographics' row 1).
 */
export function fscSkillsDemographics(management: ManagementData | undefined): Record<string, number> {
  const staff = (management?.employees || []).filter((e) => normalizeDesignationForScoring(e.designation) !== 'Board');
  const n = staff.length;
  const out: Record<string, number> = {};
  const bands: Record<string, string[]> = {
    senior: ['Other Executive Management', 'Senior', 'Executive', 'Executive Director'],
    middle: ['Middle'],
    junior: ['Junior'],
    nonMgmt: ['Semi-skilled', 'Unskilled', 'Skilled Technical'],
  };
  for (const [band, designations] of Object.entries(bands)) {
    const inBand = staff.filter((e) => designations.includes(normalizeDesignationForScoring(e.designation)));
    const black = inBand.filter((e) => isBlackSa(e.race, e.isForeign));
    out[`${band}Black`] = n > 0 ? black.length / n : 0;
    out[`${band}Female`] = n > 0 ? black.filter((e) => e.gender === 'Female').length / n : 0;
    out[`${band}African`] = n > 0 ? black.filter((e) => String(e.race).trim() === 'African').length / n : 0;
  }
  out.disabled = n > 0 ? staff.filter((e) => e.isDisabled && isBlackSa(e.race, e.isForeign)).length / n : 0;
  return out;
}

export function fscSkills(data: SkillsData, province: string | undefined, eapYear: number | undefined, demographics: Record<string, number>) {
  const rows = (data.trainingPrograms || []).map(skillsRow);
  const payroll = data.payrollByLevel ?? { execSenior: 0, middle: 0, junior: 0, nonManagement: 0 };
  const leviable = data.leviableAmount > 0 ? data.leviableAmount : 0;
  const headcount = data.headcount && data.headcount > 0 ? data.headcount : 0;
  const manager = data.trainingManagerSalary || 0;
  const overhead = data.trainingOverheadCost || 0;
  const eff = getEffectiveEap(normalizeProvince(province || 'National') as Province, eapYear);
  const africanEap = (eff.AM ?? 0) + (eff.AF ?? 0);
  const sum = (f: (r: SkillsRow) => boolean, v: (r: SkillsRow) => number) => rows.filter(f).reduce((s, r) => s + v(r), 0);
  const lines: Line[] = [];
  /** Total spend (black + not black) per level — the disability line's cap base. */
  let allLevelsSpend = 0;

  for (const lvl of LEVELS) {
    const inLevel = (r: SkillsRow) => (lvl.positions as readonly string[]).includes(r.position);
    const share = (i: number) => demographics[lvl.demo[i]] ?? 0;
    const admin = (i: number) => (manager + overhead) * share(i);
    const blackAll = sum((r) => inLevel(r) && r.black, (r) => r.af + r.gOther) + admin(0);
    const otherAll = sum((r) => inLevel(r) && !r.black, (r) => r.af + r.gOther);
    allLevelsSpend += blackAll + otherAll;
    const cap = (blackAll + otherAll) * 0.15;
    const recognised = (f: (r: SkillsRow) => boolean, i: number) =>
      sum((r) => inLevel(r) && f(r), (r) => r.af) + Math.min(cap, sum((r) => inLevel(r) && f(r), (r) => r.gOther) + admin(i));
    const levelPayroll = (payroll as Record<string, number>)[lvl.key] || 0;
    const groups: Array<[string, (r: SkillsRow) => boolean, number, number, number]> = [
      ['black people', (r) => r.black, lvl.black[0], lvl.black[1], 0],
      ['black women', (r) => r.female, lvl.female[0], lvl.female[1], 1],
      ['Africans', (r) => r.african, africanEap * lvl.black[0], lvl.african, 2],
    ];
    let levelScore = 0;
    const parts: string[] = [];
    for (const [who, f, target, max, i] of groups) {
      const spend = recognised(f, i);
      const s = pts(spend, levelPayroll * target, max);
      levelScore += s;
      parts.push(`${who} ${formatRand(spend)} of a ${formatRand(levelPayroll * target)} target (${pct(target, 2)} of payroll) → ${s.toFixed(2)} of ${max}`);
    }
    lines.push({
      name: `Skills spend on ${lvl.title}`,
      target: `${pct(lvl.black[0], 1)} of ${lvl.title} payroll`,
      weighting: lvl.black[1] + lvl.female[1] + lvl.african,
      score: levelScore,
      note: `${lvl.title[0].toUpperCase()}${lvl.title.slice(1)} payroll ${formatRand(levelPayroll)}: ${parts.join('; ')}.`,
    });
  }

  // Unemployed black people (1.5% of the leviable amount, 4 points).
  const unemployed = (r: SkillsRow) => r.position === 'Unemployed';
  const uBlack = sum((r) => unemployed(r) && r.black, (r) => r.af + r.gOther);
  const uOther = sum((r) => unemployed(r) && !r.black, (r) => r.af + r.gOther);
  const uRecognised = sum((r) => unemployed(r) && r.black, (r) => r.af) + Math.min((uBlack + uOther) * 0.15, sum((r) => unemployed(r) && r.black, (r) => r.gOther));
  const uScore = pts(uRecognised, leviable * 0.015, 4);
  allLevelsSpend += uBlack + uOther;
  lines.push({
    name: 'Skills spend on black unemployed people',
    target: '1.5% of leviable amount', weighting: 4, score: uScore,
    note: ratioLineNote({ spend: uRecognised, denominator: leviable, denominatorLabel: 'leviable amount', target: 0.015, maxPoints: 4 }),
  });

  // Black people with disabilities (0.3% of the leviable amount, 1 point).
  const dAdmin = (manager + overhead) * (demographics.disabled ?? 0);
  const dAll = sum((r) => r.disabled && r.black, (r) => r.af + r.gOther) + dAdmin;
  const dCap = (dAll + allLevelsSpend) * 0.15;
  const dRecognised = sum((r) => r.disabled && r.black, (r) => r.af) + Math.min(dCap, sum((r) => r.disabled && r.black, (r) => r.gOther) + dAdmin);
  const dScore = pts(dRecognised, leviable * 0.003, 1);
  lines.push({
    name: 'Skills spend on black people with disabilities',
    target: '0.3% of leviable amount', weighting: 1, score: dScore,
    note: ratioLineNote({ spend: dRecognised, denominator: leviable, denominatorLabel: 'leviable amount', target: 0.003, maxPoints: 1 }),
  });

  // Learnerships, apprenticeships and internships: black learners on
  // category B/C/D programmes (each learner once), against 5% of headcount.
  const laiNames = new Set((data.trainingPrograms || [])
    .filter((p) => { const r = skillsRow(p); return r.lai && r.black; })
    .map((p) => String(p.learnerName ?? p.id).trim()));
  const laiCount = laiNames.size;
  const laiScore = pts(laiCount, headcount * 0.05, 4);
  lines.push({
    name: 'Number of black people in learnerships, apprenticeships and internships',
    target: '5% of headcount', weighting: 4, score: laiScore,
    note: `${laiCount} black learner(s) on category B, C or D programmes against ${(headcount * 0.05).toFixed(2)} (5% of a headcount of ${headcount}) → ${laiScore.toFixed(2)} of 4.`,
  });

  // Absorption bonus: of the unemployed learners who completed a learnership,
  // apprenticeship or internship, the black ones absorbed into employment
  // (target 100%, 3 points). Each learner counts once.
  const uniqueNames = (f: (r: SkillsRow) => boolean) => new Set((data.trainingPrograms || [])
    .filter((p) => f(skillsRow(p))).map((p) => String(p.learnerName ?? p.id).trim())).size;
  const completedUnemployedLai = (r: SkillsRow) => r.lai && r.completed && !r.employed;
  const completed = uniqueNames(completedUnemployedLai);
  const absorbed = uniqueNames((r) => completedUnemployedLai(r) && r.black && r.absorbed);
  const absScore = completed > 0 ? Math.min(absorbed / completed * 3, 3) : 0;
  lines.push({
    name: 'Number of unemployed black people absorbed at the end of learnerships',
    target: '100% of completed learners', weighting: 3, score: absScore, isBonus: true,
    note: `${absorbed} black learner(s) absorbed of ${completed} unemployed learner(s) who completed a learnership, apprenticeship or internship → ${absScore.toFixed(2)} of 3.`,
  });

  const base = lines.filter((l) => !l.isBonus).reduce((s, l) => s + l.score, 0);
  const exact = lines.reduce((s, l) => s + l.score, 0);
  return { lines, exact, base, subMinimumMet: base >= 8 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preferential procurement ('Procurement Scorecard')
// ─────────────────────────────────────────────────────────────────────────────

const BANKS_OR_LTI = (sub: FscSubSector) => sub === 'Banks' || sub === 'LTI';

export function fscProcurement(data: ProcurementData, cfg: CalculatorConfig, sub: FscSubSector) {
  const bl = BANKS_OR_LTI(sub);
  const ppCfg: CalculatorConfig = {
    ...cfg,
    procurement: {
      ...cfg.procurement,
      allSuppliersTarget: 0.80, allSuppliersMaxPts: bl ? 4 : 5,
      qseTarget: 0.18, qseMaxPts: bl ? 2 : 3,
      emeTarget: 0.12, emeMaxPts: 2,
      bo51Target: 0.30, bo51MaxPts: bl ? 5 : 7,
      bwo30Target: 0.10, bwo30MaxPts: bl ? 2 : 3,
      dgTarget: 0.02, dgMaxPts: 2,
      blackWomenThreshold: 0.30,
      allSuppliersIgnoreEmpoweringFlag: true,
      enhancedRecognitionRule: 'black_owned_small_supplier',
    },
    pillarConfigs: { ...cfg.pillarConfigs, preferentialProcurement: { maxPoints: 99, subMinimumPercent: 40 } },
  };
  const pp = calculateProcurementScore(data, ppCfg);

  // The two FSC bonus lines, against the total allocated trade value: spend
  // with ≥51% black-owned intermediated professional service providers, and
  // with ≥51% black-owned stock brokers or fund managers (the larger of the two).
  const trade = Number(data.allocatedTradeValue) > 0 ? Number(data.allocatedTradeValue) : 0;
  let intermediated = 0;
  let brokers = 0;
  let managers = 0;
  for (const s of data.suppliers || []) {
    if ((Number(s.blackOwnership) || 0) < 0.51) continue;
    const recognised = fscRecognisedSpend(s, ppCfg);
    if (s.isIntermediary) intermediated += recognised;
    if (s.isStockBroker) brokers += recognised;
    if (s.isFundManager) managers += recognised;
  }
  const brokerSpend = Math.max(brokers, managers);
  const intermediatedScore = pts(intermediated, trade * 0.05, 2);
  const brokerScore = pts(brokerSpend, trade * 0.05, 2);
  const tradeNote = (spend: number, score: number) => trade > 0
    ? `${formatRand(spend)} of a ${formatRand(trade * 0.05)} target (5% of the ${formatRand(trade)} allocated trade value) → ${score.toFixed(2)} of 2.`
    : 'No total allocated trade value is recorded, so this bonus line cannot be measured.';
  const [allLine, qse, eme, bo, bwo, dg] = pp.subLines;
  const lines: Line[] = [
    allLine, qse, eme, bo, bwo,
    { name: 'Spend from intermediated black professional service providers', target: '5% of allocated trade value', weighting: 2, score: intermediatedScore, isBonus: true, note: tradeNote(intermediated, intermediatedScore) },
    { name: 'Spend from black stock brokers or fund managers', target: '5% of allocated trade value', weighting: 2, score: brokerScore, isBonus: true, note: tradeNote(brokerSpend, brokerScore) + (brokers > 0 && managers > 0 ? ' The larger of stock-broker and fund-manager spend counts.' : '') },
    dg,
  ];
  const base = [allLine, qse, eme, bo, bwo].reduce((s, l) => s + l.score, 0);
  // Base lines, the better of the two broker/intermediary bonuses, and the
  // designated-group bonus (Procurement Scorecard H21).
  const exactParts = (pp.exactTotal ?? pp.total) - (dg?.score ?? 0);
  const exact = exactParts + Math.max(intermediatedScore, brokerScore) + (dg?.score ?? 0);
  const baseMax = (bl ? 4 + 2 + 2 + 5 + 2 : 5 + 3 + 2 + 7 + 3);
  return { lines, exact, base, subMinimumMet: base >= baseMax * 0.4, coverageNotes: pp.coverageNotes };
}

/** One supplier's recognised spend: its level's recognition, × 1.2 where it qualifies. */
function fscRecognisedSpend(s: Supplier, cfg: CalculatorConfig): number {
  const table = cfg.recognitionTable ?? [];
  const mult = table.find((r) => r.level === s.beeLevel)?.multiplier
    ?? ({ 1: 1.35, 2: 1.25, 3: 1.1, 4: 1, 5: 0.8, 6: 0.6, 7: 0.5, 8: 0.1 } as Record<number, number>)[s.beeLevel] ?? 0;
  const adjusted = (Number(s.spend) || 0) * mult;
  return qualifiesForEnhancedRecognition(s, 'black_owned_small_supplier') ? adjusted * 1.2 : adjusted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enterprise and supplier development ('ESD Scorecard')
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SD and ED weightings per sub-sector: banks and long-term insurers score
 * them on their EF & ESD scorecard (SD 7 points at 1.8% of NPAT, ED 3 at
 * 0.2%; no stock-broker line for banks); everyone else on the ESD Scorecard.
 */
export function fscEsdWeights(sub: FscSubSector) {
  if (sub === 'Banks') return { sdMax: 7, sdTarget: 0.018, edMax: 3, edTarget: 0.002, brokerMax: 0 };
  if (sub === 'LTI') return { sdMax: 7, sdTarget: 0.018, edMax: 3, edTarget: 0.002, brokerMax: 2 };
  return { sdMax: 10, sdTarget: 0.02, edMax: 5, edTarget: 0.01, brokerMax: 2 };
}

export function fscEsd(data: ESDData, npat: number, cfg: CalculatorConfig, sub: FscSubSector = 'Others') {
  const w = fscEsdWeights(sub);
  // Guarantees at 50% of the guarantee ('ESD and SED Calcs'!D8), as every
  // Empower template has them (the Codes: 3%).
  const factors = cfg.benefitFactors.filter((bf) => !(bf.type in EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES));
  for (const [type, factor] of Object.entries(EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES)) factors.push({ type, factor });
  const esdCfg: CalculatorConfig = {
    ...cfg,
    benefitFactors: factors,
    esd: {
      ...cfg.esd,
      supplierDevMax: w.sdMax, supplierDevTarget: w.sdTarget,
      enterpriseDevMax: w.edMax, enterpriseDevTarget: w.edTarget,
      edGraduationBonusMax: 1, edJobsBonusMax: 1,
      edStockbrokerBonusMax: w.brokerMax, edStockbrokerTarget: w.brokerMax > 0 ? 0.005 : 0,
      applyBeneficiaryQualification: true,
    },
    pillarConfigs: {
      ...cfg.pillarConfigs,
      supplierDevelopment: { maxPoints: w.sdMax, subMinimumPercent: 40 },
      enterpriseDevelopment: { maxPoints: w.edMax + 2 + w.brokerMax, basePoints: w.edMax, subMinimumPercent: 40 },
    },
  };
  // The stock-broker line counts the recognised value of the Enterprise
  // Development rows flagged as supporting black stock brokers, fund
  // managers or intermediaries.
  const flagged = (data.contributions || []).filter((c) => c.category === 'enterprise_development' && c.supportsBlackFinancialIntermediary);
  const stockbrokerSpend = flagged.length > 0
    ? calculateEsdScore({ ...data, contributions: flagged, graduationBonus: false, jobsCreatedBonus: false }, npat, esdCfg).edSpend
    : 0;
  return calculateEsdScore({ ...data, stockbrokerSpend }, npat, esdCfg);
}

// ─────────────────────────────────────────────────────────────────────────────
// SED & consumer education ('SED & CE Scorecard')
// ─────────────────────────────────────────────────────────────────────────────

export function fscSedCe(data: SEDData, npat: number, reinsurer: boolean) {
  const recognised = (c: Contribution) => {
    const { factor, recognised: ok } = benefitFactorFor(canonicalContributionType(c.type), TOOLKIT_BENEFIT_FACTORS_SED);
    return ok ? (Number(c.amount) || 0) * factor : 0;
  };
  const total = (pillar: Contribution['sedPillar']) => (data.contributions || [])
    .filter((c) => (c.sedPillar ?? 'sed') === pillar)
    .reduce((s, c) => s + recognised(c), 0);
  const sed = total('sed');
  const ce = total('consumer_education') + (Number(data.ceSpend) || 0);
  const fundisa = total('fundisa') + (Number(data.fundisaSpend) || 0);
  const sedTarget = reinsurer ? 0.007 : 0.006;
  const lines: Line[] = [];
  const add = (name: string, spend: number, target: number, max: number, isBonus = false, extra = '') => {
    const score = npat > 0 ? pts(spend, npat * target, max) : 0;
    lines.push({
      name, target: `${pct(target, 1)} of NPAT`, weighting: max, score, isBonus: isBonus || undefined,
      note: ratioLineNote({ spend, denominator: npat, denominatorLabel: 'NPAT', target, maxPoints: max }) + extra,
    });
  };
  add('Socioeconomic Development contributions', sed, sedTarget, 3);
  if (reinsurer) {
    add('Grant contribution to the Fundisa Retail Fund (reinsurers)', fundisa, 0.002, 2);
  } else {
    add('Consumer Education contributions', ce, 0.004, 2);
    // Consumer education beyond its own 0.4% target earns the bonus.
    const additional = Math.max(ce - npat * 0.004, 0);
    add('Additional Consumer Education contributions', additional, 0.001, 1, true,
      `; consumer education beyond its 0.4% target (${formatRand(ce)} less ${formatRand(npat * 0.004)})`);
    add('Grant contribution to the Fundisa Retail Fund and similar initiatives', fundisa, 0.002, 2, true);
  }
  const exact = lines.reduce((s, l) => s + l.score, 0);
  return { lines, exact, max: reinsurer ? 5 : 8 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Empowerment financing ('EF & ESD Scorecard - Banks' / '- Long Term')
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Banks: targeted investments are the exposure on new loans against the
 * balance-sheet plus additional targeted-investment exposure (12 points);
 * long-term insurers: the targeted-investment portion against the qualifying
 * exposure. Transaction financing (3 points): the period's transaction
 * financing against its target portion.
 */
export function fscEmpowermentFinancing(data: EmpowermentFinancingData, sub: FscSubSector) {
  const v = (x: unknown) => (Number(x) > 0 ? Number(x) : 0);
  const banks = sub === 'Banks';
  const tiTarget = banks ? v(data.balanceSheetExposure) + v(data.additionalTiExposure) : v(data.qualifyingExposure);
  const tiAchieved = banks ? v(data.newLoansExposure) : v(data.targetedInvestmentPortion);
  const tfTarget = v(data.tfPortfolioValue);
  const tfAchieved = (data.tfTransactions ?? []).reduce((acc, t) => acc + (Number(t.value) || 0), 0);
  const ti = pts(tiAchieved, tiTarget, 12);
  const tf = pts(tfAchieved, tfTarget, 3);
  const lines: Line[] = [
    { name: 'Targeted investments', target: '100% of exposure', weighting: 12, score: ti, note: `${formatRand(tiAchieved)} of ${formatRand(tiTarget)} → ${ti.toFixed(2)} of 12.` },
    { name: 'Transaction financing and risk capital contributions', target: '100% of target', weighting: 3, score: tf, note: `${formatRand(tfAchieved)} of ${formatRand(tfTarget)} → ${tf.toFixed(2)} of 3.` },
  ];
  return { lines, exact: ti + tf, max: 15 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Access to financial services ('AFS Scorecard - Banks')
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Banks: transaction (85%, 1 pt), service (70%, 1 pt) and sales points (60%,
 * 2 pts) by share of the qualifying area, electronic access (2 pts), a point
 * of presence per measurement unit (3 pts) and active accounts (3 pts). The
 * toolkit carries no target for electronic access or active accounts, so it
 * scores neither; they score here only on a stated compliance answer.
 */
export function fscAfsBanks(data: AfsData) {
  const pctOf = (x: unknown) => (Number(x) || 0) / 100;
  const tp = pts(pctOf(data.transactionPointCoverage), 0.85, 1);
  const sp = pts(pctOf(data.servicePointCoverage), 0.70, 1);
  const sales = pts(pctOf(data.salesPointCoverage), 0.60, 2);
  const ea = data.electronicAccessCompliant ? 2 : 0;
  const pop = data.hasPointOfPresence ? 3 : 0;
  const aa = data.activeAccountsCompliant ? 3 : 0;
  const lines: Line[] = [
    { name: 'Transaction points within 5km', target: '85% of qualifying area', weighting: 1, score: tp },
    { name: 'Service points within 10km', target: '70% of qualifying area', weighting: 1, score: sp },
    { name: 'Sales points within 15km', target: '60% of qualifying area', weighting: 2, score: sales },
    { name: 'Electronic access for target-market account holders', target: 'National', weighting: 2, score: ea },
    { name: 'A point of presence per measurement unit', target: 'Yes', weighting: 3, score: pop },
    { name: 'Active accounts with qualifying products', target: 'National', weighting: 3, score: aa },
  ];
  return { lines, exact: lines.reduce((acc, l) => acc + l.score, 0), max: 12 };
}

/**
 * Long-term insurers ('AFS Scorecard - Long Term'): appropriate products
 * (compliant of developed products, 3 pts), market penetration (on-book
 * policies against the SAIA-communicated number, 7 pts, plus up to 0.25 for
 * credit-life policies) and transactional access by share of polygons covered
 * (2 pts: under 50% none, 60%–70% 1, 70%–80% 1.5, otherwise 2 — the toolkit's
 * own tiers, which leave 50%–60% at 2).
 */
export function fscAfsLti(data: AfsData) {
  const num = (x: unknown) => Number(x) || 0;
  const products = num(data.appropriateProductsDenominator);
  const ap = products > 0 ? (num(data.appropriateProductsNumerator) / products) * 3 : 0;
  const saia = num(data.saiaCommunicatedPolicies);
  const mp = saia > 0
    ? Math.min(Math.min((num(data.marketPenetrationPolicies) / saia) * 7, 7) + Math.min((num(data.creditLifePolicies) / saia) * 7, 0.25), 7)
    : 0;
  const cover = num(data.transactionalAccessCoverage) / 100;
  const ta = cover < 0.5 ? 0 : cover >= 0.6 && cover < 0.7 ? 1 : cover >= 0.7 && cover < 0.8 ? 1.5 : 2;
  const lines: Line[] = [
    { name: 'Appropriate products', target: 'All developed products compliant', weighting: 3, score: ap },
    { name: 'Market penetration', target: 'SAIA-communicated policies', weighting: 7, score: mp },
    { name: 'Transactional access', target: '80% of polygons', weighting: 2, score: ta },
  ];
  return { lines, exact: ap + mp + ta, max: 12 };
}

// ─────────────────────────────────────────────────────────────────────────────
// The scorecard
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_WEIGHTS: Array<[number, number]> = [[100, 1], [95, 2], [90, 3], [80, 4], [75, 5], [70, 6], [55, 7], [40, 8]];

/** 'Scorecard Calculations'!Y3:Y10: each threshold W ÷ 111 × the base points (F12). */
export function fscLevelThresholds(basePoints: number) {
  return LEVEL_WEIGHTS.map(([w, level]) => ({ level, minPoints: (w / 111) * basePoints }));
}

export function fscLevelForPoints(points: number, basePoints: number): number {
  const t = fscLevelThresholds(basePoints).find((x) => points >= x.minPoints);
  return t ? t.level : 9;
}

const RECOGNITION: Record<number, string> = { 1: '135%', 2: '125%', 3: '110%', 4: '100%', 5: '80%', 6: '60%', 7: '50%', 8: '10%' };

export function calculateFscScorecard(state: FscScorecardInput, cfg: CalculatorConfig): ScorecardResult {
  const sub = (cfg.fscToolkit?.subSector ?? 'Others') as FscSubSector;
  const client = state.client;
  const npat = Number(client.npat) || 0;
  const dataDate = state.ownership.valuationDate ?? client.measurementPeriodEnd;

  const own = fscOwnership(state.ownership, cfg, sub, dataDate);
  const mc = fscManagement(state.management, client.eapProvince, client.eapYear);
  const demographics = fscSkillsDemographics(state.management);
  const skills = fscSkills(state.skills, client.eapProvince, client.eapYear, demographics);
  const pp = fscProcurement({ ...state.procurement, measurementPeriodEnd: state.procurement.measurementPeriodEnd ?? client.measurementPeriodEnd }, cfg, sub);
  const esd = fscEsd({ ...state.esd, measurementPeriodEnd: state.esd.measurementPeriodEnd ?? client.measurementPeriodEnd }, npat, cfg, sub);
  const sed = fscSedCe(state.sed, npat, Boolean(client.fscReinsurer));
  const ef = BANKS_OR_LTI(sub) ? fscEmpowermentFinancing(state.empowermentFinancing, sub) : null;
  const afsFsc = sub === 'Banks' ? fscAfsBanks(state.afs) : sub === 'LTI' ? fscAfsLti(state.afs) : null;
  const afsOther = sub === 'STI' && cfg.accessToFinancialServices ? calculateAfsScore(state.afs, cfg) : null;
  const afs = afsFsc
    ? { total: afsFsc.exact, maxPoints: 12, lines: afsFsc.lines.map((l) => ({ name: l.name, target: l.target, maxPoints: l.weighting, score: l.score })) }
    : afsOther;
  const esdW = fscEsdWeights(sub);

  const ownBaseMax = own.lines.reduce((s, l) => s + (l.isBonus ? 0 : l.weighting), 0);
  const ppBaseMax = BANKS_OR_LTI(sub) ? 15 : 20;
  const sedBaseMax = sed.lines.slice(0, 2).reduce((s, l) => s + l.weighting, 0);
  // 'Scorecard Calculations'!F12: the base points every level threshold scales by.
  const basePoints = ownBaseMax + mc.max + 20 + ppBaseMax + esdW.sdMax + esdW.edMax + sedBaseMax
    + (ef ? ef.max : 0) + (afs ? afs.maxPoints : 0);

  const total = own.exact + mc.exact + skills.exact + pp.exact + esd.sdExactTotal! + esd.edExactTotal!
    + sed.exact + (ef?.exact ?? 0) + (afs?.total ?? 0);
  const level = fscLevelForPoints(total, basePoints);

  const sdMet = esd.sdSubMinimumMet;
  const edMet = esd.edSubMinimumMet;
  // Banks and long-term insurers: empowerment financing (40% of 15) is the
  // priority element in procurement's place.
  const ppOrEfMet = ef ? ef.exact >= ef.max * 0.4 : pp.subMinimumMet;
  const anyFailed = !own.subMinimumMet || !skills.subMinimumMet || !ppOrEfMet || !sdMet || !edMet;
  const isDiscounted = !state.ignoreSubMinimum && level < 9 && anyFailed;
  let discountedLevel = isDiscounted ? (level >= 8 ? 9 : level + 1) : level;
  const preYesDiscountedLevel = discountedLevel;

  // YES (shown beside the total; lifts the level only for an entity whose
  // prior-year level is known and no worse than this one).
  const yesCandidates = (state.skills.trainingPrograms || []).filter((p) => p.isYesEmployee).map((p) => ({
    id: p.id, name: p.learnerName || 'YES Candidate', race: p.race || '', gender: p.gender || '',
    isDisabled: p.isDisabled || false,
    isBlack: ['African', 'Coloured', 'Indian', 'Chinese'].includes(String(p.race ?? '').trim()),
    startDate: p.startDate || new Date().toISOString(), isAbsorbed: p.isAbsorbed || false,
    cost: p.totalCost || 0,
  }));
  const employeesCount = state.management.employees?.length || 0;
  const yesScore = calculateYESScore({
    id: '', clientId: client.id || '', totalEmployees: employeesCount,
    yesHeadcountTarget: Math.max(Math.ceil(employeesCount * 0.025), 1), candidates: yesCandidates,
    yesYouthEnrolled: yesCandidates.length,
    yesBlackYouthCount: yesCandidates.filter((c) => c.isBlack).length,
    yesBlackYouthPercentage: yesCandidates.length > 0 ? (yesCandidates.filter((c) => c.isBlack).length / yesCandidates.length) * 100 : 0,
    yesAbsorbedCount: yesCandidates.filter((c) => c.isAbsorbed).length,
    yesAbsorptionRate: yesCandidates.length > 0 ? (yesCandidates.filter((c) => c.isAbsorbed).length / yesCandidates.length) * 100 : 0,
    totalYesCost: yesCandidates.reduce((s, c) => s + c.cost, 0),
    yesCostPerCandidate: yesCandidates.length > 0 ? yesCandidates.reduce((s, c) => s + c.cost, 0) / yesCandidates.length : 0,
  } as never, cfg, client.revenue || 0, npat);
  const prior = client.beeCertificateLevel;
  if (typeof prior === 'number' && level <= prior && yesScore.yesBeeLevelIncrease > 0 && discountedLevel > 1) {
    discountedLevel = Math.max(1, discountedLevel - yesScore.yesBeeLevelIncrease);
  }

  const toLines = (ls: Line[]): BreakdownLine[] => toBreakdownLines(ls).map((l) => ({ ...l, score: round2(l.score), weighting: round2(l.weighting) }));
  const sumW = (ls: Line[], bonus = true) => round2(ls.reduce((s, l) => s + (bonus || !l.isBonus ? l.weighting : 0), 0));
  const thresholdNote = `Level thresholds scale to this scorecard's ${round2(basePoints)} base points (Level 1 from ${round2(100 / 111 * basePoints)}).`;

  return {
    ownership: { score: round2(own.exact), target: sumW(own.lines), weighting: sumW(own.lines), subMinimumMet: own.subMinimumMet, subLines: toLines(own.lines) },
    managementControl: { score: round2(mc.exact), target: round2(mc.max), weighting: round2(mc.max), subLines: toLines(mc.lines) },
    skillsDevelopment: { score: round2(skills.exact), target: 23, weighting: 23, subMinimumMet: skills.subMinimumMet, subLines: toLines(skills.lines) },
    procurement: { score: round2(pp.exact), target: sumW(pp.lines.filter((l, i) => i !== 6)), weighting: sumW(pp.lines.filter((l, i) => i !== 6)), subMinimumMet: ef ? undefined : pp.subMinimumMet, subLines: toLines(pp.lines), coverageNotes: pp.coverageNotes },
    supplierDevelopment: { score: round2(esd.sdExactTotal!), target: esdW.sdMax, weighting: esdW.sdMax, subMinimumMet: sdMet, subLines: toBreakdownLines(esd.sdSubLines) },
    enterpriseDevelopment: { score: round2(esd.edExactTotal!), target: esdW.edMax + 2 + esdW.brokerMax, weighting: esdW.edMax + 2 + esdW.brokerMax, subMinimumMet: edMet, subLines: toBreakdownLines(esd.edSubLines) },
    socioEconomicDevelopment: { score: round2(sed.exact), target: sed.max, weighting: sed.max, subLines: toLines(sed.lines) },
    yesInitiative: { score: round2(yesScore.score + yesScore.yesBonusPoints), target: 0, weighting: 0 },
    ...(afs ? { accessToFinancialServices: { score: round2(afs.total), target: afs.maxPoints, weighting: afs.maxPoints, subLines: afs.lines.map((l) => ({ name: l.name, target: l.target, weighting: l.maxPoints, score: l.score })) } } : {}),
    ...(ef ? { empowermentFinancing: { score: round2(ef.exact), target: 15, weighting: 15, subMinimumMet: ppOrEfMet, subLines: toLines(ef.lines) } } : {}),
    total: { score: round2(total), target: round2(basePoints), weighting: round2(basePoints), coverageNotes: [thresholdNote] },
    achievedLevel: level,
    discountedLevel,
    preYesDiscountedLevel,
    isDiscounted,
    recognitionLevel: RECOGNITION[discountedLevel] ?? '0%',
    chosenElectivePillar: null,
  };
}

export const __test = { clampScore };
