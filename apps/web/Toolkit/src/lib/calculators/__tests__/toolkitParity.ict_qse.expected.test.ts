/**
 * The ICT QSE toolkit-parity gate that runs everywhere, Excel or not.
 *
 * docs/toolkits/parity/expected/ict_qse/*.json holds, for every synthetic case
 * Excel scored through the Empower ICT QSE toolkit (v1.1), the case itself and
 * the toolkit's Summary Scorecard with the cells and rows the referee reads
 * (written by docs/toolkits/parity/export_ict_qse.py). Every line, element
 * total, the grand total and both levels our live scorecard produces must
 * equal the toolkit's — or, where the toolkit's own formula is faulty, what
 * that formula evidently means (lib/parity/toolkitParity.ict_qse.ts) — to the
 * cent of a point.
 *
 * Adding a case: generate it (gen_case_ict_qse.py), score it through Excel
 * (run_ict_qse.sh), export it (export_ict_qse.py).
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { calculateScorecard } from '../../store';
import { ICT_QSE_CALCULATOR_CONFIG } from '../../sectors/ict-qse';
import type { ToolkitCase } from '../../../test/parity/caseAdapter';
import { adaptIctQseToolkitCase } from '../../../test/parity/caseAdapter.ict_qse';
import { compareIctQse } from '../../parity/toolkitParity.ict_qse';
import type { ToolkitSheets, ToolkitTables } from '../../parity/toolkitParity';
import type { ScorecardResult } from '../../types';

const EXPECTED_DIR = path.resolve(__dirname, '../../../../../../../docs/toolkits/parity/expected/ict_qse');

interface Expected { cells: ToolkitSheets; tables?: ToolkitTables; sampleCase: ToolkitCase }

const files = existsSync(EXPECTED_DIR) ? readdirSync(EXPECTED_DIR).filter((f) => f.endsWith('.json')).sort() : [];

describe('ICT QSE scores every Summary Scorecard line as the Empower toolkit does', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('has Excel-scored cases to check against', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of files) {
    it(file.replace(/\.json$/, ''), () => {
      const ex = JSON.parse(readFileSync(path.join(EXPECTED_DIR, file), 'utf8')) as Expected;
      const { state } = adaptIctQseToolkitCase(ex.sampleCase);
      const result = calculateScorecard({
        ...state,
        scorecard: {} as ScorecardResult,
        calculatorConfig: ICT_QSE_CALCULATOR_CONFIG,
      });
      const diffs = compareIctQse(result, ex.cells, ex.tables)
        .filter((l) => !l.ok)
        .map((l) => `row ${l.row} ${l.label}: toolkit ${l.toolkit} vs ours ${l.ours}`);
      expect(diffs).toEqual([]);
    });
  }
});
