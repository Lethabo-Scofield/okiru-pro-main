/**
 * The pillar-scope guard must fail CLOSED.
 *
 * verifyPillarAccessInner used to end with `catch { return true }`. The
 * reasoning was that verifyClientAccess upstream still enforced org/creator, so
 * a lookup error only skipped the finer pillar overlay. But skipping the
 * overlay is the exact escalation it exists to stop: during a Mongo blip a
 * scoped collaborator — or a read-only viewer — would be handed full write
 * access to a pillar they may not touch. A lookup we could not complete is not
 * a grant.
 *
 * These tests pin the fix from both entry points, and guard the normal
 * pass-through paths so the fix cannot quietly become deny-everything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The lookups' results are swapped per test. A throw is the infra-error path
// that used to fail open. Held in vi.hoisted so the (hoisted) vi.mock factories
// below may safely reference them.
const state = vi.hoisted(() => ({
  sessionLean: (async () => null) as () => Promise<unknown>,
  memberLean: (async () => null) as () => Promise<unknown>,
}));

// Paths resolve relative to THIS test file: models.js and storage.js live at
// apps/api/ (three up), logger.js at apps/api/src/ (two up) — the same modules
// auth.ts imports as '../../models.js' / '../../storage.js' / '../logger.js'.
vi.mock('../../logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../storage.js', () => ({
  storage: { getClient: async () => null },
}));

vi.mock('../../../models.js', () => ({
  ProcessorSessionModel: {
    findOne: () => ({ sort: () => ({ lean: () => state.sessionLean() }) }),
  },
  WorkspaceMemberModel: {
    findOne: () => ({ lean: () => state.memberLean() }),
  },
  ClientModel: {
    findOne: () => ({ lean: async () => null }),
  },
}));

const { verifyPillarAccess, verifyFullScorecardAccess } = await import('../auth.js');

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    session: { userId: 'u1', organizationId: 'org1' },
    params: {},
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = { statusCode: 0, body: undefined, headersSent: false };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: unknown) => {
    res.body = payload;
    res.headersSent = true;
    return res;
  };
  return res;
}

beforeEach(() => {
  state.sessionLean = async () => null;
  state.memberLean = async () => null;
});

afterEach(() => vi.clearAllMocks());

describe('verifyPillarAccess — fail closed on infra error', () => {
  it('denies with 503 when the workspace lookup throws', async () => {
    state.sessionLean = async () => {
      throw new Error('mongo unreachable');
    };
    const res = mockRes();

    const allowed = await verifyPillarAccess(mockReq(), res, 'procurement', 'C-1');

    // The whole point: an outage no longer hands out write access.
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  it('denies with 503 when the member lookup throws', async () => {
    state.sessionLean = async () => ({ workspaceId: 'ws-1', createdBy: 'someone-else' });
    state.memberLean = async () => {
      throw new Error('mongo unreachable mid-lookup');
    };
    const res = mockRes();

    expect(await verifyPillarAccess(mockReq(), res, 'skills', 'C-1')).toBe(false);
    expect(res.statusCode).toBe(503);
  });
});

describe('verifyFullScorecardAccess — the second entry point through the same guard', () => {
  it('also denies with 503 on a lookup error', async () => {
    state.sessionLean = async () => {
      throw new Error('mongo unreachable');
    };
    const res = mockRes();

    expect(await verifyFullScorecardAccess(mockReq(), res, 'C-1')).toBe(false);
    expect(res.statusCode).toBe(503);
  });
});

describe('the normal decisions still stand', () => {
  it('passes when the client has no workspace overlay', async () => {
    state.sessionLean = async () => null; // no workspace-bound session
    const res = mockRes();

    expect(await verifyPillarAccess(mockReq(), res, 'procurement', 'C-1')).toBe(true);
    expect(res.statusCode).toBe(0); // nothing sent — it just passes
  });

  it('passes the assessment owner', async () => {
    state.sessionLean = async () => ({ workspaceId: 'ws-1', createdBy: 'u1' });
    const res = mockRes();

    expect(await verifyPillarAccess(mockReq(), res, 'procurement', 'C-1')).toBe(true);
  });

  it('still refuses a genuinely out-of-scope collaborator (403, not 503)', async () => {
    state.sessionLean = async () => ({ workspaceId: 'ws-1', createdBy: 'owner' });
    state.memberLean = async () => ({ role: 'collaborator', pillarScopes: ['ownership'] });
    const res = mockRes();

    expect(await verifyPillarAccess(mockReq(), res, 'procurement', 'C-1')).toBe(false);
    // A real denial is a settled 403 — distinct from the retryable 503 above.
    expect(res.statusCode).toBe(403);
  });

  it('fails closed on a missing client id, before any lookup', async () => {
    const res = mockRes();
    expect(await verifyPillarAccess(mockReq(), res, 'procurement', '')).toBe(false);
    expect(res.statusCode).toBe(400);
  });
});
