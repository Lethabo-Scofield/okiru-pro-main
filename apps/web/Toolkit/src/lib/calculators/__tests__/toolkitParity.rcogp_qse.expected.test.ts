/**
 * The RCOGP QSE toolkit-parity gate that runs everywhere, Excel or not.
 *
 * docs/toolkits/parity/expected/rcogp_qse/*.json holds, for every synthetic
 * case the Empower RCOGP QSE toolkit (v1.1) scored in Excel, the case itself
 * and the toolkit's Summary Scorecard with the cells and rows the referee
 * reads (written by docs/toolkits/parity/export_rcogp_qse.py). Every line our
 * live scorecard produces, every element total, the grand total and both
 * levels must equal the toolkit's — or, where the toolkit's own formula is
 * faulty, what that formula evidently means (lib/parity/toolkitParity.rcogp_qse.ts)
 * — to the cent of a point.
 *
 * Adding a case: generate it (gen_case_rcogp_qse.py), score it with
 * toolkit_oracle.py, export it (export_rcogp_qse.py).
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { calculateScorecard } from '../../store';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '../../sectors/rcogp-qse';
import type { ToolkitCase } from '../../../test/parity/caseAdapter';
import { adaptRcogpQseToolkitCase } from '../../../test/parity/caseAdapter.rcogp_qse';
import type { ToolkitSheets, ToolkitTables } from '../../parity/toolkitParity';
import {
  RCOGP_QSE_LINES, RCOGP_QSE_TOTAL_ROWS, rcogpQseReferee, rcogpQseSummaryValue,
} from '../../parity/toolkitParity.rcogp_qse';
import type { BreakdownLine, ScorecardResult } from '../../types';

const EXPECTED_DIR = path.resolve(__dirname, '../../../../../../../docs/toolkits/parity/expected/rcogp_qse');
const TOLERANCE = 0.005;

interface Expected { cells: ToolkitSheets; tables?: ToolkitTables; sampleCase: ToolkitCase }

const files = existsSync(EXPECTED_DIR) ? readdirSync(EXPECTED_DIR).filter((f) => f.endsWith('.json')).sort() : [];

describe('RCOGP QSE scores every Summary Scorecard line as the Empower toolkit does', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('has Excel-scored cases to check against', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of files) {
    it(file.replace(/\.json$/, ''), () => {
      const ex = JSON.parse(readFileSync(path.join(EXPECTED_DIR, file), 'utf8')) as Expected;
      const { state } = adaptRcogpQseToolkitCase(ex.sampleCase);
      const result = calculateScorecard({
        ...state,
        scorecard: {} as ScorecardResult,
        calculatorConfig: RCOGP_QSE_CALCULATOR_CONFIG,
      });
      const ref = rcogpQseReferee(ex.cells, ex.tables);
      const diffs: string[] = [];
      for (const spec of RCOGP_QSE_LINES) {
        const toolkit = ref.lines.get(spec.row)?.value ?? rcogpQseSummaryValue(ex.cells, spec.row);
        const pillar = result[spec.pillar] as { subLines?: BreakdownLine[] } | undefined;
        const line = (pillar?.subLines ?? []).find((l) => spec.names.includes(l.name));
        const ours = line ? Number(line.score) : null;
        if (toolkit === null || ours === null || Math.abs(ours - toolkit) > TOLERANCE) {
          diffs.push(`row ${spec.row} ${spec.label}: toolkit ${toolkit} vs ours ${ours}`);
        }
      }
      for (const t of RCOGP_QSE_TOTAL_ROWS) {
        const toolkit = ref.lines.get(t.row)?.value ?? rcogpQseSummaryValue(ex.cells, t.row);
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
