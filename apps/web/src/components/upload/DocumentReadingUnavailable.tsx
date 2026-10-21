import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

/** Served by the web server itself (server/documentReading.ts). */
const STATUS_URL = "/api/parser/availability";

/**
 * Can uploaded documents be read right now? `null` while asking. An
 * unanswered or failed lookup counts as available: the server still refuses a
 * read it cannot do, so a lost lookup must not hide a working upload.
 */
export function useDocumentReadingAvailable(): { available: boolean | null; message: string | null } {
  const [state, setState] = useState<{ available: boolean | null; message: string | null }>({ available: null, message: null });
  useEffect(() => {
    let cancelled = false;
    fetch(STATUS_URL, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { available?: boolean; message?: string } | null) => {
        if (cancelled) return;
        setState(body?.available === false
          ? { available: false, message: body.message ?? null }
          : { available: true, message: null });
      })
      .catch(() => { if (!cancelled) setState({ available: true, message: null }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

/** Shown in place of the upload surface while reading is switched off. */
export function DocumentReadingUnavailable({ message, testId }: { message: string | null; testId: string }) {
  return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-500/[0.06] px-4 py-4" role="status" data-testid={testId}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
        <div>
          <p className="text-[14px] font-semibold leading-5 text-amber-100">Reading documents is temporarily unavailable</p>
          <p className="mt-1 text-[13px] leading-5 text-[color:var(--body)]">
            {message ?? "You can still enter your figures on each scorecard page or import your completed Excel workbook."}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--body)]">No tokens are used while it is off.</p>
        </div>
      </div>
    </div>
  );
}
