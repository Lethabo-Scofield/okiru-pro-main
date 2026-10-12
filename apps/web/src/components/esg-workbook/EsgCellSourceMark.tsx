/**
 * The mark on a workbook cell a document filled — or that documents disagree on.
 *
 * Provenance has been written beside every placed value since E4, but only the
 * Summary's core-values panel read it: in the grid itself a figure from a
 * diesel report looked exactly like one typed by hand, and a cell two
 * documents disagreed about was simply blank. So each such cell carries a
 * small mark, the same shape of thing B-BBEE's AI-fill sparkle is:
 *
 *   • a dot — "from <file>, placed <date>", and "edited since" once the value
 *     no longer matches what the document said (the mark goes hollow);
 *   • an amber triangle — "your documents disagree", every value with the
 *     files that gave it, until someone enters the right one.
 *
 * Hover shows it (the native tooltip, so it works everywhere); a click opens
 * the same as a small panel. Never colour alone: each state has its own shape
 * and its own words.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, FileText, X } from "lucide-react";
import {
  readConflicts,
  readProvenance,
  stillAsPlaced,
  type EsgConflictRecord,
  type EsgPlacementRecord,
} from "@/lib/esg/esgProvenance";
import { formatEsgDate, formatEsgScalar } from "@/lib/esg/esgFormat";

interface CellSources {
  placements: Map<string, EsgPlacementRecord>;
  conflicts: Map<string, EsgConflictRecord>;
}

const EMPTY: CellSources = { placements: new Map(), conflicts: new Map() };
const CellSourcesContext = createContext<CellSources>(EMPTY);

type WorkbookLike = { sections?: Record<string, { cells?: Record<string, unknown> } | undefined> } | null | undefined;

/** The records for one section of the workbook, read once for every cell under it. */
export function EsgCellSourcesProvider({
  workbook,
  sectionId,
  children,
}: {
  workbook: WorkbookLike;
  sectionId: string;
  children: ReactNode;
}) {
  const provenance = workbook?.sections?.provenance;
  const value = useMemo<CellSources>(() => {
    const placements = new Map<string, EsgPlacementRecord>();
    const conflicts = new Map<string, EsgConflictRecord>();
    for (const r of readProvenance(workbook)) if (r.sectionId === sectionId) placements.set(r.cellRef, r);
    for (const c of readConflicts(workbook)) if (c.sectionId === sectionId) conflicts.set(c.cellRef, c);
    return { placements, conflicts };
    // Only the provenance section and the section id decide the records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provenance, sectionId]);
  return <CellSourcesContext.Provider value={value}>{children}</CellSourcesContext.Provider>;
}

/** The document files behind a set of cells — what a grid row's Source column names. */
export function useEsgCellFiles(cellRefs: readonly string[]): string[] {
  const { placements } = useContext(CellSourcesContext);
  const files = new Set<string>();
  for (const ref of cellRefs) {
    const file = placements.get(ref)?.sourceFile;
    if (file) files.add(file);
  }
  return Array.from(files);
}

function placedDay(iso: string): string {
  return formatEsgDate(iso) ?? iso;
}

function valueText(value: unknown): string {
  return formatEsgScalar(value) ?? (value == null || value === "" ? "empty" : String(value));
}

/** What the mark says, in one sentence — the tooltip, and the panel's lead line. */
export function describeCellSource(
  info: { placement?: EsgPlacementRecord; conflict?: EsgConflictRecord },
  current: unknown,
): string {
  if (info.conflict && (current == null || current === "")) {
    return `Your documents disagree: ${info.conflict.candidates
      .map((c) => `${valueText(c.value)} (${c.sources.join(", ") || "unknown source"})`)
      .join(" vs ")}. Left blank — enter the right one.`;
  }
  if (info.placement) {
    const edited = !stillAsPlaced(info.placement, current);
    return `From ${info.placement.sourceFile || "a document"}, placed ${placedDay(info.placement.placedAt)}${
      edited ? `. Edited since — the document said ${valueText(info.placement.placedValue)}` : ""
    }.`;
  }
  if (info.conflict) {
    return `Your documents disagreed (${info.conflict.candidates.map((c) => valueText(c.value)).join(" vs ")}); the value here was entered by hand.`;
  }
  return "";
}

/**
 * The mark for one cell. Renders nothing when no document filled the cell and
 * none disputes it — a typed value needs no badge.
 */
export function EsgCellMark({
  cellRef,
  value,
  testId,
  className = "",
}: {
  cellRef: string;
  /** What the cell holds now — the draft, so "edited since" is live while typing. */
  value: unknown;
  testId?: string;
  className?: string;
}) {
  const { placements, conflicts } = useContext(CellSourcesContext);
  const placement = placements.get(cellRef);
  const conflict = conflicts.get(cellRef);
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

  if (!placement && !conflict) return null;
  const blank = value == null || value === "";
  // A dispute matters while the cell is blank; once someone enters a value
  // the document trail (if any) is what the mark shows.
  const disputed = Boolean(conflict) && (blank || !placement);
  const edited = !disputed && placement ? !stillAsPlaced(placement, value) : false;
  const sentence = describeCellSource({ placement, conflict }, value);
  const id = testId ?? `esg-cell-mark-${cellRef}`;
  const left = anchor ? Math.max(8, Math.min(anchor.right - 288, (typeof window !== "undefined" ? window.innerWidth : 1024) - 296)) : 0;

  return (
    <>
      <button
        type="button"
        aria-label={disputed ? "Documents disagree on this figure" : edited ? "From a document, edited since" : "From a document"}
        title={sentence}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect());
        }}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${className}`}
        data-testid={id}
        data-state={disputed ? "conflict" : edited ? "edited" : "placed"}
      >
        {disputed ? (
          <AlertTriangle className="h-3 w-3 text-amber-300" aria-hidden />
        ) : (
          <span
            className={`block h-1.5 w-1.5 rounded-full ${
              edited ? "border border-[color:var(--body)] bg-transparent" : "bg-[var(--esg-acc-e,#1de9a0)]/80"
            }`}
            aria-hidden
          />
        )}
      </button>
      {anchor && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={disputed ? "Documents disagree" : "Where this figure came from"}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-[70] w-72 whitespace-normal rounded-xl border border-white/[0.10] bg-[color:var(--ink-3)] p-3 text-left text-[12px] font-normal normal-case tracking-normal shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={{ top: anchor.bottom + 6, left }}
          data-testid={`${id}-panel`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-white">{disputed ? "Your documents disagree" : "From a document"}</p>
            <button type="button" onClick={() => setAnchor(null)} aria-label="Close" className="rounded p-0.5 text-[color:var(--body)] hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {disputed && conflict ? (
            <>
              <ul className="mt-1.5 space-y-1">
                {conflict.candidates.map((c, i) => (
                  <li key={i} className="leading-snug">
                    <span className="tabular-nums text-white">{valueText(c.value)}</span>{" "}
                    <span className="text-[11.5px] text-[color:var(--body)]">{c.sources.join(", ") || "unknown source"}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] leading-snug text-[color:var(--body)]">
                Left blank rather than guessed. Enter the right figure in the cell.
              </p>
            </>
          ) : placement ? (
            <>
              <p className="mt-1.5 flex items-start gap-1.5 leading-snug text-[color:var(--hi)]">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--body)]" aria-hidden />
                <span className="break-words">{placement.sourceFile || "A library document"}</span>
              </p>
              <p className="mt-1 text-[11.5px] text-[color:var(--body)]">Placed {placedDay(placement.placedAt)}</p>
              {edited && (
                <p className="mt-1 text-[11.5px] text-amber-200/90" data-testid={`${id}-edited`}>
                  Edited since — the document said {valueText(placement.placedValue)}.
                </p>
              )}
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
