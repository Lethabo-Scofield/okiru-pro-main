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
 * scorecard. Which ones those are, and each one's line map, case adapter and
 * referee, is the registry (./registry). This file is the one comparison
 * every one of them goes through — the same comparison its always-on parity
 * gate makes.
 */
import type { ToolkitCase, AdaptedCase } from '@toolkit/test/parity/caseAdapter';
import { calculateScorecard } from '@toolkit/lib/store';
import type {
  ParityPillarKey,
  RefereeResult,
  ToolkitSheets,
  ToolkitTables,
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
  /** Every Summary row the line adds up, where the toolkit splits it over two. */
  rows?: number[];
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

export interface ReferenceFile {
  lines: Record<string, { label: string | null; weighting: number | null; chain: ToolkitStep[] }>;
  cells: ToolkitSheets;
  tables?: ToolkitTables;
  sampleCase: ToolkitCase;
}

/** One toolkit line: the Summary row(s) it reads and our breakdown lines that score it. */
export interface WorkedLineSpec {
  rows: number[];
  pillar: ParityPillarKey;
  label: string;
  /** Our breakdown-line names that score this indicator (first match wins). */
  names: string[];
}

type AdaptedState = AdaptedCase['state'];
type CalculatorConfig = NonNullable<Parameters<typeof calculateScorecard>[0]['calculatorConfig']>;

/**
 * How one scorecard is worked: the case adapter, the calculator settings, the
 * line map and the referee — exactly what that scorecard's parity gate uses.
 */
export interface WorkedSpec {
  sectorCode: string;
  scorecardType: string;
  /** Prefixes every note anchor, where scorecards share a sector code and type (FSC). */
  anchorPrefix?: string;
  adapt: (c: ToolkitCase) => { state: AdaptedState };
  config: (state: AdaptedState) => CalculatorConfig;
  lines: (state: AdaptedState) => WorkedLineSpec[];
  totals: (state: AdaptedState) => Array<{ row: number; pillar: ParityPillarKey; label: string }>;
  referee: (cells: ToolkitSheets, tables?: ToolkitTables) => RefereeResult;
  summaryValue: (cells: ToolkitSheets, row: number) => number | null;
  /** Compare the line before the calculator rounds it to the cent (as the sector's gate does). */
  exact?: boolean;
}

function status(ours: number | null, toolkit: number | null): LineStatus {
  if (ours === null || toolkit === null) return 'missing';
  return Math.abs(ours - toolkit) <= TOLERANCE ? 'match' : 'differs';
}

/** A line the toolkit leaves blank and we score 0 (or do not show) is the same answer, as every gate holds. */
function lineStatus(ours: number | null, toolkit: number | null): LineStatus {
  if ((ours === null || toolkit === null) && (ours ?? 0) === 0 && (toolkit ?? 0) === 0) return 'match';
  return status(ours, toolkit);
}

function findLine(lines: BreakdownLine[] | undefined, names: string[]): BreakdownLine | undefined {
  return (lines ?? []).find((l) => names.includes(l.name));
}

/** The note anchor of a line: indicator:<prefix>line-<row>[-<row>…]. */
export function lineAnchor(rows: number[], prefix = ''): string {
  return `indicator:${prefix}line-${rows.join('-')}`;
}

/** Score the reference's sample company with the live calculator and set every line beside the toolkit's. */
export function workScorecard(spec: WorkedSpec, ref: ReferenceFile): WorkedScorecard {
  const { state } = spec.adapt(ref.sampleCase);
  const result: ScorecardResult = calculateScorecard({
    ...state,
    scorecard: {} as ScorecardResult,
    calculatorConfig: spec.config(state),
  });
  const verdict = spec.referee(ref.cells, ref.tables);
  const toolkitAt = (row: number) => verdict.lines.get(row)?.value ?? spec.summaryValue(ref.cells, row);
  const toolkitFor = (rows: number[]): number | null => {
    if (rows.length === 1) return toolkitAt(rows[0]);
    const parts = rows.map(toolkitAt);
    return parts.every((p) => p === null) ? null : parts.reduce<number>((a, p) => a + (p ?? 0), 0);
  };
  const prefix = spec.anchorPrefix ?? '';
  const lineSpecs = spec.lines(state);
  const totals = spec.totals(state);

  const pillars: WorkedPillar[] = totals
    .filter((t) => t.pillar !== 'total')
    .slice()
    .sort((a, b) => a.row - b.row)
    .map((t) => {
      const pillarScore = result[t.pillar] as { score?: number; subLines?: BreakdownLine[] } | undefined;
      const lines = lineSpecs.filter((l) => l.pillar === t.pillar).map((spec_): WorkedLine => {
        const line = findLine(pillarScore?.subLines, spec_.names);
        const toolkit = toolkitFor(spec_.rows);
        const ours = line ? Number(spec.exact ? (line.exactScore ?? line.score) : line.score) : null;
        const refLines = spec_.rows.map((r) => ref.lines[String(r)]);
        const refWeighting = refLines.some((l) => l?.weighting != null)
          ? refLines.reduce((a, l) => a + Number(l?.weighting ?? 0), 0)
          : undefined;
        const notes = spec_.rows.map((r) => verdict.lines.get(r)?.note).filter((n): n is string => Boolean(n));
        return {
          anchor: lineAnchor(spec_.rows, prefix),
          row: spec_.rows[0],
          ...(spec_.rows.length > 1 ? { rows: spec_.rows } : {}),
          label: spec_.label,
          weighting: Number(line?.weighting ?? refWeighting ?? 0),
          target: line?.target,
          bonus: Boolean((line as { isBonus?: boolean } | undefined)?.isBonus),
          ours,
          working: line?.note,
          toolkit,
          toolkitNote: notes.length ? notes.join(' ') : undefined,
          status: lineStatus(ours, toolkit),
          chain: refLines.flatMap((l) => l?.chain ?? []),
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

  const totalRow = totals.find((t) => t.pillar === 'total')?.row;
  const totalToolkit = totalRow === undefined ? null : toolkitAt(totalRow);
  const oursDiscounted = result.preYesDiscountedLevel ?? result.discountedLevel;
  const tables = ref.sampleCase.tables;
  return {
    sectorCode: spec.sectorCode,
    scorecardType: spec.scorecardType,
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
      // FSC keeps socio-economic development and consumer education in one table.
      sedContributions: (tables.tblSED ?? tables.tblSEDnCEData)?.length ?? 0,
      revenue: state.client.revenue,
      npat: state.client.npat,
    },
  };
}

/** Every line of a worked scorecard, element by element. */
export function workedLines(worked: WorkedScorecard): WorkedLine[] {
  return worked.pillars.flatMap((p) => p.lines);
}
