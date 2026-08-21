import { useMemo } from "react";
import { S_SCORECARD_INDICATORS } from "@/lib/esg/esgScorecardDefinitions";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import { scoreSocial } from "../lib/calculators/social";
import { useEsgStore } from "../lib/esgStore";
import { EsgScorecardPage } from "../components/EsgScorecardPage";

export default function EsgSocial() {
  const workbook = useEsgStore((s) => s.workbook);
  // See EsgEnvironmental — the store holds the raw workbook, so derive before
  // scoring or this page disagrees with the Dashboard.
  const result = useMemo(
    () => (workbook ? scoreSocial(deriveEsgSummaryCells(workbook)) : null),
    [workbook],
  );

  return (
    <EsgScorecardPage
      pillar="social"
      title="Social Scorecard"
      sheet="S_Scorecard"
      indicators={S_SCORECARD_INDICATORS}
      scores={result?.rows}
      totalScore={result?.score}
      maxScore={ESG_PILLAR_MAX.social}
      accent="var(--esg-acc-s)"
    />
  );
}
