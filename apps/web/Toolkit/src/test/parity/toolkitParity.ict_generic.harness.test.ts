/**
 * Toolkit parity harness, ICT Generic — our live scorecard against the Empower
 * ICT Generic toolkit, line by line, on cases Excel itself scored.
 *
 *   1. py -3 docs/toolkits/parity/gen_case_ict_generic.py --all docs/toolkits/parity/cases/ict_generic
 *   2. py -3 docs/toolkits/parity/toolkit_oracle.py fill "docs/toolkits/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx" <case> docs/toolkits/parity/out/ict_generic/<id>.excel.json
 *   3. TOOLKIT_PARITY=1 npx vitest run --config apps/web/vitest.config.ts Toolkit/src/test/parity/toolkitParity.ict_generic.harness.test.ts
 *
 * Writes docs/toolkits/parity/out/ict_generic/report.json and report.md.
 * Skipped unless TOOLKIT_PARITY is set; with TOOLKIT_PARITY=strict every line
 * must agree to the cent of a point. PARITY_DIR points at another checkout's
 * docs/toolkits/parity; PARITY_TAG keeps this run's report apart.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { ToolkitCase } from './caseAdapter.ict_generic';
import type { ToolkitSheets, ToolkitTables } from '../../lib/parity/toolkitParity.ict_generic';
import { compareIctGenericCase, type IctLineResult } from './ictGenericCompare';

const PARITY_DIR = process.env.PARITY_DIR
  ? path.resolve(process.env.PARITY_DIR)
  : path.resolve(__dirname, '../../../../../../docs/toolkits/parity');
const REPORT_SUFFIX = process.env.PARITY_TAG ? `.${process.env.PARITY_TAG}` : '';

describe.skipIf(!process.env.TOOLKIT_PARITY)('toolkit parity — ICT Generic', () => {
  it('every Summary Scorecard line matches the Excel toolkit', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const caseDir = path.join(PARITY_DIR, 'cases', 'ict_generic');
    const outDir = path.join(PARITY_DIR, 'out', 'ict_generic');
    const ids = existsSync(caseDir)
      ? readdirSync(caseDir).filter((f) => f.endsWith('.case.json')).map((f) => f.replace(/\.case\.json$/, ''))
        .filter((id) => existsSync(path.join(outDir, `${id}.excel.json`))).sort()
      : [];
    expect(ids.length, 'no Excel-scored ICT cases found').toBeGreaterThan(0);

    const all: IctLineResult[] = [];
    const unrepresented: Record<string, string[]> = {};
    for (const id of ids) {
      const kase = JSON.parse(readFileSync(path.join(caseDir, `${id}.case.json`), 'utf8')) as ToolkitCase;
      const { sheets, tables } = JSON.parse(readFileSync(path.join(outDir, `${id}.excel.json`), 'utf8')) as { sheets: ToolkitSheets; tables: ToolkitTables };
      const r = compareIctGenericCase(id, kase, sheets, tables);
      all.push(...r.lines);
      unrepresented[id] = r.unrepresented;
    }

    writeFileSync(path.join(outDir, `report${REPORT_SUFFIX}.json`), JSON.stringify({ lines: all, unrepresented }, null, 1));
    const fmt = (x: number | null) => (x === null || Number.isNaN(x) ? '—' : x.toFixed(2));
    const md = [
      '| case | row | line | Excel | ours | diff | |',
      '|---|---|---|---|---|---|---|',
      ...all.map((l) => `| ${l.caseId} | ${l.row} | ${l.label} | ${fmt(l.excel)} | ${fmt(l.ours)} | ${fmt(l.diff)} | ${l.ok ? 'ok' : 'DIFF'}${l.note ? ` (${l.note})` : ''} |`),
    ].join('\n');
    writeFileSync(path.join(outDir, `report${REPORT_SUFFIX}.md`), md);

    const bad = all.filter((l) => !l.ok);
    const summary = `${all.length - bad.length}/${all.length} lines match across ${ids.length} case(s)`;
    process.stdout.write(`\nICT GENERIC TOOLKIT PARITY: ${summary}\n`);
    for (const b of bad) process.stdout.write(`  DIFF ${b.caseId} row ${b.row} ${b.label}: Excel ${fmt(b.excel)} ours ${fmt(b.ours)}\n`);
    if (process.env.TOOLKIT_PARITY === 'strict') expect(bad, summary).toEqual([]);
  });
});
