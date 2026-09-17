/**
 * The upload filter. These tests exist to stop ONE regression, which cost a
 * real user a whole evidence pack:
 *
 * multer treats `cb(new Error(...))` in a fileFilter as fatal for the entire
 * multipart request. Both parser domains used it for "unsupported file type",
 * so a single README.md or .eml sitting beside 27 good documents aborted the
 * upload before any route code ran, and the user was shown a bare
 * `500 Internal Server Error` with no mention of which file or why.
 *
 * The rule under test: an unsupported file is SKIPPED and NAMED, never fatal.
 * Anyone tempted to restore `cb(new Error(...))` here should fail these.
 *
 * Driven over a real socket with the platform's own fetch/FormData rather than
 * a multipart helper — the bug lives in how multer parses the request body, so
 * the request has to be a genuine one.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, it, expect } from 'vitest';
import {
  createUploadPolicy,
  skippedUploadSummary,
  skippedUploads,
} from '../../src/services/uploadPolicy.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A route shaped like the real ones: the same zero-files guard, nothing else. */
function appWithUpload() {
  const upload = createUploadPolicy();
  const app = express();
  app.post('/upload', upload.array('files', 100), (req, res) => {
    const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
    if (files.length === 0) {
      res.status(400).json({ code: 'UNSUPPORTED_FILES_ONLY', message: skippedUploadSummary(req) });
      return;
    }
    res.json({
      processed: files.map((f) => f.originalname),
      skipped: skippedUploads(req),
    });
  });
  // The service's real error middleware — what turned the abort into a 500.
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    res.status(500).json({ message: 'Internal Server Error' });
  });
  return app;
}

/** POST a multipart batch of [filename, mimetype] and read the JSON back. */
async function postFiles(entries: Array<[string, string]>) {
  const server = appWithUpload().listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const form = new FormData();
    for (const [filename, type] of entries) {
      form.append('files', new Blob(['x'], { type }), filename);
    }
    const res = await fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body: form });
    return { status: res.status, body: await res.json() as Record<string, any> };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('upload policy', () => {
  it('keeps the batch when one file is an unsupported type, and names it', async () => {
    const { status, body } = await postFiles([
      ['DASHBOARD.xlsx', XLSX],
      ['policy.pdf', 'application/pdf'],
      ['MANIFEST.md', 'text/markdown'],
    ]);

    expect(status).toBe(200);
    expect(body.processed).toEqual(['DASHBOARD.xlsx', 'policy.pdf']);
    expect(body.skipped).toEqual([
      { file_name: 'MANIFEST.md', reason: 'unsupported file type text/markdown' },
    ]);
  });

  it('survives an unsupported file arriving FIRST', async () => {
    // Order matters: multer aborts at the offending part, so a bad first file
    // used to destroy the batch before a single good one was parsed.
    const { status, body } = await postFiles([
      ['thread.eml', 'message/rfc822'],
      ['DASHBOARD.xlsx', XLSX],
    ]);

    expect(status).toBe(200);
    expect(body.processed).toEqual(['DASHBOARD.xlsx']);
  });

  it('accepts a workbook that arrives as application/octet-stream', async () => {
    // Judged on extension when the browser declares a generic type — the
    // reason the filter checks type OR extension in the first place.
    const { status, body } = await postFiles([['BEE File.xlsm', 'application/octet-stream']]);

    expect(status).toBe(200);
    expect(body.processed).toEqual(['BEE File.xlsm']);
    expect(body.skipped).toEqual([]);
  });

  it('fails with the file names when NOTHING is supported, not a bare 500', async () => {
    const { status, body } = await postFiles([
      ['MANIFEST.md', 'text/markdown'],
      ['EXPECTED_VALUES.md', 'text/markdown'],
    ]);

    expect(status).toBe(400);
    expect(body.code).toBe('UNSUPPORTED_FILES_ONLY');
    expect(body.message).toContain('MANIFEST.md');
    expect(body.message).toContain('EXPECTED_VALUES.md');
  });
});
