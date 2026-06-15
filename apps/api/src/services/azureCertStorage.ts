import { BlobServiceClient } from '@azure/storage-blob';

/** Default container on the `certificatees` storage account (2757+ cert blobs). */
export const DEFAULT_CERT_BLOB_CONTAINER = 'clients-certs';

/**
 * Certificate blob storage is on the dedicated `certificatees` account.
 * `AZURE_STORAGE_CONNECTION_STRING` in prod often points at `okiruprobackups`
 * (Mongo/Arango backups) which does not contain certificate blobs.
 */
export function getCertConnectionString(): string | undefined {
  return process.env.AZURE_CERT_STORAGE_CONNECTION_STRING
    || process.env.AZURE_STORAGE_CONNECTION_STRING;
}

export function getCertAccountName(): string | undefined {
  return process.env.AZURE_CERT_STORAGE_ACCOUNT_NAME
    || process.env.AZURE_STORAGE_ACCOUNT_NAME;
}

export function getCertBlobContainerName(): string {
  const raw = process.env.AZURE_CERT_BLOB_CONTAINER || DEFAULT_CERT_BLOB_CONTAINER;
  return raw.trim() || DEFAULT_CERT_BLOB_CONTAINER;
}

export function getCertBlobServiceClient(): BlobServiceClient | null {
  const connStr = getCertConnectionString();
  if (!connStr) return null;
  return BlobServiceClient.fromConnectionString(connStr);
}

export function getCertContainerClient(client: BlobServiceClient) {
  return client.getContainerClient(getCertBlobContainerName());
}
