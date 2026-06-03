import { useMemo, useState } from "react";
import { API_BASE } from "@toolkit/lib/config";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import { formatEsgPercent } from "@/lib/esgCalculators";
import { validateEsgWorkbookForSubmit } from "@/lib/esgValidation";
import { EsgValidationPanel } from "@/components/esg/EsgValidationPanel";
import { useEsgStore } from "../lib/esgStore";
import { computeEsgDashboard } from "../lib/calculators/dashboard";
import type { EsgPillarRow } from "../lib/calculators/dashboard";

function PillarTable({ rows }: { rows: EsgPillarRow[] }) {
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr className="text-[var(--esg-text3)] text-left border-b border-[var(--esg-glass-border)]">
          <th className="py-2 pr-2">Indicator</th>
          <th className="py-2 pr-2 text-right">Actual</th>
          <th className="py-2 pr-2 text-right">Target</th>
          <th className="py-2 pr-2 text-right">Max Pts</th>
          <th className="py-2 pr-2 text-right">Score</th>
          <th className="py-2 text-right">% Achieved</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.indicator} className="border-b border-[var(--esg-glass-border)]/50">
            <td className="py-1.5 pr-2 text-[var(--esg-text2)]">{r.indicator}</td>
            <td className="py-1.5 pr-2 tabular-nums text-right">{r.actual}</td>
            <td className="py-1.5 pr-2 tabular-nums text-right">{r.target}</td>
            <td className="py-1.5 pr-2 tabular-nums text-right">{r.maxPoints}</td>
            <td className="py-1.5 pr-2 tabular-nums text-right">{r.score.toFixed(1)}</td>
            <td className="py-1.5 tabular-nums text-right">{r.achievementPct.toFixed(0)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function EsgDashboard() {
  const { companyId, workbook, scorecard, submittedAt, seedDemo, load } = useEsgStore();
  const [submitting, setSubmitting] = useState(false);
  const dash = useMemo(() => (workbook ? computeEsgDashboard(workbook) : null), [workbook]);

  const loadGolden = async () => {
    if (!companyId) return;
    await seedDemo(companyId);
    await load(companyId, undefined, { force: true });
  };

  const submit = async () => {
    if (!companyId) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/submit`,
        { method: "POST", credentials: "include" },
      );
      if (res.ok) await load(companyId, undefined, { force: true });
    } finally {
      setSubmitting(false);
    }
  };

  const { blockers } = validateEsgWorkbookForSubmit(workbook);

  return (
    <div className="space-y-5" data-testid="esg-dashboard">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">
          ESG Intelligence
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--esg-text)]">
          Dashboard
        </h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">
          Live scores from workbook calculators (ESG_Dashboard parity).
        </p>
      </header>

      <div className="esg-glass p-5 flex flex-wrap items-center gap-6">
        <div>
          <div
            className="text-[52px] font-bold tracking-tight leading-none text-[var(--esg-acc-e)]"
            data-testid="esg-overall-score"
          >
            {scorecard ? formatEsgPercent(scorecard.overallPercent) : "—"}
          </div>
          <div className="text-[11px] text-[var(--esg-text3)] mt-1">Overall ESG (D9)</div>
        </div>
        <div className="flex-1 min-w-[200px] grid grid-cols-3 gap-3">
          {(
            [
              { key: "environmental" as const, label: "Environmental", color: "var(--esg-acc-e)" },
              { key: "social" as const, label: "Social", color: "var(--esg-acc-s)" },
              { key: "governance" as const, label: "Governance", color: "var(--esg-acc-g)" },
            ] as const
          ).map((p) => {
            const pts = scorecard?.[p.key]?.score;
            const max = ESG_PILLAR_MAX[p.key];
            return (
              <div key={p.key} className="esg-glass-sm p-3" data-testid={`esg-pillar-${p.key}`}>
                <div className="text-[9px] uppercase tracking-wider text-[var(--esg-text3)]">
                  {p.label}
                </div>
                <div className="text-[20px] font-bold mt-1" style={{ color: p.color }}>
                  {pts != null ? pts.toFixed(1) : "—"}
                  <span className="text-[12px] text-[var(--esg-text3)] font-normal"> / {max}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dash?.kpis?.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" data-testid="esg-kpi-grid">
          {dash.kpis.map((k) => (
            <div key={k.id} className="esg-glass-sm p-3" data-testid={`esg-kpi-${k.id}`}>
              <div className="text-[9px] uppercase tracking-wider text-[var(--esg-text3)]">
                {k.label}
              </div>
              <div className="text-[15px] font-semibold mt-1 text-[var(--esg-text)]">{k.value}</div>
              {k.sub ? <div className="text-[10px] text-[var(--esg-text3)] mt-0.5">{k.sub}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {dash?.pillarRows ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {(
            [
              { key: "environmental" as const, title: "E scorecard" },
              { key: "social" as const, title: "S scorecard" },
              { key: "governance" as const, title: "G scorecard" },
            ] as const
          ).map((p) => (
            <div key={p.key} className="esg-glass p-4" data-testid={`esg-pillar-table-${p.key}`}>
              <h2 className="text-[11px] font-bold uppercase text-[var(--esg-text3)] mb-3">
                {p.title}
              </h2>
              <PillarTable rows={dash.pillarRows[p.key]} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void loadGolden()}
          disabled={Boolean(submittedAt)}
          className="text-[12px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
          data-testid="esg-load-golden-demo"
        >
          Load SG Consumer demo data
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={Boolean(submittedAt) || blockers.length > 0 || submitting}
          className="text-[12px] px-3 py-1.5 rounded-lg bg-[var(--esg-acc-e)] text-[#080e14] font-semibold disabled:opacity-50"
          data-testid="esg-submit-workbook"
        >
          {submitting ? "Submitting…" : submittedAt ? "Submitted" : "Submit & lock"}
        </button>
        {companyId ? (
          <a
            href={`${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/export`}
            className="text-[12px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)]"
            data-testid="esg-export-xlsx"
          >
            Export XLSX
          </a>
        ) : null}
      </div>

      <EsgValidationPanel workbook={workbook} />
    </div>
  );
}
