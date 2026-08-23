/**
 * The parser's browser-facing posture.
 *
 * Two defaults were wrong in production and neither was visible from the
 * outside:
 *
 *  - CORS reflected whatever Origin asked and paired it with
 *    `credentials: true`, so any website could make credentialed requests to
 *    the parser and read the replies out of a visitor's browser. Nothing
 *    legitimate needs that: `/api/parser/*` is served on the web app's own host
 *    and proxied server-to-server, and the PayFast ITN carries no Origin.
 *  - Content-Security-Policy was switched off outright on a service that only
 *    ever answers JSON and SSE, which cost the header and bought nothing.
 */
import { describe, expect, it } from 'vitest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import request from 'supertest';
import { parserHelmetOptions, resolveCorsOrigin } from '../../src/securityConfig.js';

/** A minimal app wearing exactly the middleware server.ts installs. */
function appWith(env: NodeJS.ProcessEnv) {
  const app = express();
  app.use(helmet(parserHelmetOptions()));
  app.use(cors({ origin: resolveCorsOrigin(env), credentials: true }));
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  return app;
}

describe('resolveCorsOrigin', () => {
  it('is closed in production when nothing is configured', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('stays open outside production so local development works', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
    expect(resolveCorsOrigin({} as NodeJS.ProcessEnv)).toBe(true);
  });

  it('honours an explicit allowlist, in production and out of it', () => {
    const env = { NODE_ENV: 'production', PARSER_ALLOWED_ORIGINS: 'https://okiru.pro, https://www.okiru.pro' };
    expect(resolveCorsOrigin(env as NodeJS.ProcessEnv)).toEqual([
      'https://okiru.pro',
      'https://www.okiru.pro',
    ]);
  });

  it('treats a blank or comma-only setting as unset rather than as an empty allowlist', () => {
    // `origin: []` would deny everything including local dev, silently.
    expect(resolveCorsOrigin({ NODE_ENV: 'development', PARSER_ALLOWED_ORIGINS: ' , ,' } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe('CORS on the wire', () => {
  it('does not hand a credentialed allow-origin to an arbitrary site in production', async () => {
    const res = await request(appWith({ NODE_ENV: 'production' } as NodeJS.ProcessEnv))
      .get('/health')
      .set('Origin', 'https://evil.example');

    expect(res.status).toBe(200); // same-origin and server-to-server callers are untouched
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('still answers an allowlisted origin', async () => {
    const env = { NODE_ENV: 'production', PARSER_ALLOWED_ORIGINS: 'https://okiru.pro' };
    const res = await request(appWith(env as NodeJS.ProcessEnv))
      .get('/health')
      .set('Origin', 'https://okiru.pro');

    expect(res.headers['access-control-allow-origin']).toBe('https://okiru.pro');
  });

  it('refuses an origin that is not on the allowlist', async () => {
    const env = { NODE_ENV: 'production', PARSER_ALLOWED_ORIGINS: 'https://okiru.pro' };
    const res = await request(appWith(env as NodeJS.ProcessEnv))
      .get('/health')
      .set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('leaves a request with no Origin alone — the proxy and the PayFast ITN', async () => {
    const res = await request(appWith({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('security headers', () => {
  it('sends a content-security-policy that allows nothing at all', async () => {
    const res = await request(appWith({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it('does not let helmet merge its page-oriented defaults back in', async () => {
    // The first deploy of this header shipped with helmet's defaults merged
    // over the four directives, so the policy still carried `script-src 'self'`
    // and a style-src with 'unsafe-inline' on a service that renders nothing.
    const res = await request(appWith({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain("script-src 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('keeps the rest of helmet on', async () => {
    const res = await request(appWith({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
  });
});
