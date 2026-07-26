import { chatCompletion, isAzureOpenAIConfigured } from '../../pipeline/extraction/azureOpenAIClient.js';
import { createLogger } from '../logger.js';
import type { ScorecardAdviceContext, ScorecardAdviceSource } from './scorecardAdviceContext.js';
import { getScorecardAdviceKnowledge, type ScorecardKnowledgeChunk } from './scorecardAdviceKnowledge.js';

const logger = createLogger('ScorecardAdviceChat');

export type ScorecardAdviceChatResult = {
  answer: string;
  sources: ScorecardAdviceSource[];
  suggestedQuestions: string[];
  warnings: string[];
  tables: ScorecardAdviceTable[];
  actions: ScorecardAdviceAction[];
};

export type ScorecardAdviceTable = {
  title?: string;
  columns: string[];
  rows: string[][];
};

export type ScorecardAdviceAction = {
  label: string;
  route: string;
  reason?: string;
};

const ALLOWED_ACTION_ROUTES = new Map<string, string>([
  ['/toolkit', 'Dashboard'],
  ['/toolkit/scorecard', 'Scorecard'],
  ['/toolkit/scorecard-summary', 'Scorecard Summary'],
  ['/toolkit/pillars/ownership', 'Ownership'],
  ['/toolkit/pillars/management', 'Management Control'],
  ['/toolkit/pillars/skills', 'Skills Development'],
  ['/toolkit/pillars/procurement', 'Procurement'],
  ['/toolkit/pillars/esd', 'Enterprise & Supplier Development'],
  ['/toolkit/pillars/sed', 'Socio-Economic Development'],
  ['/toolkit/pillars/financials', 'Financials'],
  ['/toolkit/pillars/industry-norms', 'Industry Norms'],
  ['/toolkit/scenarios', 'Scenarios'],
  ['/toolkit/reports', 'Reports'],
]);

const SYSTEM_PROMPT = `You are Okiru's B-BBEE Scorecard Advisor.

You help users understand and improve their organisation's current B-BBEE scorecard.

Use only the authorised organisation context, scorecard calculations, uploaded evidence summaries and approved B-BBEE knowledge supplied in the request.

Your responsibilities are to:
1. Explain the organisation's current B-BBEE level and total points.
2. Explain why each pillar received its current score.
3. Identify priority-element failures and discounting.
4. Identify missing, incomplete, invalid or expired evidence.
5. Explain calculations in clear language.
6. Suggest realistic actions that may improve the score.
7. Prioritise recommendations by likely impact, urgency and evidence readiness.
8. Clearly distinguish current facts from projections and hypothetical scenarios.
9. State when the available data is insufficient.
10. Avoid guaranteeing a specific B-BBEE level or verification result.

Rules:
- Never invent scorecard values.
- Never invent legislation, evidence or calculations.
- Never expose another organisation's information.
- Never treat a projected score as an achieved score.
- Never present general guidance as formal legal or verification advice.
- When calculations are available, reference the relevant pillar and values.
- When data is missing, explain exactly what is missing.
- Keep answers practical, clear and specific to the organisation.
- If a comparison, point breakdown, missing-evidence list or prioritised recommendation would be clearer as a table, include a compact table.
- If the user should inspect or edit a specific toolkit area, include a safe action using only one of these routes:
  /toolkit
  /toolkit/scorecard
  /toolkit/scorecard-summary
  /toolkit/pillars/ownership
  /toolkit/pillars/management
  /toolkit/pillars/skills
  /toolkit/pillars/procurement
  /toolkit/pillars/esd
  /toolkit/pillars/sed
  /toolkit/pillars/financials
  /toolkit/pillars/industry-norms
  /toolkit/scenarios
  /toolkit/reports

Return only JSON with:
{
  "answer": "string",
  "sourceIds": ["scorecard_element id, scorecard id, or approved knowledge id"],
  "tables": [
    { "title": "string", "columns": ["string"], "rows": [["string"]] }
  ],
  "actions": [
    { "label": "string", "route": "/toolkit/...", "reason": "string" }
  ],
  "suggestedQuestions": ["string"],
  "warnings": ["string"]
}`;

const DEFAULT_SUGGESTIONS = [
  'How many points are needed for the next level?',
  'Which evidence is missing?',
  'What should we prioritise before verification?',
];

export function isPromptInjectionAttempt(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    'ignore previous instructions',
    'ignore the system',
    'show your system prompt',
    'reveal hidden instructions',
    'another organisation',
    'other organization',
    'other tenant',
    'bypass tenant',
    'api key',
    'secret key',
  ].some((needle) => lower.includes(needle));
}

export function validateAdviceMessage(message: unknown): string {
  if (typeof message !== 'string') {
    throw Object.assign(new Error('Message must be a string'), { status: 400 });
  }
  const clean = message.trim();
  if (!clean) {
    throw Object.assign(new Error('Message is required'), { status: 400 });
  }
  if (clean.length > 2000) {
    throw Object.assign(new Error('Message is too long'), { status: 400 });
  }
  if (isPromptInjectionAttempt(clean)) {
    throw Object.assign(new Error('This request cannot be answered because it attempts to override assistant safety or tenant isolation rules.'), { status: 400 });
  }
  return clean;
}

function compactContext(context: ScorecardAdviceContext): string {
  return JSON.stringify({
    toolkitId: context.toolkitId,
    organisation: context.organisation,
    scorecard: context.scorecard,
    elements: context.elements.map((element) => ({
      id: element.id,
      name: element.name,
      targetPoints: element.targetPoints,
      actualPoints: element.actualPoints,
      projectedPoints: element.projectedPoints,
      subminimumRequired: element.subminimumRequired,
      subminimumMet: element.subminimumMet,
      gaps: element.gaps,
      missingEvidence: element.missingEvidence,
      risks: element.risks,
      recommendations: element.recommendations,
    })),
    scenarios: context.scenarios,
    sources: context.sources,
  });
}

function compactKnowledge(chunks: ScorecardKnowledgeChunk[]): string {
  return JSON.stringify(chunks.map((chunk) => ({
    id: chunk.id,
    title: chunk.title,
    summary: chunk.summary,
    source: chunk.source,
    slideNumbers: chunk.slideNumbers,
    relatedRoutes: chunk.relatedRoutes,
  })));
}

function parseModelResponse(raw: string, context: ScorecardAdviceContext, knowledge: ScorecardKnowledgeChunk[]): ScorecardAdviceChatResult {
  try {
    const parsed = JSON.parse(raw) as {
      answer?: unknown;
      sourceIds?: unknown;
      suggestedQuestions?: unknown;
      warnings?: unknown;
      tables?: unknown;
      actions?: unknown;
    };
    const sourceIds = Array.isArray(parsed.sourceIds)
      ? parsed.sourceIds.filter((id): id is string => typeof id === 'string')
      : [];
    const sources = sourceIds.length
      ? context.sources.filter((source) => sourceIds.includes(source.id))
      : context.sources.slice(0, 4);
    const knowledgeSources = knowledge
      .filter((chunk) => sourceIds.includes(chunk.id))
      .map((chunk): ScorecardAdviceSource => ({
        type: 'evidence',
        id: chunk.id,
        label: `${chunk.source}: ${chunk.title} (slides ${chunk.slideNumbers.join(', ')})`,
      }));
    return {
      answer: typeof parsed.answer === 'string' && parsed.answer.trim()
        ? parsed.answer.trim()
        : 'I could not generate a reliable answer from the available scorecard context.',
      sources: [...sources, ...knowledgeSources].slice(0, 6),
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
        ? parsed.suggestedQuestions.filter((q): q is string => typeof q === 'string').slice(0, 4)
        : DEFAULT_SUGGESTIONS,
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.filter((w): w is string => typeof w === 'string').slice(0, 4)
        : [],
      tables: sanitizeTables(parsed.tables),
      actions: sanitizeActions(parsed.actions),
    };
  } catch (error) {
    logger.warn('Invalid scorecard advice model output', { error: error instanceof Error ? error.message : String(error) });
    return {
      answer: raw.trim() || 'I could not generate a reliable answer from the available scorecard context.',
      sources: [
        ...context.sources.slice(0, 4),
        ...knowledge.slice(0, 2).map((chunk): ScorecardAdviceSource => ({
          type: 'evidence',
          id: chunk.id,
          label: `${chunk.source}: ${chunk.title} (slides ${chunk.slideNumbers.join(', ')})`,
        })),
      ],
      suggestedQuestions: DEFAULT_SUGGESTIONS,
      warnings: ['The model returned an unstructured response; sources were attached from the authorised scorecard context.'],
      tables: [],
      actions: [],
    };
  }
}

function cleanText(value: unknown, max = 160): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeTables(raw: unknown): ScorecardAdviceTable[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 2).flatMap((table): ScorecardAdviceTable[] => {
    if (!table || typeof table !== 'object') return [];
    const columns = Array.isArray((table as any).columns)
      ? (table as any).columns.map((value: unknown) => cleanText(value, 50)).filter(Boolean).slice(0, 5)
      : [];
    const rows = Array.isArray((table as any).rows)
      ? (table as any).rows.map((row: unknown) => {
        const cells = Array.isArray(row) ? row : [];
        return columns.map((_, index) => cleanText(cells[index], 80));
      }).filter((row: string[]) => row.some(Boolean)).slice(0, 8)
      : [];
    if (columns.length === 0 || rows.length === 0) return [];
    return [{
      title: cleanText((table as any).title, 80) || undefined,
      columns,
      rows,
    }];
  });
}

function sanitizeActions(raw: unknown): ScorecardAdviceAction[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((action): ScorecardAdviceAction[] => {
    if (!action || typeof action !== 'object') return [];
    const route = cleanText((action as any).route, 80);
    if (!ALLOWED_ACTION_ROUTES.has(route) || seen.has(route)) return [];
    seen.add(route);
    return [{
      label: cleanText((action as any).label, 50) || `Open ${ALLOWED_ACTION_ROUTES.get(route)}`,
      route,
      reason: cleanText((action as any).reason, 100) || undefined,
    }];
  }).slice(0, 3);
}

export async function runScorecardAdviceChat(args: {
  message: string;
  context: ScorecardAdviceContext;
}): Promise<ScorecardAdviceChatResult> {
  if (!isAzureOpenAIConfigured()) {
    throw Object.assign(new Error('Azure OpenAI is not configured for scorecard advice.'), { status: 503 });
  }

  const knowledge = getScorecardAdviceKnowledge({
    message: args.message,
    context: args.context,
    limit: 5,
  });

  const userPrompt = `Authorised scorecard context:
${compactContext(args.context)}

Approved B-BBEE knowledge:
${compactKnowledge(knowledge)}

User question:
${args.message}

Answer using only the authorised scorecard context and approved B-BBEE knowledge. If a value is unavailable, say it is unavailable. If you use approved knowledge, include its knowledge id in sourceIds.`;

  const raw = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.2, maxTokens: 900, responseFormat: { type: 'json_object' } },
  );

  return parseModelResponse(raw, args.context, knowledge);
}
