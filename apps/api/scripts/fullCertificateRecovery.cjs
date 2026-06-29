#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const API_BASE_URL = process.env.CERT_RECOVERY_API_BASE_URL || 'http://127.0.0.1:3000';
const API_KEY = process.env.API_INTERNAL_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;
const COLLECTION = process.env.CERTIFICATE_METADATA_COLLECTION || 'certificate_metadata';
const REPORT_DIR = process.env.CERT_RECOVERY_REPORT_DIR || path.resolve(__dirname, '..', 'recovery-reports');
const OCR_BATCH_SIZE = 10;
const OCR_CHECKPOINT_EVERY = 20;
const ENRICHMENT_BATCH_SIZE = 100;
const MAX_API_FAILURES = 3;
const MAX_MEMORY_BYTES = Number(process.env.CERT_RECOVERY_MAX_MEMORY_BYTES || 1_500_000_000);
const MIN_TEXT_LENGTH = Number(process.env.CERT_EXTRACTION_MIN_TEXT_LENGTH || 50);
const DEFAULT_API_TIMEOUT_MS = Number(process.env.CERT_RECOVERY_API_TIMEOUT_MS || 5 * 60 * 1000);
const COVERAGE_API_TIMEOUT_MS = Number(process.env.CERT_RECOVERY_COVERAGE_TIMEOUT_MS || 30 * 1000);

const TARGET_FIELDS = [
  'certificateNumber',
  'verificationAgency',
  'expiryDate',
  'bbbeeLevel',
  'blackOwnership',
  'blackWomenOwnership',
  'vatNumber',
  'companySize',
  'sectorCode',
  'sectorName',
];

const PROTECTED_FIELDS = ['bbbeeScore', 'scorecardId', 'calculatorPayload', 'annualSpend'];

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const runId = nowStamp();
const runDir = path.join(REPORT_DIR, `full-certificate-recovery-${runId}`);
fs.mkdirSync(runDir, { recursive: true });

function reportPath(name) {
  return path.join(runDir, name);
}

function writeJson(name, data) {
  fs.writeFileSync(reportPath(name), JSON.stringify(data, null, 2));
}

function log(message, meta = undefined) {
  const line = meta === undefined
    ? `[${new Date().toISOString()}] ${message}`
    : `[${new Date().toISOString()}] ${message} ${JSON.stringify(meta)}`;
  console.log(line);
  fs.appendFileSync(reportPath('run.log'), `${line}\n`);
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

async function apiJson(pathname, options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_API_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    const res = await fetch(`${API_BASE_URL}${pathname}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${pathname}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`API timeout after ${timeoutMs}ms ${pathname}`);
      timeoutErr.code = 'API_TIMEOUT';
      timeoutErr.timeoutMs = timeoutMs;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getCoverage() {
  return apiJson('/api/certificates/extraction-coverage', { timeoutMs: COVERAGE_API_TIMEOUT_MS });
}

function fieldCountsFromDocs(docs) {
  return {
    certificateNumber: docs.filter((d) => hasValue(d.certificateNumber)).length,
    agency: docs.filter((d) => hasValue(d.verificationAgency)).length,
    expiryDate: docs.filter((d) => hasValue(d.expiryDate)).length,
    bbbeeLevel: docs.filter((d) => hasValue(d.bbbeeLevel)).length,
    blackOwnership: docs.filter((d) => hasValue(d.blackOwnership)).length,
    blackWomenOwnership: docs.filter((d) => hasValue(d.blackWomenOwnership)).length,
    vat: docs.filter((d) => hasValue(d.vatNumber)).length,
    companySize: docs.filter((d) => hasValue(d.companySize)).length,
    sectorCode: docs.filter((d) => hasValue(d.sectorCode)).length,
    sectorName: docs.filter((d) => hasValue(d.sectorName)).length,
  };
}

function totalFieldCount(fields) {
  return Object.values(fields).reduce((sum, value) => sum + Number(value || 0), 0);
}

function protectedHash(docs) {
  const rows = docs
    .map((d) => ({
      id: String(d._id),
      blobName: d.blobName,
      bbbeeScore: d.bbbeeScore,
      scorecardId: d.scorecardId,
      calculatorPayload: d.calculatorPayload,
      annualSpend: d.annualSpend,
    }))
    .sort((a, b) => String(a.blobName || '').localeCompare(String(b.blobName || '')));
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function readMongoSnapshot(collection) {
  const docs = await collection.find({}).project({
    blobName: 1,
    fileName: 1,
    certificateNumber: 1,
    verificationAgency: 1,
    expiryDate: 1,
    bbbeeLevel: 1,
    blackOwnership: 1,
    blackWomenOwnership: 1,
    vatNumber: 1,
    companySize: 1,
    sectorCode: 1,
    sectorName: 1,
    extractionStatus: 1,
    extractionMode: 1,
    extractionError: 1,
    extractedTextLength: 1,
    bbbeeScore: 1,
    scorecardId: 1,
    calculatorPayload: 1,
    annualSpend: 1,
    reviewFields: 1,
    enrichmentStatus: 1,
    auditLog: { $slice: -10 },
  }).toArray();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const protectedAuditHits = [];
  for (const doc of docs) {
    for (const entry of doc.auditLog || []) {
      if (entry?.at && new Date(entry.at).getTime() < cutoff) continue;
      const hits = (entry?.updatedFields || []).filter((field) => PROTECTED_FIELDS.includes(field));
      if (hits.length > 0) {
        protectedAuditHits.push({ blobName: doc.blobName || doc.fileName, at: entry.at, fields: hits });
      }
    }
  }
  return {
    total: docs.length,
    fields: fieldCountsFromDocs(docs),
    protectedCounts: Object.fromEntries(PROTECTED_FIELDS.map((field) => [
      field,
      docs.filter((doc) => hasValue(doc[field])).length,
    ])),
    protectedHash: protectedHash(docs),
    protectedAuditHits,
    failedOrTimedOutFiles: docs
      .filter((doc) => doc.extractionStatus === 'failed' || /timeout|timed out|aborted/i.test(String(doc.extractionError || '')))
      .map((doc) => ({
        blobName: doc.blobName || doc.fileName,
        extractionStatus: doc.extractionStatus,
        extractionMode: doc.extractionMode,
        extractedTextLength: doc.extractedTextLength || 0,
        extractionError: doc.extractionError || null,
      }))
      .sort((a, b) => String(a.blobName || '').localeCompare(String(b.blobName || ''))),
    manualReviewCount: docs.filter((doc) => doc.enrichmentStatus === 'review_required' || (doc.reviewFields || []).length > 0).length,
    usableTextRecords: docs.filter((doc) => doc.extractionStatus === 'completed' && Number(doc.extractedTextLength || 0) >= MIN_TEXT_LENGTH).length,
  };
}

function assertSafety({ baselineProtectedHash, snapshot, memoryUsage, context }) {
  if (snapshot.protectedHash !== baselineProtectedHash) {
    throw new Error(`${context}: protected-field hash changed`);
  }
  if (snapshot.protectedAuditHits.length > 0) {
    throw new Error(`${context}: protected fields were touched in audit log`);
  }
  const forbiddenCounts = ['calculatorPayload', 'scorecardId', 'annualSpend'];
  for (const field of forbiddenCounts) {
    if (snapshot.protectedCounts[field] > 0) {
      throw new Error(`${context}: ${field} count is ${snapshot.protectedCounts[field]}`);
    }
  }
  if (memoryUsage.rss > MAX_MEMORY_BYTES) {
    throw new Error(`${context}: memory RSS ${memoryUsage.rss} exceeds ${MAX_MEMORY_BYTES}`);
  }
}

async function retryWithApiCrashGuard(fn, label) {
  let failures = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      failures += 1;
      log(`${label} failed`, { failures, error: err.message, status: err.status, body: err.body });
      if (failures >= MAX_API_FAILURES) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ocrDeltaFromCoverage(beforeCoverage, afterCoverage) {
  const beforeNone = Number(beforeCoverage.byExtractionMode?.none || 0);
  const afterNone = Number(afterCoverage.byExtractionMode?.none || 0);
  return {
    retried: Math.max(0, beforeNone - afterNone),
    updated: Math.max(0, beforeNone - afterNone),
    completed: Math.max(0, Number(afterCoverage.usableExtractedText || 0) - Number(beforeCoverage.usableExtractedText || 0)),
    textTooShort: Math.max(0, Number(afterCoverage.textTooShort || 0) - Number(beforeCoverage.textTooShort || 0)),
    failed: Math.max(0, Number(afterCoverage.failed || 0) - Number(beforeCoverage.failed || 0)),
    timedOut: 0,
  };
}

async function waitForDetachedOcrProgress(beforeCoverage, label) {
  const maxWaitMs = Number(process.env.CERT_RECOVERY_DETACHED_WAIT_MS || 20 * 60 * 1000);
  const pollMs = Number(process.env.CERT_RECOVERY_DETACHED_POLL_MS || 30 * 1000);
  const stableMs = Number(process.env.CERT_RECOVERY_DETACHED_STABLE_MS || 120 * 1000);
  const startedAt = Date.now();
  let latestCoverage = beforeCoverage;
  let latestNone = Number(beforeCoverage.byExtractionMode?.none || 0);
  let lastChangeAt = Date.now();
  let sawProgress = false;
  let coverageFailures = 0;

  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(pollMs);
    let coverage;
    try {
      coverage = await getCoverage();
      coverageFailures = 0;
    } catch (err) {
      coverageFailures += 1;
      log(`${label}: detached OCR coverage check failed`, {
        failures: coverageFailures,
        error: err.message,
      });
      if (coverageFailures >= MAX_API_FAILURES) throw err;
      continue;
    }
    const currentNone = Number(coverage.byExtractionMode?.none || 0);
    if (currentNone !== latestNone) {
      sawProgress = true;
      latestNone = currentNone;
      latestCoverage = coverage;
      lastChangeAt = Date.now();
      log(`${label}: detached OCR progress observed`, {
        remainingModeNone: currentNone,
        usableText: coverage.usableExtractedText,
        textTooShort: coverage.textTooShort,
        failed: coverage.failed,
      });
    } else {
      latestCoverage = coverage;
    }

    const retried = Number(beforeCoverage.byExtractionMode?.none || 0) - currentNone;
    if (retried >= OCR_BATCH_SIZE) {
      return { coverage: latestCoverage, result: ocrDeltaFromCoverage(beforeCoverage, latestCoverage) };
    }
    if (sawProgress && Date.now() - lastChangeAt >= stableMs) {
      return { coverage: latestCoverage, result: ocrDeltaFromCoverage(beforeCoverage, latestCoverage) };
    }
  }

  return sawProgress
    ? { coverage: latestCoverage, result: ocrDeltaFromCoverage(beforeCoverage, latestCoverage) }
    : null;
}

async function runOcrBatchRequest(batch, coverageBefore) {
  let failures = 0;
  let baselineCoverage = coverageBefore;
  for (;;) {
    try {
      const result = await apiJson('/api/certificates/retry-extraction', {
        method: 'POST',
        body: JSON.stringify({
          limit: OCR_BATCH_SIZE,
          dryRun: false,
          modes: ['none'],
          onlyMissingText: true,
        }),
      });
      return { result, detached: false };
    } catch (err) {
      failures += 1;
      log(`OCR batch ${batch} request failed`, { failures, error: err.message, status: err.status, body: err.body });
      if (err.status >= 500 || /ECONNRESET|Mongo|Mongoose|disconnected/i.test(`${err.message} ${JSON.stringify(err.body || {})}`)) {
        throw new Error(`OCR batch ${batch}: unsafe API/database failure (${err.message})`);
      }
      const detached = await waitForDetachedOcrProgress(baselineCoverage, `OCR batch ${batch}`);
      if (detached && detached.result.retried > 0) {
        log(`OCR batch ${batch}: using detached server-side progress after lost response`, detached.result);
        return { result: detached.result, detached: true, detachedCoverage: detached.coverage };
      }
      if (failures >= MAX_API_FAILURES) throw err;
      baselineCoverage = await getCoverage();
      await sleep(5000);
    }
  }
}

async function runOcrLoop(collection, baselineProtectedHash, initialCoverage) {
  const batches = [];
  let coverage = initialCoverage;
  let batch = 0;

  while (Number(coverage.byExtractionMode?.none || 0) > 0) {
    batch += 1;
    const startedAt = Date.now();
    const beforeBatchCoverage = coverage;
    const batchResponse = await runOcrBatchRequest(batch, beforeBatchCoverage);
    const result = batchResponse.result;
    coverage = batchResponse.detachedCoverage || await getCoverage();
    const memoryUsage = process.memoryUsage();
    const row = {
      batch,
      durationMs: Date.now() - startedAt,
      detached: batchResponse.detached,
      retried: result.retried,
      updated: result.updated,
      completed: result.completed,
      textTooShort: result.textTooShort,
      failed: result.failed,
      timedOut: result.timedOut,
      usableText: coverage.usableExtractedText,
      remainingModeNone: coverage.byExtractionMode?.none || 0,
      totalTextTooShort: coverage.textTooShort,
      totalFailed: coverage.failed,
      memoryRss: memoryUsage.rss,
    };
    batches.push(row);
    log('OCR batch complete', row);
    writeJson('ocr-progress.json', { batches, latestCoverage: coverage });

    if (result.failed >= 3 || result.timedOut >= 2) {
      throw new Error(`OCR batch ${batch}: failure/timeout spike`);
    }
    if (result.retried === 0 || result.matched === 0) {
      log('OCR loop stopping: no retryable records returned by endpoint');
      break;
    }

    if (batch % OCR_CHECKPOINT_EVERY === 0) {
      const snapshot = await readMongoSnapshot(collection);
      assertSafety({ baselineProtectedHash, snapshot, memoryUsage, context: `OCR checkpoint ${batch}` });
      writeJson(`checkpoint-ocr-${batch}.json`, { coverage, snapshot, memoryUsage, batches });
      writeJson('manual-inspection-files.json', snapshot.failedOrTimedOutFiles);
      log('OCR safety checkpoint passed', {
        batch,
        usableText: coverage.usableExtractedText,
        remainingModeNone: coverage.byExtractionMode?.none || 0,
        textTooShort: coverage.textTooShort,
        failed: coverage.failed,
        failedOrTimedOutFiles: snapshot.failedOrTimedOutFiles.length,
        protectedHash: snapshot.protectedHash,
      });
    }
  }

  return { batches, coverage };
}

async function runEnrichmentLoop(collection, baselineProtectedHash, beforeFields) {
  const batches = [];
  let previousTotal = totalFieldCount(beforeFields);
  let noProgressBatches = 0;

  for (let batch = 1; ; batch += 1) {
    const startedAt = Date.now();
    const result = await retryWithApiCrashGuard(() => apiJson('/api/certificates/enrich-missing', {
      method: 'POST',
      body: JSON.stringify({
        limit: ENRICHMENT_BATCH_SIZE,
        dryRun: false,
        force: false,
        forceText: false,
        onlyUsableText: true,
        includeDetails: false,
        reviewSampleLimit: 25,
        fields: TARGET_FIELDS,
      }),
    }), `enrichment batch ${batch}`);
    const snapshot = await readMongoSnapshot(collection);
    const currentTotal = totalFieldCount(snapshot.fields);
    const gainedFields = currentTotal - previousTotal;
    previousTotal = currentTotal;
    const memoryUsage = process.memoryUsage();
    assertSafety({ baselineProtectedHash, snapshot, memoryUsage, context: `enrichment batch ${batch}` });
    const row = {
      batch,
      durationMs: Date.now() - startedAt,
      processed: result.processed,
      updated: result.updated,
      reviewRequired: result.reviewRequired,
      failed: result.failed,
      gainedFields,
      fields: snapshot.fields,
      manualReviewCount: snapshot.manualReviewCount,
      memoryRss: memoryUsage.rss,
    };
    batches.push(row);
    log('Enrichment batch complete', row);
    writeJson('enrichment-progress.json', { batches, latestSnapshot: snapshot, latestResult: result });

    if (result.failed >= 3) {
      throw new Error(`enrichment batch ${batch}: failure spike`);
    }
    if (result.processed === 0) {
      log('Enrichment loop stopping: no candidates processed');
      break;
    }
    if (gainedFields <= 0) {
      noProgressBatches += 1;
    } else {
      noProgressBatches = 0;
    }
    if (noProgressBatches >= 1) {
      log('Enrichment loop stopping: strict validation produced no additional safe field coverage');
      break;
    }
  }

  return { batches };
}

async function main() {
  if (!API_KEY) throw new Error('API_INTERNAL_KEY is missing');
  if (!MONGODB_URI) throw new Error('MONGODB_URI is missing');
  if (process.env.DISABLE_CERTIFICATE_STARTUP_EXTRACTION !== 'true' && process.env.CERT_EXTRACTION_ON_STARTUP !== 'false') {
    throw new Error('Startup extraction lock is not set in this process env. Set DISABLE_CERTIFICATE_STARTUP_EXTRACTION=true or CERT_EXTRACTION_ON_STARTUP=false.');
  }

  log('Starting full certificate recovery', { runDir, API_BASE_URL, OCR_BATCH_SIZE, ENRICHMENT_BATCH_SIZE });
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME || undefined });
  const collection = mongoose.connection.db.collection(COLLECTION);

  const beforeCoverage = await getCoverage();
  const beforeSnapshot = await readMongoSnapshot(collection);
  const baselineProtectedHash = beforeSnapshot.protectedHash;
  writeJson('before.json', { coverage: beforeCoverage, snapshot: beforeSnapshot });
  log('Initial coverage', {
    total: beforeCoverage.totalCertificates,
    usableText: beforeCoverage.usableExtractedText,
    remainingModeNone: beforeCoverage.byExtractionMode?.none || 0,
    textTooShort: beforeCoverage.textTooShort,
    failed: beforeCoverage.failed,
    protectedHash: baselineProtectedHash,
  });

  assertSafety({
    baselineProtectedHash,
    snapshot: beforeSnapshot,
    memoryUsage: process.memoryUsage(),
    context: 'initial safety',
  });

  const ocr = await runOcrLoop(collection, baselineProtectedHash, beforeCoverage);
  const afterOcrSnapshot = await readMongoSnapshot(collection);
  writeJson('after-ocr.json', { coverage: ocr.coverage, snapshot: afterOcrSnapshot, batches: ocr.batches });
  writeJson('manual-inspection-files.json', afterOcrSnapshot.failedOrTimedOutFiles);

  const enrichment = await runEnrichmentLoop(collection, baselineProtectedHash, afterOcrSnapshot.fields);
  const finalCoverage = await getCoverage();
  const finalSnapshot = await readMongoSnapshot(collection);
  assertSafety({
    baselineProtectedHash,
    snapshot: finalSnapshot,
    memoryUsage: process.memoryUsage(),
    context: 'final safety',
  });
  const finalReport = {
    runId,
    runDir,
    totalCertificates: finalCoverage.totalCertificates,
    usableTextBefore: beforeCoverage.usableExtractedText,
    usableTextAfter: finalCoverage.usableExtractedText,
    remainingModeNone: finalCoverage.byExtractionMode?.none || 0,
    textTooShort: finalCoverage.textTooShort,
    failed: finalCoverage.failed,
    failedOrTimedOutFiles: finalSnapshot.failedOrTimedOutFiles,
    metadataBefore: beforeSnapshot.fields,
    metadataAfter: finalSnapshot.fields,
    protectedBefore: {
      counts: beforeSnapshot.protectedCounts,
      hash: beforeSnapshot.protectedHash,
    },
    protectedAfter: {
      counts: finalSnapshot.protectedCounts,
      hash: finalSnapshot.protectedHash,
      auditHits: finalSnapshot.protectedAuditHits,
    },
    manualReviewCount: finalSnapshot.manualReviewCount,
    ocrBatches: ocr.batches,
    enrichmentBatches: enrichment.batches,
    dependencies: finalCoverage.dependencies,
  };
  writeJson('final-report.json', finalReport);
  log('Full certificate recovery complete', {
    totalCertificates: finalReport.totalCertificates,
    usableTextBefore: finalReport.usableTextBefore,
    usableTextAfter: finalReport.usableTextAfter,
    remainingModeNone: finalReport.remainingModeNone,
    textTooShort: finalReport.textTooShort,
    failed: finalReport.failed,
    manualReviewCount: finalReport.manualReviewCount,
  });
  await mongoose.disconnect();
}

main().catch(async (err) => {
  log('Full certificate recovery stopped', {
    error: err.message,
    stack: err.stack,
  });
  try {
    await mongoose.disconnect();
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
