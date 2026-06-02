import {
  ESG_GOLDEN_SG_CONSUMER,
  ESG_PILLAR_MAX,
  esgLtifrPoints,
  esgScoresFromPillars,
  type EsgPillarScores,
} from "./esgScoringDefaults";
import { readEsgCell, type EsgWorkbookData } from "./esgWorkbookStorage";

/**
 * Phase 1 stub — reads saved pillar totals or golden fixture when cells empty.
 * Full E/S/G scorecard replication lands in Phase 2.
 */
export function computeEsgScores(workbook: EsgWorkbookData | null): EsgPillarScores | null {
  if (!workbook) return null;

  const e = readEsgCell(workbook, "e-data", "D30") ?? null;
  const s = readEsgCell(workbook, "s-data", "D28") ?? null;
  const g = readEsgCell(workbook, "g-data", "D26") ?? null;

  const ltifr = readEsgCell(workbook, "s-data", "G35");
  const hasAnyInput =
    e != null ||
    s != null ||
    g != null ||
    ltifr != null ||
    Object.values(workbook.sections ?? {}).some((sec) => Object.keys(sec.cells ?? {}).length > 0);

  if (!hasAnyInput) return null;

  const environmental = e ?? 0;
  let social = s ?? 0;
  const governance = g ?? 0;

  if (s == null && ltifr != null) {
    social = esgLtifrPoints(ltifr);
  }

  return esgScoresFromPillars(environmental, social, governance);
}

export function formatEsgPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export { ESG_GOLDEN_SG_CONSUMER, ESG_PILLAR_MAX };
