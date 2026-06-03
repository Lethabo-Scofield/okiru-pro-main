import {
  ESG_GOLDEN_SG_CONSUMER,
  ESG_PILLAR_MAX,
  esgScoresFromPillars,
  type EsgPillarScores,
} from "./esgScoringDefaults";
import type { EsgWorkbookData } from "./esgWorkbookStorage";
import { computeEsgScorecard } from "../../EsgToolkit/src/lib/calculators";

export function computeEsgScores(workbook: EsgWorkbookData | null): EsgPillarScores | null {
  const result = computeEsgScorecard(workbook);
  if (!result) return null;
  return esgScoresFromPillars(
    result.environmental.score,
    result.social.score,
    result.governance.score,
  );
}

export function formatEsgPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export { ESG_GOLDEN_SG_CONSUMER, ESG_PILLAR_MAX };
