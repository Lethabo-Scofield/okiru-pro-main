/**
 * Document Intelligence is the path that makes scanned documents readable.
 *
 * The contract that matters: it must never take uploads down. Unconfigured, a
 * failed call, a timeout, or a malformed response all degrade to null so the
 * caller keeps whatever the local text layer produced.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyseWithDocumentIntelligence,
  documentIntelligenceCacheEnabled,
  documentIntelligenceConfigured,
} from '../../src/services/documentIntelligence.js';

const ENDPOINT = 'https://example-di.cognitiveservices.azure.com';
const originalFetch = globalThis.fetch;

function configure(): void {
  process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = ENDPOINT;
  process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'test-key';
}

function unconfigure(): void {
  delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
}

/** Fake the POST-then-poll protocol: analyse returns a location, poll returns a body. */
function mockAnalyse(pollBody: unknown, opts: { analyseOk?: boolean; pollOk?: boolean } = {}): void {
  const { analyseOk = true, pollOk = true } = opts;
  globalThis.fetch = vi.fn(async (url: unknown) => {
    if (String(url).includes(':analyze')) {
      return {
        ok: analyseOk,
        status: analyseOk ? 202 : 400,
        headers: new Map([['operation-location', `${ENDPOINT}/op/1`]]) as never,
        text: async () => 'bad request',
      } as never;
    }
    return { ok: pollOk, status: pollOk ? 200 : 500, json: async () => pollBody } as never;
  }) as never;
}

// Each analyse waits out one real 2 s poll interval (shouldAdvanceTime moves the
// fake clock in step with the real one), so under a loaded full-suite run a
// test can pass the 5 s default for no fault of its own.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); configure(); });
afterEach(() => { vi.useRealTimers(); globalThis.fetch = originalFetch; unconfigure(); });

describe('configuration', () => {
  it('reports unconfigured when endpoint or key is missing', () => {
    unconfigure();
    expect(documentIntelligenceConfigured()).toBe(false);
  });

  it('returns null when unconfigured rather than throwing', async () => {
    unconfigure();
    expect(await analyseWithDocumentIntelligence(Buffer.from('x'), 'application/pdf', 'a.pdf')).toBeNull();
  });
});

describe('reading a scanned document', () => {
  it('returns markdown, text and reconstructed tables', async () => {
    mockAnalyse({
      status: 'succeeded',
      analyzeResult: {
        content: '# Share Register\n\nThandanani Packers & Haulers cc',
        pages: [{}, {}],
        tables: [{
          rowCount: 2,
          columnCount: 2,
          cells: [
            { rowIndex: 0, columnIndex: 0, content: 'Shareholder' },
            { rowIndex: 0, columnIndex: 1, content: 'Shares' },
            { rowIndex: 1, columnIndex: 0, content: 'T Nkosi' },
            { rowIndex: 1, columnIndex: 1, content: '100' },
          ],
        }],
      },
    });

    const result = await analyseWithDocumentIntelligence(Buffer.from('scan'), 'application/pdf', 'register.pdf');

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Thandanani');
    expect(result!.pageCount).toBe(2);
    // The grid must survive — a share register IS a table.
    expect(result!.tables[0].rows).toEqual([['Shareholder', 'Shares'], ['T Nkosi', '100']]);
    expect(result!.tables[0].cells).toHaveLength(4);
  });

  it('appends table markdown when the content has no grid of its own', async () => {
    mockAnalyse({
      status: 'succeeded',
      analyzeResult: {
        content: 'Share Register',
        pages: [{}],
        tables: [{
          rowCount: 2,
          columnCount: 2,
          cells: [
            { rowIndex: 0, columnIndex: 0, content: 'Name' },
            { rowIndex: 0, columnIndex: 1, content: 'Shares' },
            { rowIndex: 1, columnIndex: 0, content: 'T Nkosi' },
            { rowIndex: 1, columnIndex: 1, content: '100' },
          ],
        }],
      },
    });

    const result = await analyseWithDocumentIntelligence(Buffer.from('scan'), 'application/pdf', 'r.pdf');
    expect(result!.markdown).toContain('| Name | Shares |');
    expect(result!.markdown).toContain('| T Nkosi | 100 |');
  });
});

describe('the evaluation raw-response cache (PARSER_DI_CACHE_DIR)', () => {
  const succeeded = {
    status: 'succeeded',
    analyzeResult: {
      content: 'Share Register',
      pages: [{}],
      tables: [{ rowCount: 1, columnCount: 2, cells: [{ rowIndex: 0, columnIndex: 0, content: 'Name' }, { rowIndex: 0, columnIndex: 1, content: 'Shares' }] }],
    },
  };
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'di-cache-')); });
  afterEach(() => { delete process.env.PARSER_DI_CACHE_DIR; rmSync(dir, { recursive: true, force: true }); });

  it('writes nothing and changes nothing when the variable is unset', async () => {
    mockAnalyse(succeeded);
    const result = await analyseWithDocumentIntelligence(Buffer.from('scan'), 'application/pdf', 'r.pdf');
    expect(result!.text.startsWith('Share Register')).toBe(true);
    expect(documentIntelligenceCacheEnabled()).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('keeps the raw analyzeResult keyed by content and model, then serves it without credentials', async () => {
    process.env.PARSER_DI_CACHE_DIR = dir;
    mockAnalyse(succeeded);
    const live = await analyseWithDocumentIntelligence(Buffer.from('scan'), 'application/pdf', 'r.pdf');

    const [file] = readdirSync(dir);
    expect(file).toMatch(/^[0-9a-f]{64}\.prebuilt-layout\.[\d-]+\.json$/);
    // The RAW answer is kept, so a later change to how text is built from it applies.
    expect(JSON.parse(readFileSync(join(dir, file), 'utf8')).analyzeResult).toEqual(succeeded.analyzeResult);

    unconfigure();
    const fetchSpy = vi.fn(async () => { throw new Error('must not call the service'); });
    globalThis.fetch = fetchSpy as never;
    const replayed = await analyseWithDocumentIntelligence(Buffer.from('scan'), 'application/pdf', 'r.pdf');
    expect(replayed).toEqual(live);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a different file misses the cache and, unconfigured, reads nothing', async () => {
    process.env.PARSER_DI_CACHE_DIR = dir;
    unconfigure();
    expect(await analyseWithDocumentIntelligence(Buffer.from('other'), 'application/pdf', 'o.pdf')).toBeNull();
  });
});

describe('it never takes uploads down', () => {
  it('returns null when the analyse request is rejected', async () => {
    mockAnalyse({}, { analyseOk: false });
    expect(await analyseWithDocumentIntelligence(Buffer.from('x'), 'application/pdf', 'a.pdf')).toBeNull();
  });

  it('returns null when polling fails', async () => {
    mockAnalyse({}, { pollOk: false });
    expect(await analyseWithDocumentIntelligence(Buffer.from('x'), 'application/pdf', 'a.pdf')).toBeNull();
  });

  it('returns null when the analysis reports failure', async () => {
    mockAnalyse({ status: 'failed' });
    expect(await analyseWithDocumentIntelligence(Buffer.from('x'), 'application/pdf', 'a.pdf')).toBeNull();
  });

  it('returns null when the network throws', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('ECONNRESET'); }) as never;
    expect(await analyseWithDocumentIntelligence(Buffer.from('x'), 'application/pdf', 'a.pdf')).toBeNull();
  });
});
