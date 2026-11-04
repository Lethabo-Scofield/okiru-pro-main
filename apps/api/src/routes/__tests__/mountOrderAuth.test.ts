/**
 * Guards against the mount-order auth trap.
 *
 * scorecardBuilderRouter is mounted at the BARE '/api' path
 * (app.use('/api', router)). If it attaches requireAuth with a
 * router-level `router.use(requireAuth)`, that middleware runs for EVERY /api/*
 * request that reaches the router in the chain — including public routes mounted
 * after it (e.g. the certificate directory), 401-ing them. The guard must be
 * per-route. This test fails if a router-level guard is reintroduced.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import scorecardBuilderRouter from '../scorecardBuilder.js';

function appWithPublicAfter(broadRouter: express.Router) {
  const app = express();
  app.use(express.json());
  // Mirror index.ts: broad '/api' mount, then a public route mounted after it.
  app.use('/api', broadRouter);
  app.get('/api/certificates/stats', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('mount-order auth safety (bare /api routers must not block public routes)', () => {
  it('scorecardBuilderRouter lets an unmatched public route fall through anonymously', async () => {
    const res = await request(appWithPublicAfter(scorecardBuilderRouter)).get('/api/certificates/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('scorecardBuilderRouter still gates its OWN routes (per-route requireAuth)', async () => {
    const res = await request(appWithPublicAfter(scorecardBuilderRouter)).get('/api/manifest?sector=RCOGP&type=Generic');
    expect(res.status).toBe(401);
  });
});
