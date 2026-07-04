import { describe, expect, it, vi } from 'vitest';
import {
  certificateStartupExtractionGuardReason,
  isCertificateStartupExtractionDisabled,
  runCertificateStartupExtraction,
} from '../certificateStartupExtraction.js';

function testLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as any;
}

describe('certificate startup extraction guard', () => {
  it('disables startup extraction with the explicit recovery lock flag', async () => {
    const logger = testLogger();
    const loadBlobServiceClient = vi.fn();
    const loadProcessor = vi.fn();
    const env = { DISABLE_CERTIFICATE_STARTUP_EXTRACTION: 'true' } as NodeJS.ProcessEnv;

    await runCertificateStartupExtraction({ logger, loadBlobServiceClient, loadProcessor, env });

    expect(isCertificateStartupExtractionDisabled(env)).toBe(true);
    expect(certificateStartupExtractionGuardReason(env)).toBe('DISABLE_CERTIFICATE_STARTUP_EXTRACTION=true');
    expect(loadBlobServiceClient).not.toHaveBeenCalled();
    expect(loadProcessor).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Startup certificate extraction disabled',
      { reason: 'DISABLE_CERTIFICATE_STARTUP_EXTRACTION=true' },
    );
  });

  it('preserves the existing CERT_EXTRACTION_ON_STARTUP=false guard', async () => {
    const logger = testLogger();
    const loadBlobServiceClient = vi.fn();
    const loadProcessor = vi.fn();
    const env = { CERT_EXTRACTION_ON_STARTUP: 'false' } as NodeJS.ProcessEnv;

    await runCertificateStartupExtraction({ logger, loadBlobServiceClient, loadProcessor, env });

    expect(isCertificateStartupExtractionDisabled(env)).toBe(true);
    expect(certificateStartupExtractionGuardReason(env)).toBe('CERT_EXTRACTION_ON_STARTUP=false');
    expect(loadBlobServiceClient).not.toHaveBeenCalled();
    expect(loadProcessor).not.toHaveBeenCalled();
  });

  it('runs background extraction only when startup extraction is enabled', async () => {
    const logger = testLogger();
    const blobServiceClient = { mocked: true } as any;
    const processAllCertificates = vi.fn(async (_client, _force, onProgress) => {
      onProgress?.(25, 25);
      return { processed: 1 };
    });

    await runCertificateStartupExtraction({
      logger,
      loadBlobServiceClient: vi.fn(async () => blobServiceClient),
      loadProcessor: vi.fn(async () => processAllCertificates),
      env: {},
    });

    expect(processAllCertificates).toHaveBeenCalledWith(blobServiceClient, false, expect.any(Function));
    expect(logger.info).toHaveBeenCalledWith('Startup certificate extraction enabled');
    expect(logger.info).toHaveBeenCalledWith('Certificate extraction progress', { done: 25, total: 25 });
    expect(logger.info).toHaveBeenCalledWith('Background certificate extraction complete', { processed: 1 });
  });
});
