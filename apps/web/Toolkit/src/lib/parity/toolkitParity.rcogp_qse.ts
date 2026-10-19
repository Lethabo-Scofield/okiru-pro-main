/**
 * Toolkit parity, RCOGP QSE (Empower template v1.1) — the line map and the
 * referee for this template, shared by its parity harness and its always-on
 * gate. The RCOGP Generic definitions live in ./toolkitParity and are not
 * changed by this file.
 *
 * The referee is the Empower QSE toolkit recalculated by Excel. Where one of
 * its formulas is evidently broken, the referee is what that formula
 * evidently means, computed from the toolkit's OWN measured values, and every
 * such line carries a note. The defects (docs/toolkits/parity/findings/rcogp_qse.md):
 *  - ownership points use MIN(I / LEFT(E,3) × D, D): LEFT() reads the 25%
 *    economic-interest target as "0.2" and the 2% new-entrants-or-designated-
 *    groups target as "0.0", so that line can never score;
 *  - economic interest after acquisition debt nets the first indebted
 *    shareholder one way and the rest another, and credits an indebted
 *    holder's whole stake as black (as in the Generic template);
 *  - the absorption bonus divides black absorbed learners by ALL absorbed
 *    learners ('Skills Calcs'!J28 = I28 / I30), so one black learner absorbed
 *    out of twenty earns the full 5 points; the line's own headcount cell
 *    (D28, learners who completed a learnership while unemployed) is the
 *    evident denominator;
 *  - "First-time supplier? [Scenario].Calcs" reads the 3-year-contract column,
 *    so the first-time-supplier answer never earns the 1.2 recognition factor;
 *  - the Supplier Development benefit-factor lookup meets a duplicated blank
 *    "Minority Investment" row and recognises such a contribution at 0 (the
 *    Enterprise Development row says 70%);
 *  - the discount test ('Scorecard Calculations'!C13) sums the gap and
 *    scenario columns for Skills and Procurement (G5 = SUM(F34:J36),
 *    G6 = SUM(F40:J41)), so those two always pass, and it discounts on ANY
 *    priority-element failure — the large-enterprise rule. A QSE must meet
 *    Ownership and either Skills or Enterprise and Supplier Development (the
 *    Codes; the template's own YES sheet applies a QSE rule too);
 *  - the level lookup uses a strict "<", so a total exactly on a threshold
 *    drops a level.
 */
import type { ParityLine, ParityPillarKey, RefereeResult, ToolkitSheets, ToolkitTables } from './toolkitParity';
import { levelForPoints, levelNumber } from './toolkitParity';

/** RCOGP QSE Summary Scorecard rows (column F) → our breakdown lines. */
export const RCOGP_QSE_LINES: ParityLine[] = [
  { row: 20, pillar: 'ownership', label: 'Voting rights: black', names: ['Exercisable voting rights of black individuals'] },
  { row: 21, pillar: 'ownership', label: 'Voting rights: black women', names: ['Exercisable voting rights of black females'] },
  { row: 22, pillar: 'ownership', label: 'Economic interest: black', names: ['Economic interest of black individuals'] },
  { row: 23, pillar: 'ownership', label: 'Economic interest: black women', names: ['Economic interest of black females'] },
  { row: 24, pillar: 'ownership', label: 'Economic interest: new entrants or designated groups', names: ['Economic interest of black new entrants or designated groups'] },
  { row: 25, pillar: 'ownership', label: 'Net value', names: ['Net value'] },
  { row: 28, pillar: 'managementControl', label: 'Executive management: black', names: ['Black executive directors'] },
  { row: 29, pillar: 'managementControl', label: 'Executive management: black women', names: ['Black female executive directors'] },
  { row: 30, pillar: 'managementControl', label: 'Senior, middle and junior management: black', names: ['Black employees in senior management'] },
  { row: 31, pillar: 'managementControl', label: 'Senior, middle and junior management: black women', names: ['Black female employees in senior management'] },
  { row: 34, pillar: 'skillsDevelopment', label: 'Learning programmes: black people', names: ['Expenditure on learning programmes for Black people'] },
  { row: 35, pillar: 'skillsDevelopment', label: 'Learning programmes: black women', names: ['Expenditure on learning programmes for Black women'] },
  { row: 36, pillar: 'skillsDevelopment', label: 'Learning programmes: black people with disabilities', names: ['Expenditure on learning programmes for disabled black employees'] },
  { row: 37, pillar: 'skillsDevelopment', label: 'Absorption (bonus)', names: ['Absorption of black people after learnerships, apprenticeships or internships'] },
  { row: 40, pillar: 'procurement', label: 'Empowering suppliers', names: ['B-BBEE Procurement Spend from Empowering Suppliers'] },
  { row: 41, pillar: 'procurement', label: '51% black-owned suppliers', names: ['Spend on Empowering Suppliers ≥51% Black Owned'] },
  { row: 42, pillar: 'procurement', label: 'Designated-group suppliers (bonus)', names: ['Spend on Designated Group Suppliers ≥51% Black Owned'] },
  { row: 45, pillar: 'supplierDevelopment', label: 'Supplier development', names: ['Annual value of all Supplier Development contributions'] },
  { row: 48, pillar: 'enterpriseDevelopment', label: 'Enterprise development', names: ['Annual value of Enterprise Development contributions'] },
  { row: 49, pillar: 'enterpriseDevelopment', label: 'Graduation bonus', names: ['Graduation of ED beneficiaries to SD beneficiaries'] },
  { row: 50, pillar: 'enterpriseDevelopment', label: 'Jobs created bonus', names: ['Jobs created from ED & SD initiatives'] },
  { row: 53, pillar: 'socioEconomicDevelopment', label: 'Socio-economic development', names: ['Annual value of all SED contributions'] },
];

export const RCOGP_QSE_TOTAL_ROWS: Array<{ row: number; pillar: ParityPillarKey; label: string }> = [
  { row: 19, pillar: 'ownership', label: 'Ownership' },
  { row: 27, pillar: 'managementControl', label: 'Management control' },
  { row: 33, pillar: 'skillsDevelopment', label: 'Skills development' },
  { row: 39, pillar: 'procurement', label: 'Preferential procurement' },
  { row: 44, pillar: 'supplierDevelopment', label: 'Supplier development' },
  { row: 47, pillar: 'enterpriseDevelopment', label: 'Enterprise development' },
  { row: 52, pillar: 'socioEconomicDevelopment', label: 'Socio-economic development' },
  { row: 55, pillar: 'total', label: 'Grand total' },
];

/** Summary Scorecard rows holding the achieved and the discounted level (column F). */
export const RCOGP_QSE_LEVEL_ROWS = { achieved: 59, discounted: 61 } as const;

/** Cells the referee reads beyond the Summary Scorecard (export_rcogp_qse.py copies them). */
export const RCOGP_QSE_REFEREE_CELLS: Array<[string, string]> = [
  ['Ownership Scorecard', 'D1'],
  ...(['I7', 'I9', 'I10', 'J5', 'J6', 'J7', 'J8', 'J9', 'J10'].map((r) => ['Ownership Scorecard', r] as [string, string])),
  ['Ownership Data', 'W3'],
  ['Skills Toolkit', 'D8'],
  ['Skills Calcs', 'D28'], ['Skills Calcs', 'I28'], ['Skills Calcs', 'I30'],
  ['Procurement Scorecard', 'C3'], ['Procurement Scorecard', 'C4'], ['Procurement Scorecard', 'F16'],
  ['Procurement Scorecard', 'I9'], ['Procurement Scorecard', 'I10'], ['Procurement Scorecard', 'I12'],
  ['ESD Scorecard', 'D2'],
];

/** The tables the referee reworks rows from. */
export const RCOGP_QSE_REFEREE_TABLES = ['tblOwnershipData', 'tblPPData', 'tblESDData'] as const;

export function rcogpQseSummaryValue(sheets: ToolkitSheets, row: number): number | null {
  const v = sheets['Summary Scorecard']?.[`F${row}`]?.v;
  if (v === '' || v == null) return null;
  return typeof v === 'number' ? v : Number(v);
}

function tableRows(tables: ToolkitTables | undefined, name: string): Array<Record<string, unknown>> {
  const t = tables?.[name];
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [String(h), r[i]])));
}

const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
const isBlank = (x: unknown) => x === undefined || x === null || x === '';
const yesOf = (x: unknown) => String(x ?? '').trim() === 'Yes';
const fmt = (x: number) => x.toFixed(2);

/**
 * Black economic interest after acquisition debt, as the toolkit means it: the
 * stakes held without debt ('Ownership Data'!W3) plus each indebted black
 * shareholder's stake, credited in full once its net value reaches 40% of it
 * and pro rata below (the formula the toolkit's FIRST debt row uses), for the
 * black share of that stake only.
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

const PP_LINES = [
  { row: 40, manual: 'I9', target: 0.6, pts: 15, counts: (_r: Record<string, unknown>) => true },
  { row: 41, manual: 'I10', target: 0.15, pts: 5, counts: (r: Record<string, unknown>) => n(r['Black Ownership\n[Scenario].Calcs']) >= 0.51 },
  {
    row: 42, manual: 'I12', target: 0.01, pts: 1,
    counts: (r: Record<string, unknown>) => n(r['Black Ownership\n[Scenario].Calcs']) >= 0.51
      && n(r['Black Designated Group  ownership\n[Scenario].Calcs']) >= 0.51,
  },
];

/**
 * Procurement with the first-time-supplier route to the 1.2 factor read from
 * its own column. The toolkit's "[Scenario].Calcs" column for it falls back to
 * the 3-year-contract answer; every other part of the row is the toolkit's.
 */
function intendedProcurement(sheets: ToolkitSheets, tables: ToolkitTables): Map<number, number> | null {
  const rows = tableRows(tables, 'tblPPData');
  if (rows.length === 0) return null;
  const period = String(sheets['Procurement Scorecard']?.F16?.v ?? '').slice(0, 10);
  const denominator = Math.max(n(sheets['Procurement Scorecard']?.C3?.v), n(sheets['Procurement Scorecard']?.C4?.v));
  if (denominator <= 0) return null;
  const sums = new Map<number, number>(PP_LINES.map((l) => [l.row, 0]));
  let changed = false;
  for (const r of rows) {
    if (period && String(r['End of month'] ?? '').slice(0, 10) !== period) continue;
    const size = String(r['Company Size\n[Scenario].Calcs'] ?? '');
    const small = size === 'QSE' || size === 'EME';
    const bo = n(r['Black Ownership\n[Scenario].Calcs']);
    const scenarioFirst = r['First-time supplier? (Yes/No)\n[Scenario]'];
    const firstTime = isBlank(scenarioFirst) ? r['First-time supplier? (Yes/No)'] : scenarioFirst;
    const sdRoute = yesOf(r['Qualify for 1.2 Recognition factor?\n[SD beneficiariary]']);
    const contractRoute = yesOf(r['Qualify for 1.2 Recognition factor?\n[3-year Contract]']);
    const toolkitFactor = sdRoute || contractRoute || yesOf(r['Qualify for 1.2 Recognition factor?\n[First-Time Supplier]']);
    const factor = sdRoute || contractRoute || (small && bo >= 0.51 && yesOf(firstTime));
    if (factor !== toolkitFactor) changed = true;
    const recognised = n(r['All Spend\nadjusted']) * (factor ? 1.2 : 1);
    for (const l of PP_LINES) if (l.counts(r)) sums.set(l.row, (sums.get(l.row) ?? 0) + recognised);
  }
  if (!changed) return null;
  const out = new Map<number, number>();
  for (const l of PP_LINES) {
    if (!isBlank(sheets['Procurement Scorecard']?.[l.manual]?.v)) continue;
    out.set(l.row, Math.min(((sums.get(l.row) ?? 0) / denominator) / l.target * l.pts, l.pts));
  }
  return out;
}

/**
 * Supplier development as the toolkit means it: its benefit-factor lookup
 * meets a duplicated blank "Minority Investment" row and recognises such a
 * contribution at 0; the Enterprise Development copy of the row says 70%.
 * (This template recognises every contribution at amount × factor; it does
 * not test the beneficiary.)
 */
function intendedSupplierDevelopment(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  const rows = tableRows(tables, 'tblESDData').filter((r) => String(r['Pillar'] ?? '') === 'Supplier Development');
  if (!rows.some((r) => /^minority investment/i.test(String(r['Contribution Type'] ?? '')) && n(r['Recognised Amount']) === 0)) return null;
  const npat = n(sheets['ESD Scorecard']?.D2?.v);
  if (npat <= 0) return null;
  let recognised = 0;
  for (const r of rows) {
    const minority = /^minority investment/i.test(String(r['Contribution Type'] ?? ''));
    recognised += minority && n(r['Recognised Amount']) === 0 ? n(r['Amount']) * 0.7 : n(r['Recognised Amount']);
  }
  return Math.min(recognised / npat / 0.01 * 5, 5);
}

export function rcogpQseReferee(sheets: ToolkitSheets, tables?: ToolkitTables): RefereeResult {
  const v = (sheet: string, ref: string) => Number(sheets[sheet]?.[ref]?.v ?? 0) || 0;
  const F = (row: number) => v('Summary Scorecard', `F${row}`);
  const manual = (ref: string) => !isBlank(sheets['Ownership Scorecard']?.[ref]?.v);
  const lines = new Map<number, { value: number; note: string }>();
  const set = (row: number, value: number, note: string) => {
    if (Math.abs(value - F(row)) > 1e-9) lines.set(row, { value, note });
  };

  // Ownership: debt netting (rows 22, 25) and the LEFT() targets (rows 22, 24).
  const ei = tables ? intendedEconomicInterest(sheets, tables) : null;
  const eiMeasure = ei ?? v('Ownership Scorecard', 'I7');
  if (!manual('J7')) {
    const intended = Math.min(Math.max(eiMeasure, 0) / 0.25 * 5, 5);
    set(22, intended, `Toolkit formula fault: it scores economic interest against "0.2" (its 25% target cut by LEFT())` +
      `${ei !== null && Math.abs(ei - v('Ownership Scorecard', 'I7')) > 1e-9 ? ', and nets acquisition debt by a formula that depends on the shareholder\'s row and counts an indebted stake as wholly black' : ''}. ` +
      `${(eiMeasure * 100).toFixed(2)}% black economic interest against 25% gives ${fmt(intended)}; the toolkit shows ${fmt(F(22))}.`);
  }
  if (!manual('J9')) {
    const measure = v('Ownership Scorecard', 'I9');
    const intended = Math.min(Math.max(measure, 0) / 0.02 * 3, 3);
    set(24, intended, `Toolkit formula fault: its 2% target is cut to "0.0" by LEFT(), so the line can never score. ` +
      `Its own measure ${(measure * 100).toFixed(2)}% against 2% gives ${fmt(intended)}; the toolkit shows ${fmt(F(24))}.`);
  }
  if (!manual('J10') && ei !== null) {
    const intended = Math.min(Math.max(ei, 0) / 1 * 8, 8);
    set(25, intended, `Toolkit formula fault: it nets an indebted shareholder's stake by a formula that depends on the row the shareholder sits in, and counts the whole stake as black. ` +
      `Netted the one way, for the black share only: ${(ei * 100).toFixed(2)}% → ${fmt(intended)}; the toolkit shows ${fmt(F(25))}.`);
  }

  // Skills: the absorption bonus over the learners who could be absorbed.
  if (String(sheets['Skills Toolkit']?.D8?.v ?? '') === 'Current YTD') {
    const absorbed = v('Skills Calcs', 'I28');
    const completed = v('Skills Calcs', 'D28');
    const intended = completed > 0 ? Math.min(absorbed / completed * 5, 5) : 0;
    set(37, intended, `Toolkit formula fault: it divides the black learners absorbed (${absorbed}) by ALL learners absorbed (${v('Skills Calcs', 'I30')}) ` +
      `instead of by the learners who completed a learnership while unemployed (${completed}, its own headcount cell). ${absorbed} of ${completed} gives ${fmt(intended)}; the toolkit shows ${fmt(F(37))}.`);
  }

  // Procurement: the first-time-supplier route to the 1.2 factor.
  const pp = tables ? intendedProcurement(sheets, tables) : null;
  if (pp) {
    pp.forEach((value, row) => {
      set(row, value, `Toolkit formula fault: its first-time-supplier test reads the 3-year-contract answer, so a first-time ≥51% black-owned QSE/EME supplier never earns the 1.2 recognition factor. ` +
        `With the first-time answer read: ${fmt(value)}; the toolkit shows ${fmt(F(row))}.`);
    });
  }

  // Supplier development: the minority-investment benefit factor.
  const sd = tables ? intendedSupplierDevelopment(sheets, tables) : null;
  if (sd !== null) {
    set(45, sd, `Toolkit formula fault: its supplier-development benefit factor for a minority investment reads a duplicated blank row and recognises it at 0 (the enterprise-development row says 70%). At 70%: ${fmt(sd)}; the toolkit shows ${fmt(F(45))}.`);
  }

  // Element totals and the grand total carry the corrected lines.
  const delta = (rows: number[]) => rows.reduce((a, r) => a + (lines.has(r) ? lines.get(r)!.value - F(r) : 0), 0);
  const totals: Array<[number, number[]]> = [[19, [20, 21, 22, 23, 24, 25]], [33, [34, 35, 36, 37]], [39, [40, 41, 42]], [44, [45]]];
  let grand = 0;
  for (const [row, members] of totals) {
    const d = delta(members);
    if (Math.abs(d) > 1e-9) lines.set(row, { value: F(row) + d, note: 'Includes the corrected lines.' });
    grand += d;
  }
  const total = F(55) + grand;
  if (Math.abs(grand) > 1e-9) lines.set(55, { value: total, note: 'Includes the corrected lines above.' });

  // Levels: thresholds met at ≥, and the QSE priority-element rule on the
  // toolkit's own sub-minimum figures.
  const at = (row: number) => lines.get(row)?.value ?? F(row);
  const achieved = levelForPoints(total);
  const ownershipMet = at(25) >= 0.4 * 8;
  const skillsMet = at(34) + at(35) + at(36) >= 0.4 * 25;
  const esdMet = at(40) + at(41) >= 0.4 * 20 && at(45) >= 0.4 * 5 && at(48) >= 0.4 * 5;
  const discountedFlag = !(ownershipMet && (skillsMet || esdMet));
  const discounted = discountedFlag && achieved < 9 ? (achieved >= 8 ? 9 : achieved + 1) : achieved;
  const exAchieved = levelNumber(sheets['Summary Scorecard']?.F59?.v);
  const exDiscounted = levelNumber(sheets['Summary Scorecard']?.F61?.v);
  return {
    lines,
    achieved,
    discounted,
    achievedNote: achieved !== exAchieved
      ? `The toolkit shows ${exAchieved === 9 ? 'Non-compliant' : `Level ${exAchieved}`}; its level lookup drops a level exactly on a threshold, or it uses the uncorrected lines.`
      : undefined,
    discountedNote: discounted !== exDiscounted
      ? `The toolkit shows ${exDiscounted === 9 ? 'Non-compliant' : `Level ${exDiscounted}`}; it discounts a QSE on any priority element (its Skills and Procurement tests always pass), where a QSE needs Ownership plus Skills or Enterprise and Supplier Development, or it starts from the uncorrected level.`
      : undefined,
  };
}
