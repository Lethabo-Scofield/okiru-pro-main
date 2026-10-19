/**
 * The AgriBEE Generic toolkit-parity gate that runs everywhere, Excel or not.
 *
 * docs/toolkits/parity/expected/agri_generic/*.json holds, for every synthetic
 * case Excel scored through the Empower AgriBEE Generic toolkit, the case itself
 * and the toolkit's Summary Scorecard with the cells and table columns the
 * referee reads (written by docs/toolkits/parity/export_agri_generic.py). Every
 * line our live scorecard produces must equal the toolkit's — or, where the
 * toolkit's own formula is faulty, what that formula evidently means
 * (lib/parity/toolkitParity.agri_generic.ts) — to the cent of a point, and so
 * must every element total, the grand total and both levels.
 *
 * Adding a case: generate it (gen_case_agri_generic.py), score it with
 * toolkit_oracle.py, export it (export_agri_generic.py).
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { calculateScorecard } from '../../store';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '../../sectors/agri-generic';
import { adaptAgriGenericCase, type ToolkitCase } from '../../../test/parity/caseAdapter.agri_generic';
import {
  AGRI_GENERIC_LINES, AGRI_GENERIC_TOTAL_ROWS, refereeAgriGeneric, summaryValue,
  type ToolkitSheets, type ToolkitTables,
} from '../../parity/toolkitParity.agri_generic';
import type { BreakdownLine, ScorecardResult } from '../../types';

const EXPECTED_DIR = path.resolve(__dirname, '../../../../../../../docs/toolkits/parity/expected/agri_generic');
const TOLERANCE = 0.005;

interface Expected { cells: ToolkitSheets; tables?: ToolkitTables; sampleCase: ToolkitCase }

const files = existsSync(EXPECTED_DIR) ? readdirSync(EXPECTED_DIR).filter((f) => f.endsWith('.json')).sort() : [];

describe('AgriBEE Generic scores every Summary Scorecard line as the Empower toolkit does', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('has Excel-scored cases to check against', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of files) {
    it(file.replace(/\.json$/, ''), () => {
      const ex = JSON.parse(readFileSync(path.join(EXPECTED_DIR, file), 'utf8')) as Expected;
      const { state } = adaptAgriGenericCase(ex.sampleCase);
      const result = calculateScorecard({
        ...state,
        scorecard: {} as ScorecardResult,
        calculatorConfig: AGRI_GENERIC_CALCULATOR_CONFIG,
      });
      const ref = refereeAgriGeneric(ex.cells, ex.tables);
      const diffs: string[] = [];
      for (const spec of AGRI_GENERIC_LINES) {
        const toolkit = ref.lines.get(spec.row)?.value ?? summaryValue(ex.cells, spec.row);
        const pillar = result[spec.pillar] as { subLines?: BreakdownLine[] } | undefined;
        const line = (pillar?.subLines ?? []).find((l) => spec.names.includes(l.name));
        const ours = line ? Number(line.score) : null;
        if (toolkit === null || ours === null || Math.abs(ours - toolkit) > TOLERANCE) {
          diffs.push(`row ${spec.row} ${spec.label}: toolkit ${toolkit} vs ours ${ours}`);
        }
      }
      for (const t of AGRI_GENERIC_TOTAL_ROWS) {
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
