import type { BlobServiceClient } from '@azure/storage-blob';
import { CertificateMetadataModel } from '../../models.js';
import { getCertContainerClient } from './azureCertStorage.js';
import {
  PRODUCTION_CERTIFICATE_FIELDS,
  runCertificateEnrichmentJob,
} from './certificateEnrichmentJob.js';
import { processOneCertificate } from './certificateExtractor.js';

export async function processOneCertificatePipeline(
  blobServiceClient: BlobServiceClient,
  blobName: string,
  force = false,
): Promise<{ blobName: string; status: string; expiryDate: Date | null }> {
  const textResult = await processOneCertificate(blobServiceClient, blobName, force);
  if (textResult.status === 'error' || textResult.status === 'failed') return textResult;

  const doc = await CertificateMetadataModel.findOne(
    { blobName },
    { extractionStatus: 1, expiryDate: 1 },
  ).lean() as { extractionStatus?: string; expiryDate?: Date | null } | null;
  if (doc?.extractionStatus !== 'completed') return textResult;

  const enrichment = await runCertificateEnrichmentJob(blobServiceClient, {
    blobNames: [blobName],
    limit: 1,
    dryRun: false,
    // `force` controls source-text refresh only. Metadata enrichment must still
    // preserve existing/user-confirmed values unless a stronger candidate can
    // safely replace a previously low-confidence extracted value.
    force: false,
    onlyUsableText: true,
    includeDetails: false,
    reviewSampleLimit: 0,
    fields: [...PRODUCTION_CERTIFICATE_FIELDS],
  });
  const enriched = await CertificateMetadataModel.findOne(
    { blobName },
    { metadataStatus: 1, expiryDate: 1 },
  ).lean() as { metadataStatus?: string; expiryDate?: Date | null } | null;

  return {
    blobName,
    status: enriched?.metadataStatus
      || (enrichment.failed > 0 ? 'failed' : enrichment.reviewRequired > 0 ? 'needs_review' : 'complete'),
    expiryDate: enriched?.expiryDate ?? doc.expiryDate ?? null,
  };
}

export async function processAllCertificatePipelines(
  blobServiceClient: BlobServiceClient,
  force = false,
  onProgress?: (done: number, total: number) => void,
): Promise<{ processed: number; skipped: number; errors: number }> {
  const container = getCertContainerClient(blobServiceClient);
  const blobs: string[] = [];
  for await (const blob of container.listBlobsFlat()) blobs.push(blob.name);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let nextIndex = 0;
  let completed = 0;
  const requestedConcurrency = Number(process.env.CERTIFICATE_PIPELINE_CONCURRENCY ?? 1);
  const concurrency = Number.isFinite(requestedConcurrency)
    ? Math.min(Math.max(Math.floor(requestedConcurrency), 1), 8)
    : 1;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= blobs.length) return;
      try {
        const result = await processOneCertificatePipeline(blobServiceClient, blobs[index], force);
        if (result.status === 'skipped') skipped += 1;
        else if (result.status === 'error' || result.status === 'failed') errors += 1;
        else processed += 1;
      } catch {
        errors += 1;
      }
      completed += 1;
      onProgress?.(completed, blobs.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, blobs.length) }, () => worker()));
  return { processed, skipped, errors };
}
