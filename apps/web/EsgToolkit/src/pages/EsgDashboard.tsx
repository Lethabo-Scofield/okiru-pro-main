import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";

export default function EsgDashboard() {
  return (
    <div className="space-y-4" data-testid="esg-dashboard">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">
          ESG Intelligence
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--esg-text)]">
          Dashboard
        </h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1 max-w-xl">
          Phase 0 shell — scores will match workbook ESG_Dashboard when calculators ship in Phase 1.
        </p>
      </header>

      <div className="esg-glass p-5 flex flex-wrap items-center gap-6">
        <div>
          <div className="text-[52px] font-bold tracking-tight leading-none text-[var(--esg-acc-e)]">
            —
          </div>
          <div className="text-[11px] text-[var(--esg-text3)] mt-1">Overall ESG (D9: avg of each pillar score ÷ 100)</div>
        </div>
        <div className="flex-1 min-w-[200px] grid grid-cols-3 gap-3">
          {(
            [
              { label: "Environmental", max: ESG_PILLAR_MAX.environmental, color: "var(--esg-acc-e)" },
              { label: "Social", max: ESG_PILLAR_MAX.social, color: "var(--esg-acc-s)" },
              { label: "Governance", max: ESG_PILLAR_MAX.governance, color: "var(--esg-acc-g)" },
            ] as const
          ).map((p) => (
            <div key={p.label} className="esg-glass-sm p-3">
              <div className="text-[9px] uppercase tracking-wider text-[var(--esg-text3)]">{p.label}</div>
              <div className="text-[20px] font-bold mt-1" style={{ color: p.color }}>
                —<span className="text-[12px] text-[var(--esg-text3)] font-normal"> / {p.max}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="esg-glass p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-[var(--esg-text3)] mb-3">
          Next (Phase 1)
        </h2>
        <ul className="text-[12px] text-[var(--esg-text2)] space-y-2 list-disc pl-4">
          <li>E_Data / S_Data / G_Data workbook sections and grids</li>
          <li>EE_Scorecard, Fleet, Waste, ISO_Tracker registers</li>
          <li>Validation panel tied to Validation sheet</li>
        </ul>
      </div>
    </div>
  );
}
