import { useMemo } from "react";
import { G_SCORECARD_INDICATORS } from "@/lib/esg/esgScorecardDefinitions";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import { scoreGovernance } from "../lib/calculators/governance";
import { useEsgStore } from "../lib/esgStore";
import { EsgScorecardPage } from "../components/EsgScorecardPage";

export default function EsgGovernance() {
  const workbook = useEsgStore((s) => s.workbook);
  // See EsgEnvironmental — the store holds the raw workbook, so derive before
  // scoring or this page disagrees with the Dashboard.
  const result = useMemo(
    () => (workbook ? scoreGovernance(deriveEsgSummaryCells(workbook)) : null),
    [workbook],
  );

  return (
    <EsgScorecardPage
      pillar="governance"
      title="Governance Scorecard"
      sheet="G_Scorecard"
      indicators={G_SCORECARD_INDICATORS}
      scores={result?.rows}
      totalScore={result?.score}
      maxScore={ESG_PILLAR_MAX.governance}
      accent="var(--esg-acc-g)"
    />
  );
}
