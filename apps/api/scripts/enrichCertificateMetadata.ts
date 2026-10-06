#!/usr/bin/env tsx
/**
 * Populate certificate metadata from text that is already stored in MongoDB.
 * This does not download blobs or invoke paid OCR. It is a dry run unless the
 * caller explicitly supplies --apply.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import {
  PRODUCTION_CERTIFICATE_FIELDS,
  runCertificateEnrichmentJob,
} from '../src/services/certificateEnrichmentJob.js';

const apply = process.argv.includes('--apply');
const requestedLimit = Number(process.env.CERTIFICATE_ENRICHMENT_LIMIT ?? 5000);
const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
  ? Math.min(Math.floor(requestedLimit), 25_000)
  : 5000;

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is required');

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} certificate metadata enrichment`);
  console.log(`fields: ${PRODUCTION_CERTIFICATE_FIELDS.join(', ')}`);
  console.log(`limit: ${limit}`);

  await mongoose.connect(mongoUri);
  try {
    const result = await runCertificateEnrichmentJob({} as never, {
      dryRun: !apply,
      limit,
      onlyUsableText: true,
      includeDetails: false,
      reviewSampleLimit: 0,
    });

    console.log(JSON.stringify(result, null, 2));
    if (!apply) {
      console.log('No records were changed. Re-run with --apply after reviewing this output.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
