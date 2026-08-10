import { createHash } from 'crypto';
import { CertificateMetadataModel } from '../../models.js';
import {
  getCertAccountName,
  getCertBlobContainerName,
  listCertificateBlobs,
} from './azureCertStorage.js';

export const CERTIFICATE_LIST_DEFAULT_PAGE_SIZE = 50;
export const CERTIFICATE_LIST_MAX_PAGE_SIZE = 100;

export interface CertificateRegistryQuery {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  status?: unknown;
  fileType?: unknown;
  supplierName?: unknown;
  certificateNumber?: unknown;
  certificateType?: unknown;
  documentKind?: unknown;
  bbbeeLevel?: unknown;
  expiryStatus?: unknown;
  companySize?: unknown;
  sector?: unknown;
  minOwnership?: unknown;
  maxOwnership?: unknown;
  reviewRequired?: unknown;
  sortBy?: unknown;
  sortOrder?: unknown;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function extensionFromName(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function previewSupported(contentType: string | null, fileName: string): boolean {
  const extension = extensionFromName(fileName);
  return contentType === 'application/pdf'
    || contentType?.startsWith('image/') === true
    || ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(extension);
}

function publicStatus(doc: Record<string, any>): string {
  if (doc.blobMissing) return 'file_missing';
  if (doc.extractionStatus === 'failed') return 'failed';
  if (doc.extractionStatus === 'pending') return 'processing';
  if (['text_too_short', 'unsupported', 'missing_blob'].includes(doc.extractionStatus)) {
    return 'extraction_incomplete';
  }
  if (!doc.verified && doc.enrichmentStatus === 'review_required') return 'pending_verification';
  return doc.status || 'unknown';
}

export function mapCertificateRegistryItem(doc: Record<string, any>) {
  const fileName = cleanString(doc.fileName) || cleanString(doc.originalFileName) || cleanString(doc.blobName);
  const contentType = cleanString(doc.contentType) || null;
  return {
    id: doc.id,
    supplier_name: cleanString(doc.supplierName) || null,
    certificate_number: cleanString(doc.certificateNumber) || null,
    bbbee_level: typeof doc.bbbeeLevel === 'number' ? doc.bbbeeLevel : null,
    certificate_type: cleanString(doc.certificateType) || null,
    issue_date: safeDate(doc.issueDate)?.slice(0, 10) ?? null,
    expiry_date: safeDate(doc.expiryDate)?.slice(0, 10) ?? null,
    status: publicStatus(doc),
    file_name: fileName,
    blob_name: cleanString(doc.blobName),
    content_type: contentType,
    file_size: typeof doc.fileSize === 'number' ? doc.fileSize : null,
    uploaded_at: safeDate(doc.uploadedAt || doc.createdAt || doc.updatedAt),
    has_file: !doc.blobMissing && Boolean(doc.blobName),
    preview_supported: !doc.blobMissing && previewSupported(contentType, fileName),
    company_size: cleanString(doc.companySize) || null,
    vat_number: cleanString(doc.vatNumber || doc.taxNumber) || null,
    // The CIPC registration number identifies the LEGAL ENTITY, where the
    // supplier name is only a trading name. It is what shows that Hudaco's
    // divisions, or Masstores trading as Makro and as Game, are one company
    // legitimately sharing a VAT rather than a data error.
    company_registration_number: cleanString(doc.companyRegistrationNumber || doc.registrationNumber) || null,
    black_ownership: typeof doc.blackOwnership === 'number' ? doc.blackOwnership : null,
    black_women_ownership: typeof doc.blackWomenOwnership === 'number' ? doc.blackWomenOwnership : null,
    sector_code: cleanString(doc.sectorCode) || null,
    sector_name: cleanString(doc.sectorName) || null,
    extraction_status: cleanString(doc.extractionStatus) || null,
    review_required: doc.enrichmentStatus === 'review_required'
      || (Array.isArray(doc.reviewFields) && doc.reviewFields.length > 0),
    slug: cleanString(doc.slug) || null,
  };
}

export async function listCertificateRegistry(query: CertificateRegistryQuery) {
  const page = Math.max(1, Math.trunc(Number(query.page) || 1));
  const pageSize = Math.min(
    CERTIFICATE_LIST_MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(Number(query.pageSize) || CERTIFICATE_LIST_DEFAULT_PAGE_SIZE)),
  );
  const filter: Record<string, any> = {};
  const search = cleanString(query.search);
  if (search) {
    const regex = new RegExp(escapeRegExp(search), 'i');
    filter.$or = [
      { supplierName: regex },
      { tradingName: regex },
      // Both spellings: registrationNumber is the legacy field, and
      // companyRegistrationNumber is what the Document Intelligence backfill
      // populates. Searching only the legacy one silently missed all 1,950.
      { registrationNumber: regex },
      { companyRegistrationNumber: regex },
      { vatNumber: regex },
      { taxNumber: regex },
      { certificateNumber: regex },
      { sectorCode: regex },
      { sectorName: regex },
      { fileName: regex },
      { blobName: regex },
    ];
  }

  const supplierName = cleanString(query.supplierName);
  if (supplierName) filter.supplierName = new RegExp(escapeRegExp(supplierName), 'i');
  const certificateNumber = cleanString(query.certificateNumber);
  if (certificateNumber) filter.certificateNumber = new RegExp(escapeRegExp(certificateNumber), 'i');
  const certificateType = cleanString(query.certificateType);
  if (certificateType) filter.certificateType = new RegExp(escapeRegExp(certificateType), 'i');
  const documentKind = cleanString(query.documentKind).toLowerCase();
  if (documentKind === 'affidavits') filter.certificateType = /affidavit/i;
  else if (documentKind === 'certificates') {
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [
        { certificateType: { $not: /affidavit/i } },
        { certificateType: null },
        { certificateType: { $exists: false } },
      ] },
    ];
  }
  const companySize = cleanString(query.companySize);
  if (companySize) filter.companySize = new RegExp(`^${escapeRegExp(companySize)}$`, 'i');
  const sector = cleanString(query.sector);
  if (sector) filter.sectorCode = sector.toUpperCase();
  const minOwnershipRaw = cleanString(query.minOwnership);
  const maxOwnershipRaw = cleanString(query.maxOwnership);
  const minOwnership = minOwnershipRaw ? Number(minOwnershipRaw) : Number.NaN;
  const maxOwnership = maxOwnershipRaw ? Number(maxOwnershipRaw) : Number.NaN;
  if (Number.isFinite(minOwnership) || Number.isFinite(maxOwnership)) {
    filter.blackOwnership = {
      ...(Number.isFinite(minOwnership) ? { $gte: minOwnership } : {}),
      ...(Number.isFinite(maxOwnership) ? { $lte: maxOwnership } : {}),
    };
  }
  if (query.reviewRequired === true || query.reviewRequired === 'true') {
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [
        { enrichmentStatus: 'review_required' },
        { reviewFields: { $exists: true, $ne: [] } },
      ] },
    ];
  }

  const bbbeeLevel = Number(query.bbbeeLevel);
  if (Number.isInteger(bbbeeLevel) && bbbeeLevel >= 1 && bbbeeLevel <= 8) filter.bbbeeLevel = bbbeeLevel;

  const fileType = cleanString(query.fileType).toLowerCase();
  if (fileType) {
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [
        { contentType: new RegExp(escapeRegExp(fileType), 'i') },
        { fileName: new RegExp(`\\.${escapeRegExp(fileType)}$`, 'i') },
      ] },
    ];
  }

  const status = cleanString(query.status).toLowerCase();
  if (['valid', 'expiring', 'expired', 'unknown'].includes(status)) filter.status = status;
  else if (status === 'file_missing') filter.blobMissing = true;
  else if (status === 'processing') filter.extractionStatus = 'pending';
  else if (status === 'failed') filter.extractionStatus = 'failed';
  else if (status === 'extraction_incomplete') filter.extractionStatus = { $in: ['text_too_short', 'unsupported', 'missing_blob'] };
  else if (status === 'pending_verification') filter.enrichmentStatus = 'review_required';

  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const expiryStatus = cleanString(query.expiryStatus).toLowerCase();
  if (expiryStatus === 'valid') filter.expiryDate = { $gt: soon };
  else if (expiryStatus === 'expiring') filter.expiryDate = { $gte: now, $lte: soon };
  else if (expiryStatus === 'expired') filter.expiryDate = { $lt: now };
  else if (expiryStatus === 'missing') filter.expiryDate = null;

  const sortOrder = cleanString(query.sortOrder).toLowerCase() === 'asc' ? 1 : -1;
  const sortBy = cleanString(query.sortBy) || 'uploaded_at';
  const sortFields: Record<string, string> = {
    supplier: 'supplierName',
    supplier_name: 'supplierName',
    uploaded_at: 'uploadedAt',
    expiry_date: 'expiryDate',
    bbbee_level: 'bbbeeLevel',
    level: 'bbbeeLevel',
  };
  const sortField = sortFields[sortBy] || 'uploadedAt';
  const projection = {
    _id: 0,
    id: 1, supplierName: 1, certificateNumber: 1, bbbeeLevel: 1,
    certificateType: 1, issueDate: 1, expiryDate: 1, status: 1,
    fileName: 1, originalFileName: 1, blobName: 1, contentType: 1,
    fileSize: 1, uploadedAt: 1, createdAt: 1, updatedAt: 1, blobMissing: 1,
    companySize: 1, vatNumber: 1, taxNumber: 1, blackOwnership: 1,
    blackWomenOwnership: 1, sectorCode: 1, sectorName: 1,
    companyRegistrationNumber: 1, registrationNumber: 1,
    extractionStatus: 1, enrichmentStatus: 1, reviewFields: 1, slug: 1,
  };

  const [documents, total] = await Promise.all([
    CertificateMetadataModel.find(filter, projection)
      .sort({ [sortField]: sortOrder, id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    CertificateMetadataModel.countDocuments(filter),
  ]);

  return {
    items: (documents as Record<string, any>[]).map(mapCertificateRegistryItem),
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function contentMd5(blob: any): string | null {
  const value = blob.properties.contentMD5;
  return value ? Buffer.from(value).toString('base64') : null;
}

export async function syncCertificateStorage() {
  const existing = await CertificateMetadataModel.find({}, {
    _id: 0, id: 1, blobName: 1, fileName: 1, contentType: 1,
    fileSize: 1, blobETag: 1, uploadedAt: 1, blobMissing: 1,
  }).lean() as Record<string, any>[];
  const byBlobName = new Map(existing.map((doc) => [doc.blobName, doc]));
  const byFileName = new Map<string, Record<string, any>[]>();
  for (const doc of existing) {
    const key = cleanString(doc.fileName).toLowerCase();
    if (key) byFileName.set(key, [...(byFileName.get(key) ?? []), doc]);
  }

  let continuationToken: string | undefined;
  let scanned = 0;
  let matched = 0;
  let created = 0;
  let updated = 0;
  const seenBlobNames = new Set<string>();
  const operations: any[] = [];
  const errors: Array<{ blob_name?: string; message: string }> = [];

  do {
    const page = await listCertificateBlobs({ continuationToken, resultsPerPage: 250 });
    continuationToken = page.continuationToken;
    for (const blob of page.items) {
      scanned += 1;
      seenBlobNames.add(blob.name);
      const fileName = blob.name.split('/').pop() || blob.name;
      const exact = byBlobName.get(blob.name);
      const filenameMatches = byFileName.get(fileName.toLowerCase()) ?? [];
      const match = exact ?? (filenameMatches.length === 1 ? filenameMatches[0] : null);
      const metadata = blob.metadata ?? {};
      const storageFields = {
        blobName: blob.name,
        fileName,
        originalFileName: metadata.original_file_name || metadata.originalfilename || fileName,
        contentType: blob.properties.contentType || null,
        fileSize: blob.properties.contentLength ?? null,
        uploadedAt: blob.properties.createdOn || blob.properties.lastModified || null,
        blobETag: blob.properties.etag || null,
        blobMissing: false,
        storageAccount: getCertAccountName() || null,
        storageContainer: getCertBlobContainerName(),
        storageSource: 'azure_blob',
        checksum: metadata.checksum || contentMd5(blob),
        updatedAt: new Date(),
      };

      if (match) {
        matched += 1;
        const changed = match.blobName !== storageFields.blobName
          || match.contentType !== storageFields.contentType
          || match.fileSize !== storageFields.fileSize
          || match.blobETag !== storageFields.blobETag
          || match.blobMissing === true;
        if (changed) {
          updated += 1;
          operations.push({ updateOne: { filter: { id: match.id }, update: { $set: storageFields } } });
        }
      } else {
        created += 1;
        const id = `blob-${createHash('sha256').update(blob.name).digest('hex').slice(0, 24)}`;
        operations.push({
          updateOne: {
            filter: { blobName: blob.name },
            update: {
              $setOnInsert: {
                id,
                supplierName: null,
                extractionStatus: 'pending',
                extractionMode: 'none',
                enrichmentStatus: 'pending',
                createdAt: new Date(),
              },
              $set: storageFields,
            },
            upsert: true,
          },
        });
      }

      if (operations.length >= 250) {
        try {
          await CertificateMetadataModel.bulkWrite(operations, { ordered: false });
        } catch (error) {
          errors.push({ message: error instanceof Error ? error.message : 'Bulk update failed' });
        }
        operations.length = 0;
      }
    }
  } while (continuationToken);

  if (operations.length) {
    try {
      await CertificateMetadataModel.bulkWrite(operations, { ordered: false });
    } catch (error) {
      errors.push({ message: error instanceof Error ? error.message : 'Bulk update failed' });
    }
  }

  const missing = existing.filter((doc) => doc.blobName && !seenBlobNames.has(doc.blobName));
  if (missing.length) {
    await CertificateMetadataModel.updateMany(
      { id: { $in: missing.map((doc) => doc.id) } },
      { $set: { blobMissing: true, updatedAt: new Date() } },
    );
  }

  return {
    scanned,
    matched,
    created,
    updated,
    missing_blobs: missing.length,
    duplicates: 0,
    errors,
  };
}
