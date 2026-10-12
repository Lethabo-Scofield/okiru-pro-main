/**
 * The mark on a cell the AI review filled.
 *
 * A small sparkle in the cell's corner. Hover shows the reason and evidence
 * (the native tooltip, so it works everywhere); a click opens the same as a
 * panel with Undo. Shown only while the cell still holds the filled value. Once
 * the user edits the cell it is their value, and the mark goes.
 */
import { useEffect, useRef, useState } from "react";
import { RotateCcw, Sparkles, X } from "lucide-react";
import { describeEvidence, describeMark, type AiFillMark } from "@/lib/aiReviewFill";

interface Props {
  mark: AiFillMark;
  /** Absent when the user may not edit the cell. */
  onUndo?: () => void;
  testId: string;
  className?: string;
}

export function AiFillMarker({ mark, onUndo, testId, className = "" }: Props) {
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

  const derived = mark.kind === "derived";
  // Kept inside the viewport: the panel is 288px wide and opens below the mark.
  const left = anchor ? Math.max(8, Math.min(anchor.right - 288, (typeof window !== "undefined" ? window.innerWidth : 1024) - 296)) : 0;

  return (
    <>
      <button
        type="button"
        aria-label="Filled by AI review"
        title={describeMark(mark)}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect());
        }}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-violet-300/80 hover:bg-white/[0.08] hover:text-violet-200 ${className}`}
        data-testid={testId}
      >
        <Sparkles className="h-3 w-3" />
      </button>
      {anchor && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Filled by AI review"
          onMouseDown={(e) => e.stopPropagation()}
          // whitespace-normal: the grid cell this sits in truncates (nowrap),
          // which would otherwise run the reason off the panel's edge.
          className="fixed z-[70] w-72 whitespace-normal rounded-xl border border-white/[0.10] bg-[color:var(--ink-3)] p-3 text-left shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={{ top: anchor.bottom + 6, left }}
          data-testid={`${testId}-panel`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-semibold text-white">
              Filled by AI review
              <span className="ml-1.5 font-normal text-[color:var(--body)]">· {derived ? "derived" : "read from your documents"}</span>
            </p>
            <button type="button" onClick={() => setAnchor(null)} aria-label="Close" className="rounded p-0.5 text-[color:var(--body)] hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-[color:var(--body)]">{mark.reasoning}</p>
          {mark.conversion && <p className="mt-1 text-[11.5px] text-amber-200/80">Converted: {mark.conversion}</p>}
          {mark.evidence.length > 0 && (
            <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-[color:var(--body)]">
              {mark.evidence.map((e, i) => (
                <li key={i} className="break-words">{describeEvidence(e)}</li>
              ))}
            </ul>
          )}
          {onUndo && (
            <button
              type="button"
              onClick={() => {
                setAnchor(null);
                onUndo();
              }}
              className="mt-2.5 inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.14] px-2.5 text-[11.5px] text-white hover:bg-white/[0.06]"
              data-testid={`${testId}-undo`}
            >
              <RotateCcw className="h-3 w-3" /> Undo this fill
            </button>
          )}
        </div>
      )}
    </>
  );
}
