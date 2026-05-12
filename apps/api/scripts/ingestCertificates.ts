#!/usr/bin/env tsx
/**
 * Certificate bulk-ingestion script.
 *
 * Walks every blob in the `clients-certs` container, runs the same
 * extraction pipeline used at upload time (PDF text layer → OCR fallback),
 * and persists the results in MongoDB.  This replaces the old Azure AI Search
 * ingestion that was removed in Task 7.
 *
 * Usage:
 *   MONGODB_URI=... AZURE_STORAGE_CONNECTION_STRING=... npx tsx scripts/ingestCertificates.ts [--force]
 */

import mongoose from 'mongoose';
import { BlobServiceClient } from '@azure/storage-blob';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { processAllCertificates } from '../src/services/certificateExtractor.js';

const TMP_DIR = join(tmpdir(), 'cert-ingest');

async function main() {
  console.log('=== Certificate Bulk-Ingestion (MongoDB) ===\n');

  const mongoUri = process.env.MONGODB_URI;
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!mongoUri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  if (!connStr) {
    console.error('AZURE_STORAGE_CONNECTION_STRING is not set');
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  if (force) console.log('Running in FORCE mode — all blobs will be re-extracted.\n');

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  console.log('1. Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('   Connected.\n');

  console.log('2. Connecting to Azure Blob Storage...');
  const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  console.log('   Connected.\n');

  console.log('3. Processing certificates...');
  let lastLogged = 0;
  const result = await processAllCertificates(blobServiceClient, force, (done, total) => {
    const pct = Math.floor((done / total) * 100);
    if (pct >= lastLogged + 10) {
      console.log(`   ${pct}% (${done}/${total})`);
      lastLogged = pct;
    }
  });

  console.log(`\n4. Summary:`);
  console.log(`   Processed: ${result.processed}`);
  console.log(`   Skipped (already done): ${result.skipped}`);
  console.log(`   Errors: ${result.errors}`);
  console.log('\n=== Ingestion Complete ===');

  await mongoose.disconnect();
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
