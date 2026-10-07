import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  computeEsgIndicatorCoverage,
  type EsgIndicatorCoverage,
  type EsgIndicatorStatus,
  type EsgPillarCoverage,
} from "@/lib/esg/esgIndicatorCoverage";
import { ESG_APPLICABILITY_SECTION, PILLAR_LETTER } from "../lib/calculators/esgApplicability";
import { useEsgStore } from "../lib/esgStore";

const DECLARED = "Declared not applicable by the company: ";

/**
 * "This does not apply to us", with the reason — the company's call, stated
 * on the record. An indicator switched off leaves the score's numerator and
 * denominator together, and the reason is what the report says about it.
 */
function ApplicabilityControl({ x }: { x: EsgIndicatorCoverage }) {
  const workbook = useEsgStore((s) => s.workbook);
  const locked = useEsgStore((s) => Boolean(s.submittedAt));
  const updateSectionCells = useEsgStore((s) => s.updateSectionCells);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const declared = x.status === "excluded" && (x.excludedReason ?? "").startsWith(DECLARED);
  if (locked || (x.status === "excluded" && !declared)) return null;

  const cellKey = `${PILLAR_LETTER[x.pillar]}:${x.key}`;
  const save = async (value: string) => {
    const current = (workbook?.sections?.[ESG_APPLICABILITY_SECTION]?.cells ?? {}) as Record<string, string | number | boolean | null>;
    const next = { ...current };
    if (value) next[cellKey] = value;
    else delete next[cellKey];
    try {
      setError(null);
      await updateSectionCells(ESG_APPLICABILITY_SECTION, next);
      setOpen(false);
      setReason("");
    } catch {
      setError("Not saved — try again.");
    }
  };

  if (declared) {
    return (
      <button
        type="button"
        className="text-[11px] text-[var(--esg-acc-blue)] hover:underline"
        onClick={() => void save("")}
        data-testid={`esg-applies-again-${x.pillar}-${x.key}`}
      >
        It applies to us — count it again
      </button>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        className="text-[11px] text-[var(--esg-text3)] hover:text-[var(--esg-text2)] hover:underline"
        onClick={() => setOpen(true)}
        data-testid={`esg-not-applicable-${x.pillar}-${x.key}`}
      >
        Does not apply to us
      </button>
    );
  }
  return (
    <div className="space-y-1.5" data-testid={`esg-not-applicable-form-${x.pillar}-${x.key}`}>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why it does not apply — this is what the report will say"
        className="w-full rounded-md border border-white/10 bg-black/20 p-2 text-[11px] text-[var(--esg-text)]"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={reason.trim().length < 10}
          className="rounded-md bg-[var(--esg-acc-blue)] px-2.5 py-1 text-[11px] text-white disabled:opacity-40"
          onClick={() => void save(reason.trim())}
        >
          Leave it out of the score
        </button>
        <button type="button" className="text-[11px] text-[var(--esg-text3)]" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error ? <p className="text-[11px] text-amber-300">{error}</p> : null}
    </div>
  );
}

/**
 * Score breakdown — the structure behind the ESG score.
 *
 * Every scorecard indicator with what it measures, what it scored, and what
 * is still needed: the "what do we have, what are we missing" a client asks
 * for, with each gap linked to the page where it is filled in.
 */

const PILLAR_LABELS: Record<EsgPillarCoverage["pillar"], string> = {
  environmental: "Environmental",
  social: "Social",
  governance: "Governance",
};

const STATUS: Record<EsgIndicatorStatus, { label: string; tone: string }> = {
  full: { label: "Full marks", tone: "text-emerald-300" },
  partial: { label: "Partly earned", tone: "text-[var(--esg-text)]" },
  missing: { label: "Data missing", tone: "text-amber-300" },
  zero: { label: "Scored zero on the data", tone: "text-[var(--esg-text2)]" },
  excluded: { label: "Left out of the score", tone: "text-[var(--esg-text3)]" },
};

const pts = (n: number) => new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 1 }).format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function IndicatorRow({ x }: { x: EsgIndicatorCoverage }) {
  const status = STATUS[x.status];
  return (
    <details className="border-t border-white/[0.06] py-2" data-testid={`esg-indicator-${x.pillar}-${x.key}`}>
      <summary className="flex cursor-pointer items-baseline gap-3 text-[12px] list-none">
        <span className="flex-1 text-[var(--esg-text2)]">{x.indicator}</span>
        <span className="tabular-nums text-[var(--esg-text)]">
          {x.status === "excluded" ? "—" : `${pts(x.points)} / ${pts(x.maxPoints)}`}
        </span>
        <span className={`w-44 text-right text-[11px] ${status.tone}`}>{status.label}</span>
      </summary>
      <div className="mt-2 space-y-1.5 pl-1 text-[11px] text-[var(--esg-text3)]">
        {x.meaning ? <p>{x.meaning}</p> : null}
        {x.status === "excluded" && x.excludedReason ? <p className="text-[var(--esg-text2)]">{x.excludedReason}</p> : null}
        {x.missing.length > 0 ? (
          <p className="text-amber-300/90">Needed: {x.missing.join("; ")}.</p>
        ) : null}
        {x.optional.length > 0 && x.status !== "full" ? (
          <p>Would change the result: {x.optional.join("; ")}.</p>
        ) : null}
        {x.topic && (x.missing.length > 0 || x.status === "zero" || x.status === "partial") ? (
          <Link href={x.topic.href} className="text-[var(--esg-acc-blue)] hover:underline">
            Open {x.topic.label}
          </Link>
        ) : null}
        <ApplicabilityControl x={x} />
      </div>
    </details>
  );
}

export default function EsgScoreBreakdown() {
  const workbook = useEsgStore((s) => s.workbook);
  const coverage = useMemo(() => (workbook ? computeEsgIndicatorCoverage(workbook) : null), [workbook]);

  if (!coverage) {
    return (
      <div className="esg-glass p-5" data-testid="esg-score-breakdown-empty">
        <p className="text-[13px] text-[var(--esg-text2)]">Open a company's workbook to see its score breakdown.</p>
      </div>
    );
  }

  const all = coverage.pillars.flatMap((p) => p.indicators);
  const needed = all.filter((x) => x.status === "missing" || (x.status === "excluded" && x.excludedFixable));
  const byTopic = new Map<string, { topic: EsgIndicatorCoverage["topic"]; items: EsgIndicatorCoverage[] }>();
  for (const x of needed) {
    const id = x.topic?.id ?? `${x.pillar}-other`;
    const group = byTopic.get(id) ?? { topic: x.topic, items: [] };
    group.items.push(x);
    byTopic.set(id, group);
  }

  return (
    <div className="space-y-4" data-testid="esg-score-breakdown">
      <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">Score breakdown</h1>
      <p className="text-[12px] text-[var(--esg-text2)]">
        Every indicator behind the ESG score: what it measures, what it scored, and what is still needed
        to score it. An indicator left out of the score leaves its denominator too, with the reason stated.
      </p>

      <div className="esg-glass p-5 grid gap-4 sm:grid-cols-4" data-testid="esg-breakdown-headline">
        <div>
          <div className="text-[10px] uppercase text-[var(--esg-text3)]">Overall ESG</div>
          <div className="text-[30px] font-bold text-[var(--esg-text)]">{pct(coverage.overallPercent)}</div>
        </div>
        {coverage.pillars.map((p) => (
          <div key={p.pillar}>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">{PILLAR_LABELS[p.pillar]}</div>
            <div className="text-[20px] font-semibold text-[var(--esg-text)]">
              {pts(p.score)} <span className="text-[13px] font-normal text-[var(--esg-text3)]">/ {pts(p.denominator)}</span>
            </div>
            <div className="text-[11px] text-[var(--esg-text3)]">{pct(p.percent)}</div>
          </div>
        ))}
      </div>

      <div className="esg-glass p-5 text-[12px] text-[var(--esg-text2)]" data-testid="esg-breakdown-counts">
        <span className="text-emerald-300">{coverage.counts.full} full marks</span> ·{" "}
        {coverage.counts.partial} partly earned ·{" "}
        <span className="text-amber-300">
          {coverage.counts.missing} waiting for data ({pts(coverage.pointsAwaitingData)} points)
        </span>{" "}
        · {coverage.counts.zero} scored zero on the data · {coverage.counts.excluded} left out of the score
      </div>

      {needed.length > 0 ? (
        <div className="esg-glass p-5" data-testid="esg-breakdown-needed">
          <h2 className="text-[13px] font-semibold text-[var(--esg-text)]">What is still needed</h2>
          <p className="mt-1 text-[11px] text-[var(--esg-text3)]">
            The data each indicator is waiting for, by the page where it is entered.
          </p>
          <div className="mt-3 space-y-3">
            {Array.from(byTopic.values()).map(({ topic, items }) => (
              <div key={topic?.id ?? items[0].pillar}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-semibold text-[var(--esg-text)]">
                    {topic?.label ?? PILLAR_LABELS[items[0].pillar]}
                  </span>
                  {topic ? (
                    <Link href={topic.href} className="text-[11px] text-[var(--esg-acc-blue)] hover:underline">
                      Open
                    </Link>
                  ) : null}
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--esg-text2)]">
                  {items.map((x) => (
                    <li key={`${x.pillar}-${x.key}`}>
                      <span className="text-[var(--esg-text)]">{x.indicator}</span>{" "}
                      <span className="text-[var(--esg-text3)]">({pts(x.maxPoints)} pts)</span>:{" "}
                      {x.status === "excluded" ? x.excludedReason : x.missing.join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {coverage.pillars.map((p) => (
        <div key={p.pillar} className="esg-glass p-5" data-testid={`esg-breakdown-${p.pillar}`}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-[var(--esg-text)]">{PILLAR_LABELS[p.pillar]}</h2>
            <span className="text-[12px] tabular-nums text-[var(--esg-text2)]">
              {pts(p.score)} / {pts(p.denominator)} · {pct(p.percent)}
            </span>
          </div>
          {p.indicators.map((x) => (
            <IndicatorRow key={x.key} x={x} />
          ))}
        </div>
      ))}
    </div>
  );
}
