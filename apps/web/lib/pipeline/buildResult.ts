import type { PipelineResult, PillarScore } from './types';
import type { ParseResult } from './extraction/entityToParseResult';

function calculateOwnershipScore(data: Record<string, any>): PillarScore {
  const items = [
    { indicator: 'Black Voting Rights', key: 'black_voting_rights', target: 25, maxScore: 4 },
    { indicator: 'Black Economic Interest', key: 'black_economic_interest', target: 25, maxScore: 4 },
    { indicator: 'Black Women Voting Rights', key: 'black_women_voting_rights', target: 10, maxScore: 2 },
  ];

  const subItems = items.map(item => {
    const value = parseFloat(data[item.key]) || 0;
    const ratio = Math.min(value / item.target, 1);
    const score = Math.round(ratio * item.maxScore * 100) / 100;
    return { indicator: item.indicator, value, target: item.target, score, maxScore: item.maxScore };
  });

  return {
    pillar: 'Ownership',
    weightedScore: subItems.reduce((sum, s) => sum + s.score, 0),
    maxScore: subItems.reduce((sum, s) => sum + s.maxScore, 0),
    subItems,
  };
}

function calculateManagementScore(data: Record<string, any>): PillarScore {
  const items = [
    { indicator: 'Black Board Members', key: 'black_board_members', target: 50, maxScore: 4 },
    { indicator: 'Black Executive Directors', key: 'black_executive_directors', target: 50, maxScore: 4 },
  ];

  const subItems = items.map(item => {
    const value = parseFloat(data[item.key]) || 0;
    const ratio = Math.min(value / item.target, 1);
    const score = Math.round(ratio * item.maxScore * 100) / 100;
    return { indicator: item.indicator, value, target: item.target, score, maxScore: item.maxScore };
  });

  return {
    pillar: 'Management Control',
    weightedScore: subItems.reduce((sum, s) => sum + s.score, 0),
    maxScore: subItems.reduce((sum, s) => sum + s.maxScore, 0),
    subItems,
  };
}

function calculateSkillsScore(data: Record<string, any>): PillarScore {
  const value = parseFloat(data['skills_development_spend']) || 0;
  const target = 6;
  const maxScore = 20;
  const ratio = Math.min(value / target, 1);
  const score = Math.round(ratio * maxScore * 100) / 100;

  return {
    pillar: 'Skills Development',
    weightedScore: score,
    maxScore,
    subItems: [{ indicator: 'Skills Development Spend', value, target, score, maxScore }],
  };
}

function calculateESDScore(data: Record<string, any>): PillarScore {
  const subItems = [
    {
      indicator: 'Preferential Procurement',
      value: parseFloat(data['preferential_procurement_spend']) || 0,
      target: 80,
      score: 0,
      maxScore: 5,
    },
    {
      indicator: 'Supplier Development',
      value: parseFloat(data['supplier_development_contributions']) || 0,
      target: 2,
      score: 0,
      maxScore: 5,
    },
  ].map(item => ({
    ...item,
    score: Math.round(Math.min(item.value > 0 ? 1 : 0, 1) * item.maxScore * 100) / 100,
  }));

  return {
    pillar: 'Enterprise & Supplier Development',
    weightedScore: subItems.reduce((sum, s) => sum + s.score, 0),
    maxScore: subItems.reduce((sum, s) => sum + s.maxScore, 0),
    subItems,
  };
}

function calculateSEDScore(data: Record<string, any>): PillarScore {
  const value = parseFloat(data['socio_economic_spend']) || 0;
  const maxScore = 5;
  const score = value > 0 ? maxScore : 0;

  return {
    pillar: 'Socio-Economic Development',
    weightedScore: score,
    maxScore,
    subItems: [{ indicator: 'SED Contributions', value, target: 1, score, maxScore }],
  };
}

function determineLevel(totalScore: number): string {
  if (totalScore >= 100) return 'Level 1';
  if (totalScore >= 95) return 'Level 2';
  if (totalScore >= 90) return 'Level 3';
  if (totalScore >= 80) return 'Level 4';
  if (totalScore >= 75) return 'Level 5';
  if (totalScore >= 65) return 'Level 6';
  if (totalScore >= 55) return 'Level 7';
  if (totalScore >= 40) return 'Level 8';
  return 'Non-Compliant';
}

export function buildPipelineResult(parseResult: ParseResult, filename: string): PipelineResult {
  const data = parseResult.extractedData;

  const pillars = [
    calculateOwnershipScore(data),
    calculateManagementScore(data),
    calculateSkillsScore(data),
    calculateESDScore(data),
    calculateSEDScore(data),
  ];

  const totalScore = Math.round(pillars.reduce((sum, p) => sum + p.weightedScore, 0) * 100) / 100;
  const level = determineLevel(totalScore);

  return {
    filename,
    client: parseResult.client,
    totalScore,
    level,
    pillars,
    logs: [
      { timestamp: new Date().toISOString(), level: 'info', message: `Scored ${filename}: ${totalScore} points → ${level}` },
    ],
    createdAt: new Date().toISOString(),
  };
}
