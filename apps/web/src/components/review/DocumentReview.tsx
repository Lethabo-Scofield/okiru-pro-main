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
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, CircleSlash, PanelLeftClose, PanelLeftOpen, Plus, Upload } from "lucide-react";
import { DocumentPreview } from "./DocumentPreview";
import { EditableValue } from "./EditableValue";
import {
  reviewCounts,
  type ReviewDocument,
  type ReviewEdit,
  type ReviewQuestion,
  type ReviewState,
  type ReviewValue,
} from "@/lib/documentReview";
import { brokenCellText } from "@/lib/workbookCellError";

const STATE_LABEL: Record<ReviewState, string> = {
  read: "Read",
  "needs-look": "Needs a look",
  "not-read": "Not read",
};
const GROUP_ORDER: ReviewState[] = ["not-read", "needs-look", "read"];

/**
 * Colour only where a person has to act, and never alone: "Read" is a quiet
 * grey tick; "Needs a look" and "Not read" keep their colour, beside the word.
 */
function StateIcon({ state, className = "h-3.5 w-3.5" }: { state: ReviewState; className?: string }) {
  if (state === "read") return <Check className={`${className} shrink-0 text-[color:var(--body)]`} aria-hidden />;
  if (state === "needs-look") return <AlertTriangle className={`${className} shrink-0 text-amber-300`} aria-hidden />;
  return <CircleSlash className={`${className} shrink-0 text-red-300`} aria-hidden />;
}

/** The values pane's width, in px, beside the preview (wide screens only). */
const VALUES_WIDTH = { min: 340, max: 760, initial: 440, step: 24 } as const;
const VALUES_WIDTH_KEY = "okiru-review-values-width";

function storedValuesWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(VALUES_WIDTH_KEY));
    return Number.isFinite(n) && n >= VALUES_WIDTH.min && n <= VALUES_WIDTH.max ? n : VALUES_WIDTH.initial;
  } catch {
    return VALUES_WIDTH.initial;
  }
}

function clampWidth(n: number): number {
  return Math.round(Math.min(VALUES_WIDTH.max, Math.max(VALUES_WIDTH.min, n)));
}

/**
 * The bar between the document and the values: drag it, or focus it and use
 * the arrow keys, to give either side more room.
 */
function ResizeHandle({ width, onChange }: { width: number; onChange: (next: number) => void }) {
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the values pane"
      aria-valuenow={width}
      aria-valuemin={VALUES_WIDTH.min}
      aria-valuemax={VALUES_WIDTH.max}
      tabIndex={0}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, width };
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        // Dragging left widens the values pane (it sits on the right).
        if (start.current) onChange(clampWidth(start.current.width + (start.current.x - e.clientX)));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(clampWidth(width + VALUES_WIDTH.step));
        else if (e.key === "ArrowRight") onChange(clampWidth(width - VALUES_WIDTH.step));
        else return;
        e.preventDefault();
      }}
      className="group relative hidden w-2 shrink-0 cursor-col-resize touch-none select-none items-stretch justify-center bg-[color:var(--ink-2)] focus-visible:outline-none xl:flex"
      data-testid="review-resize"
    >
      <span className="w-px bg-[color:var(--rule)] transition-colors duration-200 group-hover:bg-white/30 group-focus-visible:bg-white/60" aria-hidden />
    </div>
  );
}

/** A value: correctable where it can be, a broken cell said as one, a list openable. */
function ValueCell({
  value,
  index,
  onSave,
}: {
  value: ReviewValue;
  index: number;
  onSave?: (next: string) => void;
}) {
  return (
    <>
      {onSave ? (
        <EditableValue value={value.value} label={value.label} onSave={onSave} testId={`review-value-${index}`} />
      ) : value.cellError ? (
        <span className="inline-flex items-start gap-1.5 text-amber-200" data-testid={`review-value-${index}-broken`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
          <span className="break-words">{brokenCellText(value.cellError)}</span>
        </span>
      ) : (
        <span className="break-words">{value.value}</span>
      )}
      {value.items && value.items.length > 0 && (
        <details className="group mt-0.5" data-testid={`review-value-${index}-items`}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-[11px] text-[color:var(--body)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3 w-3 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
            Show all {value.items.length}
          </summary>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[11px] leading-5 text-[color:var(--body)]">
            {value.items.slice(0, 50).map((item, i) => (
              <li key={i} className="break-words">{item}</li>
            ))}
          </ol>
          {value.items.length > 50 && (
            <p className="mt-0.5 text-[11px] text-[color:var(--body)]">and {value.items.length - 50} more in the document</p>
          )}
        </details>
      )}
    </>
  );
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
  /**
   * Place a value by answering its question ("which site is this?"), or take
   * a placement back with `null`. Absent where nothing can be placed from here.
   */
  onAnswer?: (filename: string, question: ReviewQuestion, answer: Record<string, string> | null) => void;
  /**
   * Bring one document into view and select it ("show me the one that failed").
   * A new `key` asks again for the same document.
   */
  focus?: { filename: string; key: number } | null;
}

/**
 * One value waiting for an answer: the figure, why it was not placed, and the
 * question that places it — or, once answered, where it went and the way back.
 */
function QuestionRow({
  value,
  onAnswer,
}: {
  value: ReviewValue;
  onAnswer?: (answer: Record<string, string> | null) => void;
}) {
  const question = value.ask!;
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const complete = question.fields.every((field) => answer[field.key]);
  return (
    <li className="rounded-lg border border-amber-400/20 bg-amber-500/[0.04] px-3 py-2 text-[11.5px] leading-5" data-testid="review-question">
      <span className="text-[color:var(--body)]">{value.label}:</span> <span className="font-medium text-[color:var(--hi)]">{value.value}</span>
      {value.answered ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[color:var(--hi)]">
            <Check className="h-3.5 w-3.5" aria-hidden /> Placed by you in {value.answered}
          </span>
          {onAnswer && (
            <button type="button" onClick={() => onAnswer(null)} className="text-[11px] text-[color:var(--body)] underline hover:text-white">
              Undo
            </button>
          )}
        </div>
      ) : (
        <>
          {value.source && <span className="block text-[11px] text-amber-200/75">{value.source}</span>}
          <p className="mt-1 text-[11.5px] text-white">{question.prompt}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {question.fields.map((field) => (
              <select
                key={field.key}
                aria-label={field.label}
                value={answer[field.key] ?? ""}
                onChange={(e) => setAnswer((prior) => ({ ...prior, [field.key]: e.target.value }))}
                className="rounded-md border border-white/[0.12] bg-[color:var(--ink-2)] px-2 py-1 text-[11.5px] text-white"
                disabled={!onAnswer}
              >
                <option value="">{field.label}…</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ))}
            {onAnswer && (
              <button
                type="button"
                disabled={!complete}
                onClick={() => onAnswer(answer)}
                className="rounded-full bg-white px-3 py-1 text-[11.5px] font-semibold text-black hover:bg-white/90 disabled:opacity-40"
              >
                Put it here
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function DocumentReview({
  documents,
  fileFor,
  documentIdFor,
  onAddDocuments,
  stillToAdd = [],
  needsDetail = [],
  onEditValue,
  onAnswer,
  focus = null,
}: DocumentReviewProps) {
  const [selected, setSelected] = useState<string | null>(documents[0]?.filename ?? null);
  const sectionRef = useRef<HTMLElement | null>(null);
  /** The values pane's width beside the preview; remembered per viewer. */
  const [valuesWidth, setValuesWidth] = useState(storedValuesWidth);
  const changeValuesWidth = (next: number) => {
    setValuesWidth(next);
    try {
      window.localStorage.setItem(VALUES_WIDTH_KEY, String(next));
    } catch {
      // A private window keeps the width for this visit only.
    }
  };
  /** The document list folds away on a narrower wide screen, for the preview's sake. */
  const [listOpen, setListOpen] = useState(true);
  useEffect(() => {
    if (!focus) return;
    setSelected(focus.filename);
    sectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [focus?.filename, focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => reviewCounts(documents), [documents]);
  const groups = useMemo(
    () => GROUP_ORDER.map((state) => ({ state, docs: documents.filter((d) => d.state === state) })).filter((g) => g.docs.length > 0),
    [documents],
  );
  const doc = documents.find((d) => d.filename === selected) ?? documents[0] ?? null;

  if (documents.length === 0) return null;

  // What was read but not placed, by what it needs: an answer, a person's own
  // entry in the workbook, or nothing at all (evidence no cell needs).
  const asks = doc?.unplaced.filter((v) => v.ask) ?? [];
  const evidence = doc?.unplaced.filter((v) => !v.ask && v.evidence) ?? [];
  const unplacedOther = doc?.unplaced.filter((v) => !v.ask && !v.evidence) ?? [];

  return (
    <section
      ref={sectionRef}
      className="mt-4 scroll-mt-4"
      data-testid="document-review"
      // The host widens its container while this is on screen (`has-[[data-wide-review]]`):
      // three panes side by side need more than a form's column.
      data-wide-review=""
      aria-label="Check each document"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold text-white">Check each document</h4>
          <p className="text-[12px] text-[color:var(--body)]">
            <span data-testid="review-counts">
              {counts.read} read · {counts["needs-look"]} need{counts["needs-look"] === 1 ? "s" : ""} a look · {counts["not-read"]} not read
            </span>
            {" · optional"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setListOpen((open) => !open)}
            aria-expanded={listOpen}
            className="hidden items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12px] font-medium text-[color:var(--body)] transition-colors duration-200 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 lg:inline-flex"
            data-testid="review-toggle-list"
          >
            {listOpen ? <PanelLeftClose className="h-3.5 w-3.5" aria-hidden /> : <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden />}
            {listOpen ? "Hide the list" : `Show the list (${documents.length})`}
          </button>
          {onAddDocuments && (
            <button
              type="button"
              onClick={onAddDocuments}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.12] px-3 py-1.5 text-[12px] font-medium text-[color:var(--body)] transition-colors duration-200 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              data-testid="review-add-documents"
            >
              <Plus className="h-3.5 w-3.5" /> Add documents
            </button>
          )}
        </div>
      </div>

      {(stillToAdd.length > 0 || needsDetail.length > 0) && (
        <p className="mb-2.5 text-[12px] leading-5 text-[color:var(--body)]" data-testid="review-still-to-add">
          <span className="font-medium text-white">Not in this pack yet:</span> {[...stillToAdd, ...needsDetail].join(" · ")}
        </p>
      )}

      <div
        className={`grid overflow-hidden rounded-2xl border border-[color:var(--rule)] lg:h-[min(80vh,860px)] ${
          listOpen ? "lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)]"
        }`}
      >
        {/* The documents — grouped, worst first, scrolling in their own pane. */}
        <nav
          className={`max-h-[38vh] overflow-y-auto border-b border-[color:var(--rule)] bg-[color:var(--ink-2)] lg:max-h-none lg:border-b-0 lg:border-r ${listOpen ? "" : "lg:hidden"}`}
          aria-label="Documents"
        >
          {groups.map((group) => (
            <div key={group.state}>
              <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-white/[0.05] bg-[color:var(--ink-2)] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--body)]">
                {group.state !== "read" && <StateIcon state={group.state} className="h-3 w-3" />} {STATE_LABEL[group.state]} · {group.docs.length}
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
                        className={`block w-full border-l-2 px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30 ${
                          active ? "border-white/70 bg-white/[0.06]" : "border-transparent hover:bg-white/[0.03]"
                        }`}
                        data-testid={`review-doc-${d.filename}`}
                      >
                        <span className={`line-clamp-2 text-[12.5px] leading-[1.35] [overflow-wrap:anywhere] ${active ? "text-white" : "text-[color:var(--hi)]"}`}>
                          {d.filename}
                        </span>
                        {d.summary && <span className="mt-0.5 block truncate text-[11px] text-[color:var(--body)]">{d.summary}</span>}
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
          <div className="flex min-h-0 min-w-0 flex-col" data-testid="review-detail">
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--rule)] bg-[color:var(--ink-3)] px-4 py-2.5">
              <StateIcon state={doc.state} />
              <span className="text-[13px] font-semibold text-white">{STATE_LABEL[doc.state]}</span>
              {doc.documentType && <span className="text-[12px] text-[color:var(--hi)]">{doc.documentType}</span>}
              {doc.summary && <span className="text-[12px] text-[color:var(--body)]">· {doc.summary}</span>}
            </div>
            <div
              className="flex min-h-0 flex-1 flex-col xl:flex-row"
              style={{ ["--review-values-w" as string]: `${valuesWidth}px` }}
            >
              <div className="h-[46vh] min-h-0 min-w-0 border-b border-[color:var(--rule)] xl:h-auto xl:flex-1 xl:border-b-0">
                <DocumentPreview name={doc.filename} file={fileFor(doc.filename)} documentId={documentIdFor(doc.filename)} />
              </div>
              <ResizeHandle width={valuesWidth} onChange={changeValuesWidth} />
              <div className="@container min-h-0 overflow-y-auto bg-[color:var(--ink-3)] p-4 xl:w-[var(--review-values-w)] xl:max-w-[60%] xl:shrink-0" data-testid="review-values-pane">
                {doc.problems.map((p, i) => (
                  <div
                    key={i}
                    className={`mb-2 rounded-xl border px-3 py-2.5 ${
                      doc.state === "not-read" ? "border-red-300/20 bg-red-400/[0.05]" : "border-amber-300/20 bg-amber-400/[0.05]"
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
                          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.16] px-3 py-1 text-[12px] font-semibold text-white transition-colors duration-200 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                          data-testid="review-upload-replacement"
                        >
                          <Upload className="h-3.5 w-3.5" /> Upload a replacement
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {doc.sheets && doc.sheets.length > 0 && (
                  <div className="mb-3" data-testid="review-sheets">
                    <p className="mb-1.5 text-[12px] font-semibold text-white">
                      Read sheet by sheet · {doc.sheets.length} sheet{doc.sheets.length === 1 ? "" : "s"}
                    </p>
                    <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
                      {doc.sheets.map((s) => (
                        <li key={s.file} className="flex items-start gap-2 px-3 py-1.5 text-[11.5px]" data-testid={`review-sheet-${s.sheet}`}>
                          <span className="mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center">
                            {s.state === "needs-look" ? (
                              <AlertTriangle className="h-3 w-3 text-amber-300" aria-label="Needs a look" />
                            ) : s.state === "read" ? (
                              <Check className="h-3 w-3 text-[color:var(--body)]" aria-hidden />
                            ) : (
                              <span className="h-1 w-1 rounded-full bg-[color:var(--muted)]" aria-hidden />
                            )}
                          </span>
                          <span className="shrink-0 text-[color:var(--hi)]">{s.sheet}</span>
                          <span className="min-w-0 truncate text-[color:var(--body)]" title={s.state === "not-read" ? undefined : s.summary}>
                            {s.state === "not-read" ? "nothing used from this sheet" : s.summary}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {doc.values.length > 0 && (
                  <div className="mt-1" data-testid="review-values">
                    <p className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 text-[12px] font-semibold text-white">
                      What we took from it
                      {onEditValue && <span className="text-[11px] font-normal text-[color:var(--body)]">Click a value to correct it</span>}
                    </p>
                    <dl className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
                      {doc.values.map((v, i) => (
                        <div
                          key={i}
                          className="grid gap-x-3 gap-y-0.5 px-3 py-2 @[380px]:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]"
                          data-testid={`review-value-row-${i}`}
                        >
                          <dt className="min-w-0 text-[11.5px] leading-[1.4] text-[color:var(--body)]" title={v.label}>
                            {/* Two lines, then the tooltip — never "Operating ex…". */}
                            <span className="line-clamp-2 [overflow-wrap:anywhere]">{v.label}</span>
                            {v.sheet && <span className="block truncate text-[10.5px] text-[color:var(--body)]">{v.sheet}</span>}
                          </dt>
                          <dd className="min-w-0 text-[12px] text-[color:var(--hi)]">
                            <ValueCell
                              value={v}
                              index={i}
                              onSave={onEditValue && v.edit ? (next) => onEditValue(v.file ?? doc.filename, v.edit!, next) : undefined}
                            />
                            {v.entered ? (
                              <span className="block text-[10.5px] text-[color:var(--body)]">Entered by you</span>
                            ) : (
                              v.source && (
                                <span className="block truncate text-[10.5px] italic text-[color:var(--body)]" title={v.source}>
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

                {doc.otherDetails && doc.otherDetails.length > 0 && (
                  <details className="mt-3" open={doc.otherDocument} data-testid="review-other-details">
                    <summary className="cursor-pointer list-none text-[12px] font-semibold text-white">
                      Other details · {doc.otherDetails.length}
                      <span className="ml-1.5 text-[11px] font-normal text-[color:var(--body)]">not scored unless you enter them</span>
                    </summary>
                    <ul className="mt-1.5 space-y-1">
                      {doc.otherDetails.map((v, i) => (
                        <li key={i} className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[11.5px] leading-5">
                          <span className="text-[color:var(--body)]">{v.label}:</span> <span className="text-[color:var(--hi)]">{v.value}</span>
                          {v.source && <span className="block truncate text-[10.5px] italic text-[color:var(--body)]" title={v.source}>“{v.source}”</span>}
                          {v.suggested && (
                            <span className="block text-[10.5px] text-[color:var(--body)]" data-testid={`review-other-suggested-${i}`}>
                              Suggested for {v.suggested} — enter it in the workbook if it is right
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {asks.length > 0 && (
                  <div className="mt-3" data-testid="review-decisions">
                    <p className="text-[12px] font-semibold text-white">Tell us where these go</p>
                    <p className="mb-1.5 text-[11px] leading-5 text-[color:var(--body)]">
                      Each is a real figure the document did not place for us. Answer, and it goes into the workbook.
                    </p>
                    <ul className="space-y-1.5">
                      {asks.map((v, i) => (
                        <QuestionRow
                          key={v.ask?.id ?? i}
                          value={v}
                          onAnswer={onAnswer ? (answer) => onAnswer(v.file ?? doc.filename, v.ask!, answer) : undefined}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {unplacedOther.length > 0 && (
                  <div className="mt-3" data-testid="review-unplaced">
                    <p className="text-[12px] font-semibold text-white">Read, but not placed in the workbook</p>
                    <p className="mb-1.5 text-[11px] leading-5 text-[color:var(--body)]">Left blank rather than guessed — place these yourself in the workbook.</p>
                    <ul className="space-y-1">
                      {unplacedOther.map((v, i) => (
                        <li key={i} className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[11.5px] leading-5">
                          <span className="text-[color:var(--body)]">{v.label}:</span> <span className="text-[color:var(--hi)]">{v.value}</span>
                          {v.source && <span className="block text-[11px] text-[color:var(--body)]">{v.source}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {evidence.length > 0 && (
                  <details className="mt-3" data-testid="review-evidence">
                    <summary className="cursor-pointer list-none text-[12px] font-semibold text-white">
                      Kept with the document · {evidence.length}
                      <span className="ml-1.5 text-[11px] font-normal text-[color:var(--body)]">not needed in the workbook</span>
                    </summary>
                    <ul className="mt-1.5 space-y-1">
                      {evidence.map((v, i) => (
                        <li key={i} className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[11.5px] leading-5">
                          <span className="text-[color:var(--body)]">{v.label}:</span> <span className="text-[color:var(--hi)]">{v.value}</span>
                          {v.source && <span className="block text-[11px] text-[color:var(--body)]">{v.source}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {doc.notFound.length > 0 &&
                  (onEditValue && doc.missing?.length ? (
                    <div className="mt-3" data-testid="review-not-found">
                      <p className="text-[12px] font-semibold text-white">Not found in this document</p>
                      <p className="mb-1.5 text-[11px] leading-5 text-[color:var(--body)]">If the document does show one, add it — it goes into the scorecard you build.</p>
                      <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
                        {doc.missing.map((m) => (
                          <li key={`${m.file ?? ""}|${m.field}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11.5px]">
                            <span className="min-w-0 text-[color:var(--body)] [overflow-wrap:anywhere]" title={m.label}>{m.label}</span>
                            <span className="shrink-0 text-[color:var(--hi)]">
                              <EditableValue
                                value={null}
                                label={m.label}
                                onSave={(next) => onEditValue(m.file ?? doc.filename, { kind: "field", field: m.field }, next)}
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

                {doc.state !== "not-read" && doc.values.length === 0 && doc.unplaced.length === 0 && !doc.otherDocument && (
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
