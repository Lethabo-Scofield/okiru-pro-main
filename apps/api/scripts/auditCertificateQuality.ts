#!/usr/bin/env tsx
/**
 * Data-quality audit of the certificate registry.
 *
 * Answers three questions the Hub cannot: how much of each field is actually
 * populated, how much of it is SHARED between certificates that should not share
 * it (the signature of field bleed — picking up the verification agency's
 * details, or the previous document's, instead of this supplier's), and which
 * source files are unreadable.
 *
 * Read-only. Prints aggregates and value shapes, never certificate text.
 *
 * Usage (from apps/api):
 *   MONGODB_URI=... npx tsx scripts/auditCertificateQuality.ts
 */
import mongoose from 'mongoose';

const FIELDS = [
  'supplierName', 'vatNumber', 'certificateNumber', 'bbbeeLevel', 'companySize',
  'blackOwnership', 'blackWomenOwnership', 'expiryDate', 'issueDate',
  // Sector is stored split (code + name), NOT as a single `sector` field — a
  // query for `sector` reports a misleading 0%.
  'sectorCode', 'sectorName', 'verificationAgency', 'certificateType',
] as const;

function bar(n: number, total: number, width = 28): string {
  const filled = total ? Math.round((n / total) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri);
  const col = mongoose.connection.db!.collection('certificate_metadata');

  const total = await col.countDocuments();
  console.log(`\n${'='.repeat(72)}\nCERTIFICATE REGISTRY — DATA QUALITY AUDIT\n${'='.repeat(72)}`);
  console.log(`\nTotal certificates: ${total}\n`);

  // ---- 1. Field coverage -------------------------------------------------
  console.log('--- FIELD COVERAGE ---');
  const present: Record<string, number> = {};
  for (const f of FIELDS) {
    const n = await col.countDocuments({ [f]: { $nin: [null, ''] } });
    present[f] = n;
    console.log(`  ${f.padEnd(21)} ${bar(n, total)} ${String(n).padStart(5)}/${total}  ${((n / total) * 100).toFixed(1)}%`);
  }

  // ---- 2. Shared values (field bleed) ------------------------------------
  console.log('\n--- SHARED VALUES: the same value on certificates for DIFFERENT companies ---');
  for (const f of ['vatNumber', 'certificateNumber', 'expiryDate'] as const) {
    const dupes = await col.aggregate([
      { $match: { [f]: { $nin: [null, ''] } } },
      { $group: { _id: `$${f}`, companies: { $addToSet: '$supplierName' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 }, 'companies.1': { $exists: true } } },
      { $project: { n: 1, companyCount: { $size: '$companies' } } },
      { $sort: { companyCount: -1 } },
    ]).toArray();
    const affected = dupes.reduce((s, d) => s + (d.n as number), 0);
    console.log(`\n  ${f}: ${dupes.length} value(s) shared across >1 company — ${affected} certificates affected`);
    for (const d of dupes.slice(0, 5)) {
      console.log(`     "${d._id}" → ${d.companyCount} different companies (${d.n} certs)`);
    }
  }

  // ---- 3. Identical field tuples -----------------------------------------
  console.log('\n--- IDENTICAL RESULT TUPLES (level+size+ownership+expiry) across different companies ---');
  const tuples = await col.aggregate([
    { $match: { bbbeeLevel: { $ne: null }, expiryDate: { $nin: [null, ''] } } },
    { $group: {
      _id: { l: '$bbbeeLevel', s: '$companySize', o: '$blackOwnership', e: '$expiryDate' },
      companies: { $addToSet: '$supplierName' }, n: { $sum: 1 },
    } },
    { $project: { n: 1, companyCount: { $size: '$companies' } } },
    { $match: { companyCount: { $gt: 1 } } },
    { $sort: { companyCount: -1 } },
  ]).toArray();
  const tupleAffected = tuples.reduce((s, t) => s + (t.n as number), 0);
  console.log(`  ${tuples.length} identical tuples covering ${tupleAffected} certificates`);
  for (const t of tuples.slice(0, 5)) {
    const k = t._id as Record<string, unknown>;
    console.log(`     L${k.l} / ${k.s} / ${k.o}% / exp ${k.e} → ${t.companyCount} companies`);
  }

  // ---- 4. Suspicious singletons ------------------------------------------
  console.log('\n--- SUSPICIOUS VALUES ---');
  const zeroOwn = await col.countDocuments({ blackOwnership: 0 });
  const expired = await col.countDocuments({ expiryDate: { $lt: new Date().toISOString().slice(0, 10) } });
  const noLevelButSize = await col.countDocuments({ bbbeeLevel: null, companySize: { $nin: [null, ''] } });
  console.log(`  blackOwnership exactly 0        ${zeroOwn}   (0% black-owned is legal but rare on a B-BBEE cert)`);
  console.log(`  expiryDate already in the past  ${expired}`);
  console.log(`  size known but level missing    ${noLevelButSize}`);

  // ---- 5. Extraction health ----------------------------------------------
  console.log('\n--- EXTRACTION / SOURCE HEALTH ---');
  for (const key of ['extractionStatus', 'extractionMode', 'enrichmentStatus']) {
    const rows = await col.aggregate([{ $group: { _id: `$${key}`, n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
    console.log(`  ${key}: ${rows.map((r) => `${r._id}=${r.n}`).join('  ')}`);
  }
  const emptyBlob = await col.countDocuments({ fileSize: { $in: [0, null] } });
  const review = await col.countDocuments({ enrichmentStatus: 'review_required' });
  console.log(`  zero-byte / unknown-size source files: ${emptyBlob}`);
  console.log(`  flagged review_required:              ${review}  (${((review / total) * 100).toFixed(1)}%)`);

  // ---- 6. Duplicate companies --------------------------------------------
  const dupCompanies = await col.aggregate([
    { $match: { supplierName: { $nin: [null, ''] } } },
    { $group: { _id: '$supplierName', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $count: 'c' },
  ]).toArray();
  console.log(`\n  company names appearing on >1 certificate: ${dupCompanies[0]?.c ?? 0} (renewals / multi-year — expected)`);

  await mongoose.disconnect();
  console.log(`\n${'='.repeat(72)}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
