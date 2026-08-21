import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { esgScoresFromPillars } from "@/lib/esgScoringDefaults";
import { computeEsgDashboard, type EsgDashboardKpis } from "./dashboard";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { scoreEnvironmental } from "./environmental";
import { scoreGovernance } from "./governance";
import { scoreSocial } from "./social";

export type EsgScorecardResult = EsgDashboardKpis & {
  environmentalRows: Record<string, number>;
  socialRows: Record<string, number>;
  governanceRows: Record<string, number>;
};

export function computeEsgScorecard(rawWorkbook: EsgWorkbookData | null): EsgScorecardResult | null {
  if (!rawWorkbook) return null;
  const hasCells = Object.values(rawWorkbook.sections ?? {}).some(
    (s) => Object.keys(s.cells ?? {}).length > 0,
  );
  if (!hasCells) return null;

  // Derive the template's summary cells (E_Data L19/L46/L63, S_Data L12,
  // G_Data F5/F13.., …) from the raw grid inputs so manually-entered data
  // scores identically to an imported/fixture workbook (B-BBEE parity).
  const workbook = deriveEsgSummaryCells(rawWorkbook);

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

export { computeCarbonTax, type CarbonTaxResult } from "./carbonTax";
export {
  computeNetZeroRoadmap,
  netZeroReductionAt,
  type NetZeroLever,
  type NetZeroMilestone,
  type NetZeroRoadmapResult,
} from "./netZero";
export {
  computeBbbeeBridge,
  BBBEE_ELEMENT_WEIGHTS,
  type BbbeeBridgeResult,
  type BbbeeElement,
  type BbbeeElementId,
} from "./bbbeeBridge";
export { scoreEnvironmental } from "./environmental";
export { scoreSocial } from "./social";
export { scoreGovernance } from "./governance";
export * from "./shared";
