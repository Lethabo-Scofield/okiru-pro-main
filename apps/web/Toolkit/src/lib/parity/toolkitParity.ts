/**
 * Toolkit parity — the line map and the referee shared by the parity harness
 * (calculators/__tests__/toolkitParity.harness.test.ts) and the Calculation
 * Review page. One definition, so the page shows exactly what the harness
 * proves.
 *
 * The referee is the Empower toolkit recalculated by Excel. Where the
 * toolkit's own formula is broken, the referee is what that formula evidently
 * means, computed from the toolkit's OWN measured values; every such line is
 * labelled:
 *  - ownership points use MIN(I / LEFT(E,3) × D, D); LEFT() truncates numeric
 *    targets — 3% and 2% become "0.0" (designated groups and new entrants
 *    always score 0) and 25% becomes "0.2" (economic interest against 20%);
 *  - 'Scorecard Calculations'!G5 sums empty cells, so the Skills sub-minimum
 *    always fails and every entity is discounted;
 *  - the level lookup uses a strict "<", so a total exactly on a threshold
 *    drops a level.
 */
import type { ScorecardResult } from '../types';

export type ParityPillarKey = keyof ScorecardResult;

export interface ParityLine {
  /** Summary Scorecard row (column F holds the toolkit's actual points). */
  row: number;
  pillar: ParityPillarKey;
  /** Plain label for the reviewer. */
  label: string;
  /** Our breakdown-line names that score this indicator (first match wins). */
  names: string[];
}

/** RCOGP Generic Summary Scorecard rows → our breakdown lines. */
export const RCOGP_GENERIC_LINES: ParityLine[] = [
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
  { row: 33, pillar: 'managementControl', label: 'Other executive (& senior): black', names: ['Black other executive management', 'Black other executive & senior management'] },
  { row: 34, pillar: 'managementControl', label: 'Other executive (& senior): black women', names: ['Black female other executive management', 'Black female other executive & senior management'] },
  { row: 35, pillar: 'managementControl', label: 'Senior management: black', names: ['Black employees in senior management'] },
  { row: 36, pillar: 'managementControl', label: 'Senior management: black women', names: ['Black female employees in senior management'] },
  { row: 37, pillar: 'managementControl', label: 'Middle management: black', names: ['Black employees in middle management'] },
  { row: 38, pillar: 'managementControl', label: 'Middle management: black women', names: ['Black female employees in middle management'] },
  { row: 39, pillar: 'managementControl', label: 'Junior management: black', names: ['Black employees in junior management', 'Black employees in junior management (incl. Semi-skilled & Unskilled)'] },
  { row: 40, pillar: 'managementControl', label: 'Junior management: black women', names: ['Black female employees in junior management', 'Black female employees in junior management (incl. Semi-skilled & Unskilled)'] },
  { row: 41, pillar: 'managementControl', label: 'Employees with disabilities', names: ['Black employees with disabilities'] },
  { row: 44, pillar: 'skillsDevelopment', label: 'Learning programmes', names: ['Expenditure on learning programmes for Black people'] },
  { row: 45, pillar: 'skillsDevelopment', label: 'Bursaries', names: ['Expenditure on bursaries for Black students'] },
  { row: 46, pillar: 'skillsDevelopment', label: 'Disabled learners', names: ['Expenditure on learning programmes for disabled black employees'] },
  { row: 47, pillar: 'skillsDevelopment', label: 'Learnerships / apprenticeships / internships', names: ['Number of ALL Black people participating in learnerships, apprenticeships or internships'] },
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
  { row: 67, pillar: 'socioEconomicDevelopment', label: 'Socio-economic development', names: ['Annual value of all SED contributions'] },
];

export const RCOGP_GENERIC_TOTAL_ROWS: Array<{ row: number; pillar: ParityPillarKey; label: string }> = [
  { row: 19, pillar: 'ownership', label: 'Ownership' },
  { row: 28, pillar: 'managementControl', label: 'Management control' },
  { row: 43, pillar: 'skillsDevelopment', label: 'Skills development' },
  { row: 50, pillar: 'procurement', label: 'Preferential procurement' },
  { row: 58, pillar: 'supplierDevelopment', label: 'Supplier development' },
  { row: 61, pillar: 'enterpriseDevelopment', label: 'Enterprise development' },
  { row: 66, pillar: 'socioEconomicDevelopment', label: 'Socio-economic development' },
  { row: 69, pillar: 'total', label: 'Grand total' },
];

/** Cell values as the Excel dump carries them: sheet → cell → { v }. */
export type ToolkitSheets = Record<string, Record<string, { v: unknown }>>;

/** The cells the referee reads beyond the Summary Scorecard itself. */
export const REFEREE_CELLS: Array<[string, string]> = [
  ['Ownership Scorecard', 'I7'], ['Ownership Scorecard', 'I10'], ['Ownership Scorecard', 'I12'],
  ['Ownership Scorecard', 'J7'], ['Ownership Scorecard', 'J10'], ['Ownership Scorecard', 'J12'],
  ['Scorecard Calculations', 'F6'], ['Scorecard Calculations', 'G6'],
  ['Scorecard Calculations', 'F7'], ['Scorecard Calculations', 'G7'],
  ['Scorecard Calculations', 'F8'], ['Scorecard Calculations', 'G8'],
];

const OWNERSHIP_LEFT_DEFECT: Array<{ row: number; measure: string; manual: string; target: number; pts: number }> = [
  { row: 22, measure: 'I7', manual: 'J7', target: 0.25, pts: 4 },
  { row: 24, measure: 'I10', manual: 'J10', target: 0.03, pts: 3 },
  { row: 25, measure: 'I12', manual: 'J12', target: 0.02, pts: 2 },
];

const LEVEL_THRESHOLDS: Array<[number, number]> = [[100, 1], [95, 2], [90, 3], [80, 4], [75, 5], [70, 6], [55, 7], [40, 8]];
export const levelForPoints = (points: number) => LEVEL_THRESHOLDS.find(([min]) => points >= min)?.[1] ?? 9;

export interface RefereeResult {
  /** Summary rows whose referee value replaces the toolkit's, with why. */
  lines: Map<number, { value: number; note: string }>;
  achieved: number;
  discounted: number;
  achievedNote?: string;
  discountedNote?: string;
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

/** Excel table dumps: name → { headers, rows }. */
export type ToolkitTables = Record<string, { headers: unknown[]; rows: unknown[][] }>;

function tableRows(tables: ToolkitTables | undefined, name: string): Array<Record<string, unknown>> {
  const t = tables?.[name];
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [String(h), r[i]])));
}

const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);

/**
 * Black economic interest after acquisition debt, as the toolkit means it:
 * the stakes held without debt ('Ownership Data'!W3) plus each indebted black
 * shareholder's stake, credited in full once its net value reaches 40% of it
 * and pro rata below — the formula the toolkit's FIRST debt row uses — and
 * only for the black share of that stake. The toolkit itself switches to a
 * different formula from its second debt row on, and credits an indebted
 * holder's whole stake as black.
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

/**
 * Supplier development as the toolkit means it: its SD benefit-factor lookup
 * meets a duplicated blank "Minority Investment" row and recognises such a
 * contribution at 0; the ED copy of the same row says 70%.
 */
function intendedSupplierDevelopment(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  const rows = tableRows(tables, 'tblESDData').filter((r) => String(r['Pillar'] ?? '') === 'Supplier Development');
  if (rows.length === 0) return null;
  const npat = n(sheets['ESD Scorecard']?.D2?.v);
  if (npat <= 0) return null;
  let recognised = 0;
  for (const r of rows) {
    const minority = /^minority investment/i.test(String(r['Contribution Type'] ?? ''));
    const qualifies = String(r['Qualify?'] ?? '').toLowerCase() === 'yes';
    recognised += minority && n(r['Recognised Amount']) === 0 && qualifies ? n(r['Amount']) * 0.7 : n(r['Recognised Amount']);
  }
  return Math.min(Math.max(recognised / npat, 0) / 0.02 * 10, 10);
}

export function referee(sheets: ToolkitSheets, tables?: ToolkitTables): RefereeResult {
  const v = (sheet: string, ref: string) => Number(sheets[sheet]?.[ref]?.v ?? 0) || 0;
  const lines = new Map<number, { value: number; note: string }>();
  let ownershipDelta = 0;
  const ei = tables ? intendedEconomicInterest(sheets, tables) : null;
  if (ei !== null) {
    for (const d of [{ row: 22, target: 0.25, pts: 4, manual: 'J7' }, { row: 26, target: 1, pts: 8, manual: 'J13' }]) {
      const manual = sheets['Ownership Scorecard']?.[d.manual]?.v;
      if (manual !== undefined && manual !== null && manual !== '') continue;
      const intended = Math.min(Math.max(ei, 0) / d.target * d.pts, d.pts);
      const excel = v('Summary Scorecard', `F${d.row}`);
      if (Math.abs(intended - excel) > 1e-9) {
        lines.set(d.row, {
          value: intended,
          note: `Toolkit formula fault: it nets an indebted shareholder's stake by a formula that depends on the row the shareholder sits in, and counts the whole stake as black. Its own figures, netted the one way and for the black share only, give ${(ei * 100).toFixed(2)}% black economic interest → ${intended.toFixed(2)}; the toolkit shows ${excel.toFixed(2)}.`,
        });
        ownershipDelta += intended - excel;
      }
    }
  }
  for (const d of OWNERSHIP_LEFT_DEFECT) {
    if (lines.has(d.row)) continue;
    const manual = sheets['Ownership Scorecard']?.[d.manual]?.v;
    if (manual !== undefined && manual !== null && manual !== '') continue;
    const measure = v('Ownership Scorecard', d.measure);
    const intended = Math.min(Math.max(measure, 0) / d.target * d.pts, d.pts);
    const excel = v('Summary Scorecard', `F${d.row}`);
    if (Math.abs(intended - excel) > 1e-9) {
      lines.set(d.row, {
        value: intended,
        note: `Toolkit formula fault (its target is cut to "${String(d.target).slice(0, 3)}"): its own measure ${(measure * 100).toFixed(2)}% against the real ${d.target * 100}% target gives ${intended.toFixed(2)}; the toolkit shows ${excel.toFixed(2)}.`,
      });
      ownershipDelta += intended - excel;
    }
  }
  if (ownershipDelta !== 0) {
    lines.set(19, { value: v('Summary Scorecard', 'F19') + ownershipDelta, note: 'Includes the corrected ownership lines.' });
  }
  let sdDelta = 0;
  const sd = tables ? intendedSupplierDevelopment(sheets, tables) : null;
  if (sd !== null && Math.abs(sd - v('Summary Scorecard', 'F59')) > 1e-9) {
    const note = `Toolkit formula fault: its supplier-development benefit factor for a minority investment reads a duplicated blank row and recognises it at 0 (the enterprise-development copy says 70%). At 70%: ${sd.toFixed(2)}; the toolkit shows ${v('Summary Scorecard', 'F59').toFixed(2)}.`;
    sdDelta = sd - v('Summary Scorecard', 'F59');
    lines.set(59, { value: sd, note });
    lines.set(58, { value: v('Summary Scorecard', 'F58') + sdDelta, note });
  }
  const total = v('Summary Scorecard', 'F69') + ownershipDelta + sdDelta;
  if (ownershipDelta !== 0 || sdDelta !== 0) {
    lines.set(69, { value: total, note: 'Includes the corrected lines above.' });
  }
  const achieved = levelForPoints(total);
  const skillsBase = v('Summary Scorecard', 'F44') + v('Summary Scorecard', 'F45') + v('Summary Scorecard', 'F46') + v('Summary Scorecard', 'F47');
  const netValuePts = lines.get(26)?.value ?? v('Summary Scorecard', 'F26');
  const sdPts = lines.get(59)?.value ?? v('Scorecard Calculations', 'G7');
  const subMinFailed = netValuePts < 3.2
    || skillsBase < 8
    || v('Scorecard Calculations', 'G6') < v('Scorecard Calculations', 'F6')
    || sdPts < v('Scorecard Calculations', 'F7')
    || v('Scorecard Calculations', 'G8') < v('Scorecard Calculations', 'F8');
  const discounted = subMinFailed ? (achieved >= 8 ? 9 : achieved + 1) : achieved;
  const exAchieved = levelNumber(sheets['Summary Scorecard']?.F73?.v);
  const exDiscounted = levelNumber(sheets['Summary Scorecard']?.F75?.v);
  return {
    lines,
    achieved,
    discounted,
    achievedNote: achieved !== exAchieved ? `The toolkit shows Level ${exAchieved}; its level lookup drops a level exactly on a threshold, or uses the uncorrected ownership lines.` : undefined,
    discountedNote: discounted !== exDiscounted ? `The toolkit shows ${exDiscounted === 9 ? 'Non-compliant' : `Level ${exDiscounted}`}; its Skills sub-minimum test reads empty cells and always fails.` : undefined,
  };
}
