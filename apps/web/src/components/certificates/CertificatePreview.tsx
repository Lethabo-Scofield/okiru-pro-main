/**
 * Look at the certificate, not just at what we say it says.
 *
 * Raised in the 18 September review. When the importer matches a supplier to
 * the registry it fills in a B-BBEE level and an expiry date, and those two
 * numbers move the procurement score. The only way to check them was to trust
 * the match — the certificate itself was a download, if you could find it.
 *
 * A match is a claim about a document. Anything that makes a claim should be
 * able to show its working, so this opens the actual PDF beside the row it
 * filled in.
 *
 * The file is fetched through /api/certificates/:id/view, which returns a
 * short-lived signed URL rather than the bytes. The URL is deliberately not
 * kept: it expires in minutes, and re-asking is cheaper than reasoning about a
 * stale one.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, FileText, Loader2, X } from "lucide-react";

interface ViewResponse {
  url?: string;
  content_type?: string;
  file_name?: string;
  expires_in?: number;
}

interface Props {
  /** Registry id of the certificate to show. Null closes the preview. */
  certificateId: string | null;
  /** What the caller called this supplier, shown so the match can be judged. */
  supplierName?: string | null;
  /** The registry's name for it — the other half of that judgement. */
  matchedName?: string | null;
  onClose: () => void;
}

export function CertificatePreview({ certificateId, supplierName, matchedName, onClose }: Props) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "ready"; view: ViewResponse } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const load = useCallback(async (id: string) => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(id)}/view`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The reasons differ and the user can act on the difference: a missing
        // file is our problem, a 403 is theirs to raise with an administrator.
        const message =
          res.status === 404
            ? "This certificate's file is not in storage."
            : res.status === 403
              ? "You do not have permission to open this certificate."
              : (body as { error?: { message?: string }; message?: string })?.error?.message ??
                (body as { message?: string })?.message ??
                "Could not open the certificate.";
        setState({ kind: "error", message });
        return;
      }
      const view = ((body as { data?: ViewResponse }).data ?? body) as ViewResponse;
      if (!view.url) {
        setState({ kind: "error", message: "No viewable file was returned for this certificate." });
        return;
      }
      setState({ kind: "ready", view });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not reach the certificate store.",
      });
    }
  }, []);

  useEffect(() => {
    if (!certificateId) {
      setState({ kind: "idle" });
      return;
    }
    void load(certificateId);
  }, [certificateId, load]);

  useEffect(() => {
    if (!certificateId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [certificateId, onClose]);

  if (!certificateId) return null;

  const view = state.kind === "ready" ? state.view : null;
  const isImage = view?.content_type?.startsWith("image/");

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Certificate preview"
      onClick={onClose}
      data-testid="certificate-preview"
    >
      <div
        className="flex h-full max-h-[86vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-white/[0.10] bg-[#141416] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-white/[0.08] px-5 py-3.5">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-white">
              {matchedName || view?.file_name || "Certificate"}
            </p>
            {/* Both names, because the question being answered here is "is this
                the right company?" and one name cannot answer it. */}
            {supplierName && matchedName && supplierName !== matchedName && (
              <p className="mt-0.5 truncate text-[12px] text-[color:var(--muted)]">
                Matched from your row: {supplierName}
              </p>
            )}
          </div>
          {view?.url && (
            <a
              href={view.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg border border-white/[0.10] px-2.5 py-1.5 text-[12px] text-[color:var(--body)] transition-colors hover:border-white/25 hover:text-white"
              data-testid="certificate-preview-open"
            >
              <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
              Open in a tab
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close certificate preview"
            className="shrink-0 rounded-lg p-1.5 text-[color:var(--muted)] transition-colors hover:bg-white/[0.06] hover:text-white"
            data-testid="certificate-preview-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#0c0c0e]">
          {state.kind === "loading" && (
            <p className="flex items-center gap-2 text-[13px] text-[color:var(--body)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Fetching the certificate
            </p>
          )}

          {state.kind === "error" && (
            <div className="max-w-[360px] px-6 text-center">
              <AlertTriangle className="mx-auto h-6 w-6 text-amber-300" aria-hidden />
              <p className="mt-3 text-[13px] text-[color:var(--body)]">{state.message}</p>
              <button
                type="button"
                onClick={() => void load(certificateId)}
                className="mt-4 rounded-lg border border-white/[0.10] px-3 py-1.5 text-[12px] text-[color:var(--body)] transition-colors hover:border-white/25 hover:text-white"
              >
                Try again
              </button>
            </div>
          )}

          {view?.url && (isImage ? (
            <img
              src={view.url}
              alt={view.file_name || "Certificate"}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <iframe
              src={view.url}
              title={view.file_name || "Certificate"}
              className="h-full w-full border-0"
              data-testid="certificate-preview-frame"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default CertificatePreview;
