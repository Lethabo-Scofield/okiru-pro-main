/**
 * Review your documents — optional, side by side, at a fixed height.
 *
 * A master-detail view, not a page that grows with the pack: the document list
 * on the left scrolls inside its own pane (grouped worst first), and the
 * selected document sits beside what we took from it, each pane scrolling on
 * its own. A 40-document pack is the same height as a 4-document one.
 *
 * Reviewing is never required. Building stays one click away outside this
 * panel; whatever is left here stays with the company's documents.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Check, CircleSlash, Plus, Upload } from "lucide-react";
import { DocumentPreview } from "./DocumentPreview";
import { EditableValue } from "./EditableValue";
import { reviewCounts, type ReviewDocument, type ReviewEdit, type ReviewState } from "@/lib/documentReview";

const STATE_LABEL: Record<ReviewState, string> = {
  read: "Read",
  "needs-look": "Needs a look",
  "not-read": "Not read",
};
const GROUP_ORDER: ReviewState[] = ["not-read", "needs-look", "read"];

function StateIcon({ state, className = "h-3.5 w-3.5" }: { state: ReviewState; className?: string }) {
  if (state === "read") return <Check className={`${className} shrink-0 text-emerald-400`} aria-hidden />;
  if (state === "needs-look") return <AlertTriangle className={`${className} shrink-0 text-amber-400`} aria-hidden />;
  return <CircleSlash className={`${className} shrink-0 text-red-400`} aria-hidden />;
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
  /**
   * Correct a value, or fill in a missing one, before building. Absent where
   * the review is read-only (the values are already in a workbook).
   */
  onEditValue?: (filename: string, edit: ReviewEdit, value: string) => void;
}

export function DocumentReview({
  documents,
  fileFor,
  documentIdFor,
  onAddDocuments,
  stillToAdd = [],
  needsDetail = [],
  onEditValue,
}: DocumentReviewProps) {
  const [selected, setSelected] = useState<string | null>(documents[0]?.filename ?? null);
  const counts = useMemo(() => reviewCounts(documents), [documents]);
  const groups = useMemo(
    () => GROUP_ORDER.map((state) => ({ state, docs: documents.filter((d) => d.state === state) })).filter((g) => g.docs.length > 0),
    [documents],
  );
  const doc = documents.find((d) => d.filename === selected) ?? documents[0] ?? null;

  if (documents.length === 0) return null;

  return (
    <section className="mt-4" data-testid="document-review" aria-label="Review your documents">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="text-[15px] font-semibold text-white">Review your documents</h4>
          <span className="rounded-full border border-white/[0.12] px-2 py-0.5 text-[10.5px] font-medium text-[color:var(--body)]">Optional</span>
          <span className="hidden text-[12px] text-[color:var(--muted)] sm:inline" data-testid="review-counts">
            {counts.read} read · {counts["needs-look"]} need{counts["needs-look"] === 1 ? "s" : ""} a look · {counts["not-read"]} not read
          </span>
        </div>
        {onAddDocuments && (
          <button
            type="button"
            onClick={onAddDocuments}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.12] px-3 py-1.5 text-[12px] font-medium text-[color:var(--body)] hover:bg-white/[0.05]"
            data-testid="review-add-documents"
          >
            <Plus className="h-3.5 w-3.5" /> Add documents
          </button>
        )}
      </div>

      {(stillToAdd.length > 0 || needsDetail.length > 0) && (
        <p className="mb-2.5 text-[12px] leading-5 text-[color:var(--body)]" data-testid="review-still-to-add">
          <span className="font-medium text-white">Not in this pack yet:</span> {[...stillToAdd, ...needsDetail].join(" · ")}
        </p>
      )}

      <div className="grid overflow-hidden rounded-2xl border border-[color:var(--rule)] lg:h-[min(76vh,780px)] lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* The documents — grouped, worst first, scrolling in their own pane. */}
        <nav
          className="max-h-[38vh] overflow-y-auto border-b border-[color:var(--rule)] bg-[color:var(--ink-2)] lg:max-h-none lg:border-b-0 lg:border-r"
          aria-label="Documents"
        >
          {groups.map((group) => (
            <div key={group.state}>
              <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-white/[0.05] bg-[color:var(--ink-2)] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted)]">
                <StateIcon state={group.state} className="h-3 w-3" /> {STATE_LABEL[group.state]} · {group.docs.length}
              </p>
              <ul role="listbox" aria-label={STATE_LABEL[group.state]}>
                {group.docs.map((d) => {
                  const active = d.filename === doc?.filename;
                  return (
                    <li key={d.filename}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => setSelected(d.filename)}
                        title={d.filename}
                        className={`block w-full border-l-2 px-3 py-1.5 text-left ${
                          active ? "border-violet-400 bg-white/[0.07]" : "border-transparent hover:bg-white/[0.03]"
                        }`}
                        data-testid={`review-doc-${d.filename}`}
                      >
                        <span className="block truncate text-[12.5px] text-[#e5e5ea]">{d.filename}</span>
                        {d.summary && <span className="block truncate text-[11px] text-[color:var(--muted)]">{d.summary}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* The selected document, beside what we took from it. */}
        {doc && (
          <div className="flex min-h-0 flex-col" data-testid="review-detail">
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--rule)] bg-[color:var(--ink-3)] px-4 py-2.5">
              <StateIcon state={doc.state} />
              <span className="text-[13px] font-semibold text-white">{STATE_LABEL[doc.state]}</span>
              {doc.documentType && <span className="text-[12px] text-[color:var(--body)]">{doc.documentType}</span>}
              {doc.summary && <span className="text-[12px] text-[color:var(--muted)]">· {doc.summary}</span>}
            </div>
            <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="h-[46vh] min-h-0 border-b border-[color:var(--rule)] xl:h-auto xl:border-b-0 xl:border-r">
                <DocumentPreview name={doc.filename} file={fileFor(doc.filename)} documentId={documentIdFor(doc.filename)} />
              </div>
              <div className="min-h-0 overflow-y-auto bg-[color:var(--ink-3)] p-4">
                {doc.problems.map((p, i) => (
                  <div
                    key={i}
                    className={`mb-2 rounded-xl border px-3 py-2.5 ${
                      doc.state === "not-read" ? "border-red-400/25 bg-red-500/[0.06]" : "border-amber-400/25 bg-amber-500/[0.06]"
                    }`}
                    data-testid="review-problem"
                  >
                    <p className="text-[12.5px] font-semibold text-white">{p.headline}</p>
                    {p.detail && <p className="mt-0.5 text-[11.5px] leading-5 text-[color:var(--body)]">{p.detail}</p>}
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11.5px] leading-5 text-[color:var(--body)]">{p.fix}</p>
                      {p.replace && onAddDocuments && (
                        <button
                          type="button"
                          onClick={onAddDocuments}
                          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#0e0e10] hover:bg-[#f2f2f7]"
                          data-testid="review-upload-replacement"
                        >
                          <Upload className="h-3.5 w-3.5" /> Upload a replacement
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {doc.values.length > 0 && (
                  <div className="mt-1" data-testid="review-values">
                    <p className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px] font-semibold text-white">
                      What we took from it
                      {onEditValue && <span className="text-[10.5px] font-normal text-[color:var(--muted)]">Click a value to correct it</span>}
                    </p>
                    <dl className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
                      {doc.values.map((v, i) => (
                        <div key={i} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] gap-3 px-3 py-1.5">
                          <dt className="truncate text-[11.5px] text-[color:var(--muted)]" title={v.label}>{v.label}</dt>
                          <dd className="min-w-0 text-[11.5px] text-[#e5e5ea]">
                            {onEditValue && v.edit ? (
                              <EditableValue
                                value={v.value}
                                label={v.label}
                                onSave={(next) => onEditValue(doc.filename, v.edit!, next)}
                                testId={`review-value-${i}`}
                              />
                            ) : (
                              <span className="break-words">{v.value}</span>
                            )}
                            {v.entered ? (
                              <span className="block text-[10.5px] text-violet-200/80">Entered by you</span>
                            ) : (
                              v.source && (
                                <span className="block truncate text-[10.5px] italic text-[color:var(--muted)]" title={v.source}>
                                  “{v.source}”
                                </span>
                              )
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {doc.unplaced.length > 0 && (
                  <div className="mt-3" data-testid="review-unplaced">
                    <p className="text-[12px] font-semibold text-white">Read, but not placed in the workbook</p>
                    <p className="mb-1.5 text-[11px] leading-5 text-[color:var(--body)]">Left blank rather than guessed — place these yourself in the workbook.</p>
                    <ul className="space-y-1">
                      {doc.unplaced.map((v, i) => (
                        <li key={i} className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[11.5px] leading-5">
                          <span className="text-[color:var(--muted)]">{v.label}:</span> <span className="text-[#e5e5ea]">{v.value}</span>
                          {v.source && <span className="block text-[11px] text-amber-200/75">{v.source}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {doc.notFound.length > 0 &&
                  (onEditValue && doc.missing?.length ? (
                    <div className="mt-3" data-testid="review-not-found">
                      <p className="text-[12px] font-semibold text-white">Not found in this document</p>
                      <p className="mb-1.5 text-[11px] leading-5 text-[color:var(--body)]">If the document does show one, add it — it goes into the scorecard you build.</p>
                      <ul className="divide-y divide-white/[0.05] rounded-xl border border-amber-400/15">
                        {doc.missing.map((m) => (
                          <li key={m.field} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11.5px]">
                            <span className="truncate text-[color:var(--body)]" title={m.label}>{m.label}</span>
                            <span className="min-w-0 text-[#e5e5ea]">
                              <EditableValue
                                value={null}
                                label={m.label}
                                onSave={(next) => onEditValue(doc.filename, { kind: "field", field: m.field }, next)}
                                testId={`review-missing-${m.field}`}
                              />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-3 text-[11.5px] leading-5 text-[color:var(--body)]" data-testid="review-not-found">
                      <span className="font-semibold text-white">Not found in this document:</span> {doc.notFound.join(" · ")}
                    </p>
                  ))}

                {doc.state !== "not-read" && doc.values.length === 0 && doc.unplaced.length === 0 && (
                  <p className="text-[11.5px] text-[color:var(--body)]">This document fed rows into the workbook; open the workbook to see them.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default DocumentReview;
