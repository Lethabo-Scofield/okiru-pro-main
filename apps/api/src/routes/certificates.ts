import { Router, type Request, type Response, type NextFunction } from 'express';
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential, SASProtocol } from '@azure/storage-blob';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { createLogger } from '../logger.js';
import { searchCertificates, isAzureSearchConfigured, getSearchClient } from '../services/azureSearch.js';
import { requireAuth } from '../middleware/auth.js';
import { processAllCertificates, processOneCertificate, getCertificateStats, extractDatesFromText } from '../services/certificateExtractor.js';
import { CertificateMetadataModel } from '../../models.js';
import { isMongoConnected } from '../../db.js';

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

async function fallbackFilenameSearch(q: string, res: Response) {
  const blobServiceClient = getBlobServiceClient();
  if (!blobServiceClient) {
    return res.status(500).json({ message: 'Neither Azure AI Search nor Azure Storage is configured.' });
  }
  const containerClient = getContainerClient(blobServiceClient);
  const blobs: Array<{ file_name: string; file_url: string; snippet: string }> = [];
  const searchLower = q.toLowerCase();
  for await (const blob of containerClient.listBlobsFlat()) {
    if (blob.name.toLowerCase().includes(searchLower)) {
      blobs.push({
        file_name: blob.name.split('/').pop() || blob.name,
        file_url: blob.name,
        snippet: `Filename match: ${blob.name}`,
      });
    }
  }
  return res.json(blobs);
}

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

router.get('/download', async (req: Request, res: Response) => {
  try {
    const file = req.query.file as string;
    if (!file || file.trim() === '') {
      return res.status(400).json({ message: 'file query parameter is required' });
    }

    const connStr = getConnectionString();
    const accountName = getAccountName();
    if (!connStr) {
      logger.error('Azure Storage connection string not configured');
      return res.status(500).json({ message: 'Azure Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING.' });
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
    const containerClient = getContainerClient(blobServiceClient);
    const blobClient = containerClient.getBlobClient(file.trim());

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

    const baseFileName = file.trim().split('/').pop() || file.trim();
    const safeDownloadName = baseFileName.replace(/[\r\n"\\\x00-\x1F\x7F]/g, '_');
    const contentDisposition = `attachment; filename="${safeDownloadName}"; filename*=UTF-8''${encodeURIComponent(safeDownloadName)}`;

    const sasToken = generateBlobSASQueryParameters({
      containerName: CONTAINER_NAME,
      blobName: file.trim(),
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
      contentDisposition,
    }, sharedKeyCredential).toString();

    const url = `${blobClient.url}?${sasToken}`;

    logger.info('Generated SAS download URL', { file: file.trim(), expiresOn: expiresOn.toISOString() });

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
    const search = (req.query.search as string || '').trim().toLowerCase();

    const blobServiceClient = getBlobServiceClient();
    if (!blobServiceClient) {
      logger.error('Azure Storage connection string not configured');
      return res.status(500).json({ message: 'Azure Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING.' });
    }

    const containerClient = getContainerClient(blobServiceClient);
    const allBlobs: Array<{ name: string; fileName: string; companyName: string; lastModified: string | null }> = [];

    for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
      const fileName = blob.name;
      allBlobs.push({
        name: blob.name,
        fileName,
        companyName: deriveCompanyName(fileName),
        lastModified: blob.properties.lastModified?.toISOString() || null,
      });
    }

    const mongoMap = await loadMongoMetadataMap(allBlobs.map(b => b.name));
    for (const b of allBlobs) {
      const md = mongoMap.get(b.name);
      const supplierName = md?.supplierName;
      if (supplierName && typeof supplierName === 'string' && supplierName.trim()) {
        b.companyName = supplierName.trim();
      }
    }

    const blobs = search
      ? allBlobs.filter(b =>
          b.fileName.toLowerCase().includes(search) ||
          b.companyName.toLowerCase().includes(search),
        )
      : allBlobs;

    logger.info('Listed certificates', { search: search || '(all)', total: allBlobs.length, count: blobs.length });
    return res.json(blobs);
  } catch (err) {
    logger.error('Failed to list certificates', err as Error);
    return res.status(500).json({ message: 'Failed to list certificates' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const userId = (req.query.userId as string || '').trim();

    if (!q) {
      return res.status(400).json({ message: 'q query parameter is required' });
    }

    const merged = new Map<string, { file_name: string; company_name: string; file_url: string; snippet: string }>();

    const blobServiceClient = getBlobServiceClient();
    if (blobServiceClient) {
      const containerClient = getContainerClient(blobServiceClient);
      const searchLower = q.toLowerCase();

      const allBlobs: Array<{ name: string; fileName: string; companyName: string }> = [];
      for await (const blob of containerClient.listBlobsFlat()) {
        const fileName = blob.name.split('/').pop() || blob.name;
        allBlobs.push({
          name: blob.name,
          fileName,
          companyName: deriveCompanyName(blob.name),
        });
      }

      const mongoMap = await loadMongoMetadataMap(allBlobs.map(b => b.name));

      for (const b of allBlobs) {
        const md = mongoMap.get(b.name);
        const supplierName: string | undefined =
          typeof md?.supplierName === 'string' && md.supplierName.trim() ? md.supplierName.trim() : undefined;
        const displayName = supplierName || b.companyName;

        const haystacks = [
          b.fileName.toLowerCase(),
          b.companyName.toLowerCase(),
          supplierName ? supplierName.toLowerCase() : '',
        ];

        if (haystacks.some(h => h && h.includes(searchLower))) {
          merged.set(b.name, {
            file_name: b.fileName,
            company_name: displayName,
            file_url: b.name,
            snippet: supplierName ? `Entity match: ${supplierName}` : `Match: ${displayName}`,
          });
        }
      }
    }

    if (isAzureSearchConfigured()) {
      try {
        const aiResults = await searchCertificates(q, userId || undefined);
        for (const result of aiResults) {
          const existing = merged.get(result.file_url);
          if (existing) {
            existing.snippet = result.snippet;
          } else {
            const fileName = result.file_name || (result.file_url.split('/').pop() || result.file_url);
            merged.set(result.file_url, {
              file_name: fileName,
              company_name: deriveCompanyName(result.file_url || fileName),
              file_url: result.file_url,
              snippet: result.snippet,
            });
          }
        }
      } catch (searchErr) {
        logger.error('Azure AI Search query failed — using filename matches only', searchErr as Error);
      }
    }

    const results = Array.from(merged.values());
    logger.info('Search completed', { query: q, userId: userId || '(all)', resultCount: results.length });
    return res.json(results);
  } catch (err) {
    logger.error('Search failed', err as Error);
    return res.status(500).json({ message: 'Search failed' });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const blobServiceClient = getBlobServiceClient();
    let total = 0;
    let recentUploads7d = 0;
    let recentUploads30d = 0;
    let totalBytes = 0;
    let lastUploadedAt: string | null = null;

    if (blobServiceClient) {
      try {
        const containerClient = getContainerClient(blobServiceClient);
        const now = Date.now();
        const sevenDays = now - 7 * 24 * 60 * 60 * 1000;
        const thirtyDays = now - 30 * 24 * 60 * 60 * 1000;
        let latest = 0;

        for await (const blob of containerClient.listBlobsFlat()) {
          total++;
          const size = blob.properties.contentLength;
          if (typeof size === 'number') totalBytes += size;
          const lm = blob.properties.lastModified ? new Date(blob.properties.lastModified).getTime() : 0;
          if (lm) {
            if (lm > latest) latest = lm;
            if (lm >= sevenDays) recentUploads7d++;
            if (lm >= thirtyDays) recentUploads30d++;
          }
        }
        if (latest > 0) lastUploadedAt = new Date(latest).toISOString();
      } catch (azureErr) {
        logger.warn('Azure blob enumeration failed during stats — returning Mongo-only stats', {
          err: (azureErr as Error).message,
        });
      }
    }

    let extraction: {
      valid: number;
      expiring: number;
      expiringIn30: number;
      expired: number;
      unknown: number;
      processed: number;
      pending: number;
      avgLevel: number | null;
      avgBlackOwnership: number | null;
      extractionAvailable: boolean;
    } = {
      valid: 0,
      expiring: 0,
      expiringIn30: 0,
      expired: 0,
      unknown: 0,
      processed: 0,
      pending: 0,
      avgLevel: null,
      avgBlackOwnership: null,
      extractionAvailable: false,
    };

    if (isMongoConnected()) {
      try {
        const stats = await getCertificateStats();
        const now = new Date();
        const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiringIn30Doc = await CertificateMetadataModel.countDocuments({
          extractionStatus: 'completed',
          expiryDate: { $gte: now, $lte: thirtyDays },
        });
        const levelAgg = await CertificateMetadataModel.aggregate([
          { $match: { extractionStatus: 'completed', bbbeeLevel: { $ne: null } } },
          { $group: { _id: null, avg: { $avg: '$bbbeeLevel' } } },
        ]);
        const ownershipAgg = await CertificateMetadataModel.aggregate([
          { $match: { extractionStatus: 'completed', blackOwnership: { $ne: null } } },
          { $group: { _id: null, avg: { $avg: '$blackOwnership' } } },
        ]);

        extraction = {
          valid: stats.valid,
          expiring: stats.expiring,
          expiringIn30: expiringIn30Doc,
          expired: stats.expired,
          unknown: stats.unknown,
          processed: stats.processed,
          pending: stats.pending,
          avgLevel: levelAgg[0]?.avg != null ? Number(levelAgg[0].avg.toFixed(1)) : null,
          avgBlackOwnership: ownershipAgg[0]?.avg != null ? Number(ownershipAgg[0].avg.toFixed(1)) : null,
          extractionAvailable: true,
        };
      } catch (mongoErr) {
        logger.warn('Mongo stats query failed — returning blob-only stats', { err: (mongoErr as Error).message });
      }
    }

    return res.json({
      total,
      totalBytes,
      recentUploads7d,
      recentUploads30d,
      lastUploadedAt,
      ...extraction,
    });
  } catch (err: any) {
    logger.error('Failed to get certificate stats', err);
    return res.status(500).json({ message: 'Failed to get certificate stats' });
  }
});

router.get('/metadata', async (_req: Request, res: Response) => {
  if (!isMongoConnected()) {
    return res.json([]);
  }
  try {
    const docs = await CertificateMetadataModel.find(
      { extractionStatus: 'completed' },
      { extractedText: 0 },
    ).lean();
    return res.json(docs);
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

// ---- SEO record helpers (Azure-first, with optional Mongo enrichment) ----

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

function deriveCompanyName(fileName: string): string {
  const base = fileName.split('/').pop() || fileName;
  const noExt = base.replace(/\.[a-z0-9]+$/i, '');
  const noUuid = noExt.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  );
  const trimmed = noUuid
    .replace(/^\d{4}[\s_-]+\d{2}[\s_-]+\d{1,2}[\s_-]+/, '')
    .replace(/[\s_-]*\b(EME|QSE|Generic|Large|Specialised|Specialized)\b.*$/i, '')
    .replace(/[\s_-]*B-?BBEE.*$/i, '')
    .replace(/[\s_-]*Certificate.*$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s_\-–—]+$/u, '')
    .trim();
  return trimmed || 'Unknown company';
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
    return res.json([]);
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

router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId || userId.trim() === '') {
      return res.status(400).json({ message: 'userId is required' });
    }

    const blobServiceClient = getBlobServiceClient();
    if (!blobServiceClient) {
      logger.error('Azure Storage connection string not configured');
      return res.status(500).json({ message: 'Azure Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING.' });
    }

    const containerClient = getContainerClient(blobServiceClient);
    const prefix = `${userId.trim()}/`;
    const blobs: Array<{ name: string; fileName: string }> = [];

    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      const fileName = blob.name.substring(prefix.length);
      if (fileName) {
        blobs.push({
          name: blob.name,
          fileName,
        });
      }
    }

    logger.info('Listed certificates', { userId, count: blobs.length });
    return res.json(blobs);
  } catch (err) {
    logger.error('Failed to list certificates', err as Error);
    return res.status(500).json({ message: 'Failed to list certificates' });
  }
});

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
    const blobServiceClient = getBlobServiceClient();
    if (!blobServiceClient) {
      logger.error('Azure Storage connection string not configured');
      return res.status(500).json({ message: 'Azure Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING.' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    const containerClient = getContainerClient(blobServiceClient);
    const orgId = req.session.organizationId || 'default';

    const results: Array<{ fileName: string; blobName: string; status: 'uploaded' | 'error'; error?: string }> = [];

    for (const file of files) {
      try {
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
        const blobName = `${orgId}/${randomUUID()}-${sanitized}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadData(file.buffer, {
          blobHTTPHeaders: {
            blobContentType: file.mimetype,
          },
          metadata: {
            uploadedAt: new Date().toISOString(),
            originalName: file.originalname,
            organizationId: orgId,
            uploadedBy: req.session.userId || 'unknown',
          },
        });

        results.push({ fileName: file.originalname, blobName, status: 'uploaded' });
        logger.info('Certificate uploaded', { fileName: file.originalname, blobName, size: file.size, mimetype: file.mimetype, orgId });
      } catch (uploadErr: any) {
        results.push({ fileName: file.originalname, blobName: file.originalname, status: 'error', error: uploadErr.message });
        logger.error('Failed to upload certificate', { fileName: file.originalname, error: uploadErr.message });
      }
    }

    const uploaded = results.filter(r => r.status === 'uploaded').length;
    const failed = results.filter(r => r.status === 'error').length;

    if (uploaded > 0) {
      const uploadedBlobs = results.filter(r => r.status === 'uploaded').map(r => r.blobName);
      setImmediate(async () => {
        for (const blobName of uploadedBlobs) {
          try {
            await processOneCertificate(blobServiceClient, blobName, true);
          } catch (err: any) {
            logger.error('Background extraction failed for uploaded cert', { blobName, error: err.message });
          }
        }
        logger.info('Background extraction complete for uploaded certs', { count: uploadedBlobs.length });
      });
    }

    return res.json({
      message: `${uploaded} file(s) uploaded${failed > 0 ? `, ${failed} failed` : ''}`,
      results,
    });
  } catch (err: any) {
    logger.error('Certificate upload failed', err);
    return res.status(500).json({ message: 'Upload failed' });
  }
});

export default router;
