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
import { processAllCertificates, processOneCertificate, getCertificateStats, extractCertificateData } from '../services/certificateExtractor.js';
import { CertificateMetadataModel, CertificateReportModel } from '../../models.js';
import { isMongoConnected } from '../../db.js';
import { certificateStore, normalizeVat, type CertificateRecord, type CertificateVersionLite } from '../services/certificateStore.js';
import { ok, fail, failWith } from '../utils/apiResponse.js';
import { recordEvent, getAnalyticsSummary } from '../services/analytics.js';

const logger = createLogger("Certificates");
const router = Router();

const CONTAINER_NAME = 'clients-certs';

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

function getConnectionString(): string | undefined {
  return process.env.AZURE_STORAGE_CONNECTION_STRING;
}

function getAccountName(): string | undefined {
  return process.env.AZURE_STORAGE_ACCOUNT_NAME;
}

function getBlobServiceClient(): BlobServiceClient | null {
  const connStr = getConnectionString();
  if (!connStr) {
    return null;
  }
  return BlobServiceClient.fromConnectionString(connStr);
}

function getContainerClient(blobServiceClient: BlobServiceClient) {
  return blobServiceClient.getContainerClient(CONTAINER_NAME);
}

// ============================================================================
// Public API row shape — used by the certificates browse UI.
// ============================================================================
interface CertificateRow {
  name: string;            // blob name (id key for /download)
  fileName: string;        // displayable filename
  companyName: string;
  vatNumber: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  bbbeeLevel: number | null;
  expiryDate: string | null;
  status: 'valid' | 'expiring' | 'expired' | 'unknown';
  lastModified: string | null;
  // Phase 2 — public visibility
  id: string | null;       // stable certificate id (for /:id/* endpoints)
  slug: string | null;     // canonical slug for /certificates/:slug
  verified: boolean;
}

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
    if (k.startsWith('list:') || k.startsWith('stats:')) {
      responseCache.delete(k);
    }
  }
}

function statusFromExpiryDate(expiry: Date | string | null | undefined): CertificateRow['status'] {
  if (!expiry) return 'unknown';
  const t = expiry instanceof Date ? expiry.getTime() : new Date(expiry).getTime();
  if (!Number.isFinite(t)) return 'unknown';
  const now = Date.now();
  if (t < now) return 'expired';
  if (t <= now + 60 * 24 * 60 * 60 * 1000) return 'expiring';
  return 'valid';
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

function rowFromLocal(rec: CertificateRecord): CertificateRow {
  return {
    name: rec.blobName,
    fileName: rec.fileName,
    companyName: rec.companyName,
    vatNumber: rec.vatNumber,
    companySize: rec.companySize,
    blackOwnership: rec.blackOwnership,
    blackWomenOwnership: rec.blackWomenOwnership,
    bbbeeLevel: rec.bbbeeLevel,
    expiryDate: rec.expiryDate,
    status: rec.status,
    lastModified: rec.updatedAt,
    id: rec.id,
    slug: buildCertSlug(rec.companyName, rec.id),
    verified: !!rec.verified,
  };
}

function rowFromMongo(doc: any, blobLastModified: string | null = null, fileNameFallback?: string): CertificateRow {
  const fileName = fileNameFallback || doc.fileName || (doc.blobName?.split('/').pop() || doc.blobName);
  const expiry = doc.expiryDate ? new Date(doc.expiryDate) : null;
  const companyName = doc.supplierName || deriveCompanyName(fileName);
  const id = doc.id || null;
  return {
    name: doc.blobName,
    fileName,
    companyName,
    vatNumber: doc.vatNumber || null,
    companySize: doc.companySize || null,
    blackOwnership: doc.blackOwnership ?? null,
    blackWomenOwnership: doc.blackWomenOwnership ?? null,
    bbbeeLevel: doc.bbbeeLevel ?? null,
    expiryDate: expiry ? expiry.toISOString().slice(0, 10) : null,
    status: doc.status || statusFromExpiryDate(expiry),
    lastModified: blobLastModified || (doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null),
    id,
    slug: doc.slug || (id ? buildCertSlug(companyName, id) : null),
    verified: !!doc.verified,
  };
}

async function loadAllRows(): Promise<CertificateRow[]> {
  const rows: CertificateRow[] = [];
  const seenBlobs = new Set<string>();

  // 1) Local in-memory store (always available)
  for (const rec of certificateStore.list()) {
    rows.push(rowFromLocal(rec));
    seenBlobs.add(rec.blobName);
  }

  // 2) Azure blob storage (if configured)
  const blobServiceClient = getBlobServiceClient();
  let mongoMap = new Map<string, any>();
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
      mongoMap = await loadMongoMetadataMap(azureBlobs.map((b) => b.name));
      for (const b of azureBlobs) {
        if (seenBlobs.has(b.name)) continue;
        const md = mongoMap.get(b.name);
        const fileName = b.name.split('/').pop() || b.name;
        if (md) {
          rows.push(rowFromMongo(md, b.lastModified, fileName));
        } else {
          rows.push({
            name: b.name,
            fileName,
            companyName: deriveCompanyName(fileName),
            vatNumber: null,
            companySize: null,
            blackOwnership: null,
            blackWomenOwnership: null,
            bbbeeLevel: null,
            expiryDate: null,
            status: 'unknown',
            lastModified: b.lastModified,
            id: null,
            slug: null,
            verified: false,
          });
        }
        seenBlobs.add(b.name);
      }
    } catch (azureErr) {
      logger.warn('Azure blob enumeration failed — using local + mongo only', {
        err: (azureErr as Error).message,
      });
    }
  }

  // 3) Mongo-only records (no matching Azure blob)
  if (isMongoConnected()) {
    try {
      const docs = await CertificateMetadataModel.find(
        {},
        { extractedText: 0 },
      ).lean();
      for (const doc of docs as any[]) {
        if (!doc.blobName || seenBlobs.has(doc.blobName)) continue;
        rows.push(rowFromMongo(doc));
        seenBlobs.add(doc.blobName);
      }
    } catch (mongoErr) {
      logger.warn('Mongo enumeration failed', { err: (mongoErr as Error).message });
    }
  }

  return rows;
}

function applyFilters(rows: CertificateRow[], q: {
  search?: string;
  status?: string;
  size?: string;
  minOwnership?: number;
  maxOwnership?: number;
}): CertificateRow[] {
  let out = rows;
  if (q.search) {
    const s = q.search.toLowerCase();
    out = out.filter((r) =>
      r.companyName.toLowerCase().includes(s) ||
      r.fileName.toLowerCase().includes(s) ||
      (r.vatNumber || '').toLowerCase().includes(s),
    );
  }
  if (q.status && q.status !== 'all') {
    out = out.filter((r) => r.status === q.status);
  }
  if (q.size && q.size !== 'all') {
    out = out.filter((r) => (r.companySize || '').toLowerCase() === q.size!.toLowerCase());
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
    const contentDisposition = `attachment; filename="${safeDownloadName}"; filename*=UTF-8''${encodeURIComponent(safeDownloadName)}`;

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
    const search = (req.query.search as string || '').trim();
    const status = (req.query.status as string || '').trim();
    const size = (req.query.size as string || '').trim();
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
    const cacheKey = `list:${search}|${status}|${size}|${minOwnership ?? ''}|${maxOwnership ?? ''}|${sort}|${limit ?? 'all'}|${offset}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) return res.json(cached);

    const all = await loadAllRows();
    const filtered = applyFilters(all, { search, status, size, minOwnership, maxOwnership });

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
// SEO endpoints — used by the web tier to render SSR certificate hub pages.
// ============================================================================

function slugifyForSeo(text: string | null | undefined): string {
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

function buildCertSlug(name: string | null | undefined, certNo: string | null | undefined): string {
  const a = slugifyForSeo(name) || 'company';
  const b = slugifyForSeo(certNo) || 'certificate';
  return `${a}-${b}`;
}

interface SeoRecord {
  slug: string;
  companyName: string;
  bbbeeLevel: number | null;
  bbbeeScore: number | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  verificationAgency: string | null;
  certificateNumber: string | null;
  expiryDate: string | null;
  issueDate: string | null;
  blobName: string | null;
  status: 'valid' | 'expiring' | 'expired' | 'unknown';
  updatedAt: string;
}

function isoDay(d: Date | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function statusFromExpiry(expiry: Date | null): 'valid' | 'expiring' | 'expired' | 'unknown' {
  if (!expiry) return 'unknown';
  const now = Date.now();
  const sixtyDays = now + 60 * 24 * 60 * 60 * 1000;
  const t = expiry.getTime();
  if (t < now) return 'expired';
  if (t <= sixtyDays) return 'expiring';
  return 'valid';
}

function parseFromContent(content: string, fileName: string) {
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

async function loadMongoMetadataMap(blobNames: string[]): Promise<Map<string, any>> {
  if (!isMongoConnected() || blobNames.length === 0) return new Map();
  try {
    const docs = await CertificateMetadataModel.find(
      { blobName: { $in: blobNames } },
      { extractedText: 0 },
    ).lean();
    const m = new Map<string, any>();
    for (const d of docs as any[]) m.set(d.blobName, d);
    return m;
  } catch {
    return new Map();
  }
}

function buildSeoRecord(blob: { name: string; lastModified: Date | null }, mongoDoc: any | null, parsed: ReturnType<typeof parseFromContent> | null): SeoRecord {
  const fileName = blob.name.split('/').pop() || blob.name;
  const companyName = mongoDoc?.supplierName || parsed?.supplierName || deriveCompanyName(fileName);
  const certificateNumber = mongoDoc?.certificateNumber || parsed?.certificateNumber || null;
  const slug = mongoDoc?.slug || buildCertSlug(companyName, certificateNumber || fileName);
  const expiry = mongoDoc?.expiryDate ? new Date(mongoDoc.expiryDate) : (parsed?.expiryDate || null);
  const issue = mongoDoc?.issueDate ? new Date(mongoDoc.issueDate) : (parsed?.issueDate || null);
  const status = (mongoDoc?.status as SeoRecord['status']) || statusFromExpiry(expiry);
  return {
    slug,
    companyName,
    bbbeeLevel: mongoDoc?.bbbeeLevel ?? parsed?.bbbeeLevel ?? null,
    bbbeeScore: mongoDoc?.bbbeeScore ?? parsed?.bbbeeScore ?? null,
    blackOwnership: mongoDoc?.blackOwnership ?? parsed?.blackOwnership ?? null,
    blackWomenOwnership: mongoDoc?.blackWomenOwnership ?? parsed?.blackWomenOwnership ?? null,
    verificationAgency: mongoDoc?.verificationAgency ?? parsed?.verificationAgency ?? null,
    certificateNumber,
    expiryDate: isoDay(expiry),
    issueDate: isoDay(issue),
    blobName: blob.name,
    status,
    updatedAt: isoDay(blob.lastModified || mongoDoc?.processedAt || mongoDoc?.createdAt || new Date()) || new Date().toISOString().slice(0, 10),
  };
}

router.get('/seo/list', async (_req: Request, res: Response) => {
  const blobServiceClient = getBlobServiceClient();
  if (!blobServiceClient) {
    // Fall back to local store
    const local = certificateStore.list();
    const records: SeoRecord[] = local.map((r) => ({
      slug: buildCertSlug(r.companyName, r.id),
      companyName: r.companyName,
      bbbeeLevel: r.bbbeeLevel,
      bbbeeScore: null,
      blackOwnership: r.blackOwnership,
      blackWomenOwnership: r.blackWomenOwnership,
      verificationAgency: null,
      certificateNumber: null,
      expiryDate: r.expiryDate,
      issueDate: null,
      blobName: r.blobName,
      status: r.status,
      updatedAt: r.updatedAt.slice(0, 10),
    }));
    return res.json(records);
  }

  try {
    const containerClient = getContainerClient(blobServiceClient);
    const blobs: Array<{ name: string; lastModified: Date | null }> = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push({ name: blob.name, lastModified: blob.properties.lastModified || null });
    }

    const mongoMap = await loadMongoMetadataMap(blobs.map((b) => b.name));

    const records: SeoRecord[] = [];
    for (const b of blobs) {
      const md = mongoMap.get(b.name) || null;
      records.push(buildSeoRecord(b, md, null));
    }

    const seenSlugs = new Set<string>();
    const deduped = records.filter((r) => {
      if (!r.slug || seenSlugs.has(r.slug)) return false;
      seenSlugs.add(r.slug);
      return true;
    });

    deduped.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return res.json(deduped.slice(0, 1000));
  } catch (err: any) {
    logger.error('Failed to list SEO certificates from Azure', err);
    return res.json([]);
  }
});

router.get('/by-slug/:slug', async (req: Request, res: Response) => {
  const slug = singleRouteParam(req.params.slug).toLowerCase();
  if (!slug) return res.status(400).json({ message: 'slug required' });

  // Check local store first
  const local = certificateStore.list();
  for (const r of local) {
    const candidateSlug = buildCertSlug(r.companyName, r.id);
    if (candidateSlug === slug) {
      recordEvent({
        type: 'view',
        certificateId: r.id,
        certificateSlug: candidateSlug,
        userId: req.session?.userId || null,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
      return res.json({
        slug: candidateSlug,
        companyName: r.companyName,
        bbbeeLevel: r.bbbeeLevel,
        bbbeeScore: null,
        blackOwnership: r.blackOwnership,
        blackWomenOwnership: r.blackWomenOwnership,
        verificationAgency: null,
        certificateNumber: null,
        expiryDate: r.expiryDate,
        issueDate: null,
        blobName: r.blobName,
        status: r.status,
        updatedAt: r.updatedAt,
        // Phase 2/3 — surface fields the public detail page needs
        id: r.id,
        verified: !!r.verified,
        vatNumber: r.vatNumber,
        companySize: r.companySize,
      });
    }
  }

  const blobServiceClient = getBlobServiceClient();
  if (!blobServiceClient) {
    return res.status(404).json({ message: 'Certificate not found' });
  }

  try {
    const containerClient = getContainerClient(blobServiceClient);

    let matchedBlob: { name: string; lastModified: Date | null } | null = null;
    let matchedRecord: SeoRecord | null = null;

    const blobs: Array<{ name: string; lastModified: Date | null }> = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push({ name: blob.name, lastModified: blob.properties.lastModified || null });
    }
    const mongoMap = await loadMongoMetadataMap(blobs.map((b) => b.name));

    for (const b of blobs) {
      const md = mongoMap.get(b.name) || null;
      const candidate = buildSeoRecord(b, md, null);
      if (candidate.slug === slug) {
        matchedBlob = b;
        matchedRecord = candidate;
        break;
      }
    }

    if (!matchedBlob || !matchedRecord) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    const matchedDoc = mongoMap.get(matchedBlob.name);
    recordEvent({
      type: 'view',
      certificateId: matchedDoc?.id || null,
      certificateSlug: matchedRecord.slug,
      userId: req.session?.userId || null,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    const needsEnrichment =
      matchedRecord.bbbeeLevel == null ||
      matchedRecord.bbbeeScore == null ||
      matchedRecord.blackOwnership == null ||
      matchedRecord.verificationAgency == null;

    if (needsEnrichment) {
      const content = await lookupSearchContent(matchedBlob.name);
      if (content) {
        const parsed = parseFromContent(content, matchedBlob.name.split('/').pop() || matchedBlob.name);
        const md = mongoMap.get(matchedBlob.name) || null;
        matchedRecord = buildSeoRecord(matchedBlob, md, parsed);
      }
    }

    return res.json(matchedRecord);
  } catch (err: any) {
    logger.error('Failed to look up certificate by slug', err);
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
    const companyName = (body.companyName || '').trim();
    const vatNumber = (body.vatNumber || '').trim() || null;
    const vatNumberNormalized = normalizeVat(vatNumber);
    const companySize = (body.companySize || '').trim() || null;
    const blackOwnershipRaw = body.blackOwnership;
    const blackWomenOwnershipRaw = body.blackWomenOwnership;
    const expiryDate = (body.expiryDate || '').trim() || null;
    const toFinite = (raw: unknown): number | null => {
      if (raw == null || raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
    };
    const blackOwnership = toFinite(blackOwnershipRaw);
    const blackWomenOwnership = toFinite(blackWomenOwnershipRaw);

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
              mongoCertId = (saved as any)?.id ?? null;
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
            expiryDate,
            uploadedByUserId: userId,
            organizationId: orgId,
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
    'verificationAgency', 'certificateNumber',
    'bbbeeLevel', 'bbbeeScore',
    'issueDate', 'expiryDate',
  ] as const;

  const body = (req.body || {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  for (const key of PATCHABLE) {
    if (!(key in body)) continue;
    const v = body[key];
    if (key === 'issueDate' || key === 'expiryDate') {
      if (v == null || v === '') { updates[key] = null; }
      else { const d = new Date(String(v)); if (!isNaN(d.getTime())) updates[key] = d; }
    } else if (['blackOwnership', 'blackWomenOwnership', 'bbbeeLevel', 'bbbeeScore'].includes(key)) {
      if (v == null || v === '') { updates[key] = null; }
      else { const n = Number(v); if (Number.isFinite(n) && n >= 0) updates[key] = n; }
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
      if ('expiryDate' in updates) {
        const exp = updates['expiryDate'] as Date | null;
        if (!exp) { updates['status'] = 'unknown'; }
        else {
          const now = Date.now(), sixtyDays = now + 60 * 24 * 60 * 60 * 1000;
          updates['status'] = exp.getTime() < now ? 'expired' : exp.getTime() <= sixtyDays ? 'expiring' : 'valid';
        }
      }
      updates['updatedAt'] = new Date();
      await CertificateMetadataModel.updateOne({ id }, { $set: updates });
      invalidateListAndStatsCache();
      logger.info('Certificate patched', { id, fields: Object.keys(updates) });
      const returnedFields = Object.keys(updates).filter((k) => !['updatedAt', 'vatNumberNormalized', 'status'].includes(k));
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
  if ('supplierName' in updates) localPatch['companyName'] = updates['supplierName'];
  if ('vatNumber' in updates) localPatch['vatNumber'] = updates['vatNumber'];
  if ('companySize' in updates) localPatch['companySize'] = updates['companySize'];
  if ('blackOwnership' in updates) localPatch['blackOwnership'] = updates['blackOwnership'];
  if ('blackWomenOwnership' in updates) localPatch['blackWomenOwnership'] = updates['blackWomenOwnership'];
  if ('expiryDate' in updates) {
    const exp = updates['expiryDate'];
    localPatch['expiryDate'] = exp instanceof Date ? exp.toISOString().slice(0, 10) : null;
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
