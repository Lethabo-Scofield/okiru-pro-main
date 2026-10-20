/**
 * The ICT Generic toolkit-parity gate that runs everywhere, Excel or not.
 *
 * docs/toolkits/parity/expected/ict_generic/*.json holds, for every synthetic
 * case Excel scored on the Empower ICT Generic toolkit, the case itself and
 * the toolkit's Summary Scorecard with the cells the referee reads (written by
 * docs/toolkits/parity/export_ict_generic.py). Every line, element total, the
 * grand total and both levels our live scorecard produces must equal the
 * toolkit's — or, where a toolkit formula is faulty, what that formula
 * evidently means (lib/parity/toolkitParity.ict_generic.ts) — to the cent.
 *
 * Adding a case: generate it, score it with toolkit_oracle.py, export it.
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import type { ToolkitCase } from '../../../test/parity/caseAdapter.ict_generic';
import type { ToolkitSheets, ToolkitTables } from '../../parity/toolkitParity.ict_generic';
import { compareIctGenericCase } from '../../../test/parity/ictGenericCompare';

const EXPECTED_DIR = path.resolve(__dirname, '../../../../../../../docs/toolkits/parity/expected/ict_generic');

interface Expected { cells: ToolkitSheets; tables?: ToolkitTables; sampleCase: ToolkitCase }

const files = existsSync(EXPECTED_DIR) ? readdirSync(EXPECTED_DIR).filter((f) => f.endsWith('.json')).sort() : [];

describe('ICT Generic scores every Summary Scorecard line as the Empower toolkit does', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('has Excel-scored cases to check against', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of files) {
    it(file.replace(/\.json$/, ''), () => {
      const ex = JSON.parse(readFileSync(path.join(EXPECTED_DIR, file), 'utf8')) as Expected;
      const { lines, unrepresented } = compareIctGenericCase(file, ex.sampleCase, ex.cells, ex.tables);
      expect(unrepresented).toEqual([]);
      const diffs = lines.filter((l) => !l.ok).map((l) => `row ${l.row} ${l.label}: toolkit ${l.excel} vs ours ${l.ours}`);
      expect(diffs).toEqual([]);
    });
  }
});
