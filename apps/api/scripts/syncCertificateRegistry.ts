#!/usr/bin/env tsx
/**
 * Reconcile the certificate REGISTRY against Blob Storage.
 *
 * This is the fast metadata reconcile — list every blob, upsert its storage
 * fields into certificate_metadata — not the heavy per-file OCR walk that
 * `ingestCertificates.ts` performs. Text extraction and enrichment run
 * separately, on their own jobs.
 *
 * Exists because the same operation is otherwise only reachable through
 * POST /api/certificates/sync-storage, which requires an interactive admin
 * session. An operator restoring the registry after a migration needs to run it
 * without impersonating a user.
 *
 * Usage:
 *   MONGODB_URI=... AZURE_CERT_STORAGE_CONNECTION_STRING=... \
 *   AZURE_STORAGE_CONTAINER_NAME=certificates \
 *   npx tsx scripts/syncCertificateRegistry.ts
 */
import mongoose from 'mongoose';
import { syncCertificateStorage } from '../src/services/certificateRegistry.js';
import {
  checkCertificateBlobStorage,
  getCertAccountName,
  getCertBlobContainerName,
} from '../src/services/azureCertStorage.js';

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  const storage = await checkCertificateBlobStorage();
  console.log(`storage: ${JSON.stringify(storage)}`);
  if (storage.status !== 'connected') {
    console.error('Blob Storage is not reachable — refusing to run a sync that would mark every certificate missing.');
    process.exit(1);
  }
  console.log(`account=${getCertAccountName()} container=${getCertBlobContainerName()}`);

  await mongoose.connect(mongoUri);
  const collection = mongoose.connection.db!.collection('certificate_metadata');
  console.log(`certificate_metadata before: ${await collection.countDocuments()}`);

  const startedAt = Date.now();
  const summary = await syncCertificateStorage();
  console.log(`sync completed in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log(JSON.stringify(summary, null, 2));

  console.log(`certificate_metadata after: ${await collection.countDocuments()}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
