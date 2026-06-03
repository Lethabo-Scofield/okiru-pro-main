import { esgOverallPercent } from "@/lib/esgScoringDefaults";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { scoreEnvironmental } from "./environmental";
import { scoreGovernance } from "./governance";
import { scoreSocial } from "./social";

export type EsgDashboardKpis = {
  environmental: { score: number; max: number; percent: number };
  social: { score: number; max: number; percent: number };
  governance: { score: number; max: number; percent: number };
  overallPercent: number;
  scope1Tco2e?: number;
  scope2Tco2e?: number;
};

export function computeEsgDashboard(workbook: EsgWorkbookData): EsgDashboardKpis {
  const e = scoreEnvironmental(workbook);
  const s = scoreSocial(workbook);
  const g = scoreGovernance(workbook);
  const overallPercent = esgOverallPercent(e.score, s.score, g.score);

  return {
    environmental: { score: e.score, max: e.max, percent: e.score / 100 },
    social: { score: s.score, max: s.max, percent: s.score / 100 },
    governance: { score: g.score, max: g.max, percent: g.score / 100 },
    overallPercent,
    scope1Tco2e:
      (workbook.sections?.["e-data"]?.cells?.["L75"] as number) ??
      undefined,
    scope2Tco2e:
      (workbook.sections?.["e-data"]?.cells?.["L82"] as number) ??
      undefined,
  };
}
