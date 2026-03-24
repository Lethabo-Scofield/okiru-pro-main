import type { PipelineResult } from './types.js';

export interface ScorecardSummaryIndicator {
  name: string;
  target: string | number;
  weighting: number;
  score: number;
  formula: string;
}

export interface ScorecardSummaryElement {
  key: string;
  name: string;
  target: number;
  weighting: number;
  score: number;
  subMinimumMet?: boolean;
  subMinLabel?: string;
  subIndicators: ScorecardSummaryIndicator[];
}

export interface ScorecardSummary {
  clientName: string;
  sectorCode: string;
  scorecardType: string;
  overallScore: number;
  overallWeighting: number;
  achievedLevel: number;
  discountedLevel: number;
  isDiscounted: boolean;
  recognitionLevelPercent: number;
  subMinimumsMet: boolean;
  elements: ScorecardSummaryElement[];
  generatedAt: string;
}

/**
 * Transforms a PipelineResult into a structured ScorecardSummary format
 * suitable for the frontend presentation layer.
 */
export function generateScorecardSummary(
  pipelineResult: PipelineResult,
  maxPointsConfig?: Record<string, number>
): ScorecardSummary {
  const { scorecard, financials, ownership, managementControl, skillsDevelopment, preferentialProcurement, enterpriseSupplierDevelopment, socioEconomicDevelopment, yes } = pipelineResult;

  // Default max points if not explicitly provided (assumes generic)
  const maxPts = maxPointsConfig || {
    ownership: 25,
    managementControl: 19,
    skillsDevelopment: 20,
    preferentialProcurement: 27,
    enterpriseSupplierDevelopment: 15,
    socioEconomicDevelopment: 5,
    total: 111
  };

  const elements: ScorecardSummaryElement[] = [];

  // 1. Ownership
  elements.push({
    key: 'ownership',
    name: 'Ownership',
    target: maxPts.ownership,
    weighting: maxPts.ownership,
    score: scorecard.pillars.ownership,
    subMinimumMet: ownership.subMinimumMet,
    subMinLabel: ownership.subMinimumMet ? "Met Ownership Sub-minimum (Net Value)" : "Failed Ownership Sub-minimum",
    subIndicators: [
      {
        name: "Black Ownership (Voting Rights)",
        target: "25% + 1 Vote",
        weighting: 4,
        score: ownership.votingRightsBlack > 0 ? (ownership.votingRightsBlack >= 25.1 ? 4 : (ownership.votingRightsBlack / 25.1) * 4) : 0,
        formula: "Black Voting %"
      },
      {
        name: "Black Ownership (Economic Interest)",
        target: "25%",
        weighting: 4,
        score: ownership.economicInterestBlack > 0 ? (ownership.economicInterestBlack >= 25 ? 4 : (ownership.economicInterestBlack / 25) * 4) : 0,
        formula: "Black Economic %"
      },
      {
        name: "Net Value",
        target: "Realisation points",
        weighting: 8,
        score: ownership.subMinimumMet ? 8 : 0, // Simplified for summary presentation
        formula: "Net Value Formula"
      }
    ]
  });

  // 2. Management Control
  elements.push({
    key: 'managementControl',
    name: 'Management Control',
    target: maxPts.managementControl,
    weighting: maxPts.managementControl,
    score: scorecard.pillars.managementControl,
    subIndicators: [
      {
        name: "Board Participation (Black)",
        target: "50%",
        weighting: 2,
        score: managementControl.blackBoardPercent >= 50 ? 2 : (managementControl.blackBoardPercent / 50) * 2,
        formula: "Black Board %"
      },
      {
        name: "Executive Management (Black)",
        target: "60%",
        weighting: 2,
        score: managementControl.blackExecPercent >= 60 ? 2 : (managementControl.blackExecPercent / 60) * 2,
        formula: "Black Exec %"
      }
    ]
  });

  // 3. Skills Development
  elements.push({
    key: 'skillsDevelopment',
    name: 'Skills Development',
    target: maxPts.skillsDevelopment,
    weighting: maxPts.skillsDevelopment,
    score: scorecard.pillars.skillsDevelopment,
    subMinimumMet: skillsDevelopment.subMinimumMet,
    subMinLabel: "Must achieve 40% of total points",
    subIndicators: [
      {
        name: "Skills Development Spend on Black People",
        target: "6% of Leviable Amount",
        weighting: 8,
        score: skillsDevelopment.totalSpendBlack > 0 ? (skillsDevelopment.totalSpendBlack / (financials.leviableAmount * 0.06)) * 8 : 0,
        formula: "Black Spend / (Leviable * 6%) * 8"
      }
    ]
  });

  // 4. Preferential Procurement
  elements.push({
    key: 'procurement',
    name: 'Preferential Procurement',
    target: maxPts.preferentialProcurement,
    weighting: maxPts.preferentialProcurement,
    score: scorecard.pillars.preferentialProcurement,
    subMinimumMet: preferentialProcurement.subMinimumMet,
    subMinLabel: "Must achieve 40% of points",
    subIndicators: [
      {
        name: "B-BBEE Compliant Supplier Spend",
        target: "80% of TMPS",
        weighting: 5,
        score: preferentialProcurement.recognizedSpend > 0 ? (preferentialProcurement.recognizedSpend / (financials.tmps * 0.8)) * 5 : 0,
        formula: "Recognised Spend / (TMPS * 80%) * 5"
      }
    ]
  });

  // 5. Enterprise & Supplier Development
  elements.push({
    key: 'supplierDevelopment',
    name: 'Supplier Development',
    target: maxPts.enterpriseSupplierDevelopment > 5 ? 10 : 0,
    weighting: maxPts.enterpriseSupplierDevelopment > 5 ? 10 : 0,
    score: scorecard.pillars.enterpriseSupplierDevelopment > 5 ? (scorecard.pillars.enterpriseSupplierDevelopment / 15) * 10 : 0, // Approx split
    subIndicators: [
      {
        name: "Supplier Development Contributions",
        target: "2% of NPAT",
        weighting: 10,
        score: scorecard.pillars.enterpriseSupplierDevelopment > 5 ? (scorecard.pillars.enterpriseSupplierDevelopment / 15) * 10 : 0,
        formula: "Contributions / (NPAT * 2%) * 10"
      }
    ]
  });
  
  elements.push({
    key: 'enterpriseDevelopment',
    name: 'Enterprise Development',
    target: maxPts.enterpriseSupplierDevelopment > 5 ? 5 : maxPts.enterpriseSupplierDevelopment,
    weighting: maxPts.enterpriseSupplierDevelopment > 5 ? 5 : maxPts.enterpriseSupplierDevelopment,
    score: scorecard.pillars.enterpriseSupplierDevelopment > 5 ? (scorecard.pillars.enterpriseSupplierDevelopment / 15) * 5 : scorecard.pillars.enterpriseSupplierDevelopment,
    subIndicators: [
      {
        name: "Enterprise Development Contributions",
        target: "1% of NPAT",
        weighting: 5,
        score: scorecard.pillars.enterpriseSupplierDevelopment > 5 ? (scorecard.pillars.enterpriseSupplierDevelopment / 15) * 5 : scorecard.pillars.enterpriseSupplierDevelopment,
        formula: "Contributions / (NPAT * 1%) * 5"
      }
    ]
  });

  // 6. Socio-Economic Development
  elements.push({
    key: 'socioEconomicDevelopment',
    name: 'Socio-Economic Development',
    target: maxPts.socioEconomicDevelopment,
    weighting: maxPts.socioEconomicDevelopment,
    score: scorecard.pillars.socioEconomicDevelopment,
    subIndicators: [
      {
        name: "SED Contributions",
        target: "1% of NPAT",
        weighting: 5,
        score: scorecard.pillars.socioEconomicDevelopment,
        formula: "Contributions / (NPAT * 1%) * 5"
      }
    ]
  });

  // Parse level string to number (e.g. "Level 4" -> 4)
  const extractLevel = (lvlStr: string) => {
    if (lvlStr.toUpperCase().includes('NON-COMPLIANT')) return 9;
    const match = lvlStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : 9;
  };

  return {
    clientName: pipelineResult.client.name,
    sectorCode: pipelineResult.client.industrySector || 'Generic',
    scorecardType: pipelineResult.client.applicableScorecard || 'Generic',
    overallScore: scorecard.pillars.totalPoints,
    overallWeighting: maxPts.total,
    achievedLevel: extractLevel(scorecard.beeLevel),
    discountedLevel: extractLevel(scorecard.discountedLevel),
    isDiscounted: scorecard.isDiscounted,
    recognitionLevelPercent: scorecard.recognitionLevelPercent,
    subMinimumsMet: scorecard.subMinimumsMet,
    elements,
    generatedAt: new Date().toISOString()
  };
}
