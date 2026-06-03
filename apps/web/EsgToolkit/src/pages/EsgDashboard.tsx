import { useState } from "react";
import { API_BASE } from "@toolkit/lib/config";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import { formatEsgPercent } from "@/lib/esgCalculators";
import { validateEsgWorkbook } from "@/lib/esgValidation";
import { EsgValidationPanel } from "@/components/esg/EsgValidationPanel";
import { useEsgStore } from "../lib/esgStore";
import { buildSgConsumerGoldenWorkbook } from "../lib/fixtures/esg-consumer-golden";

export default function EsgDashboard() {
  const { companyId, workbook, scorecard, submittedAt, updateSectionCells, load } =
    useEsgStore();
  const [submitting, setSubmitting] = useState(false);

  const loadGolden = async () => {
    const golden = buildSgConsumerGoldenWorkbook();
    golden.companyId = companyId;
    for (const [sectionId, { cells }] of Object.entries(golden.sections)) {
      await updateSectionCells(sectionId, cells);
    }
    await load(companyId);
  };

  const submit = async () => {
    if (!companyId) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/submit`,
        { method: "POST", credentials: "include" },
      );
      if (res.ok) await load(companyId);
    } finally {
      setSubmitting(false);
    }
  };

  const issues = validateEsgWorkbook(workbook);
  const blockers = issues.filter((i) => !i.pass && i.severity === "critical");

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
          Live scores from workbook calculators (ESG_Dashboard D9 formula).
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
          <div className="text-[11px] text-[var(--esg-text3)] mt-1">
            Overall ESG (avg pillar ÷ 100)
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadGolden}
          disabled={Boolean(submittedAt)}
          className="text-[12px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
          data-testid="esg-load-golden-demo"
        >
          Load SG Consumer demo data
        </button>
        <button
          type="button"
          onClick={submit}
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
