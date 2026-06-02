import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { validateEsgWorkbook } from "@/lib/esgValidation";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

type Props = {
  workbook?: EsgWorkbookData | null;
};

/** Critical Validation sheet rules (rows 5–11) — Phase 1. */
export function EsgValidationPanel({ workbook = null }: Props) {
  const issues = validateEsgWorkbook(workbook);
  const criticalFails = issues.filter((i) => i.severity === "critical" && !i.pass);

  return (
    <aside
      className="esg-glass-sm p-4 text-[12px] text-[var(--esg-text2)]"
      data-testid="esg-validation-panel"
    >
      <div className="flex items-center gap-2 text-[var(--esg-text)] font-semibold text-[11px] uppercase tracking-wider mb-3">
        <AlertCircle className="h-3.5 w-3.5 text-[var(--esg-acc-s)]" />
        Validation
        {criticalFails.length > 0 && (
          <span className="ml-auto text-[10px] text-red-400">{criticalFails.length} critical</span>
        )}
      </div>
      <ul className="space-y-2">
        {issues.map((issue) => (
          <li key={issue.id} className="flex items-start gap-2">
            {issue.pass ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--esg-acc-e)] shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="text-[var(--esg-text)] leading-snug">{issue.label}</div>
              <div className="text-[10px] text-[var(--esg-text3)]">
                Expected {issue.expected} · Actual {issue.actual}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
