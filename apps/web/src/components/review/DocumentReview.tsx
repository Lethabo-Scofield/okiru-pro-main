/**
 * Review your documents — optional, side by side.
 *
 * Left: every document with a plain verdict (read / needs a look / not read),
 * worst first. Middle: the document itself. Right: what we took from it, what
 * we read but could not place, and for anything we could not read, why and
 * what to do — with the upload a fix needs one click away.
 *
 * Reviewing is never required. Building the scorecard stays one click away
 * outside this panel; what is left here stays with the company's documents
 * for a teammate to pick up.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Check, CircleSlash, Plus, Upload } from "lucide-react";
import { DocumentPreview } from "./DocumentPreview";
import { reviewCounts, type ReviewDocument, type ReviewState } from "@/lib/documentReview";

const STATE_LABEL: Record<ReviewState, string> = {
  read: "Read",
  "needs-look": "Needs a look",
  "not-read": "Not read",
};

function StateIcon({ state }: { state: ReviewState }) {
  if (state === "read") return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
  if (state === "needs-look") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
  return <CircleSlash className="h-3.5 w-3.5 shrink-0 text-red-400" />;
}

export interface DocumentReviewProps {
  documents: ReviewDocument[];
  /** This session's upload for a document, when we still have it. */
  fileFor: (filename: string) => File | null;
  /** The library id for a document, for the preview once the upload is gone. */
  documentIdFor: (filename: string) => string | null;
  /** Open the file picker — a replacement or a forgotten document. Absent where no upload is possible. */
  onAddDocuments?: () => void;
  /** Documents the scorecard usually needs that this pack doesn't have. */
  stillToAdd?: string[];
  /** Totals that were read but need per-person rows to score. */
  needsDetail?: string[];
}

export function DocumentReview({ documents, fileFor, documentIdFor, onAddDocuments, stillToAdd = [], needsDetail = [] }: DocumentReviewProps) {
  const [selected, setSelected] = useState<string | null>(documents[0]?.filename ?? null);
  const counts = useMemo(() => reviewCounts(documents), [documents]);
  const doc = documents.find((d) => d.filename === selected) ?? documents[0] ?? null;

  if (documents.length === 0) return null;

  return (
    <section className="mt-6" data-testid="document-review" aria-label="Review your documents">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            Review your documents
            <span className="rounded-full border border-white/[0.12] px-2 py-0.5 text-[10.5px] font-medium text-[color:var(--body)]">
              Optional
            </span>
          </h4>
          <p className="mt-0.5 text-[12px] leading-5 text-[color:var(--body)]">
            You can build now and review later — anything left here stays with the company's documents for your team.
          </p>
        </div>
        <p className="text-[12px] text-[color:var(--body)]" data-testid="review-counts">
          {counts.read} read · {counts["needs-look"]} need{counts["needs-look"] === 1 ? "s" : ""} a look · {counts["not-read"]} not read
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* The documents, worst first. */}
        <div className="space-y-3">
          <ul className="overflow-hidden rounded-2xl border border-[color:var(--rule)] bg-[color:var(--ink-2)]" role="listbox" aria-label="Documents">
            {documents.map((d) => {
              const active = d.filename === doc?.filename;
              return (
                <li key={d.filename}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelected(d.filename)}
                    className={`flex w-full items-start gap-2 border-b border-white/[0.05] px-3 py-2.5 text-left last:border-b-0 ${
                      active ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"
                    }`}
                    data-testid={`review-doc-${d.filename}`}
                  >
                    <StateIcon state={d.state} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-[#e5e5ea]">{d.filename}</span>
                      <span className="block truncate text-[11px] text-[color:var(--muted)]">
                        {STATE_LABEL[d.state]}
                        {d.summary ? ` · ${d.summary}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {(stillToAdd.length > 0 || needsDetail.length > 0) && (
            <div className="rounded-2xl border border-[color:var(--rule)] bg-[color:var(--ink-2)] p-3" data-testid="review-still-to-add">
              <p className="text-[12px] font-semibold text-white">Still worth adding</p>
              <ul className="mt-1.5 space-y-1">
                {stillToAdd.map((label) => (
                  <li key={label} className="text-[11.5px] leading-5 text-[color:var(--body)]">{label}</li>
                ))}
                {needsDetail.map((line) => (
                  <li key={line} className="text-[11.5px] leading-5 text-amber-200/80">{line}</li>
                ))}
              </ul>
              {onAddDocuments && (
                <>
                  <button
                    type="button"
                    onClick={onAddDocuments}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-3 py-1.5 text-[12px] font-medium text-[color:var(--body)] hover:bg-white/[0.05]"
                    data-testid="review-add-documents"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add documents
                  </button>
                  <p className="mt-1.5 text-[10.5px] text-[color:var(--muted)]">Only new documents are read and charged.</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* The selected document, beside what we took from it. */}
        {doc && (
          <div
            className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[color:var(--rule)] xl:flex-row"
            data-testid="review-detail"
          >
            <div className="xl:w-1/2 xl:border-r xl:border-[color:var(--rule)]">
              <DocumentPreview name={doc.filename} file={fileFor(doc.filename)} documentId={documentIdFor(doc.filename)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--ink-3)] p-4 xl:max-h-[640px]">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--muted)]">
                {doc.documentType || "Document"}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[13.5px] font-semibold text-white">
                <StateIcon state={doc.state} /> {STATE_LABEL[doc.state]}
                {doc.summary ? <span className="font-normal text-[color:var(--body)]"> · {doc.summary}</span> : null}
              </p>

              {doc.problems.length > 0 && (
                <div className="mt-3 space-y-2">
                  {doc.problems.map((p, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border px-3 py-2.5 ${
                        doc.state === "not-read" ? "border-red-400/25 bg-red-500/[0.06]" : "border-amber-400/25 bg-amber-500/[0.06]"
                      }`}
                      data-testid="review-problem"
                    >
                      <p className="text-[12.5px] font-semibold text-white">{p.headline}</p>
                      {p.detail && <p className="mt-0.5 text-[11.5px] leading-5 text-[color:var(--body)]">{p.detail}</p>}
                      <p className="mt-1 text-[11.5px] leading-5 text-[color:var(--body)]">{p.fix}</p>
                      {p.replace && onAddDocuments && (
                        <button
                          type="button"
                          onClick={onAddDocuments}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0e0e10] hover:bg-[#f2f2f7]"
                          data-testid="review-upload-replacement"
                        >
                          <Upload className="h-3.5 w-3.5" /> Upload a replacement
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {doc.values.length > 0 && (
                <div className="mt-4" data-testid="review-values">
                  <p className="text-[12px] font-semibold text-white">What we took from it</p>
                  <dl className="mt-1.5 divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
                    {doc.values.map((v, i) => (
                      <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 px-3 py-1.5">
                        <dt className="truncate text-[11.5px] text-[color:var(--muted)]" title={v.label}>{v.label}</dt>
                        <dd className="min-w-0 text-[11.5px] text-[#e5e5ea]">
                          <span className="break-words">{v.value}</span>
                          {v.source && (
                            <span className="mt-0.5 block truncate text-[10.5px] italic text-[color:var(--muted)]" title={v.source}>
                              “{v.source}”
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {doc.unplaced.length > 0 && (
                <div className="mt-4" data-testid="review-unplaced">
                  <p className="text-[12px] font-semibold text-white">Read, but not placed in the workbook</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-[color:var(--body)]">
                    Left blank rather than guessed — you can place these yourself in the workbook.
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {doc.unplaced.map((v, i) => (
                      <li key={i} className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[11.5px] leading-5">
                        <span className="text-[color:var(--muted)]">{v.label}:</span>{" "}
                        <span className="text-[#e5e5ea]">{v.value}</span>
                        {v.source && <span className="block text-[11px] text-amber-200/75">{v.source}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {doc.notFound.length > 0 && (
                <div className="mt-4" data-testid="review-not-found">
                  <p className="text-[12px] font-semibold text-white">Not found in this document</p>
                  <p className="mt-1 text-[11.5px] leading-5 text-[color:var(--body)]">
                    {doc.notFound.join(" · ")} — fill these in on the workbook if you have them.
                  </p>
                </div>
              )}

              {doc.state !== "not-read" && doc.values.length === 0 && doc.unplaced.length === 0 && (
                <p className="mt-4 text-[11.5px] text-[color:var(--body)]">
                  This document fed rows into the workbook; open the workbook to see them.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default DocumentReview;
