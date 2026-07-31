import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const uploadData = vi.fn().mockResolvedValue(undefined);
const getBlockBlobClient = vi.fn(() => ({ uploadData }));
const getContainerClient = vi.fn(() => ({ getBlockBlobClient }));

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: { fromConnectionString: vi.fn(() => ({ getContainerClient })) },
}));

async function freshModule() {
  vi.resetModules();
  return import('../../src/services/caseDocumentStorage.js');
}

describe('caseDocumentStorage — durable copy of uploaded evidence', () => {
  const ORIGINAL_ENV = process.env.AZURE_STORAGE_CONNECTION_STRING;

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = ORIGINAL_ENV;
  });

  it('is unconfigured (and reports so) when no connection string is set', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    const mod = await freshModule();
    expect(mod.isCaseDocumentStorageConfigured()).toBe(false);
    const result = await mod.persistCaseFile('case-1', 'cert.pdf', Buffer.from('x'), 'application/pdf');
    expect(result).toBeNull();
  });

  it('uploads the buffer under a case/date-partitioned blob name and reports it back', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'fake-conn-str';
    const mod = await freshModule();
    const result = await mod.persistCaseFile('case-42', 'Share Register.pdf', Buffer.from('hello'), 'application/pdf');

    expect(result).not.toBeNull();
    expect(result!.fileName).toBe('Share Register.pdf');
    expect(result!.sizeBytes).toBe(5);
    expect(result!.blobName).toContain('case-42');
    expect(result!.blobName).toContain('Share Register.pdf');
    expect(uploadData).toHaveBeenCalledTimes(1);
  });

  it('never throws — a storage failure returns null instead of failing the upload', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'fake-conn-str';
    uploadData.mockRejectedValueOnce(new Error('blob service unavailable'));
    const mod = await freshModule();
    const result = await mod.persistCaseFile('case-1', 'cert.pdf', Buffer.from('x'), 'application/pdf');
    expect(result).toBeNull();
  });

  it('persists a whole batch in parallel and drops only the files that failed', async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'fake-conn-str';
    uploadData
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce(undefined);
    const mod = await freshModule();
    const results = await mod.persistCaseFiles('case-1', [
      { originalname: 'a.pdf', buffer: Buffer.from('a'), mimetype: 'application/pdf' },
      { originalname: 'b.pdf', buffer: Buffer.from('b'), mimetype: 'application/pdf' },
      { originalname: 'c.pdf', buffer: Buffer.from('c'), mimetype: 'application/pdf' },
    ]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.fileName)).toEqual(['a.pdf', 'c.pdf']);
  });

  it('skips the whole batch without touching the client when unconfigured', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    const mod = await freshModule();
    const results = await mod.persistCaseFiles('case-1', [
      { originalname: 'a.pdf', buffer: Buffer.from('a'), mimetype: 'application/pdf' },
    ]);
    expect(results).toEqual([]);
    expect(getContainerClient).not.toHaveBeenCalled();
  });
});
