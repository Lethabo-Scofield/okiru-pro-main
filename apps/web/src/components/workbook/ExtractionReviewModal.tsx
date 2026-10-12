/**
 * The floating "AI review" surface on the workbook page.
 *
 * A client whose workbook was built from documents needs one place that
 * answers, in plain language: what can be filled and why, what did the AI
 * fill already (and how to take it back), what is it unsure of, and what is
 * still missing. In trust order:
 *
 *   Which did you mean?  figures the documents disagree on, settled by a pick
 *   Ready to fill        values backed by a document or by the workbook's own
 *                        figures, each with its reason and evidence, labelled
 *                        "Read" or "Derived". Applied per cell or all at once;
 *                        anything that changes a score is listed first.
 *   Work out the rest    one AI pass over the cells the rules could not
 *                        settle; every answer is checked before it is shown
 *   Questions            cells nothing backs: left empty, one line each
 *   Disagreements        two pieces of evidence conflict — your call
 *   Still missing        required fields grouped into single choices
 *   Filled by AI review  every applied fill, undoable one by one or all
 *
 * The rules (aiReviewFill.ts, extractionReview.ts) are pure and deterministic;
 * the model pass is checked by aiReviewModel.ts on the server. This component
 * renders them and forwards confirmed changes to the workbook's save path.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  GitMerge,
  ListChecks,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  buildExtractionReview,
  type ExtractionReview,
  type ReviewDecision,
} from "@/lib/extractionReview";
import {
  activeAiFills,
  buildRuleFills,
  canFill,
  cellLabelOf,
  describeEvidence,
  type CellRef,
  type FillProposal,
  type FillQuestion,
} from "@/lib/aiReviewFill";
import { buildAiReviewGrounding } from "@/lib/aiReviewModel";
import { API_BASE } from "@toolkit/lib/config";
import { SidePaneHandle, useSidePaneWidth } from "@/components/review/SidePane";
import type { WorkbookSectionsInput } from "./workbookValidation";

export interface CellUpdate {
  rowId: string;
  column: string;
  value: string;
}

export interface ApplyFillsResult {
  applied: string[];
  skipped: Array<{ id: string; reason: string }>;
}

interface Props {
  sections: WorkbookSectionsInput;
  onApplyCellUpdates: (sectionKey: string, updates: CellUpdate[]) => Promise<void> | void;
  /** Settle an entity-level figure the documents disagreed on. */
  onApplyMetaValue?: (sectionKey: string, column: string, value: string) => Promise<void> | void;
  onNavigateToSection: (sectionKey: string) => void;
  /** Write fills into the workbook with their marks. Re-checks every cell first. */
  onApplyFills?: (proposals: FillProposal[]) => ApplyFillsResult | Promise<ApplyFillsResult>;
  onUndoFill?: (ref: CellRef) => void | Promise<void>;
  onUndoAllFills?: () => void | Promise<void>;
  /** Enables "Work out the rest" — the model pass needs the company to authorise against. */
  companyId?: string;
}

interface ModelResult {
  proposals: FillProposal[];
  questions: FillQuestion[];
  considered: number;
  rejected: number;
  truncated: number;
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
    <div className="rounded-xl border border-white/[0.06] bg-[color:var(--ink-2)] px-3.5 py-3" data-testid={`review-decision-${decision.section}-${decision.column}`}>
      <p className="text-[13px] text-white leading-snug">{decision.statement}</p>
      <p className="mt-1 text-[11px] text-[color:var(--body)] truncate">
        {decision.rows.slice(0, 4).map((r) => r.label).join(", ")}
        {decision.rows.length > 4 ? ` +${decision.rows.length - 4} more` : ""}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        {decision.options && decision.options.length > 0 ? (
          <>
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="h-8 min-w-0 max-w-md flex-1 rounded-lg border border-white/[0.10] bg-[color:var(--ink-3)] px-2 text-[12px] text-white outline-none"
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
              className="h-8 rounded-lg border border-white/[0.14] px-3 text-[12px] font-medium text-white hover:bg-white/[0.06] disabled:opacity-40"
              data-testid={`review-decision-apply-${decision.column}`}
            >
              Apply to {decision.rows.length === 1 ? "row" : `all ${decision.rows.length}`}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onNavigate}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.12] px-3 text-[12px] text-[color:var(--body)] hover:bg-white/[0.06]"
          >
            Open {decision.sectionLabel} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ icon, children, tone = "muted" }: { icon: ReactNode; children: ReactNode; tone?: "muted" | "warn" }) {
  return (
    <div className={`mb-2 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide ${tone === "warn" ? "text-[color:var(--hi)]" : "text-[color:var(--body)]"}`}>
      {icon} {children}
    </div>
  );
}

/** "Read" or "Derived" — never confused. A derived value says how. */
function KindBadge({ proposal }: { proposal: Pick<FillProposal, "id" | "kind" | "rule"> }) {
  const derived = proposal.kind === "derived";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${derived ? "border-dashed border-white/[0.22] text-white" : "border-white/[0.14] text-[color:var(--body)]"}`}
      data-testid={`review-fill-kind-${proposal.id}`}
      title={derived ? "Worked out from other figures — not stated in a document" : "Stated in your documents"}
    >
      {derived ? `Derived${proposal.rule ? ` · ${proposal.rule}` : ""}` : "Read"}
    </span>
  );
}

function FillCard({ proposal, onApply }: { proposal: FillProposal; onApply?: () => void }) {
  return (
    <div className="flex flex-col rounded-xl border border-white/[0.06] bg-[color:var(--ink-2)] px-3.5 py-3" data-testid={`review-fill-${proposal.id}`}>
      <p className="text-[11px] text-[color:var(--body)]">{cellLabelOf(proposal.section, proposal.rowLabel, proposal.columnLabel)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold tabular-nums text-white">{proposal.value}</span>
        <KindBadge proposal={proposal} />
        {proposal.affectsScore && <span className="text-[10.5px] font-medium text-[color:var(--hi)]">Changes your score</span>}
        {proposal.replaces !== undefined && (
          <span className="text-[10.5px] text-[color:var(--body)]">replaces “{proposal.replaces}”</span>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-[color:var(--body)]">{proposal.reasoning}</p>
      {proposal.conversion && (
        <p className="mt-1 text-[11.5px] text-white">Converted: {proposal.conversion}</p>
      )}
      <div className="mt-auto flex items-start justify-between gap-3 pt-2">
        <details className="min-w-0 text-[11.5px] text-[color:var(--body)]">
          <summary className="cursor-pointer select-none text-[color:var(--body)] hover:text-white">
            Evidence ({proposal.evidence.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {proposal.evidence.map((e, i) => (
              <li key={i} className="break-words">{describeEvidence(e)}</li>
            ))}
          </ul>
        </details>
        {onApply && (
          <button
            type="button"
            onClick={onApply}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-white/[0.14] px-2.5 text-[11.5px] font-medium text-white hover:bg-white/[0.06]"
            data-testid={`review-fill-apply-${proposal.id}`}
          >
            <Check className="h-3 w-3" /> Apply
          </button>
        )}
      </div>
    </div>
  );
}

/** The fills in as many columns as the width takes, none narrower than a card can read at. */
const FILL_GRID = "grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))]";

export function ExtractionReviewModal({
  sections,
  onApplyCellUpdates,
  onApplyMetaValue,
  onNavigateToSection,
  onApplyFills,
  onUndoFill,
  onUndoAllFills,
  companyId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [modelResult, setModelResult] = useState<ModelResult | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<FillProposal[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideWidth, setSideWidth] = useSidePaneWidth("okiru-ai-review-side-width");

  const review: ExtractionReview = useMemo(() => buildExtractionReview(sections), [sections]);
  const rules = useMemo(() => buildRuleFills(sections), [sections]);
  const fills = useMemo(() => activeAiFills(sections), [sections]);
  const openForModel = useMemo(() => buildAiReviewGrounding(sections).targets.length, [sections]);

  // The model's proposals stay only while their cell can still take them;
  // a rule proposal for the same cell wins.
  const proposals = useMemo(() => {
    const ruleIds = new Set(rules.proposals.map((p) => p.id));
    const live = (modelResult?.proposals ?? []).filter((p) => {
      if (ruleIds.has(p.id)) return false;
      const container = p.rowId === undefined
        ? (sections[p.section]?.meta as Record<string, unknown> | undefined)
        : (sections[p.section]?.rows ?? []).find((r) => String(r._id ?? "") === p.rowId);
      return canFill(p.section, container, p.column, p.value, p.replaces).ok;
    });
    return [...rules.proposals, ...live];
  }, [rules, modelResult, sections]);

  const questions = useMemo(() => {
    const filled = new Set(proposals.map((p) => `${p.section}|${p.rowId ?? ""}|${p.column}`));
    const seen = new Set<string>();
    return [...rules.questions, ...(modelResult?.questions ?? [])].filter((q) => {
      const key = `${q.section}|${q.rowId ?? ""}|${q.column}`;
      if (filled.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rules, modelResult, proposals]);

  const fromDocuments = review.extracted.some((s) => s.aiRowCount > 0);
  if (!fromDocuments && review.choices.length === 0 && proposals.length === 0 && fills.length === 0) return null;

  const badge = proposals.length + questions.length + review.conflicts.length + review.decisions.length + review.choices.length;
  const scoreChanging = proposals.filter((p) => p.affectsScore);
  // Once nothing is left to fill, what was filled takes the main pane.
  const fillsInMain = proposals.length === 0;
  const sideCount = questions.length + (fillsInMain ? 0 : fills.length);

  const apply = async (list: FillProposal[]) => {
    setConfirming(null);
    if (!onApplyFills || list.length === 0) return;
    const result = await onApplyFills(list);
    const skipped = result.skipped.length;
    setNotice(
      `Filled ${result.applied.length} cell${result.applied.length === 1 ? "" : "s"}.` +
        (skipped > 0 ? ` ${skipped} left as ${skipped === 1 ? "it was" : "they were"} — ${result.skipped[0].reason.toLowerCase()}` : ""),
    );
  };

  const applyAll = () => {
    if (scoreChanging.length > 0) setConfirming(proposals);
    else void apply(proposals);
  };

  /** One card's Apply: a fill that changes the score is confirmed first, like Apply all. */
  const applyOne = (p: FillProposal) => {
    if (p.affectsScore) setConfirming([p]);
    else void apply([p]);
  };

  const runModel = async () => {
    if (!companyId || modelBusy) return;
    setModelBusy(true);
    setModelError(null);
    try {
      const res = await fetch(`${API_BASE}/api/workbook/${encodeURIComponent(companyId)}/ai-review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as Partial<ModelResult> & { error?: string; message?: string };
      if (!res.ok) {
        setModelError(data.error ?? data.message ?? "The AI review is unavailable right now.");
        return;
      }
      setModelResult({
        proposals: Array.isArray(data.proposals) ? data.proposals : [],
        questions: Array.isArray(data.questions) ? data.questions : [],
        considered: Number(data.considered ?? 0),
        rejected: Number(data.rejected ?? 0),
        truncated: Number(data.truncated ?? 0),
      });
    } catch {
      setModelError("Could not reach the AI review — check your connection.");
    } finally {
      setModelBusy(false);
    }
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

  /** What the review filled, each with its Undo: beside the fills, or in their place once none are left. */
  const filledSection = (inMain: boolean) =>
    fills.length > 0 ? (
      <section data-testid="review-ai-fills" data-placement={inMain ? "main" : "side"}>
        <div className="mb-2 flex items-center justify-between">
          <SectionHeading icon={<Sparkles className="h-3.5 w-3.5" />}>Filled by AI review · {fills.length}</SectionHeading>
          {onUndoAllFills && (
            <button
              type="button"
              onClick={() => void onUndoAllFills()}
              className="inline-flex items-center gap-1 text-[11.5px] text-[color:var(--body)] hover:text-white"
              data-testid="review-undo-all"
            >
              <RotateCcw className="h-3 w-3" /> Undo all
            </button>
          )}
        </div>
        <ul className={inMain ? FILL_GRID : "space-y-1"}>
          {fills.map((f) => {
            const key = `${f.section}-${f.rowId ?? "meta"}-${f.column}`;
            return (
              <li key={key} className="flex items-start justify-between gap-3 rounded-lg bg-[color:var(--ink-2)] px-3 py-2" data-testid={`review-ai-fill-${key}`}>
                <span className="min-w-0 text-[12px] leading-snug">
                  <span className="block text-[10.5px] text-[color:var(--body)]">{cellLabelOf(f.section, f.rowLabel, f.columnLabel)}</span>
                  <span className="text-white">{f.mark.value}</span>
                  <span className="text-[color:var(--body)]"> · {f.mark.kind === "derived" ? "derived" : "read"} — {f.mark.reasoning}</span>
                </span>
                {onUndoFill && (
                  <button
                    type="button"
                    onClick={() => void onUndoFill({ section: f.section, rowId: f.rowId, column: f.column })}
                    className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-[color:var(--body)] hover:text-white"
                    data-testid={`review-undo-${key}`}
                  >
                    <RotateCcw className="h-3 w-3" /> Undo
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  return (
    <>
      {/* Floating entry point — always visible on a document-built workbook. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-[color:var(--ink-3)] px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)] hover:border-white/[0.24]"
        data-testid="extraction-review-open"
      >
        <Sparkles className="h-4 w-4 text-white/80" />
        AI review
        {badge > 0 && (
          <span className="ml-0.5 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-semibold text-white" data-testid="extraction-review-badge">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-[color:var(--ink)]/60 p-3 sm:p-5" onClick={() => setOpen(false)} data-testid="extraction-review-modal">
          {/* The whole screen, like the document review: the fills fill it, and
              the questions and what was filled sit beside them at the width the
              reader drags them to. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="extraction-review-title"
            className="flex h-full w-full max-w-[1760px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[color:var(--ink-3)]"
            onClick={(e) => e.stopPropagation()}
            data-testid="extraction-review-dialog"
          >
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="extraction-review-title" className="text-[16px] font-semibold text-white">AI review</h2>
                  <p className="mt-0.5 text-[12px] leading-snug text-[color:var(--body)]">
                    Fills it can back with your documents or your own figures. Where nothing backs a value, the cell stays empty and you get a question.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSideOpen((v) => !v)}
                    aria-expanded={sideOpen}
                    className="hidden items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12px] font-medium text-[color:var(--body)] hover:bg-white/[0.05] hover:text-white lg:inline-flex"
                    data-testid="review-toggle-side"
                  >
                    {sideOpen ? <PanelRightClose className="h-3.5 w-3.5" aria-hidden /> : <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />}
                    {sideOpen ? "Hide the side" : `Show questions and fills (${sideCount})`}
                  </button>
                  <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-[color:var(--body)] hover:bg-white/[0.06] hover:text-white" aria-label="Close">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {proposals.length > 0 && onApplyFills && !confirming && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[color:var(--ink-2)] px-3.5 py-2.5">
                  <p className="text-[12.5px] text-white">
                    {proposals.length} fill{proposals.length === 1 ? "" : "s"} ready
                    {scoreChanging.length > 0 && (
                      <span className="text-[color:var(--body)]"> · {scoreChanging.length} change{scoreChanging.length === 1 ? "s" : ""} your score</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={applyAll}
                    className="h-8 shrink-0 rounded-lg bg-white px-3 text-[12px] font-semibold text-black hover:bg-white/90"
                    data-testid="review-apply-all-suggestions"
                  >
                    Apply all {proposals.length}
                  </button>
                </div>
              )}
              {confirming && (
                <div className="mt-3 rounded-xl border border-white/[0.10] bg-[color:var(--ink-2)] px-3.5 py-3" data-testid="review-score-summary">
                  <p className="text-[12.5px] font-medium text-white">{confirming.length === 1 ? "This changes your score" : "These change your score"}</p>
                  <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                    {confirming.filter((p) => p.affectsScore).map((p) => (
                      <li key={p.id} className="text-[11.5px] text-[color:var(--body)]">
                        {cellLabelOf(p.section, p.rowLabel, p.columnLabel)} → <span className="text-white">{p.value}</span>
                        <span className="text-[color:var(--body)]"> ({p.kind === "derived" ? "derived" : "read"})</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void apply(confirming)}
                      className="h-8 rounded-lg bg-white px-3 text-[12px] font-semibold text-black hover:bg-white/90"
                      data-testid="review-confirm-apply"
                    >
                      {confirming.length === 1 ? "Apply" : `Apply all ${confirming.length}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="h-8 rounded-lg px-3 text-[12px] text-[color:var(--body)] hover:bg-white/[0.06]"
                      data-testid="review-cancel-apply"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {notice && (
                <p className="mt-2 text-[11.5px] text-[color:var(--body)]" role="status" data-testid="review-apply-notice">{notice}</p>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden" style={{ ["--review-side-w" as string]: `${sideWidth}px` }}>
            <div className="min-w-0 flex-1 space-y-5 px-5 py-4 lg:min-h-0 lg:overflow-y-auto" data-testid="review-main">
              {/* Which did you mean? — FIRST. These are figures the scorecard
                  is currently missing because the documents disagreed, so
                  they are the only items here actively costing points. */}
              {review.choices.length > 0 && (
                <section data-testid="review-choices">
                  <SectionHeading tone="warn" icon={<TriangleAlert className="h-3.5 w-3.5" />}>Which did you mean?</SectionHeading>
                  <div className="space-y-2">
                    {review.choices.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-white/[0.08] bg-[color:var(--ink-2)] px-3.5 py-3"
                        data-testid={`review-choice-${c.column}`}
                      >
                        <p className="text-[12.5px] text-white">{c.statement}</p>
                        <p className="mt-0.5 text-[11.5px] text-[color:var(--body)]">
                          {c.sectionLabel} · {c.columnLabel}
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {c.options.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              disabled={!onApplyMetaValue}
                              onClick={() => void onApplyMetaValue?.(c.section, c.column, o.value)}
                              className="rounded-lg border border-white/[0.12] bg-[color:var(--ink-3)] px-3 py-2 text-left hover:border-white/[0.3] disabled:opacity-40"
                              data-testid={`review-choice-option-${o.value}`}
                            >
                              <span className="block text-[13px] font-medium tabular-nums text-white">{o.value}</span>
                              {/* Naming the documents is the whole basis for
                                  choosing — a bare pair of numbers is not a
                                  question anyone can answer. */}
                              <span className="mt-0.5 block text-[10.5px] text-[color:var(--body)]">
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

              {/* Ready to fill: the rules' fills and the checked model fills. */}
              {proposals.length > 0 && (
                <section data-testid="review-suggestions">
                  <SectionHeading icon={<GitMerge className="h-3.5 w-3.5" />}>Ready to fill</SectionHeading>
                  <div className={FILL_GRID} data-testid="review-fill-grid">
                    {proposals.map((p) => (
                      <FillCard key={p.id} proposal={p} onApply={onApplyFills ? () => applyOne(p) : undefined} />
                    ))}
                  </div>
                </section>
              )}

              {/* Conflicts */}
              {review.conflicts.length > 0 && (
                <section data-testid="review-conflicts">
                  <SectionHeading tone="warn" icon={<TriangleAlert className="h-3.5 w-3.5" />}>Evidence disagrees — your call</SectionHeading>
                  <div className="space-y-1.5">
                    {review.conflicts.map((c) => (
                      <div key={c.id} className="rounded-xl border border-white/[0.08] bg-[color:var(--ink-2)] px-3.5 py-3">
                        <p className="text-[13px] leading-snug text-white">{c.statement}</p>
                        <div className="mt-1.5 space-y-0.5">
                          {c.sides.map((side, i) => (
                            <p key={i} className="text-[11.5px] text-[color:var(--body)]">
                              {side.label}: <span className="font-medium text-white">{side.value}</span>
                            </p>
                          ))}
                        </div>
                        {c.section && (
                          <button
                            type="button"
                            onClick={() => goTo(c.section as string)}
                            className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.12] px-2.5 text-[11.5px] text-[color:var(--body)] hover:bg-white/[0.06]"
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
                  <SectionHeading icon={<ListChecks className="h-3.5 w-3.5" />}>
                    Still missing — {review.decisions.length} decision{review.decisions.length === 1 ? "" : "s"}, not {review.decisions.reduce((n, d) => n + d.rows.length, 0)} errors
                  </SectionHeading>
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

              {fillsInMain ? filledSection(true) : null}

              {badge === 0 && (
                <p className="rounded-xl border border-white/[0.08] bg-[color:var(--ink-2)] px-3.5 py-3 text-[13px] text-white" data-testid="review-all-clear">
                  Everything read is placed, consistent and complete. Nothing needs your attention.
                </p>
              )}
            </div>

            <SidePaneHandle
              width={sideWidth}
              onChange={setSideWidth}
              label="Resize the questions and fills pane"
              className={sideOpen ? "" : "lg:hidden"}
              testId="review-resize-side"
            />

            <aside
              className={`min-w-0 space-y-5 border-t border-white/[0.06] bg-[color:var(--ink-2)]/40 px-5 py-4 lg:min-h-0 lg:w-[var(--review-side-w)] lg:max-w-[55%] lg:shrink-0 lg:overflow-y-auto lg:border-t-0 ${sideOpen ? "" : "lg:hidden"}`}
              aria-label="Questions and fills"
              data-testid="review-side"
            >
              {/* The model pass: only for what the rules left open. */}
              {companyId && onApplyFills && (openForModel > 0 || modelResult) && (
                <section className="rounded-xl border border-white/[0.06] px-3.5 py-3" data-testid="review-ai-pass">
                  {modelResult ? (
                    <p className="text-[12px] leading-snug text-[color:var(--body)]" data-testid="review-ai-summary">
                      AI checked {modelResult.considered} cell{modelResult.considered === 1 ? "" : "s"}:{" "}
                      {modelResult.proposals.length} fill{modelResult.proposals.length === 1 ? "" : "s"}, {modelResult.questions.length} question{modelResult.questions.length === 1 ? "" : "s"}
                      {modelResult.rejected > 0 && `, ${modelResult.rejected} answer${modelResult.rejected === 1 ? "" : "s"} dropped because your workbook did not back ${modelResult.rejected === 1 ? "it" : "them"}`}.
                      {modelResult.truncated > 0 && ` ${modelResult.truncated} more cell${modelResult.truncated === 1 ? "" : "s"} wait for the next pass.`}
                    </p>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] leading-snug text-[color:var(--body)]">
                        {openForModel} cell{openForModel === 1 ? "" : "s"} still need{openForModel === 1 ? "s" : ""} thought. One AI pass reads them with the rows around them; every answer is checked against your workbook before you see it.
                      </p>
                      <button
                        type="button"
                        onClick={() => void runModel()}
                        disabled={modelBusy}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.14] px-3 text-[12px] font-medium text-white hover:bg-white/[0.06] disabled:opacity-60"
                        data-testid="review-run-ai"
                      >
                        {modelBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {modelBusy ? "Working it out…" : "Work out the rest"}
                      </button>
                    </div>
                  )}
                  {modelError && (
                    <p className="mt-1.5 text-[11.5px] text-amber-200/90" data-testid="review-ai-error">{modelError}</p>
                  )}
                </section>
              )}

              {/* Cells nothing backs — left empty, one line each. */}
              {questions.length > 0 && (
                <section data-testid="review-questions">
                  <SectionHeading icon={<CircleHelp className="h-3.5 w-3.5" />}>Questions for you</SectionHeading>
                  <ul className="space-y-1">
                    {questions.map((q) => (
                      <li key={q.id} className="flex items-start justify-between gap-3 rounded-lg bg-[color:var(--ink-2)] px-3 py-2" data-testid={`review-question-${q.id}`}>
                        <span className="min-w-0 text-[12px] leading-snug">
                          <span className="block text-[10.5px] text-[color:var(--body)]">{q.cellLabel}</span>
                          <span className="text-white">{q.question}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => goTo(q.section)}
                          className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] text-[color:var(--body)] hover:text-white"
                        >
                          Open <ChevronRight className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* What the review already filled — each one can be taken back. */}
              {fillsInMain ? null : filledSection(false)}

              {/* Confirmed by more than one document. Not an action — it marks
                  the figures nobody needs to re-check. */}
              {review.corroborated.length > 0 && (
                <section data-testid="review-corroborated">
                  <SectionHeading icon={<Check className="h-3.5 w-3.5" />}>Confirmed by more than one document</SectionHeading>
                  <div className="space-y-1.5">
                    {review.corroborated.map((c) => (
                      <div key={`${c.section}.${c.column}`} className="rounded-lg bg-[color:var(--ink-2)] px-3 py-2">
                        <span className="text-[12.5px] text-white">
                          {c.columnLabel} — <span className="tabular-nums">{c.value}</span>
                        </span>
                        <span className="ml-2 text-[11px] text-[color:var(--body)]">{c.agreementCount} documents agree</span>
                        <span className="mt-0.5 block text-[10.5px] text-[color:var(--body)]">{c.sources.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* What landed where — reference, so it sits last and closed. */}
              {review.extracted.some((s) => s.aiRowCount > 0) && (
                <details className="group">
                  <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[color:var(--body)]">
                    <FileText className="h-3.5 w-3.5" /> Read into the workbook
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {review.extracted.filter((s) => s.aiRowCount > 0).map((s) => (
                      <button
                        key={s.section}
                        type="button"
                        onClick={() => goTo(s.section)}
                        className="flex w-full items-center justify-between rounded-lg bg-[color:var(--ink-2)] px-3 py-2 text-left hover:bg-white/[0.04]"
                      >
                        <span className="text-[12.5px] text-white">{s.sectionLabel}</span>
                        <span className="text-[11.5px] text-[color:var(--body)]">
                          {s.aiRowCount} row{s.aiRowCount === 1 ? "" : "s"} · {s.sources.length} document{s.sources.length === 1 ? "" : "s"}
                        </span>
                      </button>
                    ))}
                  </div>
                </details>
              )}

            </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
