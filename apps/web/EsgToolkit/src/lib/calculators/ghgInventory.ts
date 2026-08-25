/**
 * The GHG inventory — the company's actual emissions, in tonnes of CO₂e.
 *
 * WHY THIS DID NOT EXIST, AND WHY IT HAD TO
 *
 * The toolkit could price a carbon-tax liability and plot a net-zero
 * trajectory, but nowhere did it state the one number every tender, bank and
 * customer questionnaire asks for first: *what are your emissions for the
 * period?* An assurance lead asked for exactly that and could not find it on
 * any screen.
 *
 * Worse, the numbers that WERE on screen could not answer it. `Carbon_Tax` and
 * `NetZero` read `E_Data!L75:L78` and `L82` — the workbook's own "GHG Inventory
 * Summary" block. Those rows are LABELLED tCO₂e and contain raw ACTIVITY: the
 * workbook copies litres, kWh and kilolitres into them and sums the lot, so its
 * "total" is a mixed-unit figure roughly a thousand times the real one (SG
 * Consumer: 3,188,915 against a true 3,715). `esgDeriveSummary` reproduces that
 * block bit-for-bit ON PURPOSE, for regression parity against the client's
 * spreadsheet — a decision this module does not disturb.
 *
 * So the correct arithmetic is done HERE instead, from the same monthly input
 * grids, the way an emissions inventory is actually built:
 *
 *     tCO₂e = activity × emission factor
 *
 * Nothing is read from the L75:L82 block. The factors come from the sector
 * config (which mirrors `Assumptions!B30:B35`), so a company that publishes its
 * own factors gets its own numbers.
 *
 * SCOPE BOUNDARIES, stated because a tender reviewer will ask:
 *   - Scope 1  — fuels burned in assets the company controls: fleet diesel,
 *                generator diesel, LPG forklifts, business-car petrol.
 *   - Scope 2  — purchased grid electricity (location-based), net of on-site
 *                solar generation, which is credited at the DIFFERENCE between
 *                the grid factor and solar's own lifecycle factor.
 *   - Scope 3  — municipal water supply and treatment ONLY. This workbook does
 *                not capture upstream fuel/energy, purchased goods, or
 *                subcontracted freight, so the Scope 3 figure is explicitly
 *                partial and labelled as such wherever it is shown.
 *
 * Units: every factor except water is kg/unit, so it is divided by 1,000.
 * Water is already tCO₂e/kL and is not.
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { getEsgSectorConfig } from "../esgConfig";

/** One line of the inventory, with everything needed to defend it. */
export type GhgLine = {
  /** e.g. "Scope 1A — Road-freight fleet diesel". */
  label: string;
  scope: 1 | 2 | 3;
  /** Total activity across the period, in `unit`. */
  activity: number;
  unit: string;
  /** The factor applied, in `factorUnit`. */
  factor: number;
  factorUnit: string;
  /** activity × factor, in tonnes CO₂e. Negative for the solar credit. */
  tco2e: number;
};

export type GhgInventoryResult = {
  lines: GhgLine[];
  scope1: number;
  scope2: number;
  /** Partial by construction — water only. See the module note. */
  scope3: number;
  /** Scope 1 + 2. The figure a tender normally asks for. */
  scope1And2: number;
  /** Scope 1 + 2 + 3(partial). */
  total: number;
  /** Months of data captured (`Assumptions!B111`), when stated. */
  dataMonths: number | null;
  /** True when any activity at all was found. */
  hasData: boolean;
};

/**
 * Sum a monthly input block. The grids write `"<prefix>_<col><row>"` per cell
 * (`s1a_C14`), so the whole block is every cell carrying that prefix — which is
 * also how `esgDeriveSummary` reads them.
 */
function blockTotal(workbook: EsgWorkbookData, prefix: string): number {
  const cells = workbook.sections?.["e-data"]?.cells ?? {};
  const re = new RegExp(`^${prefix}_[C-K]\\d+$`);
  let total = 0;
  for (const [ref, raw] of Object.entries(cells)) {
    if (!re.test(ref)) continue;
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[\s,]/g, ""));
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/**
 * A block's total, preferring the sheet's own TOTAL cell when the monthly grid
 * is empty — an imported workbook may carry only the totals row.
 */
function activity(workbook: EsgWorkbookData, prefix: string, totalRef?: string): number {
  const fromGrid = blockTotal(workbook, prefix);
  if (fromGrid > 0) return fromGrid;
  if (!totalRef) return 0;
  return readEsgCell(workbook, "e-data", totalRef) ?? 0;
}

export function computeGhgInventory(workbook: EsgWorkbookData): GhgInventoryResult {
  const sector = (workbook.sections?.["company-reporting-setup"]?.cells?.sector
    ?? workbook.sections?.assumptions?.cells?.B10) as string | undefined;
  const ef = getEsgSectorConfig(sector).emissionFactors;

  const fleetDiesel = activity(workbook, "s1a", "L19");
  const genDiesel = activity(workbook, "s1b", "L28");
  const lpg = activity(workbook, "s1c", "L32");
  const carPetrol = activity(workbook, "s1d", "L37");
  const electricity = activity(workbook, "s2", "L46");
  const solar = activity(workbook, "solar");
  const water = activity(workbook, "water", "L63");

  const lines: GhgLine[] = [
    {
      label: "Scope 1A — Road-freight fleet diesel",
      scope: 1, activity: fleetDiesel, unit: "litres",
      factor: ef.dieselScope1, factorUnit: "kgCO₂e/L",
      tco2e: (fleetDiesel * ef.dieselScope1) / 1000,
    },
    {
      label: "Scope 1B — Generator diesel",
      scope: 1, activity: genDiesel, unit: "litres",
      factor: ef.dieselScope1, factorUnit: "kgCO₂e/L",
      tco2e: (genDiesel * ef.dieselScope1) / 1000,
    },
    {
      label: "Scope 1C — LPG forklifts",
      scope: 1, activity: lpg, unit: "kg",
      factor: ef.lpg, factorUnit: "kgCO₂e/kg",
      tco2e: (lpg * ef.lpg) / 1000,
    },
    {
      label: "Scope 1D — Business road travel (petrol)",
      scope: 1, activity: carPetrol, unit: "litres",
      factor: ef.petrolBusinessCars, factorUnit: "kgCO₂e/L",
      tco2e: (carPetrol * ef.petrolBusinessCars) / 1000,
    },
    {
      label: "Scope 2 — Purchased grid electricity",
      scope: 2, activity: electricity, unit: "kWh",
      factor: ef.electricityScope2, factorUnit: "kgCO₂e/kWh",
      tco2e: (electricity * ef.electricityScope2) / 1000,
    },
  ];

  // On-site solar displaces grid electricity: the credit is the difference
  // between the grid factor and solar's own lifecycle factor, never the full
  // grid factor (that would credit solar as if it were emission-free).
  if (solar > 0) {
    lines.push({
      label: "Scope 2 — On-site solar generation (credit)",
      scope: 2, activity: solar, unit: "kWh",
      factor: ef.electricityScope2 - ef.solarOnsite, factorUnit: "kgCO₂e/kWh avoided",
      tco2e: -(solar * (ef.electricityScope2 - ef.solarOnsite)) / 1000,
    });
  }

  lines.push({
    label: "Scope 3 — Municipal water (partial: water only)",
    scope: 3, activity: water, unit: "kL",
    factor: ef.waterTco2ePerKl, factorUnit: "tCO₂e/kL",
    tco2e: water * ef.waterTco2ePerKl,
  });

  const sumScope = (n: 1 | 2 | 3) =>
    lines.filter((l) => l.scope === n).reduce((a, l) => a + l.tco2e, 0);

  const scope1 = sumScope(1);
  const scope2 = sumScope(2);
  const scope3 = sumScope(3);

  return {
    lines,
    scope1,
    scope2,
    scope3,
    scope1And2: scope1 + scope2,
    total: scope1 + scope2 + scope3,
    dataMonths: readEsgCell(workbook, "assumptions", "B111"),
    hasData: lines.some((l) => l.activity > 0),
  };
}
