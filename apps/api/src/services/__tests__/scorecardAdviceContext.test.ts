import { beforeEach, describe, expect, it, vi } from 'vitest';

const processorFindOneMock = vi.hoisted(() => vi.fn());
const sessionBlobFindMock = vi.hoisted(() => vi.fn());
const clientFindOneMock = vi.hoisted(() => vi.fn());
const orgFindOneMock = vi.hoisted(() => vi.fn());
const scenarioFindMock = vi.hoisted(() => vi.fn());

function leanResult<T>(value: T) {
  return { lean: vi.fn(async () => value) };
}

function findLean<T>(value: T) {
  return { lean: vi.fn(async () => value) };
}

function scenarioChain<T>(value: T) {
  return {
    sort: vi.fn(() => ({
      limit: vi.fn(() => ({
        lean: vi.fn(async () => value),
      })),
    })),
  };
}

vi.mock('../../../models.js', () => ({
  ProcessorSessionModel: { findOne: processorFindOneMock },
  SessionBlobModel: { find: sessionBlobFindMock },
  ClientModel: { findOne: clientFindOneMock },
  OrganizationModel: { findOne: orgFindOneMock },
  ScenarioModel: { find: scenarioFindMock },
}));

describe('buildScorecardAdviceContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processorFindOneMock.mockReturnValue(leanResult(null));
    sessionBlobFindMock.mockReturnValue(findLean([]));
    clientFindOneMock.mockReturnValue(leanResult(null));
    orgFindOneMock.mockReturnValue(leanResult(null));
    scenarioFindMock.mockReturnValue(scenarioChain([]));
  });

  it('builds authorised B-BBEE context from a processor session', async () => {
    const { buildScorecardAdviceContext } = await import('../scorecardAdviceContext.js');
    processorFindOneMock.mockReturnValue(leanResult({
      sessionId: 'abc',
      organizationId: 'org-1',
      createdByUserId: 'user-1',
      companyInfo: { name: 'Lake Trading' },
    }));
    sessionBlobFindMock.mockReturnValue(findLean([
      {
        field: 'scorecardResult',
        data: {
          total: { score: 82.6, weighting: 120 },
          achievedLevel: 4,
          discountedLevel: 5,
          isDiscounted: true,
          recognitionLevel: '100%',
          skillsDevelopment: { score: 6, weighting: 25, subMinimumMet: false },
        },
      },
      {
        field: 'foundationData',
        data: {
          clientInfo: { sectorCode: 'RCOGP', companySize: 'Generic', financialYearEnd: '2026-02-28' },
          financials: { totalRevenue: 1000, npat: 100, leviableAmount: 50 },
        },
      },
      { field: 'pillarData', data: { skills: { trainingPrograms: [] } } },
    ]));
    orgFindOneMock.mockReturnValue(leanResult({ name: 'Okiru Org' }));

    const context = await buildScorecardAdviceContext({
      scorecardId: 'session-abc',
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(context?.toolkitId).toBe('bbbee');
    expect(context?.organisation.name).toBe('Okiru Org');
    expect(context?.scorecard.currentLevel).toBe('Level 5');
    expect(context?.scorecard.levelBeforeDiscounting).toBe('Level 4');
    expect(context?.scorecard.totalPoints).toBe(82.6);
    expect(context?.scorecard.discounted).toBe(true);
    expect(context?.elements.find((e) => e.id === 'skills-development')?.subminimumMet).toBe(false);
  });

  it('rejects cross-organisation session access', async () => {
    const { buildScorecardAdviceContext } = await import('../scorecardAdviceContext.js');
    processorFindOneMock.mockReturnValue(leanResult({
      sessionId: 'abc',
      organizationId: 'org-2',
      createdByUserId: 'other-user',
      companyInfo: { name: 'Other Co' },
    }));

    const context = await buildScorecardAdviceContext({
      scorecardId: 'session-abc',
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(context).toBeNull();
  });

  it('uses a runtime scorecard snapshot only after client access is authorised', async () => {
    const { buildScorecardAdviceContext } = await import('../scorecardAdviceContext.js');
    clientFindOneMock.mockReturnValue(leanResult({
      id: 'client-1',
      organizationId: 'org-1',
      createdByUserId: 'user-1',
      name: 'Client One',
      sectorCode: 'ICT',
      scorecardType: 'Generic',
      financialYear: '2026',
    }));

    const context = await buildScorecardAdviceContext({
      scorecardId: 'client-1',
      userId: 'user-1',
      organizationId: 'org-1',
      runtimeSnapshot: {
        scorecard: {
          total: { score: 91, weighting: 120 },
          achievedLevel: 3,
          discountedLevel: 3,
          isDiscounted: false,
          recognitionLevel: '110%',
          ownership: { score: 20, weighting: 25, subMinimumMet: true },
        },
      },
    });

    expect(context?.organisation.sector).toBe('ICT');
    expect(context?.scorecard.currentLevel).toBe('Level 3');
    expect(context?.scorecard.source).toBe('authorised_runtime_snapshot');
    expect(context?.elements.find((e) => e.id === 'ownership')?.actualPoints).toBe(20);
  });
});
