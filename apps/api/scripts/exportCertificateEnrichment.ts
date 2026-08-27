#!/usr/bin/env tsx
/**
 * Snapshot the PAID-FOR certificate enrichment to blob storage, and restore it.
 *
 * WHY. The August 2026 Document Intelligence run cost $58 and its output lived
 * only in the prod MongoDB. When that database was not carried across a
 * subscription migration, every DI-derived field went back to null and the
 * money had to be spent a second time. The extraction is expensive; the JSON is
 * free. There is no reason for a database rebuild to imply a re-bill.
 *
 * Keyed on `checksum` first (content-addressed, survives renames and re-ingest)
 * and `blobName` second, so a restore matches the same DOCUMENT rather than the
 * same row id — row ids are regenerated on re-ingest, which is precisely when
 * you need this.
 *
 * Restore is gap-fill only, exactly like the backfill that produced the data:
 * it writes a field only where the target is currently empty.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/exportCertificateEnrichment.ts            # export to blob
 *   npx tsx scripts/exportCertificateEnrichment.ts --restore  # replay into Mongo
 */
import mongoose from 'mongoose';
import { getCertBlobServiceClient } from '../src/services/azureCertStorage.js';

/** Only fields that cost money or that nothing else populates. */
const ENRICHED = [
  'companyRegistrationNumber', 'certificateType', 'vatNumber', 'certificateNumber',
  'verificationAgency', 'bbbeeLevel', 'blackOwnership', 'blackWomenOwnership',
  'sectorCode', 'sectorName', 'issueDate', 'expiryDate', 'docIntelligenceAt',
] as const;

const RESTORE = process.argv.includes('--restore');
const CONTAINER = process.env.ENRICHMENT_SNAPSHOT_CONTAINER ?? 'mongodb-backups';
const BLOB = process.env.ENRICHMENT_SNAPSHOT_BLOB ?? 'certificate-enrichment-latest.json';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db;
  if (!db) throw new Error('mongo connection has no database');
  const col = db.collection('certificate_metadata');
  const blobService = getCertBlobServiceClient();
  if (!blobService) throw new Error('AZURE_CERT_STORAGE_CONNECTION_STRING (or account URL) is not configured');
  const container = blobService.getContainerClient(CONTAINER);
  await container.createIfNotExists();

  if (!RESTORE) {
    const projection: Record<string, 0 | 1> = { _id: 0, checksum: 1, blobName: 1, fileName: 1 };
    for (const f of ENRICHED) projection[f] = 1;
    const rows = (await col.find({ docIntelligenceAt: { $ne: null } }, { projection }).toArray())
      .filter((r) => ENRICHED.some((f) => r[f] !== null && r[f] !== undefined && r[f] !== ''));

    const payload = JSON.stringify({ takenAt: new Date().toISOString(), count: rows.length, rows }, null, 0);
    await container.getBlockBlobClient(BLOB).upload(payload, Buffer.byteLength(payload), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });
    console.log(`exported ${rows.length} enriched certificates -> ${CONTAINER}/${BLOB} (${(Buffer.byteLength(payload) / 1024).toFixed(0)} KB)`);
    await mongoose.disconnect();
    return;
  }

  const buf = await container.getBlobClient(BLOB).downloadToBuffer();
  const { rows, takenAt } = JSON.parse(buf.toString('utf8')) as { rows: Record<string, any>[]; takenAt: string };
  console.log(`restoring snapshot of ${rows.length} certificates taken ${takenAt}`);

  let matched = 0; let written = 0;
  for (const row of rows) {
    const query = row.checksum ? { checksum: row.checksum } : { blobName: row.blobName };
    const target = await col.findOne(query);
    if (!target) continue;
    matched += 1;
    const set: Record<string, unknown> = {};
    for (const f of ENRICHED) {
      const v = row[f];
      if (v === null || v === undefined || v === '') continue;
      const cur = (target as Record<string, any>)[f];
      if (cur !== null && cur !== undefined && cur !== '') continue;  // gap-fill only
      set[f] = f.endsWith('At') ? new Date(v) : v;
    }
    if (Object.keys(set).length) { await col.updateOne(query, { $set: set }); written += 1; }
  }
  console.log(`matched ${matched}/${rows.length}, wrote into ${written} (gap-fill only, nothing overwritten)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
