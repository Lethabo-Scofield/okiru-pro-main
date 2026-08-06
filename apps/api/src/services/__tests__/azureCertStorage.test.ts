/**
 * Credential selection for certificate Blob Storage.
 *
 * The Hub listed ZERO certificates on a cluster holding hundreds because the
 * client was chosen by CONFIGURATION rather than CAPABILITY: the app-config
 * ConfigMap always sets AZURE_STORAGE_ACCOUNT_URL, so the Entra branch was taken
 * everywhere and returned before the connection-string fallback could run —
 * on a cluster with no workload identity and no data-plane role assignment.
 *
 * These pin the rule: prefer workload identity where it is genuinely projected,
 * fall back to the connection string everywhere else, never dead-end.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCertBlobContainerName,
  getCertBlobServiceClient,
  resetCertBlobClientForTest,
} from '../azureCertStorage.js';

const ENV_KEYS = [
  'AZURE_STORAGE_ACCOUNT_URL',
  'AZURE_CERT_STORAGE_ACCOUNT_URL',
  'AZURE_STORAGE_ACCOUNT_NAME',
  'AZURE_CERT_STORAGE_ACCOUNT_NAME',
  'AZURE_STORAGE_CONNECTION_STRING',
  'AZURE_CERT_STORAGE_CONNECTION_STRING',
  'AZURE_STORAGE_CONTAINER_NAME',
  'AZURE_CERT_BLOB_CONTAINER',
  'AZURE_CLIENT_ID',
  'AZURE_FEDERATED_TOKEN_FILE',
] as const;

const CONN = 'DefaultEndpointsProtocol=https;AccountName=okirubackups2026;'
  + 'AccountKey=dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleQ==;EndpointSuffix=core.windows.net';

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  resetCertBlobClientForTest();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  resetCertBlobClientForTest();
});

describe('choosing a certificate storage credential', () => {
  it('uses the connection string when the account URL is set but no workload identity is projected', () => {
    // Exactly the production shape: ConfigMap supplies the URL, the cluster has
    // no workload identity. This returned an unusable managed-identity client.
    process.env.AZURE_STORAGE_ACCOUNT_URL = 'https://okirubackups2026.blob.core.windows.net';
    process.env.AZURE_CERT_STORAGE_CONNECTION_STRING = CONN;

    const client = getCertBlobServiceClient();

    expect(client).not.toBeNull();
    // A shared-key client carries the credential that can actually sign; the
    // managed-identity client cannot, on this cluster.
    expect(client!.credential.constructor.name).toBe('StorageSharedKeyCredential');
  });

  it('prefers workload identity when it IS projected into the pod', () => {
    process.env.AZURE_STORAGE_ACCOUNT_URL = 'https://okirubackups2026.blob.core.windows.net';
    process.env.AZURE_CERT_STORAGE_CONNECTION_STRING = CONN;
    // What the workload-identity mutating webhook injects.
    process.env.AZURE_CLIENT_ID = '00000000-0000-0000-0000-000000000000';
    process.env.AZURE_FEDERATED_TOKEN_FILE = '/var/run/secrets/azure/tokens/azure-identity-token';

    const client = getCertBlobServiceClient();

    expect(client).not.toBeNull();
    expect(client!.credential.constructor.name).not.toBe('StorageSharedKeyCredential');
  });

  it('still resolves a client from a connection string alone', () => {
    process.env.AZURE_CERT_STORAGE_CONNECTION_STRING = CONN;
    expect(getCertBlobServiceClient()).not.toBeNull();
  });

  it('returns null only when nothing at all is configured', () => {
    expect(getCertBlobServiceClient()).toBeNull();
  });
});

describe('choosing the container', () => {
  it('lets the ConfigMap container win over the stale legacy secret value', () => {
    // The secret still carried "clients-certs", a container that does not exist;
    // the real certificates live in "certificates".
    process.env.AZURE_STORAGE_CONTAINER_NAME = 'certificates';
    process.env.AZURE_CERT_BLOB_CONTAINER = 'clients-certs';
    expect(getCertBlobContainerName()).toBe('certificates');
  });
});
