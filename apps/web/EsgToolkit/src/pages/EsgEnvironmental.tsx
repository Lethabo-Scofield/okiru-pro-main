import { useMemo } from "react";
import {
  E_SCORECARD_INDICATORS,
} from "@/lib/esg/esgScorecardDefinitions";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import { scoreEnvironmental } from "../lib/calculators/environmental";
import { useEsgStore } from "../lib/esgStore";
import { EsgScorecardPage } from "../components/EsgScorecardPage";

export default function EsgEnvironmental() {
  const workbook = useEsgStore((s) => s.workbook);
  // The store holds the RAW workbook; `computeEsgScorecard` derives the summary
  // cells before scoring. Deriving here too keeps this page identical to the
  // Dashboard — without it a manually-entered workbook scores lower here.
  const result = useMemo(
    () => (workbook ? scoreEnvironmental(deriveEsgSummaryCells(workbook)) : null),
    [workbook],
  );

  return (
    <EsgScorecardPage
      pillar="environmental"
      title="Environmental Scorecard"
      sheet="E_Scorecard"
      indicators={E_SCORECARD_INDICATORS}
      scores={result?.rows}
      totalScore={result?.score}
      maxScore={ESG_PILLAR_MAX.environmental}
      accent="var(--esg-acc-e)"
    />
  );
}
