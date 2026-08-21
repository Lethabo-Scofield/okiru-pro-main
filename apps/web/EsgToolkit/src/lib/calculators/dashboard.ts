import {
  SCORECARD_INDICATORS,
  type EsgScorecardIndicator,
  type EsgScorecardPillar,
} from "@/lib/esg/esgScorecardDefinitions";
import { esgOverallPercent } from "@/lib/esgScoringDefaults";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeCarbonTax } from "./carbonTax";
import { scoreEnvironmental } from "./environmental";
import { scoreGovernance } from "./governance";
import { scoreSocial } from "./social";

export type EsgDashboardKpi = {
  id: string;
  label: string;
  value: string;
  sub?: string;
};

export type EsgPillarRow = {
  indicator: string;
  actual: string;
  target: string;
  maxPoints: number;
  score: number;
  achievementPct: number;
};

export type EsgDashboardKpis = {
  environmental: { score: number; max: number; percent: number };
  social: { score: number; max: number; percent: number };
  governance: { score: number; max: number; percent: number };
  overallPercent: number;
  scope1Tco2e?: number;
  scope2Tco2e?: number;
  waterKl?: number;
  wasteDiversionPct?: number;
  ltifr?: number | string;
  carbonTaxTier1?: number;
  kpis: EsgDashboardKpi[];
  pillarRows: {
    environmental: EsgPillarRow[];
    social: EsgPillarRow[];
    governance: EsgPillarRow[];
  };
};

/**
 * Dashboard pillar rows are projected straight from the indicator ledger in
 * `@/lib/esg/esgScorecardDefinitions` — the single source of truth, transcribed
 * from `<Pillar>_Scorecard!A{row}` (label) and `!B{row}` (max points).
 *
 * This module used to carry its own hand-typed copy of that table. It had
 * drifted: E summed to 106 instead of 108 and S to 93 instead of 100 (d24, d26,
 * d27, d29 in E and d6, d22, d26, d27 in S all carried wrong maxima), and its
 * labels had diverged too, so the same indicator showed a different "Max Pts"
 * and "% Achieved" on the Dashboard than on the pillar Scorecard page. Deriving
 * removes the whole class of defect — do not reintroduce a local table.
 */
function pillarRows(
  rows: Record<string, number>,
  pillar: EsgScorecardPillar,
): EsgPillarRow[] {
  const defs: readonly EsgScorecardIndicator[] = SCORECARD_INDICATORS[pillar];
  return defs.map(({ key, indicator, maxPoints }) => {
    const score = rows[key] ?? 0;
    return {
      indicator,
      actual: score.toFixed(1),
      target: String(maxPoints),
      maxPoints,
      score,
      achievementPct: maxPoints > 0 ? (score / maxPoints) * 100 : 0,
    };
  });
}

export function computeEsgDashboard(workbook: EsgWorkbookData): EsgDashboardKpis {
  const e = scoreEnvironmental(workbook);
  const s = scoreSocial(workbook);
  const g = scoreGovernance(workbook);
  const overallPercent = esgOverallPercent(e.score, s.score, g.score);
  const tax = computeCarbonTax(workbook);

  const scope1 = (workbook.sections?.["e-data"]?.cells?.["L75"] as number) ?? undefined;
  const scope2 = (workbook.sections?.["e-data"]?.cells?.["L82"] as number) ?? undefined;
  const water = (workbook.sections?.["e-data"]?.cells?.["L63"] as number) ?? undefined;
  const wasteDiv = (workbook.sections?.waste?.cells?.["B16"] as number) ?? undefined;
  const ltifr = workbook.sections?.["s-data"]?.cells?.["G35"];

  const kpis: EsgDashboardKpi[] = [
    { id: "overall", label: "Overall ESG", value: `${(overallPercent * 100).toFixed(1)}%` },
    { id: "e-score", label: "Environmental", value: `${e.score.toFixed(1)} / ${e.max}` },
    { id: "s-score", label: "Social", value: `${s.score.toFixed(1)} / ${s.max}` },
    { id: "g-score", label: "Governance", value: `${g.score.toFixed(1)} / ${g.max}` },
    {
      id: "scope1",
      label: "Scope 1 tCO₂e (YTD)",
      value: scope1 != null ? scope1.toLocaleString("en-ZA") : "—",
    },
    {
      id: "scope2",
      label: "Scope 2 tCO₂e (YTD)",
      value: scope2 != null ? scope2.toLocaleString("en-ZA") : "—",
    },
    {
      id: "water",
      label: "Water kL YTD",
      value: water != null ? water.toLocaleString("en-ZA") : "—",
    },
    {
      id: "waste",
      label: "Waste diversion %",
      value: wasteDiv != null ? `${wasteDiv}%` : "—",
    },
    {
      id: "ltifr",
      label: "LTIFR",
      value: ltifr != null && ltifr !== "" ? String(ltifr) : "—",
    },
    {
      id: "carbon-tax",
      label: "Carbon tax (Tier 1)",
      value: `R ${Math.round(tax.tier1Liability).toLocaleString("en-ZA")}`,
      sub: `${Math.round(tax.taxableTco2e).toLocaleString("en-ZA")} tCO₂e taxable`,
    },
    {
      id: "nz-gap",
      label: "Net-zero gap tCO₂e",
      value: String(
        Math.max(
          0,
          (readNum(workbook, "e-data", "F90") ?? 0) - (readNum(workbook, "e-data", "B90") ?? 0),
        ),
      ),
    },
    {
      id: "rating-e",
      label: "E pillar %",
      value: `${((e.score / e.max) * 100).toFixed(1)}%`,
    },
    {
      id: "rating-s",
      label: "S pillar %",
      value: `${((s.score / s.max) * 100).toFixed(1)}%`,
    },
    {
      id: "rating-g",
      label: "G pillar %",
      value: `${((g.score / g.max) * 100).toFixed(1)}%`,
    },
  ];

  return {
    environmental: { score: e.score, max: e.max, percent: e.score / e.max },
    social: { score: s.score, max: s.max, percent: s.score / s.max },
    governance: { score: g.score, max: g.max, percent: g.score / g.max },
    overallPercent,
    scope1Tco2e: scope1,
    scope2Tco2e: scope2,
    waterKl: water,
    wasteDiversionPct: wasteDiv,
    ltifr: ltifr as number | string | undefined,
    carbonTaxTier1: tax.tier1Liability,
    kpis,
    pillarRows: {
      environmental: pillarRows(e.rows, "environmental"),
      social: pillarRows(s.rows, "social"),
      governance: pillarRows(g.rows, "governance"),
    },
  };
}

function readNum(wb: EsgWorkbookData, section: string, ref: string): number | null {
  const raw = wb.sections?.[section]?.cells?.[ref];
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}
