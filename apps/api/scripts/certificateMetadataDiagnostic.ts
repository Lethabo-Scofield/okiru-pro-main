#!/usr/bin/env tsx
/**
 * Read-only diagnostic: WHY is certificate metadata missing?
 *
 * For every certificate it replays the real enrichment extraction
 * (collectFieldCandidates) over the text already stored in MongoDB and compares
 * the result with what was actually persisted, so each missing field lands in
 * exactly one cause bucket instead of "missing". It never writes, never downloads
 * a blob and never calls OCR - run it BEFORE changing any threshold or re-running
 * extraction.
 *
 *   npx tsx --env-file=.env scripts/certificateMetadataDiagnostic.ts [--json out.json]
 *
 * Buckets (per field, per certificate):
 *   present                                   a trusted value is stored
 *   text_unavailable                          no usable extracted text - nothing to extract from
 *   not_in_text                               text exists, extractor found no candidate
 *   accepted_candidate_not_enriched_yet       extractor accepts a value, enrichment has not run
 *   accepted_candidate_lost_after_enrichment  extractor accepts a value, enrichment ran, value absent
 *                                             (== lost during persistence; expected 0)
 *   low_confidence_*                          candidate below the safe-save threshold
 *   rejected_hint_*                           loose extractor hint that strict rules rejected
 *   *_kept_in_reviewCandidates                ... and it IS still inspectable
 *   *_dropped_after_enrichment                ... and it is NOT retained anywhere (expected 0)
 *   ambiguous_no_value_retained               rejected with a reason but no value kept
 *
 * The "extractor gap" section then tests the not_in_text certificates against
 * independent text patterns: a hit means the value is probably in the text and the
 * extractor (not OCR) is what missed it.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { CertificateMetadataModel } from '../models.js';
import {
  ENRICHMENT_FIELDS,
  FIELD_TO_MONGO,
  MIN_SAVE_CONFIDENCE,
  collectFieldCandidates,
  type EnrichmentField,
} from '../src/services/certificateEnrichmentJob.js';
import { hasUsableCertificateExtractedText } from '../src/services/certificateExtractionStatus.js';

/** The fields the Certificate Hub is judged on. */
const KEY_FIELDS: EnrichmentField[] = [
  'companyName',
  'registrationNumber',
  'vatNumber',
  'bbbeeLevel',
  'blackOwnership',
  'blackWomenOwnership',
  'companySize',
  'expiryDate',
  'sectorCode',
];

type Cause =
  | 'present'
  | 'text_unavailable'
  | 'not_in_text'
  | 'accepted_candidate_not_enriched_yet'
  | 'accepted_candidate_lost_after_enrichment'
  | 'low_confidence_kept_in_reviewCandidates'
  | 'low_confidence_dropped_after_enrichment'
  | 'low_confidence_not_enriched_yet'
  | 'rejected_hint_kept_in_reviewCandidates'
  | 'rejected_hint_dropped_after_enrichment'
  | 'rejected_hint_not_enriched_yet'
  | 'ambiguous_no_value_retained';

const CAUSES: Cause[] = [
  'present',
  'text_unavailable',
  'not_in_text',
  'accepted_candidate_not_enriched_yet',
  'accepted_candidate_lost_after_enrichment',
  'low_confidence_kept_in_reviewCandidates',
  'low_confidence_dropped_after_enrichment',
  'low_confidence_not_enriched_yet',
  'rejected_hint_kept_in_reviewCandidates',
  'rejected_hint_dropped_after_enrichment',
  'rejected_hint_not_enriched_yet',
  'ambiguous_no_value_retained',
];

/** Independent of the extractors: does the TEXT plausibly contain the value? */
const RAW: Partial<Record<EnrichmentField, RegExp>> = {
  registrationNumber: /\b(?:19|20)\d{2}\s*\/\s*\d{5,6}\s*\/\s*\d{2}\b/,
  vatNumber: /\b4[\s\d]{9,12}\b/,
  bbbeeLevel: /(?:b-?bbee|bee|contributor)[^\n]{0,40}level[^\n]{0,12}\b(?:[1-8]|one|two|three|four|five|six|seven|eight)\b|\blevel\s*[1-8]\b/i,
  expiryDate: /(?:expir\w*|valid\s*(?:until|to|till)|validity)[^\n]{0,70}(?:\d{1,2}[\s/.\-]+(?:\d{1,2}|[a-z]{3,9})[\s/.\-]+\d{2,4}|20\d{2}-\d{2}-\d{2})/i,
  blackOwnership: /black\s+(?:people\s+)?(?:owned|ownership|owner)[^\n]{0,70}\d{1,3}(?:[.,]\d+)?\s*%/i,
  blackWomenOwnership: /black\s+wom[ae]n[^\n]{0,70}\d{1,3}(?:[.,]\d+)?\s*%/i,
};

const NUMERIC_FIELDS = ['bbbeeLevel', 'blackOwnership', 'blackWomenOwnership', 'procurementRecognition', 'bbbeeScore'];

const hasValue = (v: unknown): boolean =>
  v != null && !(typeof v === 'string' && v.trim() === '') && !(v instanceof Date && Number.isNaN(v.getTime()));

const storedCandidate = (doc: Record<string, any>, field: string): boolean => {
  const c = doc.reviewCandidates?.[field];
  return !!c && typeof c === 'object' && hasValue(c.value ?? (Array.isArray(c.candidates) ? c.candidates[0] : null));
};

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });

  try {
    const docs = (await CertificateMetadataModel.find({}).lean()) as Array<Record<string, any>>;
    const total = docs.length;

    const byField: Record<string, Record<Cause, number>> = {};
    for (const f of KEY_FIELDS) byField[f] = {} as Record<Cause, number>;
    const bump = (f: string, c: Cause) => { byField[f][c] = (byField[f][c] ?? 0) + 1; };

    const overall = {
      total,
      usableText: 0,
      noUsableText: 0,
      enrichedAtCurrentVersion: 0,
      neverEnriched: 0,
      withReviewCandidates: 0,
      confidenceRecordedButValueMissing: 0,
    };
    const status: Record<string, number> = {};
    const tally = (k: string) => { status[k] = (status[k] ?? 0) + 1; };
    const rawGap: Record<string, number> = {};
    const typeIssues: Record<string, number> = {};

    for (const doc of docs) {
      for (const k of NUMERIC_FIELDS) {
        const v = doc[k];
        if (v != null && typeof v !== 'number') {
          const key = `${k} stored as ${typeof v}`;
          typeIssues[key] = (typeIssues[key] ?? 0) + 1;
        }
      }

      const fileName = String(doc.fileName || doc.blobName || '').split('/').pop() || '';
      const usable = hasUsableCertificateExtractedText(doc) && typeof doc.extractedText === 'string';
      const enrichedEver = !!(doc.lastEnrichedAt && doc.enrichmentVersion);
      tally(`enrichmentStatus=${doc.enrichmentStatus ?? 'null'} | metadataStatus=${doc.metadataStatus ?? 'null'}`);
      if (usable) overall.usableText++; else overall.noUsableText++;
      if (enrichedEver) overall.enrichedAtCurrentVersion++; else overall.neverEnriched++;
      if (doc.reviewCandidates && Object.keys(doc.reviewCandidates).length > 0) overall.withReviewCandidates++;

      let candidates: ReturnType<typeof collectFieldCandidates> = [];
      const reviews: Array<{ field: string; reason: string; value?: unknown }> = [];
      if (usable) {
        try {
          candidates = collectFieldCandidates(doc.extractedText, fileName, [...ENRICHMENT_FIELDS], reviews as never);
        } catch {
          candidates = [];
        }
      }

      for (const f of KEY_FIELDS) {
        const mongoField = FIELD_TO_MONGO[f];
        if (hasValue(doc[mongoField])) { bump(f, 'present'); continue; }

        // Confidence was recorded for a value that is not there: a real persistence loss.
        if (doc.fieldConfidence?.[f]?.confidence != null) overall.confidenceRecordedButValueMissing++;

        if (!usable) { bump(f, 'text_unavailable'); continue; }

        const kept = storedCandidate(doc, f);
        const best = candidates.filter((c) => c.field === f).sort((a, b) => b.confidence - a.confidence)[0];
        const hint = reviews.find((r) => r.field === f && hasValue(r.value));
        const noValueReview = reviews.find((r) => r.field === f && !hasValue(r.value) && !String(r.reason).startsWith('missing_'));

        if (best && best.confidence >= MIN_SAVE_CONFIDENCE[f]) {
          bump(f, enrichedEver ? 'accepted_candidate_lost_after_enrichment' : 'accepted_candidate_not_enriched_yet');
        } else if (best) {
          bump(f, kept ? 'low_confidence_kept_in_reviewCandidates' : enrichedEver ? 'low_confidence_dropped_after_enrichment' : 'low_confidence_not_enriched_yet');
        } else if (hint) {
          bump(f, kept ? 'rejected_hint_kept_in_reviewCandidates' : enrichedEver ? 'rejected_hint_dropped_after_enrichment' : 'rejected_hint_not_enriched_yet');
        } else if (noValueReview) {
          bump(f, 'ambiguous_no_value_retained');
        } else {
          bump(f, 'not_in_text');
          const re = RAW[f];
          if (re && re.test(doc.extractedText)) rawGap[f] = (rawGap[f] ?? 0) + 1;
        }
      }
    }

    // ---- report -------------------------------------------------------------
    console.log('\nCERTIFICATE METADATA DIAGNOSTIC (read-only)\n');
    console.log(JSON.stringify(overall, null, 2));
    console.log('\nenrichment / metadata status:');
    for (const [k, v] of Object.entries(status).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);

    console.log('\nPER FIELD (count of certificates):');
    for (const f of KEY_FIELDS) {
      console.log(`\n  ${f}`);
      for (const c of CAUSES) if (byField[f][c]) console.log(`    ${String(byField[f][c]).padStart(5)}  ${c}`);
    }

    console.log('\nEXTRACTOR GAP - classified not_in_text, but the raw text matches an independent pattern:');
    for (const f of Object.keys(RAW)) {
      console.log(`  ${f.padEnd(20)}${String(rawGap[f] ?? 0).padStart(5)}  of ${byField[f]?.not_in_text ?? 0} not_in_text`);
    }

    console.log('\nSTORED-TYPE ISSUES (the API only passes numbers, so these would be hidden):');
    console.log(Object.keys(typeIssues).length ? JSON.stringify(typeIssues, null, 2) : '  none');

    const jsonIdx = process.argv.indexOf('--json');
    if (jsonIdx > -1 && process.argv[jsonIdx + 1]) {
      writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ overall, status, byField, rawGap, typeIssues }, null, 2));
      console.log(`\nwrote ${process.argv[jsonIdx + 1]}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exitCode = 1;
});
