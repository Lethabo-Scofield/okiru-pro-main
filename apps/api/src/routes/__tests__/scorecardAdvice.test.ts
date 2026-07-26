import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const buildContextMock = vi.hoisted(() => vi.fn());
const runChatMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/scorecardAdviceContext.js', () => ({
  buildScorecardAdviceContext: buildContextMock,
}));

vi.mock('../../services/scorecardAdviceChat.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/scorecardAdviceChat.js')>('../../services/scorecardAdviceChat.js');
  return {
    validateAdviceMessage: actual.validateAdviceMessage,
    runScorecardAdviceChat: runChatMock,
  };
});

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const auth = req.headers['x-test-auth'];
    if (!auth) {
      req.session = {};
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const [userId, organizationId] = String(auth).split('|');
    req.session = { userId, organizationId };
    next();
  },
}));

async function app() {
  const router = (await import('../scorecardAdvice.js')).default;
  const server = express();
  server.use(express.json());
  server.use((req: any, _res, next) => {
    req.session = req.session ?? {};
    next();
  });
  server.use('/api/scorecards', router);
  return server;
}

describe('scorecard advice route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildContextMock.mockResolvedValue({
      toolkitId: 'bbbee',
      organisation: { id: 'org-1', name: 'Org' },
      scorecard: { id: 'score-1', source: 'authorised_runtime_snapshot' },
      elements: [],
      scenarios: [],
      sources: [],
    });
    runChatMock.mockResolvedValue({
      answer: 'Answer',
      sources: [],
      tables: [{ title: 'Gaps', columns: ['Area'], rows: [['Skills']] }],
      actions: [{ label: 'Open Skills', route: '/toolkit/pillars/skills' }],
      suggestedQuestions: ['Next?'],
      warnings: [],
    });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(await app())
      .post('/api/scorecards/score-1/advice/chat')
      .send({ message: 'Why this level?' });

    expect(res.status).toBe(401);
    expect(buildContextMock).not.toHaveBeenCalled();
  });

  it('rejects non-B-BBEE toolkit requests for now', async () => {
    const res = await request(await app())
      .post('/api/scorecards/score-1/advice/chat')
      .set('x-test-auth', 'user-1|org-1')
      .send({ message: 'Help', toolkitId: 'esg' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/B-BBEE/);
    expect(buildContextMock).not.toHaveBeenCalled();
  });

  it('scopes context building to the authenticated user and organisation', async () => {
    const res = await request(await app())
      .post('/api/scorecards/score-1/advice/chat')
      .set('x-test-auth', 'user-1|org-1')
      .send({ message: 'Why are we Level 4?', conversationId: 'conv-1' });

    expect(res.status).toBe(200);
    expect(buildContextMock).toHaveBeenCalledWith(expect.objectContaining({
      scorecardId: 'score-1',
      userId: 'user-1',
      organizationId: 'org-1',
    }));
    expect(res.body).toMatchObject({
      answer: 'Answer',
      conversationId: 'conv-1',
      tables: [{ title: 'Gaps', columns: ['Area'], rows: [['Skills']] }],
      actions: [{ label: 'Open Skills', route: '/toolkit/pillars/skills' }],
      suggestedQuestions: ['Next?'],
    });
  });
});
