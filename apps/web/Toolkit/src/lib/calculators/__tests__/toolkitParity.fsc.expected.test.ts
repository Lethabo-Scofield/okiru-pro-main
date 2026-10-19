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
      for (const spec of fscLinesFor(sub, Boolean(state.client.fscReinsurer))) {
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
