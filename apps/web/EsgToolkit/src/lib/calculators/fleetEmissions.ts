import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { readEsgGridRows } from "@/lib/esg/esgGridRows";
import { getEsgSectorConfig } from "../esgConfig";

/**
 * Fleet emissions, vehicle by vehicle — the breakdown behind Scope 1A.
 *
 * Two methods, the GHG Protocol's for mobile combustion, in order of preference:
 *
 *  - FUEL: the litres the vehicle used × the diesel factor. What its fuel
 *    records say, and always preferred.
 *  - DISTANCE × SIZE: the kilometres it drove × the litres per 100 km a vehicle
 *    of its size uses — its own stated norm, else what the company's OWN
 *    vehicles of the same size class measured — × the same diesel factor.
 *
 * No borrowed per-kilometre factor table: the consumption is the company's own
 * and the factor is the South African diesel factor the inventory uses, so the
 * two can be reconciled line for line. A vehicle with neither litres nor
 * kilometres is listed as missing — what the company still has to provide —
 * never guessed.
 *
 * Size is the vehicle's licence class by GVM (National Road Traffic Act):
 * light up to 3,500 kg (code B); medium 3,500–16,000 kg (C1); heavy over
 * 16,000 kg (C). Where the register gives no GVM, an unmistakable body type in
 * the model name (a bakkie, a truck-tractor) decides; otherwise the size is
 * unknown and the estimate falls back to the whole fleet's measured rate.
 *
 * The register's figures are MONTHLY (Fleet_Register "Monthly km" / "Monthly
 * Litres"), so these totals are a month's, not the reporting period's.
 *
 * A figure that cannot be a month's is not used. A register read from a
 * client's fleet list has carried ODOMETER readings in "Monthly km" (median
 * 71,240 km, one 1,012,350) and Excel date serials in "Monthly Litres" — added
 * up, Acme Group's fleet "emitted" 80 times the diesel its depots bought.
 * Such a figure is named, with the reason, in what is still needed; and the
 * fleet is reconciled against the depots' own fuel so a gap that size shows.
 */

export type FleetSizeClass = "light" | "medium" | "heavy" | "unknown";

export const FLEET_SIZE_CLASS_LABELS: Record<FleetSizeClass, string> = {
  light: "Light — GVM up to 3.5 t",
  medium: "Medium — GVM 3.5 t to 16 t",
  heavy: "Heavy — GVM over 16 t",
  unknown: "Size not recorded",
};

export type FleetMethod = "fuel" | "distance" | "electric" | "missing";

export type FleetVehicle = {
  reg: string;
  depot: string;
  model: string;
  gvmKg: number | null;
  sizeClass: FleetSizeClass;
  km: number | null;
  /** Litres as recorded. */
  litres: number | null;
  method: FleetMethod;
  /** Litres per 100 km: measured for a fuel line, assumed for a distance line. */
  lPer100km: number | null;
  /** Where an assumed rate came from. */
  rateSource?: "vehicle-norm" | "size-class" | "fleet";
  /** Litres recorded, or estimated from the distance. */
  litresUsed: number;
  tco2e: number;
  kgPerKm: number | null;
  /** What is still needed, in words, when the vehicle could not be counted. */
  missing?: string;
  /** Did not run in the month: its month reads 0 km and 0 L. Counted, at zero. */
  idle?: boolean;
};

export type FleetGroup = {
  key: string;
  label: string;
  vehicles: number;
  km: number;
  litres: number;
  tco2e: number;
  kgPerKm: number | null;
};

export type FleetReconciliation = {
  /** Litres a month the counted vehicles account for (recorded and estimated). */
  fleetLitresPerMonth: number;
  /** Litres a month the depots' Scope 1A fuel records show, over the months recorded. */
  depotLitresPerMonth: number;
  depotMonths: number;
  /** fleet ÷ depots. Far above 1, the register holds something that is not a month's driving. */
  ratio: number;
};

export type FleetEmissionsResult = {
  vehicles: FleetVehicle[];
  /** The fleet against the depots' own fuel; null when the depots record none. */
  reconciliation: FleetReconciliation | null;
  /** kgCO₂e per litre of diesel — the inventory's Scope 1A factor. */
  factor: number;
  /** The measured L/100 km of each size class, and how many vehicles it rests on. */
  classRates: Record<FleetSizeClass, { lPer100km: number | null; basis: number }>;
  fleetRate: { lPer100km: number | null; basis: number };
  byClass: FleetGroup[];
  byDepot: FleetGroup[];
  totals: {
    vehicles: number;
    km: number;
    litres: number;
    tco2e: number;
    fuelTco2e: number;
    distanceTco2e: number;
    measured: number;
    estimated: number;
    electric: number;
    /** Did not run in the month. */
    idle: number;
    missing: number;
  };
  hasData: boolean;
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const LIGHT_BODY = /\b(ldv|bakkie|car|sedan|hatch(back)?|suv|panel ?van|minibus|hilux|ranger|navara|d-?max|polo|corolla)\b/i;
const HEAVY_BODY = /\b(horse|truck[- ]?tractor|interlink|superlink|articulated|tri-?axle)\b/i;

export function fleetSizeClass(gvmKg: number | null, model: string): FleetSizeClass {
  if (gvmKg !== null && gvmKg > 0) {
    if (gvmKg <= 3_500) return "light";
    if (gvmKg <= 16_000) return "medium";
    return "heavy";
  }
  if (HEAVY_BODY.test(model)) return "heavy";
  if (LIGHT_BODY.test(model)) return "light";
  return "unknown";
}

/** A measured rate worth learning from: drove, fuelled, and not a data-entry slip. */
const plausibleRate = (rate: number): boolean => rate >= 3 && rate <= 100;

/** Beyond what one vehicle drives in a month (1,000 km a day, every day): an odometer reading. */
const MAX_MONTH_KM = 30_000;
/** Beyond any one vehicle's month of diesel — a 32-tonne truck at 45 L/100 km over 30,000 km is 13,500 L. */
const MAX_MONTH_LITRES = 20_000;

/** A class rate needs this many measured vehicles before it stands for the class. */
const MIN_RATE_BASIS = 3;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function group(key: string, label: string, vehicles: FleetVehicle[]): FleetGroup {
  const km = vehicles.reduce((sum, v) => sum + (v.method === "missing" ? 0 : v.km ?? 0), 0);
  const litres = vehicles.reduce((sum, v) => sum + v.litresUsed, 0);
  const tco2e = vehicles.reduce((sum, v) => sum + v.tco2e, 0);
  return { key, label, vehicles: vehicles.length, km, litres, tco2e, kgPerKm: km > 0 ? (tco2e * 1000) / km : null };
}

/** The depots' own Scope 1A diesel, a month at a time, against the fleet's. */
function reconcile(workbook: EsgWorkbookData, fleetLitresPerMonth: number): FleetReconciliation | null {
  const cells = workbook.sections?.["e-data"]?.cells ?? {};
  let litres = 0;
  const months = new Set<string>();
  for (const [ref, raw] of Object.entries(cells)) {
    const m = /^s1a_([C-Z])\d+$/.exec(ref);
    const n = num(raw);
    if (!m || n === null || n <= 0) continue;
    litres += n;
    months.add(m[1]);
  }
  if (months.size === 0 || litres <= 0) return null;
  const depotLitresPerMonth = litres / months.size;
  return {
    fleetLitresPerMonth,
    depotLitresPerMonth,
    depotMonths: months.size,
    ratio: fleetLitresPerMonth / depotLitresPerMonth,
  };
}

export function computeFleetEmissions(workbook: EsgWorkbookData): FleetEmissionsResult {
  const sector = (workbook.sections?.["company-reporting-setup"]?.cells?.sector
    ?? workbook.sections?.assumptions?.cells?.B10) as string | undefined;
  const factor = getEsgSectorConfig(sector).emissionFactors.dieselScope1;

  const rows = readEsgGridRows(workbook.sections?.fleet?.cells as Record<string, unknown> | undefined, "fleet")
    .filter((row) => String(row.reg ?? "").trim() !== "")
    .filter((row) => !/^(total|depot|reg)$/i.test(String(row.reg ?? "").trim()));

  const base = rows.map((row) => {
    const model = String(row.model ?? "").trim();
    const gvmKg = num(row.gvm);
    const km = num(row.monthlyKm);
    const litres = num(row.monthlyLitres);
    const tank = num(row.fuelCap);
    const statedKm = km !== null && km > 0 ? km : null;
    const statedLitres = litres !== null && litres > 0 ? litres : null;
    // What cannot be a month's figure is not used — and is said.
    const kmIsMonth = statedKm === null || statedKm <= MAX_MONTH_KM;
    const litresIsMonth =
      statedLitres === null ||
      (statedLitres <= MAX_MONTH_LITRES &&
        (tank === null || tank <= 0 || statedLitres <= tank * 31) &&
        (statedKm === null || !kmIsMonth || plausibleRate((statedLitres / statedKm) * 100)));
    const rejected: string[] = [];
    if (!kmIsMonth) {
      rejected.push(`${new Intl.NumberFormat("en-ZA").format(statedKm as number)} km is more than one vehicle drives in a month — it reads like an odometer reading. Record the kilometres driven in the month.`);
    }
    if (!litresIsMonth) {
      rejected.push(`${new Intl.NumberFormat("en-ZA").format(statedLitres as number)} L cannot be one vehicle's month of diesel${tank ? ` (its tank holds ${tank} L)` : ""}. Record the litres it used in the month.`);
    }
    return {
      reg: String(row.reg ?? "").trim(),
      depot: String(row.depot ?? "").trim(),
      model,
      gvmKg,
      sizeClass: fleetSizeClass(gvmKg, model),
      km: kmIsMonth ? statedKm : null,
      litres: litresIsMonth ? statedLitres : null,
      norm: num(row.l100Norm) ?? num(row.l100Actual),
      ev: /^(yes|y|true|1|ev|electric)$/i.test(String(row.isEv ?? "").trim()),
      // Stated as nothing — not left blank: a vehicle that did not run.
      zeroMonth: km === 0 && litres === 0,
      rejected,
    };
  });

  // A month of 0 km and 0 L is a vehicle that stood — unless most of the fleet
  // reads that way, which is a register whose month was never filled in.
  const zeroMonths = base.filter((v) => v.zeroMonth).length;
  const withMonths = base.filter((v) => v.zeroMonth || v.km !== null || v.litres !== null).length;
  const zeroMeansIdle = zeroMonths * 2 < withMonths;

  // What the company's own vehicles burn per 100 km, by size class and overall.
  const measuredRates = base
    .filter((v) => v.km !== null && v.litres !== null)
    .map((v) => ({ sizeClass: v.sizeClass, rate: ((v.litres as number) / (v.km as number)) * 100 }))
    .filter((m) => plausibleRate(m.rate));
  const classRates = {} as FleetEmissionsResult["classRates"];
  for (const sizeClass of ["light", "medium", "heavy", "unknown"] as FleetSizeClass[]) {
    const rates = measuredRates.filter((m) => m.sizeClass === sizeClass).map((m) => m.rate);
    classRates[sizeClass] = { lPer100km: rates.length >= MIN_RATE_BASIS ? median(rates) : null, basis: rates.length };
  }
  const fleetRate = {
    lPer100km: measuredRates.length >= MIN_RATE_BASIS ? median(measuredRates.map((m) => m.rate)) : null,
    basis: measuredRates.length,
  };

  const vehicles: FleetVehicle[] = base.map((v) => {
    const shared = { reg: v.reg, depot: v.depot, model: v.model, gvmKg: v.gvmKg, sizeClass: v.sizeClass, km: v.km, litres: v.litres };
    if (v.ev) {
      return {
        ...shared,
        method: "electric",
        lPer100km: null,
        litresUsed: 0,
        tco2e: 0,
        kgPerKm: v.km ? 0 : null,
      };
    }
    if (v.zeroMonth && zeroMeansIdle) {
      return { ...shared, km: 0, litres: 0, method: "fuel", idle: true, lPer100km: null, litresUsed: 0, tco2e: 0, kgPerKm: null };
    }
    if (v.litres !== null) {
      const tco2e = (v.litres * factor) / 1000;
      return {
        ...shared,
        method: "fuel",
        lPer100km: v.km ? (v.litres / v.km) * 100 : null,
        litresUsed: v.litres,
        tco2e,
        kgPerKm: v.km ? (tco2e * 1000) / v.km : null,
      };
    }
    if (v.km !== null) {
      const own = v.norm !== null && plausibleRate(v.norm) ? v.norm : null;
      const sized = v.sizeClass !== "unknown" ? classRates[v.sizeClass].lPer100km : null;
      const rate = own ?? sized ?? fleetRate.lPer100km;
      if (rate !== null) {
        const litresUsed = (v.km * rate) / 100;
        const tco2e = (litresUsed * factor) / 1000;
        return {
          ...shared,
          method: "distance",
          lPer100km: rate,
          rateSource: own !== null ? "vehicle-norm" : sized !== null ? "size-class" : "fleet",
          litresUsed,
          tco2e,
          kgPerKm: (tco2e * 1000) / v.km,
        };
      }
      return {
        ...shared,
        method: "missing",
        lPer100km: null,
        litresUsed: 0,
        tco2e: 0,
        kgPerKm: null,
        missing: [...v.rejected, `Kilometres are recorded, but fewer than ${MIN_RATE_BASIS} vehicles of its size have both litres and kilometres to measure a consumption rate from. Add this vehicle's litres, or its L/100 km norm.`].join(" "),
      };
    }
    return {
      ...shared,
      method: "missing",
      lPer100km: null,
      litresUsed: 0,
      tco2e: 0,
      kgPerKm: null,
      missing: v.rejected.length
        ? v.rejected.join(" ")
        : v.zeroMonth
          ? "Its month reads 0 km and 0 L, as do most of the fleet's — the register's month looks unfilled. Record the kilometres it drove and the litres it used."
          : "Neither litres nor kilometres are recorded for this vehicle.",
    };
  });

  const counted = vehicles.filter((v) => v.method !== "missing");
  const byClass = (["heavy", "medium", "light", "unknown"] as FleetSizeClass[])
    .map((sizeClass) => group(sizeClass, FLEET_SIZE_CLASS_LABELS[sizeClass], vehicles.filter((v) => v.sizeClass === sizeClass)))
    .filter((g) => g.vehicles > 0);
  const depots = Array.from(new Set(vehicles.map((v) => v.depot || "—"))).sort((a, b) => a.localeCompare(b));
  const byDepot = depots.map((depot) => group(depot, depot, vehicles.filter((v) => (v.depot || "—") === depot)));

  const totals = {
    vehicles: vehicles.length,
    km: counted.reduce((sum, v) => sum + (v.km ?? 0), 0),
    litres: vehicles.reduce((sum, v) => sum + v.litresUsed, 0),
    tco2e: vehicles.reduce((sum, v) => sum + v.tco2e, 0),
    fuelTco2e: vehicles.filter((v) => v.method === "fuel").reduce((sum, v) => sum + v.tco2e, 0),
    distanceTco2e: vehicles.filter((v) => v.method === "distance").reduce((sum, v) => sum + v.tco2e, 0),
    measured: vehicles.filter((v) => v.method === "fuel" && !v.idle).length,
    estimated: vehicles.filter((v) => v.method === "distance").length,
    electric: vehicles.filter((v) => v.method === "electric").length,
    idle: vehicles.filter((v) => v.idle).length,
    missing: vehicles.filter((v) => v.method === "missing").length,
  };

  return {
    vehicles,
    reconciliation: reconcile(workbook, totals.litres),
    factor,
    classRates,
    fleetRate,
    byClass,
    byDepot,
    totals,
    hasData: vehicles.length > 0,
  };
}
