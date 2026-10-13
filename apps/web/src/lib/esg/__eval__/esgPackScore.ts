/**
 * Score a parser run's workbook placement against an answer key.
 *
 * The web half of the ESG answer-key gate (sprint task B1). The parser half
 * (`okiru-ai-parser/scripts/esg-pack-eval.ts`) turns an evidence pack into the
 * case an upload would return; `applyEsgParserResult` places that case into
 * workbook cells exactly as the upload screen does; this compares the cells
 * against the cells the pack's documents should have filled.
 *
 * The one number that matters is PLACED CORRECTLY: a cell holding the right
 * value. A wrong value in a cell is worse than an empty cell — it reads as
 * evidence — so wrong placements are listed first in every report.
 */
import type { EsgSectionPatches } from "@/components/esg/esgParserInjection";

/** One cell the evidence should fill, and with what. */
export interface EsgExpectedCell {
  section: string;
  cell: string;
  value: number | string | boolean;
  /** What the figure is, in plain words: "BLOEM fleet diesel, Mar-26 (litres)". */
  label: string;
  /** The document (and place in it) the value comes from. */
  source?: string;
  /** Absolute slack for a number; defaults to half a unit or 0.1%, whichever is larger. */
  tolerance?: number;
  /**
   * Leaving the cell empty is also right. For a stated zero, and for a TRAP —
   * a cell a careless reading fills with the wrong figure (the 597 L of road
   * diesel the client's dashboard books as generator fuel).
   */
  absentOk?: boolean;
}

export interface EsgCellVerdict {
  section: string;
  cell: string;
  label: string;
  expected: number | string | boolean;
  placed: unknown;
}

export interface EsgPackScore {
  expected: number;
  correct: number;
  /** Placed, but not the value the evidence states. */
  wrong: EsgCellVerdict[];
  /** Never placed. */
  missing: EsgCellVerdict[];
  /** Cells written that the key does not cover — neither credited nor penalised. */
  unscored: number;
  /** correct / expected, 0–1. */
  accuracy: number;
  /**
   * The cells that need a VALUE (not the ones where empty is also right), and
   * how many of those hold it. The honest headline: a run that writes nothing
   * still "gets" every cell that may be left empty.
   */
  values: { expected: number; correct: number };
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/[\s,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Whether a placed value is the expected one. */
export function matchesExpected(placed: unknown, expected: EsgExpectedCell): boolean {
  if (typeof expected.value === "number") {
    const got = numeric(placed);
    if (got === null) return false;
    const slack = expected.tolerance ?? Math.max(0.5, Math.abs(expected.value) * 0.001);
    return Math.abs(got - expected.value) <= slack;
  }
  if (typeof expected.value === "boolean") return placed === expected.value;
  return String(placed ?? "").trim().toLowerCase() === expected.value.trim().toLowerCase();
}

export function scoreEsgPlacement(patches: EsgSectionPatches, expected: readonly EsgExpectedCell[]): EsgPackScore {
  const wrong: EsgCellVerdict[] = [];
  const missing: EsgCellVerdict[] = [];
  let correct = 0;
  let valueCorrect = 0;
  const keyed = new Set<string>();

  for (const want of expected) {
    keyed.add(`${want.section}!${want.cell}`);
    const cells = patches[want.section]?.cells ?? {};
    const verdict: EsgCellVerdict = {
      section: want.section,
      cell: want.cell,
      label: want.label,
      expected: want.value,
      placed: cells[want.cell],
    };
    const absent = !(want.cell in cells) || cells[want.cell] === null || cells[want.cell] === "";
    if (absent) {
      if (want.absentOk) correct += 1;
      else missing.push(verdict);
    } else if (matchesExpected(cells[want.cell], want)) {
      correct += 1;
      if (!want.absentOk) valueCorrect += 1;
    } else wrong.push(verdict);
  }

  let unscored = 0;
  for (const [section, patch] of Object.entries(patches)) {
    for (const cell of Object.keys(patch?.cells ?? {})) {
      if (!keyed.has(`${section}!${cell}`)) unscored += 1;
    }
  }

  return {
    expected: expected.length,
    correct,
    wrong,
    missing,
    unscored,
    accuracy: expected.length ? correct / expected.length : 0,
    values: { expected: expected.filter((cell) => !cell.absentOk).length, correct: valueCorrect },
  };
}

/** The report a person reads: the score, then what is wrong, then what is missing. */
export function formatEsgPackScore(score: EsgPackScore, extra: Record<string, unknown> = {}): string {
  const lines = [
    `# ESG answer-key score`,
    ``,
    `Values placed correctly: **${score.values.correct} of ${score.values.expected}**`,
    `All cells right (incl. ${score.expected - score.values.expected} correctly left empty): ${score.correct} of ${score.expected} (${(score.accuracy * 100).toFixed(1)}%)`,
    `Wrong: ${score.wrong.length} · Missing: ${score.missing.length} · Cells written outside the key: ${score.unscored}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`),
    ``,
  ];
  if (score.wrong.length) {
    lines.push(`## Wrong (a wrong value reads as evidence — fix these first)`, ``);
    for (const v of score.wrong) lines.push(`- ${v.label} — ${v.section}!${v.cell}: placed ${JSON.stringify(v.placed)}, expected ${JSON.stringify(v.expected)}`);
    lines.push(``);
  }
  if (score.missing.length) {
    lines.push(`## Missing`, ``);
    for (const v of score.missing) lines.push(`- ${v.label} — ${v.section}!${v.cell}: expected ${JSON.stringify(v.expected)}`);
    lines.push(``);
  }
  return lines.join("\n");
}
