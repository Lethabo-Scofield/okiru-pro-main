import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { esgScoresFromPillars } from "@/lib/esgScoringDefaults";
import { computeEsgDashboard, type EsgDashboardKpis } from "./dashboard";
import { scoreEnvironmental } from "./environmental";
import { scoreGovernance } from "./governance";
import { scoreSocial } from "./social";

export type EsgScorecardResult = EsgDashboardKpis & {
  environmentalRows: Record<string, number>;
  socialRows: Record<string, number>;
  governanceRows: Record<string, number>;
};

export function computeEsgScorecard(workbook: EsgWorkbookData | null): EsgScorecardResult | null {
  if (!workbook) return null;
  const hasCells = Object.values(workbook.sections ?? {}).some(
    (s) => Object.keys(s.cells ?? {}).length > 0,
  );
  if (!hasCells) return null;

  const e = scoreEnvironmental(workbook);
  const s = scoreSocial(workbook);
  const g = scoreGovernance(workbook);
  const dash = computeEsgDashboard(workbook);
  const pillars = esgScoresFromPillars(e.score, s.score, g.score);

  return {
    ...dash,
    overallPercent: pillars.overallPercent,
    environmental: { ...dash.environmental, score: e.score },
    social: { ...dash.social, score: s.score },
    governance: { ...dash.governance, score: g.score },
    environmentalRows: e.rows,
    socialRows: s.rows,
    governanceRows: g.rows,
  };
}

export { computeCarbonTax } from "./carbonTax";
export { computeNetZeroRoadmap } from "./netZero";
export { computeBbbeeBridge } from "./bbbeeBridge";
export * from "./shared";
