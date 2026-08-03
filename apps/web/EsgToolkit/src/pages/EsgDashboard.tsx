import { useMemo, useState } from "react";
import { Link } from "wouter";
import { API_BASE } from "@toolkit/lib/config";
import { toolkitPillarHref } from "@/lib/esg/esgToolkitNav";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import { formatEsgPercent } from "@/lib/esgCalculators";
import { useAuth } from "@toolkit/lib/auth";
import { validateEsgWorkbookForSubmit } from "@/lib/esgValidation";
import { canSeedEsgSampleData } from "@/lib/esg/esgAccess";
import {
  ESG_SELECTED_TOPICS_CELL,
  computeScopedSummary,
  parseSelectedTopics,
} from "@/lib/esg/esgTopicScope";
import { EsgReportScopePanel } from "../components/EsgReportScopePanel";
import { EsgToolkitValidationStrip } from "../components/EsgToolkitValidationStrip";
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
  const { user } = useAuth();
  const isEsgAdmin = canSeedEsgSampleData(user);
  const reportMode = useEsgStore((s) => s.getReportMode());
  const topicsCsv = useEsgStore(
    (s) => s.workbook?.sections?.assumptions?.cells?.[ESG_SELECTED_TOPICS_CELL],
  );
  const selectedTopics = useMemo(() => parseSelectedTopics(topicsCsv), [topicsCsv]);
  const [submitting, setSubmitting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const unlockWorkbook = useEsgStore((s) => s.unlockWorkbook);

  const reopen = async () => {
    if (!companyId) return;
    const ok = window.confirm(
      "Reopen this workbook for editing?\n\nInputs become editable again and scores can change. The reopen is recorded against this workbook.",
    );
    if (!ok) return;
    setReopening(true);
    try {
      await unlockWorkbook(companyId);
      await load(companyId, undefined, { force: true });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not reopen this workbook");
    } finally {
      setReopening(false);
    }
  };
  const dash = useMemo(() => (workbook ? computeEsgDashboard(workbook) : null), [workbook]);
  const scoped = useMemo(
    () => (reportMode === "topic" ? computeScopedSummary(scorecard, selectedTopics) : null),
    [reportMode, scorecard, selectedTopics],
  );

  const loadGolden = async () => {
    if (!companyId) return;
    const ok = window.confirm(
      "Load sample data?\n\nThis REPLACES every section of this workbook with sample figures. Anything already captured for this company will be lost.",
    );
    if (!ok) return;
    try {
      await seedDemo(companyId);
      await load(companyId, undefined, { force: true });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not load sample data");
    }
  };

  const submit = async () => {
    if (!companyId) return;
    // One-way door: there is no self-service unlock, so make that explicit.
    const ok = window.confirm(
      "Submit and lock this workbook?\n\nInputs become read-only and cannot be edited afterwards. Reopening requires Okiru support.",
    );
    if (!ok) return;
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
          ESG Dashboard
        </h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">
          Live E, S and G scores, updated as you capture data.
        </p>
      </header>

      <EsgReportScopePanel />

      <div className="esg-glass p-5 flex flex-wrap items-center gap-6">
        <div>
          <div
            className="text-[52px] font-bold tracking-tight leading-none text-[var(--esg-acc-e)]"
            data-testid="esg-overall-score"
          >
            {scoped
              ? formatEsgPercent(scoped.overallPercent)
              : scorecard
                ? formatEsgPercent(scorecard.overallPercent)
                : "—"}
          </div>
          <div className="text-[11px] text-[var(--esg-text3)] mt-1">
            {scoped ? "Overall — selected topics" : "Overall ESG score"}
          </div>
        </div>
        <div className="flex-1 min-w-[200px] grid grid-cols-3 gap-3">
          {(
            [
              { key: "environmental" as const, label: "Environmental", color: "var(--esg-acc-e)" },
              { key: "social" as const, label: "Social", color: "var(--esg-acc-s)" },
              { key: "governance" as const, label: "Governance", color: "var(--esg-acc-g)" },
            ] as const
          ).map((p) => {
            const pts = scoped ? scoped.pillars[p.key].score : scorecard?.[p.key]?.score;
            const max = scoped ? scoped.pillars[p.key].max : ESG_PILLAR_MAX[p.key];
            const href = toolkitPillarHref(p.key);
            const outOfScope = Boolean(scoped && scoped.pillars[p.key].max === 0);
            return (
              <Link
                key={p.key}
                href={href}
                className={`esg-glass-sm p-3 block hover:bg-white/[0.04] transition-colors cursor-pointer ${
                  outOfScope ? "opacity-40" : ""
                }`}
                data-testid={`esg-pillar-${p.key}`}
                data-esg-pillar-href={href}
              >
                <div className="text-[9px] uppercase tracking-wider text-[var(--esg-text3)]">
                  {p.label}
                </div>
                <div className="text-[20px] font-bold mt-1" style={{ color: p.color }}>
                  {outOfScope ? (
                    <span className="text-[12px] text-[var(--esg-text3)] font-normal">
                      Not in scope
                    </span>
                  ) : (
                    <>
                      {pts != null ? pts.toFixed(1) : "—"}
                      <span className="text-[12px] text-[var(--esg-text3)] font-normal"> / {max}</span>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
        {scoped ? (
          <p className="w-full text-[10px] text-[var(--esg-text3)] -mt-2" data-testid="esg-scoped-note">
            Scores above reflect only your selected topics. The full framework-parity scorecard
            still powers the workbook and its export.
          </p>
        ) : null}
      </div>

      {dash?.kpis?.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" data-testid="esg-kpi-grid">
          {dash.kpis.map((k) => {
            const pillarHref =
              k.id === "e-score" || k.id === "rating-e"
                ? toolkitPillarHref("environmental")
                : k.id === "s-score" || k.id === "rating-s"
                  ? toolkitPillarHref("social")
                  : k.id === "g-score" || k.id === "rating-g"
                    ? toolkitPillarHref("governance")
                    : null;
            const inner = (
              <>
                <div className="text-[9px] uppercase tracking-wider text-[var(--esg-text3)]">
                  {k.label}
                </div>
                <div className="text-[15px] font-semibold mt-1 text-[var(--esg-text)]">{k.value}</div>
                {k.sub ? <div className="text-[10px] text-[var(--esg-text3)] mt-0.5">{k.sub}</div> : null}
              </>
            );
            return pillarHref ? (
              <Link
                key={k.id}
                href={pillarHref}
                className="esg-glass-sm p-3 block hover:bg-white/[0.04] transition-colors"
                data-testid={`esg-kpi-${k.id}`}
                data-esg-pillar-href={pillarHref}
              >
                {inner}
              </Link>
            ) : (
              <div key={k.id} className="esg-glass-sm p-3" data-testid={`esg-kpi-${k.id}`}>
                {inner}
              </div>
            );
          })}
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
          ).map((p) => {
            const href = toolkitPillarHref(p.key);
            return (
              <Link
                key={p.key}
                href={href}
                className="esg-glass p-4 block hover:bg-white/[0.03] transition-colors"
                data-testid={`esg-pillar-table-${p.key}`}
                data-esg-pillar-href={href}
              >
                <h2 className="text-[11px] font-bold uppercase text-[var(--esg-text3)] mb-3">
                  {p.title}
                </h2>
                <PillarTable rows={dash.pillarRows[p.key]} />
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isEsgAdmin ? (
          <button
            type="button"
            onClick={() => void loadGolden()}
            disabled={Boolean(submittedAt)}
            title="Replaces every section with sample figures"
            className="text-[12px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
            data-testid="esg-load-golden-demo"
          >
            Load sample data
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={Boolean(submittedAt) || blockers.length > 0 || submitting}
          className="text-[12px] px-3 py-1.5 rounded-lg bg-[var(--esg-acc-e)] text-[#080e14] font-semibold disabled:opacity-50"
          data-testid="esg-submit-workbook"
        >
          {submitting ? "Submitting…" : submittedAt ? "Submitted" : "Submit & lock"}
        </button>
        {submittedAt && isEsgAdmin ? (
          <button
            type="button"
            onClick={() => void reopen()}
            disabled={reopening}
            title="Makes the workbook editable again — recorded against the workbook"
            className="text-[12px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
            data-testid="esg-reopen-workbook"
          >
            {reopening ? "Reopening…" : "Reopen for editing"}
          </button>
        ) : null}
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

      <EsgToolkitValidationStrip />
    </div>
  );
}
