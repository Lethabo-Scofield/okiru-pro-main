import {
  SCORECARD_INDICATORS,
  type EsgScorecardIndicator,
  type EsgScorecardPillar,
} from "@/lib/esg/esgScorecardDefinitions";
import { esgOverallPercent } from "@/lib/esgScoringDefaults";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import type { EsgExclusion, EsgPillarResult } from "./esgApplicability";
import { computeCarbonTax } from "./carbonTax";
import { computeGhgInventory } from "./ghgInventory";
import { computeNetZeroRoadmap } from "./netZero";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
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

/**
 * A pillar as the dashboard and the report see it.
 *
 * `scoringDenominator` and `excluded` travel with the score because a total
 * that has moved needs to say why. An assurance provider asked to accept 25/95
 * will want to know what left the denominator, and the answer has to be on the
 * page rather than buried in a calculator.
 */
export type EsgDashboardPillar = {
  score: number;
  max: number;
  percent: number;
  scoringDenominator: number;
  excluded: EsgExclusion[];
};

export type EsgDashboardKpis = {
  environmental: EsgDashboardPillar;
  social: EsgDashboardPillar;
  governance: EsgDashboardPillar;
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

/** Project a scorer result into the shape the dashboard and report consume. */
function pillar(r: EsgPillarResult): EsgDashboardPillar {
  return {
    score: r.score,
    max: r.max,
    // Percent against what the company could actually be scored out of.
    percent: r.scoringDenominator > 0 ? r.score / r.scoringDenominator : 0,
    scoringDenominator: r.scoringDenominator,
    excluded: r.excluded,
  };
}

/** 0.911 or 91.1 → "91.1%": the waste register states diversion either way. */
function asPercentText(value: number): string {
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

/**
 * Every figure on the dashboard, from ONE derived workbook.
 *
 * The page used to hand this the raw workbook while the hero figures above it
 * came from the derived one, and the tiles read sheet cells that are not what
 * their labels say: "Scope 1 tCO₂e" showed E_Data!L75 — the litres of fleet
 * diesel — and "Scope 2 tCO₂e" L82, kilowatt-hours plus solar kilowatt-hours.
 * Tonnes now come from the GHG inventory (activity × factor), the LTIFR from the
 * derived per-million-hours figure, the net-zero gap from the roadmap, and the
 * pillar percentages against the same denominators as the overall score.
 * Deriving is idempotent, so a caller that already derived loses nothing.
 */
export function computeEsgDashboard(rawWorkbook: EsgWorkbookData): EsgDashboardKpis {
  const workbook = deriveEsgSummaryCells(rawWorkbook);
  const e = scoreEnvironmental(workbook);
  const s = scoreSocial(workbook);
  const g = scoreGovernance(workbook);
  const overallPercent = esgOverallPercent(e.score, s.score, g.score, {
    environmental: e.scoringDenominator,
    social: s.scoringDenominator,
    governance: g.scoringDenominator,
  });
  const tax = computeCarbonTax(workbook);

  const ghg = computeGhgInventory(workbook);
  const scope1 = ghg.hasData ? ghg.scope1 : undefined;
  const scope2 = ghg.hasData ? ghg.scope2 : undefined;
  const water = readNum(workbook, "e-data", "L63") ?? undefined;
  const wasteDiv = readNum(workbook, "waste", "B16") ?? undefined;
  // G35 as the derive layer forces it: lost-time injuries per 1,000,000 hours.
  const ltifr = readNum(workbook, "s-data", "G35") ?? undefined;
  const netZero = computeNetZeroRoadmap(workbook);
  const pct = (p: EsgDashboardPillar) => `${(p.percent * 100).toFixed(1)}%`;
  const ePillar = pillar(e);
  const sPillar = pillar(s);
  const gPillar = pillar(g);

  const kpis: EsgDashboardKpi[] = [
    { id: "overall", label: "Overall ESG", value: `${(overallPercent * 100).toFixed(1)}%` },
    { id: "e-score", label: "Environmental", value: `${e.score.toFixed(1)} / ${e.max}` },
    { id: "s-score", label: "Social", value: `${s.score.toFixed(1)} / ${s.max}` },
    { id: "g-score", label: "Governance", value: `${g.score.toFixed(1)} / ${g.max}` },
    {
      id: "scope1",
      label: "Scope 1 tCO₂e (YTD)",
      value: scope1 != null ? scope1.toLocaleString("en-ZA", { maximumFractionDigits: 1 }) : "—",
      sub: scope1 != null ? "Fuel, generators, LPG and business cars × their factors" : undefined,
    },
    {
      id: "scope2",
      label: "Scope 2 tCO₂e (YTD)",
      value: scope2 != null ? scope2.toLocaleString("en-ZA", { maximumFractionDigits: 1 }) : "—",
      sub: scope2 != null ? "Grid electricity, net of solar, location-based" : undefined,
    },
    {
      id: "water",
      label: "Water kL YTD",
      value: water != null ? water.toLocaleString("en-ZA", { maximumFractionDigits: 0 }) : "—",
    },
    {
      id: "waste",
      label: "Waste diversion %",
      value: wasteDiv != null ? asPercentText(wasteDiv) : "—",
    },
    {
      id: "ltifr",
      label: "LTIFR",
      value: ltifr != null ? ltifr.toLocaleString("en-ZA", { maximumFractionDigits: 2 }) : "—",
      sub: ltifr != null ? "Lost-time injuries per 1,000,000 hours worked" : undefined,
    },
    {
      id: "carbon-tax",
      label: "Carbon tax",
      // Most companies this toolkit serves are not carbon taxpayers at all, so
      // the KPI says so rather than showing a rand figure the Act does not
      // support. The Schedule 2 screen lives in `carbonTax.ts`.
      value: tax.screenIncomplete
        ? "Not assessed"
        : tax.liable
          ? `R ${Math.round(tax.liabilityZar).toLocaleString("en-ZA")}`
          : "Not liable",
      sub: tax.screenIncomplete
        ? "Schedule 2 screen unanswered"
        : tax.liable
          ? `${Math.round(tax.taxableTco2e).toLocaleString("en-ZA")} tCO₂e taxable at R${tax.rateZar}/t`
          : "No Schedule 2 activity",
    },
    {
      id: "nz-gap",
      label: "Net-zero gap tCO₂e",
      // The roadmap's own gap: this period's Scope 1 + 2 tonnes against the
      // final milestone of the company's pathway — not F90 − B90, which
      // subtracted a baseline in tonnes from litres plus kilowatt-hours.
      value: netZero.available ? netZero.gapTco2e.toLocaleString("en-ZA", { maximumFractionDigits: 1 }) : "—",
      sub: netZero.available ? `Against the ${netZero.targetYear || "final"} milestone` : "Set a baseline to measure the gap",
    },
    {
      id: "rating-e",
      label: "E pillar %",
      value: pct(ePillar),
    },
    {
      id: "rating-s",
      label: "S pillar %",
      value: pct(sPillar),
    },
    {
      id: "rating-g",
      label: "G pillar %",
      value: pct(gPillar),
    },
  ];

  return {
    environmental: ePillar,
    social: sPillar,
    governance: gPillar,
    overallPercent,
    scope1Tco2e: scope1,
    scope2Tco2e: scope2,
    waterKl: water,
    wasteDiversionPct: wasteDiv,
    ltifr,
    carbonTaxTier1: tax.liable ? tax.liabilityZar : 0,
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
