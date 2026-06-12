import { computeNetZeroRoadmap } from "../lib/calculators/netZero";
import { useEsgStore } from "../lib/esgStore";

const LEVERS = [
  { lever: "EV Fleet", action: "20% EV by 2030", owner: "Fleet Mgr" },
  { lever: "Solar", action: "50% renewable by 2030", owner: "Ops" },
  { lever: "Eco-driving", action: "−10% L/100km", owner: "WSP" },
  { lever: "Waste", action: "≥75% diversion all depots", owner: "SHEQ" },
];

export default function EsgNetZero() {
  const workbook = useEsgStore((s) => s.workbook);
  const nz = workbook ? computeNetZeroRoadmap(workbook) : null;

  return (
    <div className="space-y-5" data-testid="esg-net-zero">
      <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">Net-Zero Roadmap</h1>
      <p className="text-[12px] text-[var(--esg-text2)]">
        SBTi CNZS 2.0 milestones — gap from E_Data baseline vs current (F90 − B90).
      </p>
      {nz ? (
        <div className="esg-glass p-4 grid gap-3 sm:grid-cols-3 text-[12px]">
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Baseline tCO₂e</div>
            <div className="text-[18px] font-bold">{nz.baselineTco2e.toLocaleString("en-ZA")}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Current tCO₂e</div>
            <div className="text-[18px] font-bold">{nz.currentTco2e.toLocaleString("en-ZA")}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Gap</div>
            <div className="text-[18px] font-bold text-[var(--esg-acc-e)]">
              {nz.gapTco2e.toLocaleString("en-ZA")}
            </div>
          </div>
        </div>
      ) : null}
      <div className="esg-glass p-5 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[var(--esg-text3)] text-left">
              <th className="pb-2">Tier</th>
              <th className="pb-2">Year</th>
              <th className="pb-2">Requirement</th>
              <th className="pb-2">Gap tCO₂e</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(nz?.milestones ?? []).map((m) => (
              <tr key={m.tier} className="border-t border-[var(--esg-glass-border)]">
                <td className="py-2 text-[var(--esg-text)]">{m.tier}</td>
                <td className="py-2">{m.year}</td>
                <td className="py-2 text-[var(--esg-text2)]">{m.requirement}</td>
                <td className="py-2 tabular-nums">{m.gapTco2e.toLocaleString("en-ZA")}</td>
                <td className="py-2">{m.onTrack ? "On track" : "Behind"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="esg-glass p-5">
        <h2 className="text-[11px] font-bold uppercase text-[var(--esg-text3)] mb-3">Key levers</h2>
        <ul className="space-y-2 text-[12px] text-[var(--esg-text2)]">
          {LEVERS.map((l) => (
            <li key={l.lever}>
              <span className="text-[var(--esg-acc-e)] font-medium">{l.lever}</span> — {l.action} (
              {l.owner})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
