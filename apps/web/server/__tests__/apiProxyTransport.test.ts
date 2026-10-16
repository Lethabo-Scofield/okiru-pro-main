import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import type { AddressInfo } from 'node:net';

/**
 * In development the Certificate Hub's list read is proxied to the public registry
 * on the production site. That target is https; sending it through Node's plain
 * `http` module hit port 80, collected a 301, and passed the redirect to the
 * browser - which blocked it on CORS, so the Hub showed "0 certificates" locally.
 */

const httpsRequest = vi.hoisted(() => vi.fn());
vi.mock('node:https', () => ({ default: { request: httpsRequest }, request: httpsRequest }));

let server: http.Server;
let port: number;

beforeAll(async () => {
  process.env.CERTIFICATE_READ_API_URL = 'https://registry.example.test';
  process.env.API_SERVER_URL = 'http://127.0.0.1:1';
  delete process.env.NODE_ENV; // anything but "production"
  process.env.NODE_ENV = 'test';

  httpsRequest.mockImplementation((_options: unknown, onResponse: (res: unknown) => void) => {
    const upstream = Object.assign(new PassThrough(), { statusCode: 200, headers: { 'content-type': 'application/json' } });
    const request = {
      on: vi.fn().mockReturnThis(),
      write: vi.fn(),
      destroy: vi.fn(),
      end: vi.fn(() => {
        onResponse(upstream);
        upstream.end('{"success":true,"data":{"items":[]}}');
      }),
    };
    return request;
  });

  const { registerApiProxy } = await import('../apiProxy');
  const app = express();
  registerApiProxy(app);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('dev proxy transport', () => {
  it('sends the certificate list read to an https target over https, never plain http on port 80', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/internal/records?page=1&page_size=50`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });

    expect(httpsRequest).toHaveBeenCalledTimes(1);
    const options = httpsRequest.mock.calls[0][0] as { hostname: string; path: string; method: string };
    expect(options.hostname).toBe('registry.example.test');
    expect(options.path).toBe('/api/certificates?page=1&page_size=50'); // /internal/records is rewritten
    expect(options.method).toBe('GET');
  });
});
