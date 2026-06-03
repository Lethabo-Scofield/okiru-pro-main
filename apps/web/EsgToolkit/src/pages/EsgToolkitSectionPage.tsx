import { useMemo } from "react";
import { useRoute } from "wouter";
import {
  SCORECARD_INDICATORS,
  type EsgScorecardIndicator,
} from "@/lib/esg/esgScorecardDefinitions";
import {
  formatNavBadge,
  sumScoreGroup,
  toolkitPageByHref,
} from "@/lib/esg/esgToolkitNav";
import { EsgToolkitInlineEditor } from "../components/EsgToolkitInlineEditor";
import { useEsgStore } from "../lib/esgStore";

function filterIndicators(
  indicators: EsgScorecardIndicator[],
  keys: string[],
): EsgScorecardIndicator[] {
  const set = new Set(keys);
  return indicators.filter((i) => set.has(i.key));
}

export default function EsgToolkitSectionPage() {
  const [, params] = useRoute("/:pillar/:section");
  const scorecard = useEsgStore((s) => s.scorecard);
  const href = params?.pillar && params?.section ? `/${params.pillar}/${params.section}` : "";
  const page = useMemo(() => toolkitPageByHref(href), [href]);

  if (!page?.sectionKey) {
    return (
      <p className="text-[13px] text-[var(--esg-text3)]" data-testid="esg-section-missing">
        Section configuration not found.
      </p>
    );
  }

  const subScore = sumScoreGroup(scorecard, page.scoreGroup);
  const accent =
    page.pillar === "e"
      ? "var(--esg-acc-e)"
      : page.pillar === "s"
        ? "var(--esg-acc-s)"
        : "var(--esg-acc-g)";

  const indicators = page.scoreGroup
    ? filterIndicators(SCORECARD_INDICATORS[page.scoreGroup.pillar], page.scoreGroup.keys)
    : [];

  const rows = page.scoreGroup
    ? page.scoreGroup.pillar === "environmental"
      ? scorecard?.environmentalRows
      : page.scoreGroup.pillar === "social"
        ? scorecard?.socialRows
        : scorecard?.governanceRows
    : undefined;

  return (
    <div className="space-y-5" data-testid={`esg-toolkit-page-${page.id}`}>
      <header className="page-hdr">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">
          {page.eyebrow} · {page.sheet}
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--esg-text)]">
          {page.label}
        </h1>
        {page.description ? (
          <p className="text-[12px] text-[var(--esg-text2)] mt-1">{page.description}</p>
        ) : null}
      </header>

      {page.scoreGroup ? (
        <div className="esg-glass p-4 flex flex-wrap items-center gap-4">
          <div>
            <div className="text-[36px] font-bold leading-none" style={{ color: accent }}>
              {formatNavBadge(subScore, page.scoreGroup.max)}
            </div>
            <div className="text-[11px] text-[var(--esg-text3)] mt-1">Subsection score</div>
          </div>
        </div>
      ) : null}

      {indicators.length > 0 && rows ? (
        <div className="esg-glass overflow-x-auto">
          <table className="w-full text-[11px] border-collapse min-w-[520px]">
            <thead>
              <tr className="text-[var(--esg-text3)] text-left border-b border-[var(--esg-glass-border)]">
                <th className="py-2 px-3">Indicator</th>
                <th className="py-2 px-2 text-right">Score</th>
                <th className="py-2 px-2 text-right">Max</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((ind) => (
                <tr key={ind.key} className="border-b border-[var(--esg-glass-border)]/50">
                  <td className="py-2 px-3 text-[var(--esg-text2)]">{ind.indicator}</td>
                  <td className="py-2 px-2 tabular-nums text-right font-medium">
                    {(rows[ind.key] ?? 0).toFixed(1)}
                  </td>
                  <td className="py-2 px-2 tabular-nums text-right">{ind.maxPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <EsgToolkitInlineEditor
        sectionKey={page.sectionKey}
        title={page.label}
        subtabId={page.subtabId}
        visibleSubtabs={page.visibleSubtabs}
      />
    </div>
  );
}
