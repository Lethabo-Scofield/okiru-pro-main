/**
 * The document itself, shown beside what we took from it.
 *
 * Any file a user uploaded opens here:
 * - PDFs are drawn page by page, pictures shown as pictures;
 * - spreadsheets render as a table of their first rows, one tab per sheet;
 * - Word (.docx, and old .doc where its text can be found), PowerPoint,
 *   Markdown, e-mail (.eml), web pages, CSV and text files are converted in the
 *   browser (lib/documentPreview) and drawn as formatted, readable text;
 * - anything else says so plainly and offers the download.
 *
 * The file comes from the upload in this session, or — after leaving and coming
 * back — from the document library. Large files show their start and point to
 * the download for the rest, so the page never freezes on a 300-page manual.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, ImageIcon, Loader2, Mail, Presentation } from "lucide-react";
import { PdfPages } from "./PdfPages";
import { RichDocument } from "./RichDocument";
import {
  convertDocument,
  isRichKind,
  previewKind as kindOf,
  readBytes,
  TooLargeToPreview,
  type PreviewKind,
  type RichDoc,
} from "@/lib/documentPreview";

/** What kind of preview a file gets, by its name (and type, when the name has no extension). */
export function previewKind(name: string, mimeType?: string | null): PreviewKind {
  return kindOf(name, mimeType);
}

const MAX_ROWS = 60;
const MAX_COLS = 14;

interface Sheet {
  name: string;
  rows: string[][];
  totalRows: number;
}

async function readSheets(blob: Blob): Promise<Sheet[]> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await readBytes(blob), { type: "array", cellDates: true });
  return book.SheetNames.slice(0, 20).map((name) => {
    const all = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, blankrows: false, defval: "" });
    return {
      name,
      totalRows: all.length,
      rows: all.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? "")))),
    };
  });
}

/**
 * A place in the document a value was read from — a page, or a workbook sheet.
 * `nonce` changes on every request, so asking for the same place twice still
 * brings it back into view.
 */
export interface PreviewFocus {
  page?: number | null;
  sheet?: string | null;
  nonce: number;
}

type Unavailable = "type" | "too-large" | "unreadable";

const UNAVAILABLE_TEXT: Record<Unavailable, string> = {
  type: "Preview not available for this file type",
  "too-large": "This file is too large to preview here",
  unreadable: "We couldn't open this file for preview",
};

function KindIcon({ kind }: { kind: PreviewKind }) {
  const cls = "h-4 w-4 shrink-0 text-[color:var(--body)]";
  if (kind === "spreadsheet" || kind === "csv") return <FileSpreadsheet className={cls} aria-hidden />;
  if (kind === "image") return <ImageIcon className={cls} aria-hidden />;
  if (kind === "email") return <Mail className={cls} aria-hidden />;
  if (kind === "slides") return <Presentation className={cls} aria-hidden />;
  return <FileText className={cls} aria-hidden />;
}

export function DocumentPreview({
  name,
  file,
  documentId,
  focus,
  showDownload = true,
}: {
  name: string;
  /** The upload from this session, when we still have it. */
  file: File | null;
  /** The document library id, used once the upload itself is gone. */
  documentId?: string | null;
  /** Show this page or sheet — a value's citation. */
  focus?: PreviewFocus | null;
  /** Off where the page already offers the download (the library page header). */
  showDownload?: boolean;
}) {
  const [blob, setBlob] = useState<Blob | null>(file);
  const kind = previewKind(name, file?.type || blob?.type);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [rich, setRich] = useState<RichDoc | null>(null);
  const [unavailable, setUnavailable] = useState<Unavailable | null>(null);
  /** pdf.js could not open it — fall back to the browser's own viewer. */
  const [pdfFallback, setPdfFallback] = useState(false);

  // The bytes: this session's upload, or the library copy.
  useEffect(() => {
    setSheets(null);
    setRich(null);
    setUnavailable(null);
    setSheetIndex(0);
    setFailed(false);
    setPdfFallback(false);
    if (file) {
      setBlob(file);
      return;
    }
    setBlob(null);
    if (!documentId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/parser-documents/${encodeURIComponent(documentId)}/download`, { credentials: "include" })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((b) => !cancelled && setBlob(b))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [file, documentId]);

  // Typed URL for inline display: a library download of a PDF arrives as
  // application/pdf, but re-wrap so the iframe/img never guesses.
  const url = useMemo(() => {
    if (!blob || (kind !== "pdf" && kind !== "image")) return null;
    const typed = kind === "pdf" ? new Blob([blob], { type: "application/pdf" }) : blob;
    return URL.createObjectURL(typed);
  }, [blob, kind]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    if (kind === "spreadsheet") {
      readSheets(blob)
        .then((s) => !cancelled && setSheets(s))
        .catch(() => !cancelled && setUnavailable("unreadable"));
    } else if (isRichKind(kind)) {
      convertDocument(blob, kind, name)
        .then((doc) => !cancelled && setRich(doc))
        .catch((err) => !cancelled && setUnavailable(err instanceof TooLargeToPreview ? "too-large" : "unreadable"));
    } else if (kind === "other") {
      setUnavailable("type");
    }
    return () => {
      cancelled = true;
    };
  }, [blob, kind, name]);

  const downloadHref = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (downloadHref) URL.revokeObjectURL(downloadHref);
  }, [downloadHref]);

  // A citation names a sheet: open its tab, once the sheets are read.
  useEffect(() => {
    if (!focus?.sheet || !sheets) return;
    const wanted = focus.sheet.trim().toLowerCase();
    const index = sheets.findIndex((s) => s.name.trim().toLowerCase() === wanted);
    if (index >= 0) setSheetIndex(index);
  }, [focus, sheets]);
  const focusPage = useMemo(
    () => (focus?.page != null ? { page: focus.page, nonce: focus.nonce } : null),
    [focus],
  );

  const sheet = sheets?.[sheetIndex];
  const downloadLink = (label: string, testId: string) =>
    downloadHref ? (
      <a
        href={downloadHref}
        download={name}
        data-testid={testId}
        className="font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        {label}
      </a>
    ) : null;

  return (
    <div className="flex h-full min-h-[320px] flex-col bg-[color:var(--ink-2)]" data-testid="document-preview" data-preview-kind={kind} data-clarity-mask="True">
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--rule)] px-4 py-2.5">
        <KindIcon kind={kind} />
        <span className="min-w-0 truncate text-[13px] font-medium text-white">{name}</span>
        {showDownload && downloadHref && (
          <a
            href={downloadHref}
            download={name}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded text-[12px] font-medium text-[color:var(--body)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Download
          </a>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {loading && (
          <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-[color:var(--body)]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Opening the document…
          </div>
        )}
        {!loading && !blob && (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] leading-5 text-[color:var(--body)]">
            {failed
              ? "We couldn't open this document for preview. It is still saved in your documents library."
              : "The preview isn't available here — the document is saved in your documents library."}
          </div>
        )}
        {blob && unavailable && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-[12.5px] leading-5 text-[color:var(--body)]" data-testid="document-preview-unavailable">
            <KindIcon kind={kind} />
            <p>
              {UNAVAILABLE_TEXT[unavailable]}
              {downloadHref ? <> — {downloadLink(unavailable === "too-large" ? "Download for the full file" : "Download", "document-preview-download")}</> : "."}
            </p>
          </div>
        )}
        {kind === "pdf" && blob && !pdfFallback && <PdfPages blob={blob} name={name} onFail={() => setPdfFallback(true)} focusPage={focusPage} />}
        {kind === "pdf" && url && pdfFallback && <iframe title={name} src={url} className="min-h-[420px] w-full flex-1 bg-[color:var(--ink-2)]" />}
        {kind === "image" && url && !unavailable && (
          <div className="flex flex-1 items-start justify-center overflow-auto p-3">
            <img src={url} alt={name} className="max-w-full rounded-md" onError={() => setUnavailable("type")} />
          </div>
        )}
        {(kind === "spreadsheet" || isRichKind(kind)) && blob && !sheets && !rich && !unavailable && (
          <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-[color:var(--body)]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {kind === "spreadsheet" ? "Reading the sheets…" : "Opening the document…"}
          </div>
        )}
        {rich && !unavailable && (
          <RichDocument doc={rich} fullFileAction={downloadLink("Download for the full file.", "document-preview-full-file")} />
        )}
        {kind === "spreadsheet" && sheets && (
          <div className="flex min-h-0 flex-1 flex-col">
            {sheets.length > 1 && (
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[color:var(--rule)] px-2 py-1.5" role="tablist">
                {sheets.map((s, i) => (
                  <button
                    key={s.name}
                    type="button"
                    role="tab"
                    aria-selected={i === sheetIndex}
                    data-testid={`document-preview-tab-${s.name}`}
                    onClick={() => setSheetIndex(i)}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-[11.5px] ${
                      i === sheetIndex ? "bg-white/[0.10] text-white" : "text-[color:var(--body)] hover:bg-white/[0.05]"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {sheet && (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-max min-w-full border-collapse text-[11.5px]" data-testid="document-preview-sheet">
                  <tbody>
                    {sheet.rows.map((row, r) => (
                      <tr key={r} className="border-b border-white/[0.05]">
                        <td className="sticky left-0 bg-[color:var(--ink-2)] px-2 py-1 text-right font-mono text-[10px] text-[color:var(--muted)]">
                          {r + 1}
                        </td>
                        {row.map((cell, c) => (
                          <td key={c} className="max-w-[220px] truncate px-2 py-1 text-[color:var(--body)]" title={cell}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sheet.totalRows > MAX_ROWS && (
                  <p className="px-3 py-2 text-[11px] text-[color:var(--body)]">
                    Showing the first {MAX_ROWS} of {sheet.totalRows.toLocaleString("en-ZA")} rows — download for the rest.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentPreview;
