import { useMemo } from "react";
import { G_SCORECARD_INDICATORS } from "@/lib/esg/esgScorecardDefinitions";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import { scoreGovernance } from "../lib/calculators/governance";
import { useEsgStore } from "../lib/esgStore";
import { EsgScorecardPage } from "../components/EsgScorecardPage";

export default function EsgGovernance() {
  const workbook = useEsgStore((s) => s.workbook);
  const result = useMemo(() => (workbook ? scoreGovernance(workbook) : null), [workbook]);

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
