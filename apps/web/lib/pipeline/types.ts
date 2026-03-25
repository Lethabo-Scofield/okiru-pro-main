export interface PipelineLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface PillarScore {
  pillar: string;
  weightedScore: number;
  maxScore: number;
  subItems: Array<{
    indicator: string;
    value: number;
    target: number;
    score: number;
    maxScore: number;
  }>;
}

export interface ScorecardPillarScores {
  ownership: number;
  managementControl: number;
  employmentEquity: number;
  skillsDevelopment: number;
  preferentialProcurement: number;
  enterpriseSupplierDevelopment: number;
  socioEconomicDevelopment: number;
  yesInitiative: number;
  totalPoints: number;
}

export interface ScorecardSummary {
  beeLevel: string;
  recognitionLevelPercent: number;
  subMinimumsMet: boolean;
  isDiscounted: boolean;
  discountedLevel: string;
  pillars: ScorecardPillarScores;
}

export interface PipelineResult {
  filename: string;
  client: {
    name: string;
    industrySector: string;
    applicableScorecard: string;
  };
  totalScore: number;
  level: string;
  pillars: PillarScore[];
  scorecard?: ScorecardSummary;
  logs: PipelineLog[];
  createdAt: string;
}
