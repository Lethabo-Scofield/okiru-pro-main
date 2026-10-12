/**
 * A side pane the reader can drag wider or narrower, beside a main pane that
 * takes the rest. Used by the AI reviews (B-BBEE and ESG): the fills fill the
 * screen, and the questions and the undo list sit beside them at the width the
 * reader chose. Wide screens only (lg and up); below that the panes stack.
 *
 * The width is remembered per viewer and per surface, in localStorage wrapped
 * in try/catch: a private window keeps it for the visit only.
 */
import { useRef, useState } from "react";

export interface SidePaneBounds {
  min: number;
  max: number;
  initial: number;
  step: number;
}

export const SIDE_PANE: SidePaneBounds = { min: 300, max: 720, initial: 400, step: 24 };

export function clampSidePane(n: number, bounds: SidePaneBounds = SIDE_PANE): number {
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, n)));
}

function stored(key: string, bounds: SidePaneBounds): number {
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= bounds.min && n <= bounds.max ? n : bounds.initial;
  } catch {
    return bounds.initial;
  }
}

/** The pane's width and its setter; the setter clamps and remembers. */
export function useSidePaneWidth(storageKey: string, bounds: SidePaneBounds = SIDE_PANE): [number, (next: number) => void] {
  const [width, setWidth] = useState(() => stored(storageKey, bounds));
  const change = (next: number) => {
    const w = clampSidePane(next, bounds);
    setWidth(w);
    try {
      window.localStorage.setItem(storageKey, String(w));
    } catch {
      // Kept for this visit only.
    }
  };
  return [width, change];
}

/**
 * The drag handle between the main pane and a side pane on its RIGHT:
 * dragging left (or ArrowLeft) widens the side pane.
 */
export function SidePaneHandle({
  width,
  onChange,
  label,
  bounds = SIDE_PANE,
  className = "",
  lineClassName = "",
  testId,
}: {
  width: number;
  onChange: (next: number) => void;
  label: string;
  bounds?: SidePaneBounds;
  className?: string;
  lineClassName?: string;
  testId?: string;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      tabIndex={0}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, width };
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current) onChange(clampSidePane(start.current.width + (start.current.x - e.clientX), bounds));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(clampSidePane(width + bounds.step, bounds));
        else if (e.key === "ArrowRight") onChange(clampSidePane(width - bounds.step, bounds));
        else return;
        e.preventDefault();
      }}
      className={`group relative hidden w-2 shrink-0 cursor-col-resize touch-none select-none items-stretch justify-center focus-visible:outline-none lg:flex ${className}`}
      data-testid={testId}
    >
      <span
        className={`w-px bg-white/[0.08] transition-colors duration-200 group-hover:bg-white/30 group-focus-visible:bg-white/60 ${lineClassName}`}
        aria-hidden
      />
    </div>
  );
}
