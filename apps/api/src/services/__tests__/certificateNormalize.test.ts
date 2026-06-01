import { describe, it, expect } from 'vitest';
import {
  buildCertSlug,
  certificateSearchHaystack,
  dedupePublicCertificates,
  normalizeFromLocal,
  normalizeFromMongo,
  publicCertificateToListRow,
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

describe('normalizeFromMongo', () => {
  it('returns null without mongo id', () => {
    expect(normalizeFromMongo({ blobName: 'public/x.pdf', supplierName: 'Co' })).toBeNull();
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
