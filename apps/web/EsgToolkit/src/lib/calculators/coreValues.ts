/**
 * The core values a client signs off, on one panel (E4) — each with its chain
 * from the source documents to the result.
 *
 * The chain has four links: the documents that filled the inputs (from the
 * workbook's provenance records), the inputs themselves, the rule that combines
 * them, and the result. Seven of the ten values are dashboard headlines and
 * take their rule and inputs from the headline's own calculation, so the panel
 * and the tiles cannot disagree; the other three are worked out here the same
 * way.
 */
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { readEsgCell } from "@/lib/esgWorkbookStorage";
import { sourcesFor, type EsgSourceDocument } from "@/lib/esg/esgProvenance";
import { computeEsgDashboard } from "./dashboard";
import { computeGhgInventory } from "./ghgInventory";
import { computeEsgIntensity } from "./esgIntensity";
import { cell as traceCell, type EsgTraceInput } from "./esgTrace";

export interface EsgCoreValue {
  id: string;
  label: string;
  /** The result as the reader sees it; "—" when there is none yet. */
  value: string;
  rule: string;
  inputs: EsgTraceInput[];
  /** The documents behind the inputs, largest first. Empty when typed or imported. */
  sources: EsgSourceDocument[];
  /** When there is no result yet, what is needed for one. */
  missing?: string;
}

type Match = { section: string; prefix?: string; cells?: readonly string[] };

/** The monthly grids each emission scope is read from. */
const SCOPE1: Match[] = ["s1a_", "s1b_", "s1c_", "s1d_"].map((prefix) => ({ section: "e-data", prefix }));
const SCOPE2: Match[] = ["s2_", "solar_"].map((prefix) => ({ section: "e-data", prefix }));
const WATER: Match[] = [{ section: "e-data", prefix: "water_" }];
const INJURIES: Match[] = [{ section: "s-data", cells: ["C27", "D27", "E27", "F27", "C29", "D29", "E29", "F29"] }];

const za = (n: number, digits = 1) => n.toLocaleString("en-ZA", { maximumFractionDigits: digits });

export function computeEsgCoreValues(rawWorkbook: EsgWorkbookData): EsgCoreValue[] {
  const workbook = deriveEsgSummaryCells(rawWorkbook);
  const dash = computeEsgDashboard(rawWorkbook);
  const ghg = computeGhgInventory(workbook);
  const intensity = computeEsgIntensity(workbook);
  const sources = (matches: Match[]) => sourcesFor(rawWorkbook, matches);

  const fromHeadline = (id: string, label: string, matches: Match[], missing: string): EsgCoreValue => {
    const k = dash.kpis.find((x) => x.id === id);
    const value = k?.value ?? "—";
    return {
      id,
      label,
      value,
      rule: k?.calc?.rule ?? "",
      inputs: k?.calc?.inputs ?? [],
      sources: sources(matches),
      ...(value === "—" ? { missing } : {}),
    };
  };

  const scope3Lines = ghg.lines.filter((l) => l.scope === 3);
  const grid = readEsgCell(workbook, "e-data", "L46") ?? 0;
  const solar = ["L50", "L51", "L52", "L53", "L54"].reduce((a, ref) => a + (readEsgCell(workbook, "e-data", ref) ?? 0), 0);
  const ratio = intensity.revenue.value != null ? intensity.revenue : intensity.perEmployee;

  return [
    fromHeadline("scope1", "Scope 1 (tCO₂e)", SCOPE1, "Monthly fuel use — fleet and generator diesel, LPG, business-car petrol."),
    fromHeadline("scope2", "Scope 2 net (tCO₂e)", SCOPE2, "Monthly grid electricity by site (and solar generation, if any)."),
    {
      id: "scope3",
      label: "Scope 3 (tCO₂e)",
      value: ghg.hasData ? za(ghg.scope3) : "—",
      rule: "Water used × the water-supply emission factor. Only water is counted in Scope 3 so far; the other categories wait for a materiality screen.",
      inputs: scope3Lines.map((l) => ({
        ref: l.label,
        label: `${za(l.activity, 0)} ${l.unit} × ${l.factor} ${l.factorUnit}`,
        value: Math.round(l.tco2e * 1000) / 1000,
      })),
      sources: sources(WATER),
      ...(ghg.hasData ? {} : { missing: "Monthly water use by site." }),
    },
    {
      id: "intensity",
      label: "Emissions intensity",
      value: ratio.value != null ? `${za(ratio.value, 2)} ${ratio.unit}` : "—",
      rule: "Scope 1 + 2 tonnes ÷ revenue in R million — the ratio lenders and tender evaluators ask for first — or, without revenue, ÷ headcount.",
      inputs: [
        { ref: "GHG inventory", label: "Scope 1 + 2 (tCO₂e)", value: Math.round(intensity.scope1And2Tco2e * 10) / 10 },
        traceCell("Assumptions", "_revenueZar", "Revenue for the period (R)", readEsgCell(workbook, "assumptions", "_revenueZar")),
        traceCell("S_Data", "L12", "Headcount", readEsgCell(workbook, "s-data", "L12")),
      ],
      sources: sources([...SCOPE1, ...SCOPE2]),
      ...(ratio.value == null ? { missing: intensity.revenue.unavailableReason || intensity.perEmployee.unavailableReason } : {}),
    },
    fromHeadline("carbon-tax", "Carbon tax (R)", SCOPE1, "The three Schedule 2 screening questions, then the fuel lines."),
    fromHeadline("nz-gap", "Net-zero gap (tCO₂e)", [...SCOPE1, ...SCOPE2, { section: "e-data", cells: ["B90"] }], "A Scope 1 + 2 baseline in tCO₂e."),
    fromHeadline("overall", "Overall ESG %", [{ section: "*" }], "Any scored inputs."),
    fromHeadline("waste", "Waste diversion %", [{ section: "waste" }], "The waste contractor's diversion rate, or the waste register."),
    fromHeadline("ltifr", "LTIFR", INJURIES, "Hours worked and lost-time injuries, by quarter."),
    {
      id: "renewable",
      label: "Renewable share %",
      value: grid > 0 ? `${za((solar / grid) * 100)}%` : "—",
      rule: "Solar generation ÷ grid electricity use, over the period.",
      inputs: [
        traceCell("E_Data", "L50:L54", "Solar generation (kWh, all sites)", solar),
        traceCell("E_Data", "L46", "Grid electricity (kWh, all sites)", grid),
      ],
      sources: sources(SCOPE2),
      ...(grid > 0 ? {} : { missing: "Monthly grid electricity by site." }),
    },
  ];
}
