/**
 * Calculation Review
 *
 * A sector expert's view of what Okiru's B-BBEE engine actually computes:
 * one scorecard at a time, element by element, indicator by indicator — with
 * a note box under each indicator.
 *
 * The scorecards checked line by line against their Empower toolkit (the
 * registry in lib/calcReview/registry) show a worked scorecard: a sample
 * company scored by the live calculator beside the toolkit's answer, then the
 * rulings the expert is asked for. Every other scorecard the engine ships says
 * plainly that it is not checked yet, and shows the written description of
 * each indicator, read from the live sector configuration the scoring engine
 * uses (so it cannot show a target the calculator is not using).
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@toolkit/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { Textarea } from "@toolkit/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@toolkit/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@toolkit/components/ui/table";
import { Separator } from "@toolkit/components/ui/separator";
import { useToast } from "@toolkit/hooks/use-toast";
import { AppNavBack } from "@/components/AppNavBack";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Scale,
  Trash2,
  CheckCircle2,
  HelpCircle,
  Flag,
  StickyNote,
} from "lucide-react";
import {
  buildLedger,
  levelRules,
  type LedgerRow,
  type PillarLedger,
  type SectorConfigView,
} from "@/lib/calcReview/ledger";
import {
  DEFAULT_REVIEW_SCORECARD,
  anchorIsRegistered,
  hasWorkedScorecard,
  loadWorkedScorecard,
  reviewScorecard,
  reviewScorecardGroups,
  reviewScorecardsFor,
} from "@/lib/calcReview/registry";
import type { WorkedScorecard } from "@/lib/calcReview/workedScorecard";
import { WorkedScorecardView } from "@/components/calc-review/WorkedScorecardView";

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

type Verdict = "note" | "question" | "confirmed" | "defect";

interface ReviewNote {
  id: string;
  sectorCode: string;
  scorecardType: string;
  pillarKey: string;
  anchor: string;
  body: string;
  verdict: Verdict;
  authorUserId: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  mine?: boolean;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  note: "Observation",
  question: "Open question",
  confirmed: "Confirmed correct",
  defect: "Incorrect — needs fixing",
};

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  if (verdict === "confirmed") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Confirmed correct
      </Badge>
    );
  }
  if (verdict === "defect") {
    return (
      <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-400">
        <Flag className="mr-1 h-3 w-3" />
        Incorrect
      </Badge>
    );
  }
  if (verdict === "question") {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
        <HelpCircle className="mr-1 h-3 w-3" />
        Open question
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <StickyNote className="mr-1 h-3 w-3" />
      Observation
    </Badge>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Note thread under one indicator (or one element)
// ---------------------------------------------------------------------------

function NoteThread({
  anchor,
  pillarKey,
  sectorCode,
  scorecardType,
  notes,
  compact,
}: {
  anchor: string;
  pillarKey: string;
  sectorCode: string;
  scorecardType: string;
  notes: ReviewNote[];
  compact?: boolean;
}) {
  const { toast } = useToast();
  const mine = notes.find((n) => n.mine);
  const others = notes.filter((n) => !n.mine);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(mine?.body ?? "");
  const [verdict, setVerdict] = useState<Verdict>(mine?.verdict ?? "note");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["calcReviewNotes", sectorCode, scorecardType] });

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/calculation-review/notes", {
        sectorCode,
        scorecardType,
        pillarKey,
        anchor,
        body: draft,
        verdict,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast({ title: "Note saved" });
    },
    onError: (e: unknown) =>
      toast({
        title: "The note was not saved",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/calculation-review/notes/${id}`);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setDraft("");
      setVerdict("note");
      toast({ title: "Note withdrawn" });
    },
    onError: (e: unknown) =>
      toast({
        title: "The note was not withdrawn",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      {/* Everyone's notes on this row */}
      {(mine || others.length > 0) && (
        <div className="space-y-2">
          {[...(mine ? [mine] : []), ...others].map((n) => (
            <div
              key={n.id}
              className="rounded-md border border-border/70 bg-muted/40 p-3 text-sm"
              data-testid={`review-note-${n.id}`}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={n.verdict} />
                <span className="text-xs font-medium">{n.authorName ?? "Reviewer"}</span>
                <span className="text-xs text-muted-foreground">{formatWhen(n.updatedAt)}</span>
                {n.mine && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2 text-xs"
                    onClick={() => remove.mutate(n.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Withdraw
                  </Button>
                )}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add or amend my own note */}
      {!open ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => {
            setDraft(mine?.body ?? "");
            setVerdict(mine?.verdict ?? "note");
            setOpen(true);
          }}
          data-testid={`add-note-${anchor}`}
        >
          <MessageSquare className="mr-2 h-3.5 w-3.5" />
          {mine ? "Amend my note" : "Add a note"}
        </Button>
      ) : (
        <div className="mt-2 space-y-2 rounded-md border border-border p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="What this indicator gets wrong, or confirmation that it is right. Cite the gazette or a client workbook where you can."
            className="text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={verdict} onValueChange={(v) => setVerdict(v as Verdict)}>
              <SelectTrigger className="h-9 w-[230px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(VERDICT_LABEL) as Verdict[]).map((v) => (
                  <SelectItem key={v} value={v}>
                    {VERDICT_LABEL[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || draft.trim().length === 0}
            >
              {save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save note
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One indicator
// ---------------------------------------------------------------------------

function IndicatorCard({
  row,
  pillarKey,
  sectorCode,
  scorecardType,
  notes,
}: {
  row: LedgerRow;
  pillarKey: string;
  sectorCode: string;
  scorecardType: string;
  notes: ReviewNote[];
}) {
  const anchor = `indicator:${row.code}`;
  const rowNotes = notes.filter((n) => n.anchor === anchor);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card" data-testid={`indicator-${row.code}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40"
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.name}</span>
            {row.bonus && (
              <Badge variant="secondary" className="text-[10px]">
                Bonus
              </Badge>
            )}
            {row.flag && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Check this
              </Badge>
            )}
            {rowNotes.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {rowNotes.length} {rowNotes.length === 1 ? "note" : "notes"}
              </Badge>
            )}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Target <span className="font-medium text-foreground">{row.target}</span>
            {" · "}
            Weighting{" "}
            <span className="font-medium text-foreground">
              {row.weighting > 0
                ? `${row.weighting} point${row.weighting === 1 ? "" : "s"}`
                : "no points — level effect only"}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium">What the system counts</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{row.counts}</dd>
            </div>
            <div>
              <dt className="font-medium">Measured against</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{row.against}</dd>
            </div>
            <div>
              <dt className="font-medium">How the points are awarded</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{row.award}</dd>
            </div>
          </dl>

          {row.flag && (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Worth confirming
              </div>
              <p className="leading-relaxed">{row.flag}</p>
            </div>
          )}

          <Separator className="my-4" />
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reviewer notes on this indicator
          </div>
          <NoteThread
            anchor={anchor}
            pillarKey={pillarKey}
            sectorCode={sectorCode}
            scorecardType={scorecardType}
            notes={rowNotes}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One element
// ---------------------------------------------------------------------------

function PillarSection({
  pillar,
  sectorCode,
  scorecardType,
  notes,
  defaultOpen,
}: {
  pillar: PillarLedger;
  sectorCode: string;
  scorecardType: string;
  notes: ReviewNote[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const pillarNotes = notes.filter((n) => n.pillarKey === pillar.key);
  const elementNotes = pillarNotes.filter((n) => n.anchor === `pillar:${pillar.key}`);
  const flagCount = pillar.flags.length + pillar.rows.filter((r) => r.flag).length;

  const rowsTotal = pillar.rows.reduce((s, r) => s + (r.weighting || 0), 0);
  const addsUp = Math.abs(rowsTotal - pillar.weighting) < 0.01;

  return (
    <Card data-testid={`pillar-${pillar.key}`}>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full select-none items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {open ? (
            <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              {pillar.name}
              <Badge variant="secondary">
                {pillar.weighting} point{pillar.weighting === 1 ? "" : "s"}
              </Badge>
              {pillar.subMinimum && <Badge variant="outline">Sub-minimum applies</Badge>}
              {flagCount > 0 && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {flagCount} to confirm
                </Badge>
              )}
              {pillarNotes.length > 0 && (
                <Badge variant="outline">
                  <MessageSquare className="mr-1 h-3 w-3" />
                  {pillarNotes.length}
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{pillar.measures}</p>
          </div>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {pillar.subMinimum && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <span className="font-medium">Sub-minimum: </span>
              {pillar.subMinimum}
            </div>
          )}

          {pillar.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No indicator breakdown is published for this element on this scorecard.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {pillar.rows.length} indicator{pillar.rows.length === 1 ? "" : "s"}, totalling{" "}
                  {Number(rowsTotal.toFixed(2))} points
                </span>
                {!addsUp && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Indicators total {Number(rowsTotal.toFixed(2))} against an element weighting of{" "}
                    {pillar.weighting}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                {pillar.rows.map((row) => (
                  <IndicatorCard
                    key={row.code}
                    row={row}
                    pillarKey={pillar.key}
                    sectorCode={sectorCode}
                    scorecardType={scorecardType}
                    notes={pillarNotes}
                  />
                ))}
              </div>
            </>
          )}

          {pillar.reading.length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <h4 className="mb-2 text-sm font-semibold">How the system reads the submitted data</h4>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                {pillar.reading.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {pillar.flags.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Worth confirming on this element
              </h4>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                {pillar.flags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-border p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reviewer notes on {pillar.name} as a whole
            </h4>
            <NoteThread
              anchor={`pillar:${pillar.key}`}
              pillarKey={pillar.key}
              sectorCode={sectorCode}
              scorecardType={scorecardType}
              notes={elementNotes}
              compact
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The scorecard picker
// ---------------------------------------------------------------------------

/** What the page shows: a toolkit-checked worked scorecard, or the written description of one not checked yet. */
type Selection =
  | { kind: "worked"; id: string }
  | { kind: "described"; sectorCode: string; scorecardType: string };

const PICK_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const CODE = /^[A-Za-z0-9 _-]{1,40}$/;

/**
 * The scorecard named in the address (?scorecard=<id>, or ?sector=<code>&type=<type>),
 * so a link can open the review on one scorecard and a reload keeps it; RCOGP Generic otherwise.
 */
function selectionFromUrl(): Selection {
  try {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("scorecard");
    if (id && reviewScorecard(id)) return { kind: "worked", id };
    const sector = q.get("sector");
    const type = q.get("type");
    if (sector && type && CODE.test(sector) && CODE.test(type)) {
      const checked = reviewScorecardsFor(sector.toUpperCase(), type)[0];
      if (checked) return { kind: "worked", id: checked.id };
      return { kind: "described", sectorCode: sector.toUpperCase(), scorecardType: type };
    }
  } catch {
    // No address to read (rendered outside a browser): the default.
  }
  return { kind: "worked", id: DEFAULT_REVIEW_SCORECARD };
}

function writeSelectionToUrl(s: Selection) {
  try {
    const q = new URLSearchParams(window.location.search);
    q.delete("scorecard");
    q.delete("sector");
    q.delete("type");
    if (s.kind === "worked") q.set("scorecard", s.id);
    else {
      q.set("sector", s.sectorCode);
      q.set("type", s.scorecardType);
    }
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q.toString()}`);
  } catch {
    // The choice still applies on the page; only the address is not updated.
  }
}

function ScorecardPicker({
  selection,
  onPick,
  unchecked,
}: {
  selection: Selection;
  onPick: (s: Selection) => void;
  unchecked: Array<{ sectorCode: string; scorecardType: string; label: string }>;
}) {
  const groups = useMemo(() => reviewScorecardGroups(), []);
  const describedValue =
    selection.kind === "described" ? `${selection.sectorCode}|${selection.scorecardType}` : "";
  return (
    <Card className="mb-6">
      <CardContent className="space-y-5 pt-6">
        <div>
          <h2 id="calc-review-picker" className="text-sm font-semibold">
            Scorecards checked against an Empower toolkit
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Each is scored by Okiru's live calculator and by its Empower toolkit for the same invented
            company, line by line.
          </p>
        </div>
        <div role="group" aria-labelledby="calc-review-picker" className="space-y-3">
          {groups.map((g) => (
            <div key={g.sector} className="grid gap-2 sm:grid-cols-[12rem_1fr] sm:items-center">
              <div className="text-sm">
                <span className="font-medium">{g.sector}</span>
                <span className="block text-xs text-muted-foreground">{g.sectorName}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.scorecards.map((s) => {
                  const active = selection.kind === "worked" && selection.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${s.title}: checked against its Empower toolkit`}
                      onClick={() => onPick({ kind: "worked", id: s.id })}
                      data-testid={`pick-scorecard-${s.id}`}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${PICK_RING} ${
                        active
                          ? "border-primary bg-primary/10 font-medium text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <CheckCircle2
                        className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-emerald-600 dark:text-emerald-400"}`}
                        aria-hidden
                      />
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {unchecked.length > 0 && (
          <>
            <Separator />
            <div className="grid gap-2 sm:grid-cols-[12rem_1fr] sm:items-center">
              <label htmlFor="calc-review-unchecked" className="text-sm">
                <span className="font-medium">Other scorecards</span>
                <span className="block text-xs text-muted-foreground">Not checked against a toolkit yet</span>
              </label>
              <Select
                value={describedValue}
                onValueChange={(v) => {
                  const [sectorCode, scorecardType] = v.split("|");
                  if (sectorCode && scorecardType) onPick({ kind: "described", sectorCode, scorecardType });
                }}
              >
                <SelectTrigger
                  id="calc-review-unchecked"
                  className="w-full sm:w-[360px]"
                  data-testid="select-unchecked-scorecard"
                >
                  <SelectValue placeholder="Choose a scorecard not checked yet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Not checked against a toolkit yet</SelectLabel>
                    {unchecked.map((u) => (
                      <SelectItem key={`${u.sectorCode}|${u.scorecardType}`} value={`${u.sectorCode}|${u.scorecardType}`}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Notes written before a scorecard was checked against its toolkit
// ---------------------------------------------------------------------------

function EarlierNotes({ notes, describe }: { notes: ReviewNote[]; describe: (anchor: string) => string }) {
  if (notes.length === 0) return null;
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg">Earlier notes on this scorecard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Written against the earlier description of each indicator, before this scorecard was checked
          against the toolkit. Kept here so none is lost.
        </p>
        {notes.map((n) => (
          <div key={n.id} className="rounded-md border border-border p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <VerdictBadge verdict={n.verdict} />
              <span>{n.authorName ?? "Reviewer"}</span>
              <span>{formatWhen(n.updatedAt)}</span>
              <span>On: {describe(n.anchor)}</span>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export default function CalculationReview() {
  const [selection, setSelection] = useState<Selection>(selectionFromUrl);
  const pick = (s: Selection) => {
    setSelection(s);
    writeSelectionToUrl(s);
  };

  const entry = selection.kind === "worked" ? reviewScorecard(selection.id) ?? null : null;
  const sectorCode = entry ? entry.sectorCode : selection.kind === "described" ? selection.sectorCode : "RCOGP";
  const scorecardType = entry
    ? entry.scorecardType
    : selection.kind === "described"
      ? selection.scorecardType
      : "Generic";

  // Named reviewers only — the api holds the allow-list and enforces it on the
  // notes routes too; this only decides whether there is anything to render.
  const accessQuery = useQuery<{ success: boolean; allowed: boolean }>({
    queryKey: ["calcReviewAccess"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/calculation-review/access");
      return res.json();
    },
  });
  const allowed = accessQuery.data?.allowed === true;

  const sectorsQuery = useQuery<{ success: boolean; sectors: SectorConfigView[] }>({
    queryKey: ["calcReviewSectors"],
    enabled: allowed,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sectors");
      return res.json();
    },
  });

  const notesQuery = useQuery<{ success: boolean; notes: ReviewNote[] }>({
    queryKey: ["calcReviewNotes", sectorCode, scorecardType],
    enabled: allowed,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/calculation-review/notes?sectorCode=${encodeURIComponent(
          sectorCode,
        )}&scorecardType=${encodeURIComponent(scorecardType)}`,
      );
      return res.json();
    },
  });

  // The worked scorecard: the reference bundle is fetched when the scorecard is
  // opened, and the live calculator scores its sample company here.
  const workedQuery = useQuery<WorkedScorecard>({
    queryKey: ["calcReviewWorked", entry?.id ?? ""],
    enabled: allowed && entry !== null,
    staleTime: Infinity,
    queryFn: () => loadWorkedScorecard(entry!.id),
  });

  const sectors = useMemo(() => sectorsQuery.data?.sectors ?? [], [sectorsQuery.data]);
  const notes = useMemo(() => notesQuery.data?.notes ?? [], [notesQuery.data]);

  const noteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) counts.set(n.anchor, (counts.get(n.anchor) ?? 0) + 1);
    return counts;
  }, [notes]);

  /** Scorecards the engine ships that no Empower toolkit has been checked against yet. */
  const unchecked = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ sectorCode: string; scorecardType: string; label: string }> = [];
    for (const s of sectors) {
      const key = `${s.code}|${s.type}`;
      if (seen.has(key) || hasWorkedScorecard(s.code, s.type)) continue;
      seen.add(key);
      const base = (s.name ?? s.code).replace(/\s*\([^)]*\)\s*$/, "");
      out.push({ sectorCode: s.code, scorecardType: s.type, label: `${base} (${s.code}) · ${s.type}` });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [sectors]);

  // The description view reads the sector configuration the engine scores from.
  const config = useMemo(
    () => sectors.find((s) => s.code === sectorCode && s.type === scorecardType) ?? null,
    [sectors, sectorCode, scorecardType],
  );
  const ledger = useMemo(() => (config ? buildLedger(config) : []), [config]);
  const rules = useMemo(() => (config ? levelRules(config) : null), [config]);

  // Notes written against the earlier description of a now-checked scorecard.
  // Shown once, on the first scorecard filed under its code and type.
  const earlierNotes = useMemo(() => {
    if (!entry || reviewScorecardsFor(sectorCode, scorecardType)[0]?.id !== entry.id) return [];
    return notes.filter((n) => !anchorIsRegistered(n.anchor, sectorCode, scorecardType));
  }, [entry, notes, sectorCode, scorecardType]);

  const describeAnchor = useMemo(() => {
    const names = new Map<string, string>([["pillar:scorecard", "the scorecard as a whole"]]);
    for (const p of ledger) {
      names.set(`pillar:${p.key}`, `${p.name} as a whole`);
      for (const r of p.rows) names.set(`indicator:${r.code}`, `${p.name}: ${r.name}`);
    }
    return (anchor: string) => names.get(anchor) ?? "an indicator in the earlier description";
  }, [ledger]);

  const totalFlags = ledger.reduce(
    (s, p) => s + p.flags.length + p.rows.filter((r) => r.flag).length,
    0,
  );
  const pillarSum = ledger.reduce((s, p) => s + (p.weighting || 0), 0);

  const renderNotes = (anchor: string, pillarKey: string) => (
    <NoteThread
      key={`${sectorCode}|${scorecardType}|${anchor}`}
      anchor={anchor}
      pillarKey={pillarKey}
      sectorCode={sectorCode}
      scorecardType={scorecardType}
      notes={notes.filter((n) => n.anchor === anchor)}
      compact
    />
  );

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <AppNavBack href="/hub" eyebrow="Suite" label="Hub" size="compact" />
          {accessQuery.isLoading ? (
            <div className="flex items-center gap-2 py-12 text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </div>
          ) : (
            <p className="py-12 text-sm text-muted-foreground">
              This page is not available on your account.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <AppNavBack href="/hub" eyebrow="Suite" label="Hub" size="compact" />

        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold sm:text-3xl">
            <Scale className="h-7 w-7 text-primary" aria-hidden />
            Calculation Review
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            What Okiru's B-BBEE calculator computes, one scorecard at a time. Every Okiru scorecard
            is worked out by one calculator; this page runs that same calculator.
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Scorecards checked against their Empower toolkit show, for every line, Okiru's own
            arithmetic beside the toolkit's answer for the same company, with the toolkit's cells
            and formulas. Please record what you find in the note box under each line, and give your
            ruling on each item listed under "Rulings needed".
          </p>
        </header>

        <ScorecardPicker selection={selection} onPick={pick} unchecked={unchecked} />

        {entry ? (
          <>
            {workedQuery.isLoading && (
              <div className="flex items-center gap-2 py-12 text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Scoring the sample company for {entry.title}…
              </div>
            )}

            {workedQuery.isError && (
              <Card className="mb-6 border-red-500/40">
                <CardContent className="pt-6 text-sm">
                  The worked scorecard for {entry.title} could not be loaded. Please reload; if it
                  persists, tell the Okiru team.
                </CardContent>
              </Card>
            )}

            {workedQuery.data && (
              <WorkedScorecardView
                key={entry.id}
                entry={entry}
                worked={workedQuery.data}
                renderNotes={renderNotes}
                noteCounts={noteCounts}
              />
            )}

            <EarlierNotes notes={earlierNotes} describe={describeAnchor} />
          </>
        ) : (
          <>
            <Card className="mb-6" data-testid="not-checked">
              <CardContent className="space-y-1 pt-6 text-sm leading-relaxed">
                <p className="font-medium">Not checked against an Empower toolkit yet</p>
                <p className="text-muted-foreground">
                  {config ? `${config.name}` : `${sectorCode} ${scorecardType}`} has not been checked line by
                  line against a toolkit. The descriptions below say what the calculator does; they are not
                  a worked example.
                </p>
              </CardContent>
            </Card>

            {sectorsQuery.isLoading && (
              <div className="flex items-center gap-2 py-12 text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading the sector rules the engine uses…
              </div>
            )}

            {sectorsQuery.isError && (
              <Card className="mb-6 border-red-500/40">
                <CardContent className="pt-6 text-sm">
                  The sector rules could not be loaded, so this page cannot show what the engine
                  computes. Please reload; if it persists, the scoring service is unreachable.
                </CardContent>
              </Card>
            )}

            {config && rules && (
              <>
                <div className="mb-4 text-sm text-muted-foreground">
                  {config.totalPoints} points available · {ledger.length} element
                  {ledger.length === 1 ? "" : "s"} · {totalFlags} item{totalFlags === 1 ? "" : "s"} to confirm
                </div>

                {/* How a total becomes a level */}
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg">From points to a B-BBEE level</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Level</TableHead>
                            <TableHead>Points required</TableHead>
                            <TableHead>Procurement recognition</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rules.thresholds.map((t) => (
                            <TableRow key={t.level}>
                              <TableCell className="font-medium">Level {t.level}</TableCell>
                              <TableCell>{t.minPoints} and above</TableCell>
                              <TableCell>{t.recognition}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                      {rules.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                      {rules.electiveNote && <li>{rules.electiveNote}</li>}
                    </ul>

                    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                      <span className="font-medium">
                        Element weightings add up to {Number(pillarSum.toFixed(2))}
                      </span>
                      {Math.abs(pillarSum - config.totalPoints) < 0.01 ? (
                        <>, which matches the {config.totalPoints} points this scorecard declares.</>
                      ) : (
                        <>
                          {" "}
                          against the {config.totalPoints} points this scorecard declares — a difference
                          of {Number(Math.abs(pillarSum - config.totalPoints).toFixed(2))} points, worth
                          confirming.
                        </>
                      )}
                    </div>

                    <NoteThread
                      anchor="pillar:scorecard"
                      pillarKey="scorecard"
                      sectorCode={sectorCode}
                      scorecardType={scorecardType}
                      notes={notes.filter((n) => n.anchor === "pillar:scorecard")}
                      compact
                    />
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  {ledger.map((p, i) => (
                    <PillarSection
                      key={`${sectorCode}|${scorecardType}|${p.key}`}
                      pillar={p}
                      sectorCode={sectorCode}
                      scorecardType={scorecardType}
                      notes={notes}
                      defaultOpen={i === 0}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <p className="py-8 text-center text-xs text-muted-foreground">
          Notes are saved against the scorecard and the individual line or ruling, and are visible to
          everyone reviewing this scorecard.
        </p>
      </div>
    </div>
  );
}
