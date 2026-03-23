import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = 'http://localhost:5000';

const TEST_USER = {
  username: `testuser_${Date.now()}`,
  password: 'testpass123',
  fullName: 'Test User',
  email: 'test@example.com',
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

describe('Auth API', () => {
  it('GET /api/auth/me — unauthenticated returns 401', async () => {
    const { status, body } = await client.withoutSession(() =>
      client.request('/api/auth/me')
    );

    expect(status).toBe(401);
    expect(body.message).toBe('Not authenticated');
  });

  describe('registration validation', () => {
    it('rejects missing username', async () => {
      const { status, body } = await client.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ password: 'test123' }),
      });

      expect(status).toBe(400);
      expect(body.message).toContain('required');
    });

    it('rejects short password (< 4 chars)', async () => {
      const { status, body } = await client.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username: 'shortpw', password: '12' }),
      });

      expect(status).toBe(400);
      expect(body.message).toContain('4 characters');
    });
  });

  describe('registration + login flow', () => {
    it('creates a new user and sets session', async () => {
      const { status, body } = await client.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(TEST_USER),
      });

      expect(status).toBe(200);
      expect(body.user).toBeDefined();
      expect(body.user.username).toBe(TEST_USER.username);
      expect(body.user.password).toBeUndefined();
    });

    it('rejects duplicate username', async () => {
      const { status, body } = await client.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(TEST_USER),
      });

      expect(status).toBe(400);
      expect(body.message).toContain('already taken');
    });

    it('returns user via /api/auth/me when authenticated', async () => {
      const { status, body } = await client.request('/api/auth/me');

      expect(status).toBe(200);
      expect(body.user.username).toBe(TEST_USER.username);
      expect(body.user.password).toBeUndefined();
    });

    it('logs out and destroys session', async () => {
      const { status, body } = await client.request('/api/auth/logout', {
        method: 'POST',
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('rejects invalid credentials', async () => {
      const { status } = await client.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: TEST_USER.username, password: 'wrongpassword' }),
      });

      expect(status).toBe(401);
    });

    it('authenticates with valid credentials', async () => {
      const { status, body } = await client.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: TEST_USER.username, password: TEST_USER.password }),
      });

      expect(status).toBe(200);
      expect(body.user.username).toBe(TEST_USER.username);
    });

    it('rejects empty username on login', async () => {
      const { status } = await client.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: '' }),
      });

      expect(status).toBe(400);
    });
  });
});

describe('Templates API', () => {
  let templateId: number;

  it('GET /api/templates returns an array', async () => {
    const { status, body } = await client.request('/api/templates');

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  describe('CRUD operations', () => {
    it('creates a template', async () => {
      const { status, body } = await client.request('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Template',
          description: 'A test template',
          entities: [{ label: 'Name', definition: 'Full name' }],
        }),
      });

      expect(status).toBe(200);
      expect(body.name).toBe('Test Template');
      templateId = body.id;
    });

    it('reads the created template', async () => {
      if (!templateId) return;
      const { status, body } = await client.request(`/api/templates/${templateId}`);

      expect(status).toBe(200);
      expect(body.name).toBe('Test Template');
    });

    it('updates the template', async () => {
      if (!templateId) return;
      const { status, body } = await client.request(`/api/templates/${templateId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Updated Template',
          entities: [{ label: 'Updated', definition: 'Updated definition' }],
        }),
      });

      expect(status).toBe(200);
      expect(body.name).toBe('Updated Template');
    });

    it('deletes the template', async () => {
      if (!templateId) return;
      const { status, body } = await client.request(`/api/templates/${templateId}`, {
        method: 'DELETE',
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects template without name', async () => {
      const { status } = await client.request('/api/templates', {
        method: 'POST',
        body: JSON.stringify({ entities: [] }),
      });

      expect(status).toBe(400);
    });

    it('rejects template without entities', async () => {
      const { status } = await client.request('/api/templates', {
        method: 'POST',
        body: JSON.stringify({ name: 'No Entities' }),
      });

      expect(status).toBe(400);
    });
  });

  describe('404 handling', () => {
    it('returns 404 for non-existent GET', async () => {
      const { status } = await client.request('/api/templates/999999');
      expect(status).toBe(404);
    });

    it('returns 404 for non-existent DELETE', async () => {
      const { status } = await client.request('/api/templates/999999', { method: 'DELETE' });
      expect(status).toBe(404);
    });
  });
});

describe('Client Data API', () => {
  it('returns full data for a valid client', async () => {
    const { status, body } = await client.request('/api/clients/C-10483/data');

    expect(status).toBe(200);
    expect(body.client).toBeDefined();
    expect(body.client.name).toBe('Moyo Retail (Pty) Ltd');

    const requiredSections = ['ownership', 'management', 'skills', 'procurement', 'esd', 'sed'];
    for (const section of requiredSections) {
      expect(body).toHaveProperty(section);
    }
  });

  it('returns 404 for invalid client ID', async () => {
    const { status, body } = await client.request('/api/clients/INVALID-ID/data');

    expect(status).toBe(404);
    expect(body.error).toContain('not found');
  });
});

describe('Profile API', () => {
  it('updates user profile when authenticated', async () => {
    const { status, body } = await client.request('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'Updated Name', email: 'updated@example.com' }),
    });

    expect(status).toBe(200);
    expect(body.user.fullName).toBe('Updated Name');
  });

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
