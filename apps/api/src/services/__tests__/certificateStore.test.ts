/**
 * Behavior tests for the local certificate store fallback.
 *
 * The store is the persistence layer that runs whenever Mongo is offline.
 * It owns: VAT-based dedupe lookup, verification flags, version history,
 * reports + report counts, and recompute-on-load of expiry status.
 *
 * We isolate test state by chdir-ing to a fresh tmp dir BEFORE importing the
 * store (it computes UPLOAD_DIR from process.cwd() at module load) and by
 * resetting modules between tests so the in-memory Map starts empty.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;
let originalCwd: string;

type StoreModule = typeof import('../certificateStore.js');
let mod: StoreModule;

beforeAll(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-store-test-'));
  process.chdir(tmpDir);
});

beforeEach(async () => {
  // Wipe disk artifacts so each test starts truly clean
  const uploadDir = path.join(tmpDir, 'uploads', 'certificates');
  if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });
  // Reset and re-import so the in-memory Map is fresh too
  vi.resetModules();
  mod = await import('../certificateStore.js');
});

afterAll(() => {
  process.chdir(originalCwd);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('normalizeVat', () => {
  it('strips whitespace and uppercases', () => {
    expect(mod.normalizeVat(' 412 345 6789 ')).toBe('4123456789');
    expect(mod.normalizeVat('zaVat-123')).toBe('ZAVAT-123');
  });

  it('returns null for empty / nullish input', () => {
    expect(mod.normalizeVat(null)).toBeNull();
    expect(mod.normalizeVat(undefined)).toBeNull();
    expect(mod.normalizeVat('')).toBeNull();
    expect(mod.normalizeVat('   ')).toBeNull();
  });
});

describe('add() + getById() + list()', () => {
  it('persists a record with computed status from the expiry date', () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rec = mod.certificateStore.add({
      fileName: 'acme.pdf',
      buffer: Buffer.from('fake-pdf'),
      mimeType: 'application/pdf',
      companyName: 'Acme Manufacturing (Pty) Ltd',
      vatNumber: '4123456789',
      companySize: 'QSE',
      blackOwnership: 51,
      blackWomenOwnership: 30,
      bbbeeLevel: 2,
      expiryDate: future,
    });

    expect(rec.id).toMatch(/[a-f0-9-]{36}/);
    expect(rec.companyName).toBe('Acme Manufacturing (Pty) Ltd');
    expect(rec.status).toBe('valid');
    expect(rec.verified ?? false).toBe(false);

    const fetched = mod.certificateStore.getById(rec.id);
    expect(fetched?.id).toBe(rec.id);

    const all = mod.certificateStore.list();
    expect(all).toHaveLength(1);
  });

  it('marks past-expiry certificates as expired', () => {
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rec = mod.certificateStore.add({
      fileName: 'old.pdf',
      buffer: Buffer.from('x'),
      mimeType: 'application/pdf',
      companyName: 'Old Co',
      vatNumber: '99',
      expiryDate: past,
    });
    expect(rec.status).toBe('expired');
  });

  it('marks unknown when no expiry given', () => {
    const rec = mod.certificateStore.add({
      fileName: 'noexp.pdf',
      buffer: Buffer.from('x'),
      mimeType: 'application/pdf',
      companyName: 'No Expiry Co',
    });
    expect(rec.status).toBe('unknown');
  });
});

describe('getByVatNumber()', () => {
  it('finds a record by normalized VAT regardless of formatting', () => {
    mod.certificateStore.add({
      fileName: 'a.pdf',
      buffer: Buffer.from('x'),
      mimeType: 'application/pdf',
      companyName: 'Acme',
      vatNumber: '4123456789',
    });
    expect(mod.certificateStore.getByVatNumber('  4123 456 789')?.companyName).toBe('Acme');
    expect(mod.certificateStore.getByVatNumber('NOT-A-VAT')).toBeNull();
  });

  it('returns null when VAT lookup is empty', () => {
    expect(mod.certificateStore.getByVatNumber(null)).toBeNull();
    expect(mod.certificateStore.getByVatNumber('')).toBeNull();
  });
});

describe('setVerified()', () => {
  it('sets verified + verifiedBy + verifiedAt when verified=true', () => {
    const rec = mod.certificateStore.add({
      fileName: 'a.pdf',
      buffer: Buffer.from('x'),
      mimeType: 'application/pdf',
      companyName: 'Acme',
    });
    const updated = mod.certificateStore.setVerified(rec.id, true, 'admin-user-1', 'Alice Admin');
    expect(updated?.verified).toBe(true);
    expect(updated?.verifiedBy).toBe('admin-user-1');
    expect(updated?.verifiedByName).toBe('Alice Admin');
    expect(updated?.verifiedAt).toBeTruthy();
  });

  it('clears verified metadata when verified=false', () => {
    const rec = mod.certificateStore.add({
      fileName: 'a.pdf',
      buffer: Buffer.from('x'),
      mimeType: 'application/pdf',
      companyName: 'Acme',
    });
    mod.certificateStore.setVerified(rec.id, true, 'admin-1', 'A');
    const cleared = mod.certificateStore.setVerified(rec.id, false, null, null);
    expect(cleared?.verified).toBe(false);
    expect(cleared?.verifiedBy).toBeNull();
    expect(cleared?.verifiedByName).toBeNull();
    expect(cleared?.verifiedAt).toBeNull();
  });

  it('returns null for unknown id', () => {
    expect(mod.certificateStore.setVerified('does-not-exist', true, 'a', 'A')).toBeNull();
  });
});

describe('reports + reportCount', () => {
  it('addReport stores reports with status=open and listReports returns them sorted by createdAt desc', () => {
    const rec = mod.certificateStore.add({
      fileName: 'a.pdf',
      buffer: Buffer.from('x'),
      mimeType: 'application/pdf',
      companyName: 'Acme',
    });
    const r1 = mod.certificateStore.addReport({
      certificateId: rec.id,
      certificateSlug: 'acme-1',
      reason: 'incorrect-data',
      message: 'BBBEE level looks wrong',
      email: 'reporter@example.com',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    });
    const r2 = mod.certificateStore.addReport({
      certificateId: rec.id,
      certificateSlug: 'acme-1',
      reason: 'fraudulent',
      message: 'Looks fake',
      email: null,
      ipAddress: null,
      userAgent: null,
    });

    const all = mod.certificateStore.listReports();
    expect(all).toHaveLength(2);
    // Both reports are present (order-independent so we don't depend on clock granularity)
    const ids = all.map((r) => r.id).sort();
    expect(ids).toEqual([r1.id, r2.id].sort());
    // All reports start with status=open and createdAt set
    for (const r of all) {
      expect(r.status).toBe('open');
      expect(r.createdAt).toBeTruthy();
    }
    // Sort contract: listReports returns desc-by-createdAt, so any pair must
    // satisfy a.createdAt >= b.createdAt for a appearing before b.
    for (let i = 0; i < all.length - 1; i++) {
      expect(all[i].createdAt >= all[i + 1].createdAt).toBe(true);
    }
  });

  it('incrementReportCount bumps the certificate counter', () => {
    const rec = mod.certificateStore.add({
      fileName: 'a.pdf',
      buffer: Buffer.from('x'),
      mimeType: 'application/pdf',
      companyName: 'Acme',
    });
    mod.certificateStore.incrementReportCount(rec.id, 1);
    mod.certificateStore.incrementReportCount(rec.id, 2);
    const fetched = mod.certificateStore.getById(rec.id);
    expect(fetched?.reportCount).toBe(3);
  });
});

describe('pushVersion()', () => {
  it('appends a snapshot to versions[] and updates the latest fields', () => {
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rec = mod.certificateStore.add({
      fileName: 'v1.pdf',
      buffer: Buffer.from('x'),
      mimeType: 'application/pdf',
      companyName: 'Acme',
      bbbeeLevel: 4,
      expiryDate: future,
    });
    const snapshot = {
      blobName: rec.blobName,
      fileName: rec.fileName,
      expiryDate: rec.expiryDate,
      bbbeeLevel: rec.bbbeeLevel,
      blackOwnership: rec.blackOwnership,
      blackWomenOwnership: rec.blackWomenOwnership,
      companySize: rec.companySize,
      uploadedByUserId: rec.uploadedByUserId,
      uploadedAt: rec.updatedAt,
      replacedAt: new Date().toISOString(),
    };
    const newExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const updated = mod.certificateStore.pushVersion(rec.id, snapshot, {
      blobName: 'public/new-file.pdf',
      fileName: 'v2.pdf',
      bbbeeLevel: 2,
      expiryDate: newExpiry,
    });
    expect(updated?.versions).toHaveLength(1);
    expect(updated?.versions?.[0].fileName).toBe('v1.pdf');
    expect(updated?.bbbeeLevel).toBe(2);
    expect(updated?.fileName).toBe('v2.pdf');
    expect(updated?.status).toBe('valid');
  });
});
