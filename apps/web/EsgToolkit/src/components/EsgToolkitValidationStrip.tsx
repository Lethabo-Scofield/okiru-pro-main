import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { validateEsgWorkbook } from "@/lib/esgValidation";
import { useEsgStore } from "../lib/esgStore";

type Props = {
  sectionKey?: string;
};

/** Compact validation — silent until user clicks Validate or after save attempt. */
export function EsgToolkitValidationStrip({ sectionKey }: Props) {
  const workbook = useEsgStore((s) => s.workbook);
  const touched = useEsgStore((s) => s.touched);
  const submitAttempted = useEsgStore((s) => s.submitAttempted);
  const validationExpanded = useEsgStore((s) => s.validationExpanded);
  const setValidationExpanded = useEsgStore((s) => s.setValidationExpanded);
  const [localExpanded, setLocalExpanded] = useState(false);

  const expanded = validationExpanded || localExpanded || submitAttempted;

  const issues = useMemo(
    () => validateEsgWorkbook(workbook, touched, expanded ? "live" : "silent"),
    [workbook, touched, expanded],
  );

  const scoped = sectionKey
    ? issues.filter((i) => !i.sectionId || i.sectionId === sectionKey)
    : issues;

  const warnings = scoped.filter((i) => !i.pass && !i.pending && i.severity === "warning");
  const blockers = scoped.filter((i) => !i.pass && !i.pending && i.severity === "critical");

  if (!expanded) {
    return (
      <div
        className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[var(--esg-glass-border)] bg-white/[0.02] text-[11px] text-[var(--esg-text3)]"
        data-testid="esg-validation-strip-collapsed"
      >
        <span>Validation runs on demand in toolkit — edits are never blocked.</span>
        <button
          type="button"
          onClick={() => {
            setLocalExpanded(true);
            setValidationExpanded(true);
          }}
          className="shrink-0 px-2.5 py-1 rounded-full border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
          data-testid="esg-validate-btn"
        >
          Validate
        </button>
      </div>
    );
  }

  if (warnings.length === 0 && blockers.length === 0) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] text-[11px] text-emerald-300"
        data-testid="esg-validation-strip-ok"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        No warnings for {sectionKey ? "this section" : "workbook"}.
      </div>
    );
  }

  return (
    <div
      className="px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] text-[11px]"
      data-testid="esg-validation-strip-warnings"
    >
      <div className="flex items-center gap-2 text-amber-200 font-medium mb-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {warnings.length} warning{warnings.length === 1 ? "" : "s"}
        {blockers.length ? ` · ${blockers.length} blocker${blockers.length === 1 ? "" : "s"}` : ""}
      </div>
      <ul className="space-y-1 text-[var(--esg-text2)] max-h-28 overflow-y-auto">
        {[...blockers, ...warnings].slice(0, 8).map((issue) => (
          <li key={issue.id}>{issue.label}</li>
        ))}
      </ul>
    </div>
  );
}
