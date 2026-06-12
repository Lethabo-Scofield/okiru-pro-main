import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import { validateEsgWorkbook } from "@/lib/esgValidation";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { useEsgStore } from "../../../EsgToolkit/src/lib/esgStore";

type Props = {
  workbook?: EsgWorkbookData | null;
  activeSectionId?: string;
  onSelectSection?: (sectionId: string) => void;
};

export function EsgValidationPanel({
  workbook = null,
  activeSectionId,
  onSelectSection,
}: Props) {
  const touched = useEsgStore((s) => s.touched);
  const submitAttempted = useEsgStore((s) => s.submitAttempted);
  const [filter, setFilter] = useState("");

  const issues = useMemo(
    () => validateEsgWorkbook(workbook, touched, submitAttempted ? "submit" : "live"),
    [workbook, touched, submitAttempted],
  );

  const filtered = issues.filter((i) =>
    filter ? i.label.toLowerCase().includes(filter.toLowerCase()) : true,
  );

  const passing = issues.filter((i) => i.pass && !i.pending).length;
  const warnings = issues.filter((i) => !i.pass && !i.pending && i.severity === "warning").length;
  const blockers = issues.filter((i) => !i.pass && !i.pending && i.severity === "critical").length;

  const hasWarnings = warnings > 0 || blockers > 0;
  const allPass = issues.length > 0 && blockers === 0 && warnings === 0;

  return (
    <aside
      className={`p-4 text-[12px] rounded-xl border ${
        allPass
          ? "border-emerald-500/20 bg-emerald-500/[0.06]"
          : hasWarnings
            ? "border-amber-500/20 bg-amber-500/[0.06]"
            : "border-[var(--esg-glass-border)] bg-white/[0.02]"
      }`}
      data-testid="esg-validation-panel"
    >
      <div className="flex items-center gap-2 text-[var(--esg-text)] font-semibold text-[11px] uppercase tracking-wider mb-2">
        Validation
        <span className="ml-auto text-[10px] font-normal normal-case text-[var(--esg-text3)]">
          {passing} of {issues.length} passing · {warnings} warnings · {blockers} blockers
        </span>
      </div>
      <input
        type="search"
        placeholder="Filter rules…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-3 px-2 py-1 rounded bg-[var(--esg-input-bg,#0e0e10)] border border-[var(--esg-input-border,#2c2c2e)] text-[11px]"
      />
      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {filtered.map((issue) => (
          <li key={issue.id} className="flex items-start gap-2">
            <IssueIcon issue={issue} />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                className="text-left text-[var(--esg-text)] leading-snug hover:underline"
                onClick={() => issue.sectionId && onSelectSection?.(issue.sectionId)}
              >
                {issue.label}
              </button>
              <div className="text-[10px] text-[var(--esg-text3)]">
                {issue.pending ? "Pending input" : `Expected ${issue.expected} · ${issue.actual}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {activeSectionId ? (
        <p className="text-[10px] text-[var(--esg-text3)] mt-3">Active: {activeSectionId}</p>
      ) : null}
    </aside>
  );
}

function IssueIcon({ issue }: { issue: { pass: boolean; pending?: boolean; severity: string } }) {
  if (issue.pending) {
    return <Circle className="h-3.5 w-3.5 text-[#48484a] shrink-0 mt-0.5" />;
  }
  if (issue.pass) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />;
  }
  if (issue.severity === "critical") {
    return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />;
  }
  return <AlertTriangle className="h-3.5 w-3.5 text-amber-300 shrink-0 mt-0.5" />;
}
