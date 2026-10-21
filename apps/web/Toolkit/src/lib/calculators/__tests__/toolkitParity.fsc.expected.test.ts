/**
 * The FSC toolkit-parity gate that runs everywhere, Excel or not.
 *
 * docs/toolkits/parity/expected/fsc/*.json holds, for every synthetic FSC
 * case Excel scored, the case itself and the FSC toolkit's Summary Scorecard
 * with the cells and rows the referee reads (written by
 * docs/toolkits/parity/export_fsc.py). Every line our live scorecard produces
 * must equal the toolkit's — or, where the toolkit's own formula is faulty,
 * what that formula evidently means (lib/parity/toolkitParity.fsc.ts) — to
 * the cent of a point, and both levels must agree.
 *
 * Adding a case: generate it (gen_case_fsc.py), score it with
 * toolkit_oracle.py, export it (export_fsc.py).
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { calculateScorecard } from '../../store';
import { adaptFscToolkitCase } from '../../../test/parity/caseAdapter.fsc';
import type { ToolkitCase } from '../../../test/parity/caseAdapter';
import {
  fscLinesFor, fscTotalRowsFor, fscConfigFor, fscReferee, summaryValue,
  type ToolkitSheets, type ToolkitTables,
} from '../../parity/toolkitParity.fsc';
import type { BreakdownLine, ScorecardResult } from '../../types';

const EXPECTED_DIR = path.resolve(__dirname, '../../../../../../../docs/toolkits/parity/expected/fsc');
const TOLERANCE = 0.005;

interface Expected { cells: ToolkitSheets; tables?: ToolkitTables; sampleCase: ToolkitCase }

const files = existsSync(EXPECTED_DIR) ? readdirSync(EXPECTED_DIR).filter((f) => f.endsWith('.json')).sort() : [];

describe('FSC scores every Summary Scorecard line as the FSC Empower toolkit does', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('has Excel-scored cases to check against', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of files) {
    it(file.replace(/\.json$/, ''), () => {
      const ex = JSON.parse(readFileSync(path.join(EXPECTED_DIR, file), 'utf8')) as Expected;
      const { state } = adaptFscToolkitCase(ex.sampleCase);
      const sub = state.client.fscSubSector ?? 'Others';
      const result = calculateScorecard({ ...state, scorecard: {} as ScorecardResult, calculatorConfig: fscConfigFor(sub) });
      const ref = fscReferee(ex.cells, ex.tables);
      const diffs: string[] = [];
      for (const spec of fscLinesFor(sub, Boolean(state.client.fscReinsurer), state.afs?.stiProductLines)) {
        const toolkit = ref.lines.get(spec.row)?.value ?? summaryValue(ex.cells, spec.row);
        const pillar = result[spec.pillar] as { subLines?: BreakdownLine[] } | undefined;
        const line = (pillar?.subLines ?? []).find((l) => spec.names.includes(l.name));
        const ours = line ? Number(line.score) : null;
        if ((toolkit ?? 0) === 0 && (ours ?? 0) === 0) continue;
        if (toolkit === null || ours === null || Math.abs(ours - toolkit) > TOLERANCE) {
          diffs.push(`row ${spec.row} ${spec.label}: toolkit ${toolkit} vs ours ${ours}`);
        }
      }
      for (const t of fscTotalRowsFor(sub)) {
        const toolkit = ref.lines.get(t.row)?.value ?? summaryValue(ex.cells, t.row);
        const ours = Number((result[t.pillar] as { score?: number } | undefined)?.score ?? NaN);
        if (toolkit === null || Math.abs(ours - toolkit) > TOLERANCE) diffs.push(`${t.label}: toolkit ${toolkit} vs ours ${ours}`);
      }
      if (result.achievedLevel !== ref.achieved) diffs.push(`level: toolkit ${ref.achieved} vs ours ${result.achievedLevel}`);
      const ourDiscounted = result.preYesDiscountedLevel ?? result.discountedLevel;
      if (ourDiscounted !== ref.discounted) diffs.push(`discounted level: toolkit ${ref.discounted} vs ours ${ourDiscounted}`);
      expect(diffs).toEqual([]);
    });
  }
});

describe('an FSC management control line with no points says truly where its points went', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  // The toolkit's weighting column: 'Summary Scorecard'!C<row>.
  const weightingOf = (ex: Expected, row: number) => Number(ex.cells['Summary Scorecard']?.[`C${row}`]?.v ?? NaN);
  const MC_ROW = 31;
  const OTHER_EXEC_BLACK_ROW = 36;

  for (const file of files) {
    it(file.replace(/\.json$/, ''), () => {
      const ex = JSON.parse(readFileSync(path.join(EXPECTED_DIR, file), 'utf8')) as Expected;
      const { state } = adaptFscToolkitCase(ex.sampleCase);
      const sub = state.client.fscSubSector ?? 'Others';
      const result = calculateScorecard({ ...state, scorecard: {} as ScorecardResult, calculatorConfig: fscConfigFor(sub) });
      const lines = (result.managementControl as { subLines?: BreakdownLine[] } | undefined)?.subLines ?? [];
      const mcMax = weightingOf(ex, MC_ROW);
      // Each line carries the toolkit's weighting, so where the points went is the toolkit's doing.
      for (const spec of fscLinesFor(sub, Boolean(state.client.fscReinsurer), state.afs?.stiProductLines)) {
        if (spec.pillar !== 'managementControl') continue;
        const line = lines.find((l) => spec.names.includes(l.name));
        expect(line?.weighting, `row ${spec.row} ${spec.label}`).toBeCloseTo(weightingOf(ex, spec.row), 9);
      }
      for (const l of lines.filter((x) => x.weighting === 0)) {
        expect(l.note, l.name).toMatch(/^No points on this scorecard: .{20,}\.$/);
        // "To no band" only where the toolkit's management control is short of its 21 points;
        // "to other executive management" only where that band carries the 10 points it then gets.
        if (/to no band/.test(l.note ?? '')) expect(mcMax, l.name).toBeLessThan(21);
        if (/moves this band's points to other executive/.test(l.note ?? '')) {
          expect(weightingOf(ex, OTHER_EXEC_BLACK_ROW), l.name).toBe(10);
          expect(mcMax, l.name).toBe(21);
        }
      }
      if (mcMax < 21) {
        expect(lines.filter((l) => /senior management/.test(l.name) && /to no band/.test(l.note ?? ''))).toHaveLength(3);
      }
    });
  }
});
