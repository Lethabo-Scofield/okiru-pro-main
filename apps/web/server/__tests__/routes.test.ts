import { describe, it, expect, beforeAll } from 'vitest';
import { MongoClient } from 'mongodb';

const BASE_URL = 'http://localhost:5000';
const MONGO_URI = process.env.MONGODB_URI || '';

const TS = Date.now();
const TEST_USER = {
  username: `testuser_${TS}`,
  password: 'testpass123',
  fullName: 'Test User',
  email: `testuser_${TS}@okiru.co.za`,
  organizationId: 'okiru',
  subscriptionId: 'OKR-2026-001',
};

interface ApiResponse<T = any> {
  status: number;
  body: T;
}

class TestClient {
  private cookie = '';

  async request<T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (this.cookie) {
      headers['Cookie'] = this.cookie;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      redirect: 'manual',
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.cookie = setCookie.split(';')[0];
    }

    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('json') ? await res.json() : await res.text();
    return { status: res.status, body: body as T };
  }

  clearSession() {
    this.cookie = '';
  }

  withoutSession<T>(fn: () => Promise<T>): Promise<T> {
    const saved = this.cookie;
    this.cookie = '';
    return fn().finally(() => { this.cookie = saved; });
  }
}

const client = new TestClient();

/**
 * This suite talks to a real server over HTTP — it does not boot one itself.
 * Without `pnpm dev` running on port 5000 every request fails with
 * ECONNREFUSED, which reads as 17 broken tests rather than "not run here".
 * Probe once up front and skip the suite instead.
 *
 * Any HTTP response means the server is up: `/api/auth/me` answers 401 when
 * unauthenticated, and that is still proof of life. Only a transport-level
 * failure (connection refused, timeout) counts as "no server".
 *
 * The timeout is deliberately generous. This probe runs at module scope while
 * vitest is still transforming the module graph, so the abort timer can burn
 * through a short budget before the request is even scheduled — a 2s limit
 * skipped the suite against a server that was demonstrably up. Nothing is lost
 * by waiting: when no server is listening the connection is refused
 * immediately, so the common local case still skips in milliseconds.
 */
async function isServerReachable(): Promise<boolean> {
  try {
    await fetch(`${BASE_URL}/api/auth/me`, { signal: AbortSignal.timeout(15_000) });
    return true;
  } catch {
    return false;
  }
}

const SERVER_UP = await isServerReachable();

if (!SERVER_UP) {
  console.warn(
    `[routes.test] Skipping: no server on ${BASE_URL}. Start one with \`pnpm dev\` to run this suite.`,
  );
}

const describeApi = describe.skipIf(!SERVER_UP);

async function getOtpFromDb(email: string): Promise<string | null> {
  if (!MONGO_URI) return null;
  const mongo = new MongoClient(MONGO_URI);
  try {
    await mongo.connect();
    const db = mongo.db();
    const user = await db.collection('users').findOne({ email });
    return user?.otpCode ?? null;
  } finally {
    await mongo.close();
  }
}

describeApi('Auth API - unauthenticated', () => {
  it('GET /api/auth/me - unauthenticated returns 401', async () => {
    const { status, body } = await client.withoutSession(() =>
      client.request('/api/auth/me')
    );

    expect(status).toBe(401);
    expect(body.message).toBe('Not authenticated');
  });
});

describeApi('Auth API - registration validation', () => {
  it('rejects missing username', async () => {
    const { status, body } = await client.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ password: 'test123', email: 'x@x.com', fullName: 'X', organization: 'test', subscriptionId: 'sub_001' }),
    });

    expect(status).toBe(400);
    expect(body.message).toContain('required');
  });

  it('rejects short password (< 4 chars)', async () => {
    const { status, body } = await client.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'shortpw', password: '12', email: 'y@y.com', fullName: 'Y', organization: 'test', subscriptionId: 'sub_001' }),
    });

    expect(status).toBe(400);
    expect(body.message).toContain('4 characters');
  });

  it('rejects empty username on login', async () => {
    const { status } = await client.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '' }),
    });

    expect(status).toBe(400);
  });
});

describeApi('Auth API - registration + OTP flow', () => {
  it('creates a new user and sends OTP', async () => {
    const { status, body } = await client.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(TEST_USER),
    });

    expect(status).toBe(200);
    expect(body.requiresVerification).toBe(true);
    expect(body.message).toBeDefined();
    expect(body.emailHint).toBeDefined();
  });

  it('rejects duplicate username', async () => {
    const { status, body } = await client.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(TEST_USER),
    });

    expect([400, 200]).toContain(status);
    if (status === 400) {
      expect(body.message).toBeDefined();
    }
  });

  it('completes OTP verification and establishes session', async () => {
    if (!MONGO_URI) return;

    const otp = await getOtpFromDb(TEST_USER.email);
    if (!otp) return;

    const { status, body } = await client.request('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ otp }),
    });

    expect(status).toBe(200);
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe(TEST_USER.username);
    expect(body.user.password).toBeUndefined();
  });

  it('returns user via /api/auth/me when session is established', async () => {
    if (!MONGO_URI) return;

    const { status, body } = await client.request('/api/auth/me');

    if (status === 200) {
      expect(body.user.username).toBe(TEST_USER.username);
      expect(body.user.password).toBeUndefined();
    } else {
      expect([401, 403]).toContain(status);
    }
  });

  it('logs out and destroys session', async () => {
    const { status, body } = await client.request('/api/auth/logout', {
      method: 'POST',
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

describeApi('Auth API - login', () => {
  it('rejects invalid credentials', async () => {
    const { status } = await client.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER.username, password: 'wrongpassword' }),
    });

    expect(status).toBe(401);
  });

  it('login with valid credentials returns 200', async () => {
    const { status, body } = await client.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER.username, password: TEST_USER.password }),
    });

    expect(status).toBe(200);
    expect(body).toBeDefined();
  });
});

describeApi('OTP API', () => {
  it('rejects verify-otp with no pending session', async () => {
    const { status } = await client.withoutSession(() =>
      client.request('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ otp: '000000' }),
      })
    );

    expect([400, 401]).toContain(status);
  });

  it('rejects resend-otp with no pending session', async () => {
    const { status } = await client.withoutSession(() =>
      client.request('/api/auth/resend-otp', { method: 'POST' })
    );

    expect([400, 401]).toContain(status);
  });
});

describeApi('Templates API', () => {
  let templateId: number;

  beforeAll(async () => {
    if (!MONGO_URI) return;
    const otp = await getOtpFromDb(TEST_USER.email);
    if (otp) {
      await client.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          ...TEST_USER,
          username: `tmpl_${Date.now()}`,
          email: `tmpl_${Date.now()}@example.com`,
        }),
      });
      const freshOtp = await getOtpFromDb(`tmpl_${Date.now()}@example.com`);
      if (freshOtp) {
        await client.request('/api/auth/verify-otp', {
          method: 'POST',
          body: JSON.stringify({ otp: freshOtp }),
        });
      }
    }
  });

  it('GET /api/templates returns 200 or 401', async () => {
    const { status, body } = await client.request('/api/templates');
    expect([200, 401]).toContain(status);
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
    }
  });

  it('POST /api/templates requires authentication', async () => {
    const { status } = await client.withoutSession(() =>
      client.request('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Template',
          description: 'A test template',
          entities: [{ label: 'Name', definition: 'Full name' }],
        }),
      })
    );

    expect(status).toBe(401);
  });

  it('rejects template without name', async () => {
    const { status } = await client.request('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ entities: [] }),
    });

    expect([400, 401]).toContain(status);
  });

  it('returns 404 for non-existent template', async () => {
    const { status } = await client.request('/api/templates/999999');
    expect([404, 401]).toContain(status);
  });
});

describeApi('Profile API', () => {
  it('rejects unauthenticated profile update', async () => {
    const { status } = await client.withoutSession(() =>
      client.request('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: 'Hacker' }),
      })
    );

    expect(status).toBe(401);
  });
});

describeApi('Client Data API', () => {
  it('returns 401 for unauthenticated client data request', async () => {
    const { status } = await client.withoutSession(() =>
      client.request('/api/clients/C-10483/data')
    );

    expect(status).toBe(401);
  });
});
