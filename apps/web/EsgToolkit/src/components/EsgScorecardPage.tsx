import { Fragment, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { EsgAppLink } from "@/components/EsgAppLink";
import { esgCreateHref } from "@/lib/esgRoutes";
import { esgIndicatorLabel, type EsgScorecardIndicator } from "@/lib/esg/esgScorecardDefinitions";
import type { EsgIndicatorTrace, EsgTraceUnit, EsgTraceValue } from "../lib/calculators/esgTrace";
import { useEsgStore } from "../lib/esgStore";

export type EsgScorecardRow = {
  key: string;
  indicator: string;
  /** What was measured, in the indicator's unit — not the points (E3). */
  actual: string;
  /** The target it was measured against, or why there is none. */
  target: string;
  maxPoints: number;
  score: number;
  achievementPct: number;
  trace: EsgIndicatorTrace | undefined;
  excludedReason: string | undefined;
};

type Props = {
  pillar: "environmental" | "social" | "governance";
  title: string;
  sheet: string;
  indicators: EsgScorecardIndicator[];
  scores: Record<string, number> | undefined;
  totalScore: number | undefined;
  maxScore: number;
  accent: string;
};

const ZA = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 1 });

/** A measured value or target, in the words and unit a reader expects. */
export function formatTraceValue(value: EsgTraceValue, unit: EsgTraceUnit): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  switch (unit) {
    case "ratio":
      return `${ZA.format(value * 100)}%`;
    case "litres":
      return `${ZA.format(value)} L`;
    case "kWh":
      return `${ZA.format(value)} kWh`;
    case "kL":
      return `${ZA.format(value)} kL`;
    case "kg":
      return `${ZA.format(value)} kg`;
    case "tCO2e":
      return `${ZA.format(value)} tCO₂e`;
    case "rating":
      return `${ZA.format(value)} / 5`;
    case "hours":
      return `${ZA.format(value)} h`;
    case "rand":
      return `R ${ZA.format(value)}`;
    case "year":
      return String(value);
    default:
      return ZA.format(value);
  }
}

export function EsgScorecardPage({
  pillar,
  title,
  sheet,
  indicators,
  scores,
  totalScore,
  maxScore,
  accent,
}: Props) {
  const companyId = useEsgStore((s) => s.companyId);
  const traces = useEsgStore((s) => s.scorecard?.traces?.[pillar]);
  const excluded = useEsgStore((s) => s.scorecard?.excluded?.[pillar]);
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo((): EsgScorecardRow[] => {
    return indicators.map((ind) => {
      const score = scores?.[ind.key] ?? 0;
      const trace = traces?.[ind.key];
      const excludedReason = excluded?.find((x) => x.key === ind.key)?.reason;
      return {
        key: ind.key,
        indicator: esgIndicatorLabel(pillar, ind.key),
        actual: trace?.measured ? formatTraceValue(trace.measured.value, trace.measured.unit) : "—",
        target: excludedReason
          ? "Excluded"
          : trace?.target
            ? formatTraceValue(trace.target.value, trace.target.unit)
            : "—",
        maxPoints: ind.maxPoints,
        score,
        achievementPct: ind.maxPoints > 0 ? (score / ind.maxPoints) * 100 : 0,
        trace,
        excludedReason,
      };
    });
  }, [indicators, scores, traces, excluded, pillar]);

  return (
    <div className="space-y-5" data-testid={`esg-scorecard-${pillar}`}>
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">
          {sheet}
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--esg-text)]">{title}</h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">
          Every scoring row from {sheet}, computed from the workbook. Open a row to see how it was scored: what was
          measured, the target and where it came from, and the cells it read.
        </p>
      </header>

      <div className="esg-glass p-5 flex flex-wrap items-center gap-4">
        <div>
          <div className="text-[36px] font-bold leading-none" style={{ color: accent }}>
            {totalScore != null ? totalScore.toFixed(1) : "—"}
            <span className="text-[16px] text-[var(--esg-text3)] font-normal"> / {maxScore}</span>
          </div>
          <div className="text-[11px] text-[var(--esg-text3)] mt-1">Pillar total</div>
        </div>
        <div className="text-[12px] text-[var(--esg-text2)]">
          {rows.length} indicators · {rows.filter((r) => r.score >= r.maxPoints).length} fully met
          {excluded && excluded.length > 0 ? ` · ${excluded.length} excluded` : ""}
        </div>
        {companyId ? (
          <EsgAppLink
            href={esgCreateHref(companyId)}
            className="ml-auto text-[11px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
            data-testid="esg-edit-inputs-link"
          >
            Edit inputs →
          </EsgAppLink>
        ) : null}
      </div>

      <div className="esg-glass overflow-x-auto">
        <table className="w-full text-[11px] border-collapse min-w-[640px]">
          <thead>
            <tr className="text-[var(--esg-text3)] text-left border-b border-[var(--esg-glass-border)]">
              <th className="py-2 px-3">Indicator</th>
              <th className="py-2 px-2 text-right">Actual</th>
              <th className="py-2 px-2 text-right">Target</th>
              <th className="py-2 px-2 text-right">Max Pts</th>
              <th className="py-2 px-2 text-right">Score</th>
              <th className="py-2 px-3 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open === r.key;
              const detailId = `esg-trace-${pillar}-${r.key}`;
              return (
                <Fragment key={r.key}>
                  <tr
                    className={`border-b border-[var(--esg-glass-border)]/50 ${r.excludedReason ? "opacity-70" : ""}`}
                    data-testid={`esg-scorecard-row-${r.indicator.slice(0, 24)}`}
                  >
                    <td className="py-2 px-3 text-[var(--esg-text2)]">
                      <button
                        type="button"
                        className="inline-flex items-start gap-1.5 text-left hover:text-[var(--esg-text)]"
                        aria-expanded={isOpen}
                        aria-controls={detailId}
                        onClick={() => setOpen(isOpen ? null : r.key)}
                        data-testid={`esg-trace-toggle-${r.key}`}
                      >
                        <ChevronRight className={`h-3.5 w-3.5 mt-px shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        {r.indicator}
                      </button>
                    </td>
                    <td className="py-2 px-2 tabular-nums text-right" data-testid={`esg-actual-${r.key}`}>{r.actual}</td>
                    <td className="py-2 px-2 tabular-nums text-right" data-testid={`esg-target-${r.key}`}>{r.target}</td>
                    <td className="py-2 px-2 tabular-nums text-right">{r.maxPoints}</td>
                    <td className="py-2 px-2 tabular-nums text-right font-medium">{r.excludedReason ? "—" : r.score.toFixed(1)}</td>
                    <td className="py-2 px-3 tabular-nums text-right">{r.excludedReason ? "—" : `${r.achievementPct.toFixed(0)}%`}</td>
                  </tr>
                  {isOpen ? (
                    <tr id={detailId} className="border-b border-[var(--esg-glass-border)]/50 bg-white/[0.02]">
                      <td colSpan={6} className="px-4 py-3 text-[11.5px] text-[var(--esg-text2)]" data-testid={detailId}>
                        <TraceDetail row={r} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-[var(--esg-text)]">
              <td className="py-2 px-3">Total</td>
              <td colSpan={3} />
              <td className="py-2 px-2 tabular-nums text-right">{totalScore?.toFixed(1) ?? "—"}</td>
              <td className="py-2 px-3 tabular-nums text-right">
                {totalScore != null ? `${((totalScore / maxScore) * 100).toFixed(1)}%` : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** One row's trace: why it was left out, or how it was scored. */
function TraceDetail({ row }: { row: EsgScorecardRow }) {
  const t = row.trace;
  return (
    <div className="space-y-2">
      {row.excludedReason ? (
        <p className="text-[var(--esg-text)]">
          <span className="font-semibold">Left out of the total.</span> {row.excludedReason}
        </p>
      ) : null}
      {t ? (
        <>
          <p>
            <span className="font-semibold text-[var(--esg-text)]">Rule.</span> {t.rule}
          </p>
          {t.measured ? (
            <p>
              <span className="font-semibold text-[var(--esg-text)]">Measured.</span> {t.measured.label}:{" "}
              {formatTraceValue(t.measured.value, t.measured.unit)}
            </p>
          ) : (
            <p>
              <span className="font-semibold text-[var(--esg-text)]">Measured.</span> Nothing yet — the inputs below are
              empty.
            </p>
          )}
          {t.target ? (
            <p>
              <span className="font-semibold text-[var(--esg-text)]">Target.</span>{" "}
              {formatTraceValue(t.target.value, t.target.unit)} — {t.target.source}
            </p>
          ) : null}
          {t.inputs.length > 0 ? (
            <table className="mt-1 w-full max-w-[720px] text-[11px]">
              <thead>
                <tr className="text-left text-[var(--esg-text3)]">
                  <th className="pr-3 font-medium">Cell</th>
                  <th className="pr-3 font-medium">What it holds</th>
                  <th className="font-medium text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {t.inputs.map((input) => (
                  <tr key={`${input.ref}-${input.label}`}>
                    <td className="pr-3 font-mono text-[10.5px] text-[var(--esg-text3)]">{input.ref}</td>
                    <td className="pr-3">{input.label}</td>
                    <td className="text-right tabular-nums">
                      {input.value == null || input.value === "" ? "—" : typeof input.value === "number" ? ZA.format(input.value) : String(input.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p className="text-[var(--esg-text3)]">
            Scored {row.excludedReason ? "—" : `${row.score.toFixed(1)} of ${row.maxPoints}`}.
          </p>
        </>
      ) : !row.excludedReason ? (
        <p>No calculation trace for this row.</p>
      ) : null}
    </div>
  );
}
