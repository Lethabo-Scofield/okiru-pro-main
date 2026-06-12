import { useMemo } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { missingIssuesForEsgSection } from "@/lib/esgValidation";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import type { EsgTouchedState } from "@/lib/esg/esgValidationRules";

type Props = {
  workbook: EsgWorkbookData | null;
  touched: EsgTouchedState;
  sectionId: string;
  sectionTitle?: string;
};

export function EsgSectionMissingPanel({ workbook, touched, sectionId, sectionTitle }: Props) {
  const missing = useMemo(
    () => missingIssuesForEsgSection(workbook, touched, sectionId),
    [workbook, touched, sectionId],
  );

  if (!workbook) return null;

  const complete = missing.length === 0;

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-[12px] ${
        complete
          ? "border-emerald-500/20 bg-emerald-500/[0.06]"
          : "border-amber-500/25 bg-amber-500/[0.06]"
      }`}
      data-testid="esg-section-missing-panel"
    >
      <div className="flex items-start gap-2">
        {complete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--esg-text)]">
            {complete
              ? `“${sectionTitle ?? sectionId}” — required inputs look complete`
              : `To complete “${sectionTitle ?? sectionId}”`}
          </p>
          {complete ? (
            <p className="text-[11px] text-[var(--esg-text3)] mt-0.5">
              No missing required fields for submit on this section.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-[var(--esg-text3)] mt-0.5">
                Missing for submit ({missing.length}):
              </p>
              <ul className="mt-1.5 space-y-1 list-disc list-inside text-[var(--esg-text2)]">
                {missing.map((issue) => (
                  <li key={issue.id} data-testid={`esg-missing-${issue.id}`}>
                    {issue.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
