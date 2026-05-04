import { Router, type Request, type Response, type NextFunction } from 'express';
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential, SASProtocol } from '@azure/storage-blob';
import multer from 'multer';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { createLogger } from '../logger.js';
import { searchCertificates, isAzureSearchConfigured, getSearchClient } from '../services/azureSearch.js';
import { requireAuth } from '../middleware/auth.js';
import { processAllCertificates, processOneCertificate, getCertificateStats, extractDatesFromText } from '../services/certificateExtractor.js';
import { CertificateMetadataModel } from '../../models.js';
import { isMongoConnected } from '../../db.js';
import { certificateStore, type CertificateRecord } from '../services/certificateStore.js';

const logger = createLogger("Certificates");
const router = Router();

const CONTAINER_NAME = 'clients-certs';

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
  };
}

function rowFromMongo(doc: any, blobLastModified: string | null = null, fileNameFallback?: string): CertificateRow {
  const fileName = fileNameFallback || doc.fileName || (doc.blobName?.split('/').pop() || doc.blobName);
  const expiry = doc.expiryDate ? new Date(doc.expiryDate) : null;
  return {
    name: doc.blobName,
    fileName,
    companyName: doc.supplierName || deriveCompanyName(fileName),
    vatNumber: doc.vatNumber || null,
    companySize: doc.companySize || null,
    blackOwnership: doc.blackOwnership ?? null,
    blackWomenOwnership: doc.blackWomenOwnership ?? null,
    bbbeeLevel: doc.bbbeeLevel ?? null,
    expiryDate: expiry ? expiry.toISOString().slice(0, 10) : null,
    status: doc.status || statusFromExpiryDate(expiry),
    lastModified: blobLastModified || (doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null),
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

    const all = await loadAllRows();
    const filtered = applyFilters(all, { search, status, size, minOwnership, maxOwnership });

    logger.info('Listed certificates', {
      total: all.length,
      shown: filtered.length,
      search: search || '(all)',
      status: status || '(any)',
    });
    return res.json(filtered);
  } catch (err) {
    logger.error('Failed to list certificates', err as Error);
    return res.status(500).json({ message: 'Failed to list certificates' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q) {
      return res.status(400).json({ message: 'q query parameter is required' });
    }

    const all = await loadAllRows();
    const filtered = applyFilters(all, { search: q });

    const results = filtered.map((r) => ({
      file_name: r.fileName,
      company_name: r.companyName,
      vat_number: r.vatNumber,
      company_size: r.companySize,
      black_ownership: r.blackOwnership,
      file_url: r.name,
      snippet: r.vatNumber
        ? `${r.companyName} · VAT ${r.vatNumber}`
        : `${r.companyName}`,
    }));

    // Optional: enrich with Azure AI Search snippets if available
    if (isAzureSearchConfigured()) {
      try {
        const aiResults = await searchCertificates(q);
        const byUrl = new Map(results.map((r) => [r.file_url, r]));
        for (const ai of aiResults) {
          const existing = byUrl.get(ai.file_url);
          if (existing) {
            existing.snippet = ai.snippet || existing.snippet;
          }
        }
      } catch (searchErr) {
        logger.warn('Azure AI Search enrichment failed', { err: (searchErr as Error).message });
      }
    }

    logger.info('Search completed', { query: q, count: results.length });
    return res.json(results);
  } catch (err) {
    logger.error('Search failed', err as Error);
    return res.status(500).json({ message: 'Search failed' });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
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

    return res.json({
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
    });
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
  const extracted = extractDatesFromText(content || '', fileName);

  const ownershipPatterns: Array<{ key: 'blackOwnership' | 'blackWomenOwnership'; re: RegExp }> = [
    { key: 'blackWomenOwnership', re: /black\s*women[^%]{0,40}?(\d{1,3}(?:[.,]\d+)?)\s*%/i },
    { key: 'blackOwnership', re: /black\s*(?:economic\s*interest|ownership|shareholding)[^%]{0,40}?(\d{1,3}(?:[.,]\d+)?)\s*%/i },
  ];
  const ownership: Record<string, number | null> = { blackOwnership: null, blackWomenOwnership: null };
  for (const p of ownershipPatterns) {
    const m = p.re.exec(content || '');
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(v) && v >= 0 && v <= 100) ownership[p.key] = v;
    }
  }

  const scoreMatch = /(?:overall\s*score|total\s*score|bbbee\s*score|score\s*achieved)[:\s]*(\d{1,3}(?:[.,]\d+)?)/i.exec(content || '');
  const score = scoreMatch ? parseFloat(scoreMatch[1].replace(',', '.')) : null;

  const agencyMatch = /(?:verification\s*agency|verified\s*by|issued\s*by|verification\s*by)[:\s]+([A-Z][A-Za-z&.\- ]{2,80})/i.exec(content || '');
  const agency = agencyMatch ? agencyMatch[1].replace(/\s{2,}/g, ' ').trim() : null;

  const certNoMatch = /(?:certificate\s*(?:no|number|#)|cert\s*no)[:\s.#-]*([A-Z0-9][A-Z0-9\-_/]{3,30})/i.exec(content || '');
  const certNumber = certNoMatch ? certNoMatch[1].toUpperCase().replace(/[_/]/g, '-') : null;

  return {
    expiryDate: extracted.expiryDate,
    issueDate: extracted.issueDate,
    bbbeeLevel: extracted.bbbeeLevel,
    supplierName: extracted.supplierName,
    bbbeeScore: score && score >= 0 && score <= 130 ? score : null,
    blackOwnership: ownership.blackOwnership,
    blackWomenOwnership: ownership.blackWomenOwnership,
    verificationAgency: agency,
    certificateNumber: certNumber,
  };
}

async function lookupSearchContent(blobName: string): Promise<string> {
  if (!isAzureSearchConfigured()) return '';
  const client = getSearchClient();
  if (!client) return '';
  try {
    const escaped = blobName.replace(/'/g, "''");
    const results = await client.search('*', {
      filter: `document_id eq '${escaped}'`,
      top: 5,
      includeTotalCount: false,
    });
    const chunks: string[] = [];
    for await (const r of results.results) {
      const c = (r.document as any)?.content;
      if (c) chunks.push(String(c));
    }
    return chunks.join('\n').slice(0, 20000);
  } catch (err: any) {
    logger.warn('Azure Search lookup failed for blob', { blobName, error: err?.message });
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
  const slug = (req.params.slug || '').toLowerCase();
  if (!slug) return res.status(400).json({ message: 'slug required' });

  // Check local store first
  const local = certificateStore.list();
  for (const r of local) {
    const candidateSlug = buildCertSlug(r.companyName, r.id);
    if (candidateSlug === slug) {
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
        updatedAt: r.updatedAt.slice(0, 10),
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
// Upload — requires authentication. Accepts metadata fields alongside files.
// Falls back to local disk + in-memory store when Azure isn't configured.
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

    const blobServiceClient = getBlobServiceClient();
    const orgId = (req.session as any).organizationId || 'public';
    const userId = (req.session as any).userId || null;

    const results: Array<{ fileName: string; blobName: string; status: 'uploaded' | 'error'; error?: string }> = [];

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
          if (isMongoConnected()) {
            try {
              await CertificateMetadataModel.findOneAndUpdate(
                { blobName },
                {
                  blobName,
                  fileName: file.originalname,
                  supplierName: companyName || deriveCompanyName(file.originalname),
                  vatNumber,
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
            } catch (mongoErr) {
              logger.warn('Mongo upsert failed', { err: (mongoErr as Error).message });
            }
          } else {
            // Mongo unavailable — cache metadata locally against the SAME Azure blobName
            // so /list shows the rich fields without writing a duplicate blob to disk.
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

          results.push({ fileName: file.originalname, blobName, status: 'uploaded' });
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

    return res.json({
      message: `${uploaded} file(s) uploaded${failed > 0 ? `, ${failed} failed` : ''}`,
      results,
    });
  } catch (err: any) {
    logger.error('Certificate upload failed', err);
    return res.status(500).json({ message: 'Upload failed' });
  }
});

router.get('/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
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
