import { EsgAppLink } from "@/components/EsgAppLink";
import { esgCreateHref } from "@/lib/esgRoutes";
import { computeBbbeeBridge } from "../lib/calculators/bbbeeBridge";
import { useEsgStore } from "../lib/esgStore";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 1 }).format(n);
}

export default function EsgBbbeeBridge() {
  const { workbook, companyId } = useEsgStore();
  const bridge = workbook ? computeBbbeeBridge(workbook) : null;

  return (
    <div className="space-y-5" data-testid="esg-bbbee-bridge">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">
          B_BBEE_ESG
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--esg-text)]">
          B-BBEE Generic Code Bridge
        </h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">
          One-way bridge from ESG inputs to Generic Code elements (Statement 000).
        </p>
      </header>

      {bridge ? (
        <>
          <div className="esg-glass p-5 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-[10px] uppercase text-[var(--esg-text3)]">EE Scorecard points (E15)</div>
              <div className="text-[24px] font-bold text-[var(--esg-acc-s)]">
                {fmt(bridge.eeScorecardPoints)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[var(--esg-text3)]">Stance floor (B9)</div>
              <div className="text-[24px] font-bold text-[var(--esg-text)]">
                {bridge.stanceFloor.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[var(--esg-text3)]">
                Points earned (measured elements)
              </div>
              <div className="text-[24px] font-bold text-[var(--esg-text)]">
                {bridge.available
                  ? `${fmt(bridge.totalPoints)} / ${bridge.measuredWeight}`
                  : "Not available"}
              </div>
              <div className="text-[10px] text-[var(--esg-text3)] mt-1">
                Generic Scorecard total: {bridge.totalWeight} pts
              </div>
            </div>
          </div>

          <div className="esg-glass p-5 overflow-x-auto">
            <table className="w-full text-[12px]" data-testid="esg-bbbee-elements">
              <thead>
                <tr className="text-[var(--esg-text3)] text-left">
                  <th className="pb-2">Element</th>
                  <th className="pb-2">Weight</th>
                  <th className="pb-2">Actual</th>
                  <th className="pb-2">Points</th>
                </tr>
              </thead>
              <tbody>
                {bridge.elements.map((el) => (
                  <tr key={el.id} className="border-t border-[var(--esg-glass-border)] align-top">
                    <td className="py-2 text-[var(--esg-text)]">
                      {el.label}
                      {el.note ? (
                        <div className="text-[10px] text-[var(--esg-text3)] mt-0.5">{el.note}</div>
                      ) : null}
                    </td>
                    <td className="py-2 tabular-nums">{el.weight}</td>
                    <td className="py-2 tabular-nums">
                      {el.actual == null ? "—" : `${(el.actual * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2 tabular-nums">
                      {el.points == null ? (
                        <span className="text-[var(--esg-text3)]">Not available</span>
                      ) : (
                        fmt(el.points)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="esg-glass p-5">
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">B-BBEE status level</div>
            <div className="text-[20px] font-semibold text-[var(--esg-text)]">
              {bridge.statusLevel ?? "Not determined"}
            </div>
            {bridge.statusLevelNote ? (
              <p className="text-[11px] text-[var(--esg-text3)] mt-1">{bridge.statusLevelNote}</p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-[13px] text-[var(--esg-text3)]">Load workbook data to compute bridge.</p>
      )}

      {companyId ? (
        <EsgAppLink
          href={esgCreateHref(companyId)}
          className="inline-flex text-[12px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
          data-testid="esg-edit-inputs-link"
        >
          Edit inputs →
        </EsgAppLink>
      ) : null}
    </div>
  );
}
