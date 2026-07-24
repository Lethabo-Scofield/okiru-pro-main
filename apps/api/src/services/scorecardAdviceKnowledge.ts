import type { ScorecardAdviceContext } from './scorecardAdviceContext.js';

export type ScorecardKnowledgeChunk = {
  id: string;
  title: string;
  summary: string;
  source: string;
  slideNumbers: number[];
  tags: string[];
  relatedRoutes: string[];
};

const TRAINING_PACK_SOURCE = 'Okiru B-BBEE Training Pack 2026';

const KNOWLEDGE_CHUNKS: ScorecardKnowledgeChunk[] = [
  {
    id: 'generic-scorecard-points',
    title: 'Generic Codes scorecard points',
    summary:
      'The Generic scorecard allocates points across Ownership (25), Management Control (19), Skills Development (20 plus 5 bonus), Preferential Procurement (27 plus 2 bonus), Supplier Development (10), Enterprise Development (5 plus 2 bonus), and Socio-Economic Development (5). Total available points are 111 plus 9 bonus points.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [22],
    tags: ['scorecard', 'generic', 'points', 'pillar', 'weighting'],
    relatedRoutes: ['/toolkit/scorecard'],
  },
  {
    id: 'recognition-levels',
    title: 'B-BBEE recognition levels',
    summary:
      'Recognition levels are tied to scorecard points: Level 1 is above 100 points with 135% recognition, Level 2 has 125%, Level 3 has 110%, Level 4 has 100%, Level 5 has 80%, Level 6 has 60%, Level 7 has 50%, Level 8 has 10%, and Non-Compliant is below 40 points with 0% recognition.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [23],
    tags: ['level', 'recognition', 'points', 'non-compliant'],
    relatedRoutes: ['/toolkit/scorecard-summary', '/toolkit/scorecard'],
  },
  {
    id: 'priority-elements-discounting',
    title: 'Priority elements and discounting',
    summary:
      'Priority element subminimums apply to Ownership net value, Skills Development, and Enterprise & Supplier Development categories. Large enterprises must meet the relevant 40% subminimums. Non-compliance results in the measured entity being discounted by one B-BBEE level for that verification period.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [25],
    tags: ['priority', 'subminimum', 'discounting', 'ownership', 'skills', 'esd', 'procurement'],
    relatedRoutes: ['/toolkit/scorecard', '/toolkit/pillars/ownership', '/toolkit/pillars/skills', '/toolkit/pillars/esd'],
  },
  {
    id: 'npat-target-rule',
    title: 'NPAT target rule',
    summary:
      'Where NPAT margin is less than 25% of the industry norm, element targets may become turnover-based. The most recent qualifying NPAT not older than five years should be used where available; otherwise the target can be based on 25% of the latest industry norm.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [24],
    tags: ['npat', 'financials', 'target', 'industry norm', 'turnover'],
    relatedRoutes: ['/toolkit/pillars/financials', '/toolkit/pillars/industry-norms'],
  },
  {
    id: 'company-size-definitions',
    title: 'Company size definitions',
    summary:
      'An Exempted Micro Enterprise (EME) has turnover from R0 to R10 million. A Qualifying Small Enterprise (QSE) has turnover from R10 million to R50 million. A Large Enterprise has turnover greater than R50 million.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [26, 27],
    tags: ['eme', 'qse', 'generic', 'large', 'turnover', 'company size'],
    relatedRoutes: ['/toolkit/pillars/financials'],
  },
  {
    id: 'procurement-esd-definitions',
    title: 'Procurement and ESD definitions',
    summary:
      'Preferential Procurement measures procurement of goods and services from suppliers that support preferential procurement targets. B-BBEE Procurement Spend is weighted using supplier B-BBEE credentials. Enterprise Development contributions are directed to EMEs or QSEs that are at least 51% Black-owned or at least 51% Black-women-owned.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [27],
    tags: ['procurement', 'tmps', 'esd', 'enterprise development', 'supplier development', 'supplier'],
    relatedRoutes: ['/toolkit/pillars/procurement', '/toolkit/pillars/esd'],
  },
  {
    id: 'management-control-evidence',
    title: 'Management Control evidence checklist',
    summary:
      'Management Control audit evidence can include EEA2 and EEA4 submissions, proof of submission, COR39, organogram, management representation letter, payroll reports, board and EXCO minutes, non-executive director declarations, employee payslips, employment contracts, certified ID copies, EEA1 forms and medical certificates for employees with disabilities.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [106],
    tags: ['management', 'employment equity', 'evidence', 'audit', 'eea2', 'eea4'],
    relatedRoutes: ['/toolkit/pillars/management'],
  },
  {
    id: 'ownership-scorecard',
    title: 'Ownership scorecard and net value',
    summary:
      'Ownership measures Black people’s equity, voting rights and economic interest. The scorecard includes voting rights, economic interest, designated groups or ownership schemes, Black new entrants and net value. Ownership has 25 points, and net value is a priority element with a 40% subminimum.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [108, 109, 110],
    tags: ['ownership', 'net value', 'voting rights', 'economic interest', 'black new entrant'],
    relatedRoutes: ['/toolkit/pillars/ownership'],
  },
  {
    id: 'ownership-evidence',
    title: 'Ownership evidence checklist',
    summary:
      'Ownership audit evidence can include share certificates, share register, shareholders agreements, voting rights confirmation, trust deeds, sale or subscription agreements, beneficiary records for trusts, shareholder ID copies, Black New Entrant confirmations, company valuations, and proof of outstanding acquisition debt or loan payments.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [119],
    tags: ['ownership', 'evidence', 'audit', 'share register', 'net value'],
    relatedRoutes: ['/toolkit/pillars/ownership'],
  },
  {
    id: 'yes-programme',
    title: 'YES programme rules and evidence',
    summary:
      'YES can support scorecard level improvement when qualification criteria are met, including priority-element requirements, YES target achievement and absorption thresholds. Evidence can include the YES registration certificate, proof of payment, CEO pledge, placement confirmation, prior B-BBEE certificate, financial statements, EEA reports, employee lists, payroll, certified IDs, workplace contracts, payslips and unemployment declarations.',
    source: TRAINING_PACK_SOURCE,
    slideNumbers: [123, 124, 125, 127, 128, 129],
    tags: ['yes', 'youth employment', 'absorption', 'evidence', 'bonus'],
    relatedRoutes: ['/toolkit/pillars/yes'],
  },
];

function normaliseText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function scoreChunk(chunk: ScorecardKnowledgeChunk, query: string, context: ScorecardAdviceContext): number {
  const haystack = normaliseText(`${chunk.title} ${chunk.summary} ${chunk.tags.join(' ')}`);
  const terms = new Set(normaliseText(query).split(/\s+/).filter((term) => term.length > 2));
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += chunk.tags.includes(term) ? 3 : 1;
  }

  const weakElements = context.elements.filter((element) =>
    element.subminimumMet === false ||
    (typeof element.actualPoints === 'number' && typeof element.targetPoints === 'number' && element.actualPoints < element.targetPoints)
  );
  for (const element of weakElements) {
    const key = normaliseText(element.name);
    if (chunk.tags.some((tag) => key.includes(normaliseText(tag)))) score += 2;
  }

  if (context.scorecard.discounted && chunk.tags.includes('discounting')) score += 4;
  return score;
}

export function getScorecardAdviceKnowledge(args: {
  message: string;
  context: ScorecardAdviceContext;
  limit?: number;
}): ScorecardKnowledgeChunk[] {
  const limit = Math.max(1, Math.min(args.limit ?? 5, 8));
  return KNOWLEDGE_CHUNKS
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, args.message, args.context) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.chunk);
}
