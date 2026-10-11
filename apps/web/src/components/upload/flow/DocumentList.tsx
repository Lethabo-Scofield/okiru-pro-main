/**
 * The one list of files in the parser flow.
 *
 * Staging used to show the files twice (a side panel and a table), with seven
 * different status words between them — Waiting, Digital, Scan, Pricing,
 * Queued, Not read yet, Sizing — for what is one fact: not read yet. Now each
 * row is a name, ONE of five status words, and its own action:
 *
 *   Ready to read · Reading · Read · Needs a look · Couldn't read
 *
 * A file that could not be read says so on its own row, with the way on
 * (Choose another file / Remove) next to it — not as a red line somewhere below the fold.
 * Where a row has more to say (the checklist group it was filed under, its
 * pages, that it is a scan) it sits behind the row's own "details".
 */
import { AlertTriangle, Check, CircleSlash, FileText, Loader2, X } from "lucide-react";
import { textButton } from "./buttonStyles";

export type DocumentStatus = "ready" | "reading" | "read" | "needs-look" | "failed";

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  ready: "Ready to read",
  reading: "Reading",
  read: "Read",
  "needs-look": "Needs a look",
  failed: "Couldn't read",
};

export interface DocumentListRow {
  name: string;
  status: DocumentStatus;
  /** Shown behind the row's details: "Ownership · 3 pages · scanned". */
  details?: string[];
  /** What went wrong with THIS file, in plain words. */
  error?: string | null;
  /** An unread file can be taken off; a read one is part of the result. */
  removable: boolean;
  /** Fields the read could not find in this file (B-BBEE): one amber line. */
  gaps?: string | null;
}

export interface DocumentListProps {
  testIdPrefix: "" | "esg-";
  rows: DocumentListRow[];
  onRemove: (name: string) => void;
  /**
   * Open the file picker so a better copy can be added. It does not take the
   * failed file off (Remove does), so the button says "Choose another file",
   * not "Replace".
   */
  onReplace?: () => void;
  /** Nothing can change while a read is running. */
  locked?: boolean;
  className?: string;
}

function StatusWord({ status }: { status: DocumentStatus }) {
  const icon =
    status === "reading" ? (
      <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />
    ) : status === "read" ? (
      <Check className="h-3 w-3 text-emerald-400" aria-hidden />
    ) : status === "needs-look" ? (
      <AlertTriangle className="h-3 w-3 text-amber-400" aria-hidden />
    ) : status === "failed" ? (
      <CircleSlash className="h-3 w-3 text-red-400" aria-hidden />
    ) : null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-[11.5px] ${
        status === "failed" ? "text-red-200" : status === "needs-look" ? "text-amber-200" : "text-[color:var(--body)]"
      }`}
      data-status={status}
    >
      {icon}
      {DOCUMENT_STATUS_LABEL[status]}
    </span>
  );
}

export function DocumentList({ testIdPrefix: p, rows, onRemove, onReplace, locked = false, className = "" }: DocumentListProps) {
  if (rows.length === 0) return null;
  const failedCount = rows.filter((row) => row.error).length;
  return (
    <>
    {/* One polite announcement for the batch, not one assertive alert per
        failed row: several failures in one read used to interrupt several times.
        Only there when something failed, so a running read keeps one status line. */}
    {failedCount > 0 && (
      <p className="sr-only" role="status" aria-live="polite" data-testid={`${p}document-list-status`}>
        {`${failedCount} ${failedCount === 1 ? "document" : "documents"} couldn't be read.`}
      </p>
    )}
    <ul
      className={`divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-[color:var(--ink-2)] ${className}`}
      aria-label="Your documents"
      data-testid={`${p}document-list`}
    >
      {rows.map((row) => {
        const hasDetails = (row.details?.length ?? 0) > 0;
        const name = (
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden />
            <span className="truncate text-[13px] font-medium text-[color:var(--hi)]" title={row.name}>
              {row.name}
            </span>
          </span>
        );
        return (
          <li key={row.name} className="px-3.5 py-2.5" data-testid={`${p}document-row-${row.name}`}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {hasDetails ? (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 [&::-webkit-details-marker]:hidden">
                      {name}
                    </summary>
                    <p className="mt-0.5 pl-6 text-[11px] text-[color:var(--body)]">{row.details!.join(" · ")}</p>
                  </details>
                ) : (
                  name
                )}
              </div>
              <StatusWord status={row.status} />
              {row.removable ? (
                <button
                  type="button"
                  disabled={locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(row.name);
                  }}
                  className="shrink-0 rounded-md p-1.5 text-[color:var(--muted)] transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-30"
                  aria-label={`Remove ${row.name}`}
                  data-testid={`${p}remove-${row.name}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : (
                <span className="w-[26px] shrink-0" aria-hidden />
              )}
            </div>
            {row.error && (
              <div
                className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[11.5px] leading-5 text-red-200"
                data-testid={`${p}document-error-${row.name}`}
              >
                <span className="min-w-0">{row.error}</span>
                {onReplace && (
                  <button type="button" disabled={locked} onClick={onReplace} className={textButton("sm")}>
                    Choose another file
                  </button>
                )}
                {row.removable && (
                  <button type="button" disabled={locked} onClick={() => onRemove(row.name)} className={textButton("sm")}>
                    Remove
                  </button>
                )}
              </div>
            )}
            {row.gaps && (
              <p
                className="mt-1 flex items-start gap-1.5 pl-6 text-[11px] leading-5 text-amber-200/80"
                data-testid={`missing-content-${row.name}`}
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/80" aria-hidden />
                <span>{row.gaps}</span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
    </>
  );
}

export default DocumentList;
