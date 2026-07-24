import {
  ClientModel,
  OrganizationModel,
  ProcessorSessionModel,
  ScenarioModel,
  SessionBlobModel,
} from '../../models.js';

export type ScorecardAdviceSource = {
  type: 'scorecard' | 'scorecard_element' | 'organisation' | 'evidence' | 'scenario';
  id: string;
  label: string;
};

export type ScorecardAdviceElement = {
  id: string;
  name: string;
  targetPoints?: number;
  actualPoints?: number;
  projectedPoints?: number;
  subminimumRequired?: number;
  subminimumMet?: boolean;
  gaps: string[];
  missingEvidence: string[];
  risks: string[];
  recommendations: string[];
};

export type ScorecardAdviceContext = {
  toolkitId: 'bbbee';
  organisation: {
    id: string;
    name: string;
    sector?: string;
    scorecardType?: string;
    financialYear?: string;
    revenue?: number;
    npat?: number;
    leviableAmount?: number;
    headcount?: number;
    requiredLevel?: string;
  };
  scorecard: {
    id: string;
    currentLevel?: string;
    levelBeforeDiscounting?: string;
    totalPoints?: number;
    recognitionPercentage?: string;
    discounted?: boolean;
    discountReason?: string;
    nextLevel?: string;
    pointsToNextLevel?: number;
    source: 'persisted_session' | 'persisted_client' | 'authorised_runtime_snapshot' | 'partial_platform_data';
  };
  elements: ScorecardAdviceElement[];
  scenarios: Array<{
    name: string;
    projectedLevel?: string;
    projectedPoints?: number;
    estimatedInvestment?: number;
    assumptions: string[];
    actions: string[];
  }>;
  sources: ScorecardAdviceSource[];
};

export type RuntimeScorecardSnapshot = {
  scorecard?: unknown;
  client?: unknown;
  missingEvidence?: Record<string, string[]>;
};

type SessionLike = {
  sessionId?: string;
  organizationId?: string | null;
  createdByUserId?: string | null;
  companyInfo?: Record<string, unknown>;
  foundationData?: any;
  pillarData?: any;
  scorecardResult?: any;
};

type ClientLike = {
  id?: string;
  clientId?: string | null;
  organizationId?: string | null;
  createdByUserId?: string | null;
  name?: string;
  sectorCode?: string;
  scorecardType?: string;
  financialYear?: string;
  revenue?: number;
  npat?: number;
  leviableAmount?: number;
  numberOfEmployees?: number;
  annualTurnover?: number;
  companySize?: string;
  financials?: any;
};

const LEVEL_THRESHOLDS = [
  { level: 1, min: 100 },
  { level: 2, min: 95 },
  { level: 3, min: 90 },
  { level: 4, min: 80 },
  { level: 5, min: 75 },
  { level: 6, min: 70 },
  { level: 7, min: 55 },
  { level: 8, min: 40 },
];

const PILLARS: Array<{ id: string; name: string; key: string; subminimumRequired?: number }> = [
  { id: 'ownership', name: 'Ownership', key: 'ownership', subminimumRequired: 10 },
  { id: 'management-control', name: 'Management Control & Employment Equity', key: 'managementControl' },
  { id: 'skills-development', name: 'Skills Development', key: 'skillsDevelopment', subminimumRequired: 10 },
  { id: 'preferential-procurement', name: 'Preferential Procurement', key: 'procurement' },
  { id: 'supplier-development', name: 'Supplier Development', key: 'supplierDevelopment', subminimumRequired: 4 },
  { id: 'enterprise-development', name: 'Enterprise Development', key: 'enterpriseDevelopment', subminimumRequired: 2 },
  { id: 'socioeconomic-development', name: 'Socio-Economic Development', key: 'socioEconomicDevelopment' },
  { id: 'yes-initiative', name: 'YES Initiative', key: 'yesInitiative' },
  { id: 'access-to-financial-services', name: 'Access to Financial Services', key: 'accessToFinancialServices' },
  { id: 'empowerment-financing', name: 'Empowerment Financing', key: 'empowermentFinancing' },
];

function routeId(raw: string): string {
  return raw.replace(/^(session-|upload-|build-)/, '').replace(/^sess-/, '');
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function levelLabel(level: unknown): string | undefined {
  const n = num(level);
  if (n === undefined) return str(level);
  return n >= 9 ? 'Non-Compliant' : `Level ${n}`;
}

function recognitionPercent(raw: unknown): string | undefined {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const n = num(raw);
  return n === undefined ? undefined : `${n}%`;
}

function nextLevelInfo(totalPoints?: number, currentLevel?: unknown) {
  if (totalPoints === undefined) return {};
  const current = num(currentLevel);
  const better = LEVEL_THRESHOLDS
    .filter((t) => current === undefined || t.level < current)
    .reverse()
    .find((t) => totalPoints < t.min);
  if (!better) return {};
  return {
    nextLevel: `Level ${better.level}`,
    pointsToNextLevel: Math.max(0, Math.round((better.min - totalPoints) * 100) / 100),
  };
}

function normaliseScorecard(raw: any) {
  const source = raw?.scorecard ?? raw ?? {};
  return source && typeof source === 'object' ? source : {};
}

function buildElement(rawScorecard: any, pillarData: any, runtimeMissing: Record<string, string[]> = {}): ScorecardAdviceElement[] {
  const scorecard = normaliseScorecard(rawScorecard);
  return PILLARS.map((p) => {
    const data = scorecard[p.key] ?? {};
    const actualPoints = num(data.score ?? data.actualPoints);
    const targetPoints = num(data.weighting ?? data.target ?? data.targetPoints);
    const subminimumMet = typeof data.subMinimumMet === 'boolean' ? data.subMinimumMet : undefined;
    const gap = targetPoints !== undefined && actualPoints !== undefined
      ? Math.max(0, Math.round((targetPoints - actualPoints) * 100) / 100)
      : undefined;
    const missingEvidence = [...(runtimeMissing[p.key] ?? [])];
    if (!hasPillarEvidence(p.key, pillarData) && missingEvidence.length === 0) {
      missingEvidence.push(defaultMissingEvidence(p.key));
    }
    const risks: string[] = [];
    if (subminimumMet === false) risks.push('Priority-element subminimum not met.');
    if (gap && gap > 0) risks.push(`${gap} point gap against available target/weighting.`);
    return {
      id: p.id,
      name: p.name,
      targetPoints,
      actualPoints,
      subminimumRequired: p.subminimumRequired,
      subminimumMet,
      gaps: gap && gap > 0 ? [`${gap} points below the current pillar weighting.`] : [],
      missingEvidence,
      risks,
      recommendations: recommendationForPillar(p.key, gap),
    };
  }).filter((p) => p.actualPoints !== undefined || p.targetPoints !== undefined || p.missingEvidence.length > 0);
}

function hasPillarEvidence(key: string, pillarData: any): boolean {
  if (!pillarData || typeof pillarData !== 'object') return false;
  if (key === 'ownership') return Array.isArray(pillarData.ownership?.shareholders) && pillarData.ownership.shareholders.length > 0;
  if (key === 'managementControl') return Array.isArray(pillarData.management?.employees) && pillarData.management.employees.length > 0;
  if (key === 'skillsDevelopment') return Array.isArray(pillarData.skills?.trainingPrograms) && pillarData.skills.trainingPrograms.length > 0;
  if (key === 'procurement') return Array.isArray(pillarData.procurement?.suppliers) && pillarData.procurement.suppliers.length > 0;
  if (key === 'supplierDevelopment' || key === 'enterpriseDevelopment') return Array.isArray(pillarData.esd?.contributions) && pillarData.esd.contributions.length > 0;
  if (key === 'socioEconomicDevelopment') return Array.isArray(pillarData.sed?.contributions) && pillarData.sed.contributions.length > 0;
  return true;
}

function defaultMissingEvidence(key: string): string {
  const labels: Record<string, string> = {
    ownership: 'Ownership confirmation or shareholder evidence not found in the current scorecard data.',
    managementControl: 'Employee/management control evidence not found in the current scorecard data.',
    skillsDevelopment: 'Skills development training evidence not found in the current scorecard data.',
    procurement: 'Supplier spend schedule and supplier certificates not found in the current scorecard data.',
    supplierDevelopment: 'Supplier development contribution evidence not found in the current scorecard data.',
    enterpriseDevelopment: 'Enterprise development contribution evidence not found in the current scorecard data.',
    socioEconomicDevelopment: 'Socio-economic development contribution evidence not found in the current scorecard data.',
  };
  return labels[key] ?? 'Evidence not found in the current scorecard data.';
}

function recommendationForPillar(key: string, gap?: number): string[] {
  if (!gap || gap <= 0) return [];
  const labels: Record<string, string> = {
    ownership: 'Review ownership recognition and net value evidence before verification.',
    managementControl: 'Check management control demographics, employment equity evidence, and active employee data.',
    skillsDevelopment: 'Prioritise eligible learning programmes, spend evidence, and absorption records.',
    procurement: 'Improve verified compliant supplier spend and update expired supplier certificates.',
    supplierDevelopment: 'Confirm qualifying supplier development contributions and beneficiary evidence.',
    enterpriseDevelopment: 'Confirm qualifying enterprise development contributions and beneficiary evidence.',
    socioEconomicDevelopment: 'Confirm qualifying SED contributions and beneficiary evidence.',
  };
  return [labels[key] ?? 'Review the inputs and evidence for this scorecard pillar.'];
}

async function loadSessionWithBlobs(sessionId: string): Promise<SessionLike | null> {
  const doc = await ProcessorSessionModel.findOne({ sessionId }).lean() as SessionLike | null;
  if (!doc) return null;
  const blobs = await SessionBlobModel.find({ sessionId }).lean() as Array<{ field: string; data: unknown }>;
  const merged: SessionLike = { ...doc };
  for (const blob of blobs) {
    (merged as any)[blob.field] = blob.data;
  }
  return merged;
}

function canAccess(ownerId: string | null | undefined, orgId: string | null | undefined, userId: string, userOrgId?: string | null): boolean {
  if (ownerId && ownerId === userId) return true;
  return !!orgId && !!userOrgId && orgId === userOrgId;
}

function buildSources(elements: ScorecardAdviceElement[], scorecardId: string): ScorecardAdviceSource[] {
  return [
    { type: 'scorecard', id: scorecardId, label: 'Current B-BBEE scorecard' },
    ...elements.map((e) => ({ type: 'scorecard_element' as const, id: e.id, label: e.name })),
  ];
}

function contextFromRuntime(runtime?: RuntimeScorecardSnapshot): any | null {
  const raw = runtime?.scorecard;
  return raw && typeof raw === 'object' ? raw : null;
}

export async function buildScorecardAdviceContext(args: {
  scorecardId: string;
  userId: string;
  organizationId?: string | null;
  runtimeSnapshot?: RuntimeScorecardSnapshot;
}): Promise<ScorecardAdviceContext | null> {
  const cleanId = routeId(args.scorecardId);
  const runtimeScorecard = contextFromRuntime(args.runtimeSnapshot);

  const session = await loadSessionWithBlobs(cleanId);
  if (session) {
    if (!canAccess(session.createdByUserId, session.organizationId, args.userId, args.organizationId)) return null;
    const foundation = session.foundationData ?? {};
    const clientInfo = foundation.clientInfo ?? {};
    const financials = foundation.financials ?? {};
    const companyInfo = session.companyInfo ?? {};
    const org = session.organizationId
      ? await OrganizationModel.findOne({ id: session.organizationId }).lean() as { name?: string } | null
      : null;
    const chosenScorecard = session.scorecardResult ?? runtimeScorecard ?? {};
    const scorecard = normaliseScorecard(chosenScorecard);
    const totalPoints = num(scorecard.total?.score ?? scorecard.totalPoints);
    const achieved = scorecard.achievedLevel ?? scorecard.beeLevel;
    const discounted = scorecard.discountedLevel;
    const elements = buildElement(scorecard, session.pillarData, args.runtimeSnapshot?.missingEvidence);
    return {
      toolkitId: 'bbbee',
      organisation: {
        id: session.organizationId || 'personal',
        name: org?.name || str(companyInfo.name) || str(clientInfo.companyName) || 'Organisation',
        sector: str(clientInfo.sectorCode) || str(companyInfo.sector),
        scorecardType: str(clientInfo.scorecardType) || str(clientInfo.companySize),
        financialYear: str(clientInfo.financialYearEnd),
        revenue: num(financials.totalRevenue ?? clientInfo.annualTurnover),
        npat: num(financials.npat),
        leviableAmount: num(financials.leviableAmount),
        headcount: num(clientInfo.numberOfEmployees ?? companyInfo.employees),
      },
      scorecard: {
        id: args.scorecardId,
        currentLevel: levelLabel(scorecard.isDiscounted ? discounted : achieved),
        levelBeforeDiscounting: levelLabel(achieved),
        totalPoints,
        recognitionPercentage: recognitionPercent(scorecard.recognitionLevel ?? scorecard.recognitionPercentage),
        discounted: Boolean(scorecard.isDiscounted),
        discountReason: scorecard.isDiscounted ? 'One or more priority-element subminimums were not met.' : undefined,
        ...nextLevelInfo(totalPoints, scorecard.isDiscounted ? discounted : achieved),
        source: session.scorecardResult ? 'persisted_session' : runtimeScorecard ? 'authorised_runtime_snapshot' : 'partial_platform_data',
      },
      elements,
      scenarios: [],
      sources: buildSources(elements, args.scorecardId),
    };
  }

  const client = await ClientModel.findOne({ $or: [{ id: cleanId }, { clientId: cleanId }] }).lean() as ClientLike | null;
  if (!client) return null;
  if (!canAccess(client.createdByUserId, client.organizationId, args.userId, args.organizationId)) return null;

  const org = client.organizationId
    ? await OrganizationModel.findOne({ id: client.organizationId }).lean() as { name?: string } | null
    : null;
  const scenarios = await ScenarioModel.find({ clientId: cleanId }).sort({ createdAt: -1 }).limit(5).lean() as any[];
  const chosenScorecard = runtimeScorecard ?? {};
  const scorecard = normaliseScorecard(chosenScorecard);
  const totalPoints = num(scorecard.total?.score);
  const currentLevel = scorecard.isDiscounted ? scorecard.discountedLevel : scorecard.achievedLevel;
  const elements = buildElement(scorecard, null, args.runtimeSnapshot?.missingEvidence);

  return {
    toolkitId: 'bbbee',
    organisation: {
      id: client.organizationId || 'personal',
      name: org?.name || client.name || 'Organisation',
      sector: client.sectorCode,
      scorecardType: client.scorecardType || client.companySize,
      financialYear: client.financialYear,
      revenue: num(client.revenue ?? client.financials?.totalRevenue),
      npat: num(client.npat ?? client.financials?.npat),
      leviableAmount: num(client.leviableAmount ?? client.financials?.leviableAmount),
      headcount: num(client.numberOfEmployees),
    },
    scorecard: {
      id: args.scorecardId,
      currentLevel: levelLabel(currentLevel),
      levelBeforeDiscounting: levelLabel(scorecard.achievedLevel),
      totalPoints,
      recognitionPercentage: recognitionPercent(scorecard.recognitionLevel),
      discounted: Boolean(scorecard.isDiscounted),
      discountReason: scorecard.isDiscounted ? 'One or more priority-element subminimums were not met.' : undefined,
      ...nextLevelInfo(totalPoints, currentLevel),
      source: runtimeScorecard ? 'authorised_runtime_snapshot' : 'persisted_client',
    },
    elements,
    scenarios: scenarios.map((s) => ({
      name: String(s.name || 'Scenario'),
      projectedLevel: levelLabel(s.snapshot?.scorecard?.discountedLevel ?? s.snapshot?.scorecard?.achievedLevel),
      projectedPoints: num(s.snapshot?.scorecard?.total?.score),
      assumptions: [],
      actions: [],
    })),
    sources: buildSources(elements, args.scorecardId),
  };
}

