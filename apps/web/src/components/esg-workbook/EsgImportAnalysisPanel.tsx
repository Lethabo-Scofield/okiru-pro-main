/**
 * The import, described — one panel, both doors.
 *
 * The create flow's Excel option and the in-workbook Import / bulk upload are
 * the same decision made in two places, so they render the same component
 * against the same analysis. Anything that appears in one and not the other is
 * a difference the user has to learn for no reason.
 *
 * Ordering is by what needs a DECISION, not by what is easiest to compute:
 * replacements first (the only genuinely irreversible part), then duplicates
 * and rule regressions, then the reassuring counts. A panel that leads with
 * "812 cells" trains people to skip it.
 *
 * Colour is never the only signal — every state carries a word.
 */
import { AlertTriangle, ArrowRight, CheckCircle2, FileWarning, Layers } from "lucide-react";
import type { EsgImportAnalysis } from "@/lib/esg/esgImportAnalysis";

interface Props {
  analysis: EsgImportAnalysis;
  /** Section id → the wording a practitioner recognises. */
  sectionLabels?: Record<string, string>;
  /** Cap on rows shown per group before "+N more". */
  sampleLimit?: number;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === "") return "empty";
  const text = String(value).trim();
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

export function EsgImportAnalysisPanel({ analysis, sectionLabels = {}, sampleLimit = 6 }: Props) {
  const label = (id: string) => sectionLabels[id] ?? id;
  const {
    overwrites, additions, unchanged, duplicates,
    newIssues, resolvedIssues, unmatchedSheets, warnings,
    sectionsCovered, sectionsUntouched, isPartial,
  } = analysis;

  return (
    <div className="space-y-3" data-testid="esg-import-analysis">
      {/* 1. The irreversible part, first. */}
      {overwrites.length > 0 ? (
        <section
          className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3"
          data-testid="esg-import-overwrites"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {overwrites.length} value{overwrites.length === 1 ? "" : "s"} already captured will be
            replaced
          </p>
          <ul className="mt-2 space-y-1">
            {overwrites.slice(0, sampleLimit).map((change) => (
              <li
                key={`${change.sectionId}:${change.cell}`}
                className="flex items-center gap-2 font-mono text-[11px] text-[var(--esg-text2,#8e8e93)]"
              >
                <span className="shrink-0">{label(change.sectionId)} {change.cell}</span>
                <span className="text-[#d1d1d6]">{cellText(change.before)}</span>
                <ArrowRight className="h-3 w-3 shrink-0" aria-label="becomes" />
                <span className="text-white">{cellText(change.after)}</span>
              </li>
            ))}
          </ul>
          {overwrites.length > sampleLimit ? (
            <p className="mt-1 text-[11px] text-[var(--esg-text3,#636366)]">
              +{overwrites.length - sampleLimit} more
            </p>
          ) : null}
        </section>
      ) : null}

      {/* 2. Things that are probably mistakes. */}
      {duplicates.length > 0 ? (
        <section
          className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3"
          data-testid="esg-import-duplicates"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-200">
            <FileWarning className="h-4 w-4 shrink-0" />
            {duplicates.length} value{duplicates.length === 1 ? " appears" : "s appear"} more than
            once in the file
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-[var(--esg-text2,#8e8e93)]">
            {duplicates.slice(0, sampleLimit).map((dup) => (
              <li key={`${dup.sectionId}:${dup.value}`}>
                <span className="font-mono text-[#d1d1d6]">{cellText(dup.value)}</span>
                {" in "}
                {label(dup.sectionId)} ({dup.cells.slice(0, 4).join(", ")})
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {newIssues.length > 0 ? (
        <section
          className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3"
          data-testid="esg-import-new-issues"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {newIssues.length} check{newIssues.length === 1 ? "" : "s"} this import would break
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-[var(--esg-text2,#8e8e93)]">
            {newIssues.slice(0, sampleLimit).map((issue) => (
              <li key={issue.id}>
                {issue.label}
                {issue.expected ? ` — expected ${issue.expected}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 3. Scope — what this upload does NOT touch. */}
      <section
        className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
        data-testid="esg-import-scope"
      >
        <p className="flex items-center gap-2 text-[13px] font-medium text-[#e5e5ea]">
          <Layers className="h-4 w-4 shrink-0" />
          {isPartial ? "Partial upload" : "Covers every section"}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--esg-text2,#8e8e93)]">
          {additions.length} new value{additions.length === 1 ? "" : "s"}
          {overwrites.length > 0 ? `, ${overwrites.length} replaced` : ""}
          {unchanged > 0 ? `, ${unchanged} already matching` : ""}
          {" across "}
          {sectionsCovered.map(label).join(", ") || "no sections"}.
          {isPartial ? (
            <>
              {" "}
              {sectionsUntouched.length} section{sectionsUntouched.length === 1 ? "" : "s"} left
              unchanged — importing part of a workbook never clears the rest.
            </>
          ) : null}
        </p>
      </section>

      {resolvedIssues.length > 0 ? (
        <p
          className="flex items-center gap-2 text-[11px] text-[var(--esg-acc-e,#1de9a0)]"
          data-testid="esg-import-resolved"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Resolves {resolvedIssues.length} outstanding check
          {resolvedIssues.length === 1 ? "" : "s"}.
        </p>
      ) : null}

      {unmatchedSheets.length > 0 ? (
        <p className="text-[11px] leading-5 text-[var(--esg-text2,#8e8e93)]">
          Left out because they match no workbook section: {unmatchedSheets.join(", ")}.
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <p className="text-[11px] leading-5 text-amber-300">{warnings.join(" · ")}</p>
      ) : null}
    </div>
  );
}

export default EsgImportAnalysisPanel;
