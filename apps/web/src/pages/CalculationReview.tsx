/**
 * Calculation Review
 *
 * A sector expert's view of what Okiru's B-BBEE engine actually computes:
 * one scorecard at a time (sector code × scorecard type), element by element,
 * indicator by indicator — with a note box under each indicator.
 *
 * Everything numeric on this page comes from the live sector configuration the
 * scoring engine reads, so the page cannot show a reviewer a target the
 * calculator is not using. The prose explaining each indicator comes from the
 * calculation ledger.
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
  SelectItem,
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
      <CardHeader className="cursor-pointer select-none pb-3" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start gap-3">
          {open ? (
            <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
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
        </div>
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
// The page
// ---------------------------------------------------------------------------

export default function CalculationReview() {
  const [sectorCode, setSectorCode] = useState<string>("RCOGP");
  const [scorecardType, setScorecardType] = useState<string>("QSE");

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

  const sectors = useMemo(() => sectorsQuery.data?.sectors ?? [], [sectorsQuery.data]);
  const notes = useMemo(() => notesQuery.data?.notes ?? [], [notesQuery.data]);

  /** Sector codes, each with the scorecard types the engine actually ships. */
  const codes = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string; types: string[] }>();
    for (const s of sectors) {
      const base = (s.name ?? s.code).replace(/\s*\([^)]*\)\s*$/, "");
      const found = byCode.get(s.code);
      if (found) {
        if (!found.types.includes(s.type)) found.types.push(s.type);
      } else {
        byCode.set(s.code, { code: s.code, name: base, types: [s.type] });
      }
    }
    return Array.from(byCode.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sectors]);

  const availableTypes = useMemo(
    () => codes.find((c) => c.code === sectorCode)?.types ?? [],
    [codes, sectorCode],
  );

  const config = useMemo(
    () => sectors.find((s) => s.code === sectorCode && s.type === scorecardType) ?? null,
    [sectors, sectorCode, scorecardType],
  );

  const ledger = useMemo(() => (config ? buildLedger(config) : []), [config]);
  const rules = useMemo(() => (config ? levelRules(config) : null), [config]);

  const totalFlags = ledger.reduce(
    (s, p) => s + p.flags.length + p.rows.filter((r) => r.flag).length,
    0,
  );
  const pillarSum = ledger.reduce((s, p) => s + (p.weighting || 0), 0);

  function onPickCode(code: string) {
    setSectorCode(code);
    const types = codes.find((c) => c.code === code)?.types ?? [];
    if (types.length && !types.includes(scorecardType)) setScorecardType(types[0]);
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <AppNavBack href="/hub" eyebrow="Suite" label="Hub" size="compact" />
          {accessQuery.isLoading ? (
            <div className="flex items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
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
            <Scale className="h-7 w-7 text-primary" />
            Calculation Review
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Every indicator this system scores, one scorecard at a time, written as a verification
            professional reads it: what is counted, what it is measured against, and how the
            weighting points are awarded. The weightings, compliance targets and level table below
            are read live from the configuration the scoring engine itself uses — not retyped — so
            nothing here can drift from what a client's scorecard actually does.
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Rows marked{" "}
            <span className="font-medium text-amber-600 dark:text-amber-400">Check this</span> are
            places where the engine makes a decision — a fixed measure, a fallback, a cap or a guard
            — that should be confirmed against the gazette. Those are the most likely reasons a
            score does not match the data a client entered. Please record what you find in the note
            box under each indicator.
          </p>
          <div className="mt-4 max-w-3xl rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm leading-relaxed">
            <span className="font-medium text-amber-700 dark:text-amber-400">Which calculator this is. </span>
            Okiru currently scores in two places. This page describes the <em>server</em> scoring
            engine, which runs when a scorecard is calculated from uploaded documents. The scores a
            client sees while filling in the toolkit workbook are worked out by a separate copy of
            the calculators in the browser, and the two do not agree on every indicator. Known
            differences so far: the browser applies the procurement recognition percentage to
            supplier spend and the server does not; the browser measures designated-group ownership
            against the sector's configured target (3% by default) and the server against a fixed 10%; and the browser measures black new entrants
            against their target while the server awards the full points on the presence of one
            new entrant. The same client data can therefore score differently depending on which
            route it took.
          </div>
        </header>

        {/* Scorecard picker */}
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-end gap-4 pt-6">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sector code
              </label>
              <Select value={sectorCode} onValueChange={onPickCode}>
                <SelectTrigger className="w-[300px]" data-testid="select-sector-code">
                  <SelectValue placeholder="Choose a sector code" />
                </SelectTrigger>
                <SelectContent>
                  {codes.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Scorecard type
              </label>
              <Select value={scorecardType} onValueChange={setScorecardType}>
                <SelectTrigger className="w-[200px]" data-testid="select-scorecard-type">
                  <SelectValue placeholder="Choose a scorecard" />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {config && (
              <div className="ml-auto text-right text-sm">
                <div className="font-medium">{config.name}</div>
                <div className="text-muted-foreground">
                  {config.totalPoints} points available · {ledger.length} element
                  {ledger.length === 1 ? "" : "s"} · {totalFlags} item
                  {totalFlags === 1 ? "" : "s"} to confirm
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {sectorsQuery.isLoading && (
          <div className="flex items-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
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

        {!sectorsQuery.isLoading && !sectorsQuery.isError && !config && (
          <Card className="mb-6">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              This system does not ship a {scorecardType} scorecard for {sectorCode}. Choose another
              combination above.
            </CardContent>
          </Card>
        )}

        {config && rules && (
          <>
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

            {/* The elements */}
            <div className="space-y-4">
              {ledger.map((p, i) => (
                <PillarSection
                  key={p.key}
                  pillar={p}
                  sectorCode={sectorCode}
                  scorecardType={scorecardType}
                  notes={notes}
                  defaultOpen={i === 0}
                />
              ))}
            </div>

            <p className="py-8 text-center text-xs text-muted-foreground">
              Notes are saved against the sector code, the scorecard type and the individual
              indicator, and are visible to everyone reviewing this scorecard.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
