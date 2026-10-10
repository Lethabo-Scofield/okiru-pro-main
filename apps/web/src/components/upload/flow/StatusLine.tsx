/**
 * While a paid read runs: one calm line, and the files behind "Show documents".
 *
 *   ◌ Reading 4 of 9 documents…                         Show documents
 *   ◌ Checking your documents against each other…  ▬▬▬▬▭▭  Show documents
 *
 * It replaces a banner, a per-file table with a shimmer sweeping across each
 * row, staggered fade-ins and a "stamp" on every verdict. Movement is what
 * says "still working"; one spinner and a count say it without the noise.
 * `role="status"` with `aria-live="polite"` reads the line out as it changes.
 */
import type { ReactNode, Ref } from "react";
import { Loader2 } from "lucide-react";
import { Disclosure } from "./Disclosure";

export interface StatusLineProps {
  testIdPrefix: "" | "esg-";
  /** Files this read covers. */
  total: number;
  /** Files read so far. */
  done: number;
  /** Files that could not be read so far. */
  failed: number;
  /** All files are read; the cross-document check is running. */
  checking: boolean;
  /** Progress through the cross-document check, when the server reports it. */
  checkProgress?: { done: number; total: number } | null;
  /** A dropped read being collected: replaces the line's words. */
  notice?: string | null;
  /** The per-file list. */
  children?: ReactNode;
  containerRef?: Ref<HTMLDivElement>;
}

/** The line's words, without the spinner — exported for the tests. */
export function statusLineText({
  total,
  done,
  failed,
  checking,
  checkProgress,
}: Pick<StatusLineProps, "total" | "done" | "failed" | "checking" | "checkProgress">): string {
  const couldNot = failed > 0 ? ` · ${failed} couldn't be read` : "";
  if (checking) {
    return checkProgress && checkProgress.total > 0
      ? `Checking your documents against each other… (${Math.min(checkProgress.done + 1, checkProgress.total)} of ${checkProgress.total})${couldNot}`
      : `Checking your documents against each other…${couldNot}`;
  }
  const current = Math.min(done + failed + 1, Math.max(total, 1));
  return `Reading ${current} of ${total} document${total === 1 ? "" : "s"}…${couldNot}`;
}

export function StatusLine({
  testIdPrefix: p,
  total,
  done,
  failed,
  checking,
  checkProgress,
  notice,
  children,
  containerRef,
}: StatusLineProps) {
  const percent =
    checking && checkProgress && checkProgress.total > 0
      ? Math.round((checkProgress.done / checkProgress.total) * 100)
      : !checking && total > 0
        ? Math.round(((done + failed) / total) * 100)
        : null;
  return (
    <div
      ref={containerRef}
      className="mt-3 rounded-[18px] border border-white/[0.08] bg-[color:var(--ink-3)] px-4 py-3"
      data-testid={`${p}extraction-phase`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[color:var(--body)] motion-reduce:animate-none" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px] font-medium text-white" role="status" aria-live="polite">
          {notice ? <span data-testid={`${p}read-resume-notice`}>{notice}</span> : statusLineText({ total, done, failed, checking, checkProgress })}
        </p>
        {percent != null && (
          <div
            className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Progress"
          >
            <div className="h-full rounded-full bg-white/60 transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      {children && (
        <Disclosure summary="Show documents" className="mt-2" summaryClassName="text-[12px]" testId={`${p}extraction-documents`}>
          {children}
        </Disclosure>
      )}
    </div>
  );
}

export default StatusLine;
