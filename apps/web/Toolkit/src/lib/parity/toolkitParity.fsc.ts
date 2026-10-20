/**
 * Toolkit parity, FSC — the line map and the referee for the FSC Empower
 * toolkit (BBBEE Toolkit (FSC) Template v1.0), shared by the FSC parity
 * harness and its always-on gate. One definition, so the gate proves what the
 * harness reports.
 *
 * The referee is the FSC toolkit recalculated by Excel. Where the toolkit's
 * own formula is evidently broken, the referee is what that formula evidently
 * means, computed from the toolkit's OWN figures; every such line says why.
 * The faults (docs/toolkits/parity/findings/fsc.md):
 *  - acquisition-debt netting depends on the row the shareholder sits in and
 *    credits the whole stake regardless of its black share (economic interest
 *    and net value), as in RCOGP Generic;
 *  - 'Skills Toolkit'!D3 (leviable amount) and D6 (headcount) are typed,
 *    locked cells holding another company's figures, so the unemployed,
 *    disabled, learnership and absorption lines measure against them;
 *  - the first-time-supplier recognition test reads the 3-year-contract column;
 *  - the preferential-procurement sub-minimum reads empty cells, so it never fails;
 *  - a duplicated blank "Minority Investment" row zeroes that supplier-
 *    development contribution, as in RCOGP Generic;
 *  - additional consumer education is measured above the SED target instead
 *    of above the consumer-education target;
 *  - the skills "Within FY?" test compares each row with a cell that moves
 *    down the Validation sheet;
 *  - management control counts non-executive directors among the black
 *    employees with disabilities but not among the employees;
 *  - banks / long-term insurers: the EF & ESD scorecard filters SD, ED and the
 *    bonuses by a period taken from the transaction-financing rows;
 *    long-term insurers: transaction financing against the targeted-investment
 *    portion, and transactional access from a typed, locked 80%;
 *  - short-term insurers: commercial lines measured against the wrong target
 *    policies cell;
 *  - a voting-rights-above-15% bonus that goes negative;
 *  - banks and insurers: the net value line (weighted 6) capped at, and its
 *    Formula A and B scaled by, a hard-coded 8.
 */
import type { CalculatorConfig } from '../../../../shared/schema';
import type { ScorecardResult } from '../types';
import { FSC_GENERIC_CALCULATOR_CONFIG } from '../sectors/fsc-generic';
import { FSC_BANKS_CALCULATOR_CONFIG } from '../sectors/fsc-banks';
import { FSC_LTI_CALCULATOR_CONFIG } from '../sectors/fsc-lti';
import { FSC_STI_CALCULATOR_CONFIG } from '../sectors/fsc-sti';
import { fscStiProducts } from '../calculators/fscToolkit';
import type { AfsData } from '../types';

export type ParityPillarKey = keyof ScorecardResult;
export interface ParityLine { row: number; pillar: ParityPillarKey; label: string; names: string[] }
export type ToolkitSheets = Record<string, Record<string, { v: unknown }>>;
export type ToolkitTables = Record<string, { headers: unknown[]; rows: unknown[][] }>;

export function fscConfigFor(sub: string): CalculatorConfig {
  if (sub === 'Others' || !sub) return FSC_GENERIC_CALCULATOR_CONFIG;
  if (sub === 'Banks') return FSC_BANKS_CALCULATOR_CONFIG;
  if (sub === 'LTI') return FSC_LTI_CALCULATOR_CONFIG;
  if (sub === 'STI') return FSC_STI_CALCULATOR_CONFIG;
  throw new Error(`FSC parity: no toolkit config for sub-sector ${sub} yet`);
}

const OWNERSHIP: ParityLine[] = [
  { row: 21, pillar: 'ownership', label: 'Voting rights: black', names: ['Exercisable voting rights of black individuals'] },
  { row: 22, pillar: 'ownership', label: 'Voting rights: black women', names: ['Exercisable voting rights of black females'] },
  { row: 23, pillar: 'ownership', label: 'Economic interest: black', names: ['Economic interest of black individuals'] },
  { row: 24, pillar: 'ownership', label: 'Economic interest: black women', names: ['Economic interest of black females'] },
  { row: 25, pillar: 'ownership', label: 'Economic interest: designated groups', names: ['Economic interest of black designated groups or participants in ownership schemes'] },
  { row: 26, pillar: 'ownership', label: 'Economic interest: new entrants', names: ['Economic interest of black new entrants'] },
  { row: 27, pillar: 'ownership', label: 'Net value', names: ['Net value'] },
];

const OWNERSHIP_BONUS: ParityLine[] = [
  { row: 28, pillar: 'ownership', label: 'Voting rights above 15% (bonus)', names: ['Direct / indirect ownership in excess of 15%'] },
  { row: 29, pillar: 'ownership', label: 'Economic interest above 32.5% (bonus)', names: ['Economic interest and voting rights above 32.5%'] },
];

const EF: ParityLine[] = [
  { row: 71, pillar: 'empowermentFinancing', label: 'Targeted investments', names: ['Targeted investments'] },
  { row: 72, pillar: 'empowermentFinancing', label: 'Transaction financing', names: ['Transaction financing and risk capital contributions'] },
];

const AFS_BANKS: ParityLine[] = [
  { row: 90, pillar: 'accessToFinancialServices', label: 'Transaction points (5km)', names: ['Transaction points within 5km'] },
  { row: 91, pillar: 'accessToFinancialServices', label: 'Service points (10km)', names: ['Service points within 10km'] },
  { row: 92, pillar: 'accessToFinancialServices', label: 'Sales points (15km)', names: ['Sales points within 15km'] },
  { row: 93, pillar: 'accessToFinancialServices', label: 'Electronic access', names: ['Electronic access for target-market account holders'] },
  { row: 94, pillar: 'accessToFinancialServices', label: 'Point of presence', names: ['A point of presence per measurement unit'] },
  { row: 95, pillar: 'accessToFinancialServices', label: 'Active accounts', names: ['Active accounts with qualifying products'] },
];

const AFS_LTI: ParityLine[] = [
  { row: 90, pillar: 'accessToFinancialServices', label: 'Appropriate products', names: ['Appropriate products'] },
  { row: 91, pillar: 'accessToFinancialServices', label: 'Market penetration', names: ['Market penetration'] },
  { row: 92, pillar: 'accessToFinancialServices', label: 'Transactional access', names: ['Transactional access'] },
];

const MC: ParityLine[] = [
  { row: 32, pillar: 'managementControl', label: 'Board: black', names: ['Exercisable voting rights of black board members'] },
  { row: 33, pillar: 'managementControl', label: 'Board: black women', names: ['Exercisable voting rights of black female board members'] },
  { row: 34, pillar: 'managementControl', label: 'Executive directors: black', names: ['Black executive directors'] },
  { row: 35, pillar: 'managementControl', label: 'Executive directors: black women', names: ['Black female executive directors'] },
  { row: 36, pillar: 'managementControl', label: 'Other executive: black', names: ['Black other executive management'] },
  { row: 37, pillar: 'managementControl', label: 'Other executive: black women', names: ['Black female other executive management'] },
  { row: 38, pillar: 'managementControl', label: 'Other executive: African', names: ['Black African other executive management'] },
  { row: 39, pillar: 'managementControl', label: 'Senior management: black', names: ['Black employees in senior management'] },
  { row: 40, pillar: 'managementControl', label: 'Senior management: black women', names: ['Black female employees in senior management'] },
  { row: 41, pillar: 'managementControl', label: 'Senior management: African', names: ['Black African employees in senior management'] },
  { row: 42, pillar: 'managementControl', label: 'Middle management: black', names: ['Black employees in middle management'] },
  { row: 43, pillar: 'managementControl', label: 'Middle management: black women', names: ['Black female employees in middle management'] },
  { row: 44, pillar: 'managementControl', label: 'Middle management: African', names: ['Black African employees in middle management'] },
  { row: 45, pillar: 'managementControl', label: 'Junior management: black', names: ['Black employees in junior management'] },
  { row: 46, pillar: 'managementControl', label: 'Junior management: black women', names: ['Black female employees in junior management'] },
  { row: 47, pillar: 'managementControl', label: 'Junior management: African', names: ['Black African employees in junior management'] },
  { row: 48, pillar: 'managementControl', label: 'Employees with disabilities', names: ['Black employees with disabilities'] },
];

const SKILLS: ParityLine[] = [
  { row: 51, pillar: 'skillsDevelopment', label: 'Spend: senior & executive management', names: ['Skills spend on senior & executive management'] },
  { row: 52, pillar: 'skillsDevelopment', label: 'Spend: middle management', names: ['Skills spend on middle management'] },
  { row: 53, pillar: 'skillsDevelopment', label: 'Spend: junior management', names: ['Skills spend on junior management'] },
  { row: 54, pillar: 'skillsDevelopment', label: 'Spend: non-management', names: ['Skills spend on non-management'] },
  { row: 55, pillar: 'skillsDevelopment', label: 'Spend: unemployed black people', names: ['Skills spend on black unemployed people'] },
  { row: 56, pillar: 'skillsDevelopment', label: 'Spend: black people with disabilities', names: ['Skills spend on black people with disabilities'] },
  { row: 57, pillar: 'skillsDevelopment', label: 'Learnerships / apprenticeships / internships', names: ['Number of black people in learnerships, apprenticeships and internships'] },
  { row: 58, pillar: 'skillsDevelopment', label: 'Absorption (bonus)', names: ['Number of unemployed black people absorbed at the end of learnerships'] },
];

const PP: ParityLine[] = [
  { row: 61, pillar: 'procurement', label: 'All suppliers', names: ['B-BBEE Procurement Spend from Empowering Suppliers'] },
  { row: 62, pillar: 'procurement', label: 'QSE suppliers', names: ['Spend on QSE Empowering Suppliers'] },
  { row: 63, pillar: 'procurement', label: 'EME suppliers', names: ['Spend on EME Suppliers'] },
  { row: 64, pillar: 'procurement', label: '51% black-owned suppliers', names: ['Spend on Empowering Suppliers ≥51% Black Owned'] },
  { row: 65, pillar: 'procurement', label: '30% black-women-owned suppliers', names: ['Spend on Empowering Suppliers >30% Black Female Owned'] },
  { row: 66, pillar: 'procurement', label: 'Intermediated black professionals (bonus)', names: ['Spend from intermediated black professional service providers'] },
  { row: 67, pillar: 'procurement', label: 'Black stock brokers / fund managers (bonus)', names: ['Spend from black stock brokers or fund managers'] },
  { row: 68, pillar: 'procurement', label: 'Designated-group suppliers (bonus)', names: ['Spend on Designated Group Suppliers ≥51% Black Owned'] },
];

const ESD: ParityLine[] = [
  { row: 75, pillar: 'supplierDevelopment', label: 'Supplier development', names: ['Annual value of all Supplier Development contributions'] },
  { row: 78, pillar: 'enterpriseDevelopment', label: 'Enterprise development', names: ['Annual value of Enterprise Development contributions'] },
  { row: 79, pillar: 'enterpriseDevelopment', label: 'Graduation bonus', names: ['Graduation of ED beneficiaries to SD beneficiaries'] },
  { row: 80, pillar: 'enterpriseDevelopment', label: 'Jobs created bonus', names: ['Jobs created from ED & SD initiatives'] },
  { row: 81, pillar: 'enterpriseDevelopment', label: 'Black stock brokers / fund managers (ED bonus)', names: ['ED support of black stockbrokers / fund managers / intermediaries'] },
];

const SED: ParityLine[] = [
  { row: 84, pillar: 'socioEconomicDevelopment', label: 'Socio-economic development', names: ['Socioeconomic Development contributions'] },
  { row: 85, pillar: 'socioEconomicDevelopment', label: 'Consumer education', names: ['Consumer Education contributions'] },
  { row: 86, pillar: 'socioEconomicDevelopment', label: 'Additional consumer education (bonus)', names: ['Additional Consumer Education contributions'] },
  { row: 87, pillar: 'socioEconomicDevelopment', label: 'Fundisa Retail Fund (bonus)', names: ['Grant contribution to the Fundisa Retail Fund and similar initiatives'] },
];

const SED_REINSURER: ParityLine[] = [
  SED[0],
  { row: 85, pillar: 'socioEconomicDevelopment', label: 'Fundisa Retail Fund (reinsurers)', names: ['Grant contribution to the Fundisa Retail Fund (reinsurers)'] },
];

/**
 * Short-term insurers: Summary rows 90–99 carry the appropriate products of
 * the lines offered ('AFS Scorecard - Short Term'!C12:C21), rows 100–101 the
 * insurance policies (C26:C27).
 */
function afsStiLines(lines: AfsData['stiProductLines']): ParityLine[] {
  const products = fscStiProducts(lines);
  const policies = lines === 'Personal and Commercial' ? ['personal', 'commercial'] : [lines === 'Personal' ? 'personal' : 'commercial'];
  return [
    ...products.map((p, i) => ({ row: 90 + i, pillar: 'accessToFinancialServices' as const, label: `Appropriate products: ${p}`, names: [`Appropriate products: ${p}`] })),
    ...policies.map((l, i) => ({ row: 100 + i, pillar: 'accessToFinancialServices' as const, label: `Insurance policies: ${l} lines`, names: [`Insurance policies: ${l} lines`] })),
  ];
}

export function fscLinesFor(sub: string, reinsurer = false, stiLines?: AfsData['stiProductLines']): ParityLine[] {
  const sed = reinsurer ? SED_REINSURER : SED;
  if (sub === 'Others') return [...OWNERSHIP, ...MC, ...SKILLS, ...PP, ...ESD, ...sed];
  if (sub === 'Banks') return [...OWNERSHIP, ...OWNERSHIP_BONUS, ...MC, ...SKILLS, ...PP, ...EF, ...ESD.filter((l) => l.row !== 81), ...sed, ...AFS_BANKS];
  if (sub === 'LTI') return [...OWNERSHIP, ...OWNERSHIP_BONUS, ...MC, ...SKILLS, ...PP, ...EF, ...ESD, ...sed, ...AFS_LTI];
  if (sub === 'STI') return [...OWNERSHIP, ...OWNERSHIP_BONUS, ...MC, ...SKILLS, ...PP, ...ESD, ...sed, ...afsStiLines(stiLines)];
  throw new Error(`FSC parity: no line map for ${sub} yet`);
}

export function fscTotalRowsFor(sub: string): Array<{ row: number; pillar: ParityPillarKey; label: string }> {
  if (sub !== 'Others' && sub !== 'Banks' && sub !== 'LTI' && sub !== 'STI') throw new Error(`FSC parity: no total rows for ${sub} yet`);
  const afs = { row: 89, pillar: 'accessToFinancialServices' as const, label: 'Access to financial services' };
  const extra: Array<{ row: number; pillar: ParityPillarKey; label: string }> = sub === 'Banks' || sub === 'LTI'
    ? [{ row: 70, pillar: 'empowermentFinancing', label: 'Empowerment financing' }, afs]
    : sub === 'STI' ? [afs] : [];
  return [
    ...extra,
    { row: 20, pillar: 'ownership', label: 'Ownership' },
    { row: 31, pillar: 'managementControl', label: 'Management control' },
    { row: 50, pillar: 'skillsDevelopment', label: 'Skills development' },
    { row: 60, pillar: 'procurement', label: 'Preferential procurement' },
    { row: 74, pillar: 'supplierDevelopment', label: 'Supplier development' },
    { row: 77, pillar: 'enterpriseDevelopment', label: 'Enterprise development' },
    { row: 83, pillar: 'socioEconomicDevelopment', label: 'SED and consumer education' },
    { row: 104, pillar: 'total', label: 'Grand total' },
  ];
}

export function summaryValue(sheets: ToolkitSheets, row: number): number | null {
  const v = sheets['Summary Scorecard']?.[`F${row}`]?.v;
  if (v === '' || v == null) return null;
  return typeof v === 'number' ? v : Number(v);
}

export function levelNumber(v: unknown): number {
  const s = String(v ?? '');
  if (/non/i.test(s)) return 9;
  const m = s.match(/(\d)/);
  return m ? Number(m[1]) : NaN;
}

export interface RefereeResult {
  lines: Map<number, { value: number; note: string }>;
  achieved: number;
  discounted: number;
  achievedNote?: string;
  discountedNote?: string;
}

function tableRows(tables: ToolkitTables | undefined, name: string): Array<Record<string, unknown>> {
  const t = tables?.[name];
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [String(h), r[i]])));
}

const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
const yes = (x: unknown) => String(x ?? '').trim().toLowerCase() === 'yes';
/** MIN(actual ÷ target × points, points); 0 where the target is 0 (the toolkit's IFERROR). */
const pts = (actual: number, target: number, max: number) => (target > 0 ? Math.min((actual / target) * max, max) : 0);
const blankish = (v: unknown) => v === undefined || v === null || v === '';
/** Ownership Calcs Formula A3:B11, with a loan in its tenth year or later fully graduated. */
const GRADUATION: Record<number, number> = { 1: 0.1, 2: 0.2, 3: 0.4, 4: 0.5, 5: 0.6, 6: 0.7, 7: 0.8, 8: 0.9, 9: 1 };

/**
 * Ownership: black economic interest (row 23) and net value (row 27) with each
 * indebted black stake netted the one way — the first debt row's formula: the
 * stake counts in full once its net value reaches 40% of it — and only for its
 * black share; the net value's loan-year graduation reads 100% from year 9 on.
 */
function refereeOwnership(sheets: ToolkitSheets, tables: ToolkitTables) {
  const v = (sheet: string, ref: string) => n(sheets[sheet]?.[ref]?.v);
  const holders = tableRows(tables, 'tblOwnershipData');
  const value = v('Ownership Scorecard', 'C3');
  const free = v('Ownership Data', 'W3');
  const eiMax = v('Ownership Scorecard', 'F10');
  // The net value line's own weighting (F17: 8 for Others, 6 elsewhere). The
  // toolkit's J17 outer MIN and 'Oustanding Debts Calcs' K, L and N columns
  // use a hard-coded 8 instead, so a 6-point line can score 8.
  const nvMax = v('Ownership Scorecard', 'F17');
  let credited = 0;
  let formulaA = 0;
  let formulaB = 0;
  /** Formula A and B the toolkit's way, scaled by its hard-coded 8. */
  let formulaA8 = 0;
  let formulaB8 = 0;
  let indebted = 0;
  let lateLoan = false;
  for (const h of holders) {
    const share = n(h['Share %']);
    const bo = n(h['BO%']);
    const debt = n(h['Outstaning Debt']);
    if (share <= 0 || bo <= 0 || debt <= 0 || value <= 0) continue;
    indebted += 1;
    const deemed = (value * share - debt) / value;
    const hBlack = share * Math.min(1, deemed / (0.4 * share)) * bo;
    credited += hBlack;
    const year = Math.ceil(n(h['Loan Term']) + 1 - 1e-12);
    const g = year >= 9 ? 1 : GRADUATION[year] ?? 0;
    if (year > 9) lateLoan = true;
    formulaA += g > 0 ? Math.max(Math.min((hBlack * nvMax) / (0.25 * g), nvMax), 0) : 0;
    formulaA8 += g > 0 ? Math.max(Math.min((hBlack * 8) / (0.25 * g), 8), 0) : 0;
    formulaB += (hBlack / 0.25) * nvMax;
    formulaB8 += (hBlack / 0.25) * 8;
  }
  const ei = free + credited;
  const eiPts = Math.min((Math.max(ei, 0) / 0.25) * eiMax, eiMax);
  const unencumbered = Math.min((free / 0.25) * nvMax, nvMax);
  const nvPts = Math.min(unencumbered + Math.min(formulaA, Math.min(formulaB, nvMax)), nvMax);
  // The same rework with the toolkit's 8s. Above the weighting — or the
  // toolkit's own figure above it — only the hard-coded 8 explains.
  const nvPts8 = Math.min(unencumbered + Math.min(formulaA8, Math.min(formulaB8, 8)), 8);
  const aboveWeighting = nvPts8 > nvMax + 1e-9 || n(sheets['Summary Scorecard']?.F27?.v) > nvMax + 1e-9;
  // Bonus rows (every sub-sector but Others): voting rights beyond 15%
  // against 10% (never below 0), and economic interest at 32.5% / 40%.
  const voting = v('Ownership Data', 'W4');
  const above15 = Math.max(pts(voting > 0 ? voting - 0.15 : 0, 0.10, 3), 0);
  const tier = ei >= 0.4 ? 2 : ei >= 0.325 ? 1 : 0;
  return { indebted, ei, eiPts, nvMax, nvPts, lateLoan, aboveWeighting, above15, tier };
}

interface SkillRow {
  black: boolean; female: boolean; african: boolean; disabled: boolean; position: string;
  af: number; g: number; all: number; lai: boolean; completedU: boolean; absorbedU: boolean; name: string;
}

/**
 * Skills, every line, from the toolkit's own Skills Data columns. Two faults
 * are reworked: its "Within FY?" column compares each row's date with a cell
 * that moves down the Validation sheet row by row (Validation!C2, C3, C4 …),
 * so rows 6, 13 and 25 meet a text label and drop out of every skills sum;
 * and the unemployed, disabled and learnership lines measure against
 * 'Skills Toolkit'!D3 and D6 — locked cells holding another company's
 * leviable amount and headcount — instead of the workbook's own
 * (Financials!I3, 'Client Information'!E16).
 *
 * `asToolkit` computes the same lines the toolkit's faulty way (its own
 * "Within FY?" answers, D3 and D6): the referee overrides a line only when
 * that replica reproduces the toolkit's figure, so a difference with any
 * other cause is never hidden behind these faults.
 */
function refereeSkills(sheets: ToolkitSheets, tables: ToolkitTables, asToolkit = false) {
  const v = (ref: string) => n(sheets['Skills Toolkit']?.[ref]?.v);
  const rows: SkillRow[] = tableRows(tables, 'tblSkillsData')
    .filter((r) => !blankish(r['Data Date']) && (!asToolkit || yes(r['Within FY?'])))
    .map((r) => ({
      black: yes(r['Black']), female: yes(r['Black Females?']), african: yes(r['Africans?']),
      disabled: yes(r['Disabled.calcs']), position: String(r['Management Position.calcs'] ?? '').trim(),
      af: n(r['Cat A-F Spend']) + n(r['Salaries (BCD)']),
      g: n(r['Cat G Spend']) + n(r['Other Legitimate Cost']),
      all: n(r['All Spend']), lai: yes(r['LAI']),
      completedU: yes(r['Completed LAI (Unemployed)']), absorbedU: yes(r['Absorbed LAI [Unemployed]']),
      name: String(r['Learner Name *'] ?? '').trim(),
    }));
  const leviable = asToolkit ? v('D3') : n(sheets['Financials']?.I3?.v);
  const headcount = asToolkit ? v('D6') : n(sheets['Client Information']?.E16?.v);
  const sum = (f: (r: SkillRow) => boolean, val: (r: SkillRow) => number) => rows.filter(f).reduce((a, r) => a + val(r), 0);
  const bands: Array<{ row: number; o: number; inBand: (r: SkillRow) => boolean }> = [
    { row: 51, o: 0, inBand: (r) => r.position === 'Senior Management' || r.position === 'Executive Management' },
    { row: 52, o: 36, inBand: (r) => r.position === 'Middle Management' },
    { row: 53, o: 72, inBand: (r) => r.position === 'Junior Management' },
    { row: 54, o: 108, inBand: (r) => r.position === 'Non-Management' },
  ];
  const out = new Map<number, number>();
  let allBands = 0;
  for (const b of bands) {
    const admin = (col: 'D' | 'E' | 'F') => v(`${col}${28 + b.o}`) + v(`${col}${29 + b.o}`);
    const blackAll = sum((r) => b.inBand(r) && r.black, (r) => r.all) + admin('D');
    const otherAll = sum((r) => b.inBand(r) && !r.black, (r) => r.all);
    allBands += blackAll + otherAll;
    const cap = (blackAll + otherAll) * 0.15;
    const rec = (f: (r: SkillRow) => boolean, col: 'D' | 'E' | 'F') =>
      sum((r) => b.inBand(r) && f(r), (r) => r.af) + Math.min(cap, sum((r) => b.inBand(r) && f(r), (r) => r.g) + admin(col));
    out.set(b.row,
      pts(rec((r) => r.black, 'D'), v(`D${46 + b.o}`), v(`I${24 + b.o}`))
      + pts(rec((r) => r.female, 'E'), v(`E${46 + b.o}`), v(`I${26 + b.o}`))
      + pts(rec((r) => r.african, 'F'), v(`F${46 + b.o}`), v(`I${28 + b.o}`)));
  }
  const unemployed = (r: SkillRow) => r.position === 'Unemployed';
  const uBlack = sum((r) => unemployed(r) && r.black, (r) => r.all);
  const uOther = sum((r) => unemployed(r) && !r.black, (r) => r.all);
  allBands += uBlack + uOther;
  const uRec = sum((r) => unemployed(r) && r.black, (r) => r.af)
    + Math.min((uBlack + uOther) * 0.15, sum((r) => unemployed(r) && r.black, (r) => r.g));
  out.set(55, pts(uRec, leviable * v('F168'), v('G168')));
  const dAdmin = v('D204') + v('D205');
  const dAll = sum((r) => r.disabled && r.black, (r) => r.all) + dAdmin;
  const dRec = sum((r) => r.disabled && r.black, (r) => r.af)
    + Math.min((dAll + allBands) * 0.15, sum((r) => r.disabled && r.black, (r) => r.g) + dAdmin);
  out.set(56, pts(dRec, leviable * v('F200'), v('G200')));
  const unique = (f: (r: SkillRow) => boolean) => new Set(rows.filter(f).map((r) => r.name)).size;
  out.set(57, pts(unique((r) => r.lai && r.black), headcount * v('F236'), v('G236')));
  const completed = unique((r) => r.completedU);
  out.set(58, completed > 0 ? Math.min((unique((r) => r.completedU && r.black && r.absorbedU) / completed) * v('G265'), v('G265')) : 0);
  return out;
}

/**
 * Preferential procurement from the toolkit's own Procurement Data rows, with
 * the 1.2 recognition factor's first-time-supplier test reading the
 * first-time-supplier answer (the toolkit reads the 3-year-contract column).
 * `asToolkit` reads the first-time test the toolkit's way, as the replica
 * that must reproduce the toolkit's lines before the referee overrides them.
 */
function refereeProcurement(sheets: ToolkitSheets, tables: ToolkitTables, asToolkit = false) {
  const v = (ref: string) => n(sheets['Procurement Scorecard']?.[ref]?.v);
  const S = (k: string) => `${k}\n[Scenario].Calcs`;
  let all = 0, qse = 0, eme = 0, bo = 0, bwo = 0, bdg = 0, inter = 0, broker = 0, fund = 0;
  let firstTimeOnly = 0;
  for (const r of tableRows(tables, 'tblPPData')) {
    if (blankish(r['Data Date'])) continue;
    const size = String(r[S('Company Size')] ?? '');
    const small = size === 'QSE' || size === 'EME';
    const own = n(r[S('Black Ownership')]);
    const sd = yes(r[S('Supplier development recipient? (Yes/No)')]);
    const three = yes(r[S('3 year contract in place? (Yes/No)')]);
    const scenarioFirst = r['First-time supplier? (Yes/No)\n[Scenario]'];
    const fallback = asToolkit ? three : yes(r['First-time supplier? (Yes/No)']);
    const first = blankish(scenarioFirst) ? fallback : yes(scenarioFirst);
    const enhanced = small && own >= 0.51 && (sd || three || first);
    if (small && own >= 0.51 && first && !sd && !three) firstTimeOnly += 1;
    const x = n(r['All Spend\nadjusted']) * (enhanced ? 1.2 : 1);
    all += x;
    if (size === 'QSE') qse += x;
    if (size === 'EME') eme += x;
    if (own >= 0.51) bo += x;
    if (n(r[S('Black Female ownership')]) >= 0.3) bwo += x;
    if (own >= 0.51 && n(r[S('Black Designated Group  ownership')]) >= 0.51) bdg += x;
    if (own >= 0.51 && yes(r['Intermediary? (Yes/No)'])) inter += x;
    if (own >= 0.51 && yes(r['Stock broker? (Yes/No)'])) broker += x;
    if (own >= 0.51 && yes(r['Fund manager? (Yes/No)'])) fund += x;
  }
  const lines = new Map<number, number>([
    [61, pts(all, v('G12'), v('E12'))], [62, pts(qse, v('G13'), v('E13'))], [63, pts(eme, v('G14'), v('E14'))],
    [64, pts(bo, v('G15'), v('E15'))], [65, pts(bwo, v('G16'), v('E16'))],
    [66, pts(inter, v('G18'), v('E18'))], [67, pts(Math.max(fund, broker), v('G19'), v('E19'))],
    [68, pts(bdg, v('G20'), v('E20'))],
  ]);
  return { lines, firstTimeOnly };
}

export function fscReferee(sheets: ToolkitSheets, tables?: ToolkitTables): RefereeResult {
  const v = (sheet: string, ref: string) => n(sheets[sheet]?.[ref]?.v);
  const F = (row: number) => v('Summary Scorecard', `F${row}`);
  const manual = (sheet: string, ref: string) => !blankish(sheets[sheet]?.[ref]?.v);
  const lines = new Map<number, { value: number; note: string }>();
  const set = (row: number, value: number, note: string) => {
    if (Math.abs(value - F(row)) > 1e-9) lines.set(row, { value, note });
  };
  const fixed = (row: number) => lines.get(row)?.value ?? F(row);

  if (tables) {
    const own = refereeOwnership(sheets, tables);
    if (!blankish(sheets['Summary Scorecard']?.F28?.v) && !manual('Ownership Scorecard', 'L19')) {
      set(28, own.above15, `Toolkit formula fault: its voting-rights-above-15% bonus goes negative when black voting rights are below 15%. Floored at 0: ${own.above15.toFixed(2)}; the toolkit shows ${F(28).toFixed(2)}.`);
    }
    if (!blankish(sheets['Summary Scorecard']?.F29?.v) && own.indebted > 0 && !manual('Ownership Scorecard', 'L20')) {
      set(29, own.tier, `Toolkit formula fault: this bonus reads the economic interest netted the faulty way (see economic interest). On ${(own.ei * 100).toFixed(2)}%: ${own.tier}; the toolkit shows ${F(29).toFixed(2)}.`);
    }
    if (own.indebted > 0) {
      if (!manual('Ownership Scorecard', 'L10')) {
        set(23, own.eiPts, `Toolkit formula fault: it nets an indebted shareholder's stake by a formula that depends on the row the shareholder sits in, and counts the whole stake as black. Netted the one way and for the black share only, black economic interest is ${(own.ei * 100).toFixed(2)}% → ${own.eiPts.toFixed(2)}; the toolkit shows ${F(23).toFixed(2)}.`);
      }
      if (!manual('Ownership Scorecard', 'L17')) {
        const faults = [
          'the net value nets indebted stakes the same faulty way',
          own.lateLoan ? 'a loan in its tenth year or later finds no graduation factor and scores nothing' : '',
          own.aboveWeighting ? `the line is capped at 8 points, and Formula A and B are scaled by 8, where its weighting is ${own.nvMax}` : '',
        ].filter(Boolean);
        set(27, own.nvPts, `Toolkit formula fault${faults.length > 1 ? 's' : ''}: ${faults.join('; and ')}. Reworked: ${own.nvPts.toFixed(2)} of ${own.nvMax}; the toolkit shows ${F(27).toFixed(2)}.`);
      }
    }
    // Skills: the training rows its "Within FY?" test drops (dated in the
    // year, answered "No"), and whether D3 / D6 differ from the workbook's own.
    const skillRows = tableRows(tables, 'tblSkillsData');
    const dropped = skillRows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !blankish(r['Data Date']) && !yes(r['Within FY?']))
      .map(({ i }) => i + 1);
    const droppedText = dropped.length === 0 ? '' : `its "Within FY?" test compares each training row with a cell that moves down the Validation sheet, so training row${dropped.length > 1 ? 's' : ''} ${dropped.join(', ')} drop${dropped.length > 1 ? '' : 's'} out`;
    const lockedLeviable = Math.abs(v('Skills Toolkit', 'D3') - v('Financials', 'I3')) > 0.5;
    const lockedHeadcount = Math.abs(v('Skills Toolkit', 'D6') - v('Client Information', 'E16')) > 0.5;
    const skillsAsToolkit = refereeSkills(sheets, tables, true);
    for (const [row, value] of Array.from(refereeSkills(sheets, tables).entries())) {
      // Override only where the toolkit's own (faulty) computation is reproduced.
      if (Math.abs((skillsAsToolkit.get(row) ?? NaN) - F(row)) > 1e-6) continue;
      const locked = (row === 55 || row === 56) && lockedLeviable
        ? `this line measures against 'Skills Toolkit'!D3 (leviable amount R${(v('Skills Toolkit', 'D3') / 1e9).toFixed(2)}bn), a locked cell holding another company's figure, instead of the workbook's own (R${(v('Financials', 'I3') / 1e6).toFixed(2)}m)`
        : row === 57 && lockedHeadcount
          ? `this line measures against 'Skills Toolkit'!D6 (headcount ${String(Math.round(v('Skills Toolkit', 'D6'))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}), a locked cell holding another company's figure, instead of the workbook's own (${v('Client Information', 'E16')})`
          : '';
      const why = [locked, droppedText].filter(Boolean);
      if (why.length === 0) continue;
      set(row, value, `Toolkit formula fault${why.length > 1 ? 's' : ''}: ${why.join('; and ')}. ${locked ? 'Against the workbook\'s own figure' : 'Every row in the year counted'}${locked && droppedText ? ', every row in the year counted' : ''}: ${value.toFixed(2)}; the toolkit shows ${F(row).toFixed(2)}.`);
    }
    const pp = refereeProcurement(sheets, tables);
    const ppAsToolkit = refereeProcurement(sheets, tables, true);
    if (pp.firstTimeOnly > 0) {
      for (const [row, value] of Array.from(pp.lines.entries())) {
        if (Math.abs((ppAsToolkit.lines.get(row) ?? NaN) - F(row)) > 1e-6) continue;
        set(row, value, `Toolkit formula fault: the 1.2 recognition factor's first-time-supplier test reads the 3-year-contract column, so ${pp.firstTimeOnly} first-time black-owned QSE/EME supplier(s) lose it. With it: ${value.toFixed(2)}; the toolkit shows ${F(row).toFixed(2)}.`);
      }
    }
    // Management control: black employees with disabilities over all
    // employees. The toolkit's count ('MC Toolkit'!C111) also takes in
    // non-executive directors, whom its denominator (C7) leaves out.
    const mcRows = tableRows(tables, 'tblMCData').filter((r) => !blankish(r['Data Date']));
    // 'MC Toolkit'!C7 (formatted as a date in the template): the period's employees.
    const employees = mcRows.filter((r) => yes(r['Employee?'])).length;
    if (mcRows.length > 0) {
      const disabled = mcRows.filter((r) => yes(r['Disabled.calcs']) && yes(r['Black?']) && yes(r['Employee?'])).length;
      const share = employees > 0 ? disabled / employees : 0;
      const value = pts(share, v('MC Toolkit', 'F112'), v('MC Toolkit', 'G112'));
      set(48, value, `Toolkit formula fault: its count of black people with disabilities includes non-executive directors, whom its count of employees leaves out. Employees only: ${disabled} of ${employees} → ${value.toFixed(2)}; the toolkit shows ${F(48).toFixed(2)}.`);
    }
    // Enterprise and supplier development, from the toolkit's own ESD Data
    // rows. Two faults are reworked:
    //  - a duplicated blank "Minority Investment" factor row recognises a
    //    supplier-development minority investment at 0 (the ED copy says 70%);
    //  - banks and long-term insurers: the EF & ESD scorecard's period picker
    //    ('EF & ESD Scorecard - Banks' / '- Long Term'!I27) takes its date from
    //    the Transaction Financing table (Validation!H168:H186), and the SD, ED
    //    and bonus lines filter the ESD rows by it — with no transaction
    //    financing in the period they read nothing. The ESD rows' own period is
    //    the ESD Scorecard's (I16, Validation!H105:H123).
    const subSector = String(sheets['Client Information']?.D7?.v ?? 'Others').toLowerCase();
    const ef = subSector === 'banks' ? { sheet: 'EF & ESD Scorecard - Banks', sd: 17, ed: 19, grad: 21, jobs: 22, broker: 0 }
      : subSector === 'long-term insurers' ? { sheet: 'EF & ESD Scorecard - Long Term', sd: 16, ed: 18, grad: 20, jobs: 21, broker: 22 }
        : null;
    const esdPeriod = String(sheets['ESD Scorecard']?.I16?.v ?? '');
    const efPeriod = ef ? String(sheets[ef.sheet]?.I27?.v ?? '') : esdPeriod;
    const periodFault = ef !== null && esdPeriod !== '' && efPeriod !== esdPeriod;
    const esdRows = tableRows(tables, 'tblESDData')
      .filter((r) => (ef ? String(r['End of Month'] ?? '') === esdPeriod : true));
    const sdTarget = ef ? v(ef.sheet, `E${ef.sd}`) : v('ESD Scorecard', 'E2') * v('ESD Scorecard', 'F7');
    const sdMax = ef ? v(ef.sheet, `C${ef.sd}`) : v('ESD Scorecard', 'E7');
    let sdRecognised = 0;
    let minorityFault = false;
    for (const r of esdRows.filter((x) => String(x['Pillar'] ?? '') === 'Supplier Development')) {
      const minority = /^minority investment/i.test(String(r['Contribution Type'] ?? ''));
      if (minority && n(r['Recognised Amount']) === 0 && yes(r['Qualify?'])) { sdRecognised += n(r['Amount']) * 0.7; minorityFault = true; }
      else sdRecognised += n(r['Recognised Amount']);
    }
    const periodNote = periodFault
      ? `its EF & ESD scorecard takes its period from the transaction-financing rows (${efPeriod.slice(0, 10) === '1899-12-30' ? 'none in this period' : efPeriod.slice(0, 10)}), so the ESD rows of ${esdPeriod.slice(0, 10)} drop out`
      : '';
    if ((minorityFault || periodFault) && sdTarget > 0) {
      const sd = Math.min((Math.max(sdRecognised, 0) / sdTarget) * sdMax, sdMax);
      const why = [minorityFault ? 'its supplier-development benefit factor for a minority investment reads a duplicated blank row and recognises it at 0 (the enterprise-development copy says 70%)' : '', periodNote].filter(Boolean).join('; and ');
      set(75, sd, `Toolkit formula fault: ${why}. Reworked: ${sd.toFixed(2)}; the toolkit shows ${F(75).toFixed(2)}.`);
    }
    if (periodFault && ef) {
      const ed = esdRows.filter((x) => String(x['Pillar'] ?? '') === 'Enterprise Development');
      const sum = (rs: Array<Record<string, unknown>>) => rs.reduce((a, r) => a + n(r['Recognised Amount']), 0);
      const note = (value: number, row: number) => `Toolkit formula fault: ${periodNote}. In the ESD rows' own period: ${value.toFixed(2)}; the toolkit shows ${F(row).toFixed(2)}.`;
      const edPts = pts(sum(ed), v(ef.sheet, `E${ef.ed}`), v(ef.sheet, `C${ef.ed}`));
      set(78, edPts, note(edPts, 78));
      const grad = esdRows.some((r) => yes(r['Graduated to Supplier Development?'])) ? v(ef.sheet, `C${ef.grad}`) : 0;
      set(79, grad, note(grad, 79));
      const jobs = esdRows.some((r) => yes(r['At least 1 job created?'])) ? v(ef.sheet, `C${ef.jobs}`) : 0;
      set(80, jobs, note(jobs, 80));
      if (ef.broker) {
        const flagged = ed.filter((r) => yes(r['Stock brokers, Fund managers or Intermediaries? (Yes/No)']));
        const broker = pts(sum(flagged), v(ef.sheet, `E${ef.broker}`), v(ef.sheet, `C${ef.broker}`));
        set(81, broker, note(broker, 81));
      }
    }
  }
  // Long-term insurers: transaction financing against its own target (C8, not
  // the targeted-investment portion C6), and transactional access from the
  // share entered (E16), not the typed, locked 80% in H26.
  if (String(sheets['Client Information']?.D7?.v ?? '').toLowerCase() === 'long-term insurers') {
    const L = (ref: string) => v('EF & ESD Scorecard - Long Term', ref);
    const tf = pts(L('K14'), L('C8'), L('C14'));
    set(72, tf, `Toolkit formula fault: transaction financing is measured against the targeted-investment portion (C6) instead of its own target (C8). Against C8: ${tf.toFixed(2)}; the toolkit shows ${F(72).toFixed(2)}.`);
    const cover = v('AFS Scorecard - Long Term', 'E16');
    const ta = cover < 0.5 ? 0 : cover >= 0.6 && cover < 0.7 ? 1 : cover >= 0.7 && cover < 0.8 ? 1.5 : 2;
    const taMax = v('AFS Scorecard - Long Term', 'E26');
    set(92, Math.min(ta, taMax), `Toolkit formula fault: transactional access reads a typed, locked 80% (H26) instead of the share of polygons entered (${(cover * 100).toFixed(1)}%). On the share entered: ${Math.min(ta, taMax).toFixed(2)}; the toolkit shows ${F(92).toFixed(2)}.`);
  }
  // Short-term insurers: each line measured against its own line's target
  // policies. The sheet asks for them where it labels them — D6 for the first
  // line offered, D7 for commercial lines when both are — but its formulas
  // divide by D6 whenever personal lines are offered (so commercial products
  // and policies of a personal-and-commercial insurer meet the personal
  // target) and by D7 for a commercial-only insurer (a cell it never labels, so
  // left empty: every line scores 0).
  if (tables && String(sheets['Client Information']?.D7?.v ?? '').toLowerCase() === 'short-term insurers') {
    const S = 'AFS Scorecard - Short Term';
    const text = (ref: string) => String(sheets[S]?.[ref]?.v ?? '').trim();
    const offered = text('D5');
    if (offered === 'Commercial' || offered === 'Personal and Commercial') {
      const period = text('K35');
      const rows = tableRows(tables, 'tblAFSDataShortTerm').filter((r) => String(r['End of month'] ?? '') === period);
      const target = offered === 'Commercial' ? v(S, 'D6') : v(S, 'D7');
      const measure = (f: (r: Record<string, unknown>) => boolean) => {
        const rs = rows.filter(f);
        if (rs.length === 0 || target <= 0) return 0;
        const count = rs.reduce((a, r) => a + n(r['Number of Qualifying Policies']), 0);
        const compliance = rs.reduce((a, r) => a + n(r['Compliance Percentage']), 0) / rs.length;
        return (count * compliance) / target;
      };
      const why = offered === 'Commercial'
        ? `its formula divides by D7, a cell the sheet never labels for a commercial-only insurer, instead of the commercial-line target it asks for in D6 (${target})`
        : `its formula measures commercial lines against the personal-line target (D6, ${v(S, 'D6')}) instead of the commercial-line target (D7, ${target})`;
      for (let i = 0; i < 10; i++) {
        const product = text(`C${12 + i}`);
        if (!product.startsWith('Commercial')) continue;
        const max = v(S, `E${12 + i}`);
        const value = Math.min(measure((r) => String(r['Policy Type (Adjusted)'] ?? '') === product) * max, max);
        set(90 + i, value, `Toolkit formula fault: ${why}. Against its own target: ${value.toFixed(2)}; the toolkit shows ${F(90 + i).toFixed(2)}.`);
      }
      for (let j = 0; j < 2; j++) {
        if (text(`C${26 + j}`) !== 'Commercial line policies') continue;
        const max = v(S, `E${26 + j}`);
        const value = Math.min(measure((r) => String(r['Policy Line'] ?? '') === 'Commercial line policies') * max, max);
        set(100 + j, value, `Toolkit formula fault: ${why}. Against its own target: ${value.toFixed(2)}; the toolkit shows ${F(100 + j).toFixed(2)}.`);
      }
    }
  }
  // Additional consumer education: above the consumer-education target, not the SED one.
  if (String(sheets['Client Information']?.D8?.v ?? '') !== 'Reinsurers') {
    const c2 = v('SED & CE Scorecard', 'C2');
    const additional = Math.max(v('SED & CE Scorecard', 'I8') - v('SED & CE Scorecard', 'F8'), 0);
    const max = v('SED & CE Scorecard', 'D10');
    const val = c2 > 0 ? Math.min((additional / c2 / v('SED & CE Scorecard', 'E10')) * max, max) : 0;
    set(86, val, `Toolkit formula fault: additional consumer education is counted above the SED target (0.6% of NPAT) instead of above the consumer-education target (0.4%). Above its own target: ${val.toFixed(2)}; the toolkit shows ${F(86).toFixed(2)}.`);
  }

  // Element totals and the grand total, with the corrected lines.
  const groups: Array<[number, number[]]> = [
    [20, [21, 22, 23, 24, 25, 26, 27, 28, 29]],
    [31, [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]],
    [50, [51, 52, 53, 54, 55, 56, 57, 58]],
    [70, [71, 72]],
    [89, [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101]],
    [74, [75]],
    [77, [78, 79, 80, 81]],
    [83, [84, 85, 86, 87]],
  ];
  let delta = 0;
  for (const [total, rows] of groups) {
    const d = rows.reduce((a, r) => a + (fixed(r) - F(r)), 0);
    if (Math.abs(d) > 1e-12) { lines.set(total, { value: F(total) + d, note: 'Includes the corrected lines.' }); delta += d; }
  }
  // Procurement: five base lines, the better of rows 66 / 67, and row 68.
  const ppTotal = [61, 62, 63, 64, 65].reduce((a, r) => a + fixed(r), 0) + Math.max(fixed(66), fixed(67)) + fixed(68);
  if (Math.abs(ppTotal - F(60)) > 1e-9) { lines.set(60, { value: ppTotal, note: 'Includes the corrected lines.' }); delta += ppTotal - F(60); }
  const total = F(104) + delta;
  if (Math.abs(delta) > 1e-12) lines.set(104, { value: total, note: 'Includes the corrected lines above.' });

  // Levels against the toolkit's own thresholds (Summary F5:F12); a total
  // exactly on a threshold reaches it (the toolkit's round-down uses "<").
  const thresholds = [5, 6, 7, 8, 9, 10, 11, 12].map((r, i) => ({ level: i + 1, min: v('Summary Scorecard', `F${r}`) }));
  const achieved = thresholds.find((t) => total >= t.min)?.level ?? 9;
  const ppBaseMax = [61, 62, 63, 64, 65].reduce((a, r) => a + v('Summary Scorecard', `C${r}`), 0);
  // Banks and long-term insurers: empowerment financing in procurement's place.
  const efElement = !blankish(sheets['Summary Scorecard']?.C70?.v);
  const failed = fixed(27) < v('Scorecard Calculations', 'G3')
    || [51, 52, 53, 54, 55, 56, 57].reduce((a, r) => a + fixed(r), 0) < v('Scorecard Calculations', 'G5')
    || (efElement
      ? fixed(70) < v('Summary Scorecard', 'C70') * 0.4
      : [61, 62, 63, 64, 65].reduce((a, r) => a + fixed(r), 0) < ppBaseMax * 0.4)
    || fixed(75) < v('Scorecard Calculations', 'G8')
    || fixed(78) < v('Scorecard Calculations', 'G9');
  const discounted = failed ? (achieved >= 8 ? 9 : achieved + 1) : achieved;
  const exAchieved = levelNumber(sheets['Summary Scorecard']?.F109?.v);
  const exDiscounted = levelNumber(sheets['Summary Scorecard']?.F111?.v);
  const lvl = (l: number) => (l === 9 ? 'Non-compliant' : `Level ${l}`);
  return {
    lines,
    achieved,
    discounted,
    achievedNote: achieved !== exAchieved ? `The toolkit shows ${lvl(exAchieved)}: from its uncorrected lines, or its level lookup dropping a level exactly on a threshold.` : undefined,
    discountedNote: discounted !== exDiscounted ? `The toolkit shows ${lvl(exDiscounted)}: from its uncorrected lines, or its procurement sub-minimum reading empty cells (it never fails).` : undefined,
  };
}
