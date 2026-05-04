import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

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
  createdAt: string;
  updatedAt: string;
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
  private loaded = false;
  private indexPath = path.join(UPLOAD_DIR, '_index.json');

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
          this.records.set(r.id, r);
        }
      }
    } catch (err) {
      // ignore load errors — start fresh
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
