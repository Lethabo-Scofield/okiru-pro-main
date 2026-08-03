/**
 * The reconciliation review — the plain-language account of what happened to a
 * user's documents on the way from files to a score.
 *
 * It replaces the long, undifferentiated wall of extraction findings with a
 * triaged summary: what NEEDS you (blocking), what's MISSING (coverage), and
 * what we HANDLED for you (resolved, collapsed by default). This is the output
 * face of the reconciliation entity model — the same issues the engine emits,
 * ranked by severity so the page stays short and the Continue button stays close.
 */
import * as React from "react";
import { AlertTriangle, CircleHelp, CheckCircle2, ChevronDown, ShieldCheck } from "lucide-react";
import type { ReconcileResult, ReconciliationIssue, IssueSeverity } from "@/lib/reconciliation/types";

const SEVERITY_META: Record<IssueSeverity, { label: string; color: string; bg: string; border: string; Icon: typeof AlertTriangle }> = {
  blocking: { label: "Needs your input", color: "#ffd60a", bg: "rgba(255,214,10,0.06)", border: "rgba(255,214,10,0.28)", Icon: AlertTriangle },
  coverage: { label: "Missing evidence", color: "#64d2ff", bg: "rgba(100,210,255,0.05)", border: "rgba(100,210,255,0.22)", Icon: CircleHelp },
  resolved: { label: "Handled for you", color: "#30d158", bg: "rgba(48,209,88,0.05)", border: "rgba(48,209,88,0.20)", Icon: CheckCircle2 },
};

function IssueRow({ issue }: { issue: ReconciliationIssue }) {
  return (
    <div className="px-5 py-3" style={{ borderTop: "1px solid #141414" }}>
      <div className="flex items-start gap-2.5">
        <span className="text-[10px] uppercase tracking-wider mt-0.5 shrink-0 rounded px-1.5 py-0.5" style={{ background: "#151515", color: "#8e8e93" }}>
          {issue.invariant}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-[#e5e5ea] leading-snug">{issue.statement}</div>
          {issue.action && <div className="text-[12px] text-[#8e8e93] mt-0.5">{issue.action}</div>}
        </div>
      </div>
    </div>
  );
}

function Group({ severity, issues }: { severity: IssueSeverity; issues: ReconciliationIssue[] }) {
  const meta = SEVERITY_META[severity];
  // Resolved items are collapsed by default (they're reassurance, not work);
  // blocking + coverage open, because they're what the user might act on.
  const [open, setOpen] = React.useState(severity !== "resolved");
  if (issues.length === 0) return null;
  const { Icon } = meta;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#0d0d0d", border: `1px solid ${meta.border}` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-3.5 flex items-center gap-3 text-left"
        style={{ background: meta.bg }}
        data-testid={`reconcile-group-${severity}`}
      >
        <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
        <span className="text-[13px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
        <span className="text-[12px] text-[#8e8e93] tabular-nums">{issues.length}</span>
        <ChevronDown className={`w-4 h-4 ml-auto text-[#636366] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div>{issues.map((i) => <IssueRow key={i.id} issue={i} />)}</div>}
    </div>
  );
}

export function ReconciliationReview({ reconcile }: { reconcile: ReconcileResult | null }) {
  if (!reconcile || reconcile.issues.length === 0) return null;
  const { summary, counts, issues } = reconcile;
  const byServerity = (s: IssueSeverity) => issues.filter((i) => i.severity === s);

  const blackPct = Math.round(summary.blackOwnershipFraction * 100);
  const headline: string[] = [];
  if (summary.shareholderCount > 0) headline.push(`${blackPct}% black-owned`);
  if (summary.ownershipClosesTo > 0) headline.push(`ownership closes to ${summary.ownershipClosesTo}%`);
  if (summary.supplierCount > 0) headline.push(`${summary.supplierCount} suppliers`);

  return (
    <div className="flex flex-col gap-3" data-testid="reconciliation-review">
      <div className="rounded-2xl px-5 py-4" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }}>
        <div className="flex items-center gap-2.5 mb-1.5">
          <ShieldCheck className="w-4 h-4 text-violet-300" />
          <p className="text-[11px] font-semibold text-[#636366] uppercase tracking-widest">We reconciled your documents into one company profile</p>
        </div>
        {headline.length > 0 && (
          <div className="text-[13px] text-[#e5e5ea]">{headline.join(" · ")}</div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px]">
          {counts.resolved > 0 && <span className="text-[#30d158]">✓ {counts.resolved} handled automatically</span>}
          {counts.blocking > 0 && <span className="text-[#ffd60a]">△ {counts.blocking} need{counts.blocking === 1 ? "s" : ""} you</span>}
          {counts.coverage > 0 && <span className="text-[#64d2ff]">○ {counts.coverage} missing</span>}
        </div>
        {summary.deemedLevel != null && (
          <div className="mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "rgba(48,209,88,0.08)", border: "1px solid rgba(48,209,88,0.25)" }}>
            <span className="text-[#30d158] font-semibold">Deemed Level {summary.deemedLevel}. </span>
            <span className="text-[#a1a1a6]">{summary.deemedLevelReason}</span>
          </div>
        )}
      </div>

      <Group severity="blocking" issues={byServerity("blocking")} />
      <Group severity="coverage" issues={byServerity("coverage")} />
      <Group severity="resolved" issues={byServerity("resolved")} />
    </div>
  );
}
