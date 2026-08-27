#!/usr/bin/env tsx
/**
 * Clear the failure markers left by a DI backfill so the next run retries them.
 *
 * The backfill deliberately stamps `docIntelligenceAt` on a FAILED document as
 * well as a successful one, so an interrupted run never pays twice for the same
 * error. That is right for a resume and wrong after the CAUSE of the failure has
 * been fixed — the document is then permanently excluded from a job that would
 * now succeed.
 *
 * The August/2026-08 run failed 21 certificates with `400 UnsupportedContent`,
 * all of them .png/.jpg scans that the client mislabelled `application/pdf`.
 * With the content type now sniffed from the file's magic bytes those documents
 * are readable, but only if their markers are cleared first.
 *
 * Dry run by default. `--run` clears. `--pattern <substr>` limits it to one
 * class of error so a fix for one cause never silently re-bills another.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/retryFailedDocIntelligence.ts --pattern UnsupportedContent [--run]
 */
import mongoose from 'mongoose';

const DO_RUN = process.argv.includes('--run');
const PATTERN = (() => {
  const i = process.argv.indexOf('--pattern');
  return i >= 0 ? process.argv[i + 1] : null;
})();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db;
  if (!db) throw new Error('mongo connection has no database');
  const col = db.collection('certificate_metadata');

  const filter: Record<string, unknown> = { docIntelligenceError: { $ne: null } };
  if (PATTERN) filter.docIntelligenceError = { $regex: PATTERN, $options: 'i' };

  const targets = await col.find(filter, {
    projection: { _id: 0, id: 1, fileName: 1, docIntelligenceError: 1 },
  }).toArray();

  console.log(`failed certificates matching ${PATTERN ?? '(any error)'}: ${targets.length}`);
  for (const t of targets.slice(0, 25)) {
    console.log(`  - ${String(t.fileName).slice(0, 58)}  ::  ${String(t.docIntelligenceError).slice(0, 70)}`);
  }
  if (targets.length > 25) console.log(`  …and ${targets.length - 25} more`);

  if (!DO_RUN) {
    console.log('\n(dry run — pass --run to clear the markers so the backfill retries them)');
    await mongoose.disconnect();
    return;
  }

  const res = await col.updateMany(filter, {
    $unset: { docIntelligenceAt: '', docIntelligenceError: '' },
  });
  console.log(`\ncleared markers on ${res.modifiedCount} certificate(s) — re-run targetedDocIntelligenceBackfill.ts to retry them`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
