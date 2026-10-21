/**
 * The Calculation Review's worked scorecard: a sample company scored by the
 * live calculator, line by line, beside the Empower toolkit's answer for the
 * same company with the toolkit's own cells and formulas — then the rulings
 * the expert is asked to make. Notes render through `renderNotes`, so this
 * view shares the page's note threads.
 *
 * Order on the page: a short summary (what was checked, whether it all
 * matches, how many rulings are still unanswered), the scorecard element by
 * element, then the rulings.
 */
import { useId, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Gavel,
  Info,
  MessageSquare,
  Scale,
  XCircle,
} from "lucide-react";
import type { LineStatus, WorkedLine, WorkedPillar, WorkedScorecard } from "@/lib/calcReview/workedScorecard";
import type { ReviewDecision } from "@/lib/calcReview/decisions";
import {
  decisionAnchor,
  scorecardAnchor,
  type ReviewScorecard,
} from "@/lib/calcReview/registry";

type RenderNotes = (anchor: string, pillarKey: string) => ReactNode;

const fmt = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(dp);

const levelText = (n: number) => (n >= 9 ? "Non-compliant" : `Level ${n}`);

/** A DOM id for a note anchor, so the summary can link to a line. */
export const lineDomId = (anchor: string) => `review-${anchor.replace(/[^A-Za-z0-9_-]/g, "-")}`;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function StatusBadge({ status, diff }: { status: LineStatus; diff?: number }) {
  if (status === "match") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
        Same as the toolkit
      </Badge>
    );
  }
  if (status === "differs") {
    return (
      <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-400">
        <XCircle className="mr-1 h-3 w-3" aria-hidden />
        Differs{diff !== undefined ? ` by ${diff > 0 ? "+" : ""}${diff.toFixed(2)}` : ""}
      </Badge>
    );
  }
  return <Badge variant="outline">Not comparable</Badge>;
}

function NoteCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge variant="outline" className="text-[10px]">
      <MessageSquare className="mr-1 h-3 w-3" aria-hidden />
      {count} {count === 1 ? "note" : "notes"}
    </Badge>
  );
}

function ToolkitChain({ line }: { line: WorkedLine }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (line.chain.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className={`inline-flex items-center gap-1 rounded text-sm font-medium text-primary hover:underline ${FOCUS_RING}`}
      >
        {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
        {open ? "Hide how the toolkit works it out" : "Show how the toolkit works it out"}
      </button>
      {open && (
        <div id={id} className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/30">
          <table className="w-full text-xs">
            <caption className="sr-only">The toolkit's cells behind this line, with their values and formulas</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="px-2 py-1.5 font-medium">Toolkit cell</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Value</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Formula</th>
              </tr>
            </thead>
            <tbody>
              {line.chain.map((step, i) => (
                <tr key={`${step.cell}-${i}`} className="border-b border-border/50 align-top last:border-0">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono">{step.cell}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                    {typeof step.value === "number" ? Number(step.value.toFixed(6)) : String(step.value ?? "")}
                  </td>
                  <td className="break-all px-2 py-1.5 font-mono text-muted-foreground">{step.formula ?? "(entered)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WorkedLineCard({
  line,
  pillarKey,
  renderNotes,
  noteCount,
}: {
  line: WorkedLine;
  pillarKey: string;
  renderNotes: RenderNotes;
  noteCount: number;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const diff = line.ours !== null && line.toolkit !== null ? line.ours - line.toolkit : undefined;
  return (
    <div
      id={lineDomId(line.anchor)}
      className="scroll-mt-24 rounded-lg border border-border bg-card"
      data-testid={`worked-line-${line.row}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={`flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-muted/40 ${FOCUS_RING}`}
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{line.label}</span>
            {line.bonus && <Badge variant="secondary" className="text-[10px]">Bonus</Badge>}
            <StatusBadge status={line.status} diff={diff} />
            {line.toolkitNote && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
                Toolkit formula fault
              </Badge>
            )}
            <NoteCount count={noteCount} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Okiru <span className="font-medium text-foreground tabular-nums">{fmt(line.ours)}</span>
            {" · "}Toolkit <span className="font-medium text-foreground tabular-nums">{fmt(line.toolkit)}</span>
            {line.weighting === 0 ? (
              // A line the scorecard weights 0 (its points moved elsewhere) has no target to show.
              " · no points on this scorecard"
            ) : (
              <>
                {" · "}of {fmt(line.weighting, line.weighting % 1 ? 2 : 0)} point{line.weighting === 1 ? "" : "s"}
                {line.target ? ` · target ${line.target}` : ""}
              </>
            )}
          </div>
        </div>
      </button>
      {open && (
        <div id={bodyId} className="space-y-3 border-t border-border px-4 pb-4 pt-3 text-sm">
          <div>
            <div className="font-medium">Okiru's working</div>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">
              {line.working ??
                (line.ours === null
                  ? "Okiru shows no line here for this company."
                  : `${fmt(line.ours)} of ${fmt(line.weighting)} points.`)}
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="font-medium">The toolkit's working for the same company</div>
            {line.toolkit === null && (
              <p className="leading-relaxed text-muted-foreground">The toolkit leaves this line blank for this company.</p>
            )}
            {line.rows && line.rows.length > 1 && (
              <p className="leading-relaxed text-muted-foreground">
                The toolkit shows this line on {line.rows.length} rows; the figure is the rows added together.
              </p>
            )}
            {line.toolkitNote && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 leading-relaxed">{line.toolkitNote}</p>
            )}
            <ToolkitChain line={line} />
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewer notes</div>
          {renderNotes(line.anchor, pillarKey)}
        </div>
      )}
    </div>
  );
}

function WorkedPillarCard({
  pillar,
  renderNotes,
  noteCounts,
}: {
  pillar: WorkedPillar;
  renderNotes: RenderNotes;
  noteCounts: ReadonlyMap<string, number>;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const differing = pillar.lines.filter((l) => l.status !== "match").length;
  const faults = pillar.lines.filter((l) => l.toolkitNote).length;
  return (
    <Card id={lineDomId(`pillar:${pillar.key}`)} className="scroll-mt-24" data-testid={`worked-pillar-${pillar.key}`}>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className={`flex w-full items-start gap-3 rounded-md text-left ${FOCUS_RING}`}
        >
          {open ? (
            <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              <span>{pillar.label}</span>
              <StatusBadge status={pillar.status} diff={pillar.toolkit !== null ? pillar.ours - pillar.toolkit : undefined} />
              {differing > 0 && (
                <Badge variant="outline">
                  {differing} line{differing === 1 ? "" : "s"} differ{differing === 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Okiru <span className="tabular-nums">{fmt(pillar.ours)}</span> · Toolkit{" "}
              <span className="tabular-nums">{fmt(pillar.toolkit)}</span> · {pillar.lines.length} line
              {pillar.lines.length === 1 ? "" : "s"}
              {faults > 0 ? ` · ${faults} read past a toolkit formula fault` : ""}
            </p>
            {pillar.toolkitNote && <p className="mt-1 text-xs text-muted-foreground">{pillar.toolkitNote}</p>}
          </div>
        </button>
      </CardHeader>
      {open && (
        <CardContent id={bodyId} className="space-y-2">
          {pillar.lines.map((line) => (
            <WorkedLineCard
              key={line.anchor}
              line={line}
              pillarKey={pillar.key}
              renderNotes={renderNotes}
              noteCount={noteCounts.get(line.anchor) ?? 0}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function DecisionCard({
  decision,
  renderNotes,
  noteCount,
  isAnswered,
}: {
  decision: ReviewDecision;
  renderNotes: RenderNotes;
  noteCount: number;
  /** Whether any of its notes answers it (an open question does not). */
  isAnswered: boolean;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const anchor = decisionAnchor(decision);
  return (
    <div
      id={lineDomId(anchor)}
      className="scroll-mt-24 rounded-lg border border-border bg-card"
      data-testid={`decision-${decision.id}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={`flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-muted/40 ${FOCUS_RING}`}
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{decision.title}</span>
            <Badge variant="secondary" className="text-[10px]">{decision.element}</Badge>
            {decision.kind === "toolkit-fault" ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
                Toolkit formula fault
              </Badge>
            ) : (
              <Badge variant="outline">Judgment call</Badge>
            )}
            {noteCount > 0 && (
              <Badge
                variant="outline"
                className={isAnswered ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : undefined}
              >
                <MessageSquare className="mr-1 h-3 w-3" aria-hidden />
                {noteCount} {noteCount === 1 ? "note" : "notes"}
              </Badge>
            )}
            {!isAnswered && (
              <Badge variant="outline" className="text-muted-foreground">Awaiting a ruling</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{decision.question}</p>
        </div>
      </button>
      {open && (
        <div id={bodyId} className="space-y-2 border-t border-border px-4 pb-4 pt-3 text-sm leading-relaxed">
          <p><span className="font-medium">The toolkit: </span>{decision.toolkit}</p>
          {decision.codes && <p><span className="font-medium">The Codes: </span>{decision.codes}</p>}
          <p><span className="font-medium">Okiru now: </span>{decision.okiru}</p>
          {decision.appliesTo && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {decision.appliesTo}
            </p>
          )}
          <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your ruling</div>
          {renderNotes(anchor, "decisions")}
        </div>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function ScorecardSummary({
  entry,
  worked,
  awaiting,
  renderNotes,
}: {
  entry: ReviewScorecard;
  worked: WorkedScorecard;
  awaiting: number;
  renderNotes: RenderNotes;
}) {
  const lines = useMemo(() => worked.pillars.flatMap((p) => p.lines), [worked]);
  const notMatching = lines.filter((l) => l.status !== "match");
  const pillarsNotMatching = worked.pillars.filter((p) => p.status !== "match");
  const faultLines = lines.filter((l) => l.toolkitNote).length;
  const allMatch =
    notMatching.length === 0 &&
    pillarsNotMatching.length === 0 &&
    worked.total.status === "match" &&
    worked.achieved.status === "match" &&
    worked.discounted.status === "match";
  const s = worked.sample;
  return (
    <Card data-testid="worked-summary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Scale className="h-5 w-5 text-primary" aria-hidden />
          {entry.title} against the Empower toolkit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed">
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Stat label="Lines checked">{lines.length}</Stat>
          <Stat label="Same as the toolkit">
            {lines.length - notMatching.length} of {lines.length}
          </Stat>
          <Stat label="Rulings awaiting an answer">
            {awaiting} of {entry.decisions.length}
          </Stat>
          <Stat label="Total">
            Okiru {fmt(worked.total.ours)} · Toolkit {fmt(worked.total.toolkit)}
          </Stat>
          <Stat label="Level">
            Okiru {levelText(worked.achieved.ours)} · Toolkit {levelText(worked.achieved.toolkit)}
          </Stat>
          <Stat label="After discounting">
            Okiru {levelText(worked.discounted.ours)} · Toolkit {levelText(worked.discounted.toolkit)}
          </Stat>
        </dl>

        {allMatch ? (
          <p
            className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3"
            data-testid="worked-all-match"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span>
              Every line, every element total, the grand total and both levels are the same as the toolkit.
              {faultLines > 0 &&
                ` On ${faultLines} line${faultLines === 1 ? "" : "s"} that is the toolkit's figure read past a faulty formula; each says why.`}
            </span>
          </p>
        ) : (
          <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3" data-testid="worked-differences">
            <p className="flex items-center gap-2 font-medium">
              <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
              Not everything matches the toolkit
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {notMatching.map((l) => (
                <li key={l.anchor}>
                  <a href={`#${lineDomId(l.anchor)}`} className="underline underline-offset-2 hover:text-foreground">
                    {l.label}
                  </a>
                  : Okiru {fmt(l.ours)}, toolkit {fmt(l.toolkit)}
                </li>
              ))}
              {pillarsNotMatching.map((p) => (
                <li key={p.key}>
                  {p.label} total: Okiru {fmt(p.ours)}, toolkit {fmt(p.toolkit)}
                </li>
              ))}
              {worked.total.status !== "match" && (
                <li>Grand total: Okiru {fmt(worked.total.ours)}, toolkit {fmt(worked.total.toolkit)}</li>
              )}
              {worked.achieved.status !== "match" && (
                <li>
                  Level: Okiru {levelText(worked.achieved.ours)}, toolkit {levelText(worked.achieved.toolkit)}
                </li>
              )}
              {worked.discounted.status !== "match" && (
                <li>
                  After discounting: Okiru {levelText(worked.discounted.ours)}, toolkit{" "}
                  {levelText(worked.discounted.toolkit)}
                </li>
              )}
            </ul>
          </div>
        )}

        {(worked.achieved.note || worked.discounted.note) && (
          // Each note is about one of the two levels; say which, since both
          // can open "The toolkit shows Level …".
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3" data-testid="worked-level-notes">
            {worked.achieved.note && (
              <p>
                <span className="font-medium">Level, before discounting: </span>
                {worked.achieved.note}
              </p>
            )}
            {worked.discounted.note && (
              <p>
                <span className="font-medium">Level after discounting: </span>
                {worked.discounted.note}
              </p>
            )}
          </div>
        )}

        <p className="text-muted-foreground">
          A sample company is scored twice: by the calculator every Okiru scorecard comes from, and by {entry.toolkit}{" "}
          recalculated in Excel. The sample has {s.shareholders} shareholder{s.shareholders === 1 ? "" : "s"},{" "}
          {s.employees} people on the management register, {s.trainingRows} training records, {s.suppliers} suppliers,{" "}
          {s.esdContributions} enterprise and supplier development contributions and {s.sedContributions}{" "}
          socio-economic contributions, with revenue of R{Math.round(s.revenue).toLocaleString("en-ZA")} and NPAT for
          targets of R{Math.round(s.npat).toLocaleString("en-ZA")}. It is invented for testing; it is no client.
        </p>
        {entry.note && (
          <p className="flex items-start gap-2 text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {entry.note}
          </p>
        )}
        <p className="text-muted-foreground">
          Where the toolkit's own formula is faulty, the toolkit column shows what that formula evidently means, worked
          out from the toolkit's own figures, and says so. Every such place is listed under "Rulings needed" below.
        </p>

        <div id={lineDomId(scorecardAnchor(entry))} className="scroll-mt-24 rounded-lg border border-border p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes on this scorecard as a whole
          </h3>
          {renderNotes(scorecardAnchor(entry), "scorecard")}
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkedScorecardView({
  entry,
  worked,
  renderNotes,
  noteCounts,
  answered,
}: {
  entry: ReviewScorecard;
  worked: WorkedScorecard;
  renderNotes: RenderNotes;
  /** How many notes each anchor carries (from every reviewer). */
  noteCounts: ReadonlyMap<string, number>;
  /**
   * The anchors carrying a note that answers: any note but an open question.
   * A ruling whose only notes are open questions is still awaiting its answer.
   */
  answered: ReadonlySet<string>;
}) {
  const awaiting = entry.decisions.filter((d) => !answered.has(decisionAnchor(d))).length;
  return (
    <div className="space-y-6" data-testid={`worked-scorecard-${entry.id}`}>
      <ScorecardSummary entry={entry} worked={worked} awaiting={awaiting} renderNotes={renderNotes} />

      <section aria-labelledby="worked-lines-heading" className="space-y-4">
        <h2 id="worked-lines-heading" className="text-lg font-semibold">
          The scorecard, line by line
        </h2>
        {worked.pillars.map((p) => (
          <WorkedPillarCard key={p.key} pillar={p} renderNotes={renderNotes} noteCounts={noteCounts} />
        ))}
      </section>

      <Card data-testid="worked-rulings">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <Gavel className="h-5 w-5 text-primary" aria-hidden />
            Rulings needed
            <Badge variant="outline">
              {awaiting} of {entry.decisions.length} awaiting a ruling
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Each is a place where matching the toolkit forced a choice: the toolkit's formula is faulty and Okiru scores
            what it evidently means, or the toolkit makes a judgment the Codes could be read differently on and Okiru
            follows it. Open one and record your ruling under it.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {entry.decisions.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              renderNotes={renderNotes}
              noteCount={noteCounts.get(decisionAnchor(d)) ?? 0}
              isAnswered={answered.has(decisionAnchor(d))}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
