/**
 * A PDF drawn page by page onto canvases with pdf.js — not handed to the
 * browser's built-in viewer in an iframe.
 *
 * The iframe was the reason the document could not be fact-checked: in
 * production the CSP blocked the blob: frame (a blank grey box), Android
 * Chrome has no in-frame PDF viewer at all, and embedded browsers download a
 * PDF instead of showing it. Drawing the pages ourselves works everywhere the
 * app does. If pdf.js itself cannot open the file, `onFail` lets the caller
 * fall back to the iframe.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/** Enough for any certificate, register or AFS; a 200-page ledger shows its start. */
const MAX_PAGES = 40;

export function PdfPages({
  blob,
  name,
  onFail,
  focusPage,
}: {
  blob: Blob;
  name: string;
  onFail: () => void;
  /** Scroll to this page (1-based) — a value's citation. `nonce` re-scrolls to the same page. */
  focusPage?: { page: number; nonce: number } | null;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<{ total: number; shown: number } | null>(null);
  const [rendered, setRendered] = useState(0);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    el.replaceChildren();
    setPages(null);
    setRendered(0);
    let cancelled = false;
    let destroy: (() => void) | null = null;

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
        }
        // No eval: the production CSP has no 'unsafe-eval', and pdf.js would
        // otherwise trip it probing for compiled font rendering.
        const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        if (cancelled) return;
        const shown = Math.min(doc.numPages, MAX_PAGES);
        setPages({ total: doc.numPages, shown });

        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= shown; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          // Fit the pane's width, measured per page so a resize mid-render is honoured.
          const width = Math.max(280, el.clientWidth - 24);
          const scale = width / page.getViewport({ scale: 1 }).width;
          const viewport = page.getViewport({ scale: scale * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
          canvas.className = "mx-auto mb-3 block rounded-[3px] bg-white shadow-[0_1px_8px_rgba(0,0,0,0.5)]";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${name}, page ${n} of ${doc.numPages}`);
          canvas.dataset.page = String(n);
          el.appendChild(canvas);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (!cancelled) setRendered(n);
        }
      } catch {
        if (!cancelled) failRef.current();
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [blob, name]);

  // A citation asks for a page: bring it into view once it has been drawn.
  useEffect(() => {
    if (!focusPage || focusPage.page > rendered) return;
    const canvas = holder.current?.querySelector<HTMLElement>(`[data-page="${focusPage.page}"]`);
    canvas?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [focusPage, rendered]);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#1a1a1c] px-3 pt-3" data-testid="pdf-pages">
      {!pages && (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-[color:var(--body)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening the document…
        </div>
      )}
      <div ref={holder} />
      {pages && pages.total > pages.shown && (
        <p className="pb-3 text-center text-[11.5px] text-[color:var(--muted)]">
          Showing the first {pages.shown} of {pages.total} pages — download the file to see the rest.
        </p>
      )}
    </div>
  );
}

export default PdfPages;
