import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface CertificateVersionLite {
  blobName: string;
  fileName: string | null;
  expiryDate: string | null;
  bbbeeLevel: number | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  companySize: string | null;
  uploadedByUserId: string | null;
  uploadedAt: string;
  replacedAt: string;
}

export interface CertificateRecord {
  id: string;
  blobName: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  companyName: string;
  vatNumber: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  bbbeeLevel: number | null;
  expiryDate: string | null;
  issueDate: string | null;
  status: 'valid' | 'expiring' | 'expired' | 'unknown';
  uploadedByUserId: string | null;
  organizationId: string | null;
  // Phase 1 — verification + versioning
  verified?: boolean;
  verifiedBy?: string | null;
  verifiedByName?: string | null;
  verifiedAt?: string | null;
  versions?: CertificateVersionLite[];
  reportCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CertificateReportRecord {
  id: string;
  certificateId: string;
  certificateSlug: string | null;
  reason: 'incorrect-data' | 'expired' | 'fraudulent' | 'duplicate' | 'other';
  message: string;
  email: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export function normalizeVat(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).replace(/\s+/g, '').toUpperCase();
  return s || null;
}

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'certificates');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function statusFromExpiry(expiryDate: string | null): CertificateRecord['status'] {
  if (!expiryDate) return 'unknown';
  const t = new Date(expiryDate).getTime();
  if (!Number.isFinite(t)) return 'unknown';
  const now = Date.now();
  if (t < now) return 'expired';
  const sixtyDays = now + 60 * 24 * 60 * 60 * 1000;
  if (t <= sixtyDays) return 'expiring';
  return 'valid';
}

class CertificateStore {
  private records = new Map<string, CertificateRecord>();
  private reports = new Map<string, CertificateReportRecord>();
  private loaded = false;
  private indexPath = path.join(UPLOAD_DIR, '_index.json');
  private reportsPath = path.join(UPLOAD_DIR, '_reports.json');

  private load() {
    if (this.loaded) return;
    ensureUploadDir();
    try {
      if (fs.existsSync(this.indexPath)) {
        const raw = fs.readFileSync(this.indexPath, 'utf-8');
        const arr = JSON.parse(raw) as CertificateRecord[];
        for (const r of arr) {
          // Recompute status on load (in case time has passed)
          r.status = statusFromExpiry(r.expiryDate);
          // Defaults for Phase 1 fields when loading older index files
          if (typeof r.verified !== 'boolean') r.verified = false;
          if (!Array.isArray(r.versions)) r.versions = [];
          if (typeof r.reportCount !== 'number') r.reportCount = 0;
          this.records.set(r.id, r);
        }
      }
    } catch (err) {
      // ignore load errors — start fresh
    }
    try {
      if (fs.existsSync(this.reportsPath)) {
        const raw = fs.readFileSync(this.reportsPath, 'utf-8');
        const arr = JSON.parse(raw) as CertificateReportRecord[];
        for (const r of arr) this.reports.set(r.id, r);
      }
    } catch {
      // ignore
    }
    this.loaded = true;
  }

  private persist() {
    ensureUploadDir();
    try {
      const arr = Array.from(this.records.values());
      fs.writeFileSync(this.indexPath, JSON.stringify(arr, null, 2));
    } catch (err) {
      // best-effort persistence
    }
  }

  private persistReports() {
    ensureUploadDir();
    try {
      const arr = Array.from(this.reports.values());
      fs.writeFileSync(this.reportsPath, JSON.stringify(arr, null, 2));
    } catch {
      // best-effort
    }
  }

  /**
   * Write a raw file to disk and return its blobName/filePath without
   * creating a metadata record. Used by the versioning path so we can attach
   * the new file to an existing record instead of producing a duplicate.
   */
  writeRawFile(input: {
    fileName: string;
    buffer: Buffer;
    organizationId?: string | null;
  }): { blobName: string; filePath: string; sanitizedName: string } {
    this.load();
    ensureUploadDir();
    const id = randomUUID();
    const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const orgDir = path.join(UPLOAD_DIR, input.organizationId || 'public');
    if (!fs.existsSync(orgDir)) fs.mkdirSync(orgDir, { recursive: true });
    const filePath = path.join(orgDir, `${id}-${sanitizedName}`);
    fs.writeFileSync(filePath, input.buffer);
    const blobName = `${input.organizationId || 'public'}/${id}-${sanitizedName}`;
    return { blobName, filePath, sanitizedName };
  }

  /**
   * Find an existing record by normalized VAT number. Used for VAT dedupe in
   * the upload handler so we can either reject the upload or convert it into
   * a new version of the existing certificate.
   */
  getByVatNumber(vat: string | null | undefined): CertificateRecord | null {
    if (!vat) return null;
    this.load();
    const norm = normalizeVat(vat);
    if (!norm) return null;
    for (const r of this.records.values()) {
      if (normalizeVat(r.vatNumber) === norm) return r;
    }
    return null;
  }

  /**
   * Push the supplied snapshot onto the record's `versions` array and update
   * the top-level fields with the new payload. Returns the updated record.
   */
  pushVersion(id: string, snapshot: CertificateVersionLite, updates: Partial<CertificateRecord>): CertificateRecord | null {
    this.load();
    const rec = this.records.get(id);
    if (!rec) return null;
    rec.versions = Array.isArray(rec.versions) ? rec.versions : [];
    rec.versions.push(snapshot);
    Object.assign(rec, updates, { updatedAt: new Date().toISOString() });
    rec.status = statusFromExpiry(rec.expiryDate);
    this.records.set(id, rec);
    this.persist();
    return rec;
  }

  setVerified(id: string, verified: boolean, by: string | null, byName: string | null): CertificateRecord | null {
    this.load();
    const rec = this.records.get(id);
    if (!rec) return null;
    rec.verified = verified;
    rec.verifiedBy = verified ? by : null;
    rec.verifiedByName = verified ? byName : null;
    rec.verifiedAt = verified ? new Date().toISOString() : null;
    rec.updatedAt = new Date().toISOString();
    this.records.set(id, rec);
    this.persist();
    return rec;
  }

  incrementReportCount(id: string, by = 1): void {
    this.load();
    const rec = this.records.get(id);
    if (!rec) return;
    rec.reportCount = (rec.reportCount || 0) + by;
    this.records.set(id, rec);
    this.persist();
  }

  patchRecord(id: string, fields: Partial<CertificateRecord>): CertificateRecord | null {
    this.load();
    const rec = this.records.get(id);
    if (!rec) return null;
    Object.assign(rec, fields, { updatedAt: new Date().toISOString() });
    if ('expiryDate' in fields) rec.status = statusFromExpiry(rec.expiryDate);
    this.records.set(id, rec);
    this.persist();
    return rec;
  }

  // ---- Reports ----------------------------------------------------------

  addReport(input: Omit<CertificateReportRecord, 'id' | 'createdAt' | 'status' | 'reviewedBy' | 'reviewedAt' | 'reviewNotes'>): CertificateReportRecord {
    this.load();
    const rec: CertificateReportRecord = {
      ...input,
      id: randomUUID(),
      status: 'open',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      createdAt: new Date().toISOString(),
    };
    this.reports.set(rec.id, rec);
    this.persistReports();
    return rec;
  }

  listReports(): CertificateReportRecord[] {
    this.load();
    return Array.from(this.reports.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  add(input: {
    fileName: string;
    buffer: Buffer;
    mimeType: string;
    companyName: string;
    vatNumber?: string | null;
    companySize?: string | null;
    blackOwnership?: number | null;
    blackWomenOwnership?: number | null;
    bbbeeLevel?: number | null;
    expiryDate?: string | null;
    uploadedByUserId?: string | null;
    organizationId?: string | null;
  }): CertificateRecord {
    this.load();
    ensureUploadDir();
    const id = randomUUID();
    const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const blobName = `${input.organizationId || 'public'}/${id}-${sanitizedName}`;
    const orgDir = path.join(UPLOAD_DIR, input.organizationId || 'public');
    if (!fs.existsSync(orgDir)) fs.mkdirSync(orgDir, { recursive: true });
    const filePath = path.join(orgDir, `${id}-${sanitizedName}`);
    fs.writeFileSync(filePath, input.buffer);

    const expiry = input.expiryDate || null;
    const now = new Date().toISOString();
    const rec: CertificateRecord = {
      id,
      blobName,
      fileName: input.fileName,
      filePath,
      mimeType: input.mimeType,
      size: input.buffer.length,
      companyName: input.companyName.trim(),
      vatNumber: input.vatNumber?.toString().trim() || null,
      companySize: input.companySize || null,
      blackOwnership:
        typeof input.blackOwnership === 'number' && Number.isFinite(input.blackOwnership)
          ? input.blackOwnership
          : null,
      blackWomenOwnership:
        typeof input.blackWomenOwnership === 'number' && Number.isFinite(input.blackWomenOwnership)
          ? input.blackWomenOwnership
          : null,
      bbbeeLevel:
        typeof input.bbbeeLevel === 'number' && Number.isFinite(input.bbbeeLevel)
          ? input.bbbeeLevel
          : null,
      expiryDate: expiry,
      issueDate: null,
      status: statusFromExpiry(expiry),
      uploadedByUserId: input.uploadedByUserId || null,
      organizationId: input.organizationId || null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, rec);
    this.persist();
    return rec;
  }

  list(): CertificateRecord[] {
    this.load();
    return Array.from(this.records.values()).map((r) => ({
      ...r,
      status: statusFromExpiry(r.expiryDate),
    }));
  }

  getByBlobName(blobName: string): CertificateRecord | null {
    this.load();
    for (const r of this.records.values()) {
      if (r.blobName === blobName) return r;
    }
    return null;
  }

  getById(id: string): CertificateRecord | null {
    this.load();
    return this.records.get(id) || null;
  }

  /**
   * Cache metadata for a blob whose bytes live elsewhere (e.g. Azure).
   * Used as a Mongo-substitute when Mongo is unavailable but Azure is configured,
   * so /list can still surface the new metadata fields (vatNumber, companySize…).
   * No file is written to disk.
   */
  addMetadata(input: {
    blobName: string;
    fileName: string;
    mimeType: string;
    size: number;
    companyName: string;
    vatNumber?: string | null;
    companySize?: string | null;
    blackOwnership?: number | null;
    blackWomenOwnership?: number | null;
    bbbeeLevel?: number | null;
    expiryDate?: string | null;
    uploadedByUserId?: string | null;
    organizationId?: string | null;
  }): CertificateRecord {
    this.load();
    const existing = this.getByBlobName(input.blobName);
    const id = existing?.id || randomUUID();
    const now = new Date().toISOString();
    const expiry = input.expiryDate || null;
    const rec: CertificateRecord = {
      id,
      blobName: input.blobName,
      fileName: input.fileName,
      filePath: '',
      mimeType: input.mimeType,
      size: input.size,
      companyName: input.companyName.trim(),
      vatNumber: input.vatNumber?.toString().trim() || null,
      companySize: input.companySize || null,
      blackOwnership:
        typeof input.blackOwnership === 'number' && Number.isFinite(input.blackOwnership)
          ? input.blackOwnership
          : null,
      blackWomenOwnership:
        typeof input.blackWomenOwnership === 'number' && Number.isFinite(input.blackWomenOwnership)
          ? input.blackWomenOwnership
          : null,
      bbbeeLevel:
        typeof input.bbbeeLevel === 'number' && Number.isFinite(input.bbbeeLevel)
          ? input.bbbeeLevel
          : null,
      expiryDate: expiry,
      issueDate: null,
      status: statusFromExpiry(expiry),
      uploadedByUserId: input.uploadedByUserId || null,
      organizationId: input.organizationId || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.records.set(id, rec);
    this.persist();
    return rec;
  }
}

export const certificateStore = new CertificateStore();
