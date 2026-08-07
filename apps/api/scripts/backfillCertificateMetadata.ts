#!/usr/bin/env tsx
/**
 * Backfill certificate TEXT + structured METADATA across the whole corpus.
 *
 * The HTTP endpoints cap a single text-extraction call at 25 documents
 * (MAX_TEXT_EXTRACTION_RETRY_LIMIT) so a request can never run unbounded. That
 * is right for a request and wrong for a 2,951-certificate backfill, so this
 * drives the SAME job in a loop until the retry filter stops matching, then runs
 * enrichment over everything that gained usable text.
 *
 * Resumable by construction: the retry filter selects only documents whose text
 * is missing or too short, so re-running it after an interruption picks up
 * exactly what is left rather than re-billing work already done.
 *
 * Usage (from apps/api):
 *   MONGODB_URI=... AZURE_CERT_STORAGE_CONNECTION_STRING=... \
 *   AZURE_STORAGE_CONTAINER_NAME=certificates \
 *   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=... AZURE_DOCUMENT_INTELLIGENCE_KEY=... \
 *   npx tsx scripts/backfillCertificateMetadata.ts
 */
import mongoose from 'mongoose';
import {
  runCertificateTextExtractionRetryJob,
  getCertificateTextExtractionCoverage,
  getTextExtractionDependencies,
  MAX_TEXT_EXTRACTION_RETRY_LIMIT,
} from '../src/services/certificateTextExtractionJob.js';
import { runCertificateEnrichmentJob } from '../src/services/certificateEnrichmentJob.js';
import { getCertBlobServiceClient, checkCertificateBlobStorage } from '../src/services/azureCertStorage.js';

/** Stop if this many consecutive batches extract nothing — something is stuck. */
const MAX_BARREN_ROUNDS = 3;
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS ?? 400);

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : 'n/a';
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is required');

  const storage = await checkCertificateBlobStorage();
  if (storage.status !== 'connected') throw new Error(`Blob Storage not reachable: ${JSON.stringify(storage)}`);
  const deps = getTextExtractionDependencies();
  console.log(`storage: ${JSON.stringify(storage)}`);
  console.log(`deps:    ${JSON.stringify(deps)}`);
  if (!deps.azureDocumentIntelligenceConfigured) {
    throw new Error('Azure Document Intelligence is NOT configured — the scanned certificates cannot be read.');
  }

  await mongoose.connect(mongoUri);
  const client = getCertBlobServiceClient()!;

  const before = await getCertificateTextExtractionCoverage();
  console.log(`\n=== BEFORE ===\n${JSON.stringify(before, null, 1)}\n`);

  const startedAt = Date.now();
  let round = 0;
  let barren = 0;
  let extracted = 0;

  while (round < MAX_ROUNDS && barren < MAX_BARREN_ROUNDS) {
    round += 1;
    const result = await runCertificateTextExtractionRetryJob(client, {
      dryRun: false,
      limit: MAX_TEXT_EXTRACTION_RETRY_LIMIT,
      concurrency: 3,
      includeDetails: false,
    });

    const matched = Number(result.matched ?? 0);
    const retried = Number(result.retried ?? 0);
    const succeeded = Number((result.summary as Record<string, number>)?.completed ?? 0);
    extracted += succeeded;

    if (matched === 0) {
      console.log(`round ${round}: nothing left to extract — done`);
      break;
    }
    barren = retried === 0 ? barren + 1 : 0;

    const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log(
      `round ${round}: matched=${matched} retried=${retried} completed=${succeeded} `
      + `| cumulative completed=${extracted} | ${mins}m elapsed`,
    );
  }

  if (barren >= MAX_BARREN_ROUNDS) {
    console.warn(`\nStopped: ${MAX_BARREN_ROUNDS} consecutive rounds extracted nothing.`);
  }

  const afterText = await getCertificateTextExtractionCoverage();
  console.log(`\n=== AFTER TEXT EXTRACTION ===\n${JSON.stringify(afterText, null, 1)}\n`);

  console.log('=== ENRICHMENT (structured fields from the extracted text) ===');
  const enrichment = await runCertificateEnrichmentJob(client, {
    dryRun: false,
    limit: 5000,
    onlyUsableText: true,
    includeDetails: false,
  });
  const e = enrichment as unknown as Record<string, unknown>;
  console.log(JSON.stringify({
    processed: e.processed, updated: e.updated, completed: e.completed,
    reviewRequired: e.reviewRequired, failed: e.failed, skipped: e.skipped,
  }, null, 1));

  const named = await mongoose.connection.db!.collection('certificate_metadata')
    .countDocuments({ supplierName: { $nin: [null, ''] } });
  const total = await mongoose.connection.db!.collection('certificate_metadata').countDocuments();
  console.log(`\nsupplierName populated: ${named}/${total} (${pct(named, total)})`);
  console.log(`total wall clock: ${((Date.now() - startedAt) / 60000).toFixed(1)} minutes`);

  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
