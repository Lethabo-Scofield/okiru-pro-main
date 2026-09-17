import { computeGhgInventory } from "../lib/calculators/ghgInventory";
import { useEsgStore } from "../lib/esgStore";

/**
 * GHG Emissions — the number a tender, a bank or a customer questionnaire asks
 * for first, on a page of its own.
 *
 * It did not exist. The toolkit could price a carbon-tax liability and plot a
 * net-zero path, but never stated the inventory those are built on, so the
 * honest answer to "what are our emissions for the period?" was: open the
 * spreadsheet. This page is that answer, computed as activity × factor, with
 * the workings visible so a reviewer can check every line.
 */

const num = (n: number, dp = 2) =>
  new Intl.NumberFormat("en-ZA", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
const whole = (n: number) => new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(n);

export default function EsgEmissions() {
  const workbook = useEsgStore((s) => s.workbook);
  const ghg = workbook ? computeGhgInventory(workbook) : null;
  const period = workbook?.sections?.["company-reporting-setup"]?.cells?.period as string | undefined;
  const entity = workbook?.sections?.["company-reporting-setup"]?.cells?.entity as string | undefined;

  return (
    <div className="space-y-4" data-testid="esg-emissions">
      <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">GHG Emissions</h1>
      <p className="text-[12px] text-[var(--esg-text2)]">
        Greenhouse-gas inventory for {entity ? <strong>{entity}</strong> : "this entity"}
        {period ? <> · {period}</> : null}. Computed per the GHG Protocol as activity × emission
        factor, from the monthly figures captured on Inputs. Scope 2 is location-based.
      </p>

      {!ghg || !ghg.hasData ? (
        <div className="esg-glass p-5 border-l-2 border-[var(--esg-acc-blue)]" data-testid="esg-emissions-empty">
          <p className="text-[13px] text-[var(--esg-text2)]">
            No activity data captured yet, so there is nothing to report. Enter fuel, electricity and
            water figures on <strong>Inputs → Environmental</strong>, or bring them in with
            <strong> Import / bulk upload</strong>. This page fills itself the moment they land.
          </p>
        </div>
      ) : (
        <>
          <div className="esg-glass p-5 grid gap-4 sm:grid-cols-3" data-testid="esg-emissions-headline">
            <div className="sm:col-span-3">
              <div className="text-[10px] uppercase text-[var(--esg-text3)]">
                Scope 1 + 2 (location-based)
              </div>
              <div className="text-[34px] font-bold text-[var(--esg-acc-e)] leading-tight">
                {num(ghg.scope1And2)} <span className="text-[16px] font-medium">tCO₂e</span>
              </div>
              {ghg.dataMonths ? (
                <div className="text-[11px] text-[var(--esg-text3)] mt-1">
                  Covering {ghg.dataMonths} month{ghg.dataMonths === 1 ? "" : "s"} of captured data —
                  a year-to-date actual, not a full-year figure.
                </div>
              ) : null}
            </div>
            <div>
              <div className="text-[10px] uppercase text-[var(--esg-text3)]">Scope 1</div>
              <div className="text-[20px] font-semibold text-[var(--esg-text)]">{num(ghg.scope1)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[var(--esg-text3)]">Scope 2 (net)</div>
              <div className="text-[20px] font-semibold text-[var(--esg-text)]">{num(ghg.scope2)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[var(--esg-text3)]">Scope 3 (water only)</div>
              <div className="text-[20px] font-semibold text-[var(--esg-text)]">{num(ghg.scope3)}</div>
            </div>
          </div>

          <div className="esg-glass p-5" data-testid="esg-emissions-breakdown">
            <h2 className="text-[13px] font-semibold text-[var(--esg-text)] mb-3">
              How it is calculated
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] text-left">
                <thead className="text-[10px] uppercase text-[var(--esg-text3)]">
                  <tr>
                    <th className="pb-2">Source</th>
                    <th className="pb-2 text-right">Activity</th>
                    <th className="pb-2">Unit</th>
                    <th className="pb-2 text-right">Factor</th>
                    <th className="pb-2 text-right">tCO₂e</th>
                  </tr>
                </thead>
                <tbody>
                  {ghg.lines.map((line) => (
                    <tr key={line.label} className="border-t border-white/[0.06]">
                      <td className="py-2 text-[var(--esg-text2)]">{line.label}</td>
                      <td className="py-2 text-right tabular-nums">{whole(line.activity)}</td>
                      <td className="py-2 text-[var(--esg-text3)]">{line.unit}</td>
                      <td className="py-2 text-right tabular-nums text-[var(--esg-text3)]">
                        {line.factor} {line.factorUnit}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium text-[var(--esg-text)]">
                        {num(line.tco2e)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-white/[0.15]">
                    <td className="py-2 font-semibold text-[var(--esg-text)]" colSpan={4}>
                      Total (Scope 1 + 2 + 3 partial)
                    </td>
                    <td className="py-2 text-right tabular-nums font-bold text-[var(--esg-text)]">
                      {num(ghg.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[var(--esg-text3)] mt-3">
              Scope 3 covers municipal water only — upstream fuel and energy, purchased goods and
              subcontracted freight are not captured in this workbook, so the Scope 3 figure is
              partial and should be described that way. Freight intensity (ISO 14083) is reported
              separately and is not included here.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
