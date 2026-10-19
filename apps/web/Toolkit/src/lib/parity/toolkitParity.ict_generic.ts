/**
 * Toolkit parity, ICT Generic — the line map and the referee for the Empower
 * "BBBEE Toolkit (ICT Generic) Template v1.4", used by the ICT parity harness
 * and its always-on gate. The RCOGP Generic module (toolkitParity.ts) is the
 * model; this one only knows the ICT template's rows and formulas.
 *
 * The referee is the toolkit recalculated by Excel. Where a toolkit formula is
 * evidently defective, the referee is what that formula evidently means,
 * computed from the toolkit's OWN figures; every such line says why:
 *  - ownership points use MIN(I / LEFT(E,3) × D, D): LEFT() turns the 3% and
 *    2% targets into "0.0", so designated groups and new entrants always
 *    score 0 (same as RCOGP Generic);
 *  - acquisition debt is netted by a formula that depends on the row a
 *    shareholder sits in, and an indebted holder's whole stake counts as
 *    black (same 'Oustanding Debts Calcs' sheet as RCOGP Generic);
 *  - the Supplier Development benefit factor for a minority investment reads
 *    a duplicated blank row and is 0 (same table as RCOGP Generic);
 *  - 'Skills Calcs'!F58:F62 count every black learner in a learnership,
 *    apprenticeship or internship as "unemployed" — only the African-male row
 *    tests "Employed?" = No;
 *  - 'Employee Demographics'!J7:N7 (the disabled-staff shares of five of the
 *    six black groups) were filled across with drifting references and read
 *    0, so those groups get none of the training-admin costs on the disabled
 *    line;
 *  - 'Procurement Data'[First-time supplier? [Scenario].Calcs] reads the
 *    3-year-contract answer, so a first-time supplier never earns the 1.2
 *    factor on that ground;
 *  - both job-creation bonus tiers can score together (1 + 2), although the
 *    element's own weighting (Summary C61 = 15 + 1 + 2) and its gap column
 *    treat them as alternatives;
 *  - the level lookup uses a strict "<", so a total exactly on a threshold
 *    drops a level (same as RCOGP Generic).
 */
import type { ScorecardResult } from '../types';

export type ParityPillarKey = keyof ScorecardResult;

export interface IctParityLine {
  /** Summary Scorecard row(s) (column F); several rows are added together. */
  rows: number[];
  pillar: ParityPillarKey;
  label: string;
  /** Our breakdown-line names that score this indicator (first match wins). */
  names: string[];
}

export const ICT_GENERIC_LINES: IctParityLine[] = [
  { rows: [20], pillar: 'ownership', label: 'Voting rights: black', names: ['Exercisable voting rights of black individuals'] },
  { rows: [21], pillar: 'ownership', label: 'Voting rights: black women', names: ['Exercisable voting rights of black females'] },
  { rows: [22], pillar: 'ownership', label: 'Economic interest: black', names: ['Economic interest of black individuals'] },
  { rows: [23], pillar: 'ownership', label: 'Economic interest: black women', names: ['Economic interest of black females'] },
  { rows: [24], pillar: 'ownership', label: 'Economic interest: designated groups', names: ['Economic interest of black designated groups or participants in ownership schemes'] },
  { rows: [25], pillar: 'ownership', label: 'Economic interest: new entrants', names: ['Economic interest of black new entrants'] },
  { rows: [26], pillar: 'ownership', label: 'Net value', names: ['Net value'] },
  { rows: [29], pillar: 'managementControl', label: 'Board: black members', names: ['Exercisable voting rights of black board members'] },
  { rows: [30], pillar: 'managementControl', label: 'Board: black women members', names: ['Exercisable voting rights of black female board members'] },
  { rows: [31], pillar: 'managementControl', label: 'Executive directors: black', names: ['Black executive directors'] },
  { rows: [32], pillar: 'managementControl', label: 'Executive directors: black women', names: ['Black female executive directors'] },
  { rows: [33], pillar: 'managementControl', label: 'Other executive management: black', names: ['Black other executive management'] },
  { rows: [34], pillar: 'managementControl', label: 'Other executive management: black women', names: ['Black female other executive management'] },
  { rows: [35], pillar: 'managementControl', label: 'Senior management: black', names: ['Black employees in senior management'] },
  { rows: [36], pillar: 'managementControl', label: 'Senior management: black women', names: ['Black female employees in senior management'] },
  { rows: [37], pillar: 'managementControl', label: 'Middle management: black', names: ['Black employees in middle management'] },
  { rows: [38], pillar: 'managementControl', label: 'Middle management: black women', names: ['Black female employees in middle management'] },
  { rows: [39], pillar: 'managementControl', label: 'Junior management: black', names: ['Black employees in junior management'] },
  { rows: [40], pillar: 'managementControl', label: 'Junior management: black women', names: ['Black female employees in junior management'] },
  { rows: [41], pillar: 'managementControl', label: 'Employees with disabilities', names: ['Black employees with disabilities'] },
  { rows: [44], pillar: 'skillsDevelopment', label: 'Learning programmes', names: ['Expenditure on learning programmes for Black people'] },
  { rows: [45], pillar: 'skillsDevelopment', label: 'Disabled learners', names: ['Expenditure on learning programmes for disabled black employees'] },
  { rows: [46], pillar: 'skillsDevelopment', label: 'Learnerships / apprenticeships / internships', names: ['Number of ALL Black people participating in learnerships, apprenticeships or internships'] },
  { rows: [47], pillar: 'skillsDevelopment', label: 'Unemployed learners in learnerships etc.', names: ['Number of unemployed Black people participating in learnerships, apprenticeships or internships'] },
  { rows: [48], pillar: 'skillsDevelopment', label: 'Absorption (bonus)', names: ['Absorption of black people after learnerships, apprenticeships or internships'] },
  { rows: [51], pillar: 'procurement', label: 'Empowering suppliers', names: ['B-BBEE Procurement Spend from Empowering Suppliers'] },
  { rows: [52], pillar: 'procurement', label: 'QSE empowering suppliers', names: ['Spend on QSE Empowering Suppliers'] },
  { rows: [53], pillar: 'procurement', label: 'EME suppliers', names: ['Spend on EME Suppliers'] },
  { rows: [54], pillar: 'procurement', label: '51% black-owned suppliers', names: ['Spend on Empowering Suppliers ≥51% Black Owned'] },
  { rows: [55], pillar: 'procurement', label: '30% black-women-owned suppliers', names: ['Spend on Empowering Suppliers >30% Black Female Owned'] },
  { rows: [56], pillar: 'procurement', label: 'Designated-group suppliers (bonus)', names: ['Spend on Designated Group Suppliers ≥51% Black Owned'] },
  { rows: [59], pillar: 'supplierDevelopment', label: 'Supplier development', names: ['Annual value of all Supplier Development contributions'] },
  { rows: [62], pillar: 'enterpriseDevelopment', label: 'Enterprise development', names: ['Annual value of Enterprise Development contributions'] },
  { rows: [63], pillar: 'enterpriseDevelopment', label: 'Graduation bonus', names: ['Graduation of ED beneficiaries to SD beneficiaries'] },
  { rows: [64, 65], pillar: 'enterpriseDevelopment', label: 'Jobs created bonus (both tiers)', names: ['Jobs created from ED & SD initiatives'] },
  { rows: [68], pillar: 'socioEconomicDevelopment', label: 'Socio-economic development', names: ['Annual value of all SED contributions'] },
];

export const ICT_GENERIC_TOTAL_ROWS: Array<{ row: number; pillar: ParityPillarKey; label: string }> = [
  { row: 19, pillar: 'ownership', label: 'Ownership' },
  { row: 28, pillar: 'managementControl', label: 'Management control' },
  { row: 43, pillar: 'skillsDevelopment', label: 'Skills development' },
  { row: 50, pillar: 'procurement', label: 'Preferential procurement' },
  { row: 58, pillar: 'supplierDevelopment', label: 'Supplier development' },
  { row: 61, pillar: 'enterpriseDevelopment', label: 'Enterprise development' },
  { row: 67, pillar: 'socioEconomicDevelopment', label: 'Socio-economic development' },
  { row: 70, pillar: 'total', label: 'Grand total' },
];

/** Summary Scorecard rows carrying the achieved and discounted levels. */
export const ICT_GENERIC_LEVEL_ROWS = { achieved: 74, discounted: 76 } as const;

/** Cell values as the Excel dump carries them: sheet → cell → { v }. */
export type ToolkitSheets = Record<string, Record<string, { v: unknown }>>;
/** Excel table dumps: name → { headers, rows }. */
export type ToolkitTables = Record<string, { headers: unknown[]; rows: unknown[][] }>;

/** The cells the referee reads beyond the Summary Scorecard (export_ict_generic.py writes them). */
export const ICT_REFEREE_CELLS: Array<[string, string]> = [
  ...['I10', 'I12', 'J7', 'J10', 'J12', 'J13', 'D1'].map((r): [string, string] => ['Ownership Scorecard', r]),
  ['Ownership Data', 'W3'],
  ['ESD Scorecard', 'D2'],
  ...['D6', 'D7', 'D9'].map((r): [string, string] => ['Skills Toolkit', r]),
  ...[57, 58, 59, 60, 61, 62].flatMap((r) => ['D', 'E'].map((c): [string, string] => ['Skills Calcs', `${c}${r}`])),
  ...[20, 21, 22, 23, 24, 25, 31, 32, 33, 34, 35, 36].flatMap((r) =>
    ['D', 'E', 'I', 'K', 'L', 'O', 'P'].map((c): [string, string] => ['Skills Calcs', `${c}${r}`])),
  ['Skills Calcs', 'D37'], ['Skills Calcs', 'E37'],
  ['Procurement Scorecard', 'C3'], ['Procurement Scorecard', 'C4'],
  ...[9, 10, 11, 12, 13, 15].flatMap((r) => ['C', 'D', 'H'].map((c): [string, string] => ['Procurement Scorecard', `${c}${r}`])),
];

/** The table columns the referee reads (export_ict_generic.py keeps only these). */
export const ICT_REFEREE_TABLE_COLUMNS: Record<string, string[]> = {
  tblOwnershipData: ['Shareholder', 'Share %', 'BO%', 'Outstaning Debt'],
  tblESDData: ['Pillar', 'Contribution Type', 'Amount', 'Recognised Amount'],
  tblSkillsData: ['Within FY?', 'Black', 'LAI', 'Employment?.calcs', 'Race.calcs', 'Gender.calcs'],
  tblMCData: ['Employee?', 'Black?', 'Race.calcs', 'Gender.calcs', 'Disabled.calcs'],
  tblPPData: [
    'Company Size\n[Scenario].Calcs', 'Black Ownership\n[Scenario].Calcs', 'Black Female ownership\n[Scenario].Calcs',
    'Black Designated Group  ownership\n[Scenario].Calcs', 'First-time supplier? (Yes/No)',
    'All Spend\nadjusted', 'All Spend adjusted \nPLUS x1.2 Factor',
  ],
};

const ICT_LEVEL_THRESHOLDS: Array<[number, number]> = [[120, 1], [115, 2], [110, 3], [100, 4], [95, 5], [90, 6], [75, 7], [55, 8]];
export const ictLevelForPoints = (points: number) => ICT_LEVEL_THRESHOLDS.find(([min]) => points >= min)?.[1] ?? 9;

export function levelNumber(v: unknown): number {
  const s = String(v ?? '');
  if (/non/i.test(s)) return 9;
  const m = s.match(/(\d)/);
  return m ? Number(m[1]) : NaN;
}

const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);

/** Summary Scorecard column F for one row (null when the toolkit leaves it blank). */
export function ictSummaryValue(sheets: ToolkitSheets, row: number): number | null {
  const v = sheets['Summary Scorecard']?.[`F${row}`]?.v;
  if (v === '' || v == null) return null;
  return typeof v === 'number' ? v : Number(v);
}

function tableRows(tables: ToolkitTables | undefined, name: string): Array<Record<string, unknown>> {
  const t = tables?.[name];
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [String(h), r[i]])));
}

const yes = (v: unknown) => String(v ?? '').trim() === 'Yes';
/** IFERROR(MIN(actual / target × points, points), 0). */
const capped = (actual: number, target: number, points: number) =>
  target > 0 && Number.isFinite(target) ? Math.min(actual / target * points, points) : 0;

const GROUPS: Array<{ race: string; gender: string }> = [
  { race: 'African', gender: 'Male' }, { race: 'Coloured', gender: 'Male' }, { race: 'Indian', gender: 'Male' },
  { race: 'African', gender: 'Female' }, { race: 'Coloured', gender: 'Female' }, { race: 'Indian', gender: 'Female' },
];

/**
 * Black economic interest after acquisition debt, as the toolkit means it —
 * the same reading as the RCOGP Generic referee (the two templates share the
 * 'Oustanding Debts Calcs' sheet): the stakes held without debt plus each
 * indebted black shareholder's stake, credited in full once its net value
 * reaches 40% of it and pro rata below, for the black share of that stake only.
 */
function intendedEconomicInterest(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  const holders = tableRows(tables, 'tblOwnershipData');
  if (holders.length === 0) return null;
  const value = n(sheets['Ownership Scorecard']?.D1?.v);
  let ei = n(sheets['Ownership Data']?.W3?.v);
  for (const h of holders) {
    const share = n(h['Share %']);
    const bo = n(h['BO%']);
    const debt = n(h['Outstaning Debt']);
    if (share <= 0 || bo <= 0 || debt <= 0 || value <= 0) continue;
    const deemed = (value * share - debt) / value;
    ei += share * Math.min(1, deemed / (0.4 * share)) * bo;
  }
  return ei;
}

/** Supplier development with the SD minority-investment factor at 70% (the ED copy of the row). */
function intendedSupplierDevelopment(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  const rows = tableRows(tables, 'tblESDData').filter((r) => String(r['Pillar'] ?? '') === 'Supplier Development');
  if (rows.length === 0) return null;
  const npat = n(sheets['ESD Scorecard']?.D2?.v);
  if (npat <= 0) return null;
  let recognised = 0;
  for (const r of rows) {
    const minority = /^minority investment/i.test(String(r['Contribution Type'] ?? ''));
    recognised += minority && n(r['Recognised Amount']) === 0 ? n(r['Amount']) * 0.7 : n(r['Recognised Amount']);
  }
  return Math.min(Math.max(recognised / npat, 0) / 0.02 * 10, 10);
}

/** 'Skills Calcs' J63 with every group tested for "Employed?" = No, as its African-male row is. */
function intendedUnemployedLai(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  const t = tableRows(tables, 'tblSkillsData');
  if (!tables.tblSkillsData) return null;
  const calcs = sheets['Skills Calcs'] ?? {};
  let pts = 0;
  GROUPS.forEach((g, i) => {
    const row = 57 + i;
    const count = t.filter((r) => yes(r['Within FY?']) && yes(r['Black']) && yes(r['LAI'])
      && String(r['Employment?.calcs'] ?? '') === 'No'
      && String(r['Race.calcs'] ?? '') === g.race && String(r['Gender.calcs'] ?? '') === g.gender).length;
    pts += capped(count, n(calcs[`D${row}`]?.v), n(calcs[`E${row}`]?.v));
  });
  return pts;
}

/**
 * The disabled-learner line with each group's share of the training-admin
 * costs ('Employee Demographics' row 7, disabled black staff of the group over
 * all employees) — the toolkit has it for African men only.
 */
function intendedDisabled(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  const tk = sheets['Skills Toolkit'] ?? {};
  const admin = n(tk.D6?.v) + n(tk.D7?.v);
  if (admin <= 0 || !tables.tblMCData) return null;
  const mc = tableRows(tables, 'tblMCData');
  const staff = mc.filter((r) => yes(r['Employee?'])).length;
  if (staff <= 0) return null;
  const share = (g: { race: string; gender: string }) => mc.filter((r) => yes(r['Employee?']) && yes(r['Black?'])
    && String(r['Race.calcs']) === g.race && String(r['Gender.calcs']) === g.gender && yes(r['Disabled.calcs'])).length / staff;
  const calcs = sheets['Skills Calcs'] ?? {};
  const v = (ref: string) => n(calcs[ref]?.v);
  const eapSplit = String(tk.D9?.v ?? '') === 'Yes';
  const first = eapSplit ? 20 : 31;
  let pts = 0;
  GROUPS.forEach((g, i) => {
    const r = first + i;
    const recognised = v(`P${r}`) + admin * 0.15 * share(g) + Math.min(v(`I${r}`) + v(`L${r}`), v(`O${r}`));
    pts += eapSplit ? capped(recognised, v(`D${r}`), v(`E${r}`)) : capped(recognised, v('D37'), v('E37'));
  });
  return eapSplit ? pts : Math.min(pts, v('E37'));
}

/** Procurement lines with the 1.2 factor also on first-time suppliers (≥51% black-owned QSEs/EMEs). */
function intendedProcurement(sheets: ToolkitSheets, tables: ToolkitTables): Map<number, number> | null {
  const rows = tableRows(tables, 'tblPPData');
  if (rows.length === 0) return null;
  const extra = new Map<number, number>([[9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [15, 0]]);
  for (const r of rows) {
    const size = String(r['Company Size\n[Scenario].Calcs'] ?? '');
    const bo = n(r['Black Ownership\n[Scenario].Calcs']);
    const adjusted = n(r['All Spend\nadjusted']);
    const enhanced = n(r['All Spend adjusted \nPLUS x1.2 Factor']);
    const shouldEnhance = (size === 'QSE' || size === 'EME') && bo >= 0.51 && yes(r['First-time supplier? (Yes/No)']);
    if (!shouldEnhance || Math.abs(enhanced - adjusted * 1.2) < 1e-6 || adjusted <= 0) continue;
    const delta = adjusted * 1.2 - enhanced;
    extra.set(9, extra.get(9)! + delta);
    if (size === 'QSE') extra.set(10, extra.get(10)! + delta);
    if (size === 'EME') extra.set(11, extra.get(11)! + delta);
    extra.set(12, extra.get(12)! + delta);
    if (n(r['Black Female ownership\n[Scenario].Calcs']) >= 0.3) extra.set(13, extra.get(13)! + delta);
    if (n(r['Black Designated Group  ownership\n[Scenario].Calcs']) >= 0.51) extra.set(15, extra.get(15)! + delta);
  }
  if ([...extra.values()].every((x) => x === 0)) return null;
  const ps = sheets['Procurement Scorecard'] ?? {};
  const den = Math.max(n(ps.C3?.v), n(ps.C4?.v));
  const out = new Map<number, number>();
  for (const [psRow, delta] of extra) {
    const spend = n(ps[`H${psRow}`]?.v) + delta;
    const ratio = den > 0 ? spend / den : 0;
    out.set(psRow, capped(ratio, n(ps[`D${psRow}`]?.v), n(ps[`C${psRow}`]?.v)));
  }
  return out;
}

export interface IctRefereeResult {
  /** Summary rows whose referee value replaces the toolkit's, with why. */
  lines: Map<number, { value: number; note: string }>;
  achieved: number;
  discounted: number;
  achievedNote?: string;
  discountedNote?: string;
}

export function refereeIctGeneric(sheets: ToolkitSheets, tables?: ToolkitTables): IctRefereeResult {
  const v = (sheet: string, ref: string) => n(sheets[sheet]?.[ref]?.v);
  const F = (row: number) => v('Summary Scorecard', `F${row}`);
  const lines = new Map<number, { value: number; note: string }>();
  const deltas: Record<number, number> = {};
  const set = (row: number, total: number, value: number, note: string) => {
    if (Math.abs(value - F(row)) <= 1e-9) return;
    lines.set(row, { value, note });
    deltas[total] = (deltas[total] ?? 0) + value - F(row);
  };
  const manualSet = (ref: string) => {
    const m = sheets['Ownership Scorecard']?.[ref]?.v;
    return m !== undefined && m !== null && m !== '';
  };

  // Ownership.
  const ei = tables ? intendedEconomicInterest(sheets, tables) : null;
  if (ei !== null) {
    for (const d of [{ row: 22, target: 0.3, pts: 4, manual: 'J7' }, { row: 26, target: 1, pts: 8, manual: 'J13' }]) {
      if (manualSet(d.manual)) continue;
      const intended = Math.min(Math.max(ei, 0) / d.target * d.pts, d.pts);
      set(d.row, 19, intended,
        `Toolkit formula fault: it nets an indebted shareholder's stake by a formula that depends on the row the shareholder sits in, and counts the whole stake as black. Its own figures, netted the one way and for the black share only, give ${(ei * 100).toFixed(2)}% black economic interest → ${intended.toFixed(2)}; the toolkit shows ${F(d.row).toFixed(2)}.`);
    }
  }
  for (const d of [{ row: 24, measure: 'I10', manual: 'J10', target: 0.03, pts: 3 }, { row: 25, measure: 'I12', manual: 'J12', target: 0.02, pts: 2 }]) {
    if (manualSet(d.manual)) continue;
    const measure = v('Ownership Scorecard', d.measure);
    const intended = Math.min(Math.max(measure, 0) / d.target * d.pts, d.pts);
    set(d.row, 19, intended,
      `Toolkit formula fault (its target is cut to "${String(d.target).slice(0, 3)}"): its own measure ${(measure * 100).toFixed(2)}% against the real ${d.target * 100}% target gives ${intended.toFixed(2)}; the toolkit shows ${F(d.row).toFixed(2)}.`);
  }

  // Skills.
  if (tables) {
    const dis = intendedDisabled(sheets, tables);
    if (dis !== null) {
      set(45, 43, dis, `Toolkit formula fault: 'Employee Demographics'!J7:N7 read 0, so only African men get a share of the training-admin costs on this line. With every group's share of disabled black staff: ${dis.toFixed(2)}; the toolkit shows ${F(45).toFixed(2)}.`);
    }
    const ul = intendedUnemployedLai(sheets, tables);
    if (ul !== null) {
      set(47, 43, ul, `Toolkit formula fault: 'Skills Calcs'!F58:F62 do not test "Employed?" = No, so employed learners count as unemployed in every group but African men. Counting unemployed learners only: ${ul.toFixed(2)}; the toolkit shows ${F(47).toFixed(2)}.`);
    }
  }

  // Procurement.
  const pp = tables ? intendedProcurement(sheets, tables) : null;
  if (pp) {
    const summaryRow: Record<number, number> = { 9: 51, 10: 52, 11: 53, 12: 54, 13: 55, 15: 56 };
    for (const [psRow, value] of pp) {
      const row = summaryRow[psRow];
      set(row, 50, value, `Toolkit formula fault: its "first-time supplier" test reads the 3-year-contract answer, so a first-time supplier (a ≥51% black-owned QSE/EME) misses the 1.2 recognition factor. With the factor: ${value.toFixed(2)}; the toolkit shows ${F(row).toFixed(2)}.`);
    }
  }

  // Supplier development.
  const sd = tables ? intendedSupplierDevelopment(sheets, tables) : null;
  if (sd !== null) {
    set(59, 58, sd, `Toolkit formula fault: its supplier-development benefit factor for a minority investment reads a duplicated blank row and recognises it at 0 (the enterprise-development copy says 70%). At 70%: ${sd.toFixed(2)}; the toolkit shows ${F(59).toFixed(2)}.`);
  }

  // Enterprise development: the two job tiers are alternatives.
  if (F(64) > 0 && F(65) > 0) {
    set(64, 61, 0, `Toolkit formula fault: both job-creation tiers score (1 + 2), though the element's weighting (15 + 1 + 2) and its gap column treat them as alternatives. The higher tier only: ${F(65).toFixed(2)}; the toolkit shows ${(F(64) + F(65)).toFixed(2)}.`);
  }

  for (const [totalRow, delta] of Object.entries(deltas)) {
    const row = Number(totalRow);
    lines.set(row, { value: F(row) + delta, note: 'Includes the corrected lines in this element.' });
  }
  const totalDelta = Object.values(deltas).reduce((a, b) => a + b, 0);
  const total = F(70) + totalDelta;
  if (totalDelta !== 0) lines.set(70, { value: total, note: 'Includes the corrected lines above.' });

  const achieved = ictLevelForPoints(total);
  const val = (row: number) => lines.get(row)?.value ?? F(row);
  const skillsBase = val(44) + val(45) + val(46) + val(47);
  const ppBase = val(51) + val(52) + val(53) + val(54) + val(55);
  // 'Scorecard Calculations'!F3:F8: net value 3.2, Skills base 8, PP base 10, SD 4, ED base 6.
  const subMinFailed = val(26) < 3.2 || skillsBase < 8 || ppBase < 10 || val(59) < 4 || val(62) < 6;
  const discounted = subMinFailed ? (achieved >= 8 ? 9 : achieved + 1) : achieved;
  const exAchieved = levelNumber(sheets['Summary Scorecard']?.[`F${ICT_GENERIC_LEVEL_ROWS.achieved}`]?.v);
  const exDiscounted = levelNumber(sheets['Summary Scorecard']?.[`F${ICT_GENERIC_LEVEL_ROWS.discounted}`]?.v);
  const lvl = (x: number) => (x === 9 ? 'Non-compliant' : `Level ${x}`);
  return {
    lines,
    achieved,
    discounted,
    achievedNote: achieved !== exAchieved
      ? `The toolkit shows ${lvl(exAchieved)}: its level comes from the projected column, uses a strict "<" on the thresholds, or reads the uncorrected lines above.`
      : undefined,
    discountedNote: discounted !== exDiscounted
      ? `The toolkit shows ${lvl(exDiscounted)}: it discounts from its own (uncorrected) lines and level.`
      : undefined,
  };
}
