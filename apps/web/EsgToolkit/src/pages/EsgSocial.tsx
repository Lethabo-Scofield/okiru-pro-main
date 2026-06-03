import { useMemo } from "react";
import { S_SCORECARD_INDICATORS } from "@/lib/esg/esgScorecardDefinitions";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import { scoreSocial } from "../lib/calculators/social";
import { useEsgStore } from "../lib/esgStore";
import { EsgScorecardPage } from "../components/EsgScorecardPage";

export default function EsgSocial() {
  const workbook = useEsgStore((s) => s.workbook);
  const result = useMemo(() => (workbook ? scoreSocial(workbook) : null), [workbook]);

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
