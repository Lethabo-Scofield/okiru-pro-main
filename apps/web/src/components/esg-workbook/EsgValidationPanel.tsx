import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, XCircle } from "lucide-react";
import { validateEsgWorkbook } from "@/lib/esgValidation";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { useEsgStore } from "../../../EsgToolkit/src/lib/esgStore";

type Props = {
  workbook?: EsgWorkbookData | null;
  /** The open section (kept for callers; the panel no longer prints its id). */
  activeSectionId?: string;
  onSelectSection?: (sectionId: string) => void;
  /** Open on arrival — off by default: the count in the summary says when to look. */
  defaultOpen?: boolean;
};

export function EsgValidationPanel({
  workbook = null,
  onSelectSection,
  defaultOpen = false,
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

  // Folded behind its count: thirty rules, most of them waiting for input
  // nobody has typed yet, stacked under the section list was a wall on every
  // visit. The count says whether there is anything to open it for.
  return (
    <aside
      className={`text-[12px] rounded-xl border ${
        blockers > 0
          ? "border-amber-500/20 bg-amber-500/[0.06]"
          : "border-[var(--esg-glass-border)] bg-white/[0.02]"
      }`}
      data-testid="esg-validation-panel"
      data-all-pass={allPass ? "" : undefined}
      data-has-warnings={hasWarnings ? "" : undefined}
    >
      <details className="group" open={defaultOpen}>
      <summary
        className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[var(--esg-text)] font-semibold text-[11px] uppercase tracking-wider [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-xl"
        data-testid="esg-validation-summary"
      >
        <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
        Checks
        <span className="ml-auto text-[10px] font-normal normal-case text-[var(--esg-text3)]">
          {passing} of {issues.length} passing
          {warnings > 0 ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}
          {blockers > 0 ? ` · ${blockers} blocker${blockers === 1 ? "" : "s"}` : ""}
        </span>
      </summary>
      <div className="px-4 pb-4">
      <input
        type="search"
        placeholder="Filter rules…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-3 px-2 py-1 rounded bg-[var(--esg-input-bg,#0e0e10)] border border-[var(--esg-input-border,rgba(255,255,255,0.07))] text-[11px]"
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
      </div>
      </details>
    </aside>
  );
}

function IssueIcon({ issue }: { issue: { pass: boolean; pending?: boolean; severity: string } }) {
  if (issue.pending) {
    return <Circle className="h-3.5 w-3.5 text-[color:var(--muted)] shrink-0 mt-0.5" />;
  }
  if (issue.pass) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />;
  }
  if (issue.severity === "critical") {
    return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />;
  }
  return <AlertTriangle className="h-3.5 w-3.5 text-amber-300 shrink-0 mt-0.5" />;
}
