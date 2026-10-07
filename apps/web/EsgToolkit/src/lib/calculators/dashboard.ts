import {
  SCORECARD_INDICATORS,
  esgIndicatorLabel,
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
import { cell as traceCell, type EsgTraceInput } from "./esgTrace";

export type EsgDashboardKpi = {
  id: string;
  label: string;
  value: string;
  sub?: string;
  /** How the headline was made (E2): the rule in words and what went into it. */
  calc?: { rule: string; inputs: EsgTraceInput[] };
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
  return defs.map(({ key, maxPoints }) => {
    const indicator = esgIndicatorLabel(pillar, key);
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

  /* ---------------- How each headline was made (E2, E3 tiles) ---------------- */
  // Read off the same results the tiles print, so a tile and its explanation
  // cannot disagree.
  const za = (n: number, digits = 1) => n.toLocaleString("en-ZA", { maximumFractionDigits: digits });
  const pillarCalc = (name: string, p: EsgPillarResult) => ({
    rule: `The sum of the ${name} rows — open the scorecard for how each one was scored. A row left out of the total also leaves the points it is scored out of, so this score is read against ${za(p.scoringDenominator)}, not ${p.max}.`,
    inputs: [
      { ref: `${name} scorecard`, label: "Points scored", value: Math.round(p.score * 10) / 10 },
      { ref: `${name} scorecard`, label: "Points it can reach after exclusions", value: p.scoringDenominator },
      { ref: `${name} scorecard`, label: "Rows left out of the total", value: p.excluded.length },
    ],
  });
  const ghgCalc = (scope: 1 | 2) => ({
    rule:
      scope === 1
        ? "Each fuel's quantity for the period × its emission factor, summed."
        : "Grid electricity × the grid emission factor, less the electricity solar replaced — location-based.",
    inputs: ghg.lines
      .filter((l) => l.scope === scope)
      .map((l) => ({
        ref: l.label,
        label: `${za(l.activity, 0)} ${l.unit} × ${l.factor} ${l.factorUnit}`,
        value: Math.round(l.tco2e * 100) / 100,
      })),
  });
  const quarters = (row: number) =>
    ["C", "D", "E", "F"].reduce((a, col) => a + (readNum(workbook, "s-data", `${col}${row}`) ?? 0), 0);
  const finalMilestone = netZero.milestones[netZero.milestones.length - 1];
  const calcs: Record<string, EsgDashboardKpi["calc"]> = {
    overall: {
      rule: "The average of the three pillars' percentages, weighted equally. Each pillar is scored out of the points it can reach once the rows left out of its total are removed.",
      inputs: [
        { ref: "Environmental", label: `${za(e.score)} of ${za(e.scoringDenominator)}`, value: `${za(ePillar.percent * 100)}%` },
        { ref: "Social", label: `${za(s.score)} of ${za(s.scoringDenominator)}`, value: `${za(sPillar.percent * 100)}%` },
        { ref: "Governance", label: `${za(g.score)} of ${za(g.scoringDenominator)}`, value: `${za(gPillar.percent * 100)}%` },
      ],
    },
    "e-score": pillarCalc("Environmental", e),
    "s-score": pillarCalc("Social", s),
    "g-score": pillarCalc("Governance", g),
    "rating-e": pillarCalc("Environmental", e),
    "rating-s": pillarCalc("Social", s),
    "rating-g": pillarCalc("Governance", g),
    scope1: ghg.hasData ? ghgCalc(1) : undefined,
    scope2: ghg.hasData ? ghgCalc(2) : undefined,
    water: {
      rule: "The period's metered water across all sites.",
      inputs: [traceCell("E_Data", "L63", "Water — kilolitres, period total", water ?? null)],
    },
    waste: {
      rule: "The share of the waste generated that was diverted from landfill.",
      inputs: [traceCell("Waste_Register", "B16", "Waste diverted (share)", wasteDiv ?? null)],
    },
    ltifr: {
      rule: "Lost-time injuries × 1,000,000 ÷ hours worked — the South African convention.",
      inputs: [
        traceCell("S_Data", "C29:F29", "Lost-time injuries, four quarters", quarters(29)),
        traceCell("S_Data", "C27:F27", "Hours worked, four quarters", quarters(27)),
        traceCell("S_Data", "G35", "LTIFR", ltifr ?? null),
      ],
    },
    "carbon-tax": tax.screenIncomplete
      ? {
          rule: "Liability is decided by activity, not by emissions: the Schedule 2 screening questions (stationary combustion of 10 MW(th) or more, a listed industrial process, fugitive emissions) are not all answered, so nothing is assessed yet.",
          inputs: [],
        }
      : tax.liable
        ? {
            rule: `The taxable tonnes from Schedule 2 activities × the rate for the tax year (R${tax.rateZar} a tonne).`,
            inputs: [
              { ref: "Carbon tax", label: "Taxable tCO₂e", value: Math.round(tax.taxableTco2e) },
              { ref: "Carbon tax", label: "Rate (R per tonne)", value: tax.rateZar },
              { ref: "Carbon tax", label: "Liability (R)", value: Math.round(tax.liabilityZar) },
            ],
          }
        : {
            rule: "No Schedule 2 activity applies, so the company is not a carbon taxpayer and has nothing to file. Road transport cannot create liability on its own — the fuel levy already prices it.",
            inputs: [],
          },
    "nz-gap": netZero.available
      ? {
          rule: `This period's Scope 1 + 2 tonnes less the target at the final milestone (${finalMilestone?.year ?? netZero.targetYear}) of ${netZero.pathwayIsOwn ? "the company's own pathway" : "the template pathway — the company has not set its own yet"}.`,
          inputs: [
            { ref: "GHG inventory", label: "This period's Scope 1 + 2 (tCO₂e)", value: Math.round(netZero.currentTco2e * 10) / 10 },
            { ref: "Net-zero roadmap", label: "Target at the final milestone (tCO₂e)", value: Math.round((finalMilestone?.targetTco2e ?? 0) * 10) / 10 },
            traceCell("E_Data", "B90", "Baseline (tCO₂e)", netZero.baselineTco2e),
          ],
        }
      : { rule: "No baseline is set (E_Data B90), so there is nothing to measure a gap against.", inputs: [] },
  };
  for (const k of kpis) {
    const calc = calcs[k.id];
    if (calc) k.calc = calc;
  }

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
