/**
 * /api/calculate scores the EVIDENCED total beside the claimed one when the
 * workbook's verification report comes with the pillar data — the same
 * overlay the Toolkit store applies. (Invented company.)
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/requireAuth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

async function app() {
  const router = (await import('../scorecardBuilder.js')).default;
  const server = express();
  server.use(express.json());
  server.use('/api', router);
  return server;
}

const pillarData = {
  management: { employees: [
    { id: 'e1', name: 'Sipho Ndlovu', race: 'African', gender: 'Male', designation: 'Executive Director' },
  ] },
  ownership: { shareholders: [{ id: 'o1', name: 'Sipho Ndlovu', blackOwnership: 1, blackWomenOwnership: 0, shares: 100 }] },
  sed: { contributions: [
    { id: 's1', beneficiary: 'Riverside Creche', type: 'grant', amount: 10_000, category: 'socio_economic' },
    { id: 's2', beneficiary: 'Riverside Creche', type: 'grant', amount: 10_000, category: 'socio_economic' },
  ] },
};
const foundationData = { financials: { npat: 1_000_000, revenue: 20_000_000 } };

const verification = {
  version: 1,
  period: { start: '2024-03-01', end: '2025-02-28' },
  counts: { pass: 0, flag: 0, 'needs-you': 0, unproven: 2, 'out-of-period': 0 },
  checks: [
    { id: 'sed.proofOfPayment:s2', kind: 'sed.proofOfPayment', section: 'sed', rowId: 's2', subject: 'Riverside Creche', status: 'unproven', rule: 'excluded-from-evidenced', claim: { value: 10_000 }, evidence: [], statement: 'unpaid', ops: [{ kind: 'exclude', basis: 'evidenced', section: 'sed', rowId: 's2' }] },
    { id: 'people.payroll:management-control:e1', kind: 'people.payroll', section: 'management-control', rowId: 'e1', subject: 'Sipho Ndlovu', status: 'unproven', rule: 'excluded-from-evidenced', claim: { value: 'Sipho Ndlovu' }, evidence: [], statement: 'not on payroll', ops: [{ kind: 'notBlack', basis: 'evidenced', section: 'management-control', rowId: 'e1' }] },
  ],
};

// The first call imports the whole scoring router; under a full-suite run
// that alone can pass vitest's 5s default.
vi.setConfig({ testTimeout: 30_000 });

describe('POST /api/calculate with a verification report', () => {
  it('returns the claimed and the evidenced total from the same engine', async () => {
    const server = await app();
    const res = await request(server).post('/api/calculate').send({ sectorCode: 'TRANSPORT', scorecardType: 'QSE', pillarData, foundationData, verification });
    expect(res.status).toBe(200);
    expect(res.body.verification.claimed).toBe(res.body.scorecard.totalPoints);
    expect(res.body.verification.evidenced).toBeLessThan(res.body.verification.claimed);
    const mc = (s: { pillars: Array<{ pillarCode: string; points: number }> }) => s.pillars.find((p) => p.pillarCode === 'managementControl')!.points;
    expect(mc(res.body.scorecard)).toBeGreaterThan(0);
  });

  it('without a report the response is unchanged', async () => {
    const server = await app();
    const res = await request(server).post('/api/calculate').send({ sectorCode: 'TRANSPORT', scorecardType: 'QSE', pillarData, foundationData });
    expect(res.status).toBe(200);
    expect(res.body.verification).toBeUndefined();
  });
});

describe('POST /api/calculate with a malformed verification report', () => {
  it('a check without ops, or a report the overlay cannot read, never costs the claimed score', async () => {
    const server = await app();
    const noOps = { ...verification, checks: [{ ...verification.checks[0], ops: undefined }] };
    const res = await request(server).post('/api/calculate').send({ sectorCode: 'TRANSPORT', scorecardType: 'QSE', pillarData, foundationData, verification: noOps });
    expect(res.status).toBe(200);
    expect(res.body.scorecard.totalPoints).toBeGreaterThan(0);

    const unreadable = { ...verification, checks: [null] };
    const res2 = await request(server).post('/api/calculate').send({ sectorCode: 'TRANSPORT', scorecardType: 'QSE', pillarData, foundationData, verification: unreadable });
    expect(res2.status).toBe(200);
    expect(res2.body.scorecard.totalPoints).toBeGreaterThan(0);
  });
});
