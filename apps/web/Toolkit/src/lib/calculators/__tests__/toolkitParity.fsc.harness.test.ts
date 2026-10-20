/**
 * Toolkit parity harness, FSC — our live scorecard against the FSC Empower
 * toolkit (BBBEE Toolkit (FSC) Template v1.0), line by line, on cases Excel
 * itself scored.
 *
 *   1. py -3 docs/toolkits/parity/gen_case_fsc.py <seed> docs/toolkits/parity/cases/fsc/fsc_<seed>.case.json
 *   2. py -3 docs/toolkits/parity/toolkit_oracle.py fill "docs/toolkits/BBBEE Toolkit (FSC) Template v1.0.xlsx" <case> docs/toolkits/parity/out/fsc/fsc_<seed>.excel.json
 *   3. TOOLKIT_PARITY=1 npx vitest run --config apps/web/vitest.config.ts Toolkit/src/lib/calculators/__tests__/toolkitParity.fsc.harness.test.ts
 *
 * Writes docs/toolkits/parity/out/fsc/report.json and report.md. Skipped
 * unless TOOLKIT_PARITY is set; with TOOLKIT_PARITY=strict every line must
 * agree to the cent of a point. The line map and the referee (the toolkit's
 * own formula faults) live in lib/parity/toolkitParity.fsc.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { calculateScorecard } from '../../store';
import { adaptFscToolkitCase } from '../../../test/parity/caseAdapter.fsc';
import type { ToolkitCase } from '../../../test/parity/caseAdapter';
import {
  fscLinesFor, fscTotalRowsFor, fscConfigFor, fscReferee, summaryValue,
  type ToolkitSheets, type ToolkitTables,
} from '../../parity/toolkitParity.fsc';
import type { ScorecardResult, BreakdownLine } from '../../types';

const PARITY_DIR = process.env.PARITY_DIR
  ? path.resolve(process.env.PARITY_DIR)
  : path.resolve(__dirname, '../../../../../../../docs/toolkits/parity');
const REPORT_SUFFIX = process.env.PARITY_TAG ? `.${process.env.PARITY_TAG}` : '';
const TOLERANCE = 0.005;

interface LineResult { caseId: string; row: number | string; label: string; excel: number | null; ours: number | null; diff: number | null; ok: boolean; note?: string }

function loadCases(): Array<{ id: string; kase: ToolkitCase; sheets: ToolkitSheets; tables: ToolkitTables }> {
  const caseDir = path.join(PARITY_DIR, 'cases', 'fsc');
  const outDir = path.join(PARITY_DIR, 'out', 'fsc');
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
        ...(JSON.parse(readFileSync(excelPath, 'utf8')) as { sheets: ToolkitSheets; tables: ToolkitTables }),
      };
    })
    .filter((x): x is { id: string; kase: ToolkitCase; sheets: ToolkitSheets; tables: ToolkitTables } => x !== null);
}

describe.skipIf(!process.env.TOOLKIT_PARITY)('toolkit parity — FSC', () => {
  it('every Summary Scorecard line matches the Excel toolkit', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cases = loadCases();
    expect(cases.length, 'no scored cases found under docs/toolkits/parity/out/fsc').toBeGreaterThan(0);

    const all: LineResult[] = [];
    const unrepresented: Record<string, string[]> = {};
    for (const { id, kase, sheets, tables } of cases) {
      const { state, unrepresented: gaps } = adaptFscToolkitCase(kase);
      unrepresented[id] = gaps;
      const sub = state.client.fscSubSector ?? 'Others';
      const result = calculateScorecard({ ...state, scorecard: {} as ScorecardResult, calculatorConfig: fscConfigFor(sub) });
      const ref = fscReferee(sheets, tables);
      for (const spec of fscLinesFor(sub, Boolean(state.client.fscReinsurer), state.afs?.stiProductLines)) {
        const fix = ref.lines.get(spec.row);
        const ex = fix ? fix.value : summaryValue(sheets, spec.row);
        const pillar = result[spec.pillar] as { subLines?: BreakdownLine[] } | undefined;
        const line = (pillar?.subLines ?? []).find((l) => spec.names.includes(l.name));
        const ours = line ? Number(line.score) : null;
        if (ex === null && ours === null) continue;
        const diff = ex !== null && ours !== null ? ours - ex : null;
        all.push({
          caseId: id, row: spec.row, label: spec.label, excel: ex, ours, diff,
          ok: diff !== null ? Math.abs(diff) <= TOLERANCE : (ex ?? 0) === 0 && (ours ?? 0) === 0,
          note: fix ? fix.note : line ? undefined : ex === null ? 'toolkit shows no value' : 'no matching line in our scorecard',
        });
      }
      for (const t of fscTotalRowsFor(sub)) {
        const fix = ref.lines.get(t.row);
        const ex = fix ? fix.value : summaryValue(sheets, t.row);
        const ours = Number((result[t.pillar] as { score?: number } | undefined)?.score ?? NaN);
        const diff = ex !== null ? ours - ex : null;
        all.push({ caseId: id, row: t.row, label: t.label.toUpperCase(), excel: ex, ours, diff, ok: diff !== null && Math.abs(diff) <= TOLERANCE, note: fix?.note });
      }
      const oursDisc = result.preYesDiscountedLevel ?? result.discountedLevel;
      all.push({ caseId: id, row: 109, label: 'ACHIEVED LEVEL', excel: ref.achieved, ours: result.achievedLevel, diff: result.achievedLevel - ref.achieved, ok: result.achievedLevel === ref.achieved, note: ref.achievedNote });
      all.push({ caseId: id, row: 111, label: 'DISCOUNTED LEVEL', excel: ref.discounted, ours: oursDisc, diff: oursDisc - ref.discounted, ok: oursDisc === ref.discounted, note: ref.discountedNote });
    }

    const outDir = path.join(PARITY_DIR, 'out', 'fsc');
    mkdirSync(outDir, { recursive: true });
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
    process.stdout.write(`\nTOOLKIT PARITY (FSC): ${summary}\n`);
    if (process.env.TOOLKIT_PARITY === 'strict') {
      expect(bad, summary).toEqual([]);
    }
  });
});
