/**
 * The Calculation Review's "All notes": every reviewer's notes on every
 * scorecard in one place, newest first, grouped by scorecard — each saying who
 * wrote it, when, and which line or ruling it is about, with a way straight to
 * that line on its scorecard.
 *
 * The page keeps the notes under the line they are about, one scorecard at a
 * time; this is the view across all of them. What each note is about is
 * worked out in lib/calcReview/allNotes.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@toolkit/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flag,
  HelpCircle,
  Loader2,
  MessagesSquare,
  StickyNote,
} from "lucide-react";
import {
  groupNotes,
  lineNamesOf,
  scorecardsWithLineNotes,
  type LineName,
  type ResolvedNote,
  type ReviewNoteSummary,
  type ReviewTarget,
} from "@/lib/calcReview/allNotes";
import { loadWorkedScorecard } from "@/lib/calcReview/registry";
import type { SectorConfigView } from "@/lib/calcReview/ledger";
import type { WorkedScorecard } from "@/lib/calcReview/workedScorecard";
import { lineDomId } from "@/components/calc-review/WorkedScorecardView";

export type { ReviewTarget } from "@/lib/calcReview/allNotes";

/** Its own key: the page's per-scorecard note lists are ["calcReviewNotes", sector, type]. */
export const ALL_NOTES_KEY = ["calcReviewNotesAll"] as const;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// ---------------------------------------------------------------------------
// Going to a line
// ---------------------------------------------------------------------------

const HIGHLIGHT = ["ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "scroll-mt-24"];

/** The button that opens and closes a line, ruling or element card. */
function toggleOf(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>(":scope > button[aria-expanded], :scope > div > button[aria-expanded]");
}

function openCard(el: HTMLElement) {
  const t = toggleOf(el);
  if (t && t.getAttribute("aria-expanded") === "false") t.click();
}

function show(el: HTMLElement, expand: boolean) {
  if (expand) openCard(el);
  // Only what the card does not carry already comes off again.
  const added = HIGHLIGHT.filter((c) => !el.classList.contains(c));
  el.classList.add(...added);
  window.setTimeout(() => el.classList.remove(...added), 2500);
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // After the card has opened, so the scroll lands on it at its open height.
  const nextFrame = (cb: () => void) =>
    typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame(cb) : window.setTimeout(cb, 0);
  nextFrame(() => {
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    (toggleOf(el) ?? el.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
  });
}

/**
 * Scroll to the line or ruling with this note anchor and mark it, once the
 * scorecard it is on has rendered (a worked scorecard is scored when it is
 * opened, so the line may not exist yet). Where the line sits inside a closed
 * element, the element is opened first. Returns a cancel function.
 */
export function revealOnPage(anchor: string, containerAnchor?: string, timeoutMs = 10_000): () => void {
  let cancelled = false;
  let openedContainer = false;
  let timer: number | undefined;
  const started = Date.now();
  const find = (a: string) => document.getElementById(lineDomId(a));
  const tick = () => {
    if (cancelled) return;
    const el = find(anchor);
    if (el) return show(el, true);
    const box = containerAnchor ? find(containerAnchor) : null;
    if (box && !openedContainer) {
      openedContainer = true;
      openCard(box);
    }
    if (Date.now() - started >= timeoutMs) {
      if (box) show(box, false);
      return;
    }
    timer = window.setTimeout(tick, 100);
  };
  timer = window.setTimeout(tick, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

// ---------------------------------------------------------------------------
// One note
// ---------------------------------------------------------------------------

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Verdict({ verdict }: { verdict: string }) {
  if (verdict === "confirmed") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
        Confirmed correct
      </Badge>
    );
  }
  if (verdict === "defect") {
    return (
      <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-400">
        <Flag className="mr-1 h-3 w-3" aria-hidden />
        Incorrect
      </Badge>
    );
  }
  if (verdict === "question") {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
        <HelpCircle className="mr-1 h-3 w-3" aria-hidden />
        Open question
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <StickyNote className="mr-1 h-3 w-3" aria-hidden />
      Observation
    </Badge>
  );
}

function whatItIsOn(r: ResolvedNote): string {
  if (r.subject === "ruling") return `Ruling: ${r.about}`;
  if (r.subject === "earlier") return `Earlier description: ${r.element ? `${r.element} · ` : ""}${r.about}`;
  return r.element ? `${r.element} · ${r.about}` : r.about;
}

function goLabel(r: ResolvedNote): string {
  if (!r.revealAnchor) return "Open scorecard";
  if (r.subject === "ruling") return "Go to ruling";
  if (r.subject === "line" || r.subject === "indicator") return "Go to line";
  return "Go to it";
}

function NoteItem({ r, onGo }: { r: ResolvedNote; onGo: (r: ResolvedNote) => void }) {
  const n = r.note;
  const on = whatItIsOn(r);
  const go = goLabel(r);
  return (
    <li className="rounded-md border border-border/70 bg-muted/40 p-3 text-sm" data-testid="all-notes-item">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Verdict verdict={n.verdict} />
        <span className="text-xs font-medium">{n.mine ? "You" : n.authorName || "Reviewer"}</span>
        <span className="text-xs text-muted-foreground">{formatWhen(n.updatedAt || n.createdAt)}</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          onClick={() => onGo(r)}
          aria-label={`${go}: ${on}`}
        >
          {go}
          <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        On: <span className="font-medium text-foreground">{on}</span>
      </p>
      {r.appliesTo && <p className="mt-0.5 text-xs text-muted-foreground">{r.appliesTo}</p>}
      <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{n.body}</p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function AllNotesPanel({
  sectors,
  onOpenScorecard,
}: {
  /** The live sector configurations, to name notes on scorecards not checked against a toolkit. */
  sectors: readonly SectorConfigView[];
  /** Open a scorecard on the page (the same as choosing it in the picker). */
  onOpenScorecard: (target: ReviewTarget) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const headingId = useId();
  const cancelReveal = useRef<(() => void) | null>(null);

  const notesQuery = useQuery<{ success: boolean; notes: ReviewNoteSummary[] }>({
    queryKey: ALL_NOTES_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/calculation-review/notes");
      return res.json();
    },
  });

  // A note saved or withdrawn on the page refreshes that scorecard's list; this
  // list follows it, so the count and the view never lag behind the page.
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "invalidate") return;
        if (event.query.queryKey[0] === "calcReviewNotes") {
          void queryClient.invalidateQueries({ queryKey: ALL_NOTES_KEY });
        }
      }),
    [queryClient],
  );

  useEffect(() => () => cancelReveal.current?.(), []);

  const notes = useMemo(() => notesQuery.data?.notes ?? [], [notesQuery.data]);

  // A line is known only by its toolkit row until its scorecard is worked, so
  // the scorecards whose lines carry notes are worked (once, shared with the page).
  const lineScorecards = useMemo(() => scorecardsWithLineNotes(notes), [notes]);
  const workedQueries = useQueries({
    queries: lineScorecards.map((id) => ({
      queryKey: ["calcReviewWorked", id],
      enabled: open,
      staleTime: Infinity,
      queryFn: () => loadWorkedScorecard(id),
    })),
  });
  const naming = open && workedQueries.some((q) => q.isLoading);
  // useQueries hands back a new array every render; this changes only when a result does.
  const workedVersion = workedQueries.map((q) => q.dataUpdatedAt).join("|");

  const lineNames = useMemo(() => {
    const byScorecard = new Map<string, Map<string, LineName>>();
    lineScorecards.forEach((id, i) => {
      const w = workedQueries[i]?.data as WorkedScorecard | undefined;
      if (w) byScorecard.set(id, lineNamesOf(w));
    });
    return byScorecard;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineScorecards, workedVersion]);

  const groups = useMemo(
    () => groupNotes(notes, { lineNames: (id) => lineNames.get(id), sectors }),
    [notes, lineNames, sectors],
  );

  const go = (r: ResolvedNote) => {
    cancelReveal.current?.();
    onOpenScorecard(r.target);
    cancelReveal.current = r.revealAnchor ? revealOnPage(r.revealAnchor, r.containerAnchor) : null;
  };

  const count = notes.length;

  return (
    <Card className="mb-6" data-testid="all-notes">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className={`flex w-full items-start gap-3 rounded-md text-left ${FOCUS_RING}`}
          data-testid="all-notes-toggle"
        >
          {open ? (
            <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <CardTitle id={headingId} className="flex flex-wrap items-center gap-2 text-lg">
              <MessagesSquare className="h-5 w-5 text-primary" aria-hidden />
              All notes
              {notesQuery.isSuccess && (
                <Badge variant="secondary" data-testid="all-notes-count">
                  {count} {count === 1 ? "note" : "notes"}
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Every reviewer's notes on every scorecard in one place, newest first.
            </p>
          </div>
        </button>
      </CardHeader>

      {open && (
        <CardContent id={bodyId} className="space-y-5" aria-labelledby={headingId}>
          {notesQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading the notes…
            </div>
          )}

          {notesQuery.isError && (
            <p className="text-sm text-muted-foreground">
              The notes could not be loaded. Please reload; if it persists, tell the Okiru team.
            </p>
          )}

          {notesQuery.isSuccess && count === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="all-notes-empty">
              No notes yet. Notes left on any line or ruling appear here.
            </p>
          )}

          {naming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Looking up the lines these notes are on…
            </div>
          )}

          {groups.map((g) => (
            <section key={g.key} aria-label={g.title} data-testid="all-notes-group">
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {g.title}
                <Badge variant="outline" className="text-[10px]">
                  {g.notes.length} {g.notes.length === 1 ? "note" : "notes"}
                </Badge>
              </h3>
              <ul className="mt-2 space-y-2">
                {g.notes.map((r) => (
                  <NoteItem key={r.note.id} r={r} onGo={go} />
                ))}
              </ul>
            </section>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
