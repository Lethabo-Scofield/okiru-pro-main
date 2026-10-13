import {
  ESG_GOLDEN_SG_CONSUMER,
  ESG_PILLAR_MAX,
  esgScoresFromPillars,
  type EsgPillarScores,
} from "./esgScoringDefaults";
import type { EsgWorkbookData } from "./esgWorkbookStorage";
import { computeEsgScorecard } from "../../../EsgToolkit/src/lib/calculators";

export function computeEsgScores(workbook: EsgWorkbookData | null): EsgPillarScores | null {
  const result = computeEsgScorecard(workbook);
  if (!result) return null;
  // Against the same denominators as the scorecard's own overall — what each
  // pillar can actually reach after exclusions — not a flat 100, which gave
  // the summary page a different percentage from the dashboard for the same
  // company.
  return esgScoresFromPillars(
    result.environmental.score,
    result.social.score,
    result.governance.score,
    {
      environmental: result.environmental.scoringDenominator,
      social: result.social.scoringDenominator,
      governance: result.governance.scoringDenominator,
    },
  );
}

export function formatEsgPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export { ESG_GOLDEN_SG_CONSUMER, ESG_PILLAR_MAX };
