import { useMemo } from "react";
import { Link } from "wouter";
import { esgCreateHref } from "@/lib/esgRoutes";
import type { EsgScorecardIndicator } from "@/lib/esg/esgScorecardDefinitions";
import { useEsgStore } from "../lib/esgStore";

export type EsgScorecardRow = {
  indicator: string;
  actual: string;
  target: string;
  maxPoints: number;
  score: number;
  achievementPct: number;
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

  const rows = useMemo((): EsgScorecardRow[] => {
    return indicators.map((ind) => {
      const score = scores?.[ind.key] ?? 0;
      return {
        indicator: ind.indicator,
        actual: score.toFixed(1),
        target: String(ind.maxPoints),
        maxPoints: ind.maxPoints,
        score,
        achievementPct: ind.maxPoints > 0 ? (score / ind.maxPoints) * 100 : 0,
      };
    });
  }, [indicators, scores]);

  return (
    <div className="space-y-5" data-testid={`esg-scorecard-${pillar}`}>
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">
          {sheet}
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--esg-text)]">{title}</h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">
          Every scoring row from {sheet}.json — computed from workbook inputs.
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
        </div>
        {companyId ? (
          <Link
            href={esgCreateHref(companyId)}
            className="ml-auto text-[11px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
            data-testid="esg-edit-inputs-link"
          >
            Edit inputs →
          </Link>
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
            {rows.map((r) => (
              <tr
                key={r.indicator}
                className="border-b border-[var(--esg-glass-border)]/50"
                data-testid={`esg-scorecard-row-${r.indicator.slice(0, 24)}`}
              >
                <td className="py-2 px-3 text-[var(--esg-text2)]">{r.indicator}</td>
                <td className="py-2 px-2 tabular-nums text-right">{r.actual}</td>
                <td className="py-2 px-2 tabular-nums text-right">{r.target}</td>
                <td className="py-2 px-2 tabular-nums text-right">{r.maxPoints}</td>
                <td className="py-2 px-2 tabular-nums text-right font-medium">{r.score.toFixed(1)}</td>
                <td className="py-2 px-3 tabular-nums text-right">{r.achievementPct.toFixed(0)}%</td>
              </tr>
            ))}
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
