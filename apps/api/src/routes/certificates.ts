import { Router, type Request, type Response, type NextFunction } from 'express';
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential, SASProtocol } from '@azure/storage-blob';
import multer from 'multer';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { createLogger } from '../logger.js';
import {
  searchCertificatesMongo,
  hybridSearchCertificates,
  ensureSearchIndex,
  type SearchResult as MongoSearchResult,
} from '../services/mongoSearch.js';
import { requireAuth } from '../middleware/auth.js';
import { processAllCertificates, processOneCertificate, getCertificateStats, extractCertificateData, extractPreviewFromBuffer, previewExtractionToFormJson } from '../services/certificateExtractor.js';
import { CertificateMetadataModel, CertificateReportModel } from '../../models.js';
import { isMongoConnected } from '../../db.js';
import { certificateStore, normalizeVat, type CertificateRecord, type CertificateVersionLite } from '../services/certificateStore.js';
import {
  buildCertSlug,
  blobBasename,
  certificateSearchHaystack,
  dedupePublicCertificates,
  normalizeFromBlobOnly,
  normalizeFromLocal,
  normalizeFromMongo,
  normalizeFromMongoAndParsed,
  publicCertificateToDetailJson,
  publicCertificateToListRow,
  statusFromExpiryDate,
  type CertificateListRow,
  type ParsedCertificateFields,
  type PublicCertificate,
} from '../services/certificateNormalize.js';
import {
  getCertAccountName,
  getCertBlobContainerName,
  getCertBlobServiceClient,
  getCertConnectionString,
  getCertContainerClient,
} from '../services/azureCertStorage.js';
import { ok, fail, failWith } from '../utils/apiResponse.js';
import { recordEvent, getAnalyticsSummary } from '../services/analytics.js';
import { parseCertificateFormBody, parsedFormToMongoSet, parsedFormToLocalPatch } from '../services/certificateUploadFields.js';
import { OKIRU_HUB_SECTORS, resolveOkiruHubSector } from '../services/okiruHubSectors.js';
import {
  ENRICHMENT_FIELDS,
  PRODUCTION_CERTIFICATE_FIELDS,
  getProductionCertificateCoverage,
  runCertificateEnrichmentJob,
  type EnrichmentField,
} from '../services/certificateEnrichmentJob.js';
import {
  getCertificateTextExtractionCoverage,
  runCertificateTextExtractionRetryJob,
} from '../services/certificateTextExtractionJob.js';
import type { CertificateExtractionMode, CertificateExtractionStatus } from '../services/certificateExtractionStatus.js';

const logger = createLogger("Certificates");
const router = Router();

const CONTAINER_NAME = getCertBlobContainerName();

function getConnectionString(): string | undefined {
  return getCertConnectionString();
}

function getAccountName(): string | undefined {
  return getCertAccountName();
}

function getBlobServiceClient(): BlobServiceClient | null {
  return getCertBlobServiceClient();
}

function getContainerClient(blobServiceClient: BlobServiceClient) {
  return getCertContainerClient(blobServiceClient);
}

function requireInternalApiKey(req: Request, res: Response): boolean {
  const providedKey = req.headers['x-api-key'] as string | undefined;
  const expectedKey = process.env.API_INTERNAL_KEY;
  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    res.status(401).json({ message: 'Invalid or missing x-api-key header' });
    return false;
  }
  return true;
}

/** Express may surface path/query values as `string | string[]`; normalize to a single string. */
function singleRouteParam(value: string | string[] | undefined): string {
  if (value == null) return '';
  return Array.isArray(value) ? String(value[0] ?? '') : String(value);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/png', 'image/jpeg', 'image/jpg',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed. Accepted: PDF, PNG, JPG, XLS, XLSX, DOC, DOCX`));
    }
  },
});

/** @deprecated Alias — use CertificateListRow from certificateNormalize. */
type CertificateRow = CertificateListRow;

// ----------------------------------------------------------------------------
// Lightweight TTL cache for /list and /stats. The certificates registry is
// read-heavy and recomputing the full snapshot per request is wasteful when
// thousands of users hit the public hub. A 60s TTL keeps results fresh while
// absorbing burst traffic. Mutations (upload, verify, unverify) invalidate.
// ----------------------------------------------------------------------------
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
function getCached<T>(key: string): T | null {
  const e = responseCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return e.value as T;
}
function setCached(key: string, value: unknown, ttlMs = 60_000) {
  responseCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}
function invalidateListAndStatsCache() {
  for (const k of Array.from(responseCache.keys())) {
    if (k.startsWith('list:') || k.startsWith('stats:') || k.startsWith('public:')) {
      responseCache.delete(k);
    }
  }
}

const LIST_SAFE_PROJECTION = {
  _id: 0,
  id: 1,
  blobName: 1,
  fileName: 1,
  supplierName: 1,
  vatNumber: 1,
  companySize: 1,
  sectorCode: 1,
  sectorName: 1,
  bbbeeLevel: 1,
  bbbeeLevelStatus: 1,
  blackOwnership: 1,
  blackWomenOwnership: 1,
  expiryDate: 1,
  extractionStatus: 1,
  enrichmentStatus: 1,
  reviewFields: 1,
  reviewCandidates: 1,
  verified: 1,
  slug: 1,
  status: 1,
  updatedAt: 1,
} as const;

function dateOnly(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listSafeRowFromMongo(doc: Record<string, any>): CertificateListRow & {
  company: string;
  size: string | null;
  sector: { code: string | null; name: string | null };
  ownership: { black: number | null; blackWomen: number | null };
  extractionStatus: string | null;
  reviewRequired: boolean;
  reviewCandidates: Record<string, unknown>;
} {
  const blobName = typeof doc.blobName === 'string' ? doc.blobName : '';
  const fileName = typeof doc.fileName === 'string' && doc.fileName.trim()
    ? doc.fileName
    : blobBasename(blobName);
  const companyName = typeof doc.supplierName === 'string' && doc.supplierName.trim()
    ? doc.supplierName.trim()
    : 'Unknown company (metadata missing)';
  const expiryDate = dateOnly(doc.expiryDate);
  const status = expiryDate ? statusFromExpiryDate(new Date(expiryDate)) : (doc.status || 'unknown');
  const sector = resolveOkiruHubSector(doc.sectorCode);
  const reviewRequired = doc.enrichmentStatus === 'review_required'
    || doc.enrichmentStatus === 'failed'
    || (!!doc.sectorCode && !sector)
    || (Array.isArray(doc.reviewFields) && doc.reviewFields.length > 0);

  return {
    id: doc.id ?? null,
    slug: doc.slug || buildCertSlug(companyName, doc.id ?? null),
    name: blobName,
    fileName,
    company: companyName,
    companyName,
    size: doc.companySize ?? null,
    companySize: doc.companySize ?? null,
    sector: {
      code: sector?.sectorCode ?? null,
      name: sector?.sectorName ?? null,
    },
    sectorCode: sector?.sectorCode ?? null,
    sectorName: sector?.sectorName ?? null,
    vatNumber: doc.vatNumber ?? null,
    bbbeeLevel: typeof doc.bbbeeLevel === 'number' ? doc.bbbeeLevel : null,
    bbbeeLevelStatus: doc.bbbeeLevelStatus ?? null,
    ownership: {
      black: typeof doc.blackOwnership === 'number' ? doc.blackOwnership : null,
      blackWomen: typeof doc.blackWomenOwnership === 'number' ? doc.blackWomenOwnership : null,
    },
    blackOwnership: typeof doc.blackOwnership === 'number' ? doc.blackOwnership : null,
    blackWomenOwnership: typeof doc.blackWomenOwnership === 'number' ? doc.blackWomenOwnership : null,
    expiryDate,
    extractionStatus: doc.extractionStatus ?? null,
    reviewRequired,
    enrichmentStatus: doc.enrichmentStatus ?? null,
    reviewFields: Array.isArray(doc.reviewFields) ? doc.reviewFields : [],
    reviewCandidates: doc.reviewCandidates && typeof doc.reviewCandidates === 'object' ? doc.reviewCandidates : {},
    status,
    lastModified: dateOnly(doc.updatedAt),
    verified: doc.verified === true,
    metadataComplete: Boolean(doc.supplierName),
    certificateNumber: null,
  };
}

async function getPublicCertificatesCached(): Promise<PublicCertificate[]> {
  if (!process.env.VITEST) {
    const cached = getCached<PublicCertificate[]>('public:all');
    if (cached) return cached;
  }
  const data = await loadPublicCertificates();
  if (!process.env.VITEST) {
    setCached('public:all', data);
  }
  return data;
}

function deriveCompanyName(fileName: string): string {
  const base = fileName.split('/').pop() || fileName;
  const noExt = base.replace(/\.[a-z0-9]+$/i, '');
  let working = noExt.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  );
  const leadingPrefixPatterns = [
    /^\d{4}[\s_\-]+\d{1,2}[\s_\-]+\d{1,2}[\s_\-]+/,
    /^(?:19|20)\d{2}[\s._\-]+/,
    /^[\s\[\(]*\d+[\s._\-:)\]]+/,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pat of leadingPrefixPatterns) {
      const next = working.replace(pat, '');
      if (next !== working) {
        working = next;
        changed = true;
      }
    }
  }
  const trimmed = working
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\b(EME|QSE|Generic|Large|Specialised|Specialized)\b.*$/i, '')
    .replace(/\s*B[\s-]?BBEE.*$/i, '')
    .replace(/\s*Certificate.*$/i, '')
    .replace(/\s*Affidavit.*$/i, '')
    .replace(/\s*Scorecard.*$/i, '')
    .replace(/\s*Verification.*$/i, '')
    .replace(/\s+BEE$/i, '')
    .replace(/\s*\(?\d+\)?$/, '')
    .replace(/[\s_\-–—]+$/u, '')
    .trim();
  return trimmed || 'Unknown company';
}

async function loadPublicCertificates(): Promise<PublicCertificate[]> {
  const certs: PublicCertificate[] = [];
  const seenBlobs = new Set<string>();

  for (const rec of certificateStore.list()) {
    certs.push(normalizeFromLocal(rec));
    seenBlobs.add(rec.blobName);
  }

  const blobServiceClient = getBlobServiceClient();
  if (blobServiceClient) {
    try {
      const containerClient = getContainerClient(blobServiceClient);
      const azureBlobs: Array<{ name: string; lastModified: string | null }> = [];
      for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
        azureBlobs.push({
          name: blob.name,
          lastModified: blob.properties.lastModified?.toISOString() || null,
        });
      }
      const mongoMap = await loadMongoMetadataMap(azureBlobs.map((b) => b.name));
      for (const b of azureBlobs) {
        if (seenBlobs.has(b.name)) continue;
        const md = mongoMap.get(b.name)
          ?? mongoMap.get(blobBasename(b.name)) as Record<string, unknown> | undefined;
        if (md) {
          const normalized = normalizeFromMongo(md, {
            blobLastModified: b.lastModified,
            fileNameFallback: b.name.split('/').pop() || b.name,
          });
          if (normalized) {
            certs.push({ ...normalized, source: 'azure' });
          } else {
            certs.push(normalizeFromBlobOnly(b));
          }
        } else {
          certs.push(normalizeFromBlobOnly(b));
        }
        seenBlobs.add(b.name);
      }
    } catch (azureErr) {
      logger.warn('Azure blob enumeration failed — using local + mongo only', {
        err: (azureErr as Error).message,
      });
    }
  }

  if (isMongoConnected()) {
    try {
      const docs = await CertificateMetadataModel.find({}, { extractedText: 0 }).lean();
      for (const doc of docs as Record<string, unknown>[]) {
        const blobName = typeof doc.blobName === 'string' ? doc.blobName : '';
        if (!blobName || seenBlobs.has(blobName)) continue;
        const normalized = normalizeFromMongo(doc);
        if (normalized) {
          certs.push(normalized);
        } else {
          const updatedAt = doc.updatedAt ? new Date(doc.updatedAt as string | Date).toISOString() : null;
          certs.push(normalizeFromBlobOnly({ name: blobName, lastModified: updatedAt }));
        }
        seenBlobs.add(blobName);
      }
    } catch (mongoErr) {
      logger.warn('Mongo enumeration failed', { err: (mongoErr as Error).message });
    }
  }

  return dedupePublicCertificates(certs);
}

async function loadAllRows(): Promise<CertificateListRow[]> {
  const publicCerts = await getPublicCertificatesCached();
  return publicCerts.map(publicCertificateToListRow);
}

function applyFilters(rows: CertificateRow[], q: {
  search?: string;
  status?: string;
  size?: string;
  sector?: string;
  minOwnership?: number;
  maxOwnership?: number;
}): CertificateRow[] {
  let out = rows;
  if (q.search) {
    const s = q.search.toLowerCase();
    out = out.filter((r) =>
      certificateSearchHaystack({
        companyName: r.companyName,
        vatNumber: r.vatNumber,
        fileName: r.fileName,
        bbbeeLevel: r.bbbeeLevel,
        sectorCode: r.sectorCode ?? null,
        sectorName: r.sectorName ?? null,
        companySize: r.companySize ?? null,
        blackOwnership: r.blackOwnership ?? null,
        blackWomenOwnership: r.blackWomenOwnership ?? null,
        expiryDate: r.expiryDate ?? null,
        location: r.location ?? null,
        businessUnit: r.businessUnit ?? null,
      }).includes(s),
    );
  }
  if (q.status && q.status !== 'all') {
    out = out.filter((r) => r.status === q.status);
  }
  if (q.size && q.size !== 'all') {
    out = out.filter((r) => (r.companySize || '').toLowerCase() === q.size!.toLowerCase());
  }
  if (q.sector && q.sector !== 'all') {
    out = out.filter((r) => (r.sectorCode || '').toUpperCase() === q.sector!.toUpperCase());
  }
  if (typeof q.minOwnership === 'number') {
    out = out.filter((r) => r.blackOwnership != null && r.blackOwnership >= q.minOwnership!);
  }
  if (typeof q.maxOwnership === 'number') {
    out = out.filter((r) => r.blackOwnership != null && r.blackOwnership <= q.maxOwnership!);
  }
  return out;
}

router.get('/download', async (req: Request, res: Response) => {
  try {
    const file = req.query.file as string;
    if (!file || file.trim() === '') {
      return res.status(400).json({ message: 'file query parameter is required' });
    }

    const trimmed = file.trim();
    recordEvent({
      type: 'download',
      metadata: { blobName: trimmed, mode: req.query.mode || null },
      userId: req.session?.userId || null,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    // Try local store first
    const localRec = certificateStore.getByBlobName(trimmed);
    if (localRec) {
      try {
        if (!fs.existsSync(localRec.filePath)) {
          return res.status(404).json({ message: 'File not found' });
        }
        const baseName = localRec.fileName;
        const safeName = baseName.replace(/[\r\n"\\\x00-\x1F\x7F]/g, '_');
        const mode = req.query.mode as string;
        if (mode === 'redirect') {
          // Stream the file directly
          res.setHeader('Content-Type', localRec.mimeType || 'application/octet-stream');
          res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
          fs.createReadStream(localRec.filePath).pipe(res);
          return;
        }
        // Return a download URL the browser can use; SAS not applicable, use local route.
        return res.json({ url: `/api/certificates/download?file=${encodeURIComponent(trimmed)}&mode=redirect` });
      } catch (err) {
        logger.error('Failed to serve local certificate', err as Error);
        return res.status(500).json({ message: 'Failed to serve file' });
      }
    }

    // Fall through to Azure
    const connStr = getConnectionString();
    const accountName = getAccountName();
    if (!connStr) {
      return res.status(404).json({ message: 'File not found' });
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
    const containerClient = getContainerClient(blobServiceClient);
    const blobClient = containerClient.getBlobClient(trimmed);

    const exists = await blobClient.exists();
    if (!exists) {
      return res.status(404).json({ message: 'File not found' });
    }

    const matchResult = connStr.match(/AccountKey=([^;]+)/);
    if (!matchResult || !accountName) {
      logger.error('Could not parse account key or account name for SAS generation');
      return res.status(500).json({ message: 'Azure Storage configuration incomplete. Ensure AZURE_STORAGE_ACCOUNT_NAME is set.' });
    }

    const accountKey = matchResult[1];
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + 15 * 60 * 1000);

    const baseFileName = trimmed.split('/').pop() || trimmed;
    const safeDownloadName = baseFileName.replace(/[\r\n"\\\x00-\x1F\x7F]/g, '_');
    // Preview renders the blob in an <iframe>/<img>, which only DISPLAYS when the SAS
    // URL is served inline; the default `attachment` makes the browser download it and
    // show nothing. The Download button omits ?disposition so it keeps `attachment`.
    // (live feedback: "preview button downloads the scorecard and displays nothing")
    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
    const contentDisposition = `${disposition}; filename="${safeDownloadName}"; filename*=UTF-8''${encodeURIComponent(safeDownloadName)}`;

    const sasToken = generateBlobSASQueryParameters({
      containerName: CONTAINER_NAME,
      blobName: trimmed,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
      contentDisposition,
    }, sharedKeyCredential).toString();

    const url = `${blobClient.url}?${sasToken}`;
    const mode = req.query.mode as string;
    if (mode === 'redirect') {
      return res.redirect(302, url);
    }
    return res.json({ url });
  } catch (err) {
    logger.error('Failed to generate download link', err as Error);
    return res.status(500).json({ message: 'Failed to generate download link' });
  }
});

router.get('/list', async (req: Request, res: Response) => {
  try {
    const startedAt = Date.now();
    const search = (req.query.search as string || '').trim();
    const status = (req.query.status as string || '').trim();
    const size = (req.query.size as string || '').trim();
    const sector = (req.query.sector as string || '').trim();
    const minOwnership = req.query.minOwnership ? Number(req.query.minOwnership) : undefined;
    const maxOwnership = req.query.maxOwnership ? Number(req.query.maxOwnership) : undefined;
    const sort = String(req.query.sort || 'verified').toLowerCase();
    const limitRaw = req.query.limit;
    const offsetRaw = req.query.offset;
    const wantsPagination = limitRaw !== undefined || offsetRaw !== undefined;
    const limit = wantsPagination ? Math.min(Math.max(Number(limitRaw) || 50, 1), 200) : null;
    const offset = wantsPagination ? Math.max(Number(offsetRaw) || 0, 0) : 0;

    // Cache key includes every filter/sort/page parameter. Only cache the
    // unfiltered first page heavily — fully filtered queries get cached too
    // but with the same TTL since they're cheap to recompute on miss.
    const cacheKey = `list:${search}|${status}|${size}|${sector}|${minOwnership ?? ''}|${maxOwnership ?? ''}|${sort}|${limit ?? 'all'}|${offset}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) return res.json(cached);

    if (wantsPagination && isMongoConnected()) {
      const mongoFilter: Record<string, unknown> = {};
      if (status && status !== 'all') mongoFilter.status = status;
      if (size && size !== 'all') mongoFilter.companySize = new RegExp(`^${escapeRegExp(size)}$`, 'i');
      if (sector && sector !== 'all') mongoFilter.sectorCode = sector.toUpperCase();
      if (typeof minOwnership === 'number' || typeof maxOwnership === 'number') {
        mongoFilter.blackOwnership = {
          ...(typeof minOwnership === 'number' ? { $gte: minOwnership } : {}),
          ...(typeof maxOwnership === 'number' ? { $lte: maxOwnership } : {}),
        };
      }
      if (search) {
        const searchRegex = new RegExp(escapeRegExp(search), 'i');
        const numericSearch = Number(search);
        const expirySearch = /^\d{4}$/.test(search)
          ? {
              expiryDate: {
                $gte: new Date(`${search}-01-01T00:00:00.000Z`),
                $lt: new Date(`${Number(search) + 1}-01-01T00:00:00.000Z`),
              },
            }
          : /^\d{4}-\d{2}-\d{2}$/.test(search)
            ? {
                expiryDate: {
                  $gte: new Date(`${search}T00:00:00.000Z`),
                  $lt: new Date(new Date(`${search}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000),
                },
              }
            : null;
        mongoFilter.$or = [
          { supplierName: searchRegex },
          { vatNumber: searchRegex },
          { companySize: searchRegex },
          { sectorCode: searchRegex },
          { sectorName: searchRegex },
          { bbbeeLevelStatus: searchRegex },
          ...(expirySearch ? [expirySearch] : []),
          ...(Number.isFinite(numericSearch) ? [
            { bbbeeLevel: numericSearch },
            { blackOwnership: numericSearch },
            { blackWomenOwnership: numericSearch },
          ] : []),
        ];
      }

      const sortSpec: Record<string, 1 | -1> = sort === 'recent'
        ? { updatedAt: -1, id: 1 }
        : sort === 'expiring'
          ? { expiryDate: 1, id: 1 }
          : { verified: -1, updatedAt: -1, id: 1 };

      const queryStartedAt = Date.now();
      const [docs, total] = await Promise.all([
        CertificateMetadataModel.find(mongoFilter, LIST_SAFE_PROJECTION)
          .sort(sortSpec)
          .skip(offset)
          .limit(limit ?? 50)
          .lean(),
        CertificateMetadataModel.countDocuments(mongoFilter),
      ]);
      const queryMs = Date.now() - queryStartedAt;
      const buildStartedAt = Date.now();
      const items = (docs as Record<string, unknown>[]).map(listSafeRowFromMongo);
      const buildMs = Date.now() - buildStartedAt;
      const payload = ok({ items, total, limit: limit ?? 50, offset });

      logger.info('Listed certificates fast path', {
        total,
        returned: items.length,
        search: search || '(all)',
        status: status || '(any)',
        sort,
        queryMs,
        buildMs,
        durationMs: Date.now() - startedAt,
      });

      setCached(cacheKey, payload);
      return res.json(payload);
    }

    const all = await loadAllRows();
    const filtered = applyFilters(all, { search, status, size, sector, minOwnership, maxOwnership });

    // Sort. Default 'verified' surfaces verified certs first, then most-recent.
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'recent') {
        return (b.lastModified || '').localeCompare(a.lastModified || '');
      }
      if (sort === 'expiring') {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
      }
      // verified-first (default) — verified, then most recent within group
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return (b.lastModified || '').localeCompare(a.lastModified || '');
    });

    logger.info('Listed certificates', {
      total: all.length,
      shown: sorted.length,
      search: search || '(all)',
      status: status || '(any)',
      sort,
      paginated: wantsPagination,
      durationMs: Date.now() - startedAt,
    });

    if (wantsPagination) {
      const items = sorted.slice(offset, offset + (limit ?? sorted.length));
      const payload = ok({ items, total: sorted.length, limit: limit ?? sorted.length, offset });
      setCached(cacheKey, payload);
      return res.json(payload);
    }

    setCached(cacheKey, sorted);
    return res.json(sorted);
  } catch (err) {
    logger.error('Failed to list certificates', err as Error);
    return res.status(500).json({ message: 'Failed to list certificates' });
  }
});

/**
 * Search certificates using MongoDB full-text search (replaces Azure AI Search).
 *
 * Query params:
 * - q: search query (required)
 * - status: filter by status (valid|expiring|expired|unknown|all)
 * - size: filter by company size (EME|QSE|Generic|Large)
 * - sector: filter by Okiru Hub sector code (RCOGP|ICT|FSC|AGRI)
 * - verified: 'true' to show only verified certificates
 * - limit: max results (default 50)
 * - skip: pagination offset
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q) {
      recordEvent({
        type: 'search',
        query: q,
        userId: req.session?.userId || null,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
    }
    if (!q) {
      return res.status(400).json({ message: 'q query parameter is required' });
    }

    // Parse filters
    const filters = {
      status: req.query.status as any,
      companySize: req.query.size as string,
      sectorCode: req.query.sector as string,
      verifiedOnly: req.query.verified === 'true',
    };

    // Parse pagination
    const options = {
      limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
      skip: parseInt(req.query.skip as string) || 0,
      sortBy: (req.query.sort as 'relevance' | 'expiryDate' | 'companyName') || 'relevance',
    };

    // Use hybrid search: MongoDB $text + fuzzy fallback
    const { results, total } = await hybridSearchCertificates(q, filters, options);

    // Transform to API response format
    const apiResults = results.map((r) => ({
      id: r.id,
      file_name: r.fileName,
      blob_name: r.blobName,
      company_name: r.companyName,
      vat_number: r.vatNumber,
      company_size: r.companySize,
      sector_code: r.sectorCode,
      sector_name: r.sectorName,
      black_ownership: r.blackOwnership,
      black_women_ownership: r.blackWomenOwnership,
      bbbee_level: r.bbbeeLevel,
      expiry_date: r.expiryDate,
      status: r.status,
      verified: r.verified,
      score: r.score,
      snippet: r.snippet,
    }));

    logger.info('Search completed', {
      query: q,
      results: apiResults.length,
      total,
      filters,
    });

    return res.json({
      results: apiResults,
      total,
      query: q,
      pagination: {
        limit: options.limit,
        skip: options.skip,
        hasMore: total > options.skip + apiResults.length,
      },
    });
  } catch (err) {
    logger.error('Search failed', err as Error);
    return res.status(500).json({ message: 'Search failed', error: (err as Error).message });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const cached = getCached<unknown>('stats:default');
    if (cached) return res.json(cached);
    const rows = await loadAllRows();
    const total = rows.length;
    let valid = 0, expiring = 0, expired = 0, unknown = 0;
    let levelSum = 0, levelCount = 0;
    let blackOwnSum = 0, blackOwnCount = 0;

    const now = Date.now();
    let recentUploads7d = 0;
    let recentUploads30d = 0;
    let lastUploaded = 0;

    for (const r of rows) {
      switch (r.status) {
        case 'valid': valid++; break;
        case 'expiring': expiring++; break;
        case 'expired': expired++; break;
        default: unknown++;
      }
      if (typeof r.bbbeeLevel === 'number') {
        levelSum += r.bbbeeLevel;
        levelCount++;
      }
      if (typeof r.blackOwnership === 'number') {
        blackOwnSum += r.blackOwnership;
        blackOwnCount++;
      }
      if (r.lastModified) {
        const t = new Date(r.lastModified).getTime();
        if (Number.isFinite(t)) {
          if (t > lastUploaded) lastUploaded = t;
          if (t >= now - 7 * 86400_000) recentUploads7d++;
          if (t >= now - 30 * 86400_000) recentUploads30d++;
        }
      }
    }

    const payload = {
      total,
      valid,
      expiring,
      expiringIn30: expiring,
      expired,
      unknown,
      processed: total,
      pending: 0,
      avgLevel: levelCount > 0 ? Number((levelSum / levelCount).toFixed(1)) : null,
      avgBlackOwnership: blackOwnCount > 0 ? Number((blackOwnSum / blackOwnCount).toFixed(1)) : null,
      extractionAvailable: levelCount > 0 || blackOwnCount > 0,
      recentUploads7d,
      recentUploads30d,
      lastUploadedAt: lastUploaded > 0 ? new Date(lastUploaded).toISOString() : null,
      totalBytes: 0,
    };
    setCached('stats:default', payload);
    return res.json(payload);
  } catch (err: any) {
    logger.error('Failed to get certificate stats', err);
    return res.status(500).json({ message: 'Failed to get certificate stats' });
  }
});

router.get('/metadata', async (_req: Request, res: Response) => {
  try {
    const rows = await loadAllRows();
    return res.json(rows);
  } catch (err: any) {
    logger.error('Failed to get certificate metadata', err);
    return res.status(500).json({ message: 'Failed to get metadata' });
  }
});

// ============================================================================
// SEO endpoints — same canonical public certificates as /list and /by-slug.
// ============================================================================

function parseFromContent(content: string, fileName: string): ParsedCertificateFields {
  const e = extractCertificateData(content || '', fileName);
  return {
    expiryDate: e.expiryDate,
    issueDate: e.issueDate,
    bbbeeLevel: e.bbbeeLevel,
    supplierName: e.supplierName,
    bbbeeScore: e.bbbeeScore,
    blackOwnership: e.blackOwnership,
    blackWomenOwnership: e.blackWomenOwnership,
    verificationAgency: e.verificationAgency,
    certificateNumber: e.certificateNumber,
  };
}

function publicCertificateToSeoJson(c: PublicCertificate) {
  const detail = publicCertificateToDetailJson(c);
  return {
    ...detail,
    verificationAgency: detail.agency,
    updatedAt: (c.lastModified || '').slice(0, 10) || null,
  };
}

async function lookupSearchContent(blobName: string): Promise<string> {
  if (!isMongoConnected()) return '';
  try {
    const doc = await CertificateMetadataModel.findOne({ blobName }).lean();
    const text = doc && 'extractedText' in doc ? (doc as { extractedText?: string }).extractedText : undefined;
    return text ? String(text).slice(0, 20000) : '';
  } catch (err: unknown) {
    logger.warn('Mongo certificate text lookup failed for blob', { blobName, error: err instanceof Error ? err.message : String(err) });
    return '';
  }
}

const MONGO_BLOB_IN_CHUNK_SIZE = 500;

function registerMongoMetadataDoc(map: Map<string, Record<string, unknown>>, doc: Record<string, unknown>) {
  const blobName = typeof doc.blobName === 'string' ? doc.blobName : '';
  const fileName = typeof doc.fileName === 'string' ? doc.fileName : '';
  const base = blobName ? blobBasename(blobName) : (fileName || '');
  for (const key of [blobName, fileName, base]) {
    if (key && !map.has(key)) map.set(key, doc);
  }
}

async function loadMongoMetadataMap(blobNames: string[]): Promise<Map<string, any>> {
  if (!isMongoConnected() || blobNames.length === 0) return new Map();
  const m = new Map<string, Record<string, unknown>>();
  try {
    for (let i = 0; i < blobNames.length; i += MONGO_BLOB_IN_CHUNK_SIZE) {
      const chunk = blobNames.slice(i, i + MONGO_BLOB_IN_CHUNK_SIZE);
      const basenames = [...new Set(chunk.map(blobBasename))];
      const docs = await CertificateMetadataModel.find(
        {
          $or: [
            { blobName: { $in: chunk } },
            { fileName: { $in: basenames } },
          ],
        },
        { extractedText: 0 },
      ).lean();
      for (const d of docs as Record<string, unknown>[]) registerMongoMetadataDoc(m, d);
    }
    return m;
  } catch (err: unknown) {
    logger.warn('Mongo metadata map load failed — blob-only rows may lack enrichment', {
      blobCount: blobNames.length,
      err: err instanceof Error ? err.message : String(err),
    });
    return m;
  }
}

router.get('/seo/list', async (_req: Request, res: Response) => {
  try {
    const certs = await getPublicCertificatesCached();
    const records = certs
      .filter((c) => c.slug)
      .map(publicCertificateToSeoJson)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return res.json(records.slice(0, 1000));
  } catch (err: unknown) {
    logger.error('Failed to list SEO certificates', err instanceof Error ? err : new Error(String(err)));
    return res.json([]);
  }
});

router.get('/by-slug/:slug', async (req: Request, res: Response) => {
  const slug = singleRouteParam(req.params.slug).toLowerCase();
  if (!slug) return res.status(400).json({ message: 'slug required' });

  try {
    let match = (await getPublicCertificatesCached()).find((c) => c.slug === slug) ?? null;

    if (!match) {
      const legacy = (await getPublicCertificatesCached()).find(
        (c) => c.id && buildCertSlug(c.companyName, c.id) === slug,
      );
      match = legacy ?? null;
    }

    if (!match) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    if (
      match.source === 'azure'
      && match.blobName
      && (match.bbbeeLevel == null || match.agency == null)
    ) {
      const content = await lookupSearchContent(match.blobName);
      if (content && isMongoConnected()) {
        try {
          const doc = await CertificateMetadataModel.findOne({ blobName: match.blobName }).lean();
          const parsed = parseFromContent(content, match.fileName || match.blobName);
          const enriched = normalizeFromMongoAndParsed(
            doc as Record<string, unknown> | null,
            parsed,
            { name: match.blobName, lastModified: match.lastModified },
          );
          if (enriched) match = enriched;
        } catch {
          // keep base match
        }
      }
    }

    recordEvent({
      type: 'view',
      certificateId: match.id,
      certificateSlug: match.slug,
      userId: req.session?.userId || null,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    return res.json(publicCertificateToDetailJson(match));
  } catch (err: unknown) {
    logger.error('Failed to look up certificate by slug', err instanceof Error ? err : new Error(String(err)));
    return res.status(500).json({ message: 'Lookup failed' });
  }
});

// ============================================================================
// Internal admin endpoint — authenticated via x-api-key header.
// Triggers bulk certificate extraction from Azure Blob → MongoDB.
// Callable from within the cluster without a user session:
//   wget -q -O- --post-data='{"force":true}' \
//     --header='Content-Type: application/json' \
//     --header="x-api-key: $API_INTERNAL_KEY" \
//     http://127.0.0.1:5000/api/certificates/process
// ============================================================================
router.post('/process', async (req: Request, res: Response) => {
  const providedKey = req.headers['x-api-key'] as string | undefined;
  const expectedKey = process.env.API_INTERNAL_KEY;
  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ message: 'Invalid or missing x-api-key header' });
  }

  const blobServiceClient = getBlobServiceClient();
  if (!blobServiceClient) {
    return res.status(500).json({ message: 'Azure Storage is not configured.' });
  }

  const force = req.body?.force === true;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ type: 'start', message: `Starting bulk certificate extraction (force=${force})...` });

  try {
    const result = await processAllCertificates(blobServiceClient, force, (done, total) => {
      if (done % 10 === 0 || done === total) {
        sendEvent({ type: 'progress', done, total });
      }
    });
    sendEvent({ type: 'complete', ...result });
    invalidateListAndStatsCache();
  } catch (err: any) {
    logger.error('Bulk certificate extraction failed', err);
    sendEvent({ type: 'error', message: err.message });
  }

  res.end();
});

router.post('/extract', requireAuth, async (req: Request, res: Response) => {
  try {
    const blobServiceClient = getBlobServiceClient();
    if (!blobServiceClient) {
      return res.status(500).json({ message: 'Azure Storage is not configured.' });
    }

    const force = req.body?.force === true;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent({ type: 'start', message: 'Starting certificate extraction...' });

    const result = await processAllCertificates(blobServiceClient, force, (done, total) => {
      if (done % 5 === 0 || done === total) {
        sendEvent({ type: 'progress', done, total });
      }
    });

    sendEvent({ type: 'complete', ...result });
    res.end();
  } catch (err: any) {
    logger.error('Certificate extraction failed', err);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Extraction failed' });
    }
    res.end();
  }
});

async function runCertificateEnrichmentEndpoint(
  req: Request,
  res: Response,
  defaults: { onlyUsableText?: boolean; forceText?: boolean } = {},
) {
  if (!requireInternalApiKey(req, res)) return;

  const blobServiceClient = getBlobServiceClient();
  if (!blobServiceClient && defaults.onlyUsableText !== true) {
    return res.status(500).json({ message: 'Azure Storage is not configured.' });
  }

  try {
    const requestedFields = Array.isArray(req.body?.fields)
      ? req.body.fields.filter((f: unknown): f is EnrichmentField =>
          typeof f === 'string' && (ENRICHMENT_FIELDS as readonly string[]).includes(f),
        )
      : undefined;
    const fields = requestedFields?.length ? requestedFields : [...PRODUCTION_CERTIFICATE_FIELDS];
    const result = await runCertificateEnrichmentJob((blobServiceClient ?? {}) as any, {
      limit: req.body?.limit,
      dryRun: req.body?.dryRun === true,
      force: req.body?.force === true,
      forceText: defaults.forceText ?? (req.body?.forceText === true),
      onlyUsableText: defaults.onlyUsableText ?? (req.body?.onlyUsableText === true),
      includeDetails: req.body?.includeDetails === true,
      reviewSampleLimit: req.body?.reviewSampleLimit,
      fields,
    });
    if (!result.dryRun && (result.updated > 0 || result.reviewRequired > 0 || result.failed > 0)) {
      invalidateListAndStatsCache();
    }
    return res.json(result);
  } catch (err: any) {
    logger.error('Certificate enrichment job failed', err instanceof Error ? err : new Error(String(err)));
    return res.status(500).json({ message: 'Certificate enrichment failed', error: err.message });
  }
}

router.post('/enrich-missing', async (req: Request, res: Response) => {
  return runCertificateEnrichmentEndpoint(req, res);
});

router.post('/enrich-usable-text', async (req: Request, res: Response) => {
  return runCertificateEnrichmentEndpoint(req, res, { onlyUsableText: true, forceText: false });
});

router.get('/production-coverage', async (req: Request, res: Response) => {
  if (!requireInternalApiKey(req, res)) return;

  try {
    return res.json(await getProductionCertificateCoverage());
  } catch (err: any) {
    logger.error('Certificate production coverage failed', err instanceof Error ? err : new Error(String(err)));
    return res.status(500).json({ message: 'Certificate production coverage failed', error: err.message });
  }
});

router.get('/extraction-coverage', async (req: Request, res: Response) => {
  if (!requireInternalApiKey(req, res)) return;

  try {
    const coverage = await getCertificateTextExtractionCoverage();
    return res.json(coverage);
  } catch (err: any) {
    logger.error('Certificate extraction coverage failed', err instanceof Error ? err : new Error(String(err)));
    return res.status(500).json({ message: 'Certificate extraction coverage failed', error: err.message });
  }
});

const REVIEW_QUEUE_FIELDS = [
  'companyName',
  'sectorCode',
  'vatNumber',
  'bbbeeLevel',
  'companySize',
  'blackOwnership',
  'blackWomenOwnership',
  'expiryDate',
] as const;

router.get('/review-queue', async (req: Request, res: Response) => {
  if (!requireInternalApiKey(req, res)) return;

  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'MongoDB is not connected.' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const requestedField = typeof req.query.field === 'string' ? req.query.field : null;
    const validSectorCodes = OKIRU_HUB_SECTORS.map((sector) => sector.code);
    const reviewFilter: Record<string, unknown> = {
      $or: [
        { enrichmentStatus: 'review_required' },
        { reviewFields: { $exists: true, $ne: [] } },
        { extractionStatus: { $in: ['text_too_short', 'failed', 'unsupported'] } },
        { sectorCode: { $nin: [...validSectorCodes, null, ''] } },
      ],
    };
    if (requestedField && REVIEW_QUEUE_FIELDS.includes(requestedField as typeof REVIEW_QUEUE_FIELDS[number])) {
      reviewFilter.reviewFields = requestedField;
    }

    const projection = {
      _id: 0,
      id: 1,
      blobName: 1,
      fileName: 1,
      supplierName: 1,
      sectorCode: 1,
      sectorName: 1,
      vatNumber: 1,
      bbbeeLevel: 1,
      companySize: 1,
      blackOwnership: 1,
      blackWomenOwnership: 1,
      expiryDate: 1,
      extractionStatus: 1,
      extractionMode: 1,
      extractedTextLength: 1,
      extractionError: 1,
      enrichmentStatus: 1,
      reviewFields: 1,
      reviewCandidates: 1,
      fieldConfidence: 1,
      auditLog: { $slice: -1 },
      updatedAt: 1,
    };

    const [docs, total, fieldCounts] = await Promise.all([
      CertificateMetadataModel.find(reviewFilter, projection)
        .sort({ updatedAt: -1, id: 1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      CertificateMetadataModel.countDocuments(reviewFilter),
      Promise.all(REVIEW_QUEUE_FIELDS.map(async (field) => {
        const fieldFilter = field === 'sectorCode'
          ? { ...reviewFilter, $or: [{ reviewFields: 'sectorCode' }, { sectorCode: { $nin: [...validSectorCodes, null, ''] } }] }
          : { ...reviewFilter, reviewFields: field };
        return [field, await CertificateMetadataModel.countDocuments(fieldFilter)] as const;
      })),
    ]);

    const items = docs.map((doc: any) => {
      const sector = resolveOkiruHubSector(doc.sectorCode);
      const reviewFields = new Set<string>(Array.isArray(doc.reviewFields) ? doc.reviewFields : []);
      if (doc.sectorCode && !sector) reviewFields.add('sectorCode');
      if (doc.extractionStatus && ['text_too_short', 'failed', 'unsupported'].includes(doc.extractionStatus)) {
        reviewFields.add('extractedText');
      }
      const blobName = typeof doc.blobName === 'string' ? doc.blobName : '';
      const fileName = typeof doc.fileName === 'string' && doc.fileName.trim() ? doc.fileName : blobBasename(blobName);
      return {
        id: doc.id ?? null,
        blobName,
        fileName,
        companyName: doc.supplierName ?? null,
        reviewFields: Array.from(reviewFields),
        extractionStatus: doc.extractionStatus ?? null,
        extractionMode: doc.extractionMode ?? null,
        extractedTextLength: doc.extractedTextLength ?? 0,
        extractionError: doc.extractionError ?? null,
        enrichmentStatus: doc.enrichmentStatus ?? null,
        values: {
          sectorCode: sector?.sectorCode ?? null,
          sectorName: sector?.sectorName ?? null,
          vatNumber: doc.vatNumber ?? null,
          bbbeeLevel: typeof doc.bbbeeLevel === 'number' ? doc.bbbeeLevel : null,
          companySize: doc.companySize ?? null,
          blackOwnership: typeof doc.blackOwnership === 'number' ? doc.blackOwnership : null,
          blackWomenOwnership: typeof doc.blackWomenOwnership === 'number' ? doc.blackWomenOwnership : null,
          expiryDate: dateOnly(doc.expiryDate),
        },
        reviewCandidates: doc.reviewCandidates && typeof doc.reviewCandidates === 'object' ? doc.reviewCandidates : {},
        fieldConfidence: doc.fieldConfidence ?? {},
        latestAudit: Array.isArray(doc.auditLog) ? doc.auditLog[0] ?? null : null,
        reviewUrl: `/certificates?reviewBlob=${encodeURIComponent(blobName)}`,
        previewUrl: `/api/certificates/download?file=${encodeURIComponent(blobName)}&mode=redirect&disposition=inline`,
        downloadUrl: `/api/certificates/download?file=${encodeURIComponent(blobName)}&mode=redirect&disposition=attachment`,
      };
    });

    return res.json({
      total,
      limit,
      offset,
      productionFields: REVIEW_QUEUE_FIELDS,
      fieldCounts: Object.fromEntries(fieldCounts),
      items,
    });
  } catch (err: any) {
    logger.error('Certificate review queue failed', err instanceof Error ? err : new Error(String(err)));
    return res.status(500).json({ message: 'Certificate review queue failed', error: err.message });
  }
});

router.post('/retry-extraction', async (req: Request, res: Response) => {
  if (!requireInternalApiKey(req, res)) return;

  const blobServiceClient = getBlobServiceClient();
  if (!blobServiceClient) {
    return res.status(500).json({ message: 'Azure Storage is not configured.' });
  }

  try {
    const allowedStatuses: CertificateExtractionStatus[] = ['pending', 'completed', 'text_too_short', 'failed', 'missing_blob', 'unsupported', 'skipped'];
    const allowedModes: CertificateExtractionMode[] = ['azure_document_intelligence', 'pdf_text', 'ocr', 'filename_only', 'none', 'failed'];
    const statuses = Array.isArray(req.body?.statuses)
      ? req.body.statuses.filter((status: unknown): status is CertificateExtractionStatus =>
          typeof status === 'string' && allowedStatuses.includes(status as CertificateExtractionStatus),
        )
      : undefined;
    const modes = Array.isArray(req.body?.modes)
      ? req.body.modes.filter((mode: unknown): mode is CertificateExtractionMode =>
          typeof mode === 'string' && allowedModes.includes(mode as CertificateExtractionMode),
        )
      : undefined;
    const result = await runCertificateTextExtractionRetryJob(blobServiceClient, {
      limit: req.body?.limit,
      dryRun: req.body?.dryRun !== false,
      force: req.body?.force === true,
      includeDetails: req.body?.includeDetails !== false,
      statuses,
      modes,
      onlyMissingText: req.body?.onlyMissingText !== false,
      fileTimeoutMs: req.body?.fileTimeoutMs,
      concurrency: req.body?.concurrency,
    });
    if (!result.dryRun && result.updated > 0) {
      invalidateListAndStatsCache();
    }
    return res.json(result);
  } catch (err: any) {
    logger.error('Certificate extraction retry failed', err instanceof Error ? err : new Error(String(err)));
    return res.status(500).json({ message: 'Certificate extraction retry failed', error: err.message });
  }
});

// ============================================================================
// Internal helpers shared by /upload, /:id/verify, /:id/history, /:id/reports
// ============================================================================

interface ExistingCertSummary {
  id: string;
  slug: string | null;
  companyName: string;
  vatNumber: string | null;
  expiryDate: string | null;
  blobName: string | null;
  fileName: string | null;
  verified: boolean;
}

function summarizeMongoDoc(doc: any): ExistingCertSummary {
  return {
    id: doc.id,
    slug: doc.slug || null,
    companyName: doc.supplierName || deriveCompanyName(doc.fileName || doc.blobName || ''),
    vatNumber: doc.vatNumber || null,
    expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString().slice(0, 10) : null,
    blobName: doc.blobName || null,
    fileName: doc.fileName || null,
    verified: !!doc.verified,
  };
}

function summarizeLocalRec(rec: CertificateRecord): ExistingCertSummary {
  return {
    id: rec.id,
    slug: buildCertSlug(rec.companyName, rec.id),
    companyName: rec.companyName,
    vatNumber: rec.vatNumber,
    expiryDate: rec.expiryDate,
    blobName: rec.blobName,
    fileName: rec.fileName,
    verified: !!rec.verified,
  };
}

async function findCertificateByVat(vatRaw: string | null): Promise<{ source: 'mongo'; doc: any } | { source: 'local'; rec: CertificateRecord } | null> {
  const norm = normalizeVat(vatRaw);
  if (!norm) return null;
  if (isMongoConnected()) {
    try {
      const doc = await CertificateMetadataModel.findOne({
        $or: [
          { vatNumberNormalized: norm },
          // Fall back to a case/space-insensitive match for records uploaded
          // before the normalized field was introduced.
          { vatNumber: { $regex: new RegExp(`^\\s*${norm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*$`, 'i') } },
        ],
      }).lean();
      if (doc) return { source: 'mongo', doc };
    } catch {
      // ignore — fall through to local store
    }
  }
  const rec = certificateStore.getByVatNumber(norm);
  if (rec) return { source: 'local', rec };
  return null;
}

async function findCertificateById(id: string): Promise<{ source: 'mongo'; doc: any } | { source: 'local'; rec: CertificateRecord } | null> {
  if (!id) return null;
  if (isMongoConnected()) {
    try {
      const doc = await CertificateMetadataModel.findOne({ id }).lean();
      if (doc) return { source: 'mongo', doc };
    } catch {
      // ignore
    }
  }
  const rec = certificateStore.getById(id);
  if (rec) return { source: 'local', rec };
  return null;
}

function isAdminSession(req: Request): boolean {
  const userData = (req.session as any).userData as { role?: string; secondaryRoles?: string[] } | undefined;
  const roles = new Set<string>();
  if (userData?.role) roles.add(userData.role);
  for (const r of userData?.secondaryRoles ?? []) if (r) roles.add(r);
  return roles.has('admin') || roles.has('super_admin');
}

// ============================================================================
// MAIA extract preview — parse uploaded file without persisting (upload form).
// ============================================================================
router.post('/extract-preview', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File too large. Maximum size is 50MB per file.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No file provided' });
    }
    const extracted = await extractPreviewFromBuffer(file.buffer, file.originalname, file.mimetype);
    const payload = previewExtractionToFormJson(extracted);
    return res.json({
      success: true,
      data: payload,
      sectorDetected: payload.sectorDetected,
    });
  } catch (err: any) {
    logger.error('Certificate extract preview failed', err);
    return res.status(500).json({ message: 'Could not extract certificate data from file' });
  }
});

// ============================================================================
// Upload — requires authentication. Accepts metadata fields alongside files.
// Falls back to local disk + in-memory store when Azure isn't configured.
//
// VAT dedupe (Phase 1): if `vatNumber` matches an existing certificate the
// request is rejected with 409 unless `?action=update` is passed, in which
// case the upload is treated as a new VERSION of the existing certificate.
// ============================================================================
router.post('/upload', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  upload.array('files', 100)(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File too large. Maximum size is 50MB per file.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ message: 'Too many files. Maximum is 100 per batch.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    const body = (req.body || {}) as Record<string, string>;
    const fields = parseCertificateFormBody(body);

    if (!fields.companyName) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }
    if (!fields.sectorCode) {
      return res.status(400).json({ message: 'Sector is required' });
    }

    const companyName = fields.companyName;
    const vatNumber = fields.vatNumber;
    const vatNumberNormalized = normalizeVat(vatNumber);
    const companySize = fields.companySize;
    const blackOwnership = fields.blackOwnership;
    const blackWomenOwnership = fields.blackWomenOwnership;
    const expiryDate = fields.expiryDate;
    const mongoExtras = parsedFormToMongoSet(fields);
    const localExtras = parsedFormToLocalPatch(fields);

    const action = String(req.query.action || '').toLowerCase();
    const blobServiceClient = getBlobServiceClient();
    const orgId = (req.session as any).organizationId || 'public';
    const userId = (req.session as any).userId || null;
    const userName = (req.session as any).userData?.fullName || null;

    // ---- VAT dedupe ------------------------------------------------------
    let updateExisting: { source: 'mongo'; doc: any } | { source: 'local'; rec: CertificateRecord } | null = null;
    if (vatNumberNormalized) {
      const existing = await findCertificateByVat(vatNumberNormalized);
      if (existing && action !== 'update') {
        const summary = existing.source === 'mongo'
          ? summarizeMongoDoc(existing.doc)
          : summarizeLocalRec(existing.rec);
        logger.info('Upload rejected — VAT already exists', { vat: vatNumberNormalized, existingId: summary.id });
        return res.status(409).json(failWith(
          'A certificate with this VAT number already exists. Re-submit with ?action=update to add a new version.',
          'VAT_EXISTS',
          { existing: summary },
        ));
      }
      if (existing && action === 'update') {
        if (files.length !== 1) {
          return res.status(400).json(fail(
            'Versioned uploads (action=update) accept exactly one file at a time.',
            'VAT_VERSIONED_SINGLE_FILE_REQUIRED',
          ));
        }
        updateExisting = existing;
      }
    }

    const results: Array<{ fileName: string; blobName: string; status: 'uploaded' | 'error'; certificateId?: string | null; error?: string }> = [];

    // ----------------------------------------------------------------------
    // UPDATE PATH — replace the latest version on an existing certificate.
    // ----------------------------------------------------------------------
    if (updateExisting) {
      const file = files[0];
      try {
        let newBlobName: string;

        if (blobServiceClient) {
          const containerClient = getContainerClient(blobServiceClient);
          const sanitized = file.originalname.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
          newBlobName = `${orgId}/${randomUUID()}-${sanitized}`;
          const blockBlobClient = containerClient.getBlockBlobClient(newBlobName);
          await blockBlobClient.uploadData(file.buffer, {
            blobHTTPHeaders: { blobContentType: file.mimetype },
            metadata: {
              uploadedAt: new Date().toISOString(),
              originalName: file.originalname,
              organizationId: orgId,
              uploadedBy: userId || 'unknown',
              version: 'true',
            },
          });
        } else {
          const written = certificateStore.writeRawFile({
            fileName: file.originalname,
            buffer: file.buffer,
            organizationId: orgId,
          });
          newBlobName = written.blobName;
        }

        if (updateExisting.source === 'mongo') {
          const doc = updateExisting.doc;
          const snapshot = {
            blobName: doc.blobName,
            fileName: doc.fileName || null,
            expiryDate: doc.expiryDate || null,
            issueDate: doc.issueDate || null,
            bbbeeLevel: doc.bbbeeLevel ?? null,
            bbbeeScore: doc.bbbeeScore ?? null,
            blackOwnership: doc.blackOwnership ?? null,
            blackWomenOwnership: doc.blackWomenOwnership ?? null,
            companySize: doc.companySize || null,
            uploadedByUserId: doc.uploadedByUserId || null,
            uploadedAt: doc.createdAt || new Date(),
            replacedAt: new Date(),
          };
          await CertificateMetadataModel.updateOne(
            { id: doc.id },
            {
              $set: {
                blobName: newBlobName,
                fileName: file.originalname,
                ...mongoExtras,
                supplierName: companyName || doc.supplierName || deriveCompanyName(file.originalname),
                vatNumber: vatNumber || doc.vatNumber,
                vatNumberNormalized,
                companySize: companySize || doc.companySize || null,
                blackOwnership: blackOwnership ?? doc.blackOwnership ?? null,
                blackWomenOwnership: blackWomenOwnership ?? doc.blackWomenOwnership ?? null,
                expiryDate: expiryDate ? new Date(expiryDate) : (doc.expiryDate || null),
                status: statusFromExpiryDate(expiryDate || doc.expiryDate),
                extractionStatus: 'pending',
                extractionError: null,
                updatedAt: new Date(),
              },
              $push: { versions: snapshot },
            },
          );
          results.push({ fileName: file.originalname, blobName: newBlobName, status: 'uploaded' });
          logger.info('Certificate version added (Mongo)', { id: doc.id, blobName: newBlobName });

          if (blobServiceClient) {
            setImmediate(async () => {
              try { await processOneCertificate(blobServiceClient, newBlobName, true); }
              catch (err: any) { logger.error('Background extraction failed', { blobName: newBlobName, error: err.message }); }
            });
          }
        } else {
          const rec = updateExisting.rec;
          const snapshot: CertificateVersionLite = {
            blobName: rec.blobName,
            fileName: rec.fileName,
            expiryDate: rec.expiryDate,
            bbbeeLevel: rec.bbbeeLevel,
            blackOwnership: rec.blackOwnership,
            blackWomenOwnership: rec.blackWomenOwnership,
            companySize: rec.companySize,
            uploadedByUserId: rec.uploadedByUserId,
            uploadedAt: rec.createdAt,
            replacedAt: new Date().toISOString(),
          };
          certificateStore.pushVersion(rec.id, snapshot, {
            blobName: newBlobName,
            fileName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            companyName: companyName || rec.companyName,
            vatNumber: vatNumber || rec.vatNumber,
            companySize: companySize || rec.companySize,
            blackOwnership: blackOwnership ?? rec.blackOwnership,
            blackWomenOwnership: blackWomenOwnership ?? rec.blackWomenOwnership,
            expiryDate: expiryDate || rec.expiryDate,
            ...localExtras,
          });
          results.push({ fileName: file.originalname, blobName: newBlobName, status: 'uploaded' });
          logger.info('Certificate version added (local)', { id: rec.id, blobName: newBlobName });
        }

        const updatedId = updateExisting.source === 'mongo' ? updateExisting.doc.id : updateExisting.rec.id;
        invalidateListAndStatsCache();
        recordEvent({
          type: 'upload',
          certificateId: updatedId,
          userId: req.session?.userId || null,
          metadata: { action: 'updated' },
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
        });
        return res.json({
          message: `Certificate updated with new version`,
          action: 'updated' as const,
          certificateId: updatedId,
          results,
        });
      } catch (uploadErr: any) {
        logger.error('Certificate version upload failed', { error: uploadErr.message });
        return res.status(500).json(fail('Failed to add new version', 'VERSION_UPLOAD_FAILED'));
      }
    }

    // ----------------------------------------------------------------------
    // CREATE PATH — original behavior (unchanged for non-VAT or new-VAT uploads)
    // ----------------------------------------------------------------------
    if (blobServiceClient) {
      // Azure path — preserves existing extraction pipeline
      const containerClient = getContainerClient(blobServiceClient);
      for (const file of files) {
        try {
          const sanitized = file.originalname.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
          const blobName = `${orgId}/${randomUUID()}-${sanitized}`;
          const blockBlobClient = containerClient.getBlockBlobClient(blobName);

          await blockBlobClient.uploadData(file.buffer, {
            blobHTTPHeaders: { blobContentType: file.mimetype },
            metadata: {
              uploadedAt: new Date().toISOString(),
              originalName: file.originalname,
              organizationId: orgId,
              uploadedBy: userId || 'unknown',
            },
          });

          // Persist metadata in Mongo when available, otherwise use local store as cache
          let mongoCertId: string | null = null;
          if (isMongoConnected()) {
            try {
              const saved = await CertificateMetadataModel.findOneAndUpdate(
                { blobName },
                {
                  blobName,
                  fileName: file.originalname,
                  ...mongoExtras,
                  supplierName: companyName || deriveCompanyName(file.originalname),
                  vatNumber,
                  vatNumberNormalized,
                  companySize,
                  blackOwnership,
                  blackWomenOwnership,
                  expiryDate: expiryDate ? new Date(expiryDate) : null,
                  status: statusFromExpiryDate(expiryDate),
                  uploadedByUserId: userId,
                  updatedAt: new Date(),
                },
                { upsert: true, new: true },
              );
              mongoCertId = (saved as { id?: string })?.id ?? null;
              if (mongoCertId) {
                const supplier = companyName || deriveCompanyName(file.originalname);
                const canonicalSlug = buildCertSlug(supplier, mongoCertId);
                if (canonicalSlug) {
                  await CertificateMetadataModel.updateOne(
                    { id: mongoCertId },
                    { $set: { slug: canonicalSlug, updatedAt: new Date() } },
                  );
                }
              }
            } catch (mongoErr) {
              logger.warn('Mongo upsert failed', { err: (mongoErr as Error).message });
            }
          } else {
            certificateStore.addMetadata({
              blobName,
              fileName: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              companyName: companyName || deriveCompanyName(file.originalname),
              vatNumber,
              companySize,
              blackOwnership,
              blackWomenOwnership,
              expiryDate,
              uploadedByUserId: userId,
              organizationId: orgId,
              ...localExtras,
            });
          }

          results.push({ fileName: file.originalname, blobName, status: 'uploaded', certificateId: mongoCertId });
          logger.info('Certificate uploaded (Azure)', { fileName: file.originalname, blobName });
        } catch (uploadErr: any) {
          results.push({ fileName: file.originalname, blobName: file.originalname, status: 'error', error: uploadErr.message });
          logger.error('Failed to upload certificate', { fileName: file.originalname, error: uploadErr.message });
        }
      }

      const uploaded = results.filter(r => r.status === 'uploaded').length;
      if (uploaded > 0) {
        const uploadedBlobs = results.filter(r => r.status === 'uploaded').map(r => r.blobName);
        setImmediate(async () => {
          for (const blobName of uploadedBlobs) {
            try {
              await processOneCertificate(blobServiceClient, blobName, true);
            } catch (err: any) {
              logger.error('Background extraction failed', { blobName, error: err.message });
            }
          }
        });
      }
    } else {
      // Local disk + in-memory store path
      for (const file of files) {
        try {
          const rec = certificateStore.add({
            fileName: file.originalname,
            buffer: file.buffer,
            mimeType: file.mimetype,
            companyName: companyName || deriveCompanyName(file.originalname),
            vatNumber,
            companySize,
            blackOwnership,
            blackWomenOwnership,
            bbbeeLevel: fields.bbbeeLevel,
            expiryDate,
            uploadedByUserId: userId,
            organizationId: orgId,
            ...localExtras,
          });
          results.push({ fileName: file.originalname, blobName: rec.blobName, status: 'uploaded' });
          logger.info('Certificate uploaded (local)', { fileName: file.originalname, id: rec.id });
        } catch (uploadErr: any) {
          results.push({ fileName: file.originalname, blobName: file.originalname, status: 'error', error: uploadErr.message });
          logger.error('Failed to upload certificate locally', { fileName: file.originalname, error: uploadErr.message });
        }
      }
    }

    const uploaded = results.filter(r => r.status === 'uploaded').length;
    const failed = results.filter(r => r.status === 'error').length;

    if (uploaded > 0) {
      invalidateListAndStatsCache();
      recordEvent({
        type: 'upload',
        userId: req.session?.userId || null,
        metadata: { uploadedCount: uploaded, failedCount: failed, action: 'created' },
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
    }

    return res.json({
      message: `${uploaded} file(s) uploaded${failed > 0 ? `, ${failed} failed` : ''}`,
      action: 'created' as const,
      results,
    });
  } catch (err: any) {
    logger.error('Certificate upload failed', err);
    return res.status(500).json({ message: 'Upload failed' });
  }
});

// ============================================================================
// Phase 1 endpoints — verification, history, reports, admin reports
// All NEW endpoints use the standard {success,data,error} envelope.
//
// IMPORTANT: these must be declared BEFORE the catch-all `/:userId` route
// further down so they aren't shadowed by it.
// ============================================================================

// --- ADMIN: list all reports (place before /:id/* to avoid id collision) ---
router.get('/admin/reports', requireAuth, async (req: Request, res: Response) => {
  if (!isAdminSession(req)) {
    return res.status(403).json(fail('Admin access required', 'FORBIDDEN'));
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const status = String(req.query.status || '').trim();

  if (isMongoConnected()) {
    try {
      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      const [items, total] = await Promise.all([
        CertificateReportModel.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
        CertificateReportModel.countDocuments(filter),
      ]);
      return res.json(ok({ items, total, limit, offset }));
    } catch (err: any) {
      logger.warn('Mongo report list failed', { error: err.message });
    }
  }
  // Local fallback
  let items = certificateStore.listReports();
  if (status) items = items.filter((r) => r.status === status);
  const total = items.length;
  return res.json(ok({ items: items.slice(offset, offset + limit), total, limit, offset }));
});

// --- ADMIN: usage analytics summary ----------------------------------------
router.get('/admin/analytics', requireAuth, async (req: Request, res: Response) => {
  if (!isAdminSession(req)) {
    return res.status(403).json(fail('Admin access required', 'FORBIDDEN'));
  }
  try {
    const summary = await getAnalyticsSummary();
    return res.json(ok(summary));
  } catch (err: any) {
    logger.error('Failed to compute analytics', err);
    return res.status(500).json(fail('Failed to compute analytics', 'ANALYTICS_FAILED'));
  }
});

// --- ADMIN: duplicate clusters by VAT --------------------------------------
// Public registry deduplicates on upload, but historical Mongo + Azure data
// may already contain duplicates. This surfaces clusters so an admin can
// merge or remove them.
router.get('/admin/duplicates', requireAuth, async (req: Request, res: Response) => {
  if (!isAdminSession(req)) {
    return res.status(403).json(fail('Admin access required', 'FORBIDDEN'));
  }
  try {
    const rows = await loadAllRows();
    const buckets = new Map<string, typeof rows>();
    for (const r of rows) {
      const vat = normalizeVat(r.vatNumber);
      if (!vat) continue;
      const arr = buckets.get(vat) || [];
      arr.push(r);
      buckets.set(vat, arr);
    }
    const clusters = Array.from(buckets.entries())
      .filter(([, arr]) => arr.length > 1)
      .map(([vat, arr]) => ({
        vatNumber: vat,
        count: arr.length,
        certificates: arr.map((r) => ({
          id: r.id,
          slug: r.slug,
          companyName: r.companyName,
          fileName: r.fileName,
          expiryDate: r.expiryDate,
          status: r.status,
          verified: r.verified,
          lastModified: r.lastModified,
        })),
      }))
      .sort((a, b) => b.count - a.count);
    return res.json(ok({ clusters, totalClusters: clusters.length }));
  } catch (err: any) {
    logger.error('Failed to compute duplicate clusters', err);
    return res.status(500).json(fail('Failed to compute duplicates', 'DUPLICATES_FAILED'));
  }
});

// --- PUBLIC: certificate version history -----------------------------------
router.get('/:id/history', async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json(fail('Certificate id required', 'INVALID_INPUT'));

  const found = await findCertificateById(id);
  if (!found) return res.status(404).json(fail('Certificate not found', 'NOT_FOUND'));

  if (found.source === 'mongo') {
    const doc = found.doc;
    const versions = Array.isArray(doc.versions) ? doc.versions : [];
    return res.json(ok({
      certificateId: doc.id,
      slug: doc.slug || null,
      latest: {
        blobName: doc.blobName,
        fileName: doc.fileName,
        expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString().slice(0, 10) : null,
        uploadedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
        uploadedByUserId: doc.uploadedByUserId || null,
      },
      versions: versions.map((v: any) => ({
        blobName: v.blobName,
        fileName: v.fileName,
        expiryDate: v.expiryDate ? new Date(v.expiryDate).toISOString().slice(0, 10) : null,
        uploadedAt: v.uploadedAt ? new Date(v.uploadedAt).toISOString() : null,
        replacedAt: v.replacedAt ? new Date(v.replacedAt).toISOString() : null,
        uploadedByUserId: v.uploadedByUserId || null,
      })),
    }));
  }

  const rec = found.rec;
  return res.json(ok({
    certificateId: rec.id,
    slug: buildCertSlug(rec.companyName, rec.id),
    latest: {
      blobName: rec.blobName,
      fileName: rec.fileName,
      expiryDate: rec.expiryDate,
      uploadedAt: rec.updatedAt,
      uploadedByUserId: rec.uploadedByUserId,
    },
    versions: (rec.versions || []).map((v) => ({
      blobName: v.blobName,
      fileName: v.fileName,
      expiryDate: v.expiryDate,
      uploadedAt: v.uploadedAt,
      replacedAt: v.replacedAt,
      uploadedByUserId: v.uploadedByUserId,
    })),
  }));
});

// --- PUBLIC: report incorrect data -----------------------------------------
router.post('/:id/reports', async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json(fail('Certificate id required', 'INVALID_INPUT'));

  const body = (req.body || {}) as Record<string, string>;
  const reason = String(body.reason || '').trim() as 'incorrect-data' | 'expired' | 'fraudulent' | 'duplicate' | 'other';
  const message = String(body.message || '').trim();
  const email = (body.email || '').trim() || null;

  const validReasons = ['incorrect-data', 'expired', 'fraudulent', 'duplicate', 'other'];
  if (!validReasons.includes(reason)) {
    return res.status(400).json(fail('Invalid reason. Must be one of: ' + validReasons.join(', '), 'INVALID_REASON'));
  }
  if (!message || message.length < 10) {
    return res.status(400).json(fail('Message must be at least 10 characters', 'INVALID_MESSAGE'));
  }
  if (message.length > 4000) {
    return res.status(400).json(fail('Message too long (max 4000 characters)', 'MESSAGE_TOO_LONG'));
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json(fail('Invalid email address', 'INVALID_EMAIL'));
  }

  const found = await findCertificateById(id);
  if (!found) return res.status(404).json(fail('Certificate not found', 'NOT_FOUND'));

  const slug = found.source === 'mongo'
    ? (found.doc.slug || null)
    : buildCertSlug(found.rec.companyName, found.rec.id);

  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
  const userAgent = (req.headers['user-agent'] as string) || null;

  if (isMongoConnected()) {
    try {
      const created = await CertificateReportModel.create({
        certificateId: id,
        certificateSlug: slug,
        reason,
        message,
        email,
        ipAddress,
        userAgent,
      });
      // bump report count on the cert
      try {
        await CertificateMetadataModel.updateOne({ id }, { $inc: { reportCount: 1 } });
      } catch { /* ignore */ }
      recordEvent({
        type: 'report',
        certificateId: id,
        certificateSlug: slug,
        userId: req.session?.userId || null,
        metadata: { reason, reportId: created.id },
        ipAddress,
        userAgent,
      });
      logger.info('Report submitted (Mongo)', { certificateId: id, reportId: created.id });
      return res.status(201).json(ok({
        id: created.id,
        certificateId: id,
        reason,
        status: created.status,
        createdAt: created.createdAt,
      }));
    } catch (err: any) {
      logger.warn('Mongo report write failed, falling back to local', { error: err.message });
    }
  }

  const rec = certificateStore.addReport({
    certificateId: id,
    certificateSlug: slug,
    reason,
    message,
    email,
    ipAddress,
    userAgent,
  });
  certificateStore.incrementReportCount(id, 1);
  recordEvent({
    type: 'report',
    certificateId: id,
    certificateSlug: slug,
    userId: req.session?.userId || null,
    metadata: { reason, reportId: rec.id },
    ipAddress,
    userAgent,
  });
  logger.info('Report submitted (local)', { certificateId: id, reportId: rec.id });
  return res.status(201).json(ok({
    id: rec.id,
    certificateId: id,
    reason,
    status: rec.status,
    createdAt: rec.createdAt,
  }));
});

// --- ADMIN: verify certificate ---------------------------------------------
router.post('/:id/verify', requireAuth, async (req: Request, res: Response) => {
  if (!isAdminSession(req)) return res.status(403).json(fail('Admin access required', 'FORBIDDEN'));
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json(fail('Certificate id required', 'INVALID_INPUT'));

  const userId = (req.session as any).userId || null;
  const userName = (req.session as any).userData?.fullName || null;
  const verifiedAt = new Date();

  const found = await findCertificateById(id);
  if (!found) return res.status(404).json(fail('Certificate not found', 'NOT_FOUND'));

  if (found.source === 'mongo') {
    await CertificateMetadataModel.updateOne(
      { id },
      { $set: { verified: true, verifiedBy: userId, verifiedByName: userName, verifiedAt, updatedAt: new Date() } },
    );
  } else {
    certificateStore.setVerified(id, true, userId, userName);
  }
  invalidateListAndStatsCache();
  recordEvent({
    type: 'verify',
    certificateId: id,
    userId,
    metadata: { verifiedByName: userName },
    ipAddress: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
  });
  logger.info('Certificate verified', { id, by: userId });
  return res.json(ok({
    id,
    verified: true,
    verifiedBy: userId,
    verifiedByName: userName,
    verifiedAt: verifiedAt.toISOString(),
  }));
});

// --- ADMIN: unverify certificate -------------------------------------------
router.post('/:id/unverify', requireAuth, async (req: Request, res: Response) => {
  if (!isAdminSession(req)) return res.status(403).json(fail('Admin access required', 'FORBIDDEN'));
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json(fail('Certificate id required', 'INVALID_INPUT'));

  const found = await findCertificateById(id);
  if (!found) return res.status(404).json(fail('Certificate not found', 'NOT_FOUND'));

  if (found.source === 'mongo') {
    await CertificateMetadataModel.updateOne(
      { id },
      { $set: { verified: false, verifiedBy: null, verifiedByName: null, verifiedAt: null, updatedAt: new Date() } },
    );
  } else {
    certificateStore.setVerified(id, false, null, null);
  }
  invalidateListAndStatsCache();
  recordEvent({
    type: 'unverify',
    certificateId: id,
    userId: req.session?.userId || null,
    ipAddress: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
  });
  logger.info('Certificate unverified', { id });
  return res.json(ok({ id, verified: false }));
});

// --- COMPANY: list own certificates ----------------------------------------
router.get('/mine', requireAuth, async (req: Request, res: Response) => {
  const sessionUserId = (req.session as any).userId as string;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const status = String(req.query.status || '').trim() || null;

  if (isMongoConnected()) {
    try {
      const filter: Record<string, unknown> = { uploadedByUserId: sessionUserId };
      if (status) filter.status = status;
      const [docs, total] = await Promise.all([
        CertificateMetadataModel.find(filter, { extractedText: 0 })
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        CertificateMetadataModel.countDocuments(filter),
      ]);
      return res.json(ok({
        items: (docs as any[]).map((d) => ({
          id: d.id,
          blobName: d.blobName,
          fileName: d.fileName,
          supplierName: d.supplierName || null,
          vatNumber: d.vatNumber || null,
          companySize: d.companySize || null,
          bbbeeLevel: d.bbbeeLevel ?? null,
          bbbeeScore: d.bbbeeScore ?? null,
          blackOwnership: d.blackOwnership ?? null,
          blackWomenOwnership: d.blackWomenOwnership ?? null,
          verificationAgency: d.verificationAgency || null,
          certificateNumber: d.certificateNumber || null,
          expiryDate: d.expiryDate ? new Date(d.expiryDate).toISOString().slice(0, 10) : null,
          issueDate: d.issueDate ? new Date(d.issueDate).toISOString().slice(0, 10) : null,
          status: d.status || 'unknown',
          extractionStatus: d.extractionStatus || 'pending',
          slug: d.slug || null,
          verified: d.verified ?? false,
          updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
        })),
        total,
        limit,
        skip,
      }));
    } catch (err: any) {
      logger.error('Failed to list own certificates', err);
      return res.status(500).json(fail('Failed to list certificates', 'DB_ERROR'));
    }
  }

  // Local fallback
  let recs = certificateStore.list().filter((r) => r.uploadedByUserId === sessionUserId);
  if (status) recs = recs.filter((r) => r.status === status);
  const total = recs.length;
  const sliced = recs.slice(skip, skip + limit).map((r) => ({
    id: r.id,
    blobName: r.blobName,
    fileName: r.fileName,
    supplierName: r.companyName,
    vatNumber: r.vatNumber ?? null,
    companySize: r.companySize ?? null,
    bbbeeLevel: r.bbbeeLevel ?? null,
    bbbeeScore: null,
    blackOwnership: r.blackOwnership ?? null,
    blackWomenOwnership: r.blackWomenOwnership ?? null,
    verificationAgency: null,
    certificateNumber: null,
    expiryDate: r.expiryDate ?? null,
    issueDate: null,
    status: r.status,
    extractionStatus: 'completed' as const,
    slug: buildCertSlug(r.companyName, r.id),
    verified: r.verified ?? false,
    updatedAt: r.updatedAt ?? null,
  }));
  return res.json(ok({ items: sliced, total, limit, skip }));
});

// --- COMPANY / ADMIN: correct certificate metadata -------------------------
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json(fail('Certificate id required', 'INVALID_INPUT'));

  const sessionUserId = (req.session as any).userId as string | undefined;
  const sessionRole = (req.session as any).userData?.role as string | undefined;
  const isAdmin = sessionRole === 'admin' || sessionRole === 'super_admin';

  const PATCHABLE = [
    'supplierName', 'vatNumber', 'companySize',
    'blackOwnership', 'blackWomenOwnership',
    'flowThroughBlackOwnership', 'blackDesignatedGroupOwnership',
    'empoweringSupplier', 'firstProcurementDate', 'sizeAtFirstProcurement',
    'sdRecipient', 'threeYearContract', 'annualSpend',
    'location', 'businessUnit', 'sectorCode', 'sectorName',
    'verificationAgency', 'certificateNumber',
    'bbbeeLevel', 'bbbeeScore',
    'issueDate', 'expiryDate',
  ] as const;

  const body = (req.body || {}) as Record<string, unknown>;
  if ('companyName' in body && !('supplierName' in body)) {
    body.supplierName = body.companyName;
  }
  const updates: Record<string, unknown> = {};

  for (const key of PATCHABLE) {
    if (!(key in body)) continue;
    const v = body[key];
    if (key === 'issueDate' || key === 'expiryDate' || key === 'firstProcurementDate') {
      if (v == null || v === '') { updates[key] = null; }
      else { const d = new Date(String(v)); if (!isNaN(d.getTime())) updates[key] = d; }
    } else if ([
      'blackOwnership', 'blackWomenOwnership', 'flowThroughBlackOwnership',
      'blackDesignatedGroupOwnership', 'bbbeeLevel', 'bbbeeScore', 'annualSpend',
    ].includes(key)) {
      if (v == null || v === '') { updates[key] = null; }
      else { const n = Number(v); if (Number.isFinite(n) && n >= 0) updates[key] = n; }
    } else if (['empoweringSupplier', 'sdRecipient', 'threeYearContract'].includes(key)) {
      if (v == null || v === '') { updates[key] = null; }
      else {
        const s = String(v).toLowerCase();
        updates[key] = v === true || s === 'true' || s === '1' || s === 'yes';
      }
    } else if (key === 'sectorCode') {
      const resolved = resolveOkiruHubSector(v);
      updates.sectorCode = resolved?.sectorCode ?? null;
      updates.sectorName = resolved?.sectorName ?? null;
    } else if (key === 'sectorName') {
      continue;
    } else {
      updates[key] = (v == null || v === '') ? null : String(v).trim() || null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json(fail('No valid patchable fields provided', 'INVALID_INPUT'));
  }

  if (isMongoConnected()) {
    try {
      const doc = await CertificateMetadataModel.findOne({ id }).lean() as any;
      if (!doc) return res.status(404).json(fail('Certificate not found', 'NOT_FOUND'));
      if (!isAdmin && doc.uploadedByUserId !== sessionUserId) {
        return res.status(403).json(fail('Not authorised to edit this certificate', 'FORBIDDEN'));
      }
      if ('vatNumber' in updates) {
        updates['vatNumberNormalized'] = normalizeVat(updates['vatNumber'] as string | null);
      }
      if ('bbbeeLevel' in updates) {
        updates['bbbeeLevelStatus'] = updates['bbbeeLevel'] == null ? null : `Level ${updates['bbbeeLevel']}`;
      }
      if ('expiryDate' in updates) {
        const exp = updates['expiryDate'] as Date | null;
        if (!exp) { updates['status'] = 'unknown'; }
        else {
          const now = Date.now(), sixtyDays = now + 60 * 24 * 60 * 60 * 1000;
          updates['status'] = exp.getTime() < now ? 'expired' : exp.getTime() <= sixtyDays ? 'expiring' : 'valid';
        }
      }
      updates['updatedAt'] = new Date();
      const confirmedFields = Object.keys(updates).filter((key) => !['updatedAt', 'vatNumberNormalized', 'status'].includes(key));
      const unsetReviewCandidates = Object.fromEntries(
        confirmedFields.map((field) => [`reviewCandidates.${field}`, '']),
      );
      const remainingReviewFields = Array.isArray(doc.reviewFields)
        ? doc.reviewFields.filter((field: string) => !confirmedFields.includes(field))
        : [];
      const remainingReviewCandidates = doc.reviewCandidates && typeof doc.reviewCandidates === 'object'
        ? Object.keys(doc.reviewCandidates).filter((field) => !confirmedFields.includes(field))
        : [];
      await CertificateMetadataModel.updateOne(
        { id },
        {
          $set: {
            ...updates,
            reviewFields: remainingReviewFields,
            enrichmentStatus: remainingReviewFields.length > 0 || remainingReviewCandidates.length > 0 ? 'review_required' : 'completed',
          },
          ...(Object.keys(unsetReviewCandidates).length ? { $unset: unsetReviewCandidates } : {}),
        },
      );
      invalidateListAndStatsCache();
      logger.info('Certificate patched', { id, fields: Object.keys(updates) });
      const returnedFields = confirmedFields;
      return res.json(ok({ id, updated: returnedFields }));
    } catch (err: any) {
      logger.error('Failed to patch certificate', err);
      return res.status(500).json(fail('Failed to update certificate', 'DB_ERROR'));
    }
  }

  // Local fallback
  const rec = certificateStore.list().find((r) => r.id === id) ?? null;
  if (!rec) return res.status(404).json(fail('Certificate not found', 'NOT_FOUND'));
  if (!isAdmin && rec.uploadedByUserId !== sessionUserId) {
    return res.status(403).json(fail('Not authorised to edit this certificate', 'FORBIDDEN'));
  }
  const localPatch: Record<string, unknown> = {};
  const localFieldMap: Record<string, string> = {
    supplierName: 'companyName',
    vatNumber: 'vatNumber',
    companySize: 'companySize',
    bbbeeLevel: 'bbbeeLevel',
    blackOwnership: 'blackOwnership',
    blackWomenOwnership: 'blackWomenOwnership',
    flowThroughBlackOwnership: 'flowThroughBlackOwnership',
    blackDesignatedGroupOwnership: 'blackDesignatedGroupOwnership',
    empoweringSupplier: 'empoweringSupplier',
    firstProcurementDate: 'firstProcurementDate',
    sizeAtFirstProcurement: 'sizeAtFirstProcurement',
    sdRecipient: 'sdRecipient',
    threeYearContract: 'threeYearContract',
    annualSpend: 'annualSpend',
    location: 'location',
    businessUnit: 'businessUnit',
    sectorCode: 'sectorCode',
    sectorName: 'sectorName',
  };
  for (const [mongoKey, localKey] of Object.entries(localFieldMap)) {
    if (!(mongoKey in updates)) continue;
    const v = updates[mongoKey];
    if (mongoKey === 'expiryDate' || mongoKey === 'firstProcurementDate') {
      localPatch[localKey] = v instanceof Date ? v.toISOString().slice(0, 10) : null;
    } else {
      localPatch[localKey] = v;
    }
  }
  if ('expiryDate' in updates) {
    const exp = updates['expiryDate'];
    localPatch['expiryDate'] = exp instanceof Date ? exp.toISOString().slice(0, 10) : null;
  }
  if ('firstProcurementDate' in updates) {
    const d = updates['firstProcurementDate'];
    localPatch['firstProcurementDate'] = d instanceof Date ? d.toISOString().slice(0, 10) : null;
  }
  certificateStore.patchRecord(id, localPatch as any);
  invalidateListAndStatsCache();
  return res.json(ok({ id, updated: Object.keys(localPatch) }));
});

router.get('/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = singleRouteParam(req.params.userId).trim();
    if (!userId || userId.trim() === '') {
      return res.status(400).json({ message: 'userId is required' });
    }

    // Authorization: only the owner (or an admin) can list another user's certificates.
    const sessionUserId = (req.session as any).userId;
    const sessionRole = (req.session as any).userData?.role;
    const isAdmin = sessionRole === 'admin' || sessionRole === 'super_admin';
    if (!isAdmin && sessionUserId !== userId.trim()) {
      return res.status(403).json({ message: 'Not allowed to list certificates for this user' });
    }

    const blobServiceClient = getBlobServiceClient();
    if (!blobServiceClient) {
      // Local store fallback by uploadedByUserId
      const local = certificateStore.list().filter((r) => r.uploadedByUserId === userId.trim());
      return res.json(local.map((r) => ({ name: r.blobName, fileName: r.fileName })));
    }

    const containerClient = getContainerClient(blobServiceClient);
    const prefix = `${userId.trim()}/`;
    const blobs: Array<{ name: string; fileName: string }> = [];

    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      const fileName = blob.name.substring(prefix.length);
      if (fileName) {
        blobs.push({ name: blob.name, fileName });
      }
    }

    logger.info('Listed certificates', { userId, count: blobs.length });
    return res.json(blobs);
  } catch (err) {
    logger.error('Failed to list certificates', err as Error);
    return res.status(500).json({ message: 'Failed to list certificates' });
  }
});

export default router;
