/**
 * Toolkit parity harness — our live scorecard against the Empower toolkit,
 * line by line, on cases Excel itself scored.
 *
 *   1. py -3 docs/toolkits/parity/gen_case.py <seed> docs/toolkits/parity/cases/gen_<seed>.case.json
 *   2. py -3 docs/toolkits/parity/toolkit_oracle.py fill "<template>.xlsx" <case> docs/toolkits/parity/out/gen_<seed>.excel.json
 *   3. TOOLKIT_PARITY=1 npx vitest run --config apps/web/vitest.config.ts Toolkit/src/lib/calculators/__tests__/toolkitParity.harness.test.ts
 *
 * Writes docs/toolkits/parity/out/report.json and report.md. Skipped unless
 * TOOLKIT_PARITY is set; with TOOLKIT_PARITY=strict every line must agree to
 * the cent of a point.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { calculateScorecard } from '../../store';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '../../sectors/rcogp-generic';
import { adaptToolkitCase, type ToolkitCase } from '../../../test/parity/caseAdapter';
import type { ScorecardResult, BreakdownLine } from '../../types';

// PARITY_DIR points another checkout at one shared set of Excel results;
// PARITY_TAG keeps its report from overwriting another run's.
const PARITY_DIR = process.env.PARITY_DIR
  ? path.resolve(process.env.PARITY_DIR)
  : path.resolve(__dirname, '../../../../../../../docs/toolkits/parity');
const REPORT_SUFFIX = process.env.PARITY_TAG ? `.${process.env.PARITY_TAG}` : '';
const TOLERANCE = 0.005;

type PillarKey = keyof ScorecardResult;
interface LineSpec { row: number; pillar: PillarKey; names: string[]; label: string }

/** RCOGP Generic Summary Scorecard rows (column F = Actual) → our breakdown lines. */
const RCOGP_GENERIC_LINES: LineSpec[] = [
  { row: 20, pillar: 'ownership', label: 'Voting rights: black', names: ['Exercisable voting rights of black individuals'] },
  { row: 21, pillar: 'ownership', label: 'Voting rights: black women', names: ['Exercisable voting rights of black females'] },
  { row: 22, pillar: 'ownership', label: 'Economic interest: black', names: ['Economic interest of black individuals'] },
  { row: 23, pillar: 'ownership', label: 'Economic interest: black women', names: ['Economic interest of black females'] },
  { row: 24, pillar: 'ownership', label: 'Economic interest: designated groups', names: ['Economic interest of black designated groups or participants in ownership schemes'] },
  { row: 25, pillar: 'ownership', label: 'Economic interest: new entrants', names: ['Economic interest of black new entrants'] },
  { row: 26, pillar: 'ownership', label: 'Net value', names: ['Net value'] },
  { row: 29, pillar: 'managementControl', label: 'Board: black voting', names: ['Exercisable voting rights of black board members'] },
  { row: 30, pillar: 'managementControl', label: 'Board: black women voting', names: ['Exercisable voting rights of black female board members'] },
  { row: 31, pillar: 'managementControl', label: 'Executive directors: black', names: ['Black executive directors'] },
  { row: 32, pillar: 'managementControl', label: 'Executive directors: black women', names: ['Black female executive directors'] },
  { row: 33, pillar: 'managementControl', label: 'Other executive (& senior): black', names: ['Black other executive management', 'Black other executive & senior management'] },
  { row: 34, pillar: 'managementControl', label: 'Other executive (& senior): black women', names: ['Black female other executive management', 'Black female other executive & senior management'] },
  { row: 35, pillar: 'managementControl', label: 'Senior management: black', names: ['Black employees in senior management'] },
  { row: 36, pillar: 'managementControl', label: 'Senior management: black women', names: ['Black female employees in senior management'] },
  { row: 37, pillar: 'managementControl', label: 'Middle management: black', names: ['Black employees in middle management'] },
  { row: 38, pillar: 'managementControl', label: 'Middle management: black women', names: ['Black female employees in middle management'] },
  { row: 39, pillar: 'managementControl', label: 'Junior management: black', names: ['Black employees in junior management (incl. Semi-skilled & Unskilled)', 'Black employees in junior management'] },
  { row: 40, pillar: 'managementControl', label: 'Junior management: black women', names: ['Black female employees in junior management (incl. Semi-skilled & Unskilled)', 'Black female employees in junior management'] },
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

const PILLAR_TOTAL_ROWS: Array<{ row: number; pillar: PillarKey; label: string }> = [
  { row: 19, pillar: 'ownership', label: 'OWNERSHIP' },
  { row: 28, pillar: 'managementControl', label: 'MANAGEMENT CONTROL' },
  { row: 43, pillar: 'skillsDevelopment', label: 'SKILLS DEVELOPMENT' },
  { row: 50, pillar: 'procurement', label: 'PREFERENTIAL PROCUREMENT' },
  { row: 58, pillar: 'supplierDevelopment', label: 'SUPPLIER DEVELOPMENT' },
  { row: 61, pillar: 'enterpriseDevelopment', label: 'ENTERPRISE DEVELOPMENT' },
  { row: 66, pillar: 'socioEconomicDevelopment', label: 'SOCIO-ECONOMIC DEVELOPMENT' },
  { row: 69, pillar: 'total', label: 'GRAND TOTAL' },
];

interface LineResult { caseId: string; row: number; label: string; excel: number | null; ours: number | null; diff: number | null; ok: boolean; note?: string }

/**
 * Where the toolkit's own formula is broken, the referee is what the formula
 * evidently means, computed from the toolkit's OWN measured values. Each
 * replacement is labelled in the report; nothing else is touched.
 *
 *  - Ownership points use MIN(I / LEFT(E,3) × D, D). LEFT() truncates numeric
 *    targets: 3% and 2% become "0.0" (designated groups and new entrants
 *    always 0), 25% becomes "0.2" (economic interest scored against 20%).
 *  - 'Scorecard Calculations'!G5 sums empty cells, so the Skills sub-minimum
 *    always fails and every entity is discounted.
 *  - The level lookup uses a strict "<", so a total exactly on a threshold
 *    drops a level.
 */
const OWNERSHIP_LEFT_DEFECT: Array<{ row: number; measure: string; target: number; pts: number }> = [
  { row: 22, measure: 'I7', target: 0.25, pts: 4 },
  { row: 24, measure: 'I10', target: 0.03, pts: 3 },
  { row: 25, measure: 'I12', target: 0.02, pts: 2 },
];
const LEVEL_THRESHOLDS: Array<[number, number]> = [[100, 1], [95, 2], [90, 3], [80, 4], [75, 5], [70, 6], [55, 7], [40, 8]];
const levelFor = (points: number) => (LEVEL_THRESHOLDS.find(([min]) => points >= min)?.[1] ?? 9);

function intendedToolkit(sheets: Record<string, Record<string, { v: unknown }>>) {
  const v = (sheet: string, ref: string) => Number(sheets[sheet]?.[ref]?.v ?? 0) || 0;
  const lines = new Map<number, { value: number; note: string }>();
  let ownershipDelta = 0;
  for (const d of OWNERSHIP_LEFT_DEFECT) {
    const manual = sheets['Ownership Scorecard']?.[`J${d.row === 22 ? 7 : d.row === 24 ? 10 : 12}`]?.v;
    if (manual !== undefined && manual !== null && manual !== '') continue;
    const measure = v('Ownership Scorecard', d.measure);
    const intended = Math.min(Math.max(measure, 0) / d.target * d.pts, d.pts);
    const excel = v('Summary Scorecard', `F${d.row}`);
    if (Math.abs(intended - excel) > 1e-9) {
      lines.set(d.row, { value: intended, note: `toolkit defect: LEFT() target; intended ${(measure * 100).toFixed(2)}% ÷ ${d.target * 100}% × ${d.pts}` });
      ownershipDelta += intended - excel;
    }
  }
  const total = v('Summary Scorecard', 'F69') + ownershipDelta;
  if (ownershipDelta !== 0) {
    lines.set(19, { value: v('Summary Scorecard', 'F19') + ownershipDelta, note: 'toolkit defect: LEFT() target lines' });
    lines.set(69, { value: total, note: 'toolkit defect: LEFT() target lines' });
  }
  const achieved = levelFor(total);
  const netValuePts = v('Summary Scorecard', 'F26');
  const skillsBase = v('Summary Scorecard', 'F44') + v('Summary Scorecard', 'F45') + v('Summary Scorecard', 'F46') + v('Summary Scorecard', 'F47');
  const subMinFailed = netValuePts < 3.2
    || skillsBase < 8
    || v('Scorecard Calculations', 'G6') < v('Scorecard Calculations', 'F6')
    || v('Scorecard Calculations', 'G7') < v('Scorecard Calculations', 'F7')
    || v('Scorecard Calculations', 'G8') < v('Scorecard Calculations', 'F8');
  const discounted = subMinFailed ? (achieved >= 8 ? 9 : achieved + 1) : achieved;
  return { lines, achieved, discounted };
}

function excelValue(sheets: Record<string, Record<string, { v: unknown }>>, sheet: string, ref: string): number | null {
  const v = sheets[sheet]?.[ref]?.v;
  if (v === '' || v == null) return null;
  return typeof v === 'number' ? v : Number(v);
}

function findLine(lines: BreakdownLine[] | undefined, names: string[]): BreakdownLine | undefined {
  return (lines ?? []).find((l) => names.includes(l.name));
}

function levelNumber(v: unknown): number {
  const s = String(v ?? '');
  if (/non/i.test(s)) return 9;
  const m = s.match(/(\d)/);
  return m ? Number(m[1]) : NaN;
}

function loadCases(): Array<{ id: string; kase: ToolkitCase; excel: any }> {
  const caseDir = path.join(PARITY_DIR, 'cases');
  const outDir = path.join(PARITY_DIR, 'out');
  if (!existsSync(caseDir)) return [];
  return readdirSync(caseDir)
    .filter((f) => f.endsWith('.case.json'))
    .map((f) => {
      const id = f.replace(/\.case\.json$/, '');
      const excelPath = path.join(outDir, `${id}.excel.json`);
      if (!existsSync(excelPath)) return null;
      return {
        id,
        kase: JSON.parse(readFileSync(path.join(caseDir, f), 'utf8')) as ToolkitCase,
        excel: JSON.parse(readFileSync(excelPath, 'utf8')),
      };
    })
    .filter((x): x is { id: string; kase: ToolkitCase; excel: any } => x !== null);
}

describe.skipIf(!process.env.TOOLKIT_PARITY)('toolkit parity — RCOGP Generic', () => {
  it('every Summary Scorecard line matches the Excel toolkit', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cases = loadCases();
    expect(cases.length, 'no scored cases found under docs/toolkits/parity').toBeGreaterThan(0);

    const all: LineResult[] = [];
    const unrepresented: Record<string, string[]> = {};
    for (const { id, kase, excel } of cases) {
      const { state, unrepresented: gaps } = adaptToolkitCase(kase);
      unrepresented[id] = gaps;
      const result = calculateScorecard({
        ...state,
        scorecard: {} as ScorecardResult,
        calculatorConfig: RCOGP_GENERIC_CALCULATOR_CONFIG,
      });
      const sheets = excel.sheets;
      const intended = intendedToolkit(sheets);
      for (const spec of RCOGP_GENERIC_LINES) {
        const fix = intended.lines.get(spec.row);
        const ex = fix ? fix.value : excelValue(sheets, 'Summary Scorecard', `F${spec.row}`);
        const pillar = result[spec.pillar] as { subLines?: BreakdownLine[] } | undefined;
        const line = findLine(pillar?.subLines, spec.names);
        const ours = line ? Number(line.score) : null;
        if (ex === null && ours === null) continue;
        const diff = ex !== null && ours !== null ? ours - ex : null;
        all.push({
          caseId: id, row: spec.row, label: spec.label, excel: ex, ours, diff,
          ok: diff !== null ? Math.abs(diff) <= TOLERANCE : (ex ?? 0) === 0 && (ours ?? 0) === 0,
          note: fix ? fix.note : line ? undefined : ex === null ? 'toolkit shows no value' : 'no matching line in our scorecard',
        });
      }
      for (const t of PILLAR_TOTAL_ROWS) {
        const fix = intended.lines.get(t.row);
        const ex = fix ? fix.value : excelValue(sheets, 'Summary Scorecard', `F${t.row}`);
        const ours = Number((result[t.pillar] as { score?: number })?.score ?? NaN);
        const diff = ex !== null ? ours - ex : null;
        all.push({ caseId: id, row: t.row, label: t.label, excel: ex, ours, diff, ok: diff !== null && Math.abs(diff) <= TOLERANCE, note: fix?.note });
      }
      const exLevel = levelNumber(sheets['Summary Scorecard']?.F73?.v);
      const exDisc = levelNumber(sheets['Summary Scorecard']?.F75?.v);
      const levelNote = intended.achieved !== exLevel ? 'toolkit defect: level lookup' : undefined;
      const discNote = intended.discounted !== exDisc ? 'toolkit defect: Skills sub-minimum reads empty cells' : undefined;
      const oursDisc = result.preYesDiscountedLevel ?? result.discountedLevel;
      all.push({ caseId: id, row: 73, label: 'ACHIEVED LEVEL', excel: intended.achieved, ours: result.achievedLevel, diff: result.achievedLevel - intended.achieved, ok: result.achievedLevel === intended.achieved, note: levelNote });
      all.push({ caseId: id, row: 75, label: 'DISCOUNTED LEVEL', excel: intended.discounted, ours: oursDisc, diff: oursDisc - intended.discounted, ok: oursDisc === intended.discounted, note: discNote });
    }

    const outDir = path.join(PARITY_DIR, 'out');
    writeFileSync(path.join(outDir, `report${REPORT_SUFFIX}.json`), JSON.stringify({ lines: all, unrepresented }, null, 1));
    const fmt = (n: number | null) => (n === null || Number.isNaN(n) ? '—' : n.toFixed(2));
    const md = [
      '| case | row | line | Excel | ours | diff | |',
      '|---|---|---|---|---|---|---|',
      ...all.map((l) => `| ${l.caseId} | ${l.row} | ${l.label} | ${fmt(l.excel)} | ${fmt(l.ours)} | ${fmt(l.diff)} | ${l.ok ? 'ok' : 'DIFF'}${l.note ? ` (${l.note})` : ''} |`),
    ].join('\n');
    writeFileSync(path.join(outDir, `report${REPORT_SUFFIX}.md`), md);

    const bad = all.filter((l) => !l.ok);
    const summary = `${all.length - bad.length}/${all.length} lines match across ${cases.length} case(s)`;
    process.stdout.write(`\nTOOLKIT PARITY: ${summary}\n`);
    if (process.env.TOOLKIT_PARITY === 'strict') {
      expect(bad, summary).toEqual([]);
    }
  });
});
