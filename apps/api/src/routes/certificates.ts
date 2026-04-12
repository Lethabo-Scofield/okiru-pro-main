import { Router, type Request, type Response } from 'express';
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential, SASProtocol } from '@azure/storage-blob';
import { createLogger } from '../logger.js';

const logger = createLogger("Certificates");
const router = Router();

const CONTAINER_NAME = 'certificatees';

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

async function ensureContainer(blobServiceClient: BlobServiceClient) {
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  await containerClient.createIfNotExists({ access: undefined });
  return containerClient;
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
    const containerClient = await ensureContainer(blobServiceClient);
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
    return res.json({ url });
  } catch (err) {
    logger.error('Failed to generate download link', err as Error);
    return res.status(500).json({ message: 'Failed to generate download link' });
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

    const containerClient = await ensureContainer(blobServiceClient);
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

export default router;
