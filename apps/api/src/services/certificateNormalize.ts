/**
 * Canonical public certificate model — single source of truth for list, detail,
 * search, and SEO surfaces.
 */
import { createHash } from 'crypto';
import type { CertificateRecord as LocalStoreRecord } from './certificateStore.js';
import { cleanNameFromBlobPath } from './certificateExtractor.js';

export type CertificateSource = 'mongo' | 'azure' | 'local';
export type PublicCertificateStatus = 'valid' | 'expiring' | 'expired' | 'unknown';

/** Public registry record (API list, detail, SEO). */
export interface PublicCertificate {
  id: string | null;
  slug: string | null;
  companyName: string;
  tradingName?: string | null;
  registrationNumber?: string | null;
  vatNumber: string | null;
  taxNumber?: string | null;
  companySize: string | null;
  bbbeeLevel: number | null;
  bbbeeLevelStatus?: string | null;
  certificateType?: string | null;
  procurementRecognition?: number | null;
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
  flowThroughBlackOwnership?: number | null;
  blackDesignatedGroupOwnership?: number | null;
  empoweringSupplier?: boolean | null;
  valueAddingSupplier?: boolean | null;
  measurementPeriod?: string | null;
  firstProcurementDate?: string | null;
  sizeAtFirstProcurement?: string | null;
  sdRecipient?: boolean | null;
  threeYearContract?: boolean | null;
  annualSpend?: number | null;
  location?: string | null;
  businessUnit?: string | null;
  sectorCode?: string | null;
  sectorName?: string | null;
  sanasAccreditationNumber?: string | null;
  commissionerDetails?: string | null;
  physicalAddress?: string | null;
  contactDetails?: Record<string, string> | null;
  enrichmentStatus?: string | null;
  reviewFields?: string[];
  fieldConfidence?: Record<string, unknown>;
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
  tradingName?: string | null;
  registrationNumber?: string | null;
  vatNumber: string | null;
  taxNumber?: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  bbbeeLevel: number | null;
  bbbeeLevelStatus?: string | null;
  certificateType?: string | null;
  procurementRecognition?: number | null;
  certificateNumber: string | null;
  issueDate?: string | null;
  expiryDate: string | null;
  agency?: string | null;
  sanasAccreditationNumber?: string | null;
  status: PublicCertificateStatus;
  lastModified: string | null;
  id: string | null;
  slug: string | null;
  verified: boolean;
  metadataComplete: boolean;
  sectorCode?: string | null;
  sectorName?: string | null;
  enrichmentStatus?: string | null;
  reviewFields?: string[];
  fieldConfidence?: Record<string, unknown>;
  location?: string | null;
  businessUnit?: string | null;
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

export function blobBasename(blobName: string): string {
  return blobName.split('/').pop() || blobName;
}

/** Prefer expiry-derived status; processed certs without expiry stay active when B-BBEE data exists. */
export function resolveCertificateStatus(
  doc: Record<string, unknown>,
  expiry: Date | null,
): PublicCertificateStatus {
  if (expiry && Number.isFinite(expiry.getTime())) {
    return statusFromExpiryDate(expiry);
  }
  if (doc.extractionStatus === 'completed') {
    if (
      finiteNumber(doc.bbbeeLevel) != null
      || (typeof doc.companySize === 'string' && doc.companySize.trim())
      || (typeof doc.vatNumber === 'string' && doc.vatNumber.trim())
    ) {
      return 'valid';
    }
  }
  const stored = doc.status as PublicCertificateStatus | undefined;
  if (stored && stored !== 'unknown') return stored;
  return 'unknown';
}

export function isMetadataSubstantivelyComplete(
  doc: Record<string, unknown>,
  companyName: string,
): boolean {
  if (typeof doc.supplierName === 'string' && doc.supplierName.trim()) return true;
  if (doc.extractionStatus === 'completed') return true;
  return !!companyName && companyName !== 'Unknown company';
}

export function deriveCompanyNameFromBlob(blobName: string, fileName?: string | null): string {
  const fromPath = cleanNameFromBlobPath(blobName);
  if (fromPath) return fromPath;
  if (fileName) {
    const fromFile = cleanNameFromBlobPath(fileName);
    if (fromFile) return fromFile;
  }
  return 'Unknown company';
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

/** Stable synthetic id for Azure blobs that have no Mongo metadata row yet. */
export function stableBlobRecordId(blobName: string): string {
  const hash = createHash('sha256').update(blobName).digest('hex').slice(0, 32);
  return `blob:${hash}`;
}

export function isSyntheticBlobRecordId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('blob:');
}

function resolveMongoDocumentId(doc: Record<string, unknown>): string | null {
  if (typeof doc.id === 'string' && doc.id.length > 0) return doc.id;
  if (doc._id != null) return String(doc._id);
  return null;
}

function mongoHasIdentity(doc: Record<string, unknown> | null | undefined): doc is Record<string, unknown> {
  return !!doc && !!resolveMongoDocumentId(doc);
}

function readExtendedFields(doc: Record<string, unknown>) {
  const boolOrNull = (v: unknown): boolean | null =>
    typeof v === 'boolean' ? v : null;
  const strOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const objectOrNull = (v: unknown): Record<string, string> | null =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, value]) => typeof value === 'string' && value.trim())
            .map(([key, value]) => [key, String(value).trim()]),
        )
      : null;
  const firstProc = doc.firstProcurementDate;
  const contactDetails = objectOrNull(doc.contactDetails);
  return {
    tradingName: strOrNull(doc.tradingName),
    // Two writers, one field on the wire: the regex enrichment fills
    // `registrationNumber`, Document Intelligence fills `companyRegistrationNumber`
    // (nothing else does). Reading only the first made a paid-for DI field
    // invisible to the API, the Hub and the procurement autofill.
    registrationNumber: strOrNull(doc.registrationNumber) ?? strOrNull(doc.companyRegistrationNumber),
    taxNumber: strOrNull(doc.taxNumber),
    bbbeeLevelStatus: strOrNull(doc.bbbeeLevelStatus),
    certificateType: strOrNull(doc.certificateType),
    procurementRecognition: finiteNumber(doc.procurementRecognition),
    flowThroughBlackOwnership: finiteNumber(doc.flowThroughBlackOwnership),
    blackDesignatedGroupOwnership: finiteNumber(doc.blackDesignatedGroupOwnership),
    empoweringSupplier: boolOrNull(doc.empoweringSupplier),
    valueAddingSupplier: boolOrNull(doc.valueAddingSupplier),
    measurementPeriod: strOrNull(doc.measurementPeriod),
    firstProcurementDate: firstProc ? isoDay(firstProc as string | Date) : null,
    sizeAtFirstProcurement: strOrNull(doc.sizeAtFirstProcurement),
    sdRecipient: boolOrNull(doc.sdRecipient),
    threeYearContract: boolOrNull(doc.threeYearContract),
    annualSpend: finiteNumber(doc.annualSpend),
    location: strOrNull(doc.location),
    businessUnit: strOrNull(doc.businessUnit),
    sectorCode: strOrNull(doc.sectorCode),
    sectorName: strOrNull(doc.sectorName),
    sanasAccreditationNumber: strOrNull(doc.sanasAccreditationNumber),
    commissionerDetails: strOrNull(doc.commissionerDetails),
    physicalAddress: strOrNull(doc.physicalAddress),
    contactDetails: contactDetails && Object.keys(contactDetails).length > 0 ? contactDetails : null,
    enrichmentStatus: strOrNull(doc.enrichmentStatus),
    reviewFields: Array.isArray(doc.reviewFields)
      ? doc.reviewFields.filter((field): field is string => typeof field === 'string' && field.trim().length > 0)
      : [],
    fieldConfidence: doc.fieldConfidence && typeof doc.fieldConfidence === 'object' && !Array.isArray(doc.fieldConfidence)
      ? doc.fieldConfidence as Record<string, unknown>
      : {},
  };
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
    flowThroughBlackOwnership: rec.flowThroughBlackOwnership ?? null,
    blackDesignatedGroupOwnership: rec.blackDesignatedGroupOwnership ?? null,
    empoweringSupplier: rec.empoweringSupplier ?? null,
    firstProcurementDate: rec.firstProcurementDate ?? null,
    sizeAtFirstProcurement: rec.sizeAtFirstProcurement ?? null,
    sdRecipient: rec.sdRecipient ?? null,
    threeYearContract: rec.threeYearContract ?? null,
    annualSpend: rec.annualSpend ?? null,
    location: rec.location ?? null,
    businessUnit: rec.businessUnit ?? null,
    sectorCode: rec.sectorCode ?? null,
    sectorName: rec.sectorName ?? null,
    enrichmentStatus: null,
    reviewFields: [],
    source: 'local',
    status: rec.status,
    metadataComplete: true,
    lastModified: rec.updatedAt ?? null,
  };
}

/**
 * Azure file with no Mongo metadata — shown in the registry as incomplete, not hidden.
 */
export function normalizeFromBlobOnly(blob: {
  name: string;
  lastModified: string | null;
}): PublicCertificate {
  const id = stableBlobRecordId(blob.name);
  const fileName = blobBasename(blob.name);
  const companyName = deriveCompanyNameFromBlob(blob.name, fileName);
  return {
    id,
    slug: buildCertSlug(companyName === 'Unknown company' ? 'unknown-company' : companyName, id),
    companyName,
    vatNumber: null,
    companySize: null,
    bbbeeLevel: null,
    bbbeeScore: null,
    certificateNumber: null,
    issueDate: null,
    expiryDate: null,
    agency: null,
    verified: false,
    blobName: blob.name,
    fileName,
    blackOwnership: null,
    blackWomenOwnership: null,
    source: 'azure',
    status: 'unknown',
    metadataComplete: companyName !== 'Unknown company',
    lastModified: blob.lastModified,
  };
}

export function normalizeFromMongo(
  doc: Record<string, unknown>,
  opts: { blobLastModified?: string | null; fileNameFallback?: string } = {},
): PublicCertificate | null {
  const id = resolveMongoDocumentId(doc);
  if (!id) return null;

  const blobName = typeof doc.blobName === 'string' ? doc.blobName : null;
  const fileName =
    opts.fileNameFallback
    || (typeof doc.fileName === 'string' ? doc.fileName : null)
    || (blobName?.split('/').pop() ?? null)
    || 'certificate.pdf';

  const supplierName = typeof doc.supplierName === 'string' ? doc.supplierName.trim() : '';
  const companyName = supplierName
    || deriveCompanyNameFromBlob(blobName || fileName, fileName);
  const expiryRaw = doc.expiryDate;
  const expiry = expiryRaw ? new Date(expiryRaw as string | Date) : null;
  const issueRaw = doc.issueDate;
  const issue = issueRaw ? new Date(issueRaw as string | Date) : null;

  const storedSlug = typeof doc.slug === 'string' && doc.slug ? doc.slug : null;
  const canonicalSlug = buildCertSlug(companyName, id);
  const slug = canonicalSlug ?? storedSlug;

  const status = resolveCertificateStatus(doc, expiry);

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
    ...readExtendedFields(doc),
    source: 'mongo',
    status,
    metadataComplete: isMetadataSubstantivelyComplete(doc, companyName),
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
    status: resolveCertificateStatus(doc!, expiry),
    metadataComplete: isMetadataSubstantivelyComplete(doc!, companyName) || !!supplierName,
    slug: buildCertSlug(companyName, base.id),
  };
}

export function publicCertificateToListRow(c: PublicCertificate): CertificateListRow {
  const displayName = c.metadataComplete
    ? c.companyName
    : 'Unknown company (metadata missing)';
  return {
    name: c.blobName || '',
    fileName: c.fileName || c.blobName?.split('/').pop() || '',
    companyName: displayName,
    tradingName: c.tradingName ?? null,
    registrationNumber: c.registrationNumber ?? null,
    vatNumber: c.vatNumber,
    taxNumber: c.taxNumber ?? null,
    companySize: c.companySize,
    blackOwnership: c.blackOwnership,
    blackWomenOwnership: c.blackWomenOwnership,
    bbbeeLevel: c.bbbeeLevel,
    bbbeeLevelStatus: c.bbbeeLevelStatus ?? null,
    certificateType: c.certificateType ?? null,
    procurementRecognition: c.procurementRecognition ?? null,
    certificateNumber: c.certificateNumber,
    issueDate: c.issueDate,
    expiryDate: c.expiryDate,
    agency: c.agency,
    sanasAccreditationNumber: c.sanasAccreditationNumber ?? null,
    status: c.metadataComplete ? c.status : 'unknown',
    lastModified: c.lastModified,
    id: c.id,
    slug: c.slug,
    verified: c.verified,
    metadataComplete: c.metadataComplete,
    sectorCode: c.sectorCode ?? null,
    sectorName: c.sectorName ?? null,
    enrichmentStatus: c.enrichmentStatus ?? null,
    reviewFields: c.reviewFields ?? [],
    fieldConfidence: c.fieldConfidence ?? {},
    location: c.location ?? null,
    businessUnit: c.businessUnit ?? null,
  };
}

export function publicCertificateToDetailJson(c: PublicCertificate) {
  return {
    id: c.id,
    slug: c.slug,
    companyName: c.metadataComplete ? c.companyName : 'Unknown company',
    tradingName: c.tradingName ?? null,
    registrationNumber: c.registrationNumber ?? null,
    vatNumber: c.vatNumber,
    taxNumber: c.taxNumber ?? null,
    companySize: c.companySize,
    bbbeeLevel: c.bbbeeLevel,
    bbbeeLevelStatus: c.bbbeeLevelStatus ?? null,
    certificateType: c.certificateType ?? null,
    procurementRecognition: c.procurementRecognition ?? null,
    bbbeeScore: c.bbbeeScore,
    blackOwnership: c.blackOwnership,
    blackWomenOwnership: c.blackWomenOwnership,
    flowThroughBlackOwnership: c.flowThroughBlackOwnership ?? null,
    blackDesignatedGroupOwnership: c.blackDesignatedGroupOwnership ?? null,
    empoweringSupplier: c.empoweringSupplier ?? null,
    valueAddingSupplier: c.valueAddingSupplier ?? null,
    measurementPeriod: c.measurementPeriod ?? null,
    firstProcurementDate: c.firstProcurementDate ?? null,
    sizeAtFirstProcurement: c.sizeAtFirstProcurement ?? null,
    sdRecipient: c.sdRecipient ?? null,
    threeYearContract: c.threeYearContract ?? null,
    annualSpend: c.annualSpend ?? null,
    location: c.location ?? null,
    businessUnit: c.businessUnit ?? null,
    sectorCode: c.sectorCode ?? null,
    sectorName: c.sectorName ?? null,
    sanasAccreditationNumber: c.sanasAccreditationNumber ?? null,
    commissionerDetails: c.commissionerDetails ?? null,
    physicalAddress: c.physicalAddress ?? null,
    contactDetails: c.contactDetails ?? null,
    enrichmentStatus: c.enrichmentStatus ?? null,
    reviewFields: c.reviewFields ?? [],
    fieldConfidence: c.fieldConfidence ?? {},
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

function certificateRecordRichness(c: PublicCertificate): number {
  let score = 0;
  if (c.metadataComplete) score += 8;
  if (c.source === 'mongo' || c.source === 'azure') score += 4;
  if (c.companyName && c.companyName !== 'Unknown company') score += 2;
  if (c.id && !isSyntheticBlobRecordId(c.id)) score += 2;
  if (c.vatNumber) score += 1;
  return score;
}

/** Deduplicate by blobName first, then id, then slug — never drop unrouted rows silently. */
export function dedupePublicCertificates(certs: PublicCertificate[]): PublicCertificate[] {
  const byBlob = new Map<string, PublicCertificate>();
  const byId = new Map<string, PublicCertificate>();
  const bySlug = new Map<string, PublicCertificate>();
  const orphans: PublicCertificate[] = [];

  for (const c of certs) {
    if (c.blobName) {
      const prev = byBlob.get(c.blobName);
      if (!prev || certificateRecordRichness(c) >= certificateRecordRichness(prev)) {
        byBlob.set(c.blobName, c);
      }
      continue;
    }
    if (c.id) {
      byId.set(c.id, c);
    } else if (c.slug) {
      bySlug.set(c.slug, c);
    } else {
      orphans.push(c);
    }
  }

  const out: PublicCertificate[] = [];
  const seenId = new Set<string>();
  const seenSlug = new Set<string>();

  for (const c of byBlob.values()) {
    if (c.id) seenId.add(c.id);
    if (c.slug) seenSlug.add(c.slug);
    out.push(c);
  }
  for (const c of byId.values()) {
    if (c.id && seenId.has(c.id)) continue;
    if (c.slug) {
      if (seenSlug.has(c.slug)) continue;
      seenSlug.add(c.slug);
    }
    out.push(c);
  }
  for (const c of bySlug.values()) {
    if (c.slug && seenSlug.has(c.slug)) continue;
    if (c.slug) seenSlug.add(c.slug);
    out.push(c);
  }
  out.push(...orphans);

  return out;
}

export function certificateSearchHaystack(c: Pick<
  PublicCertificate,
  | 'companyName'
  | 'vatNumber'
  | 'fileName'
  | 'bbbeeLevel'
  | 'sectorCode'
  | 'sectorName'
  | 'companySize'
  | 'blackOwnership'
  | 'blackWomenOwnership'
  | 'expiryDate'
  | 'location'
  | 'businessUnit'
>): string {
  const ext = c as PublicCertificate;
  return `
    ${c.companyName || ''}
    ${c.vatNumber || ''}
    ${c.fileName || ''}
    ${c.bbbeeLevel ?? ''}
    ${ext.bbbeeLevelStatus || ''}
    ${c.companySize || ''}
    ${c.blackOwnership ?? ''}
    ${c.blackWomenOwnership ?? ''}
    ${c.expiryDate || ''}
    ${c.sectorCode || ''}
    ${c.sectorName || ''}
    ${c.location || ''}
    ${c.businessUnit || ''}
  `.toLowerCase();
}
