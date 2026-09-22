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

/**
 * The replica count is not a detail here.
 *
 * The API runs two pods and both reach the startup walk. Each certificate that
 * still needs extracting was therefore downloaded twice and billed twice to
 * Azure Document Intelligence, with two writers updating the same registry row
 * at the same time. Confirmed in production: both replicas logged the same
 * files, seconds apart, on the same boot.
 *
 * The lease is the fix, and these are the three things it has to get right —
 * the winner runs, the loser does not, and neither of them keeps the lease
 * afterwards.
 */
describe('startup extraction across replicas', () => {
  it('runs the walk on the replica that takes the lease', async () => {
    const logger = testLogger();
    const processAllCertificates = vi.fn(async () => ({ processed: 3 }));
    const releaseLease = vi.fn(async () => {});

    await runCertificateStartupExtraction({
      logger,
      acquireLease: vi.fn(async () => true),
      releaseLease,
      loadBlobServiceClient: vi.fn(async () => ({ mocked: true }) as any),
      loadProcessor: vi.fn(async () => processAllCertificates),
      env: {},
    });

    expect(processAllCertificates).toHaveBeenCalledTimes(1);
    expect(releaseLease).toHaveBeenCalledTimes(1);
  });

  it('does not walk the container on a replica that lost the lease', async () => {
    const logger = testLogger();
    const loadBlobServiceClient = vi.fn();
    const loadProcessor = vi.fn();

    await runCertificateStartupExtraction({
      logger,
      acquireLease: vi.fn(async () => false),
      loadBlobServiceClient,
      loadProcessor,
      env: {},
    });

    // Not one blob listed, not one page billed.
    expect(loadBlobServiceClient).not.toHaveBeenCalled();
    expect(loadProcessor).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Startup certificate extraction skipped: another replica holds the lease',
    );
  });

  /**
   * A lease held after the work stopped is a lock nobody can clear, and the
   * next restart would wait out the whole expiry for nothing.
   */
  it('gives the lease back even when the walk throws', async () => {
    const logger = testLogger();
    const releaseLease = vi.fn(async () => {});

    await runCertificateStartupExtraction({
      logger,
      acquireLease: vi.fn(async () => true),
      releaseLease,
      loadBlobServiceClient: vi.fn(async () => ({ mocked: true }) as any),
      loadProcessor: vi.fn(async () => vi.fn(async () => { throw new Error('storage exploded'); })),
      env: {},
    });

    expect(releaseLease).toHaveBeenCalledTimes(1);
  });

  it('gives the lease back when there is no storage to walk', async () => {
    const logger = testLogger();
    const releaseLease = vi.fn(async () => {});

    await runCertificateStartupExtraction({
      logger,
      acquireLease: vi.fn(async () => true),
      releaseLease,
      loadBlobServiceClient: vi.fn(async () => null),
      loadProcessor: vi.fn(),
      env: {},
    });

    expect(releaseLease).toHaveBeenCalledTimes(1);
  });

  /**
   * The guard that already exists has to win. Taking a lease and then
   * discovering extraction is switched off would park the lease for six hours
   * on a deployment that never intended to run the walk at all.
   */
  it('never reaches for the lease when startup extraction is switched off', async () => {
    const acquireLease = vi.fn(async () => true);

    await runCertificateStartupExtraction({
      logger: testLogger(),
      acquireLease,
      loadBlobServiceClient: vi.fn(),
      loadProcessor: vi.fn(),
      env: { CERT_EXTRACTION_ON_STARTUP: 'false' } as NodeJS.ProcessEnv,
    });

    expect(acquireLease).not.toHaveBeenCalled();
  });

  /** A single-process deployment needs no coordination and must not require it. */
  it('still runs when no lease mechanism is supplied at all', async () => {
    const processAllCertificates = vi.fn(async () => ({ processed: 1 }));

    await runCertificateStartupExtraction({
      logger: testLogger(),
      loadBlobServiceClient: vi.fn(async () => ({ mocked: true }) as any),
      loadProcessor: vi.fn(async () => processAllCertificates),
      env: {},
    });

    expect(processAllCertificates).toHaveBeenCalledTimes(1);
  });
});
