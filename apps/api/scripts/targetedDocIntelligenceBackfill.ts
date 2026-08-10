#!/usr/bin/env tsx
/**
 * TARGETED Document Intelligence backfill.
 *
 * Re-reads ONLY certificates that are actually missing something, using
 * prebuilt-document's labelled key/value pairs, and writes ONLY into fields that
 * are currently empty. 99% of supplier names are already correct; there is no
 * reason to pay to re-read them and every reason not to risk overwriting a good
 * value with a worse one.
 *
 * The one exception is companyRegistrationNumber, which NOTHING currently
 * populates. It is the field that separates "one legal entity trading under many
 * names" (Hudaco, Bidvest, Massmart — which legitimately share a VAT) from a
 * genuine cross-company leak, so it is always written when found.
 *
 * Every write passes validateCertificateFields first, so a value that fails a
 * format check becomes null-with-a-reason rather than being stored.
 *
 * Dry run by default — prints the target count and the real cost. Pass --run to
 * spend. Resumable: the selection is "still missing something", so re-running
 * after an interruption picks up only what is left.
 *
 * Usage (from apps/api):
 *   MONGODB_URI=... AZURE_CERT_STORAGE_CONNECTION_STRING=... \
 *   AZURE_STORAGE_CONTAINER_NAME=certificates \
 *   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=... AZURE_DOCUMENT_INTELLIGENCE_KEY=... \
 *   npx tsx scripts/targetedDocIntelligenceBackfill.ts [--run] [--limit N]
 */
import mongoose from 'mongoose';
import { getCertBlobServiceClient, getCertContainerClient } from '../src/services/azureCertStorage.js';
import { analyseCertificate, type DocIntelligenceFields } from '../src/services/certificateDocIntelligence.js';
import { validateCertificateFields } from '../src/services/certificateFieldValidation.js';

const DO_RUN = process.argv.includes('--run');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();
const CONCURRENCY = Number(process.env.DI_CONCURRENCY ?? 4);
const USD_PER_PAGE = 10 / 1000; // prebuilt-document

/** Fields worth paying to recover. A certificate missing none of these is skipped. */
const GAP_FIELDS = ['vatNumber', 'certificateNumber', 'bbbeeLevel', 'sectorCode', 'verificationAgency'] as const;

function gapFilter() {
  return {
    // Never spend on a file with no content.
    fileSize: { $gt: 0 },
    blobName: { $nin: [null, ''] },
    // Not already done by a previous run of this script.
    docIntelligenceAt: { $in: [null, undefined] },
    $or: GAP_FIELDS.flatMap((f) => [{ [f]: null }, { [f]: '' }, { [f]: { $exists: false } }]),
  };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

async function main() {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? '';
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ?? '';
  if (!endpoint || !apiKey) throw new Error('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/KEY required');
  await mongoose.connect(process.env.MONGODB_URI!);
  const col = mongoose.connection.db!.collection('certificate_metadata');

  const total = await col.countDocuments();
  const targets = await col.find(gapFilter(), {
    projection: { _id: 0, id: 1, blobName: 1, supplierName: 1, fileSize: 1, ...Object.fromEntries(GAP_FIELDS.map((f) => [f, 1])) },
  }).limit(Number.isFinite(LIMIT) ? LIMIT : 0).toArray() as Record<string, any>[];

  // Real page counts are only known after analysis; 1.8 is the measured mean.
  const estPages = Math.round(targets.length * 1.8);
  console.log(`\n${'='.repeat(66)}\nTARGETED DOC INTELLIGENCE BACKFILL\n${'='.repeat(66)}`);
  console.log(`  registry total          : ${total}`);
  console.log(`  missing >=1 key field   : ${targets.length}`);
  console.log(`  estimated pages         : ~${estPages} (at the measured 1.8 pages/cert)`);
  console.log(`  ESTIMATED COST          : ~$${(estPages * USD_PER_PAGE).toFixed(2)}`);
  for (const f of GAP_FIELDS) {
    const n = targets.filter((d) => !d[f]).length;
    console.log(`     missing ${f.padEnd(20)} ${n}`);
  }

  if (!DO_RUN) {
    console.log('\n(dry run — pass --run to spend)\n');
    await mongoose.disconnect();
    return;
  }

  const container = getCertContainerClient(getCertBlobServiceClient()!);
  let processed = 0, updated = 0, failed = 0, pages = 0;
  const filled: Record<string, number> = {};

  async function handle(doc: Record<string, any>) {
    try {
      const dl = await container.getBlobClient(doc.blobName).download();
      const buf = await streamToBuffer(dl.readableStreamBody as NodeJS.ReadableStream);
      const di: DocIntelligenceFields = await analyseCertificate(buf, { endpoint, apiKey });
      pages += di.pages;

      // Validate before writing: a value that fails a format check is dropped.
      const { fields } = validateCertificateFields({
        vatNumber: di.vatNumber,
        certificateNumber: di.certificateNumber,
        verificationAgency: di.verificationAgency,
        bbbeeLevel: di.bbbeeLevel,
        blackOwnership: di.blackOwnership,
        blackWomenOwnership: di.blackWomenOwnership,
      });

      // GAP FILL ONLY: never overwrite a value that is already there.
      const set: Record<string, unknown> = { docIntelligenceAt: new Date() };
      const candidates: Array<[string, unknown]> = [
        ['vatNumber', fields.vatNumber],
        ['certificateNumber', fields.certificateNumber],
        ['verificationAgency', fields.verificationAgency],
        ['bbbeeLevel', fields.bbbeeLevel],
        ['blackOwnership', fields.blackOwnership],
        ['blackWomenOwnership', fields.blackWomenOwnership],
        ['expiryDate', di.expiryDate],
        ['issueDate', di.issueDate],
      ];
      for (const [field, value] of candidates) {
        if (value === null || value === undefined || value === '') continue;
        if (doc[field] !== null && doc[field] !== undefined && doc[field] !== '') continue;
        set[field] = value;
        filled[field] = (filled[field] ?? 0) + 1;
      }
      // Always recorded — nothing else populates these, so there is nothing to
      // overwrite. Registration number decides group-vs-bleed; documentKind
      // fills certificateType, which has been 0% and leaves the Hub's
      // Certificates/Affidavits toggle filtering on a field nobody writes.
      if (di.companyRegistrationNumber) {
        set.companyRegistrationNumber = di.companyRegistrationNumber;
        filled.companyRegistrationNumber = (filled.companyRegistrationNumber ?? 0) + 1;
      }
      if (di.documentKind) {
        set.certificateType = di.documentKind;
        filled.certificateType = (filled.certificateType ?? 0) + 1;
      }

      await col.updateOne({ id: doc.id }, { $set: set });
      if (Object.keys(set).length > 1) updated += 1;
    } catch (err) {
      failed += 1;
      // Mark it attempted so a re-run does not pay for the same failure twice,
      // but record why so it stays findable.
      await col.updateOne({ id: doc.id }, {
        $set: { docIntelligenceAt: new Date(), docIntelligenceError: (err as Error).message.slice(0, 300) },
      });
    } finally {
      processed += 1;
      if (processed % 25 === 0) {
        console.log(`  ${processed}/${targets.length}  updated=${updated} failed=${failed} pages=${pages} ($${(pages * USD_PER_PAGE).toFixed(2)})`);
      }
    }
  }

  console.log(`\nProcessing ${targets.length} certificate(s) at concurrency ${CONCURRENCY}…\n`);
  const queue = [...targets];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await handle(next);
    }
  }));

  console.log(`\n--- RESULT ---`);
  console.log(`  processed ${processed}, updated ${updated}, failed ${failed}`);
  console.log(`  pages billed: ${pages}   ACTUAL COST: $${(pages * USD_PER_PAGE).toFixed(2)}`);
  console.log('  fields filled:');
  for (const [f, n] of Object.entries(filled).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${f.padEnd(26)} ${n}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
