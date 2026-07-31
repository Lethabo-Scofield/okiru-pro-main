/**
 * Durable storage for uploaded evidence files.
 *
 * Before this, every document a client uploaded (`resolve-case-files` /
 * `-stream`) lived only in multer's in-memory buffer for the length of the
 * request — once extraction finished, the ORIGINAL FILE was gone. No copy
 * existed for a verifier to re-check against, no way to re-run extraction
 * after a parser fix without asking the client to re-upload, and no audit
 * trail proving what was actually submitted.
 *
 * This persists each uploaded file to Azure Blob Storage, on the SAME
 * storage account already provisioned for database backups — a container,
 * not a new account, so it adds no new line item to the infrastructure bill.
 *
 * Deliberately best-effort: a storage outage or missing config must NEVER
 * fail or slow down extraction (same "optional" pattern as Neo4j and SMTP
 * elsewhere in this codebase) — persistence is additive, not load-bearing.
 */
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../logger.js';

const logger = createLogger('CaseDocumentStorage');

export const DEFAULT_CASE_DOCUMENTS_CONTAINER = 'case-documents';

export function isCaseDocumentStorageConfigured(): boolean {
  return !!process.env.AZURE_STORAGE_CONNECTION_STRING;
}

function containerName(): string {
  const raw = process.env.AZURE_CASE_DOCUMENTS_CONTAINER || DEFAULT_CASE_DOCUMENTS_CONTAINER;
  return raw.trim() || DEFAULT_CASE_DOCUMENTS_CONTAINER;
}

let cached: ContainerClient | null | undefined;

function getContainerClient(): ContainerClient | null {
  if (cached !== undefined) return cached;
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) { cached = null; return cached; }
  try {
    const client = BlobServiceClient.fromConnectionString(connStr);
    cached = client.getContainerClient(containerName());
  } catch (err) {
    logger.warn('Could not create blob client for case documents — persistence disabled', { error: (err as Error).message });
    cached = null;
  }
  return cached;
}

export interface PersistedCaseFile {
  fileName: string;
  blobName: string;
  sizeBytes: number;
}

/**
 * Upload one file under `caseId` (or a generated one when the case has no ID
 * yet — the quote step runs before a case exists). Blob name is
 * date-partitioned and UUID-disambiguated so two clients' "Certificate.pdf"
 * never collide and blobs sort naturally in the portal by upload day.
 *
 * Returns null (not a throw) on any failure — the caller extracts regardless.
 */
export async function persistCaseFile(
  caseId: string | undefined,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<PersistedCaseFile | null> {
  const container = getContainerClient();
  if (!container) return null;

  const day = new Date().toISOString().slice(0, 10);
  const safeCaseId = (caseId || 'unassigned').replace(/[^a-zA-Z0-9_-]/g, '_');
  const blobName = `${day}/${safeCaseId}/${randomUUID()}__${fileName.replace(/[\\/]/g, '_')}`;

  try {
    await container.getBlockBlobClient(blobName).uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimeType || 'application/octet-stream' },
    });
    return { fileName, blobName, sizeBytes: buffer.length };
  } catch (err) {
    // Never let a storage hiccup cost the client their extraction.
    logger.warn('Failed to persist an uploaded file — extraction continues without a durable copy', {
      fileName, error: (err as Error).message,
    });
    return null;
  }
}

/** Persist a whole upload batch in parallel; failures are per-file and silent to the caller. */
export async function persistCaseFiles(
  caseId: string | undefined,
  files: Array<{ originalname: string; buffer: Buffer; mimetype: string }>,
): Promise<PersistedCaseFile[]> {
  if (!isCaseDocumentStorageConfigured() || files.length === 0) return [];
  const results = await Promise.all(
    files.map((f) => persistCaseFile(caseId, f.originalname, f.buffer, f.mimetype)),
  );
  return results.filter((r): r is PersistedCaseFile => r !== null);
}
