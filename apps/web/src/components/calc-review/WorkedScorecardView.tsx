/**
 * The Calculation Review's worked scorecard: a sample company scored by the
 * live calculator, line by line, beside the Empower toolkit's answer for the
 * same company with the toolkit's own cells and formulas — plus the rulings
 * the expert is asked to make. Notes render through `renderNotes`, so this
 * view shares the page's note threads.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Scale, XCircle } from "lucide-react";
import type { LineStatus, WorkedLine, WorkedPillar, WorkedScorecard } from "@/lib/calcReview/workedScorecard";
import type { ReviewDecision } from "@/lib/calcReview/decisions";

type RenderNotes = (anchor: string, pillarKey: string) => ReactNode;

const fmt = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(dp);

const levelText = (n: number) => (n >= 9 ? "Non-compliant" : `Level ${n}`);

function StatusBadge({ status, diff }: { status: LineStatus; diff?: number }) {
  if (status === "match") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Same as the toolkit
      </Badge>
    );
  }
  if (status === "differs") {
    return (
      <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-400">
        <XCircle className="mr-1 h-3 w-3" />
        Differs{diff !== undefined ? ` by ${diff > 0 ? "+" : ""}${diff.toFixed(2)}` : ""}
      </Badge>
    );
  }
  return <Badge variant="outline">Not comparable</Badge>;
}

function ToolkitChain({ line }: { line: WorkedLine }) {
  if (line.chain.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-muted/30">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">Toolkit cell</th>
            <th className="px-2 py-1.5 font-medium">Value</th>
            <th className="px-2 py-1.5 font-medium">Formula</th>
          </tr>
        </thead>
        <tbody>
          {line.chain.map((step) => (
            <tr key={step.cell} className="border-b border-border/50 align-top last:border-0">
              <td className="whitespace-nowrap px-2 py-1.5 font-mono">{step.cell}</td>
              <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                {typeof step.value === "number" ? Number(step.value.toFixed(6)) : String(step.value ?? "")}
              </td>
              <td className="px-2 py-1.5 font-mono text-muted-foreground">{step.formula ?? "(entered)"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkedLineCard({ line, pillarKey, renderNotes }: { line: WorkedLine; pillarKey: string; renderNotes: RenderNotes }) {
  const [open, setOpen] = useState(false);
  const diff = line.ours !== null && line.toolkit !== null ? line.ours - line.toolkit : undefined;
  return (
    <div className="rounded-lg border border-border bg-card" data-testid={`worked-line-${line.row}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{line.label}</span>
            {line.bonus && <Badge variant="secondary" className="text-[10px]">Bonus</Badge>}
            <StatusBadge status={line.status} diff={diff} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Okiru <span className="font-medium text-foreground">{fmt(line.ours)}</span>
            {" · "}Toolkit <span className="font-medium text-foreground">{fmt(line.toolkit)}</span>
            {" · "}of {fmt(line.weighting, line.weighting % 1 ? 2 : 0)} points
            {line.target ? ` · target ${line.target}` : ""}
          </div>
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-4 pb-4 pt-3 text-sm">
          <div>
            <div className="font-medium">Okiru's working</div>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">
              {line.working ?? `${fmt(line.ours)} of ${fmt(line.weighting)} points.`}
            </p>
          </div>
          <div>
            <div className="font-medium">The toolkit's working for the same company</div>
            {line.toolkitNote && (
              <p className="mt-0.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 leading-relaxed">
                {line.toolkitNote}
              </p>
            )}
            <div className="mt-1.5">
              <ToolkitChain line={line} />
            </div>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewer notes</div>
          {renderNotes(line.anchor, pillarKey)}
        </div>
      )}
    </div>
  );
}

function WorkedPillarCard({ pillar, renderNotes, defaultOpen }: { pillar: WorkedPillar; renderNotes: RenderNotes; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const differing = pillar.lines.filter((l) => l.status === "differs").length;
  return (
    <Card data-testid={`worked-pillar-${pillar.key}`}>
      <CardHeader className="cursor-pointer select-none pb-3" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start gap-3">
          {open ? (
            <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              {pillar.label}
              <StatusBadge status={pillar.status} diff={pillar.toolkit !== null ? pillar.ours - pillar.toolkit : undefined} />
              {differing > 0 && <Badge variant="outline">{differing} line{differing === 1 ? "" : "s"} differ</Badge>}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Okiru {fmt(pillar.ours)} · Toolkit {fmt(pillar.toolkit)}
              {pillar.toolkitNote ? ` · ${pillar.toolkitNote}` : ""}
            </p>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          {pillar.lines.map((line) => (
            <WorkedLineCard key={line.row} line={line} pillarKey={pillar.key} renderNotes={renderNotes} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function DecisionCard({ decision, renderNotes }: { decision: ReviewDecision; renderNotes: RenderNotes }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card" data-testid={`decision-${decision.id}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{decision.title}</span>
            <Badge variant="secondary" className="text-[10px]">{decision.element}</Badge>
            {decision.kind === "toolkit-fault" ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Toolkit formula fault
              </Badge>
            ) : (
              <Badge variant="outline">Judgment call</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{decision.question}</p>
        </div>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-4 pb-4 pt-3 text-sm">
          <p><span className="font-medium">The toolkit: </span>{decision.toolkit}</p>
          {decision.codes && <p><span className="font-medium">The Codes: </span>{decision.codes}</p>}
          <p><span className="font-medium">Okiru now: </span>{decision.okiru}</p>
          <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your ruling</div>
          {renderNotes(`indicator:decision-${decision.id}`, "decisions")}
        </div>
      )}
    </div>
  );
}

export function WorkedScorecardView({
  worked,
  decisions,
  renderNotes,
}: {
  worked: WorkedScorecard;
  decisions: ReviewDecision[];
  renderNotes: RenderNotes;
}) {
  const lines = useMemo(() => worked.pillars.flatMap((p) => p.lines), [worked]);
  const matching = lines.filter((l) => l.status === "match").length;
  const s = worked.sample;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scale className="h-5 w-5 text-primary" />
            Okiru against the Empower toolkit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            A sample company is scored twice: by the calculator every Okiru scorecard comes from, and
            by the Empower RCOGP Generic toolkit recalculated in Excel. The sample has{" "}
            {s.shareholders} shareholders, {s.employees} employees, {s.trainingRows} training records,{" "}
            {s.suppliers} suppliers, {s.esdContributions} enterprise and supplier development
            contributions and {s.sedContributions} socio-economic contributions, with revenue of R
            {Math.round(s.revenue).toLocaleString("en-ZA")} and NPAT for targets of R
            {Math.round(s.npat).toLocaleString("en-ZA")}. It is invented for testing; it is no client.
          </p>
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">{matching} of {lines.length} lines the same as the toolkit</Badge>
            <Badge variant="outline">
              Total: Okiru {fmt(worked.total.ours)} · Toolkit {fmt(worked.total.toolkit)}
            </Badge>
            <Badge variant="outline">
              Level: Okiru {levelText(worked.achieved.ours)} · Toolkit {levelText(worked.achieved.toolkit)}
            </Badge>
            <Badge variant="outline">
              After discounting: Okiru {levelText(worked.discounted.ours)} · Toolkit {levelText(worked.discounted.toolkit)}
            </Badge>
          </div>
          {(worked.achieved.note || worked.discounted.note) && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
              {[worked.achieved.note, worked.discounted.note].filter(Boolean).join(" ")}
            </p>
          )}
          <p className="text-muted-foreground">
            Where the toolkit's own formula is faulty, the toolkit column shows what that formula
            evidently means, worked out from the toolkit's own figures, and says so. Every such place
            is listed below for your ruling.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rulings needed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {decisions.map((d) => (
            <DecisionCard key={d.id} decision={d} renderNotes={renderNotes} />
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {worked.pillars.map((p, i) => (
          <WorkedPillarCard key={p.key} pillar={p} renderNotes={renderNotes} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}
