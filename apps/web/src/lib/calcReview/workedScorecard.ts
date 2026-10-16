/**
 * The worked scorecard behind the Calculation Review page.
 *
 * A sample company (synthetic, generated for the parity harness) is scored by
 * the LIVE calculator — the same calculateScorecard every client's scorecard
 * comes from — and every line is set beside the Empower toolkit's answer for
 * the same company, as Excel recalculated it, with the toolkit's own cells and
 * formulas. Nothing here is narrative: the arithmetic shown is the
 * calculator's own breakdown, and the toolkit side is the workbook's.
 *
 * Only scorecards whose toolkit has been checked line by line carry a worked
 * scorecard; today that is RCOGP Generic.
 */
import reference from './reference/rcogp-generic.json';
import { adaptToolkitCase, type ToolkitCase } from '@toolkit/test/parity/caseAdapter';
import { calculateScorecard } from '@toolkit/lib/store';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-generic';
import {
  RCOGP_GENERIC_LINES,
  RCOGP_GENERIC_TOTAL_ROWS,
  referee,
  summaryValue,
  type ToolkitSheets,
} from '@toolkit/lib/parity/toolkitParity';
import type { BreakdownLine, ScorecardResult } from '@toolkit/lib/types';

export interface ToolkitStep {
  cell: string;
  formula: string | null;
  value: unknown;
}

export type LineStatus = 'match' | 'differs' | 'missing';

export interface WorkedLine {
  /** Note anchor: the toolkit Summary Scorecard row, as indicator:line-<row>. */
  anchor: string;
  row: number;
  label: string;
  weighting: number;
  target?: string;
  bonus: boolean;
  ours: number | null;
  /** The calculator's own arithmetic for this line, when it writes one. */
  working?: string;
  toolkit: number | null;
  /** Why the referee value is not the cell as the toolkit shows it. */
  toolkitNote?: string;
  status: LineStatus;
  chain: ToolkitStep[];
}

export interface WorkedPillar {
  key: string;
  label: string;
  ours: number;
  toolkit: number | null;
  toolkitNote?: string;
  status: LineStatus;
  lines: WorkedLine[];
}

export interface WorkedLevel {
  ours: number;
  toolkit: number;
  note?: string;
  status: LineStatus;
}

export interface WorkedScorecard {
  sectorCode: string;
  scorecardType: string;
  pillars: WorkedPillar[];
  total: { ours: number; toolkit: number | null; status: LineStatus };
  achieved: WorkedLevel;
  discounted: WorkedLevel;
  sample: {
    employees: number;
    shareholders: number;
    suppliers: number;
    trainingRows: number;
    esdContributions: number;
    sedContributions: number;
    revenue: number;
    npat: number;
  };
}

const TOLERANCE = 0.005;

interface ReferenceFile {
  lines: Record<string, { label: string | null; weighting: number | null; chain: ToolkitStep[] }>;
  cells: ToolkitSheets;
  sampleCase: ToolkitCase;
}

function status(ours: number | null, toolkit: number | null): LineStatus {
  if (ours === null || toolkit === null) return 'missing';
  return Math.abs(ours - toolkit) <= TOLERANCE ? 'match' : 'differs';
}

function findLine(lines: BreakdownLine[] | undefined, names: string[]): BreakdownLine | undefined {
  return (lines ?? []).find((l) => names.includes(l.name));
}

/** True when this scorecard has a toolkit-checked worked scorecard. */
export function hasWorkedScorecard(sectorCode: string, scorecardType: string): boolean {
  return sectorCode === 'RCOGP' && scorecardType === 'Generic';
}

export function buildWorkedScorecard(): WorkedScorecard {
  const ref = reference as unknown as ReferenceFile;
  const { state } = adaptToolkitCase(ref.sampleCase);
  const result: ScorecardResult = calculateScorecard({
    ...state,
    scorecard: {} as ScorecardResult,
    calculatorConfig: RCOGP_GENERIC_CALCULATOR_CONFIG,
  });
  const verdict = referee(ref.cells);
  const toolkitAt = (row: number) => verdict.lines.get(row)?.value ?? summaryValue(ref.cells, row);

  const pillars: WorkedPillar[] = RCOGP_GENERIC_TOTAL_ROWS.filter((t) => t.pillar !== 'total').map((t) => {
    const pillarScore = result[t.pillar] as { score?: number; subLines?: BreakdownLine[] } | undefined;
    const lines = RCOGP_GENERIC_LINES.filter((l) => l.pillar === t.pillar).map((spec): WorkedLine => {
      const line = findLine(pillarScore?.subLines, spec.names);
      const toolkit = toolkitAt(spec.row);
      const ours = line ? Number(line.score) : null;
      const refLine = ref.lines[String(spec.row)];
      return {
        anchor: `indicator:line-${spec.row}`,
        row: spec.row,
        label: spec.label,
        weighting: Number(line?.weighting ?? refLine?.weighting ?? 0),
        target: line?.target,
        bonus: Boolean((line as { isBonus?: boolean } | undefined)?.isBonus),
        ours,
        working: line?.note,
        toolkit,
        toolkitNote: verdict.lines.get(spec.row)?.note,
        status: status(ours, toolkit),
        chain: refLine?.chain ?? [],
      };
    });
    const toolkit = toolkitAt(t.row);
    const ours = Number(pillarScore?.score ?? 0);
    return {
      key: String(t.pillar),
      label: t.label,
      ours,
      toolkit,
      toolkitNote: verdict.lines.get(t.row)?.note,
      status: status(ours, toolkit),
      lines,
    };
  });

  const totalToolkit = toolkitAt(69);
  const oursDiscounted = result.preYesDiscountedLevel ?? result.discountedLevel;
  const tables = ref.sampleCase.tables;
  return {
    sectorCode: 'RCOGP',
    scorecardType: 'Generic',
    pillars,
    total: { ours: result.total.score, toolkit: totalToolkit, status: status(result.total.score, totalToolkit) },
    achieved: {
      ours: result.achievedLevel,
      toolkit: verdict.achieved,
      note: verdict.achievedNote,
      status: result.achievedLevel === verdict.achieved ? 'match' : 'differs',
    },
    discounted: {
      ours: oursDiscounted,
      toolkit: verdict.discounted,
      note: verdict.discountedNote,
      status: oursDiscounted === verdict.discounted ? 'match' : 'differs',
    },
    sample: {
      employees: tables.tblMCData?.length ?? 0,
      shareholders: tables.tblOwnershipData?.length ?? 0,
      suppliers: tables.tblPPData?.length ?? 0,
      trainingRows: tables.tblSkillsData?.length ?? 0,
      esdContributions: tables.tblESDData?.length ?? 0,
      sedContributions: tables.tblSED?.length ?? 0,
      revenue: state.client.revenue,
      npat: state.client.npat,
    },
  };
}
