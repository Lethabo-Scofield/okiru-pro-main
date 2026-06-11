import { describe, it, expect } from 'vitest';
import {
  buildCertSlug,
  certificateSearchHaystack,
  dedupePublicCertificates,
  normalizeFromBlobOnly,
  normalizeFromLocal,
  normalizeFromMongo,
  publicCertificateToListRow,
  resolveCertificateStatus,
  stableBlobRecordId,
} from '../certificateNormalize.js';
import type { CertificateRecord } from '../certificateStore.js';

describe('buildCertSlug', () => {
  it('uses company name + certificate id only', () => {
    expect(buildCertSlug('Acme (Pty) Ltd', 'abc-123')).toBe('acme-pty-ltd-abc-123');
    expect(buildCertSlug('Acme', 'CERT-999')).toBe('acme-cert-999');
    expect(buildCertSlug('Acme', 'ABSA-2025-001')).toBe('acme-absa-2025-001');
  });

  it('returns null without id', () => {
    expect(buildCertSlug('Acme', null)).toBeNull();
  });
});

describe('normalizeFromBlobOnly', () => {
  it('creates a stable public row and derives company name from blob path', () => {
    const a = normalizeFromBlobOnly({
      name: '2026 01 01 Acme Industries (Pty) Ltd -EME.pdf',
      lastModified: '2025-01-01T00:00:00.000Z',
    });
    const b = normalizeFromBlobOnly({
      name: '2026 01 01 Acme Industries (Pty) Ltd -EME.pdf',
      lastModified: null,
    });
    expect(a.id).toBe(stableBlobRecordId('2026 01 01 Acme Industries (Pty) Ltd -EME.pdf'));
    expect(a.id).toBe(b.id);
    expect(a.companyName).toContain('Acme Industries');
    expect(a.metadataComplete).toBe(true);
    expect(a.slug).toBeTruthy();
  });
});

describe('resolveCertificateStatus', () => {
  it('marks processed certificates without expiry as valid when B-BBEE data exists', () => {
    expect(resolveCertificateStatus({
      extractionStatus: 'completed',
      bbbeeLevel: 1,
      companySize: 'EME',
      status: 'unknown',
    }, null)).toBe('valid');
  });

  it('uses expiry-derived status when expiry is present', () => {
    const future = new Date(Date.now() + 365 * 86400000);
    expect(resolveCertificateStatus({ status: 'unknown' }, future)).toBe('valid');
  });
});

describe('normalizeFromMongo', () => {
  it('returns null without mongo id', () => {
    expect(normalizeFromMongo({ blobName: 'public/x.pdf', supplierName: 'Co' })).toBeNull();
  });

  it('falls back to _id when id field is missing on legacy docs', () => {
    const c = normalizeFromMongo({
      _id: '507f1f77bcf86cd799439011',
      blobName: 'public/legacy.pdf',
      supplierName: 'Legacy Co',
    });
    expect(c?.id).toBe('507f1f77bcf86cd799439011');
    expect(c?.companyName).toBe('Legacy Co');
  });

  it('builds canonical slug from id', () => {
    const c = normalizeFromMongo({
      id: 'id-1',
      supplierName: 'Test Co',
      blobName: 'public/f.pdf',
      vatNumber: '4123456789',
      bbbeeLevel: 2,
    });
    expect(c?.slug).toBe('test-co-id-1');
    expect(c?.vatNumber).toBe('4123456789');
  });
});

describe('certificateSearchHaystack', () => {
  it('includes B-BBEE level and certificate number', () => {
    const hay = certificateSearchHaystack({
      companyName: 'X',
      vatNumber: null,
      fileName: 'f.pdf',
      bbbeeLevel: 4,
      certificateNumber: 'CN-88',
    });
    expect(hay).toContain('4');
    expect(hay).toContain('cn-88');
  });
});

describe('dedupePublicCertificates', () => {
  it('dedupes by id preferring one row per id', () => {
    const a = normalizeFromLocal(minimalLocal('id-a', 'Co A'));
    const dup = { ...a, companyName: 'Co A duplicate label' };
    const out = dedupePublicCertificates([a, dup]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('id-a');
  });

  it('dedupes by blobName and keeps the richer metadata row', () => {
    const blobOnly = normalizeFromBlobOnly({ name: 'public/acme.pdf', lastModified: '2025-01-01T00:00:00.000Z' });
    const mongo = normalizeFromMongo({
      id: 'mongo-id-1',
      blobName: 'public/acme.pdf',
      supplierName: 'Acme Corp',
      vatNumber: '4123456789',
    })!;
    const out = dedupePublicCertificates([blobOnly, mongo]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('mongo-id-1');
    expect(out[0].companyName).toBe('Acme Corp');
  });

  it('counts distinct blob-only rows without mongo metadata', () => {
    const rows = [
      normalizeFromBlobOnly({ name: 'public/a.pdf', lastModified: null }),
      normalizeFromBlobOnly({ name: 'public/b.pdf', lastModified: null }),
      normalizeFromBlobOnly({ name: 'public/c.pdf', lastModified: null }),
    ];
    expect(dedupePublicCertificates(rows)).toHaveLength(3);
  });

  it('includes blob-only rows in deduped output for headline totals', () => {
    const incomplete = normalizeFromBlobOnly({ name: 'zzzzzz-nonsense-xyzzy.pdf', lastModified: null });
    const out = dedupePublicCertificates([incomplete]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('unknown');
  });
});

describe('publicCertificateToListRow', () => {
  it('exposes certificateNumber on list rows', () => {
    const c = normalizeFromMongo({
      id: 'x',
      supplierName: 'Co',
      blobName: 'b',
      certificateNumber: 'NUM-1',
    })!;
    const row = publicCertificateToListRow(c);
    expect(row.certificateNumber).toBe('NUM-1');
  });

  it('classifies processed mongo docs without expiry as valid in list rows', () => {
    const c = normalizeFromMongo({
      id: 'proc-1',
      blobName: '2026 06 19 Precision Scanning and Printing cc - EME.jpg',
      supplierName: 'Precision Scanning and Printing cc',
      extractionStatus: 'completed',
      companySize: 'EME',
      bbbeeLevel: 1,
      status: 'unknown',
    })!;
    expect(c.status).toBe('valid');
    const row = publicCertificateToListRow(c);
    expect(row.status).toBe('valid');
    expect(row.metadataComplete).toBe(true);
  });

  it('keeps truly unprocessed blob-only rows as unknown', () => {
    const c = normalizeFromBlobOnly({ name: 'zzzzzz-nonsense-xyzzy.pdf', lastModified: null });
    const row = publicCertificateToListRow(c);
    expect(row.status).toBe('unknown');
  });
});

function minimalLocal(id: string, companyName: string): CertificateRecord {
  return {
    id,
    blobName: `public/${id}.pdf`,
    fileName: 'f.pdf',
    filePath: '/tmp/f.pdf',
    mimeType: 'application/pdf',
    size: 1,
    companyName,
    vatNumber: null,
    companySize: null,
    blackOwnership: null,
    blackWomenOwnership: null,
    bbbeeLevel: null,
    expiryDate: null,
    issueDate: null,
    status: 'unknown',
    uploadedByUserId: null,
    organizationId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
