/**
 * Dry run: the supplier matcher against the REAL certificate corpus.
 *
 * The unit tests prove the matcher does what it was designed to do on cases we
 * chose. They cannot tell us whether the DESIGN survives 2,836 real South
 * African company names — where hundreds start "Sizwe", dozens are one word
 * apart, and the same company appears four times across renewals. That is what
 * this measures, before any of it goes near a client's scorecard.
 *
 * WHAT IT DOES
 *
 *   1. Builds a registry from the actual certificates on disk: the company name
 *      from the filename (the same `cleanNameFromBlobPath` the ingestion uses)
 *      and the real fields from each PDF's text layer via the repo's own
 *      `extractCertificateData`.
 *   2. Reports index health — how many records are matchable at all, and how
 *      many identifiers had to be discarded as shared.
 *   3. Round-trips every certificate: asks the matcher for the supplier by its
 *      own name and checks it gets that company back.
 *   4. Repeats the round trip through six kinds of noise a real procurement
 *      schedule actually contains (dropped suffix, case, "&"/"and", reordered
 *      words, a single typo, doubled spacing).
 *   5. Counts the only number that really matters: WRONG matches — a query
 *      answered with a DIFFERENT company's certificate.
 *
 * COSTS NOTHING AND WRITES NOTHING. Text comes from the local pdfjs text layer;
 * Azure Document Intelligence and the LLM preview path are both bypassed. No
 * database is touched — the index is built in memory from files.
 *
 *   npx tsx scripts/dryRunCertificateMatch.ts [--limit N] [--concurrency N]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { cleanNameFromBlobPath, extractCertificateData } from '../src/services/certificateExtractor.js';
import {
  buildMatchIndex,
  canonicalName,
  certificateToProcurementFields,
  matchSupplierInIndex,
  type MatchBasis,
} from '../src/services/certificateMatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = process.env.CERT_SOURCE_DIR
  ? path.resolve(process.env.CERT_SOURCE_DIR)
  : path.resolve(__dirname, '../../../docs/Certificates');

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const LIMIT = Number(arg('--limit') ?? '0') || 0;
const CONCURRENCY = Number(arg('--concurrency') ?? '8') || 8;
/**
 * Reading 2,836 PDF text layers takes minutes and the result never changes.
 * Cache it so the matching questions — which are the interesting ones — can be
 * re-asked in seconds.
 */
const CACHE = arg('--cache');

// ---------------------------------------------------------------------------
// Corpus → registry records
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.pdf$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function pdfText(file: string): Promise<string> {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const parts: string[] = [];
  // Three pages is plenty: every field we read sits on the certificate face.
  const pages = Math.min(doc.numPages, 3);
  for (let p = 1; p <= pages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // The item stream mixes text items with marked-content markers; only the
    // former carry a string.
    parts.push(
      content.items
        .map((i) => ('str' in i && typeof i.str === 'string' ? i.str : ''))
        .join(' '),
    );
  }
  await doc.destroy();
  return parts.join('\n');
}

/**
 * The registration-number reader.
 *
 * The enrichment job's own extractor is not exported, so this mirrors its
 * pattern. A dry run reading reg numbers slightly differently from production
 * would overstate or understate the identifier hit rate, so this is reported
 * separately from the fields that DO come from the real extractor.
 */
const REG_PATTERN = /\b(19|20)\d{2}\s*[/\-]\s*\d{6}\s*[/\-]\s*\d{2,3}\b/;
function readRegistrationNumber(text: string): string | null {
  const m = REG_PATTERN.exec(text);
  return m ? m[0].replace(/\s+/g, '') : null;
}

interface Loaded {
  file: string;
  nameFromFile: string | null;
  textLength: number;
  doc: Record<string, unknown>;
}

async function loadCorpus(files: string[]): Promise<Loaded[]> {
  const out: Loaded[] = [];
  let done = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= files.length) return;
      const file = files[i];
      const rel = path.relative(CORPUS, file).replace(/\\/g, '/');
      let text = '';
      try {
        text = await pdfText(file);
      } catch {
        text = ''; // scanned or damaged: exactly the filename-only case in prod
      }
      const fields = extractCertificateData(text, path.basename(file));
      const nameFromFile = cleanNameFromBlobPath(rel);

      out.push({
        file: rel,
        nameFromFile,
        textLength: text.length,
        doc: {
          id: `dry-${i}`,
          // Same precedence the ingestion uses: the filename is the curated
          // name, the text is the fallback.
          supplierName: nameFromFile ?? fields.supplierName,
          registrationNumber: readRegistrationNumber(text),
          vatNumber: fields.vatNumber,
          companySize: fields.companySize,
          bbbeeLevel: fields.bbbeeLevel,
          blackOwnership: fields.blackOwnership,
          blackWomenOwnership: fields.blackWomenOwnership,
          expiryDate: fields.expiryDate,
          issueDate: fields.issueDate,
          certificateNumber: fields.certificateNumber,
          verificationAgency: fields.verificationAgency,
          verified: false,
        },
      });

      done += 1;
      if (done % 200 === 0) process.stderr.write(`  …${done}/${files.length}\n`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

// ---------------------------------------------------------------------------
// Query perturbations — how a procurement schedule actually spells a supplier
// ---------------------------------------------------------------------------

const PERTURBATIONS: Array<{ label: string; apply: (name: string) => string | null }> = [
  { label: 'verbatim', apply: (n) => n },
  {
    label: 'suffix dropped',
    apply: (n) => {
      const s = n.replace(/\s*\(?(pty)?\)?\.?\s*(ltd|limited|cc|inc|npc)\.?\s*$/i, '').trim();
      return s && s !== n ? s : null;
    },
  },
  { label: 'UPPERCASED', apply: (n) => n.toUpperCase() },
  { label: '& vs and', apply: (n) => (/&/.test(n) ? n.replace(/&/g, 'and') : /\band\b/i.test(n) ? n.replace(/\band\b/i, '&') : null) },
  {
    label: 'words reordered',
    apply: (n) => {
      const w = n.trim().split(/\s+/);
      return w.length >= 2 ? `${w[w.length - 1]}, ${w.slice(0, -1).join(' ')}` : null;
    },
  },
  {
    label: 'single typo',
    apply: (n) => {
      // Transpose two letters in the longest word — the classic keying error.
      const w = n.split(/\s+/);
      let li = 0;
      w.forEach((x, i) => { if (x.length > w[li].length) li = i; });
      const t = w[li];
      if (t.length < 5) return null;
      const k = Math.floor(t.length / 2);
      w[li] = t.slice(0, k) + t[k + 1] + t[k] + t.slice(k + 2);
      return w.join(' ');
    },
  },
  { label: 'doubled spacing', apply: (n) => n.replace(/\s+/g, '  ') },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  if (!fs.existsSync(CORPUS)) {
    console.error(`Corpus not found: ${CORPUS}`);
    process.exit(1);
  }

  let files = walk(CORPUS).sort();
  if (LIMIT > 0) files = files.slice(0, LIMIT);
  console.log(`\n=== DRY RUN: supplier matcher vs the real certificate corpus ===`);
  console.log(`corpus     : ${CORPUS}`);
  console.log(`files      : ${files.length} PDFs`);
  console.log(`extraction : local pdfjs text layer + extractCertificateData (no DI, no LLM, no DB)\n`);

  const t0 = Date.now();
  let loaded: Loaded[];
  if (CACHE && fs.existsSync(CACHE)) {
    const raw = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as Loaded[];
    // Dates do not survive JSON; the matcher needs them back as Dates.
    for (const l of raw) {
      for (const k of ['expiryDate', 'issueDate'] as const) {
        if (l.doc[k]) l.doc[k] = new Date(l.doc[k] as string);
      }
    }
    loaded = raw;
    console.log(`(loaded ${loaded.length} records from cache ${CACHE})`);
  } else {
    loaded = await loadCorpus(files);
    if (CACHE) {
      fs.writeFileSync(CACHE, JSON.stringify(loaded));
      console.log(`(cached ${loaded.length} records to ${CACHE})`);
    }
  }
  const loadSecs = ((Date.now() - t0) / 1000).toFixed(1);

  // ---- 1. Source data quality -------------------------------------------
  const withText = loaded.filter((l) => l.textLength > 200).length;
  const withName = loaded.filter((l) => l.doc.supplierName).length;
  const withReg = loaded.filter((l) => l.doc.registrationNumber).length;
  const withVat = loaded.filter((l) => l.doc.vatNumber).length;
  const withLevel = loaded.filter((l) => l.doc.bbbeeLevel != null).length;
  const withExpiry = loaded.filter((l) => l.doc.expiryDate).length;
  const withOwn = loaded.filter((l) => l.doc.blackOwnership != null).length;

  console.log(`--- 1. What the corpus actually gives us (${loadSecs}s) ---`);
  console.log(`  readable text layer  ${withText}/${loaded.length}  ${pct(withText, loaded.length)}`);
  console.log(`  company name         ${withName}/${loaded.length}  ${pct(withName, loaded.length)}`);
  console.log(`  registration number  ${withReg}/${loaded.length}  ${pct(withReg, loaded.length)}`);
  console.log(`  VAT number           ${withVat}/${loaded.length}  ${pct(withVat, loaded.length)}`);
  console.log(`  B-BBEE level         ${withLevel}/${loaded.length}  ${pct(withLevel, loaded.length)}`);
  console.log(`  expiry date          ${withExpiry}/${loaded.length}  ${pct(withExpiry, loaded.length)}`);
  console.log(`  black ownership      ${withOwn}/${loaded.length}  ${pct(withOwn, loaded.length)}`);

  // ---- 2. Index health ---------------------------------------------------
  const index = buildMatchIndex(loaded.map((l) => l.doc));
  const entities = new Set(index.certificates.map((c) => c.entityKey));
  const dupNames = new Map<string, number>();
  for (const c of index.certificates) {
    if (c.canonical) dupNames.set(c.canonical, (dupNames.get(c.canonical) ?? 0) + 1);
  }
  const repeated = Array.from(dupNames.entries()).filter(([, n]) => n > 1);

  console.log(`\n--- 2. Index health ---`);
  console.log(`  matchable records    ${index.certificates.length}/${loaded.length}  ${pct(index.certificates.length, loaded.length)}`);
  console.log(`  distinct entities    ${entities.size}`);
  console.log(`  names seen >1x       ${repeated.length} (renewals + genuine namesakes)`);
  console.log(`  reg numbers dropped as shared  ${index.sharedRegistrations.size}`);
  console.log(`  VAT numbers dropped as shared  ${index.sharedVats.size}`);

  // ---- 3 & 4. Round trip, verbatim and through noise ---------------------
  console.log(`\n--- 3. Round trip: ask for each supplier by name ---`);
  console.log(`  ${'perturbation'.padEnd(18)} ${'correct'.padStart(8)} ${'wrong'.padStart(7)} ${'refused'.padStart(8)} ${'missed'.padStart(7)}`);

  const wrongExamples: Array<{ q: string; got: string; basis: MatchBasis; conf: number }> = [];
  const basisTally = new Map<string, number>();

  for (const p of PERTURBATIONS) {
    let correct = 0;
    let wrong = 0;
    let refused = 0;
    let missed = 0;
    let applicable = 0;

    for (const cert of index.certificates) {
      const query = p.apply(cert.companyName);
      if (!query || !canonicalName(query)) continue;
      applicable += 1;

      const r = matchSupplierInIndex({ key: 'q', name: query }, index, {
        asOf: new Date('2026-08-10'),
        includeAlternatives: false,
      });

      if (!r.match) {
        if (r.reason === 'ambiguous') refused += 1;
        else missed += 1;
        continue;
      }
      // Right ANSWER means the right company, not the same row: renewals of one
      // company are interchangeable for this purpose.
      if (r.match.companyName === cert.companyName || canonicalName(r.match.companyName) === cert.canonical) {
        correct += 1;
        if (p.label === 'verbatim') {
          basisTally.set(r.match.basis, (basisTally.get(r.match.basis) ?? 0) + 1);
        }
      } else {
        wrong += 1;
        if (wrongExamples.length < 25) {
          wrongExamples.push({
            q: query,
            got: r.match.companyName,
            basis: r.match.basis,
            conf: r.match.confidence,
          });
        }
      }
    }

    console.log(
      `  ${p.label.padEnd(18)} ${pct(correct, applicable).padStart(8)} ${pct(wrong, applicable).padStart(7)} ` +
        `${pct(refused, applicable).padStart(8)} ${pct(missed, applicable).padStart(7)}   (n=${applicable})`,
    );
  }

  console.log(`\n  match basis on verbatim queries:`);
  for (const [b, n] of Array.from(basisTally.entries()).sort((a, b2) => b2[1] - a[1])) {
    console.log(`    ${b.padEnd(16)} ${n}`);
  }

  // ---- 5. Wrong matches: the number that matters -------------------------
  console.log(`\n--- 4. WRONG matches (a different company's certificate) ---`);
  if (wrongExamples.length === 0) {
    console.log(`  none across every perturbation.`);
  } else {
    console.log(`  ${wrongExamples.length}${wrongExamples.length >= 25 ? '+ (capped)' : ''} — each one would put someone else's B-BBEE level on a supplier:`);
    for (const w of wrongExamples) {
      console.log(`    "${w.q}"\n      → "${w.got}"  [${w.basis} ${w.conf}]`);
    }
  }

  // ---- 5b. Decoys: suppliers we do NOT hold a certificate for ------------
  //
  // The round trip only proves the matcher finds what is there. The opposite
  // risk is worse: a supplier with no certificate on file being handed the
  // nearest-looking one. These queries are built from real corpus names with a
  // distinctive word replaced, so they sit in exactly the neighbourhood where a
  // loose matcher fails — and every one of them SHOULD come back empty.
  const decoyWords = ['Zenith', 'Marlow', 'Quintus', 'Halberd', 'Vervain', 'Okapi'];
  let decoyRefused = 0;
  let decoyMatched = 0;
  const decoyHits: Array<{ q: string; got: string; basis: MatchBasis; conf: number }> = [];

  index.certificates.forEach((cert, i) => {
    const words = cert.companyName.split(/\s+/);
    if (words.length < 2) return;
    // Replace the longest (most distinctive) word with a word no SA company here uses.
    let li = 0;
    words.forEach((w, k) => { if (w.length > words[li].length) li = k; });
    if (words[li].length < 5) return;
    words[li] = decoyWords[i % decoyWords.length];
    const query = words.join(' ');
    if (index.byCanonical.has(canonicalName(query))) return; // accidentally real

    const r = matchSupplierInIndex({ key: 'd', name: query }, index, {
      asOf: new Date('2026-08-10'),
      includeAlternatives: false,
    });
    if (r.match) {
      decoyMatched += 1;
      if (decoyHits.length < 15) {
        decoyHits.push({ q: query, got: r.match.companyName, basis: r.match.basis, conf: r.match.confidence });
      }
    } else {
      decoyRefused += 1;
    }
  });

  const decoyTotal = decoyRefused + decoyMatched;
  console.log(`\n--- 4b. Decoys: suppliers with no certificate on file ---`);
  console.log(`  correctly refused    ${decoyRefused}/${decoyTotal}  ${pct(decoyRefused, decoyTotal)}`);
  console.log(`  falsely matched      ${decoyMatched}/${decoyTotal}  ${pct(decoyMatched, decoyTotal)}`);
  for (const d of decoyHits) {
    console.log(`    "${d.q}"\n      → "${d.got}"  [${d.basis} ${d.conf}]`);
  }

  // ---- 6. What would actually get filled ---------------------------------
  const ASOF = new Date('2026-08-10');
  let fillable = 0;
  let scoringWithheld = 0;
  const colTally = new Map<string, number>();
  for (const cert of index.certificates) {
    const f = certificateToProcurementFields(cert);
    const keys = Object.keys(f);
    if (keys.length > 0) fillable += 1;
    for (const k of keys) colTally.set(k, (colTally.get(k) ?? 0) + 1);
    const valid = cert.expiryDate ? cert.expiryDate.getTime() >= ASOF.getTime() : false;
    if (!valid) scoringWithheld += 1;
  }

  console.log(`\n--- 5. What a match would actually fill (as of ${ASOF.toISOString().slice(0, 10)}) ---`);
  console.log(`  certificates offering ≥1 field   ${fillable}/${index.certificates.length}  ${pct(fillable, index.certificates.length)}`);
  console.log(`  scoring columns withheld (not valid at date)  ${scoringWithheld}  ${pct(scoringWithheld, index.certificates.length)}`);
  console.log(`  per column:`);
  for (const [c, n] of Array.from(colTally.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${c.padEnd(28)} ${String(n).padStart(5)}  ${pct(n, index.certificates.length)}`);
  }

  // ---- 7. Real client supplier names -------------------------------------
  //
  // Straight from the Thandanani procurement pack in docs/Test Data — spelled
  // the way the client's own schedule spells them, abbreviations and all. Most
  // will not be in this corpus, and that is the realistic case: the honest
  // answer for a supplier we hold nothing for is "no match", and a matcher that
  // returns something anyway is worse than useless.
  const realNames = [
    'BP Edenvale',
    'Outsurance',
    'FUTURASA',
    'Subbiah Enterprises',
    'TST Truc Chassis',
    'Ekurhuleni Municipality',
  ];
  console.log(`\n--- 6. Real supplier names from a client's procurement pack ---`);
  for (const name of realNames) {
    const r = matchSupplierInIndex({ key: 'real', name }, index, {
      asOf: new Date('2026-08-10'),
      includeAlternatives: false,
    });
    if (r.match) {
      const filled = Object.keys(r.match.fields).length;
      console.log(
        `  ${name.padEnd(26)} → "${r.match.companyName}" [${r.match.basis} ${r.match.confidence}] ` +
          `${filled} field(s)${r.match.validAtAsOf ? '' : ', NOT valid at date'}`,
      );
    } else {
      console.log(`  ${name.padEnd(26)} → no match (${r.reason}${r.ambiguousWith ? ': ' + r.ambiguousWith.join(' / ') : ''})`);
    }
  }

  console.log(`\n=== end of dry run — nothing was written ===\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
