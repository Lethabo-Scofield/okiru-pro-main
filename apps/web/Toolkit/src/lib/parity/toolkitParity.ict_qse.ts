/**
 * Toolkit parity, ICT QSE — the line map and the referee for the Empower
 * "BBBEE Toolkit (ICT QSE)" template v1.1, shared by the parity harness
 * (test/parity/toolkitParity.ict_qse.harness.test.ts) and the always-on gate
 * (calculators/__tests__/toolkitParity.ict_qse.expected.test.ts).
 *
 * The referee is the toolkit recalculated by Excel. Where the toolkit's own
 * formula is evidently broken, the referee is what that formula evidently
 * means, computed from the toolkit's OWN measured values; every such line is
 * labelled with why:
 *  - ownership points use MIN(I / LEFT(E,3) × D, D); LEFT() reads the 2%
 *    target of the combined "new entrants or designated groups" line as "0.0",
 *    so that line always scores 0;
 *  - acquisition debt is netted by a formula that depends on the row the
 *    shareholder sits in, and counts an indebted holder's whole stake as black
 *    (the RCOGP Generic template's fault, repeated); its debt column also
 *    ignores the "Debt?" flag, so a non-black holder's debt is subtracted
 *    from the black economic interest;
 *  - the ownership points formula has no floor at 0, so acquisition debt
 *    larger than the stake shows negative points;
 *  - with executive and senior management combined, the "black employees in
 *    middle and junior management" line has no formula ('MC Scorecard (Exco +
 *    Senior)'!K28 is empty), so it always scores 0;
 *  - the "First-time supplier?" answer is never read: its scenario column
 *    falls back to the 3-year-contract answer instead;
 *  - a supplier-development minority investment meets a duplicated blank row
 *    in the benefit-factor table and is recognised at 0 (the ED copy says 70%);
 *  - the ED total adds both jobs-created tiers where the two are alternatives
 *    (its own target, gap and projected cells take the larger);
 *  - the Skills and PP sub-minimum tests sum F:J (actual, gap, flags, scenario
 *    and projected) instead of the actual column, so both always pass;
 *  - the level lookup uses a strict "<", so a total exactly on a threshold
 *    drops a level.
 */
import type { ParityPillarKey, ToolkitSheets, ToolkitTables, RefereeResult } from './toolkitParity';
import { levelForPoints, levelNumber, summaryValue } from './toolkitParity';
import type { BreakdownLine, ScorecardResult } from '../types';

export interface IctQseParityLine {
  /** Summary Scorecard rows (column F holds the toolkit's points); several rows are added. */
  rows: number[];
  pillar: ParityPillarKey;
  label: string;
  /** Our breakdown-line names that score this indicator (first match wins). */
  names: string[];
}

/** ICT QSE Summary Scorecard rows → our breakdown lines. */
export const ICT_QSE_LINES: IctQseParityLine[] = [
  { rows: [20], pillar: 'ownership', label: 'Voting rights: black', names: ['Exercisable voting rights of black individuals'] },
  { rows: [21], pillar: 'ownership', label: 'Voting rights: black women', names: ['Exercisable voting rights of black females'] },
  { rows: [22], pillar: 'ownership', label: 'Economic interest: black', names: ['Economic interest of black individuals'] },
  { rows: [23], pillar: 'ownership', label: 'Economic interest: black women', names: ['Economic interest of black females'] },
  { rows: [24], pillar: 'ownership', label: 'Economic interest: new entrants or designated groups', names: ['Economic interest of black designated groups or participants in ownership schemes'] },
  { rows: [25], pillar: 'ownership', label: 'Net value', names: ['Net value'] },
  { rows: [28], pillar: 'managementControl', label: 'Executive management: black', names: ['Black executive directors'] },
  { rows: [29], pillar: 'managementControl', label: 'Executive management: black women', names: ['Black female executive directors'] },
  { rows: [30], pillar: 'managementControl', label: 'Senior, middle & junior management: black', names: ['Black employees in senior management'] },
  { rows: [31], pillar: 'managementControl', label: 'Senior, middle & junior management: black women', names: ['Black female employees in senior management'] },
  { rows: [34], pillar: 'skillsDevelopment', label: 'Learning programmes: black people', names: ['Expenditure on learning programmes for Black people'] },
  { rows: [35], pillar: 'skillsDevelopment', label: 'Learning programmes: black women', names: ['Expenditure on learning programmes for Black women'] },
  { rows: [36], pillar: 'skillsDevelopment', label: 'Learning programmes: black people with disabilities', names: ['Expenditure on learning programmes for disabled black employees'] },
  { rows: [37], pillar: 'skillsDevelopment', label: 'Absorption (bonus)', names: ['Absorption of black people after learnerships, apprenticeships or internships'] },
  { rows: [40], pillar: 'procurement', label: 'All suppliers', names: ['B-BBEE Procurement Spend from Empowering Suppliers'] },
  { rows: [41], pillar: 'procurement', label: '51% black-owned suppliers', names: ['Spend on Empowering Suppliers ≥51% Black Owned'] },
  { rows: [42], pillar: 'procurement', label: 'Designated-group suppliers (bonus)', names: ['Spend on Designated Group Suppliers ≥51% Black Owned'] },
  { rows: [45], pillar: 'supplierDevelopment', label: 'Supplier development', names: ['Annual value of all Supplier Development contributions'] },
  { rows: [48], pillar: 'enterpriseDevelopment', label: 'Enterprise development', names: ['Annual value of Enterprise Development contributions'] },
  { rows: [49], pillar: 'enterpriseDevelopment', label: 'Graduation bonus', names: ['Graduation of ED beneficiaries to SD beneficiaries'] },
  // The toolkit shows the two jobs tiers on two rows; ours is one line worth 1 or 2.
  { rows: [50, 51], pillar: 'enterpriseDevelopment', label: 'Jobs created bonus (up to 10% / 11% or more)', names: ['Jobs created from ED & SD initiatives'] },
  { rows: [54], pillar: 'socioEconomicDevelopment', label: 'Socio-economic development (ICT-specific)', names: ['Annual value of all SED contributions'] },
];

export const ICT_QSE_TOTAL_ROWS: Array<{ row: number; pillar: ParityPillarKey; label: string }> = [
  { row: 19, pillar: 'ownership', label: 'Ownership' },
  { row: 27, pillar: 'managementControl', label: 'Management control' },
  { row: 33, pillar: 'skillsDevelopment', label: 'Skills development' },
  { row: 39, pillar: 'procurement', label: 'Preferential procurement' },
  { row: 44, pillar: 'supplierDevelopment', label: 'Supplier development' },
  { row: 47, pillar: 'enterpriseDevelopment', label: 'Enterprise development' },
  { row: 53, pillar: 'socioEconomicDevelopment', label: 'Socio-economic development' },
  { row: 56, pillar: 'total', label: 'Grand total' },
];

/** Summary Scorecard rows the bundles keep (labels, weightings, toolkit points). */
export const ICT_QSE_SUMMARY_ROWS = { from: 18, to: 64 };
/** Achieved and discounted level cells (Summary Scorecard column F). */
export const ICT_QSE_LEVEL_ROWS = { achieved: 60, discounted: 62 };

/**
 * The cells the referee reads beyond the Summary Scorecard itself.
 * docs/toolkits/parity/export_ict_qse.py writes exactly these into every
 * expected bundle; keep the two lists the same.
 */
export const ICT_QSE_REFEREE_CELLS: Array<[string, string]> = [
  ['Client Information', 'C23'],
  ['Ownership Scorecard', 'D1'], ['Ownership Scorecard', 'I9'],
  ['Ownership Scorecard', 'J7'], ['Ownership Scorecard', 'J9'], ['Ownership Scorecard', 'J10'],
  ['Ownership Data', 'W3'],
  ['MC Scorecard (Exco + Senior)', 'D28'], ['MC Scorecard (Exco + Senior)', 'E28'], ['MC Scorecard (Exco + Senior)', 'J28'],
  ['Procurement Scorecard', 'C3'], ['Procurement Scorecard', 'C4'],
  ['Procurement Scorecard', 'C9'], ['Procurement Scorecard', 'D9'], ['Procurement Scorecard', 'I9'],
  ['Procurement Scorecard', 'C10'], ['Procurement Scorecard', 'D10'], ['Procurement Scorecard', 'I10'],
  ['Procurement Scorecard', 'C12'], ['Procurement Scorecard', 'D12'], ['Procurement Scorecard', 'I12'],
  ['ESD Scorecard', 'D2'], ['ESD Scorecard', 'E12'], ['ESD Scorecard', 'F12'],
];

/** The tables the referee reworks faulty formulas from. */
export const ICT_QSE_REFEREE_TABLES = ['tblOwnershipData', 'tblPPData', 'tblESDData'] as const;

function tableRows(tables: ToolkitTables | undefined, name: string): Array<Record<string, unknown>> {
  const t = tables?.[name];
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [String(h), r[i]])));
}

const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
const isYes = (x: unknown) => String(x ?? '').trim().toLowerCase() === 'yes';
const blank = (x: unknown) => x === undefined || x === null || x === '';
const capped = (measure: number, target: number, pts: number) =>
  (target > 0 ? Math.min(Math.max(measure, 0) / target * pts, pts) : 0);

/**
 * Black economic interest after acquisition debt, as the toolkit means it:
 * the stakes held without debt ('Ownership Data'!W3) plus each indebted black
 * shareholder's stake, credited in full once its net value reaches 40% of it
 * and pro rata below — the formula the toolkit's FIRST debt row uses — and
 * only for the black share of that stake.
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
 * Procurement as the toolkit means it: a first-time supplier (a QSE/EME ≥51%
 * black owned) earns the 1.2 factor like an SD beneficiary or a 3-year
 * contract. Rebuilt from the toolkit's own level-adjusted spend per row.
 */
function intendedProcurement(sheets: ToolkitSheets, tables: ToolkitTables) {
  const ps = sheets['Procurement Scorecard'] ?? {};
  const den = Math.max(n(ps.C3?.v), n(ps.C4?.v));
  let all = 0;
  let bo51 = 0;
  let dg = 0;
  let firstTimeOnly = 0;
  for (const r of tableRows(tables, 'tblPPData')) {
    const adjusted = n(r['All Spend\nadjusted']);
    const size = String(r['Company Size\n[Scenario].Calcs'] ?? r['Current Company Size *'] ?? '');
    const bo = n(r['Black Ownership\n[Scenario].Calcs'] ?? r['Current Black ownership']);
    const bdg = n(r['Black Designated Group  ownership\n[Scenario].Calcs'] ?? r['Black Designated Group  ownership']);
    const small = size === 'QSE' || size === 'EME';
    const sd = isYes(r['Supplier development recipient? (Yes/No)']);
    const three = isYes(r['3 year contract in place? (Yes/No)3']);
    const first = isYes(r['First-time supplier? (Yes/No)']);
    const qualifies = small && bo >= 0.51 && (sd || three || first);
    if (qualifies && !sd && !three) firstTimeOnly += 1;
    const spend = qualifies ? adjusted * 1.2 : adjusted;
    all += spend;
    if (bo >= 0.51) bo51 += spend;
    if (bo >= 0.51 && bdg >= 0.51) dg += spend;
  }
  if (den <= 0) return null;
  const line = (spend: number, row: number) => capped(spend / den, n(ps[`D${row}`]?.v), n(ps[`C${row}`]?.v));
  return { 40: line(all, 9), 41: line(bo51, 10), 42: line(dg, 12), firstTimeOnly } as Record<number, number> & { firstTimeOnly: number };
}

/**
 * Supplier development as the toolkit means it: its benefit-factor lookup
 * meets a duplicated blank "Minority Investment" row and recognises an SD
 * minority investment at 0; the ED copy of the same row says 70%.
 */
function intendedSupplierDevelopment(sheets: ToolkitSheets, tables: ToolkitTables): number | null {
  const rows = tableRows(tables, 'tblESDData').filter((r) => String(r['Pillar'] ?? '') === 'Supplier Development');
  if (rows.length === 0) return null;
  const esd = sheets['ESD Scorecard'] ?? {};
  const npat = n(esd.D2?.v);
  if (npat <= 0) return null;
  let recognised = 0;
  for (const r of rows) {
    const minority = /^minority investment/i.test(String(r['Contribution Type'] ?? ''));
    recognised += minority && n(r['Recognised Amount']) === 0 ? n(r['Amount']) * 0.7 : n(r['Recognised Amount']);
  }
  return capped(recognised / npat, n(esd.F12?.v), n(esd.E12?.v));
}

const fmt = (x: number) => x.toFixed(2);

export function refereeIctQse(sheets: ToolkitSheets, tables?: ToolkitTables): RefereeResult {
  const F = (row: number) => n(sheets['Summary Scorecard']?.[`F${row}`]?.v);
  const lines = new Map<number, { value: number; note: string }>();
  const set = (row: number, value: number, note: string) => {
    if (Math.abs(value - F(row)) > 1e-9) lines.set(row, { value, note });
  };
  const value = (row: number) => lines.get(row)?.value ?? F(row);
  const delta = (rows: number[]) => rows.reduce((a, r) => a + (value(r) - F(r)), 0);
  const own = sheets['Ownership Scorecard'] ?? {};

  // Ownership: debt netting (economic interest, net value) and the LEFT() target cut.
  const ei = tables ? intendedEconomicInterest(sheets, tables) : null;
  if (ei !== null) {
    for (const d of [{ row: 22, target: 0.3, pts: 5, manual: 'J7' }, { row: 25, target: 1, pts: 8, manual: 'J10' }]) {
      if (!blank(own[d.manual]?.v)) continue;
      set(d.row, capped(ei, d.target, d.pts),
        `Toolkit formula fault: it nets an indebted shareholder's stake by a formula that depends on the row the shareholder sits in, counts the whole stake as black, and also subtracts a non-black shareholder's debt. Its own figures, netted the one way, for the black share only and for black shareholders only, give ${(ei * 100).toFixed(2)}% black economic interest → ${fmt(capped(ei, d.target, d.pts))}; the toolkit shows ${fmt(F(d.row))}.`);
    }
  }
  if (blank(own.J9?.v)) {
    const measure = n(own.I9?.v);
    set(24, capped(measure, 0.02, 3),
      `Toolkit formula fault (its 2% target is cut to "0.0"): its own measure ${(measure * 100).toFixed(2)}% against the real 2% target gives ${fmt(capped(measure, 0.02, 3))}; the toolkit shows ${fmt(F(24))}.`);
  }
  // A shareholder deep in acquisition debt drives the black-women economic
  // interest below zero, and the toolkit's MIN(...) has no floor at 0.
  for (const row of [20, 21, 23]) {
    if (F(row) < 0) {
      set(row, 0, `Toolkit formula fault: its points formula has no floor, so acquisition debt larger than the stake shows ${fmt(F(row))} points; a line cannot score below 0.`);
    }
  }
  const ownDelta = delta([20, 21, 22, 23, 24, 25]);
  if (ownDelta !== 0) lines.set(19, { value: F(19) + ownDelta, note: 'Includes the corrected ownership lines.' });

  // Management control: the combined layout's middle-and-junior line has no formula.
  if (isYes(sheets['Client Information']?.C23?.v)) {
    const mc = sheets['MC Scorecard (Exco + Senior)'] ?? {};
    const pct = n(mc.J28?.v);
    const intended = capped(pct, n(mc.D28?.v), n(mc.E28?.v));
    set(30, intended,
      `Toolkit formula fault: with executive and senior management combined, the middle-and-junior black line has no formula ('MC Scorecard (Exco + Senior)'!K28 is empty). Its own measure ${(pct * 100).toFixed(2)}% against ${(n(mc.D28?.v) * 100).toFixed(0)}% gives ${fmt(intended)}; the toolkit shows ${fmt(F(30))}.`);
  }
  const mcDelta = delta([30]);
  if (mcDelta !== 0) lines.set(27, { value: F(27) + mcDelta, note: 'Includes the corrected management line.' });

  // Procurement: the first-time-supplier answer the toolkit never reads.
  const ps = sheets['Procurement Scorecard'] ?? {};
  const pp = tables ? intendedProcurement(sheets, tables) : null;
  if (pp && pp.firstTimeOnly > 0) {
    for (const [row, src] of [[40, 'I9'], [41, 'I10'], [42, 'I12']] as const) {
      if (!blank(ps[src]?.v)) continue;
      set(row, pp[row],
        `Toolkit formula fault: its "First-time supplier?" check reads the 3-year-contract answer instead, so ${pp.firstTimeOnly} first-time supplier(s) lose the 1.2 recognition factor. With it: ${fmt(pp[row])}; the toolkit shows ${fmt(F(row))}.`);
    }
  }
  const ppDelta = delta([40, 41, 42]);
  if (ppDelta !== 0) lines.set(39, { value: F(39) + ppDelta, note: 'Includes the corrected procurement lines.' });

  // Supplier development: the duplicated blank minority-investment row.
  const sd = tables ? intendedSupplierDevelopment(sheets, tables) : null;
  if (sd !== null) {
    set(45, sd,
      `Toolkit formula fault: its supplier-development benefit factor for a minority investment reads a duplicated blank row and recognises it at 0 (the enterprise-development copy says 70%). At 70%: ${fmt(sd)}; the toolkit shows ${fmt(F(45))}.`);
  }
  const sdDelta = delta([45]);
  if (sdDelta !== 0) lines.set(44, { value: F(44) + sdDelta, note: 'Includes the corrected supplier-development line.' });

  // Enterprise development: the two jobs tiers are alternatives.
  if (F(50) > 0 && F(51) > 0) {
    lines.set(50, {
      value: 0,
      note: `Toolkit formula fault: the ED total adds both jobs-created tiers (${fmt(F(50))} + ${fmt(F(51))}); they are alternatives — its own target, gap and projected cells take the larger — so the up-to-10% tier gives way to the 11%-or-more tier.`,
    });
  }
  const edDelta = delta([50]);
  if (edDelta !== 0) lines.set(47, { value: F(47) + edDelta, note: 'Includes the corrected jobs bonus.' });

  const totalDelta = ownDelta + mcDelta + ppDelta + sdDelta + edDelta;
  const total = F(56) + totalDelta;
  if (totalDelta !== 0) lines.set(56, { value: total, note: 'Includes the corrected lines above.' });

  const achieved = levelForPoints(total);
  // Sub-minimums as 'Scorecard Calculations'!C13 means them: net value 40% of 8,
  // Skills base 40% of 25, PP base 40% of 20, SD 40% of 5, ED base 40% of 5.
  const skillsBase = value(34) + value(35) + value(36);
  const ppBase = value(40) + value(41);
  const subMinFailed = value(25) < 3.2 || skillsBase < 10 || ppBase < 8 || value(45) < 2 || value(48) < 2;
  const discounted = subMinFailed ? (achieved >= 8 ? 9 : achieved + 1) : achieved;
  const exAchieved = levelNumber(sheets['Summary Scorecard']?.[`F${ICT_QSE_LEVEL_ROWS.achieved}`]?.v);
  const exDiscounted = levelNumber(sheets['Summary Scorecard']?.[`F${ICT_QSE_LEVEL_ROWS.discounted}`]?.v);
  const lvl = (l: number) => (l === 9 ? 'Non-compliant' : `Level ${l}`);

  // Why a level differs from the toolkit's, said specifically. The toolkit's
  // own test ('Scorecard Calculations'!C13) is, in effect, net value, SD and
  // ED only, on its uncorrected lines: its Skills and PP tests always pass.
  const rawTotal = F(56);
  const rawLevel = levelForPoints(rawTotal);
  const achievedWhy: string[] = [];
  if (totalDelta !== 0 && achieved !== rawLevel) {
    achievedWhy.push(`the corrected lines move the total from ${fmt(rawTotal)} to ${fmt(total)}`);
  }
  if (rawLevel !== exAchieved) {
    achievedWhy.push(`its level lookup uses a strict "<" ('Scorecard Calculations'!C12), so its total of ${fmt(rawTotal)}, exactly on a threshold, drops a level`);
  }
  const toolkitTestFailed = F(25) < 3.2 || F(45) < 2 || F(48) < 2;
  const discountedWhy: string[] = [];
  if (achieved !== exAchieved) discountedWhy.push('it starts from a different achieved level (above)');
  if (subMinFailed !== toolkitTestFailed) {
    const skillsPpFailed = skillsBase < 10 || ppBase < 8;
    const toolkitLinesFailNow = value(25) < 3.2 || value(45) < 2 || value(48) < 2;
    if (skillsPpFailed && !toolkitTestFailed) {
      discountedWhy.push(`its Skills and PP sub-minimum tests ('Scorecard Calculations'!G5, G6) add the gap and other columns to the points and always pass; here Skills scores ${fmt(skillsBase)} of the 10 needed and PP ${fmt(ppBase)} of the 8 needed`);
    }
    if (toolkitLinesFailNow !== toolkitTestFailed) {
      discountedWhy.push(`the corrected net value or supplier-development line changes whether its sub-minimum is met`);
    }
  }
  return {
    lines,
    achieved,
    discounted,
    achievedNote: achieved !== exAchieved
      ? `The toolkit shows ${lvl(exAchieved)}: ${achievedWhy.join('; and ') || 'the referee cannot say why'}.`
      : undefined,
    discountedNote: discounted !== exDiscounted
      ? `The toolkit shows ${lvl(exDiscounted)}: ${discountedWhy.join('; and ') || 'the referee cannot say why'}.`
      : undefined,
  };
}

export interface IctQseLineResult {
  row: string;
  label: string;
  toolkit: number | null;
  ours: number | null;
  diff: number | null;
  ok: boolean;
  note?: string;
}

/**
 * Every line, element total, the grand total and both levels: our scorecard
 * against the toolkit (as the referee reads it), to the cent of a point.
 */
export function compareIctQse(
  result: ScorecardResult,
  sheets: ToolkitSheets,
  tables: ToolkitTables | undefined,
  tolerance = 0.005,
): IctQseLineResult[] {
  const ref = refereeIctQse(sheets, tables);
  const out: IctQseLineResult[] = [];
  for (const spec of ICT_QSE_LINES) {
    const toolkit = ictQseLineValue(sheets, ref, spec.rows);
    const pillar = result[spec.pillar] as { subLines?: BreakdownLine[] } | undefined;
    const line = (pillar?.subLines ?? []).find((l) => spec.names.includes(l.name));
    const ours = line ? Number(line.score) : null;
    const notes = spec.rows.map((r) => ref.lines.get(r)?.note).filter(Boolean);
    const diff = toolkit !== null && ours !== null ? ours - toolkit : null;
    out.push({
      row: spec.rows.join('+'),
      label: spec.label,
      toolkit,
      ours,
      diff,
      // A line the toolkit leaves blank is the 0 we show.
      ok: diff !== null ? Math.abs(diff) <= tolerance : (toolkit ?? 0) === 0 && (ours ?? 0) === 0,
      note: notes.length ? notes.join(' ') : line ? undefined : 'no matching line in our scorecard',
    });
  }
  for (const t of ICT_QSE_TOTAL_ROWS) {
    const toolkit = ref.lines.get(t.row)?.value ?? summaryValue(sheets, t.row);
    const ours = Number((result[t.pillar] as { score?: number } | undefined)?.score ?? NaN);
    const diff = toolkit !== null ? ours - toolkit : null;
    out.push({
      row: String(t.row), label: t.label.toUpperCase(), toolkit, ours, diff,
      ok: diff !== null && Math.abs(diff) <= tolerance, note: ref.lines.get(t.row)?.note,
    });
  }
  const oursDisc = result.preYesDiscountedLevel ?? result.discountedLevel;
  out.push({ row: String(ICT_QSE_LEVEL_ROWS.achieved), label: 'ACHIEVED LEVEL', toolkit: ref.achieved, ours: result.achievedLevel, diff: result.achievedLevel - ref.achieved, ok: result.achievedLevel === ref.achieved, note: ref.achievedNote });
  out.push({ row: String(ICT_QSE_LEVEL_ROWS.discounted), label: 'DISCOUNTED LEVEL', toolkit: ref.discounted, ours: oursDisc, diff: oursDisc - ref.discounted, ok: oursDisc === ref.discounted, note: ref.discountedNote });
  return out;
}

/** The toolkit's value for a line: the referee's where it reworks one, else the Summary Scorecard's. */
export function ictQseLineValue(sheets: ToolkitSheets, ref: RefereeResult, rows: number[]): number | null {
  let any = false;
  let sum = 0;
  for (const row of rows) {
    const v = ref.lines.get(row)?.value ?? summaryValue(sheets, row);
    if (v === null) continue;
    any = true;
    sum += v;
  }
  return any ? sum : null;
}
