/**
 * Direct certificate ingest script — runs inside the API pod.
 * Uses CJS require for modules available in /app/apps/api/node_modules.
 * Usage: node /tmp/ingestCertificatesDirect.cjs [--force]
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const NODE_MODULES = '/app/apps/api/node_modules';

// ── Load dependencies ──────────────────────────────────────────────────────
const mongoose = require(path.join(NODE_MODULES, 'mongoose'));
const { BlobServiceClient } = require(path.join(NODE_MODULES, '@azure/storage-blob'));

const CONTAINER_NAME = 'clients-certs';
const TMP_DIR = path.join(os.tmpdir(), 'cert-ingest-direct');
const FORCE = process.argv.includes('--force');

// ── MongoDB schema (mirrors models.ts) ────────────────────────────────────
const certSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  blobName: { type: String, required: true, unique: true },
  fileName: String,
  supplierName: String,
  vatNumber: String,
  vatNumberNormalized: String,
  companySize: String,
  blackOwnership: Number,
  blackWomenOwnership: Number,
  bbbeeLevel: Number,
  bbbeeScore: Number,
  verificationAgency: String,
  certificateNumber: String,
  expiryDate: Date,
  issueDate: Date,
  status: { type: String, default: 'unknown' },
  extractionStatus: { type: String, default: 'pending' },
  extractionError: String,
  extractedText: String,
  verified: { type: Boolean, default: false },
  uploadedByUserId: String,
  createdAt: Date,
  updatedAt: Date,
}, { timestamps: true });

let CertModel;
try {
  CertModel = mongoose.model('CertificateMetadata');
} catch {
  CertModel = mongoose.model('CertificateMetadata', certSchema, 'certificate_metadata');
}

// ── Extraction helpers ─────────────────────────────────────────────────────
const MONTH_NAMES = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDate(s) {
  if (!s) return null;
  const c = s.replace(/[,]/g, '').trim();
  let m;
  m = /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/i.exec(c);
  if (m && MONTH_NAMES[m[2].toLowerCase()] !== undefined) return new Date(+m[3], MONTH_NAMES[m[2].toLowerCase()], +m[1]);
  m = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\s+(\d{4})/i.exec(c);
  if (m && MONTH_NAMES[m[1].toLowerCase()] !== undefined) return new Date(+m[3], MONTH_NAMES[m[1].toLowerCase()], +m[2]);
  m = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(c);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(c);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

function extractData(text, fileName) {
  const n = (text || '').replace(/\s+/g, ' ');

  // Expiry date
  let expiryDate = null;
  for (const pat of [
    /valid(?:ity)?\s+(?:until|to|through|date)[:\s]+([^\n]{4,35})/i,
    /expir(?:y|ation|es?|ed?)\s+(?:date|on)?[:\s]+([^\n]{4,35})/i,
    /certificate\s+expir(?:y|ation|es?)\s*[:\s]+([^\n]{4,35})/i,
    /date\s+of\s+expir[yi][^\n]{0,10}[:\s]+([^\n]{4,35})/i,
    /valid\s+until[:\s]+([^\n]{4,35})/i,
  ]) {
    const m = pat.exec(n);
    if (m) { const d = parseDate(m[1]); if (d && !isNaN(d.getTime())) { expiryDate = d; break; } }
  }

  // Issue date
  let issueDate = null;
  for (const pat of [
    /issue\s*date[:\s]+([^\n]{4,35})/i,
    /date\s+of\s+issue[:\s]+([^\n]{4,35})/i,
    /issue[d]?\s+on[:\s]+([^\n]{4,35})/i,
  ]) {
    const m = pat.exec(n);
    if (m) { const d = parseDate(m[1]); if (d && !isNaN(d.getTime())) { issueDate = d; break; } }
  }

  // BEE Level
  let bbbeeLevel = null;
  for (const pat of [
    /b-?bbee\s+(?:status\s+)?level\s*[:\s]+(\d+)/i,
    /bee\s+level\s*[:\s]+(\d+)/i,
    /contributor\s+level\s*[:\s]+(\d+)/i,
    /level\s*[:\s]+(\d+)\s*contributor/i,
    /level\s*(\d+)\s*b-?bbee/i,
  ]) {
    const m = pat.exec(n);
    if (m) { const l = parseInt(m[1]); if (l >= 1 && l <= 8) { bbbeeLevel = l; break; } }
  }

  // Supplier name
  let supplierName = null;
  for (const pat of [
    /(?:entity|company|supplier|trading\s+as|measured\s+entity|client)[:\s]+([A-Z][^\n]{3,80})/i,
    /name\s+of\s+(?:entity|company|supplier)[:\s]+([A-Z][^\n]{3,80})/i,
  ]) {
    const m = pat.exec(n);
    if (m) { supplierName = m[1].trim().replace(/\s+/g, ' ').slice(0, 120); break; }
  }

  // VAT number
  let vatNumber = null;
  const vatM = /(?:vat|tax)\s*(?:registration)?\s*(?:number|no\.?|#)[:\s]+([0-9A-Z][-0-9A-Z ]{3,20})/i.exec(n);
  if (vatM) vatNumber = vatM[1].trim().replace(/\s+/g, '');

  // Company size
  let companySize = null;
  if (/\bLarge\s+Enterprise\b/i.test(n)) companySize = 'Large Enterprise';
  else if (/\bGeneric\s+Enterprise\b/i.test(n)) companySize = 'Generic Enterprise';
  else if (/\bQualifying\s+Small(?:\s+Enterprise)?\b/i.test(n) || /(?:^|[^\w])QSE(?:[^\w]|$)/.test(n)) companySize = 'QSE';
  else if (/\bExempt\s+Micro(?:\s+Enterprise)?\b/i.test(n) || /(?:^|[^\w])EME(?:[^\w]|$)/.test(n)) companySize = 'EME';

  if (!companySize) {
    const base = (fileName || '').replace(/\.[^/.]+$/, '');
    const sfm = /\s*-\s*(EME|QSE|Generic|Large)\b/i.exec(base);
    if (sfm) {
      const u = sfm[1].toUpperCase();
      if (u === 'EME') companySize = 'EME';
      else if (u === 'QSE') companySize = 'QSE';
      else if (u === 'GENERIC') companySize = 'Generic Enterprise';
      else if (u === 'LARGE') companySize = 'Large Enterprise';
    }
  }

  // Black ownership %
  let blackOwnership = null;
  const boM = /black\s+(?:owned?|ownership)[:\s%]+([\d]+(?:[.,]\d+)?)\s*%?/i.exec(n);
  if (boM) { const v = parseFloat(boM[1].replace(',', '.')); if (v >= 0 && v <= 100) blackOwnership = v; }

  // Black women ownership %
  let blackWomenOwnership = null;
  const bwoM = /black\s+women(?:'?s)?\s+(?:owned?|ownership)[:\s%]+([\d]+(?:[.,]\d+)?)\s*%?/i.exec(n);
  if (bwoM) { const v = parseFloat(bwoM[1].replace(',', '.')); if (v >= 0 && v <= 100) blackWomenOwnership = v; }

  // BEE Score
  let bbbeeScore = null;
  const scoreM = /(?:total|overall)\s+(?:score|points?)[:\s]+([\d]+(?:[.,]\d+)?)/i.exec(n);
  if (scoreM) { const v = parseFloat(scoreM[1].replace(',', '.')); if (v >= 0 && v <= 200) bbbeeScore = v; }

  // Verification agency
  let verificationAgency = null;
  const agencyM = /(?:verification\s+agency|verifier|verified\s+by|issuing\s+body)[:\s]+([A-Z][^\n]{3,80})/i.exec(n);
  if (agencyM) verificationAgency = agencyM[1].trim().replace(/\s+/g, ' ').slice(0, 120);

  // Certificate number
  let certificateNumber = null;
  const certNoM = /(?:certificate|cert\.?)\s*(?:number|no\.?|#)[:\s]+([A-Z0-9][-A-Z0-9\/]{2,30})/i.exec(n);
  if (certNoM) certificateNumber = certNoM[1].trim();

  return { expiryDate, issueDate, bbbeeLevel, supplierName, vatNumber, companySize,
    blackOwnership, blackWomenOwnership, bbbeeScore, verificationAgency, certificateNumber };
}

function statusFromExpiry(d) {
  if (!d) return 'unknown';
  const now = Date.now();
  const t = new Date(d).getTime();
  if (isNaN(t)) return 'unknown';
  if (t < now) return 'expired';
  if (t <= now + 60 * 86400_000) return 'expiring';
  return 'valid';
}

function normalizeVat(v) {
  if (!v) return null;
  return v.replace(/[\s\-\/]/g, '').toUpperCase();
}

function deriveCompanyName(fileName) {
  const base = (fileName || '').split('/').pop() || fileName;
  return base.replace(/\.[a-z0-9]+$/i, '')
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
    .replace(/^\d{4}[\s_\-]+\d{1,2}[\s_\-]+\d{1,2}[\s_\-]+/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\b(EME|QSE|Generic|Large|Specialised|Specialized)\b.*$/i, '')
    .replace(/\s*B[\s-]?BBEE.*$/i, '')
    .replace(/\s*Certificate.*$/i, '')
    .replace(/[\s_\-–—]+$/u, '')
    .trim() || 'Unknown company';
}

// ── PDF text extraction using pdfjs-dist ─────────────────────────────────
async function extractPdfText(buffer) {
  try {
    const pdfjsLib = await import('/app/apps/api/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    const uint8 = new Uint8Array(buffer);
    const doc = await pdfjsLib.getDocument({ data: uint8, verbosity: 0 }).promise;
    const parts = [];
    for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map(it => it.str || '').join(' '));
    }
    return parts.join('\n');
  } catch (err) {
    return '';
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Direct Certificate Ingest ===');
  console.log(`Force mode: ${FORCE}`);

  const mongoUri = process.env.MONGODB_URI;
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!mongoUri) { console.error('MONGODB_URI not set'); process.exit(1); }
  if (!connStr) { console.error('AZURE_STORAGE_CONNECTION_STRING not set'); process.exit(1); }

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('Connected.\n');

  console.log('Connecting to Azure Blob Storage...');
  const blobSvc = BlobServiceClient.fromConnectionString(connStr);
  const container = blobSvc.getContainerClient(CONTAINER_NAME);
  console.log('Connected.\n');

  // Load existing blobNames from MongoDB to skip already-processed
  const existing = new Set();
  if (!FORCE) {
    const docs = await CertModel.find({ extractionStatus: 'completed' }, { blobName: 1 }).lean();
    for (const d of docs) existing.add(d.blobName);
    console.log(`Skipping ${existing.size} already-processed blobs.\n`);
  }

  const blobs = [];
  for await (const blob of container.listBlobsFlat()) {
    if (blob.name.endsWith('.pdf') || blob.name.endsWith('.PDF')) {
      blobs.push(blob.name);
    }
  }
  console.log(`Found ${blobs.length} PDF blobs in container.\n`);

  let processed = 0, skipped = 0, errors = 0;

  for (let i = 0; i < blobs.length; i++) {
    const blobName = blobs[i];
    const fileName = blobName.split('/').pop() || blobName;

    if (!FORCE && existing.has(blobName)) {
      skipped++;
      continue;
    }

    try {
      const blobClient = container.getBlobClient(blobName);
      const downloadResp = await blobClient.download(0);
      const chunks = [];
      for await (const chunk of downloadResp.readableStreamBody) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      const text = await extractPdfText(buffer);
      const extracted = extractData(text, fileName);

      const id = crypto.randomUUID();
      const vatNorm = normalizeVat(extracted.vatNumber);
      const supplierName = extracted.supplierName || deriveCompanyName(fileName);

      await CertModel.findOneAndUpdate(
        { blobName },
        {
          $setOnInsert: { id, createdAt: new Date() },
          $set: {
            blobName,
            fileName,
            supplierName,
            vatNumber: extracted.vatNumber || null,
            vatNumberNormalized: vatNorm,
            companySize: extracted.companySize,
            blackOwnership: extracted.blackOwnership,
            blackWomenOwnership: extracted.blackWomenOwnership,
            bbbeeLevel: extracted.bbbeeLevel,
            bbbeeScore: extracted.bbbeeScore,
            verificationAgency: extracted.verificationAgency,
            certificateNumber: extracted.certificateNumber,
            expiryDate: extracted.expiryDate,
            issueDate: extracted.issueDate,
            status: statusFromExpiry(extracted.expiryDate),
            extractionStatus: 'completed',
            extractionError: null,
            extractedText: text.slice(0, 20000),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      processed++;
      if (processed % 20 === 0 || processed === blobs.length - skipped) {
        const pct = Math.round(((processed + skipped) / blobs.length) * 100);
        console.log(`  ${pct}% (${processed + skipped}/${blobs.length}) — processed: ${processed}, errors: ${errors}`);
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR ${blobName}: ${err.message}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Errors:    ${errors}`);
  console.log(`Total:     ${blobs.length}`);

  await mongoose.disconnect();
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
