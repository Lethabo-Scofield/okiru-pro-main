import { Router, type Request, type Response, type NextFunction } from 'express';
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential, SASProtocol } from '@azure/storage-blob';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { createLogger } from '../logger.js';
import { searchCertificates, isAzureSearchConfigured } from '../services/azureSearch.js';
import { requireAuth } from '../middleware/auth.js';

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

    const sasToken = generateBlobSASQueryParameters({
      containerName: CONTAINER_NAME,
      blobName: file.trim(),
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
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
    const blobs: Array<{ name: string; fileName: string }> = [];

    for await (const blob of containerClient.listBlobsFlat()) {
      const fileName = blob.name;
      if (!search || fileName.toLowerCase().includes(search)) {
        blobs.push({
          name: blob.name,
          fileName,
        });
      }
    }

    logger.info('Listed certificates', { search: search || '(all)', count: blobs.length });
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

    const merged = new Map<string, { file_name: string; file_url: string; snippet: string }>();

    const blobServiceClient = getBlobServiceClient();
    if (blobServiceClient) {
      const containerClient = getContainerClient(blobServiceClient);
      const searchLower = q.toLowerCase();
      for await (const blob of containerClient.listBlobsFlat()) {
        const fileName = blob.name.split('/').pop() || blob.name;
        if (fileName.toLowerCase().includes(searchLower)) {
          merged.set(blob.name, {
            file_name: fileName,
            file_url: blob.name,
            snippet: `Filename match`,
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
            merged.set(result.file_url, result);
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
  upload.array('files', 20)(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File too large. Maximum size is 50MB per file.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ message: 'Too many files. Maximum is 20 per upload.' });
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
