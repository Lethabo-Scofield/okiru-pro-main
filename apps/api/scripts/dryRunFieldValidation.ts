#!/usr/bin/env tsx
/**
 * DRY RUN: what would field validation reject, and is that the right call?
 *
 * Never writes. Exists to test the assumptions BEFORE enforcing them — chiefly
 * that SA VAT numbers carry a Luhn check digit. If real, human-entered VATs fail
 * that checksum in bulk then the assumption is wrong and enforcing it would null
 * thousands of good values.
 *
 * The decisive signal is the SPLIT: values we already know are wrong (a VAT
 * shared across several companies) should fail far more often than values that
 * appear exactly once. If both fail at the same rate, the checksum is measuring
 * nothing.
 */
import mongoose from 'mongoose';
import {
  isValidSaVatNumber,
  looksLikeAgencyReference,
  ownershipPairIsCoherent,
} from '../src/services/certificateFieldValidation.js';

function pctOf(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a';
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri);
  const col = mongoose.connection.db!.collection('certificate_metadata');

  const docs = await col.find({}, {
    projection: {
      _id: 0, supplierName: 1, vatNumber: 1, certificateNumber: 1,
      verificationAgency: 1, blackOwnership: 1, blackWomenOwnership: 1, bbbeeLevel: 1,
    },
  }).toArray() as Record<string, any>[];

  // Which VATs are held by more than one company? Those are known-bad.
  const companiesByVat = new Map<string, Set<string>>();
  for (const d of docs) {
    const v = String(d.vatNumber ?? '').trim();
    if (!v) continue;
    if (!companiesByVat.has(v)) companiesByVat.set(v, new Set());
    companiesByVat.get(v)!.add(String(d.supplierName ?? ''));
  }

  let uniqTotal = 0, uniqFail = 0, sharedTotal = 0, sharedFail = 0;
  for (const d of docs) {
    const v = String(d.vatNumber ?? '').trim();
    if (!v) continue;
    const shared = (companiesByVat.get(v)?.size ?? 0) > 1;
    const bad = !isValidSaVatNumber(v);
    if (shared) { sharedTotal += 1; if (bad) sharedFail += 1; }
    else { uniqTotal += 1; if (bad) uniqFail += 1; }
  }

  console.log(`\n${'='.repeat(70)}\nDRY RUN — FIELD VALIDATION\n${'='.repeat(70)}\n`);
  console.log('--- SA VAT checksum: is the Luhn assumption sound? ---');
  console.log(`  VATs held by ONE company only : ${uniqTotal}, would reject ${uniqFail} (${pctOf(uniqFail, uniqTotal)})`);
  console.log(`  VATs SHARED across companies  : ${sharedTotal}, would reject ${sharedFail} (${pctOf(sharedFail, sharedTotal)})`);
  console.log('  (a sound checksum rejects the shared ones much more often than the unique ones)');

  const certs = docs.filter((d) => String(d.certificateNumber ?? '').trim());
  const agencyRefs = certs.filter((d) => looksLikeAgencyReference(d.certificateNumber, d.verificationAgency));
  console.log('\n--- Certificate numbers that are really the agency\'s reference ---');
  console.log(`  ${agencyRefs.length} of ${certs.length} (${pctOf(agencyRefs.length, certs.length)}) would be rejected`);
  for (const d of agencyRefs.slice(0, 6)) console.log(`     "${d.certificateNumber}"`);

  const incoherent = docs.filter((d) => !ownershipPairIsCoherent(d.blackOwnership, d.blackWomenOwnership));
  const badLevel = docs.filter((d) => d.bbbeeLevel != null && !(Number.isInteger(d.bbbeeLevel) && d.bbbeeLevel >= 1 && d.bbbeeLevel <= 8));
  console.log('\n--- Other single-value checks ---');
  console.log(`  black women % exceeds black %  : ${incoherent.length}`);
  console.log(`  B-BBEE level outside 1..8      : ${badLevel.length}`);

  await mongoose.disconnect();
  console.log(`\n${'='.repeat(70)}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
