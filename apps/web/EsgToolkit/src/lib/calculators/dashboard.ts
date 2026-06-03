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

const E_ENV_ROWS: { key: string; label: string; max: number }[] = [
  { key: "d5",  label: "GHG: Scope 1 baseline established & tracked",     max: 5  },
  { key: "d6",  label: "GHG: Scope 1 reduction vs prior year",             max: 10 },
  { key: "d7",  label: "GHG: Scope 2 net reduction (solar offset)",        max: 8  },
  { key: "d8",  label: "GHG: Scope 3 tracking initiated",                  max: 5  },
  { key: "d9",  label: "GHG: Net-zero target formally set (SBTi)",         max: 5  },
  { key: "d11", label: "Energy: kWh tracked monthly (all depots)",         max: 5  },
  { key: "d12", label: "Energy: efficiency improvement YoY",               max: 5  },
  { key: "d13", label: "Energy: ≥20% renewable electricity",               max: 8  },
  { key: "d15", label: "Fleet: L/100km within norm",                       max: 8  },
  { key: "d16", label: "Fleet: CO₂ per tonne-km tracked",                  max: 5  },
  { key: "d17", label: "Fleet: EV % of fleet",                             max: 5  },
  { key: "d19", label: "Waste: diversion rate ≥75%",                      max: 5  },
  { key: "d20", label: "Waste: cardboard recycling tracked (Cority)",      max: 4  },
  { key: "d21", label: "Waste: landfill tCO₂e tracked",                    max: 3  },
  { key: "d23", label: "Water: consumption tracked monthly",               max: 4  },
  { key: "d24", label: "Water: intensity (kL/unit) tracked",               max: 4  },
  { key: "d26", label: "ISO 14001: certified or on-track",                 max: 5  },
  { key: "d27", label: "ISO 45001 / H&S system",                          max: 5  },
  { key: "d28", label: "Supplier sustainability engagement",               max: 4  },
  { key: "d29", label: "Environmental penalties: zero",                    max: 3  },
];

const E_SOC_ROWS: { key: string; label: string; max: number }[] = [
  { key: "d5",  label: "EE: % Black employees (all levels) vs target",     max: 8  },
  { key: "d6",  label: "EE: % Black at senior/top management",             max: 5  },
  { key: "d7",  label: "EE: EE plan in place",                             max: 5  },
  { key: "d8",  label: "EE: % PWD employees vs 2% target",                 max: 5  },
  { key: "d9",  label: "EE: EE forum active",                              max: 3  },
  { key: "d10", label: "EE: Designated group oversight",                   max: 3  },
  { key: "d12", label: "Training: WSP submitted to SETA",                  max: 5  },
  { key: "d13", label: "Training: ATR submitted to SETA",                  max: 5  },
  { key: "d14", label: "Training: Hours per employee ≥40 hrs",             max: 5  },
  { key: "d15", label: "Training: Mandatory grant utilised",               max: 5  },
  { key: "d17", label: "H&S: LTIFR ≤ threshold",                          max: 8  },
  { key: "d18", label: "H&S: Zero fatalities",                             max: 8  },
  { key: "d19", label: "H&S: Driver debrief programme active",             max: 5  },
  { key: "d20", label: "H&S: Near-miss incidents reported",                max: 4  },
  { key: "d22", label: "H&S: Safety files active (all suppliers)",         max: 3  },
  { key: "d23", label: "Community: CSI initiatives ≥3",                    max: 5  },
  { key: "d24", label: "Community: SED spend vs threshold",                max: 5  },
  { key: "d26", label: "Social: Supplier code of conduct",                 max: 3  },
  { key: "d27", label: "Social: Labour law compliance",                    max: 3  },
];

const E_GOV_ROWS: { key: string; label: string; max: number }[] = [
  { key: "d5",  label: "King V: Overall scorecard (all 17 principles)",    max: 25 },
  { key: "d6",  label: "Governance: S&EC committee maturity",              max: 5  },
  { key: "d7",  label: "Governance: ESG linked to remuneration",           max: 5  },
  { key: "d9",  label: "IFRS S1/S2: Disclosure completeness",              max: 10 },
  { key: "d10", label: "Governance: Climate risk in risk register",        max: 5  },
  { key: "d12", label: "Governance: Risk register + climate risk",         max: 8  },
  { key: "d14", label: "Governance: Board members appointed",              max: 5  },
  { key: "d16", label: "Governance: POPIA Information Officer",            max: 5  },
  { key: "d17", label: "Governance: POPIA impact assessment",              max: 5  },
  { key: "d19", label: "Governance: Integrated report published",          max: 8  },
  { key: "d20", label: "Governance: External assurance of ESG report",     max: 5  },
  { key: "d22", label: "Governance: Ethics & anti-corruption training",    max: 4  },
  { key: "d24", label: "Governance: Risk register updated",                max: 5  },
  { key: "d25", label: "Governance: No regulatory penalties",              max: 5  },
];

function pillarRows(
  rows: Record<string, number>,
  defs: { key: string; label: string; max: number }[],
): EsgPillarRow[] {
  return defs.map(({ key, label, max }) => {
    const score = rows[key] ?? 0;
    return {
      indicator: label,
      actual: score.toFixed(1),
      target: String(max),
      maxPoints: max,
      score,
      achievementPct: max > 0 ? (score / max) * 100 : 0,
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
      environmental: pillarRows(e.rows, E_ENV_ROWS),
      social: pillarRows(s.rows, E_SOC_ROWS),
      governance: pillarRows(g.rows, E_GOV_ROWS),
    },
  };
}

function readNum(wb: EsgWorkbookData, section: string, ref: string): number | null {
  const raw = wb.sections?.[section]?.cells?.[ref];
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}
