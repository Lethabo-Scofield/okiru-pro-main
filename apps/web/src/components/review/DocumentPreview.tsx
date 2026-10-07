/**
 * The document itself, shown beside what we took from it.
 *
 * PDFs and images render inline; spreadsheets render as a table of their first
 * rows, one tab per sheet, so a register or a ledger can be checked against the
 * values without leaving the page. The file comes from the upload in this
 * session, or — after leaving and coming back — from the document library
 * (served only as PDF/image/plain text inline; everything else downloads).
 */
import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, ImageIcon, Loader2 } from "lucide-react";
import { PdfPages } from "./PdfPages";

type Kind = "pdf" | "image" | "spreadsheet" | "text" | "other";

export function previewKind(name: string): Kind {
  if (/\.pdf$/i.test(name)) return "pdf";
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return "image";
  if (/\.(xlsx|xlsm|xls)$/i.test(name)) return "spreadsheet";
  if (/\.(csv|txt)$/i.test(name)) return "text";
  return "other";
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
  const book = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true });
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

export function DocumentPreview({
  name,
  file,
  documentId,
  focus,
}: {
  name: string;
  /** The upload from this session, when we still have it. */
  file: File | null;
  /** The document library id, used once the upload itself is gone. */
  documentId?: string | null;
  /** Show this page or sheet — a value's citation. */
  focus?: PreviewFocus | null;
}) {
  const kind = previewKind(name);
  const [blob, setBlob] = useState<Blob | null>(file);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [text, setText] = useState<string | null>(null);
  /** pdf.js could not open it — fall back to the browser's own viewer. */
  const [pdfFallback, setPdfFallback] = useState(false);

  // The bytes: this session's upload, or the library copy.
  useEffect(() => {
    setSheets(null);
    setText(null);
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
        .catch(() => !cancelled && setFailed(true));
    } else if (kind === "text") {
      blob
        .text()
        .then((t) => !cancelled && setText(t.slice(0, 20_000)))
        .catch(() => !cancelled && setFailed(true));
    }
    return () => {
      cancelled = true;
    };
  }, [blob, kind]);

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

  const Icon = kind === "spreadsheet" ? FileSpreadsheet : kind === "image" ? ImageIcon : FileText;
  const sheet = sheets?.[sheetIndex];

  return (
    <div className="flex h-full min-h-[320px] flex-col bg-[#0d0d0d]" data-testid="document-preview" data-clarity-mask="True">
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--rule)] px-4 py-2.5">
        <Icon className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
        <span className="min-w-0 truncate text-[13px] font-medium text-white">{name}</span>
        {downloadHref && (
          <a
            href={downloadHref}
            download={name}
            className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#5e9bff] hover:underline"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {loading && (
          <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-[color:var(--body)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening the document…
          </div>
        )}
        {!loading && !blob && (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] leading-5 text-[color:var(--body)]">
            {failed
              ? "We couldn't open this document for preview. It is still saved in your documents library."
              : "The preview isn't available here — the document is saved in your documents library."}
          </div>
        )}
        {kind === "pdf" && blob && !pdfFallback && <PdfPages blob={blob} name={name} onFail={() => setPdfFallback(true)} focusPage={focusPage} />}
        {kind === "pdf" && url && pdfFallback && <iframe title={name} src={url} className="min-h-[420px] w-full flex-1 bg-[#111]" />}
        {kind === "image" && url && (
          <div className="flex flex-1 items-start justify-center overflow-auto p-3">
            <img src={url} alt={name} className="max-w-full rounded-md" />
          </div>
        )}
        {kind === "text" && text !== null && (
          <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[11.5px] leading-5 text-[color:var(--body)]">
            {text}
          </pre>
        )}
        {kind === "spreadsheet" && blob && !sheets && !failed && (
          <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-[color:var(--body)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the sheets…
          </div>
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
                        <td className="sticky left-0 bg-[#0d0d0d] px-2 py-1 text-right font-mono text-[10px] text-[color:var(--muted)]">
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
                  <p className="px-3 py-2 text-[11px] text-[color:var(--muted)]">
                    Showing the first {MAX_ROWS} of {sheet.totalRows.toLocaleString("en-ZA")} rows — download for the rest.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {kind === "other" && blob && (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-[color:var(--body)]">
            This kind of file can't be previewed here — use Download to open it.
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentPreview;
