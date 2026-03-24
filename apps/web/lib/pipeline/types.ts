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
  logs: PipelineLog[];
  createdAt: string;
}
