import { useState } from "react";
import {
  FLEET_SIZE_CLASS_LABELS,
  type FleetEmissionsResult,
  type FleetGroup,
  type FleetVehicle,
} from "../lib/calculators/fleetEmissions";

/**
 * Fleet emissions, vehicle by vehicle — the breakdown behind Scope 1A, with the
 * workings shown: which vehicles were counted from their fuel, which from the
 * distance they drove and their size, and which still need data.
 */

const num = (n: number, dp = 2) =>
  new Intl.NumberFormat("en-ZA", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
const whole = (n: number) => new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(n);

const METHOD_LABELS: Record<FleetVehicle["method"], string> = {
  fuel: "Fuel used",
  distance: "Distance × size",
  electric: "Electric",
  missing: "Missing data",
};

const RATE_SOURCE_LABELS: Record<NonNullable<FleetVehicle["rateSource"]>, string> = {
  "vehicle-norm": "its own L/100 km norm",
  "size-class": "its size class's measured rate",
  fleet: "the whole fleet's measured rate",
};

const VEHICLES_SHOWN = 25;

function GroupTable({ title, groups, testId }: { title: string; groups: FleetGroup[]; testId: string }) {
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table className="w-full text-[12px] text-left">
        <thead className="text-[10px] uppercase text-[var(--esg-text3)]">
          <tr>
            <th className="pb-2">{title}</th>
            <th className="pb-2 text-right">Vehicles</th>
            <th className="pb-2 text-right">km</th>
            <th className="pb-2 text-right">Litres</th>
            <th className="pb-2 text-right">tCO₂e</th>
            <th className="pb-2 text-right">kgCO₂e/km</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key} className="border-t border-white/[0.06]">
              <td className="py-2 text-[var(--esg-text2)]">{g.label}</td>
              <td className="py-2 text-right tabular-nums">{g.vehicles}</td>
              <td className="py-2 text-right tabular-nums">{whole(g.km)}</td>
              <td className="py-2 text-right tabular-nums">{whole(g.litres)}</td>
              <td className="py-2 text-right tabular-nums font-medium text-[var(--esg-text)]">{num(g.tco2e)}</td>
              <td className="py-2 text-right tabular-nums text-[var(--esg-text3)]">
                {g.kgPerKm === null ? "—" : num(g.kgPerKm)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EsgFleetEmissions({ fleet }: { fleet: FleetEmissionsResult }) {
  const [showAll, setShowAll] = useState(false);
  const { totals } = fleet;
  const counted = fleet.vehicles.filter((v) => v.method !== "missing");
  const missing = fleet.vehicles.filter((v) => v.method === "missing");
  const shown = showAll ? fleet.vehicles : fleet.vehicles.slice(0, VEHICLES_SHOWN);
  const kgPerKm = totals.km > 0 ? (totals.tco2e * 1000) / totals.km : null;

  return (
    <div className="esg-glass p-5 space-y-5" data-testid="esg-fleet-emissions">
      <div>
        <h2 className="text-[13px] font-semibold text-[var(--esg-text)]">Fleet — emissions by vehicle</h2>
        <p className="text-[11px] text-[var(--esg-text3)] mt-1">
          From the fleet register, for the month it records. Each vehicle is counted by the best
          method its data allows: the litres it used, or the kilometres it drove × what a vehicle of
          its size uses (its own L/100 km norm, else what this fleet&apos;s vehicles of the same size
          measured). Both at {fleet.factor} kgCO₂e per litre of diesel, the factor Scope 1A uses.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4" data-testid="esg-fleet-headline">
        <div>
          <div className="text-[10px] uppercase text-[var(--esg-text3)]">Fleet tCO₂e (month)</div>
          <div className="text-[22px] font-semibold text-[var(--esg-acc-e)]">{num(totals.tco2e)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-[var(--esg-text3)]">Vehicles counted</div>
          <div className="text-[22px] font-semibold text-[var(--esg-text)]">
            {counted.length}
            <span className="text-[13px] font-normal text-[var(--esg-text3)]"> of {totals.vehicles}</span>
          </div>
          <div className="text-[11px] text-[var(--esg-text3)]">
            {totals.measured} from fuel · {totals.estimated} from distance × size
            {totals.electric ? ` · ${totals.electric} electric` : ""}
            {totals.idle ? ` · ${totals.idle} did not run` : ""}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-[var(--esg-text3)]">Distance</div>
          <div className="text-[22px] font-semibold text-[var(--esg-text)]">
            {whole(totals.km)} <span className="text-[13px] font-normal">km</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-[var(--esg-text3)]">Intensity</div>
          <div className="text-[22px] font-semibold text-[var(--esg-text)]">
            {kgPerKm === null ? "—" : num(kgPerKm)} <span className="text-[13px] font-normal">kgCO₂e/km</span>
          </div>
        </div>
      </div>

      {fleet.reconciliation && totals.litres > 0 ? (
        <p
          className={`text-[11px] ${fleet.reconciliation.ratio > 1.5 ? "text-amber-300" : "text-[var(--esg-text3)]"}`}
          data-testid="esg-fleet-reconciliation"
        >
          The vehicles counted here account for {whole(fleet.reconciliation.fleetLitresPerMonth)} L of
          diesel a month; the depots&apos; fuel records (Scope 1A) show{" "}
          {whole(fleet.reconciliation.depotLitresPerMonth)} L a month over{" "}
          {fleet.reconciliation.depotMonths} month{fleet.reconciliation.depotMonths === 1 ? "" : "s"}.{" "}
          {fleet.reconciliation.ratio > 1.5
            ? `That is ${num(fleet.reconciliation.ratio, 1)} times what the depots bought — the register most likely holds figures that are not a month's driving (totals, or readings carried over). Check its km and litres columns before relying on this breakdown.`
            : fleet.reconciliation.ratio < 0.5
              ? `The register accounts for ${whole(fleet.reconciliation.ratio * 100)}% of it — vehicles are missing from the register, or their kilometres and litres are not recorded.`
              : "The two broadly agree."}
        </p>
      ) : null}

      {totals.distanceTco2e > 0 ? (
        <p className="text-[11px] text-[var(--esg-text3)]" data-testid="esg-fleet-estimate-note">
          {num(totals.distanceTco2e)} of the {num(totals.tco2e)} tCO₂e is estimated from distance and
          vehicle size; the rest is from recorded fuel. Recording litres per vehicle replaces each
          estimate with a measured figure.
        </p>
      ) : null}

      <GroupTable title="Vehicle size" groups={fleet.byClass} testId="esg-fleet-by-class" />
      <p className="text-[11px] text-[var(--esg-text3)]">
        Measured consumption by size:{" "}
        {(["heavy", "medium", "light"] as const)
          .filter((c) => fleet.classRates[c].basis > 0)
          .map((c) => `${FLEET_SIZE_CLASS_LABELS[c].split(" —")[0]} ${num(fleet.classRates[c].lPer100km ?? 0, 1)} L/100 km (${fleet.classRates[c].basis} vehicle${fleet.classRates[c].basis === 1 ? "" : "s"})`)
          .join(" · ") || "no vehicle has both litres and kilometres yet, so nothing has been measured."}
      </p>

      <GroupTable title="Depot" groups={fleet.byDepot} testId="esg-fleet-by-depot" />

      <div className="overflow-x-auto" data-testid="esg-fleet-vehicles">
        <table className="w-full text-[12px] text-left">
          <thead className="text-[10px] uppercase text-[var(--esg-text3)]">
            <tr>
              <th className="pb-2">Vehicle</th>
              <th className="pb-2">Depot</th>
              <th className="pb-2">Size</th>
              <th className="pb-2 text-right">km</th>
              <th className="pb-2 text-right">Litres</th>
              <th className="pb-2 text-right">L/100 km</th>
              <th className="pb-2">Method</th>
              <th className="pb-2 text-right">tCO₂e</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v, i) => (
              <tr key={`${v.reg}-${i}`} className="border-t border-white/[0.06]" data-testid="esg-fleet-vehicle">
                <td className="py-2 text-[var(--esg-text2)]">
                  {v.reg}
                  {v.model ? <span className="text-[var(--esg-text3)]"> · {v.model}</span> : null}
                </td>
                <td className="py-2 text-[var(--esg-text3)]">{v.depot || "—"}</td>
                <td className="py-2 text-[var(--esg-text3)]">
                  {FLEET_SIZE_CLASS_LABELS[v.sizeClass].split(" —")[0]}
                  {v.gvmKg ? ` (${whole(v.gvmKg)} kg)` : ""}
                </td>
                <td className="py-2 text-right tabular-nums">{v.km === null ? "—" : whole(v.km)}</td>
                <td className="py-2 text-right tabular-nums">
                  {v.method === "distance" ? <span title="Estimated">~{whole(v.litresUsed)}</span> : v.litres === null ? "—" : whole(v.litres)}
                </td>
                <td className="py-2 text-right tabular-nums text-[var(--esg-text3)]">
                  {v.lPer100km === null ? "—" : num(v.lPer100km, 1)}
                </td>
                <td className="py-2 text-[var(--esg-text3)]" title={v.rateSource ? `Rate: ${RATE_SOURCE_LABELS[v.rateSource]}` : v.missing}>
                  {v.idle ? "Did not run" : METHOD_LABELS[v.method]}
                </td>
                <td className="py-2 text-right tabular-nums font-medium text-[var(--esg-text)]">
                  {v.method === "missing" ? "—" : num(v.tco2e)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fleet.vehicles.length > VEHICLES_SHOWN ? (
          <button
            type="button"
            className="mt-2 text-[12px] text-[var(--esg-acc-blue)] hover:underline"
            onClick={() => setShowAll((v) => !v)}
            data-testid="esg-fleet-show-all"
          >
            {showAll ? "Show fewer" : `Show all ${fleet.vehicles.length} vehicles`}
          </button>
        ) : null}
      </div>

      {missing.length > 0 ? (
        <div className="border-l-2 border-amber-400/60 pl-3" data-testid="esg-fleet-missing">
          <p className="text-[12px] font-semibold text-[var(--esg-text)]">
            Still needed for {missing.length} vehicle{missing.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--esg-text2)]">
            {missing.slice(0, 8).map((v, i) => (
              <li key={`${v.reg}-${i}`}>
                <strong>{v.reg}</strong>: {v.missing}
              </li>
            ))}
            {missing.length > 8 ? <li>…and {missing.length - 8} more.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
