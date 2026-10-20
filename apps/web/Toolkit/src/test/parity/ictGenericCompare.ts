/**
 * ICT Generic parity: score one toolkit case with our live scorecard and
 * compare it, line by line, with the toolkit (as reworked by the referee where
 * a toolkit formula is defective). Shared by the live Excel harness and the
 * always-on gate, so both apply exactly the same comparison.
 */
import { calculateScorecard } from '../../lib/store';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '../../lib/sectors/ict-generic';
import {
  ICT_GENERIC_LINES, ICT_GENERIC_TOTAL_ROWS, ICT_GENERIC_LEVEL_ROWS, ictSummaryValue, refereeIctGeneric,
  esdDataRows, intendedEsdRowValue,
  type ToolkitSheets, type ToolkitTables,
} from '../../lib/parity/toolkitParity.ict_generic';
import { esdRecognisedValue } from '../../lib/calculators/esd-sed';
import type { BreakdownLine, ScorecardResult } from '../../lib/types';
import { adaptIctGenericCase, type ToolkitCase } from './caseAdapter.ict_generic';

export const ICT_TOLERANCE = 0.005;
/** Per-row ESD recognised amounts are rands: agree to the cent. */
export const ICT_RAND_TOLERANCE = 0.01;

export interface IctLineResult {
  caseId: string;
  row: string;
  label: string;
  excel: number | null;
  ours: number | null;
  diff: number | null;
  ok: boolean;
  note?: string;
}

export function compareIctGenericCase(
  caseId: string,
  kase: ToolkitCase,
  sheets: ToolkitSheets,
  tables: ToolkitTables | undefined,
): { lines: IctLineResult[]; unrepresented: string[] } {
  const { state, unrepresented } = adaptIctGenericCase(kase);
  const result = calculateScorecard({
    ...state,
    scorecard: {} as ScorecardResult,
    calculatorConfig: ICT_GENERIC_CALCULATOR_CONFIG,
  });
  const ref = refereeIctGeneric(sheets, tables);
  const out: IctLineResult[] = [];
  for (const spec of ICT_GENERIC_LINES) {
    const parts = spec.rows.map((r) => ref.lines.get(r)?.value ?? ictSummaryValue(sheets, r));
    const excel = parts.every((p) => p === null) ? null : parts.reduce<number>((a, p) => a + (p ?? 0), 0);
    const notes = spec.rows.map((r) => ref.lines.get(r)?.note).filter(Boolean);
    const pillar = result[spec.pillar] as { subLines?: BreakdownLine[] } | undefined;
    const line = (pillar?.subLines ?? []).find((l) => spec.names.includes(l.name));
    const ours = line ? Number(line.score) : null;
    // A line the toolkit leaves blank is the 0 we show.
    const diff = excel !== null && ours !== null ? ours - excel : null;
    const ok = diff !== null ? Math.abs(diff) <= ICT_TOLERANCE : (excel ?? 0) === 0 && (ours ?? 0) === 0;
    out.push({
      caseId, row: spec.rows.join('+'), label: spec.label, excel, ours, diff, ok,
      note: notes.length ? notes.join(' ') : line ? undefined : 'no matching line in our scorecard',
    });
  }
  for (const t of ICT_GENERIC_TOTAL_ROWS) {
    const fix = ref.lines.get(t.row);
    const excel = fix ? fix.value : ictSummaryValue(sheets, t.row);
    const ours = Number((result[t.pillar] as { score?: number } | undefined)?.score ?? NaN);
    const diff = excel !== null ? ours - excel : null;
    out.push({
      caseId, row: String(t.row), label: t.label.toUpperCase(), excel, ours, diff,
      ok: diff !== null && Math.abs(diff) <= ICT_TOLERANCE, note: fix?.note,
    });
  }
  // Each 'ESD Data' row's Recognised Amount against what our scorer
  // recognises for that row, so a computed factor (shorter payments, loans
  // below prime, lower dividends) is checked even when its element is
  // already at its maximum points.
  const esdRows = esdDataRows(tables);
  if (tables && esdRows.length !== state.esd.contributions.length) {
    out.push({
      caseId, row: 'ESD', label: 'ESD CONTRIBUTION COUNT', excel: esdRows.length, ours: state.esd.contributions.length,
      diff: state.esd.contributions.length - esdRows.length, ok: false,
      note: 'The toolkit table and our case hold a different number of ESD contributions, so rows cannot be paired.',
    });
  }
  esdRows.forEach((r, i) => {
    const contribution = state.esd.contributions[i];
    const intended = intendedEsdRowValue(r);
    const ours = contribution
      ? esdRecognisedValue(contribution, ICT_GENERIC_CALCULATOR_CONFIG, state.esd.measurementPeriodEnd)
      : null;
    const diff = ours !== null ? ours - intended.value : null;
    const type = String(r['Contribution Type'] ?? '');
    out.push({
      caseId,
      row: `ESD${i + 1}`,
      label: `ESD row ${i + 1}: ${String(r['Pillar'] ?? '')}, ${type.length > 48 ? `${type.slice(0, 47)}…` : type}`,
      excel: intended.value,
      ours,
      diff,
      ok: diff !== null && Math.abs(diff) <= ICT_RAND_TOLERANCE,
      note: intended.fault === 'minority'
        ? `Toolkit formula fault: a Supplier Development minority investment is recognised at 0 (duplicated blank table row); at 70%: ${intended.value.toFixed(2)}.`
        : intended.fault === 'negative'
          ? `Toolkit formula fault: prime less the actual rate has no floor; the toolkit recognises ${Number(r['Recognised Amount']).toFixed(2)}, at no less than 0: 0.00.`
          : contribution ? undefined : 'no matching contribution in our case',
    });
  });

  const oursDisc = result.preYesDiscountedLevel ?? result.discountedLevel;
  out.push({
    caseId, row: String(ICT_GENERIC_LEVEL_ROWS.achieved), label: 'ACHIEVED LEVEL', excel: ref.achieved,
    ours: result.achievedLevel, diff: result.achievedLevel - ref.achieved, ok: result.achievedLevel === ref.achieved, note: ref.achievedNote,
  });
  out.push({
    caseId, row: String(ICT_GENERIC_LEVEL_ROWS.discounted), label: 'DISCOUNTED LEVEL', excel: ref.discounted,
    ours: oursDisc, diff: oursDisc - ref.discounted, ok: oursDisc === ref.discounted, note: ref.discountedNote,
  });
  return { lines: out, unrepresented };
}
