import { EsgAppLink } from "@/components/EsgAppLink";
import { esgCreateSectionHref } from "@/lib/esgRoutes";
import { NetZeroLeversEditor } from "../components/NetZeroLeversEditor";
import { computeNetZeroRoadmap } from "../lib/calculators/netZero";
import { useEsgStore } from "../lib/esgStore";

export default function EsgNetZero() {
  const workbook = useEsgStore((s) => s.workbook);
  const companyId = useEsgStore((s) => s.companyId);
  const submittedAt = useEsgStore((s) => s.submittedAt);
  const updateSectionCells = useEsgStore((s) => s.updateSectionCells);
  const nz = workbook ? computeNetZeroRoadmap(workbook) : null;

  return (
    <div className="space-y-5" data-testid="esg-net-zero">
      <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">Net-Zero Roadmap</h1>
      <p className="text-[12px] text-[var(--esg-text2)]">
        SBTi CNZS 2.0 milestones — this period's Scope 1 + 2 tonnes, from the GHG inventory, against
        each milestone of the pathway.
      </p>
      {/* Whose pathway this is (D5). SBTi measures a company against its OWN base
          year and target year; without both, the milestones below are the source
          workbook's calendar ladder, and saying nothing let it pass for theirs. */}
      {nz ? (
        nz.pathwayIsOwn ? (
          <p className="text-[12px] text-[var(--esg-text2)]" data-testid="esg-nz-pathway">
            The company&apos;s own pathway: a straight line from its base year, {nz.baselineYear}, to net zero in{" "}
            {nz.targetYear} — as SBTi measures it.
          </p>
        ) : (
          <div className="esg-glass p-4 text-[12px] text-[var(--esg-text2)]" data-testid="esg-nz-pathway">
            <p>
              These milestones are not the company&apos;s pathway yet. SBTi measures a company from its own base year
              to its own net-zero year, and{" "}
              {nz.baselineYear > 0 ? "the net-zero target year is" : nz.targetYear > 0 ? "the base year is" : "both are"}{" "}
              still to be set.
            </p>
            {companyId ? (
              <p className="mt-2 flex flex-wrap gap-3">
                <EsgAppLink
                  href={esgCreateSectionHref(companyId, "company-reporting-setup")}
                  className="text-[var(--esg-acc-blue,#22c55e)] hover:underline"
                >
                  Set the base year
                </EsgAppLink>
                <EsgAppLink
                  href={esgCreateSectionHref(companyId, "assumptions")}
                  className="text-[var(--esg-acc-blue,#22c55e)] hover:underline"
                >
                  Set the net-zero target year
                </EsgAppLink>
              </p>
            ) : null}
          </div>
        )
      ) : null}
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
              <th className="pb-2">Reduction</th>
              <th className="pb-2">Target tCO₂e</th>
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
                <td className="py-2 tabular-nums">{(m.reductionRequired * 100).toFixed(0)}%</td>
                <td className="py-2 tabular-nums">
                  {nz?.available ? Math.round(m.targetTco2e).toLocaleString("en-ZA") : "—"}
                </td>
                <td className="py-2 tabular-nums">
                  {nz?.available ? Math.round(m.gapTco2e).toLocaleString("en-ZA") : "—"}
                </td>
                <td className="py-2">
                  {!nz?.available ? "No baseline" : m.onTrack ? "On track" : "Behind"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {nz && !nz.available ? (
          <p className="text-[11px] text-[var(--esg-text3)] mt-3">
            Enter the net-zero baseline (E_Data B90) to compute milestone targets and gaps.
          </p>
        ) : null}
      </div>
      <div className="esg-glass p-5">
        <h2 className="text-[11px] font-bold uppercase text-[var(--esg-text3)] mb-3">Reduction levers</h2>
        {workbook ? (
          <NetZeroLeversEditor
            cells={workbook.sections?.netzero?.cells as Record<string, unknown> | undefined}
            locked={Boolean(submittedAt)}
            onSave={(cells) =>
              updateSectionCells("netzero", cells as Record<string, string | number | boolean | null>)
            }
          />
        ) : (
          <p className="text-[12px] text-[var(--esg-text3)]">Open a company to plan its reduction levers.</p>
        )}
      </div>
    </div>
  );
}
