import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Error serialization must never destroy the payload.
 *
 * `serializeError` used to do `String(err)` for any non-Error, so a plain object
 * became the literal string "[object Object]". Certificate upload failures
 * therefore logged as `{"error":{"message":"[object Object]"}}` — no filename, no
 * reason, nothing actionable. That also silently swallowed the very common
 * miscall `logger.error(msg, { ...meta })`, where meta lands in the error slot.
 *
 * The logger only emits JSON when NODE_ENV=production (dev pretty-prints), and
 * that is decided at module load — hence the env-then-import dance below.
 */

const ORIGINAL_ENV = process.env.NODE_ENV;

async function loadLogger() {
  vi.resetModules();
  process.env.NODE_ENV = 'production';
  const { createLogger } = await import('../src/logger.js');
  return createLogger('Test');
}

/** Capture the JSON log entry produced by `fn`. */
function captureError(fn: () => void): any {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    fn();
    return JSON.parse(String(spy.mock.calls.at(-1)?.[0]));
  } finally {
    spy.mockRestore();
  }
}

beforeEach(() => { process.env.NODE_ENV = 'production'; });
afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

describe('logger error serialization', () => {
  it('preserves a real Error name, message and stack', async () => {
    const logger = await loadLogger();
    const entry = captureError(() => logger.error('boom', new Error('kaboom')));
    expect(entry.error.name).toBe('Error');
    expect(entry.error.message).toBe('kaboom');
    expect(entry.error.stack).toBeTruthy();
  });

  it('preserves object contents instead of "[object Object]"', async () => {
    const logger = await loadLogger();
    const entry = captureError(() =>
      logger.error('Failed to upload certificate', { fileName: 'cert.pdf', reason: 'blob missing' }),
    );
    // The regression: this used to serialize to exactly "[object Object]".
    expect(JSON.stringify(entry)).not.toContain('[object Object]');
    expect(entry.error.fileName).toBe('cert.pdf');
    expect(entry.error.reason).toBe('blob missing');
  });

  it('serializes a nested Error inside an object', async () => {
    const logger = await loadLogger();
    const entry = captureError(() =>
      logger.error('wrapped', { blobName: 'b.pdf', cause: new Error('inner failure') }),
    );
    expect(entry.error.blobName).toBe('b.pdf');
    expect(entry.error.cause.message).toBe('inner failure');
    expect(entry.error.cause.stack).toBeTruthy();
  });

  it('still handles strings, numbers and null sensibly', async () => {
    const logger = await loadLogger();
    expect(captureError(() => logger.error('s', 'plain string')).error.message).toBe('plain string');
    expect(captureError(() => logger.error('n', 42)).error.message).toBe('42');
    expect(captureError(() => logger.error('nul', null)).error).toBeUndefined();
  });
});
