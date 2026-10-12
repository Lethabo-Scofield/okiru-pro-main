/**
 * One small marker for an ESG workbook cell, saying where its value stands:
 *
 *   sparkle   filled by the AI review — its reason, evidence and Undo
 *   document  placed from a document — which file
 *   warning   documents disagree — each value and its source; the cell is blank
 *
 * The marker is judged against what the cell holds NOW (a value being typed
 * counts): a fill shows only while the cell holds the filled value, a document
 * only while it holds what the document placed. Once the user edits the cell,
 * the value is theirs and the marker goes.
 *
 * Cells read their section from `EsgCellSectionContext` and the marks from
 * `EsgCellMarkContext`; with no provider (the toolkit's inline editors) the
 * marker renders nothing.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { FileText, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import {
  describeEsgEvidence,
  esgCellKey,
  esgCellMarkState,
  esgFillBadge,
  type EsgCellMarkIndex,
  type EsgCellMarkState,
} from "@/lib/esg/esgAiReviewFill";

export interface EsgCellMarkContextValue {
  index: EsgCellMarkIndex;
  /** Absent when the workbook is locked. */
  onUndo?: (key: string) => void;
}

export const EsgCellMarkContext = createContext<EsgCellMarkContextValue | null>(null);
/** The section the cells below belong to. */
export const EsgCellSectionContext = createContext<string | null>(null);

function describe(state: EsgCellMarkState): string {
  if (state.kind === "document") return `From a document: ${state.files.join(", ")}`;
  if (state.kind === "dispute") {
    return `Documents disagree: ${state.dispute.candidates
      .map((c) => `${String(c.value)}${c.unit ? ` ${c.unit}` : ""} (${c.sources.join(", ") || "source unknown"})`)
      .join(" or ")}`;
  }
  const lines = [`Filled by AI review — ${esgFillBadge(state.mark.kind, state.mark.rule)}`, state.mark.reason];
  if (state.mark.conversion) lines.push(`Converted: ${state.mark.conversion}`);
  return lines.join("\n");
}

interface Props {
  cell: string;
  /** The cell's value now, as the editor holds it. */
  current: unknown;
  /** Overrides the section from context (the register grid passes its own). */
  section?: string;
  className?: string;
}

export function EsgCellMark({ cell, current, section, className = "" }: Props) {
  const marks = useContext(EsgCellMarkContext);
  const contextSection = useContext(EsgCellSectionContext);
  const sectionId = section ?? contextSection;
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setAnchor(null);
        return;
      }
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setAnchor(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [anchor]);

  if (!marks || !sectionId) return null;
  const key = esgCellKey(sectionId, cell);
  const state = esgCellMarkState(marks.index, key, current);
  if (!state) return null;

  const testId = `esg-cell-mark-${key}`;
  const label = state.kind === "ai" ? "Filled by AI review" : state.kind === "document" ? "From a document" : "Documents disagree";
  const Icon = state.kind === "ai" ? Sparkles : state.kind === "document" ? FileText : TriangleAlert;
  const tone = state.kind === "dispute" ? "text-amber-300" : "text-[var(--esg-text2)] hover:text-[var(--esg-text)]";
  const left = anchor ? Math.max(8, Math.min(anchor.right - 288, (typeof window !== "undefined" ? window.innerWidth : 1024) - 296)) : 0;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={describe(state)}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect());
        }}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-white/[0.08] ${tone} ${className}`}
        data-testid={testId}
        data-mark-kind={state.kind}
      >
        <Icon className="h-3 w-3" aria-hidden />
      </button>
      {anchor && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          onMouseDown={(e) => e.stopPropagation()}
          // A solid surface: the grid's text must never show through it.
          className="fixed z-[70] w-72 whitespace-normal rounded-xl border border-[var(--esg-glass-border-hover)] bg-[var(--ink-3,#16181c)] p-3 text-left font-normal normal-case tracking-normal shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={{ top: anchor.bottom + 6, left }}
          data-testid={`${testId}-panel`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-semibold text-[var(--esg-text)]">
              {label}
              {state.kind === "ai" ? (
                <>
                  {" "}
                  <span className="ml-1 font-normal text-[var(--esg-text2)]">· {esgFillBadge(state.mark.kind, state.mark.rule)}</span>
                </>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => setAnchor(null)}
              aria-label="Close"
              className="rounded p-0.5 text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {state.kind === "ai" ? (
            <>
              <p className="mt-1.5 text-[12px] leading-snug text-[var(--esg-text2)]">{state.mark.reason}</p>
              {state.mark.conversion ? (
                <p className="mt-1 text-[11.5px] text-[var(--esg-text2)]">Converted: {state.mark.conversion}</p>
              ) : null}
              {state.mark.evidence.length > 0 ? (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-[var(--esg-text2)]">
                  {state.mark.evidence.map((e, i) => (
                    <li key={i} className="break-words">
                      {describeEsgEvidence(e)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {marks.onUndo ? (
                <button
                  type="button"
                  onClick={() => {
                    setAnchor(null);
                    marks.onUndo?.(key);
                  }}
                  className="mt-2.5 inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--esg-glass-border-hover)] px-2.5 text-[11.5px] text-[var(--esg-text)] hover:bg-white/[0.06]"
                  data-testid={`${testId}-undo`}
                >
                  <RotateCcw className="h-3 w-3" /> Undo this fill
                </button>
              ) : null}
            </>
          ) : state.kind === "document" ? (
            <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-[var(--esg-text2)]">
              {state.files.map((f) => (
                <li key={f} className="break-words">
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="mt-1.5 text-[12px] leading-snug text-[var(--esg-text2)]">
                Left blank until you choose. Each value and the documents that state it:
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-[var(--esg-text2)]">
                {state.dispute.candidates.map((c, i) => (
                  <li key={i} className="break-words">
                    <span className="text-[var(--esg-text)]">
                      {String(c.value)}
                      {c.unit ? ` ${c.unit}` : ""}
                    </span>{" "}
                    — {c.sources.join(", ") || "source unknown"}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
