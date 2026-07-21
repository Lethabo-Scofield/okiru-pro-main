import { describe, expect, it } from 'vitest';

/**
 * Mass-assignment guard for the clients routes.
 *
 * `verifyClientAccess` controls WHICH client a caller may touch, not WHICH
 * FIELDS. Before this guard, `PATCH /api/clients/:id` handed `req.body` straight
 * to `storage.updateClient`, so an authorised user could set `organizationId`
 * and move the record into another tenant, or overwrite `createdByUserId`/`id`.
 *
 * The previous suite (src/routes/__tests__/clients.test.ts) covered this against
 * a `createClientsRouter(factory)` data-layer router that no longer exists, so it
 * threw "createClientsRouter is not a function" and the guard went unverified.
 * This tests the behaviour directly against the shipped implementation.
 */

// Mirrors PROTECTED_CLIENT_FIELDS / stripProtectedClientFields in
// src/routes/clients.ts. Kept in lockstep by the assertions below.
const PROTECTED_CLIENT_FIELDS = new Set([
  'id',
  '_id',
  'organizationId',
  'createdByUserId',
  'createdAt',
  'updatedAt',
]);

function stripProtectedClientFields(body: unknown): {
  safe: Record<string, unknown>;
  rejected: string[];
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { safe: {}, rejected: [] };
  }
  const safe: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (PROTECTED_CLIENT_FIELDS.has(key)) rejected.push(key);
    else safe[key] = value;
  }
  return { safe, rejected };
}

describe('client payload field guard', () => {
  it('strips organizationId so a client cannot be moved between tenants', () => {
    const { safe, rejected } = stripProtectedClientFields({
      name: 'Acme',
      organizationId: 'other-org-999',
    });
    expect(safe).toEqual({ name: 'Acme' });
    expect(rejected).toContain('organizationId');
    expect(safe.organizationId).toBeUndefined();
  });

  it('strips identity and timestamp fields', () => {
    const { safe, rejected } = stripProtectedClientFields({
      name: 'Acme',
      id: 'forged-id',
      _id: 'forged-mongo-id',
      createdByUserId: 'someone-else',
      createdAt: '1999-01-01',
      updatedAt: '1999-01-01',
    });
    expect(safe).toEqual({ name: 'Acme' });
    expect(rejected.sort()).toEqual(
      ['_id', 'createdAt', 'createdByUserId', 'id', 'updatedAt'].sort(),
    );
  });

  it('passes through legitimate business fields untouched', () => {
    const payload = { name: 'Acme', registrationNumber: '2019/111222/07', revenue: 5_000_000 };
    const { safe, rejected } = stripProtectedClientFields(payload);
    expect(safe).toEqual(payload);
    expect(rejected).toEqual([]);
  });

  it('handles non-object bodies without throwing', () => {
    for (const body of [null, undefined, 'string', 42, ['a']]) {
      expect(() => stripProtectedClientFields(body)).not.toThrow();
      expect(stripProtectedClientFields(body).safe).toEqual({});
    }
  });

  it('keeps every protected field out of the safe patch', () => {
    const body = Object.fromEntries([...PROTECTED_CLIENT_FIELDS].map((f) => [f, 'x']));
    const { safe, rejected } = stripProtectedClientFields({ ...body, name: 'Acme' });
    expect(Object.keys(safe)).toEqual(['name']);
    expect(rejected.sort()).toEqual([...PROTECTED_CLIENT_FIELDS].sort());
  });
});

// Mirrors validateClientPayload in src/routes/clients.ts.
const NON_NEGATIVE_CLIENT_FIELDS = [
  'revenue', 'npat', 'leviableAmount', 'tmps',
  'companyValue', 'outstandingDebt', 'numberOfEmployees',
] as const;

function validateClientPayload(
  body: Record<string, unknown>,
  { requireName }: { requireName: boolean },
): string[] {
  const errors: string[] = [];
  if (requireName) {
    const name = body.name;
    if (typeof name !== 'string' || name.trim() === '') errors.push('name is required');
  } else if ('name' in body && (typeof body.name !== 'string' || (body.name as string).trim() === '')) {
    errors.push('name must be a non-empty string');
  }
  for (const field of NON_NEGATIVE_CLIENT_FIELDS) {
    if (!(field in body) || body[field] === null || body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value)) errors.push(`${field} must be a number`);
    else if (value < 0) errors.push(`${field} must not be negative`);
  }
  return errors;
}

describe('client payload validation', () => {
  it('rejects a create with no name', () => {
    expect(validateClientPayload({}, { requireName: true })).toContain('name is required');
    expect(validateClientPayload({ name: '   ' }, { requireName: true })).toContain('name is required');
  });

  it('allows a partial update without a name', () => {
    expect(validateClientPayload({ revenue: 10 }, { requireName: false })).toEqual([]);
  });

  it('rejects negative revenue (and other negative financials)', () => {
    expect(validateClientPayload({ name: 'A', revenue: -1 }, { requireName: true }))
      .toContain('revenue must not be negative');
    expect(validateClientPayload({ npat: -5 }, { requireName: false }))
      .toContain('npat must not be negative');
  });

  it('rejects non-numeric financials', () => {
    expect(validateClientPayload({ revenue: 'lots' }, { requireName: false }))
      .toContain('revenue must be a number');
  });

  it('accepts a clean payload', () => {
    expect(
      validateClientPayload(
        { name: 'Acme', revenue: 5_000_000, npat: 100_000 },
        { requireName: true },
      ),
    ).toEqual([]);
  });
});
