import type { BlobServiceClient } from '@azure/storage-blob';
import type { Logger } from '../logger.js';

type BlobClientLoader = () => Promise<BlobServiceClient | null>;
type ProcessAllCertificates = (
  blobServiceClient: BlobServiceClient,
  force: boolean,
  onProgress?: (done: number, total: number) => void,
) => Promise<unknown>;
type ProcessorLoader = () => Promise<ProcessAllCertificates>;

export function isCertificateStartupExtractionDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DISABLE_CERTIFICATE_STARTUP_EXTRACTION === 'true'
    || env.DISABLE_CERTIFICATE_STARTUP_EXTRACTION === '1'
    || env.CERT_EXTRACTION_ON_STARTUP === 'false';
}

export function certificateStartupExtractionGuardReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.DISABLE_CERTIFICATE_STARTUP_EXTRACTION === 'true' || env.DISABLE_CERTIFICATE_STARTUP_EXTRACTION === '1') {
    return 'DISABLE_CERTIFICATE_STARTUP_EXTRACTION=true';
  }
  if (env.CERT_EXTRACTION_ON_STARTUP === 'false') {
    return 'CERT_EXTRACTION_ON_STARTUP=false';
  }
  return null;
}

export async function runCertificateStartupExtraction(params: {
  logger: Logger;
  loadBlobServiceClient: BlobClientLoader;
  loadProcessor: ProcessorLoader;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const env = params.env ?? process.env;
  const disabledReason = certificateStartupExtractionGuardReason(env);
  if (disabledReason) {
    params.logger.info('Startup certificate extraction disabled', { reason: disabledReason });
    return;
  }

  params.logger.info('Startup certificate extraction enabled');

  try {
    const blobServiceClient = await params.loadBlobServiceClient();
    if (!blobServiceClient) {
      params.logger.info('Startup certificate extraction skipped: Azure certificate storage is not configured');
      return;
    }

    const processAllCertificates = await params.loadProcessor();
    params.logger.info('Starting background certificate extraction...');
    const result = await processAllCertificates(blobServiceClient, false, (done, total) => {
      if (done % 25 === 0 || done === total) {
        params.logger.info('Certificate extraction progress', { done, total });
      }
    });
    params.logger.info('Background certificate extraction complete', result as Record<string, unknown>);
  } catch (err) {
    params.logger.warn('Background certificate extraction failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
