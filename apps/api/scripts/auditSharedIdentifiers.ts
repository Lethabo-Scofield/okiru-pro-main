#!/usr/bin/env tsx
/**
 * Do different companies share an identifier that only ONE company can hold?
 *
 * READ-ONLY. It reports; it never nulls anything. That restraint is the whole
 * lesson of the August dry runs: the two rules originally proposed here would
 * have deleted 201 correct certificate numbers and nulled hundreds of correct
 * VATs, because the premise was wrong. Most "shared" values are one legal
 * entity trading under many names — Hudaco, Bidvest and Massmart each file
 * dozens of certificates under divisions that legitimately share a VAT.
 *
 * THE DISCRIMINATOR. A shared value is only a defect if the sharers are
 * different LEGAL ENTITIES, and the only field that settles that is the company
 * registration number (CIPC 'YYYY/NNNNNN/NN'), which Document Intelligence
 * populates and nothing else does:
 *
 *   same registration  -> one entity, many trading names   -> LEGITIMATE
 *   different registration -> two entities, one identifier -> BLEED (a defect)
 *   no registration on either -> UNCLASSIFIABLE            -> needs a human
 *
 * Luhn is deliberately NOT used to find bleed. A bled VAT is a real, valid
 * number belonging to somebody else, so it passes the checksum; measured on
 * this corpus, known-shared VATs failed the check LESS often (0.6%) than
 * unique ones (1.4%). Checksums stay a FORMAT guard, never a bleed test.
 *
 * Usage (from apps/api):
 *   MONGODB_URI=... npx tsx scripts/auditSharedIdentifiers.ts [--json out.json]
 */
import mongoose from 'mongoose';

type Doc = Record<string, any>;

const JSON_OUT = (() => {
  const i = process.argv.indexOf('--json');
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** Identifiers that belong to exactly one legal entity. */
const IDENTIFIERS = [
  { field: 'vatNumber', label: 'VAT number' },
  { field: 'certificateNumber', label: 'Certificate number' },
] as const;

/** Registration number from either writer — DI's field, or the regex one. */
function registration(d: Doc): string | null {
  const v = d.companyRegistrationNumber ?? d.registrationNumber;
  if (typeof v !== 'string') return null;
  const t = v.trim().toUpperCase().replace(/\s+/g, '');
  return t.length >= 8 ? t : null;
}

/**
 * Company names differ cosmetically far more often than they differ really.
 * Strip the legal-form suffixes and punctuation so "ACME (PTY) LTD." and
 * "Acme Pty Ltd" stop looking like two companies.
 */
function normName(d: Doc): string {
  const raw = String(d.supplierName ?? d.companyName ?? '').toUpperCase();
  return raw
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(PTY|PROPRIETARY|LTD|LIMITED|INC|CC|TRUST|GROUP|HOLDINGS|SA|T\/A)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toUpperCase().replace(/[\s\-\/]+/g, '');
  return t.length >= 5 ? t : null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const col = mongoose.connection.db!.collection('certificate_metadata');
  const docs = (await col.find({}, {
    projection: {
      _id: 0, id: 1, supplierName: 1, companyName: 1, fileName: 1,
      vatNumber: 1, certificateNumber: 1,
      companyRegistrationNumber: 1, registrationNumber: 1,
    },
  }).toArray()) as Doc[];

  console.log('='.repeat(74));
  console.log('SHARED IDENTIFIER AUDIT — can two companies hold the same unshareable value?');
  console.log('='.repeat(74));
  console.log(`  certificates            : ${docs.length}`);
  const withReg = docs.filter((d) => registration(d)).length;
  console.log(`  with registration number: ${withReg} (${((withReg / docs.length) * 100).toFixed(1)}%) — the discriminator`);

  const report: Record<string, unknown> = { certificates: docs.length, withRegistration: withReg };

  for (const { field, label } of IDENTIFIERS) {
    const groups = new Map<string, Doc[]>();
    for (const d of docs) {
      const v = normValue(d[field]);
      if (!v) continue;
      const g = groups.get(v) ?? [];
      g.push(d);
      groups.set(v, g);
    }

    const bleed: any[] = [];
    const oneEntity: any[] = [];
    const unclassifiable: any[] = [];

    for (const [value, members] of groups) {
      if (members.length < 2) continue;
      const names = new Set(members.map(normName));
      if (names.size < 2) continue;              // same company, several files

      const regs = new Set(members.map(registration).filter(Boolean) as string[]);
      const entry = {
        value,
        certificates: members.length,
        distinctNames: [...names],
        distinctRegistrations: [...regs],
        files: members.slice(0, 6).map((m) => m.fileName ?? m.id),
      };
      if (regs.size >= 2) bleed.push(entry);
      else if (regs.size === 1) oneEntity.push(entry);
      else unclassifiable.push(entry);
    }

    console.log(`\n--- ${label} ---`);
    console.log(`  values shared by >1 company name : ${bleed.length + oneEntity.length + unclassifiable.length}`);
    console.log(`  ONE legal entity (legitimate)    : ${oneEntity.length}  [${oneEntity.reduce((n, e) => n + e.certificates, 0)} certs]`);
    console.log(`  GENUINE BLEED (different entity) : ${bleed.length}  [${bleed.reduce((n, e) => n + e.certificates, 0)} certs]`);
    console.log(`  unclassifiable (no registration) : ${unclassifiable.length}  [${unclassifiable.reduce((n, e) => n + e.certificates, 0)} certs]`);

    if (bleed.length) {
      console.log(`\n  !! ${label} held by MORE THAN ONE legal entity — every one of these is a defect:`);
      for (const b of bleed.slice(0, 40)) {
        console.log(`     ${b.value}  regs=${b.distinctRegistrations.join(' | ')}`);
        console.log(`        names: ${b.distinctNames.slice(0, 4).join(' | ')}`);
        console.log(`        files: ${b.files.slice(0, 3).join(' | ')}`);
      }
      if (bleed.length > 40) console.log(`     …and ${bleed.length - 40} more`);
    }
    report[field] = { bleed, oneEntity: oneEntity.length, unclassifiable };
  }

  if (JSON_OUT) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
    console.log(`\nwrote ${JSON_OUT}`);
  }
  console.log('\nNothing was modified. Bleed rows need a human decision, not a rule.');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
