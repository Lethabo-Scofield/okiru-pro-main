import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  type BlobItem,
  type ContainerClient,
} from '@azure/storage-blob';

/** Legacy default retained for existing local deployments. Production sets the container explicitly. */
export const DEFAULT_CERT_BLOB_CONTAINER = 'clients-certs';
export const DEFAULT_CERT_SAS_EXPIRY_SECONDS = 300;

export interface CertificateBlobListOptions {
  nameStartsWith?: string;
  continuationToken?: string;
  resultsPerPage?: number;
}

export interface CertificateBlobListPage {
  items: BlobItem[];
  continuationToken?: string;
}

export interface CertificateBlobAccessUrl {
  url: string;
  expiresAt: Date;
}

let managedIdentityCredential: DefaultAzureCredential | null = null;
let managedIdentityClient: BlobServiceClient | null = null;

export function getCertConnectionString(): string | undefined {
  return process.env.AZURE_CERT_STORAGE_CONNECTION_STRING
    || process.env.AZURE_STORAGE_CONNECTION_STRING;
}

export function getCertAccountUrl(): string | undefined {
  const configured = process.env.AZURE_STORAGE_ACCOUNT_URL
    || process.env.AZURE_CERT_STORAGE_ACCOUNT_URL;
  if (configured?.trim()) return configured.trim().replace(/\/$/, '');
  const accountName = getCertAccountName();
  return accountName ? `https://${accountName}.blob.core.windows.net` : undefined;
}

export function getCertAccountName(): string | undefined {
  return process.env.AZURE_CERT_STORAGE_ACCOUNT_NAME
    || process.env.AZURE_STORAGE_ACCOUNT_NAME;
}

export function getCertBlobContainerName(): string {
  const raw = process.env.AZURE_STORAGE_CONTAINER_NAME
    || process.env.AZURE_CERT_BLOB_CONTAINER
    || DEFAULT_CERT_BLOB_CONTAINER;
  return raw.trim() || DEFAULT_CERT_BLOB_CONTAINER;
}

export function getCertSasExpirySeconds(): number {
  const value = Number(process.env.AZURE_STORAGE_SAS_EXPIRY_SECONDS);
  if (!Number.isFinite(value)) return DEFAULT_CERT_SAS_EXPIRY_SECONDS;
  return Math.min(900, Math.max(60, Math.trunc(value)));
}

/**
 * Is an AKS Workload Identity actually projected into this pod?
 *
 * The workload-identity mutating webhook injects both of these; without them
 * DefaultAzureCredential has no federated token to exchange and falls through
 * to IMDS, which returns the NODE's kubelet identity — an identity that has no
 * data-plane role on the storage account and never will.
 */
function workloadIdentityAvailable(): boolean {
  return Boolean(process.env.AZURE_CLIENT_ID?.trim() && process.env.AZURE_FEDERATED_TOKEN_FILE?.trim());
}

/**
 * Production prefers Microsoft Entra / AKS Workload Identity. A connection
 * string remains the fallback so existing certificate tools and recovery jobs
 * keep working during migration.
 *
 * Selection is by CAPABILITY, not by configuration. Choosing Entra merely
 * because AZURE_STORAGE_ACCOUNT_URL is set — which the app-config ConfigMap
 * always sets — pinned every environment to a credential most of them cannot
 * present, and because that branch returned before ever reaching the connection
 * string there was no fallback: the Hub listed zero certificates on a cluster
 * holding hundreds. Workload identity is still preferred wherever it is really
 * projected, so enabling it on the cluster upgrades this automatically with no
 * code change.
 */
export function getCertBlobServiceClient(): BlobServiceClient | null {
  const connStr = getCertConnectionString();
  const accountUrl = getCertAccountUrl();

  const entra = () => {
    if (!accountUrl) return null;
    if (!managedIdentityCredential) managedIdentityCredential = new DefaultAzureCredential();
    if (!managedIdentityClient || managedIdentityClient.url !== accountUrl) {
      managedIdentityClient = new BlobServiceClient(accountUrl, managedIdentityCredential);
    }
    return managedIdentityClient;
  };

  if (workloadIdentityAvailable()) {
    const client = entra();
    if (client) return client;
  }

  if (connStr) return BlobServiceClient.fromConnectionString(connStr);

  // No workload identity and no connection string: try Entra anyway, which
  // covers a developer's `az login` and any other DefaultAzureCredential source.
  return entra();
}

/** Test seam: drop the memoized credential/client so env changes take effect. */
export function resetCertBlobClientForTest(): void {
  managedIdentityCredential = null;
  managedIdentityClient = null;
}

export function getCertContainerClient(client: BlobServiceClient): ContainerClient {
  return client.getContainerClient(getCertBlobContainerName());
}

export async function listCertificateBlobs(
  options: CertificateBlobListOptions = {},
): Promise<CertificateBlobListPage> {
  const client = getCertBlobServiceClient();
  if (!client) throw new Error('Certificate Blob Storage is not configured');
  const container = getCertContainerClient(client);
  const maxPageSize = Math.min(500, Math.max(1, options.resultsPerPage ?? 100));
  const iterator = container
    .listBlobsFlat({
      includeMetadata: true,
      prefix: options.nameStartsWith || undefined,
    })
    .byPage({
      continuationToken: options.continuationToken || undefined,
      maxPageSize,
    });
  const page = await iterator.next();
  return {
    items: page.done ? [] : page.value.segment.blobItems,
    continuationToken: page.done ? undefined : page.value.continuationToken,
  };
}

export function getCertificateBlob(blobName: string) {
  const client = getCertBlobServiceClient();
  if (!client) throw new Error('Certificate Blob Storage is not configured');
  return getCertContainerClient(client).getBlobClient(blobName);
}

export async function getCertificateBlobProperties(blobName: string) {
  return getCertificateBlob(blobName).getProperties();
}

function sharedKeyCredentialFromConnectionString(): StorageSharedKeyCredential | null {
  const connectionString = getCertConnectionString();
  const accountName = getCertAccountName()
    || connectionString?.match(/AccountName=([^;]+)/i)?.[1];
  const accountKey = connectionString?.match(/AccountKey=([^;]+)/i)?.[1];
  return accountName && accountKey
    ? new StorageSharedKeyCredential(accountName, accountKey)
    : null;
}

async function generateCertificateAccessUrl(
  blobName: string,
  disposition: 'inline' | 'attachment',
  downloadFileName?: string,
): Promise<CertificateBlobAccessUrl> {
  const serviceClient = getCertBlobServiceClient();
  if (!serviceClient) throw new Error('Certificate Blob Storage is not configured');
  const blobClient = getCertContainerClient(serviceClient).getBlobClient(blobName);
  if (!(await blobClient.exists())) {
    const error = new Error('Certificate file not found in Blob Storage');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  const now = new Date();
  const startsOn = new Date(now.getTime() - 60_000);
  const expiresAt = new Date(now.getTime() + getCertSasExpirySeconds() * 1000);
  const safeName = (downloadFileName || blobName.split('/').pop() || 'certificate')
    .replace(/[\r\n"\\\x00-\x1F\x7F]/g, '_');
  const contentDisposition = `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
  const sharedKeyCredential = sharedKeyCredentialFromConnectionString();

  let sasToken: string;
  if (sharedKeyCredential) {
    sasToken = generateBlobSASQueryParameters({
      containerName: getCertBlobContainerName(),
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      protocol: SASProtocol.Https,
      startsOn,
      expiresOn: expiresAt,
      contentDisposition,
    }, sharedKeyCredential).toString();
  } else {
    const accountName = getCertAccountName();
    if (!accountName) throw new Error('AZURE_STORAGE_ACCOUNT_NAME is required for user-delegation SAS');
    const delegationKey = await serviceClient.getUserDelegationKey(startsOn, expiresAt);
    sasToken = generateBlobSASQueryParameters({
      containerName: getCertBlobContainerName(),
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      protocol: SASProtocol.Https,
      startsOn,
      expiresOn: expiresAt,
      contentDisposition,
    }, delegationKey, accountName).toString();
  }

  return { url: `${blobClient.url}?${sasToken}`, expiresAt };
}

export function generateCertificateViewUrl(blobName: string, fileName?: string) {
  return generateCertificateAccessUrl(blobName, 'inline', fileName);
}

export function generateCertificateDownloadUrl(blobName: string, fileName?: string) {
  return generateCertificateAccessUrl(blobName, 'attachment', fileName);
}

export async function checkCertificateBlobStorage(): Promise<{
  status: 'connected' | 'not_configured' | 'unavailable';
  account: string | null;
  container: string;
  error?: string;
}> {
  const account = getCertAccountName() ?? null;
  const container = getCertBlobContainerName();
  const client = getCertBlobServiceClient();
  if (!client) return { status: 'not_configured', account, container };
  try {
    await getCertContainerClient(client).getProperties();
    return { status: 'connected', account, container };
  } catch (error) {
    return {
      status: 'unavailable',
      account,
      container,
      error: error instanceof Error ? error.message : 'Blob Storage check failed',
    };
  }
}
