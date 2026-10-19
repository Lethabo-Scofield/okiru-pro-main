/**
 * Toolkit parity harness, ICT QSE — our live scorecard against the Empower
 * ICT QSE toolkit, line by line, on cases Excel itself scored.
 *
 *   1. py -3 docs/toolkits/parity/gen_case_ict_qse.py --all
 *   2. bash docs/toolkits/parity/run_ict_qse.sh <heavy.sh>   (Excel fills each case)
 *   3. TOOLKIT_PARITY=1 npx vitest run --config apps/web/vitest.config.ts Toolkit/src/lib/calculators/__tests__/toolkitParity.ict_qse.harness.test.ts
 *
 * Writes docs/toolkits/parity/out/ict_qse/report.json and report.md. Skipped
 * unless TOOLKIT_PARITY is set; with TOOLKIT_PARITY=strict every line must
 * agree to the cent of a point. The line map and the referee (including the
 * toolkit's own formula faults) live in lib/parity/toolkitParity.ict_qse.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { calculateScorecard } from '../../store';
import { ICT_QSE_CALCULATOR_CONFIG } from '../../sectors/ict-qse';
import type { ToolkitCase } from '../../../test/parity/caseAdapter';
import { adaptIctQseToolkitCase } from '../../../test/parity/caseAdapter.ict_qse';
import { compareIctQse, type IctQseLineResult } from '../../parity/toolkitParity.ict_qse';
import type { ToolkitSheets, ToolkitTables } from '../../parity/toolkitParity';
import type { ScorecardResult } from '../../types';

// PARITY_DIR points another checkout at one shared set of Excel results;
// PARITY_TAG keeps its report from overwriting another run's.
const PARITY_DIR = process.env.PARITY_DIR
  ? path.resolve(process.env.PARITY_DIR)
  : path.resolve(__dirname, '../../../../../../../docs/toolkits/parity');
const REPORT_SUFFIX = process.env.PARITY_TAG ? `.${process.env.PARITY_TAG}` : '';

function loadCases(): Array<{ id: string; kase: ToolkitCase; sheets: ToolkitSheets; tables: ToolkitTables }> {
  const caseDir = path.join(PARITY_DIR, 'cases', 'ict_qse');
  const outDir = path.join(PARITY_DIR, 'out', 'ict_qse');
  if (!existsSync(caseDir)) return [];
  return readdirSync(caseDir)
    .filter((f) => f.endsWith('.case.json'))
    .sort()
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

describe.skipIf(!process.env.TOOLKIT_PARITY)('toolkit parity — ICT QSE', () => {
  it('every Summary Scorecard line matches the Excel toolkit', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cases = loadCases();
    expect(cases.length, 'no scored ICT QSE cases found under docs/toolkits/parity').toBeGreaterThan(0);

    const all: Array<IctQseLineResult & { caseId: string }> = [];
    const unrepresented: Record<string, string[]> = {};
    for (const { id, kase, sheets, tables } of cases) {
      const { state, unrepresented: gaps } = adaptIctQseToolkitCase(kase);
      unrepresented[id] = gaps;
      const result = calculateScorecard({
        ...state,
        scorecard: {} as ScorecardResult,
        calculatorConfig: ICT_QSE_CALCULATOR_CONFIG,
      });
      for (const l of compareIctQse(result, sheets, tables)) all.push({ caseId: id, ...l });
    }

    const outDir = path.join(PARITY_DIR, 'out', 'ict_qse');
    writeFileSync(path.join(outDir, `report${REPORT_SUFFIX}.json`), JSON.stringify({ lines: all, unrepresented }, null, 1));
    const fmt = (v: number | null) => (v === null || Number.isNaN(v) ? '—' : v.toFixed(2));
    const md = [
      '| case | row | line | Excel | ours | diff | |',
      '|---|---|---|---|---|---|---|',
      ...all.map((l) => `| ${l.caseId} | ${l.row} | ${l.label} | ${fmt(l.toolkit)} | ${fmt(l.ours)} | ${fmt(l.diff)} | ${l.ok ? 'ok' : 'DIFF'}${l.note ? ` (${l.note})` : ''} |`),
    ].join('\n');
    writeFileSync(path.join(outDir, `report${REPORT_SUFFIX}.md`), md);

    const bad = all.filter((l) => !l.ok);
    const summary = `${all.length - bad.length}/${all.length} lines match across ${cases.length} case(s)`;
    process.stdout.write(`\nTOOLKIT PARITY (ICT QSE): ${summary}\n`);
    for (const b of bad.slice(0, 60)) {
      process.stdout.write(`  ${b.caseId} row ${b.row} ${b.label}: toolkit ${fmt(b.toolkit)} vs ours ${fmt(b.ours)}\n`);
    }
    if (process.env.TOOLKIT_PARITY === 'strict') {
      expect(bad, summary).toEqual([]);
    }
  });
});
