import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { esgScoresFromPillars } from "@/lib/esgScoringDefaults";
import { computeEsgDashboard, type EsgDashboardKpis } from "./dashboard";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { scoreEnvironmental } from "./environmental";
import { scoreGovernance } from "./governance";
import { scoreSocial } from "./social";
import { EsgTraceRecorder, type EsgPillarTraces } from "./esgTrace";
import type { EsgExclusion } from "./esgApplicability";

type EsgPillarKey = "environmental" | "social" | "governance";

export type EsgScorecardResult = EsgDashboardKpis & {
  environmentalRows: Record<string, number>;
  socialRows: Record<string, number>;
  governanceRows: Record<string, number>;
  /** How each row was made — measured, target and its source, inputs, rule (E2). */
  traces: Record<EsgPillarKey, EsgPillarTraces>;
  /** The rows that left the total, each with its reason. */
  excluded: Record<EsgPillarKey, EsgExclusion[]>;
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

  // One recorder per pillar: indicator keys repeat across pillars (E d5, S d5).
  const traces = {
    environmental: new EsgTraceRecorder(),
    social: new EsgTraceRecorder(),
    governance: new EsgTraceRecorder(),
  };
  const e = scoreEnvironmental(workbook, { trace: traces.environmental });
  const s = scoreSocial(workbook, { trace: traces.social });
  const g = scoreGovernance(workbook, { trace: traces.governance });
  const dash = computeEsgDashboard(workbook);
  const pillars = esgScoresFromPillars(e.score, s.score, g.score, {
    environmental: e.scoringDenominator,
    social: s.scoringDenominator,
    governance: g.scoringDenominator,
  });

  return {
    ...dash,
    overallPercent: pillars.overallPercent,
    environmental: { ...dash.environmental, score: e.score },
    social: { ...dash.social, score: s.score },
    governance: { ...dash.governance, score: g.score },
    environmentalRows: e.rows,
    socialRows: s.rows,
    governanceRows: g.rows,
    traces: {
      environmental: traces.environmental.traces,
      social: traces.social.traces,
      governance: traces.governance.traces,
    },
    excluded: { environmental: e.excluded, social: s.excluded, governance: g.excluded },
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
export {
  computeGhgInventory,
  type GhgInventoryResult,
  type GhgLine,
} from "./ghgInventory";
export {
  computeEsgIntensity,
  type EsgIntensityRatio,
  type EsgIntensityResult,
} from "./esgIntensity";
export {
  readTargetBasis,
  type EsgTargetBasis,
  ESG_TARGET_BASIS_OPTIONS,
} from "./esgTargets";
export {
  type EsgExclusion,
  type EsgPillarResult,
} from "./esgApplicability";
export { scoreEnvironmental } from "./environmental";
export { scoreSocial } from "./social";
export { scoreGovernance } from "./governance";
export * from "./shared";
