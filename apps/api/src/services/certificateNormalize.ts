/**
 * Canonical public certificate model — single source of truth for list, detail,
 * search, and SEO surfaces.
 */
import type { CertificateRecord as LocalStoreRecord } from './certificateStore.js';

export type CertificateSource = 'mongo' | 'azure' | 'local';
export type PublicCertificateStatus = 'valid' | 'expiring' | 'expired' | 'unknown';

/** Public registry record (API list, detail, SEO). */
export interface PublicCertificate {
  id: string | null;
  slug: string | null;
  companyName: string;
  vatNumber: string | null;
  companySize: string | null;
  bbbeeLevel: number | null;
  bbbeeScore: number | null;
  certificateNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  agency: string | null;
  verified: boolean;
  blobName: string | null;
  fileName: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  source: CertificateSource;
  status: PublicCertificateStatus;
  /** False when the record would rely on filename-only guessing. */
  metadataComplete: boolean;
  lastModified: string | null;
}

/** Legacy list row shape — `name` is the blob key for /download. */
export interface CertificateListRow {
  name: string;
  fileName: string;
  companyName: string;
  vatNumber: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  bbbeeLevel: number | null;
  certificateNumber: string | null;
  expiryDate: string | null;
  status: PublicCertificateStatus;
  lastModified: string | null;
  id: string | null;
  slug: string | null;
  verified: boolean;
  metadataComplete: boolean;
}

export function slugifyCertificatePart(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Stable public slug — always derived from company name + certificate id. */
export function buildCertSlug(
  companyName: string | null | undefined,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  const a = slugifyCertificatePart(companyName) || 'company';
  const b = slugifyCertificatePart(id) || 'certificate';
  return `${a}-${b}`;
}

export function statusFromExpiryDate(
  expiry: Date | string | null | undefined,
): PublicCertificateStatus {
  if (!expiry) return 'unknown';
  const t = expiry instanceof Date ? expiry.getTime() : new Date(expiry).getTime();
  if (!Number.isFinite(t)) return 'unknown';
  const now = Date.now();
  if (t < now) return 'expired';
  if (t <= now + 60 * 24 * 60 * 60 * 1000) return 'expiring';
  return 'valid';
}

function isoDay(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function finiteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v != null && v !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export type ParsedCertificateFields = {
  expiryDate?: Date | null;
  issueDate?: Date | null;
  bbbeeLevel?: number | null;
  supplierName?: string | null;
  bbbeeScore?: number | null;
  blackOwnership?: number | null;
  blackWomenOwnership?: number | null;
  verificationAgency?: string | null;
  certificateNumber?: string | null;
};

function mongoHasIdentity(doc: Record<string, unknown> | null | undefined): boolean {
  if (!doc) return false;
  return typeof doc.id === 'string' && doc.id.length > 0;
}

export function normalizeFromLocal(rec: LocalStoreRecord): PublicCertificate {
  const slug = buildCertSlug(rec.companyName, rec.id);
  return {
    id: rec.id,
    slug,
    companyName: rec.companyName?.trim() || 'Unknown company',
    vatNumber: rec.vatNumber ?? null,
    companySize: rec.companySize ?? null,
    bbbeeLevel: rec.bbbeeLevel ?? null,
    bbbeeScore: null,
    certificateNumber: null,
    issueDate: rec.issueDate ?? null,
    expiryDate: rec.expiryDate ?? null,
    agency: null,
    verified: !!rec.verified,
    blobName: rec.blobName,
    fileName: rec.fileName,
    blackOwnership: rec.blackOwnership ?? null,
    blackWomenOwnership: rec.blackWomenOwnership ?? null,
    source: 'local',
    status: rec.status,
    metadataComplete: true,
    lastModified: rec.updatedAt ?? null,
  };
}

export function normalizeFromMongo(
  doc: Record<string, unknown>,
  opts: { blobLastModified?: string | null; fileNameFallback?: string } = {},
): PublicCertificate | null {
  const id = typeof doc.id === 'string' ? doc.id : null;
  if (!id) return null;

  const blobName = typeof doc.blobName === 'string' ? doc.blobName : null;
  const fileName =
    opts.fileNameFallback
    || (typeof doc.fileName === 'string' ? doc.fileName : null)
    || (blobName?.split('/').pop() ?? null)
    || 'certificate.pdf';

  const supplierName = typeof doc.supplierName === 'string' ? doc.supplierName.trim() : '';
  const companyName = supplierName || 'Unknown company';
  const expiryRaw = doc.expiryDate;
  const expiry = expiryRaw ? new Date(expiryRaw as string | Date) : null;
  const issueRaw = doc.issueDate;
  const issue = issueRaw ? new Date(issueRaw as string | Date) : null;

  const storedSlug = typeof doc.slug === 'string' && doc.slug ? doc.slug : null;
  const canonicalSlug = buildCertSlug(companyName, id);
  const slug = canonicalSlug ?? storedSlug;

  const status =
    (doc.status as PublicCertificateStatus | undefined)
    || statusFromExpiryDate(expiry);

  return {
    id,
    slug,
    companyName,
    vatNumber: typeof doc.vatNumber === 'string' ? doc.vatNumber : null,
    companySize: typeof doc.companySize === 'string' ? doc.companySize : null,
    bbbeeLevel: finiteNumber(doc.bbbeeLevel),
    bbbeeScore: finiteNumber(doc.bbbeeScore),
    certificateNumber: typeof doc.certificateNumber === 'string' ? doc.certificateNumber : null,
    issueDate: isoDay(issue),
    expiryDate: isoDay(expiry),
    agency: typeof doc.verificationAgency === 'string' ? doc.verificationAgency : null,
    verified: !!doc.verified,
    blobName,
    fileName,
    blackOwnership: finiteNumber(doc.blackOwnership),
    blackWomenOwnership: finiteNumber(doc.blackWomenOwnership),
    source: 'mongo',
    status,
    metadataComplete: !!supplierName,
    lastModified:
      opts.blobLastModified
      || (doc.updatedAt ? new Date(doc.updatedAt as string | Date).toISOString() : null)
      || null,
  };
}

export function normalizeFromMongoAndParsed(
  doc: Record<string, unknown> | null,
  parsed: ParsedCertificateFields | null,
  blob: { name: string; lastModified: string | Date | null },
): PublicCertificate | null {
  if (!mongoHasIdentity(doc)) return null;

  const base = normalizeFromMongo(doc!, {
    blobLastModified:
      blob.lastModified instanceof Date
        ? blob.lastModified.toISOString()
        : (blob.lastModified ?? null),
    fileNameFallback: blob.name.split('/').pop() || blob.name,
  });
  if (!base) return null;

  if (!parsed) return { ...base, source: 'azure' };

  const supplierName = parsed.supplierName?.trim();
  const companyName = base.companyName === 'Unknown company' && supplierName
    ? supplierName
    : base.companyName;

  const expiry = parsed.expiryDate ?? (base.expiryDate ? new Date(base.expiryDate) : null);

  return {
    ...base,
    source: 'azure',
    companyName,
    bbbeeLevel: base.bbbeeLevel ?? parsed.bbbeeLevel ?? null,
    bbbeeScore: base.bbbeeScore ?? parsed.bbbeeScore ?? null,
    blackOwnership: base.blackOwnership ?? parsed.blackOwnership ?? null,
    blackWomenOwnership: base.blackWomenOwnership ?? parsed.blackWomenOwnership ?? null,
    agency: base.agency ?? parsed.verificationAgency ?? null,
    certificateNumber: base.certificateNumber ?? parsed.certificateNumber ?? null,
    issueDate: base.issueDate ?? isoDay(parsed.issueDate ?? null),
    expiryDate: base.expiryDate ?? isoDay(expiry),
    status: base.status === 'unknown' ? statusFromExpiryDate(expiry) : base.status,
    metadataComplete: base.metadataComplete || !!supplierName,
    slug: buildCertSlug(companyName, base.id),
  };
}

export function publicCertificateToListRow(c: PublicCertificate): CertificateListRow {
  return {
    name: c.blobName || '',
    fileName: c.fileName || c.blobName?.split('/').pop() || '',
    companyName: c.metadataComplete ? c.companyName : 'Unknown company',
    vatNumber: c.vatNumber,
    companySize: c.companySize,
    blackOwnership: c.blackOwnership,
    blackWomenOwnership: c.blackWomenOwnership,
    bbbeeLevel: c.bbbeeLevel,
    certificateNumber: c.certificateNumber,
    expiryDate: c.expiryDate,
    status: c.metadataComplete ? c.status : 'unknown',
    lastModified: c.lastModified,
    id: c.id,
    slug: c.slug,
    verified: c.verified,
    metadataComplete: c.metadataComplete,
  };
}

export function publicCertificateToDetailJson(c: PublicCertificate) {
  return {
    id: c.id,
    slug: c.slug,
    companyName: c.metadataComplete ? c.companyName : 'Unknown company',
    vatNumber: c.vatNumber,
    companySize: c.companySize,
    bbbeeLevel: c.bbbeeLevel,
    bbbeeScore: c.bbbeeScore,
    blackOwnership: c.blackOwnership,
    blackWomenOwnership: c.blackWomenOwnership,
    verificationAgency: c.agency,
    agency: c.agency,
    certificateNumber: c.certificateNumber,
    issueDate: c.issueDate,
    expiryDate: c.expiryDate,
    blobName: c.blobName,
    fileName: c.fileName,
    status: c.metadataComplete ? c.status : 'unknown',
    verified: c.verified,
    updatedAt: c.lastModified,
    metadataComplete: c.metadataComplete,
    source: c.source,
  };
}

/** Deduplicate by canonical id, then slug. Later record wins (more recent load order). */
export function dedupePublicCertificates(certs: PublicCertificate[]): PublicCertificate[] {
  const byId = new Map<string, PublicCertificate>();
  const bySlug = new Map<string, PublicCertificate>();
  const out: PublicCertificate[] = [];

  for (const c of certs) {
    if (c.id) {
      byId.set(c.id, c);
    } else if (c.slug) {
      bySlug.set(c.slug, c);
    }
  }

  const seenSlug = new Set<string>();
  for (const c of byId.values()) {
    if (c.slug) seenSlug.add(c.slug);
    out.push(c);
  }
  for (const c of bySlug.values()) {
    if (c.slug && seenSlug.has(c.slug)) continue;
    out.push(c);
  }

  return out;
}

export function certificateSearchHaystack(c: Pick<
  PublicCertificate,
  'companyName' | 'vatNumber' | 'fileName' | 'bbbeeLevel' | 'certificateNumber'
>): string {
  return `
    ${c.companyName || ''}
    ${c.vatNumber || ''}
    ${c.fileName || ''}
    ${c.bbbeeLevel ?? ''}
    ${c.certificateNumber || ''}
  `.toLowerCase();
}
