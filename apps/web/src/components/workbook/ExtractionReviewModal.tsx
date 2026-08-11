/**
 * The floating "AI review" surface on the workbook page.
 *
 * A client whose workbook was built from documents needs one place that
 * answers, in plain language: what did the AI read, what did it place where,
 * what is it SURE of, what does it need me to confirm, and what is still
 * missing. Four groups, in trust order:
 *
 *   Extracted    per-section counts + the actual source documents
 *   Suggestions  evidence-grounded fills (basis shown) — applied on click,
 *                one by one or all at once; never applied silently
 *   Conflicts    two pieces of evidence disagree — the modal explains both
 *                sides and takes you to the row; it never picks a winner
 *   Decisions    missing required fields grouped into single choices with
 *                bulk apply ("68 rows need a contribution type — set once")
 *
 * The engine behind it (extractionReview.ts) is pure and deterministic; this
 * component only renders it and forwards confirmed changes to the workbook's
 * existing save path.
 */
import { useMemo, useState } from "react";
import { Check, ChevronRight, FileText, GitMerge, ListChecks, Sparkles, TriangleAlert, X } from "lucide-react";
import {
  buildExtractionReview,
  type ExtractionReview,
  type ReviewChoice,
  type ReviewDecision,
} from "@/lib/extractionReview";
import type { WorkbookSectionsInput } from "./workbookValidation";

export interface CellUpdate {
  rowId: string;
  column: string;
  value: string;
}

interface Props {
  sections: WorkbookSectionsInput;
  onApplyCellUpdates: (sectionKey: string, updates: CellUpdate[]) => Promise<void> | void;
  /** Settle an entity-level figure the documents disagreed on. */
  onApplyMetaValue?: (sectionKey: string, column: string, value: string) => Promise<void> | void;
  onNavigateToSection: (sectionKey: string) => void;
}

function DecisionRow({
  decision,
  onApply,
  onNavigate,
}: {
  decision: ReviewDecision;
  onApply: (value: string) => void;
  onNavigate: () => void;
}) {
  const [choice, setChoice] = useState("");
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111113] px-3.5 py-3" data-testid={`review-decision-${decision.section}-${decision.column}`}>
      <p className="text-[13px] text-white leading-snug">{decision.statement}</p>
      <p className="mt-1 text-[11px] text-[#8e8e93] truncate">
        {decision.rows.slice(0, 4).map((r) => r.label).join(", ")}
        {decision.rows.length > 4 ? ` +${decision.rows.length - 4} more` : ""}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        {decision.options && decision.options.length > 0 ? (
          <>
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="h-8 flex-1 rounded-lg border border-white/[0.10] bg-[#1c1c1e] px-2 text-[12px] text-white outline-none"
              data-testid={`review-decision-select-${decision.column}`}
            >
              <option value="">Choose a value…</option>
              {decision.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!choice}
              onClick={() => onApply(choice)}
              className="h-8 rounded-lg bg-white px-3 text-[12px] font-semibold text-black disabled:opacity-40"
              data-testid={`review-decision-apply-${decision.column}`}
            >
              Apply to {decision.rows.length === 1 ? "row" : `all ${decision.rows.length}`}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onNavigate}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.12] px-3 text-[12px] text-[#d1d1d6] hover:bg-white/[0.06]"
          >
            Open {decision.sectionLabel} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ExtractionReviewModal({ sections, onApplyCellUpdates, onApplyMetaValue, onNavigateToSection }: Props) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(() => new Set());

  const review: ExtractionReview = useMemo(() => buildExtractionReview(sections), [sections]);
  const fromDocuments = review.extracted.some((s) => s.aiRowCount > 0);
  if (!fromDocuments && review.choices.length === 0) return null;

  const pendingSuggestions = review.suggestions.filter((s) => !applied.has(s.id));
  const badge = pendingSuggestions.length + review.conflicts.length + review.decisions.length + review.choices.length;

  const applySuggestion = async (id: string) => {
    const s = review.suggestions.find((x) => x.id === id);
    if (!s) return;
    await onApplyCellUpdates(s.section, [{ rowId: s.rowId, column: s.column, value: s.value }]);
    setApplied((prev) => new Set(prev).add(id));
  };

  const applyAllSuggestions = async () => {
    const bySection = new Map<string, CellUpdate[]>();
    for (const s of pendingSuggestions) {
      const list = bySection.get(s.section) ?? [];
      list.push({ rowId: s.rowId, column: s.column, value: s.value });
      bySection.set(s.section, list);
    }
    for (const [section, updates] of Array.from(bySection.entries())) {
      await onApplyCellUpdates(section, updates);
    }
    setApplied((prev) => {
      const next = new Set(prev);
      for (const s of pendingSuggestions) next.add(s.id);
      return next;
    });
  };

  const applyDecision = async (d: ReviewDecision, value: string) => {
    await onApplyCellUpdates(
      d.section,
      d.rows.map((r) => ({ rowId: r.rowId, column: d.column, value })),
    );
  };

  const goTo = (sectionKey: string) => {
    setOpen(false);
    onNavigateToSection(sectionKey);
  };

  return (
    <>
      {/* Floating entry point — always visible on a document-built workbook. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-[#1c1c1e] px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)] hover:border-violet-400/60"
        data-testid="extraction-review-open"
      >
        <Sparkles className="h-4 w-4 text-violet-300" />
        AI review
        {badge > 0 && (
          <span className="ml-0.5 rounded-full bg-violet-400/20 px-2 py-0.5 text-[11px] font-semibold text-violet-200" data-testid="extraction-review-badge">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)} data-testid="extraction-review-modal">
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141416]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2 className="text-[16px] font-semibold text-white">What the AI read — and what it needs from you</h2>
                <p className="mt-0.5 text-[12px] text-[#8e8e93]">
                  Every fill below shows its evidence. Nothing is applied until you confirm it.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-[#8e8e93] hover:bg-white/[0.06] hover:text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {/* Extracted */}
              <section>
                <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-[#8e8e93]">
                  <FileText className="h-3.5 w-3.5" /> Extracted into the workbook
                </div>
                <div className="space-y-1.5">
                  {review.extracted.filter((s) => s.aiRowCount > 0).map((s) => (
                    <button
                      key={s.section}
                      type="button"
                      onClick={() => goTo(s.section)}
                      className="flex w-full items-center justify-between rounded-lg bg-[#111113] px-3 py-2 text-left hover:bg-white/[0.04]"
                    >
                      <span className="text-[12.5px] text-white">{s.sectionLabel}</span>
                      <span className="text-[11.5px] text-[#8e8e93]">
                        {s.aiRowCount} row{s.aiRowCount === 1 ? "" : "s"} · {s.sources.length} document{s.sources.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Which did you mean? — FIRST, above everything else.
                  Every other group is an improvement to a workbook that already
                  scores. These are figures the scorecard is currently missing
                  because the documents disagreed, so they are the only items
                  here that are actively costing points. */}
              {review.choices.length > 0 && (
                <section data-testid="review-choices">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-amber-300/90">
                    <TriangleAlert className="h-3.5 w-3.5" /> Which did you mean?
                  </div>
                  <div className="space-y-2">
                    {review.choices.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-amber-300/20 bg-[#17150f] px-3.5 py-3"
                        data-testid={`review-choice-${c.column}`}
                      >
                        <p className="text-[12.5px] text-white">{c.statement}</p>
                        <p className="mt-0.5 text-[11.5px] text-[#8e8e93]">
                          {c.sectionLabel} · {c.columnLabel}
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {c.options.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              disabled={!onApplyMetaValue}
                              onClick={() => void onApplyMetaValue?.(c.section, c.column, o.value)}
                              className="rounded-lg border border-white/[0.12] bg-[#1c1c1e] px-3 py-2 text-left hover:border-amber-300/50 disabled:opacity-40"
                              data-testid={`review-choice-option-${o.value}`}
                            >
                              <span className="block text-[13px] font-medium tabular-nums text-white">{o.value}</span>
                              {/* Naming the documents is the whole basis for
                                  choosing — a bare pair of numbers is not a
                                  question anyone can answer. */}
                              <span className="mt-0.5 block text-[10.5px] text-[#8e8e93]">
                                {o.sources.length > 0 ? `from ${o.sources.join(", ")}` : "source unknown"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Confirmed by more than one document. Not an action — the
                  opposite. It marks the figures nobody needs to re-check, so
                  attention goes to the ones that do. */}
              {review.corroborated.length > 0 && (
                <section data-testid="review-corroborated">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-emerald-300/80">
                    <Check className="h-3.5 w-3.5" /> Confirmed by more than one document
                  </div>
                  <div className="space-y-1.5">
                    {review.corroborated.map((c) => (
                      <div
                        key={`${c.section}.${c.column}`}
                        className="rounded-lg border border-emerald-400/15 bg-[#0f1512] px-3 py-2"
                      >
                        <span className="text-[12.5px] text-white">
                          {c.columnLabel} — <span className="tabular-nums">{c.value}</span>
                        </span>
                        <span className="ml-2 text-[11px] text-emerald-300/70">
                          {c.agreementCount} documents agree
                        </span>
                        <span className="mt-0.5 block text-[10.5px] text-[#8e8e93]">{c.sources.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Suggestions */}
              {pendingSuggestions.length > 0 && (
                <section data-testid="review-suggestions">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-[#8e8e93]">
                      <GitMerge className="h-3.5 w-3.5" /> Grounded fills — confirm to apply
                    </div>
                    <button
                      type="button"
                      onClick={() => void applyAllSuggestions()}
                      className="rounded-lg border border-white/[0.12] px-2.5 py-1 text-[11.5px] text-[#d1d1d6] hover:bg-white/[0.06]"
                      data-testid="review-apply-all-suggestions"
                    >
                      Apply all {pendingSuggestions.length}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {pendingSuggestions.map((s) => (
                      <div key={s.id} className="rounded-xl border border-white/[0.06] bg-[#111113] px-3.5 py-3">
                        <p className="text-[13px] text-white leading-snug">{s.statement}</p>
                        <p className="mt-1 text-[11px] leading-snug text-emerald-300/80">Evidence: {s.basis}</p>
                        <button
                          type="button"
                          onClick={() => void applySuggestion(s.id)}
                          className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg bg-white px-2.5 text-[11.5px] font-semibold text-black"
                        >
                          <Check className="h-3 w-3" /> Apply
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Conflicts */}
              {review.conflicts.length > 0 && (
                <section data-testid="review-conflicts">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-amber-300/90">
                    <TriangleAlert className="h-3.5 w-3.5" /> Evidence disagrees — your call
                  </div>
                  <div className="space-y-1.5">
                    {review.conflicts.map((c) => (
                      <div key={c.id} className="rounded-xl border border-amber-300/20 bg-amber-400/[0.05] px-3.5 py-3">
                        <p className="text-[13px] leading-snug text-amber-100">{c.statement}</p>
                        <div className="mt-1.5 space-y-0.5">
                          {c.sides.map((side, i) => (
                            <p key={i} className="text-[11.5px] text-amber-200/70">
                              {side.label}: <span className="font-medium text-amber-100">{side.value}</span>
                            </p>
                          ))}
                        </div>
                        {c.section && (
                          <button
                            type="button"
                            onClick={() => goTo(c.section as string)}
                            className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg border border-amber-300/30 px-2.5 text-[11.5px] text-amber-100 hover:bg-amber-400/10"
                          >
                            Fix in {c.section ? c.section.replace(/-/g, " ") : "section"} <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Decisions */}
              {review.decisions.length > 0 && (
                <section data-testid="review-decisions">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-[#8e8e93]">
                    <ListChecks className="h-3.5 w-3.5" /> Still missing — {review.decisions.length} decision{review.decisions.length === 1 ? "" : "s"}, not {review.decisions.reduce((n, d) => n + d.rows.length, 0)} errors
                  </div>
                  <div className="space-y-1.5">
                    {review.decisions.map((d) => (
                      <DecisionRow
                        key={d.id}
                        decision={d}
                        onApply={(value) => void applyDecision(d, value)}
                        onNavigate={() => goTo(d.section)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {badge === 0 && (
                <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3.5 py-3 text-[13px] text-emerald-200" data-testid="review-all-clear">
                  Everything the AI extracted is placed, consistent, and complete. Nothing needs your attention.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
