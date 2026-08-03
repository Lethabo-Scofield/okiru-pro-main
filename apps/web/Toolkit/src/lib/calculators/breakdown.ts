/**
 * Breakdown adapters — turn each calculator's own sub-lines (and its EAP /
 * category detail) into the neutral BreakdownLine the scorecard carries.
 *
 * The point: the pillar breakdown shown in the UI must come from the SAME
 * calculator that produced the pillar score. calculateScorecard runs the right
 * calculator per sector and attaches its lines here; the page renders them
 * verbatim. Nothing is re-derived on the page, so a Transport score can never
 * be shown against RCOGP lines again.
 */
import type { BreakdownLine } from '../types';

/** A calculator sub-line — the shared shape every pillar calculator emits. */
export interface CalcSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
  isBonus?: boolean;
  note?: string;
}

export function toBreakdown(l: CalcSubLine): BreakdownLine {
  return { name: l.name, target: l.target, weighting: l.weighting, score: l.score, isBonus: l.isBonus, note: l.note };
}

export function toBreakdownLines(lines: CalcSubLine[] | undefined): BreakdownLine[] {
  return (lines ?? []).map(toBreakdown);
}

const GROUP_LABEL: Record<string, string> = {
  AM: 'African Male', CM: 'Coloured Male', IM: 'Indian Male', WM: 'White Male',
  AF: 'African Female', CF: 'Coloured Female', IF: 'Indian Female', WF: 'White Female',
};

export interface EapDetailCell { group: string; eapTarget: number; actual: number; count: number; totalInLevel: number; }

/**
 * Per-demographic effective-EAP detail rows (weighting 0 — informational, not
 * scored), rendered under the Management/EE breakdown. Moved off the page so the
 * detail is sourced from the scoring calculator's own eapBreakdowns.
 */
export function eapDetailRows(
  breakdowns: Record<string, EapDetailCell[]> | undefined,
  province?: string,
): BreakdownLine[] {
  if (!breakdowns) return [];
  const rows: BreakdownLine[] = [];
  for (const level of Object.keys(breakdowns)) {
    const cells = breakdowns[level] || [];
    if (!cells.some((c) => c.totalInLevel > 0)) continue;
    const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
    for (const c of cells) {
      if (c.eapTarget <= 0 && c.actual <= 0) continue;
      rows.push({
        name: `  EAP · ${levelLabel} · ${GROUP_LABEL[c.group] ?? c.group}`,
        target: `${(c.eapTarget * 100).toFixed(1)}%${province ? ` (${province})` : ' EAP'}`,
        weighting: 0,
        score: 0,
        note: `Actual ${(c.actual * 100).toFixed(1)}% (${c.count}/${c.totalInLevel})`,
      });
    }
  }
  return rows;
}

export interface SkillsCategoryCell {
  code: string | number; label: string; spend: number; cap?: number | null;
  capApplied: boolean; recognisedSpend: number;
}

/** Skills learning-programme category detail (weighting 0 — informational). */
export function skillsCategoryRows(categories: SkillsCategoryCell[] | undefined): BreakdownLine[] {
  return (categories ?? [])
    .filter((cb) => cb.spend > 0)
    .map((cb) => ({
      name: `  Cat ${cb.code}: ${cb.label}`,
      target: cb.cap ? `<=${(cb.cap * 100).toFixed(0)}% cap` : 'No cap',
      weighting: 0,
      score: 0,
      note: `${cb.label} spend R${cb.spend.toLocaleString()}${cb.capApplied ? ` → capped to R${cb.recognisedSpend.toLocaleString()} (${(cb.cap! * 100).toFixed(0)}% limit)` : ` → R${cb.recognisedSpend.toLocaleString()} recognised`}`,
    }));
}
