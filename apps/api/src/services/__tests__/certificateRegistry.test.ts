import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMock = vi.hoisted(() => vi.fn());
const countMock = vi.hoisted(() => vi.fn());
const bulkWriteMock = vi.hoisted(() => vi.fn());
const updateManyMock = vi.hoisted(() => vi.fn());
const listBlobsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../models.js', () => ({
  CertificateMetadataModel: {
    find: findMock,
    countDocuments: countMock,
    bulkWrite: bulkWriteMock,
    updateMany: updateManyMock,
  },
}));

vi.mock('../azureCertStorage.js', () => ({
  getCertAccountName: () => 'okirubackups2026',
  getCertBlobContainerName: () => 'certificates',
  listCertificateBlobs: listBlobsMock,
}));

import {
  CERTIFICATE_LIST_MAX_PAGE_SIZE,
  listCertificateRegistry,
  mapCertificateRegistryItem,
  syncCertificateStorage,
} from '../certificateRegistry.js';

function queryResult(documents: Record<string, unknown>[]) {
  const chain: any = {
    sort: vi.fn(() => chain),
    skip: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    lean: vi.fn(async () => documents),
  };
  return chain;
}

describe('certificate registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMock.mockResolvedValue(2758);
    bulkWriteMock.mockResolvedValue({});
    updateManyMock.mockResolvedValue({ modifiedCount: 0 });
  });

  it('uses strict database pagination and caps page size', async () => {
    const chain = queryResult([{
      id: 'cert-1', blobName: 'one.pdf', fileName: 'one.pdf', supplierName: 'One',
      contentType: 'application/pdf', fileSize: 123, uploadedAt: new Date('2026-01-01'),
    }]);
    findMock.mockReturnValue(chain);

    const result = await listCertificateRegistry({ page: 3, pageSize: 500 });

    expect(chain.skip).toHaveBeenCalledWith(CERTIFICATE_LIST_MAX_PAGE_SIZE * 2);
    expect(chain.limit).toHaveBeenCalledWith(CERTIFICATE_LIST_MAX_PAGE_SIZE);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(2758);
    expect(result.items[0]).not.toHaveProperty('extractedText');
  });

  it('builds search, status, level, and expiry filters without loading all records', async () => {
    const chain = queryResult([]);
    findMock.mockReturnValue(chain);

    await listCertificateRegistry({
      search: 'Acme',
      status: 'file_missing',
      bbbeeLevel: 2,
      expiryStatus: 'expired',
      pageSize: 5,
    });

    const filter = findMock.mock.calls[0][0];
    expect(filter.$or).toBeDefined();
    expect(filter.blobMissing).toBe(true);
    expect(filter.bbbeeLevel).toBe(2);
    expect(filter.expiryDate.$lt).toBeInstanceOf(Date);
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  it('returns certificates and affidavits together when no document kind is given', async () => {
    findMock.mockReturnValue(queryResult([]));

    await listCertificateRegistry({ search: 'Acme' });

    const filter = findMock.mock.calls[0][0];
    // Nothing in the filter may narrow by document kind — the Hub's default
    // view is one unified list, and a search has to reach both.
    expect(JSON.stringify(filter)).not.toContain('affidavit');
  });

  it('matches affidavits by file name, not only by the certificateType nobody writes', async () => {
    findMock.mockReturnValue(queryResult([]));

    await listCertificateRegistry({ documentKind: 'affidavits' });

    const filter = findMock.mock.calls[0][0];
    const clause = filter.$and.find((entry: any) => entry.$or);
    expect(clause.$or).toEqual([
      { certificateType: /affidavit/i },
      { fileName: /affidavit/i },
      { blobName: /affidavit/i },
    ]);
  });

  it('excludes every affidavit signal when narrowed to certificates', async () => {
    findMock.mockReturnValue(queryResult([]));

    await listCertificateRegistry({ documentKind: 'certificates' });

    const filter = findMock.mock.calls[0][0];
    const clause = filter.$and.find((entry: any) => entry.$nor);
    expect(clause.$nor).toHaveLength(3);
  });

  it('does not clobber an explicit certificateType query', async () => {
    findMock.mockReturnValue(queryResult([]));

    await listCertificateRegistry({ certificateType: 'sworn', documentKind: 'affidavits' });

    const filter = findMock.mock.calls[0][0];
    expect(filter.certificateType).toEqual(/sworn/i);
    expect(filter.$and).toHaveLength(1);
  });

  it('follows Blob continuation tokens and creates minimal records without invented metadata', async () => {
    findMock.mockReturnValue({ lean: vi.fn(async () => []) });
    listBlobsMock
      .mockResolvedValueOnce({
        items: [{
          name: 'a.pdf', metadata: {}, properties: {
            contentType: 'application/pdf', contentLength: 100, etag: 'etag-a',
            createdOn: new Date('2026-01-01'),
          },
        }],
        continuationToken: 'next-page',
      })
      .mockResolvedValueOnce({
        items: [{
          name: 'b.pdf', metadata: {}, properties: {
            contentType: 'application/pdf', contentLength: 200, etag: 'etag-b',
            createdOn: new Date('2026-01-02'),
          },
        }],
      });

    const result = await syncCertificateStorage();

    expect(listBlobsMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ continuationToken: 'next-page' }));
    expect(result).toMatchObject({ scanned: 2, created: 2, duplicates: 0 });
    const operations = bulkWriteMock.mock.calls.flatMap((call) => call[0]);
    expect(operations).toHaveLength(2);
    expect(operations[0].updateOne.update.$setOnInsert.supplierName).toBeNull();
  });

  it('is idempotent for unchanged exact blob matches', async () => {
    findMock.mockReturnValue({ lean: vi.fn(async () => [{
      id: 'cert-a', blobName: 'a.pdf', fileName: 'a.pdf', contentType: 'application/pdf',
      fileSize: 100, blobETag: 'etag-a', blobMissing: false,
    }]) });
    listBlobsMock.mockResolvedValue({
      items: [{
        name: 'a.pdf', metadata: {}, properties: {
          contentType: 'application/pdf', contentLength: 100, etag: 'etag-a',
        },
      }],
    });

    const result = await syncCertificateStorage();

    expect(result).toMatchObject({ scanned: 1, matched: 1, created: 0, updated: 0, missing_blobs: 0 });
    expect(bulkWriteMock).not.toHaveBeenCalled();
  });
});

describe('company registration number', () => {
  it('is exposed on the registry item, so the field we paid to extract is visible', () => {
    const item = mapCertificateRegistryItem({
      id: 'x', supplierName: 'Ambro Steel A Div Of Hudaco',
      companyRegistrationNumber: '1984/005432/07', blobName: 'a.pdf',
    });
    expect(item.company_registration_number).toBe('1984/005432/07');
  });

  it('falls back to the legacy registrationNumber field', () => {
    const item = mapCertificateRegistryItem({
      id: 'x', registrationNumber: '1997/001443/07', blobName: 'a.pdf',
    });
    expect(item.company_registration_number).toBe('1997/001443/07');
  });

  it('is null when neither is present', () => {
    const item = mapCertificateRegistryItem({ id: 'x', blobName: 'a.pdf' });
    expect(item.company_registration_number).toBeNull();
  });
});
