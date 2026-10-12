/**
 * The ESG workbook's AI review.
 *
 * One place that answers, in plain language: what can be filled and why, what
 * the review filled already (and how to take it back), and what it could not
 * support. In trust order:
 *
 *   Ready to fill        values backed by the workbook's own figures, the
 *                        company record or a filed document, each with its
 *                        reason and evidence, labelled Read or Derived. Applied
 *                        per cell or all at once; anything that changes the
 *                        score is confirmed first, with the before and after.
 *   Work out the rest    the free rules over the filed documents, then one AI
 *                        pass over what is left; every answer is checked first
 *   Questions            cells nothing backs: left empty, one line each
 *   Filled by AI review  every applied fill, undoable one by one or all
 *
 * The rules (esgAiReviewFill.ts) run here, free; the model pass is checked on
 * the server (esgAiReviewModel.ts). Confirmed fills go through the ordinary
 * section save.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronRight, CircleHelp, GitMerge, Info, Loader2, PanelRightClose, PanelRightOpen, RotateCcw, Sparkles, X } from "lucide-react";
import {
  activeEsgFills,
  buildEsgRuleFills,
  canFillEsgCell,
  describeEsgEvidence,
  esgDisplayValue,
  esgFillBadge,
  type EsgFillProposal,
  type EsgFillQuestion,
  type EsgWorkbookLike,
} from "@/lib/esg/esgAiReviewFill";
import { esgOpenCellCount } from "@/lib/esg/esgAiReviewModel";
import { esgScoreChangingFills, esgScoreEffect, type EsgScoreSnapshot } from "@/lib/esg/esgAiReviewScore";
import { API_BASE } from "@toolkit/lib/config";
import { SidePaneHandle, useSidePaneWidth } from "@/components/review/SidePane";

export interface EsgApplyFillsResult {
  applied: string[];
  skipped: Array<{ id: string; reason: string }>;
}

interface Props {
  companyId: string;
  companyName?: string;
  workbook: EsgWorkbookLike | null;
  /** A submitted workbook takes no fills. */
  locked?: boolean;
  onApplyFills: (proposals: EsgFillProposal[]) => Promise<EsgApplyFillsResult>;
  onUndoFill: (key: string) => Promise<void>;
  onUndoAllFills: () => Promise<void>;
  onOpenSection: (sectionId: string) => void;
}

interface ModelResult {
  proposals: EsgFillProposal[];
  questions: EsgFillQuestion[];
  considered: number;
  rejected: number;
  truncated: number;
  documents: number;
  notes: string[];
}

const SECTION_HEADING = "mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--esg-text2)]";
const CARD = "rounded-xl border border-[var(--esg-glass-border)] bg-white/[0.02] px-3.5 py-3";
const QUIET_BUTTON =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-[var(--esg-glass-border-hover)] px-2.5 text-[11.5px] font-medium text-[var(--esg-text)] hover:bg-white/[0.06] disabled:opacity-50";
/** The fills in as many columns as the width takes, none narrower than a card can read at. */
const FILL_GRID = "grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))]";
const PRIMARY_BUTTON =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--esg-acc-e)] px-3 text-[12px] font-semibold text-[#080e14] hover:opacity-90 disabled:opacity-50";

function Heading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={SECTION_HEADING}>
      {icon} {children}
    </div>
  );
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

function ScoreLine({ before, after }: { before: EsgScoreSnapshot | null; after: EsgScoreSnapshot | null }) {
  if (!before || !after) return null;
  // The overall score is a fraction (0.45 = 45%). One decimal unless that hides the change.
  const from = before.overall * 100;
  const to = after.overall * 100;
  const places = round(from, 1) === round(to, 1) ? 2 : 1;
  const pillars = (["environmental", "social", "governance"] as const).filter((k) => Math.abs(before[k] - after[k]) > 1e-9);
  const name = { environmental: "Environmental", social: "Social", governance: "Governance" } as const;
  return (
    <p className="mt-1 text-[11.5px] text-[var(--esg-text2)]" data-testid="esg-review-score-change">
      Overall score {round(from, places)}% → <span className="text-[var(--esg-text)]">{round(to, places)}%</span>
      {pillars.map((k) => (
        <span key={k}>
          {" "}
          · {name[k]} {round(before[k], 2)} → <span className="text-[var(--esg-text)]">{round(after[k], 2)}</span> points
        </span>
      ))}
    </p>
  );
}

function FillCard({
  proposal,
  changesScore,
  onApply,
  busy,
}: {
  proposal: EsgFillProposal;
  changesScore: boolean;
  onApply?: () => void;
  busy: boolean;
}) {
  return (
    <div className={`${CARD} flex flex-col`} data-testid={`esg-review-fill-${proposal.id}`}>
      <p className="text-[11.5px] leading-snug text-[var(--esg-text2)]">{proposal.cellLabel}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="break-words text-[14px] font-semibold tabular-nums text-[var(--esg-text)]">
          {esgDisplayValue(proposal.value, proposal.unit)}
        </span>
        <span
          className="rounded-full border border-[var(--esg-glass-border-hover)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--esg-text2)]"
          data-testid={`esg-review-fill-kind-${proposal.id}`}
          title={proposal.kind === "derived" ? "Worked out from named figures — not stated in a document" : "Stated by a cell, the company record or a document"}
        >
          {esgFillBadge(proposal.kind, proposal.rule)}
        </span>
        {changesScore ? (
          <span className="text-[10.5px] font-medium text-[var(--esg-text)]" data-testid={`esg-review-fill-score-${proposal.id}`}>
            Changes your score
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-[var(--esg-text2)]">{proposal.reasoning}</p>
      {proposal.conversion ? (
        <p className="mt-1 text-[11.5px] text-[var(--esg-text)]" data-testid={`esg-review-fill-conversion-${proposal.id}`}>
          Converted: {proposal.conversion}
        </p>
      ) : null}
      <div className="mt-auto flex items-start justify-between gap-3 pt-2">
        <details className="min-w-0 text-[11.5px] text-[var(--esg-text2)]">
          <summary className="cursor-pointer select-none hover:text-[var(--esg-text)]">Evidence ({proposal.evidence.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {proposal.evidence.map((e, i) => (
              <li key={i} className="break-words">
                {describeEsgEvidence(e)}
              </li>
            ))}
          </ul>
        </details>
        {onApply ? (
          <button type="button" onClick={onApply} disabled={busy} className={QUIET_BUTTON} data-testid={`esg-review-fill-apply-${proposal.id}`}>
            <Check className="h-3 w-3" /> Apply
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The toolbar's entry point and the review itself. */
export function EsgAiReviewModal({
  companyId,
  companyName,
  workbook,
  locked = false,
  onApplyFills,
  onUndoFill,
  onUndoAllFills,
  onOpenSection,
}: Props) {
  const [open, setOpen] = useState(false);
  const [modelResult, setModelResult] = useState<ModelResult | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<EsgFillProposal[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideWidth, setSideWidth] = useSidePaneWidth("okiru-esg-ai-review-side-width");

  const wb = workbook ?? { sections: {} };
  const rules = useMemo(() => buildEsgRuleFills(wb, { companyName }), [wb, companyName]);
  const fills = useMemo(() => activeEsgFills(wb), [wb]);

  // The model's proposals stay only while their cell can still take them; a
  // rule proposal for the same cell wins.
  const proposals = useMemo(() => {
    const ruleKeys = new Set(rules.proposals.map((p) => p.key));
    const live = (modelResult?.proposals ?? []).filter(
      (p) => !ruleKeys.has(p.key) && canFillEsgCell(wb, p.section, p.cell, p.value).ok,
    );
    return [...rules.proposals, ...live];
  }, [rules, modelResult, wb]);

  const questions = useMemo(() => {
    const filled = new Set(proposals.map((p) => p.key));
    const seen = new Set<string>();
    return [...rules.questions, ...(modelResult?.questions ?? [])].filter((q) => {
      if (q.key && filled.has(q.key)) return false;
      if (seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    });
  }, [rules, modelResult, proposals]);

  // Measured only while the review is open: each fill is scored on its own.
  const scoreChanging = useMemo(() => (open ? esgScoreChangingFills(wb, proposals) : new Set<string>()), [open, wb, proposals]);
  const openForModel = useMemo(() => (open && !locked ? esgOpenCellCount(wb, { companyName }) : 0), [open, locked, wb, companyName]);
  const confirmEffect = useMemo(() => (confirming ? esgScoreEffect(wb, confirming) : null), [confirming, wb]);

  const badge = proposals.length + questions.length;
  // Once nothing is left to fill, what was filled takes the main pane.
  const fillsInMain = proposals.length === 0;
  const sideCount = questions.length + (fillsInMain ? 0 : fills.length);
  const canApply = !locked;

  const apply = async (list: EsgFillProposal[]) => {
    setConfirming(null);
    if (list.length === 0) return;
    setBusy(true);
    try {
      const result = await onApplyFills(list);
      const skipped = result.skipped.length;
      setNotice(
        `Filled ${result.applied.length} cell${result.applied.length === 1 ? "" : "s"}.` +
          (skipped > 0 ? ` ${skipped} left as ${skipped === 1 ? "it was" : "they were"}: ${result.skipped[0].reason.toLowerCase()}` : ""),
      );
    } catch {
      setNotice("The fills could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const applyAll = () => {
    if (proposals.some((p) => scoreChanging.has(p.id))) setConfirming(proposals);
    else void apply(proposals);
  };

  /** One card's Apply: a fill that changes the score is confirmed first, like Apply all. */
  const applyOne = (p: EsgFillProposal) => {
    if (scoreChanging.has(p.id)) setConfirming([p]);
    else void apply([p]);
  };

  const runModel = async () => {
    if (!companyId || modelBusy) return;
    setModelBusy(true);
    setModelError(null);
    try {
      const res = await fetch(`${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/ai-review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as Partial<ModelResult> & { error?: string; message?: string };
      if (!res.ok) setModelError(data.error ?? data.message ?? "The AI review is unavailable right now.");
      // The free rules over the documents stand even when the model does not.
      if (res.ok || Array.isArray(data.proposals)) {
        setModelResult({
          proposals: Array.isArray(data.proposals) ? data.proposals : [],
          questions: Array.isArray(data.questions) ? data.questions : [],
          considered: Number(data.considered ?? 0),
          rejected: Number(data.rejected ?? 0),
          truncated: Number(data.truncated ?? 0),
          documents: Number(data.documents ?? 0),
          notes: Array.isArray(data.notes) ? data.notes.map(String) : [],
        });
      }
    } catch {
      setModelError("Could not reach the AI review. Check your connection.");
    } finally {
      setModelBusy(false);
    }
  };

  const goTo = (sectionId: string) => {
    setOpen(false);
    onOpenSection(sectionId);
  };

  const undo = async (run: () => Promise<void>) => {
    setBusy(true);
    try {
      await run();
      setNotice(null);
    } catch {
      setNotice("The undo could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  /** What the review filled, each with its Undo: beside the fills, or in their place once none are left. */
  const filledSection = (inMain: boolean) =>
    fills.length > 0 ? (
      <section data-testid="esg-review-ai-fills" data-placement={inMain ? "main" : "side"}>
        <div className="mb-2 flex items-center justify-between">
          <Heading icon={<Sparkles className="h-3.5 w-3.5" />}>Filled by AI review · {fills.length}</Heading>
          {canApply ? (
            <button
              type="button"
              onClick={() => void undo(onUndoAllFills)}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[11.5px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
              data-testid="esg-review-undo-all"
            >
              <RotateCcw className="h-3 w-3" /> Undo all
            </button>
          ) : null}
        </div>
        <ul className={inMain ? FILL_GRID : "space-y-1"}>
          {fills.map((f) => (
            <li key={f.key} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2" data-testid={`esg-review-ai-fill-${f.key}`}>
              <span className="min-w-0 text-[12px] leading-snug">
                <span className="block text-[11px] text-[var(--esg-text2)]">{f.label}</span>
                <span>{esgDisplayValue(f.mark.v, f.unit)}</span>
                <span className="text-[var(--esg-text2)]">
                  {" "}
                  · {esgFillBadge(f.mark.kind, f.mark.rule).toLowerCase()} — {f.mark.reason}
                </span>
              </span>
              {canApply ? (
                <button
                  type="button"
                  onClick={() => void undo(() => onUndoFill(f.key))}
                  disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
                  data-testid={`esg-review-undo-${f.key}`}
                >
                  <RotateCcw className="h-3 w-3" /> Undo
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!workbook}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
        data-testid="esg-ai-review-open"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI review
        {badge > 0 ? (
          <span className="rounded-full bg-white/[0.08] px-1.5 text-[11px] font-semibold text-[var(--esg-text)]" data-testid="esg-ai-review-badge">
            {badge}
          </span>
        ) : null}
      </button>

      {open && (
        <div
          className="esg-theme fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 p-3 sm:p-5"
          onClick={() => setOpen(false)}
          data-testid="esg-ai-review-modal"
        >
          {/* The whole screen, like the document review: the fills fill it, and
              the questions and what was filled sit beside them at the width the
              reader drags them to. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="esg-ai-review-title"
            className="flex h-full w-full max-w-[1760px] flex-col overflow-hidden rounded-2xl border border-[var(--esg-glass-border-hover)] bg-[var(--esg-section-bg)] text-[var(--esg-text)] shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
            data-testid="esg-ai-review-dialog"
          >
            <div className="border-b border-[var(--esg-glass-border)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="esg-ai-review-title" className="text-[16px] font-semibold">
                    AI review
                  </h2>
                  <p className="mt-0.5 text-[12px] leading-snug text-[var(--esg-text2)]">
                    Fills it can back with your documents or your own figures. Where nothing backs a value, the cell stays
                    empty and you get a question.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSideOpen((v) => !v)}
                    aria-expanded={sideOpen}
                    className="hidden items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12px] font-medium text-[var(--esg-text2)] hover:bg-white/[0.05] hover:text-[var(--esg-text)] lg:inline-flex"
                    data-testid="esg-review-toggle-side"
                  >
                    {sideOpen ? <PanelRightClose className="h-3.5 w-3.5" aria-hidden /> : <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />}
                    {sideOpen ? "Hide the side" : `Show questions and fills (${sideCount})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full p-1.5 text-[var(--esg-text2)] hover:bg-white/[0.06] hover:text-[var(--esg-text)]"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {proposals.length > 0 && canApply && !confirming ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3.5 py-2.5">
                  <p className="text-[12.5px]" data-testid="esg-review-ready-line">
                    {proposals.length} fill{proposals.length === 1 ? "" : "s"} ready
                    {scoreChanging.size > 0 ? (
                      <span className="text-[var(--esg-text2)]">
                        {" "}
                        · {scoreChanging.size} change{scoreChanging.size === 1 ? "s" : ""} your score
                      </span>
                    ) : null}
                  </p>
                  <button type="button" onClick={applyAll} disabled={busy} className={PRIMARY_BUTTON} data-testid="esg-review-apply-all">
                    Apply all {proposals.length}
                  </button>
                </div>
              ) : null}
              {confirming ? (
                <div className="mt-3 rounded-xl border border-[var(--esg-glass-border-hover)] bg-white/[0.03] px-3.5 py-3" data-testid="esg-review-score-summary">
                  <p className="text-[12.5px] font-medium">{confirming.length === 1 ? "This changes your score" : "These change your score"}</p>
                  <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                    {confirming
                      .filter((p) => scoreChanging.has(p.id))
                      .map((p) => (
                        <li key={p.id} className="text-[11.5px] text-[var(--esg-text2)]">
                          {p.cellLabel} → <span className="text-[var(--esg-text)]">{esgDisplayValue(p.value, p.unit)}</span> ({p.kind})
                        </li>
                      ))}
                  </ul>
                  <ScoreLine before={confirmEffect?.before ?? null} after={confirmEffect?.after ?? null} />
                  <div className="mt-2.5 flex items-center gap-2">
                    <button type="button" onClick={() => void apply(confirming)} disabled={busy} className={PRIMARY_BUTTON} data-testid="esg-review-confirm-apply">
                      {confirming.length === 1 ? "Apply" : `Apply all ${confirming.length}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="h-8 rounded-lg px-3 text-[12px] text-[var(--esg-text2)] hover:bg-white/[0.06] hover:text-[var(--esg-text)]"
                      data-testid="esg-review-cancel-apply"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {notice ? (
                <p className="mt-2 text-[11.5px] text-[var(--esg-text2)]" role="status" data-testid="esg-review-apply-notice">
                  {notice}
                </p>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden" style={{ ["--esg-review-side-w" as string]: `${sideWidth}px` }}>
            <div className="min-w-0 flex-1 space-y-5 px-5 py-4 lg:min-h-0 lg:overflow-y-auto" data-testid="esg-review-main">
              {locked ? (
                <p className={`${CARD} text-[12.5px] text-[var(--esg-text2)]`} data-testid="esg-review-locked">
                  This workbook is submitted, so the review can show its fills but not add or undo any.
                </p>
              ) : null}

              {proposals.length > 0 ? (
                <section data-testid="esg-review-suggestions">
                  <Heading icon={<GitMerge className="h-3.5 w-3.5" />}>Ready to fill</Heading>
                  <div className={FILL_GRID} data-testid="esg-review-fill-grid">
                    {proposals.map((p) => (
                      <FillCard
                        key={p.id}
                        proposal={p}
                        changesScore={scoreChanging.has(p.id)}
                        busy={busy}
                        onApply={canApply ? () => applyOne(p) : undefined}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {fillsInMain ? filledSection(true) : null}

              {badge === 0 && fills.length === 0 && openForModel === 0 && !modelResult ? (
                <p className={`${CARD} text-[13px]`} data-testid="esg-review-all-clear">
                  Nothing to fill from what the workbook already holds. Add documents to give the review more to read.
                </p>
              ) : proposals.length === 0 && fills.length === 0 && !locked ? (
                <p className="text-[12.5px] text-[var(--esg-text2)]" data-testid="esg-review-nothing-ready">
                  Nothing is ready to fill right now. What is left is beside this: the AI pass and the questions.
                </p>
              ) : null}
            </div>

            <SidePaneHandle
              width={sideWidth}
              onChange={setSideWidth}
              label="Resize the questions and fills pane"
              className={sideOpen ? "" : "lg:hidden"}
              lineClassName="bg-[var(--esg-glass-border-hover)]"
              testId="esg-review-resize"
            />

            <aside
              className={`min-w-0 space-y-5 border-t border-[var(--esg-glass-border)] bg-white/[0.015] px-5 py-4 lg:min-h-0 lg:w-[var(--esg-review-side-w)] lg:max-w-[55%] lg:shrink-0 lg:overflow-y-auto lg:border-t-0 ${sideOpen ? "" : "lg:hidden"}`}
              aria-label="Questions and fills"
              data-testid="esg-review-side"
            >
              {!locked && (openForModel > 0 || modelResult) ? (
                <section className={CARD} data-testid="esg-review-ai-pass">
                  {modelResult ? (
                    <div className="space-y-1">
                      <p className="text-[12px] leading-snug text-[var(--esg-text2)]" data-testid="esg-review-ai-summary">
                        Read {modelResult.documents} filed document{modelResult.documents === 1 ? "" : "s"}
                        {modelResult.considered > 0
                          ? ` and checked ${modelResult.considered} cell${modelResult.considered === 1 ? "" : "s"} with AI`
                          : ""}
                        : {modelResult.proposals.length} fill{modelResult.proposals.length === 1 ? "" : "s"},{" "}
                        {modelResult.questions.length} question{modelResult.questions.length === 1 ? "" : "s"}
                        {modelResult.rejected > 0
                          ? `, ${modelResult.rejected} answer${modelResult.rejected === 1 ? "" : "s"} dropped because your documents did not back ${modelResult.rejected === 1 ? "it" : "them"}`
                          : ""}
                        .
                        {modelResult.truncated > 0
                          ? ` ${modelResult.truncated} more cell${modelResult.truncated === 1 ? "" : "s"} wait for the next pass.`
                          : ""}
                      </p>
                      {modelResult.notes.length > 0 ? (
                        <ul className="space-y-0.5" data-testid="esg-review-notes">
                          {modelResult.notes.map((n, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-[var(--esg-text2)]">
                              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {n}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] leading-snug text-[var(--esg-text2)]">
                        {openForModel} cell{openForModel === 1 ? " is" : "s are"} still blank. The review reads the documents
                        filed under this company, then one AI pass works out the rest; every answer is checked against them
                        before you see it.
                      </p>
                      <button
                        type="button"
                        onClick={() => void runModel()}
                        disabled={modelBusy}
                        className={QUIET_BUTTON.replace("h-7", "h-8")}
                        data-testid="esg-review-run-ai"
                      >
                        {modelBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {modelBusy ? "Working it out…" : "Work out the rest"}
                      </button>
                    </div>
                  )}
                  {modelError ? (
                    <p className="mt-1.5 text-[11.5px] text-amber-200/90" data-testid="esg-review-ai-error">
                      {modelError}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {questions.length > 0 ? (
                <section data-testid="esg-review-questions">
                  <Heading icon={<CircleHelp className="h-3.5 w-3.5" />}>Questions for you</Heading>
                  <ul className="space-y-1">
                    {questions.map((q) => (
                      <li key={q.id} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2" data-testid={`esg-review-question-${q.id}`}>
                        <span className="min-w-0 text-[12px] leading-snug">
                          <span className="block text-[11px] text-[var(--esg-text2)]">{q.cellLabel}</span>
                          <span>{q.question}</span>
                        </span>
                        {q.section ? (
                          <button
                            type="button"
                            onClick={() => goTo(q.section!)}
                            className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
                          >
                            Open <ChevronRight className="h-3 w-3" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {fillsInMain ? null : filledSection(false)}

              {sideCount === 0 ? (
                <p className="text-[12px] leading-snug text-[var(--esg-text2)]" data-testid="esg-review-side-empty">
                  {fillsInMain ? "No questions." : "No questions, and nothing filled by the review yet."}
                </p>
              ) : null}
            </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
