/**
 * Toolkit parity, AgriBEE Generic — the line map and the referee for the
 * Empower AgriBEE Generic toolkit (BBBEE Toolkit (Agri Generic) Master
 * v1.0.1), shared by the always-on gate and the live Excel harness.
 *
 * The referee is the toolkit recalculated by Excel. Where the toolkit's own
 * formula is evidently broken, the referee is what that formula evidently
 * means, worked from the toolkit's OWN figures (its cells and its table rows),
 * and every such line is labelled. The defects (docs/toolkits/parity/findings/agri_generic.md):
 *  - Ownership: acquisition debt is netted by a formula that depends on the
 *    row the shareholder lands in ('Oustanding Debts Calcs' H3 vs H4:H1000) and
 *    credits a stake whole, black or not; and the loan-term graduation table
 *    stops at year 9, so an older loan reads a factor of 0 and its holder's
 *    net value scores nothing.
 *  - Management control: the disabled-employees ratio counts a disabled black
 *    non-executive director in the numerator but not in the denominator.
 *  - Skills: the "unemployed black people in training" count filters on
 *    unemployment for African males only ('Skills Calcs'!F40); the other five
 *    groups count every learner.
 *  - Procurement: the first-time-supplier 1.2 test reads the 3-year-contract
 *    answer instead of the first-time answer.
 *  - Supplier development: its benefit-factor lookup meets a duplicated blank
 *    "Minority Investment" row and recognises such a contribution at 0.
 *  - Discounting: the ED sub-minimum is tested against 40% of 15
 *    ('Scorecard Calculations'!F8) on a 5-point line, so it always fails;
 *    and the level lookup uses a strict "<", dropping a total exactly on a
 *    threshold one level.
 */
import type { ParityLine, ParityPillarKey, RefereeResult, ToolkitSheets, ToolkitTables } from './toolkitParity';
import { levelForPoints, levelNumber } from './toolkitParity';

export { summaryValue, levelNumber, levelForPoints } from './toolkitParity';
export type { ParityLine, RefereeResult, ToolkitSheets, ToolkitTables } from './toolkitParity';

/** AgriBEE Generic Summary Scorecard rows → our breakdown lines. */
export const AGRI_GENERIC_LINES: ParityLine[] = [
  { row: 20, pillar: 'ownership', label: 'Voting rights: black', names: ['Exercisable voting rights of black individuals'] },
  { row: 21, pillar: 'ownership', label: 'Voting rights: black women', names: ['Exercisable voting rights of black females'] },
  { row: 22, pillar: 'ownership', label: 'Economic interest: black', names: ['Economic interest of black individuals'] },
  { row: 23, pillar: 'ownership', label: 'Economic interest: black women', names: ['Economic interest of black females'] },
  { row: 24, pillar: 'ownership', label: 'Economic interest: designated groups', names: ['Economic interest of black designated groups or participants in ownership schemes'] },
  { row: 25, pillar: 'ownership', label: 'Economic interest: new entrants', names: ['Economic interest of black new entrants'] },
  { row: 26, pillar: 'ownership', label: 'Net value', names: ['Net value'] },
  { row: 29, pillar: 'managementControl', label: 'Board: black members', names: ['Exercisable voting rights of black board members'] },
  { row: 30, pillar: 'managementControl', label: 'Board: black women members', names: ['Exercisable voting rights of black female board members'] },
  { row: 31, pillar: 'managementControl', label: 'Executive directors: black', names: ['Black executive directors'] },
  { row: 32, pillar: 'managementControl', label: 'Executive directors: black women', names: ['Black female executive directors'] },
  { row: 33, pillar: 'managementControl', label: 'Other executive: black', names: ['Black other executive management'] },
  { row: 34, pillar: 'managementControl', label: 'Other executive: black women', names: ['Black female other executive management'] },
  { row: 35, pillar: 'managementControl', label: 'Senior management: black', names: ['Black employees in senior management'] },
  { row: 36, pillar: 'managementControl', label: 'Senior management: black women', names: ['Black female employees in senior management'] },
  { row: 37, pillar: 'managementControl', label: 'Middle management: black', names: ['Black employees in middle management'] },
  { row: 38, pillar: 'managementControl', label: 'Middle management: black women', names: ['Black female employees in middle management'] },
  { row: 39, pillar: 'managementControl', label: 'Junior management: black', names: ['Black employees in junior management'] },
  { row: 40, pillar: 'managementControl', label: 'Junior management: black women', names: ['Black female employees in junior management'] },
  { row: 41, pillar: 'managementControl', label: 'Employees with disabilities', names: ['Black employees with disabilities'] },
  { row: 44, pillar: 'skillsDevelopment', label: 'Learning programmes', names: ['Expenditure on learning programmes for Black people'] },
  { row: 45, pillar: 'skillsDevelopment', label: 'Disabled learners', names: ['Expenditure on learning programmes for disabled black employees'] },
  { row: 46, pillar: 'skillsDevelopment', label: 'Learnerships / apprenticeships / internships', names: ['Number of ALL Black people participating in learnerships, apprenticeships or internships'] },
  { row: 47, pillar: 'skillsDevelopment', label: 'Unemployed learners in training', names: ['Number of unemployed Black people in training'] },
  { row: 48, pillar: 'skillsDevelopment', label: 'Absorption (bonus)', names: ['Absorption of black people after learnerships, apprenticeships or internships'] },
  { row: 51, pillar: 'procurement', label: 'Empowering suppliers', names: ['B-BBEE Procurement Spend from Empowering Suppliers'] },
  { row: 52, pillar: 'procurement', label: 'QSE empowering suppliers', names: ['Spend on QSE Empowering Suppliers'] },
  { row: 53, pillar: 'procurement', label: 'EME suppliers', names: ['Spend on EME Suppliers'] },
  { row: 54, pillar: 'procurement', label: '51% black-owned suppliers', names: ['Spend on Empowering Suppliers ≥51% Black Owned'] },
  { row: 55, pillar: 'procurement', label: '30% black-women-owned suppliers', names: ['Spend on Empowering Suppliers >30% Black Female Owned'] },
  { row: 56, pillar: 'procurement', label: 'Designated-group suppliers (bonus)', names: ['Spend on Designated Group Suppliers ≥51% Black Owned'] },
  { row: 59, pillar: 'supplierDevelopment', label: 'Supplier development', names: ['Annual value of all Supplier Development contributions'] },
  { row: 62, pillar: 'enterpriseDevelopment', label: 'Enterprise development', names: ['Annual value of Enterprise Development contributions'] },
  { row: 63, pillar: 'enterpriseDevelopment', label: 'Graduation bonus', names: ['Graduation of ED beneficiaries to SD beneficiaries'] },
  { row: 64, pillar: 'enterpriseDevelopment', label: 'Jobs created bonus', names: ['Jobs created from ED & SD initiatives'] },
  { row: 67, pillar: 'socioEconomicDevelopment', label: 'Socio-economic development (agricultural)', names: ['Annual value of all SED contributions'] },
];

export const AGRI_GENERIC_TOTAL_ROWS: Array<{ row: number; pillar: ParityPillarKey; label: string }> = [
  { row: 19, pillar: 'ownership', label: 'Ownership' },
  { row: 28, pillar: 'managementControl', label: 'Management control' },
  { row: 43, pillar: 'skillsDevelopment', label: 'Skills development' },
  { row: 50, pillar: 'procurement', label: 'Preferential procurement' },
  { row: 58, pillar: 'supplierDevelopment', label: 'Supplier development' },
  { row: 61, pillar: 'enterpriseDevelopment', label: 'Enterprise development' },
  { row: 66, pillar: 'socioEconomicDevelopment', label: 'Socio-economic development' },
  { row: 69, pillar: 'total', label: 'Grand total' },
];

/** Element total row → the Summary rows it sums. */
const ELEMENT_OF: Record<number, number> = {
  20: 19, 21: 19, 22: 19, 23: 19, 24: 19, 25: 19, 26: 19,
  29: 28, 30: 28, 31: 28, 32: 28, 33: 28, 34: 28, 35: 28, 36: 28, 37: 28, 38: 28, 39: 28, 40: 28, 41: 28,
  44: 43, 45: 43, 46: 43, 47: 43, 48: 43,
  51: 50, 52: 50, 53: 50, 54: 50, 55: 50, 56: 50,
  59: 58, 62: 61, 63: 61, 64: 61, 67: 66,
};

/** The cells the referee reads beyond the Summary Scorecard itself. */
export const AGRI_REFEREE_CELLS: Array<[string, string]> = [
  ['Ownership Scorecard', 'D1'], ['Ownership Scorecard', 'J7'], ['Ownership Scorecard', 'J16'],
  ['Ownership Data', 'W3'],
  ['MC Toolkit', 'C7'],
  ['Skills Toolkit', 'D11'],
  ...([40, 41, 42, 43, 44, 45] as const).flatMap((r) => [['Skills Calcs', `D${r}`], ['Skills Calcs', `E${r}`]] as Array<[string, string]>),
  ['Procurement Scorecard', 'C3'], ['Procurement Scorecard', 'C4'],
  ['ESD Scorecard', 'D2'],
];

/** The tables the referee reworks the toolkit's faulty formulas from. */
export const AGRI_REFEREE_TABLES = ['tblOwnershipData', 'tblMCData', 'tblSkillsData', 'tblPPData', 'tblESDData'] as const;

function tableRows(tables: ToolkitTables | undefined, name: string): Array<Record<string, unknown>> {
  const t = tables?.[name];
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [String(h), r[i]])));
}

const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
const isYes = (x: unknown) => String(x ?? '').trim().toLowerCase() === 'yes';
const blank = (x: unknown) => x === undefined || x === null || x === '';

/** 'Ownership Calcs Formula'!A3:B11, carried on to 100% from year 9 as it evidently means. */
function graduationFactor(year: number): number {
  const table: Record<number, number> = { 1: 0.1, 2: 0.2, 3: 0.4, 4: 0.5, 5: 0.6, 6: 0.7, 7: 0.8, 8: 0.9, 9: 1 };
  if (year >= 9) return 1;
  return table[year] ?? 0;
}

/**
 * Ownership as the toolkit means it. Each indebted black shareholder's stake
 * counts in full once its net value reaches 40% of it, pro rata below (the
 * toolkit's first debt row), for the black share only; net value is the
 * stakes held without debt against 25%, plus the lower of Formula A
 * (deemed value against 25% × the loan's graduation factor) and Formula B
 * (deemed value against 25%), at most 8.
 */
function intendedOwnership(sheets: ToolkitSheets, tables: ToolkitTables): { ei: number; netValue: number } | null {
  const holders = tableRows(tables, 'tblOwnershipData');
  if (holders.length === 0) return null;
  const value = n(sheets['Ownership Scorecard']?.D1?.v);
  const free = n(sheets['Ownership Data']?.W3?.v);
  let netIndebted = 0;
  let formulaA = 0;
  let formulaB = 0;
  for (const h of holders) {
    const share = n(h['Share %']);
    const bo = n(h['BO%']);
    const debt = n(h['Outstaning Debt']);
    if (share <= 0 || bo <= 0 || debt <= 0 || value <= 0) continue;
    const deemed = (value * share - debt) / value;
    const credited = share * Math.min(1, deemed / (0.4 * share)) * bo;
    netIndebted += credited;
    const term = blank(h['Loan Term']) ? 0 : n(h['Loan Term']);
    const g = graduationFactor(Math.ceil(term + 1 - 1e-12));
    formulaA += Math.max(Math.min((credited * 8) / (0.25 * g), 8), 0);
    formulaB += (credited / 0.25) * 8;
  }
  const netValue = Math.min(Math.min((free / 0.25) * 8, 8) + Math.min(formulaA, Math.min(formulaB, 8)), 8);
  return { ei: free + netIndebted, netValue };
}

/** Black employees with disabilities over employees (non-executive directors on neither side). */
function intendedDisabled(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  const rows = tableRows(tables, 'tblMCData');
  if (rows.length === 0) return null;
  const employees = n(sheets['MC Toolkit']?.C7?.v);
  if (employees <= 0) return 0;
  const count = rows.filter((r) => isYes(r['Employee?']) && isYes(r['Black?']) && isYes(r['Disabled *'])
    && ['Male', 'Female'].includes(String(r['Gender.calcs'] ?? ''))).length;
  return Math.min((count / employees / 0.02) * 2, 2);
}

/** Unemployed black learners in learnerships, per group, for all six groups. */
function intendedUnemployedLearners(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  if (!isYes(sheets['Skills Toolkit']?.D11?.v)) return null;
  const rows = tableRows(tables, 'tblSkillsData').filter((r) => isYes(r['Within FY?']) && isYes(r['Black'])
    && isYes(r['LAI']) && String(r['Employment?.calcs'] ?? '') === 'No');
  const groups: Array<[number, string, string]> = [
    [40, 'African', 'Male'], [41, 'Coloured', 'Male'], [42, 'Indian', 'Male'],
    [43, 'African', 'Female'], [44, 'Coloured', 'Female'], [45, 'Indian', 'Female'],
  ];
  let pts = 0;
  for (const [row, race, gender] of groups) {
    const target = n(sheets['Skills Calcs']?.[`D${row}`]?.v);
    const max = n(sheets['Skills Calcs']?.[`E${row}`]?.v);
    const count = rows.filter((r) => r['Race.calcs'] === race && r['Gender.calcs'] === gender).length;
    if (target > 0) pts += Math.min((count / target) * max, max);
  }
  return pts;
}

const PP_LINES: Array<{ row: number; weight: number; target: number; pick: (r: Record<string, unknown>) => boolean }> = [
  { row: 51, weight: 5, target: 0.8, pick: () => true },
  { row: 52, weight: 3, target: 0.15, pick: (r) => r['Current Company Size *'] === 'QSE' },
  { row: 53, weight: 4, target: 0.15, pick: (r) => r['Current Company Size *'] === 'EME' },
  { row: 54, weight: 9, target: 0.4, pick: (r) => n(r['Current Black ownership']) >= 0.51 },
  { row: 55, weight: 4, target: 0.12, pick: (r) => n(r['Current Black Female ownership']) >= 0.3 },
  { row: 56, weight: 2, target: 0.02, pick: (r) => n(r['Current Black ownership']) >= 0.51 && n(r['Black Designated Group  ownership']) >= 0.51 },
];

/** Procurement with the first-time-supplier 1.2 test reading the first-time answer. */
function intendedProcurement(sheets: ToolkitSheets, tables: ToolkitTables): Map<number, number> | null {
  const rows = tableRows(tables, 'tblPPData');
  if (rows.length === 0) return null;
  const affected = rows.some((r) => isYes(r['First-time supplier? (Yes/No)']) !== isYes(r['3 year contract in place? (Yes/No)3']));
  if (!affected) return null;
  const tmps = Math.max(n(sheets['Procurement Scorecard']?.C3?.v), n(sheets['Procurement Scorecard']?.C4?.v));
  const out = new Map<number, number>();
  for (const line of PP_LINES) {
    let spend = 0;
    for (const r of rows) {
      if (!line.pick(r)) continue;
      const adjusted = n(r['All Spend\nadjusted']);
      const small = r['Current Company Size *'] === 'QSE' || r['Current Company Size *'] === 'EME';
      const enhanced = small && n(r['Current Black ownership']) >= 0.51
        && (isYes(r['Supplier development recipient? (Yes/No)']) || isYes(r['3 year contract in place? (Yes/No)3'])
          || isYes(r['First-time supplier? (Yes/No)']));
      spend += enhanced ? adjusted * 1.2 : adjusted;
    }
    out.set(line.row, tmps > 0 ? Math.min((spend / tmps / line.target) * line.weight, line.weight) : 0);
  }
  return out;
}

/** Supplier development with a minority investment at the 70% the ED copy of the row states. */
function intendedSupplierDevelopment(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  const rows = tableRows(tables, 'tblESDData').filter((r) => String(r['Pillar'] ?? '') === 'Supplier Development');
  if (!rows.some((r) => /^minority investment/i.test(String(r['Contribution Type'] ?? '')))) return null;
  const npat = n(sheets['ESD Scorecard']?.D2?.v);
  if (npat <= 0) return null;
  let recognised = 0;
  for (const r of rows) {
    const minority = /^minority investment/i.test(String(r['Contribution Type'] ?? ''));
    recognised += minority && n(r['Recognised Amount']) === 0 ? n(r['Amount']) * 0.7 : n(r['Recognised Amount']);
  }
  return Math.min((Math.max(recognised / npat, 0) / 0.02) * 10, 10);
}

export function refereeAgriGeneric(sheets: ToolkitSheets, tables?: ToolkitTables): RefereeResult {
  const v = (sheet: string, ref: string) => Number(sheets[sheet]?.[ref]?.v ?? 0) || 0;
  const summary = (row: number) => v('Summary Scorecard', `F${row}`);
  const lines = new Map<number, { value: number; note: string }>();
  const set = (row: number, value: number, note: string) => {
    if (Math.abs(value - summary(row)) > 1e-9) lines.set(row, { value, note });
  };
  const manual = (ref: string) => !blank(sheets['Ownership Scorecard']?.[ref]?.v);

  if (tables) {
    const own = intendedOwnership(sheets, tables);
    if (own) {
      if (!manual('J7')) {
        const pts = Math.min((Math.max(own.ei, 0) / 0.25) * 4, 4);
        set(22, pts, `Toolkit formula fault: it nets an indebted shareholder's stake by a formula that depends on the row the shareholder sits in, and counts the whole stake as black. Its own figures, netted the first row's way and for the black share only, give ${(own.ei * 100).toFixed(2)}% black economic interest → ${pts.toFixed(2)}; the toolkit shows ${summary(22).toFixed(2)}.`);
      }
      if (!manual('J16')) {
        set(26, own.netValue, `Toolkit formula fault: the same row-dependent debt netting, and a loan-term table that stops at year 9 (an older loan reads a factor of 0, so its holder's net value scores nothing). Netted the first row's way, black share only, with year 9 and later at 100%: ${own.netValue.toFixed(2)}; the toolkit shows ${summary(26).toFixed(2)}.`);
      }
    }
    const dis = intendedDisabled(sheets, tables);
    if (dis !== null) {
      set(41, dis, `Toolkit formula fault: it counts a disabled black non-executive director among the disabled employees but not among the employees. Employees only: ${dis.toFixed(2)}; the toolkit shows ${summary(41).toFixed(2)}.`);
    }
    const unemployed = intendedUnemployedLearners(sheets, tables);
    if (unemployed !== null) {
      set(47, unemployed, `Toolkit formula fault: its count of unemployed learners filters on unemployment for African males only ('Skills Calcs'!F40); the other five groups count every learner. Unemployed learners in all six groups: ${unemployed.toFixed(2)}; the toolkit shows ${summary(47).toFixed(2)}.`);
    }
    const pp = intendedProcurement(sheets, tables);
    if (pp) {
      for (const [row, value] of pp) {
        set(row, value, `Toolkit formula fault: its first-time-supplier test for the 1.2 recognition factor reads the 3-year-contract answer. With the first-time answer: ${value.toFixed(2)}; the toolkit shows ${summary(row).toFixed(2)}.`);
      }
    }
    const sd = intendedSupplierDevelopment(sheets, tables);
    if (sd !== null) {
      set(59, sd, `Toolkit formula fault: its supplier-development benefit factor for a minority investment reads a duplicated blank row and recognises it at 0 (the enterprise-development copy says 70%). At 70%: ${sd.toFixed(2)}; the toolkit shows ${summary(59).toFixed(2)}.`);
    }
  }

  // Element totals and the grand total carry the corrected lines.
  const delta: Record<number, number> = {};
  for (const [row, fix] of lines) {
    const el = ELEMENT_OF[row];
    if (el) delta[el] = (delta[el] ?? 0) + fix.value - summary(row);
  }
  let totalDelta = 0;
  for (const [el, d] of Object.entries(delta)) {
    lines.set(Number(el), { value: summary(Number(el)) + d, note: 'Includes the corrected lines.' });
    totalDelta += d;
  }
  const total = summary(69) + totalDelta;
  if (totalDelta !== 0) lines.set(69, { value: total, note: 'Includes the corrected lines above.' });

  const val = (row: number) => lines.get(row)?.value ?? summary(row);
  const achieved = levelForPoints(total);
  // Priority elements, each at 40%: net value (of 8), the four Skills base
  // lines (of 20), the five Procurement base lines (of 25), SD (of 10) and the
  // ED base line (of 5 — the toolkit tests 40% of 15).
  const subMinFailed = val(26) < 3.2
    || val(44) + val(45) + val(46) + val(47) < 8
    || val(51) + val(52) + val(53) + val(54) + val(55) < 10
    || val(59) < 4
    || val(62) < 2;
  const discounted = subMinFailed ? (achieved >= 8 ? 9 : achieved + 1) : achieved;
  const exAchieved = levelNumber(sheets['Summary Scorecard']?.F73?.v);
  const exDiscounted = levelNumber(sheets['Summary Scorecard']?.F75?.v);
  return {
    lines,
    achieved,
    discounted,
    achievedNote: achieved !== exAchieved ? `The toolkit shows ${exAchieved === 9 ? 'Non-compliant' : `Level ${exAchieved}`}; its level lookup drops a level exactly on a threshold, or uses the uncorrected lines.` : undefined,
    discountedNote: discounted !== exDiscounted ? `The toolkit shows ${exDiscounted === 9 ? 'Non-compliant' : `Level ${exDiscounted}`}; its enterprise-development sub-minimum is tested against 40% of 15 points on a 5-point line, so it always fails.` : undefined,
  };
}
