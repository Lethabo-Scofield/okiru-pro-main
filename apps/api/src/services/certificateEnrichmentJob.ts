import { BlobServiceClient } from '@azure/storage-blob';
import { execSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Tesseract from 'tesseract.js';
import { CertificateMetadataModel } from '../../models.js';
import { createLogger } from '../logger.js';
import { extractCertificateData, isValidSupplierName } from './certificateExtractor.js';
import { extractTextWithDocIntelligence } from './documentIntelligence.js';
import { getCertContainerClient } from './azureCertStorage.js';
import { OKIRU_HUB_SECTORS, resolveOkiruHubSector } from './okiruHubSectors.js';
import { normalizeVat } from './certificateStore.js';
import {
  type CertificateExtractionMode,
  extractionStatusForText,
  hasUsableCertificateExtractedText,
  hasUsefulExtractedText,
  MIN_USEFUL_EXTRACTED_TEXT_LENGTH,
  usefulExtractedTextLength,
} from './certificateExtractionStatus.js';

const logger = createLogger('CertEnrichment');
const TMP_DIR = join(tmpdir(), 'cert-enrichment');
export const CERTIFICATE_ENRICHMENT_VERSION = 'cert-enrichment-v1';

export const ENRICHMENT_FIELDS = [
  'companyName',
  'tradingName',
  'registrationNumber',
  'taxNumber',
  'sectorCode',
  'sectorName',
  'vatNumber',
  'bbbeeLevel',
  'bbbeeLevelStatus',
  'certificateType',
  'procurementRecognition',
  'companySize',
  'blackOwnership',
  'blackWomenOwnership',
  'blackDesignatedGroupOwnership',
  'empoweringSupplier',
  'valueAddingSupplier',
  'issueDate',
  'expiryDate',
  'measurementPeriod',
  'certificateNumber',
  'verificationAgency',
  'sanasAccreditationNumber',
  'commissionerDetails',
  'physicalAddress',
  'contactDetails',
] as const;

export type EnrichmentField = typeof ENRICHMENT_FIELDS[number];
type EnrichmentStatus = 'pending' | 'processing' | 'completed' | 'review_required' | 'failed' | 'pending_text_recovery';

export const PRODUCTION_CERTIFICATE_FIELDS = [
  'companyName',
  'sectorCode',
  'sectorName',
  'vatNumber',
  'bbbeeLevel',
  'bbbeeLevelStatus',
  'companySize',
  'blackOwnership',
  'blackWomenOwnership',
  'expiryDate',
] as const satisfies readonly EnrichmentField[];

type FieldCandidate = {
  field: EnrichmentField;
  mongoField: string;
  value: string | number | boolean | Date | Record<string, string> | null;
  confidence: number;
  evidence: string;
  source: 'text' | 'filename' | 'trusted_mapping';
};

type ReviewField = {
  field: EnrichmentField;
  reason: string;
  evidence?: string;
  value?: unknown;
};

export type CertificateEnrichmentOptions = {
  limit?: number;
  dryRun?: boolean;
  force?: boolean;
  forceText?: boolean;
  includeDetails?: boolean;
  reviewSampleLimit?: number;
  fields?: EnrichmentField[];
  onlyUsableText?: boolean;
};

export type CertificateEnrichmentResult = {
  totalCertificates: number;
  usableTextCount: number;
  enrichedCount: number;
  skippedMissingText: number;
  reviewRequiredCount: number;
  failedCount: number;
  fieldCoverage: Record<string, number>;
  processed: number;
  updated: number;
  reviewRequired: number;
  failed: number;
  dryRun: boolean;
  coverage: Record<EnrichmentField, string>;
  reviewSamples: Array<{
    blobName: string;
    fileName: string;
    reviewFields: ReviewField[];
    reviewUrl: string;
    previewUrl: string;
    downloadUrl: string;
  }>;
  details: Array<{
    blobName: string;
    fileName: string;
    status: EnrichmentStatus | 'dry_run';
    updates: Record<string, unknown>;
    reviewFields: ReviewField[];
    reviewUrl: string;
    previewUrl: string;
    downloadUrl: string;
    error?: string;
  }>;
};

type MongoDoc = Record<string, any>;

const FIELD_TO_MONGO: Record<EnrichmentField, string> = {
  companyName: 'supplierName',
  tradingName: 'tradingName',
  registrationNumber: 'registrationNumber',
  taxNumber: 'taxNumber',
  sectorCode: 'sectorCode',
  sectorName: 'sectorName',
  vatNumber: 'vatNumber',
  bbbeeLevel: 'bbbeeLevel',
  bbbeeLevelStatus: 'bbbeeLevelStatus',
  certificateType: 'certificateType',
  procurementRecognition: 'procurementRecognition',
  companySize: 'companySize',
  blackOwnership: 'blackOwnership',
  blackWomenOwnership: 'blackWomenOwnership',
  blackDesignatedGroupOwnership: 'blackDesignatedGroupOwnership',
  empoweringSupplier: 'empoweringSupplier',
  valueAddingSupplier: 'valueAddingSupplier',
  issueDate: 'issueDate',
  expiryDate: 'expiryDate',
  measurementPeriod: 'measurementPeriod',
  certificateNumber: 'certificateNumber',
  verificationAgency: 'verificationAgency',
  sanasAccreditationNumber: 'sanasAccreditationNumber',
  commissionerDetails: 'commissionerDetails',
  physicalAddress: 'physicalAddress',
  contactDetails: 'contactDetails',
};

const MIN_SAVE_CONFIDENCE: Record<EnrichmentField, number> = {
  companyName: 0.7,
  tradingName: 0.82,
  registrationNumber: 0.9,
  taxNumber: 0.9,
  sectorCode: 0.86,
  sectorName: 0.86,
  vatNumber: 0.9,
  bbbeeLevel: 0.88,
  bbbeeLevelStatus: 0.88,
  certificateType: 0.86,
  procurementRecognition: 0.88,
  companySize: 0.8,
  blackOwnership: 0.88,
  blackWomenOwnership: 0.88,
  blackDesignatedGroupOwnership: 0.88,
  empoweringSupplier: 0.86,
  valueAddingSupplier: 0.86,
  issueDate: 0.88,
  expiryDate: 0.88,
  measurementPeriod: 0.84,
  certificateNumber: 0.84,
  verificationAgency: 0.82,
  sanasAccreditationNumber: 0.9,
  commissionerDetails: 0.82,
  physicalAddress: 0.82,
  contactDetails: 0.82,
};

function selectedFields(fields?: EnrichmentField[]): EnrichmentField[] {
  if (!fields?.length) return [...PRODUCTION_CERTIFICATE_FIELDS];
  const allowed = new Set(ENRICHMENT_FIELDS);
  return fields.filter((f): f is EnrichmentField => allowed.has(f));
}

function blobBasename(blobName: string): string {
  return blobName.split('/').pop() || blobName;
}

function certificateDownloadUrl(blobName: string, disposition: 'inline' | 'attachment' = 'attachment'): string {
  return `/api/certificates/download?file=${encodeURIComponent(blobName)}&mode=redirect&disposition=${disposition}`;
}

function certificateReviewUrl(blobName: string): string {
  return `/certificates?reviewBlob=${encodeURIComponent(blobName)}`;
}

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (v instanceof Date) return Number.isFinite(v.getTime());
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

function normalizeExistingValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

function responseUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(updates).map(([k, v]) => [
      k,
      k === 'extractedText' && typeof v === 'string'
        ? `[${v.length} chars refreshed]`
        : normalizeExistingValue(v),
    ]),
  );
}

function errorDetails(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const details: Record<string, unknown> = {
      name: err.name,
      message: err.message || String(err),
    };
    const anyErr = err as any;
    if (anyErr.code) details.code = anyErr.code;
    if (anyErr.statusCode) details.statusCode = anyErr.statusCode;
    if (anyErr.details) details.details = anyErr.details;
    if (anyErr.response?.status) details.responseStatus = anyErr.response.status;
    if (anyErr.response?.bodyAsText) details.responseBody = String(anyErr.response.bodyAsText).slice(0, 500);
    return details;
  }

  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

function errorMessage(err: unknown): string {
  const details = errorDetails(err);
  return typeof details.message === 'string' && details.message.trim()
    ? details.message
    : String(err);
}

function shouldUpdateField(
  doc: MongoDoc | null,
  field: EnrichmentField,
  candidate: FieldCandidate,
  force: boolean,
): boolean {
  if (force) return true;
  if (!doc) return true;
  const mongoField = FIELD_TO_MONGO[field];
  if (!hasValue(doc[mongoField])) return true;

  const existingConfidence = doc.fieldConfidence?.[field]?.confidence;
  return typeof existingConfidence === 'number'
    && existingConfidence < MIN_SAVE_CONFIDENCE[field]
    && candidate.confidence > existingConfidence;
}

function textSnippet(text: string, index: number, len: number): string {
  return text.slice(Math.max(0, index - 80), Math.min(text.length, index + len + 80)).replace(/\s+/g, ' ').trim();
}

function parseDateStrict(raw: string): Date | null {
  const cleaned = raw.replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  const months: Record<string, number> = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
    may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
    september: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
  };
  const dmyText = /(\d{1,2})\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)\s+(\d{4})/i.exec(cleaned);
  if (dmyText) return validDate(Number(dmyText[3]), months[dmyText[2].toLowerCase()], Number(dmyText[1]));

  const ymd = /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(cleaned);
  if (ymd) return validDate(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));

  const dmy = /\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/.exec(cleaned);
  if (dmy) return validDate(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  return null;
}

function validDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  if (year < 2020 || year > 2038) return null;
  return d;
}

function pushReview(reviews: ReviewField[], field: EnrichmentField, reason: string, candidate?: Partial<FieldCandidate>) {
  reviews.push({
    field,
    reason,
    evidence: candidate?.evidence,
    value: candidate?.value,
  });
}

function bestByConfidence(candidates: FieldCandidate[]): FieldCandidate | null {
  return candidates.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

function cleanSingleLineValue(raw: string, max = 150): string {
  return raw
    .split(/\s{3,}|\t|\||(?:\s+-\s+)|(?:\s{2,}[A-Z][A-Za-z ]{2,}:)/)[0]
    .replace(/[.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeRegistrationNumber(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/\s+/g, '').replace(/[()]/g, '');
  if (/^\d{4}\/\d{6}\/\d{2}$/.test(cleaned)) return cleaned;
  if (/^\d{4}\/\d{6}\/\d{2,3}$/.test(cleaned)) return cleaned;
  if (/^\d{10,14}$/.test(cleaned)) return cleaned;
  return null;
}

function normalizeCertificateType(text: string): string | null {
  if (/\bEME\s+sworn\s+affidavit\b|\bsworn\s+affidavit\b[^\n]{0,80}\bEME\b/i.test(text)) return 'EME Affidavit';
  if (/\bQSE\s+sworn\s+affidavit\b|\bsworn\s+affidavit\b[^\n]{0,80}\bQSE\b/i.test(text)) return 'QSE Affidavit';
  if (/\bsworn\s+affidavit\b/i.test(text)) return 'Sworn Affidavit';
  if (/\bgeneric\s+(?:b-?bbee\s+)?certificate\b/i.test(text)) return 'Generic Certificate';
  if (/\bb-?bbee\s+(?:verification\s+)?certificate\b|\bbroad\s*based\s*black\s*economic\s*empowerment\s+certificate\b/i.test(text)) return 'B-BBEE Certificate';
  return null;
}

function parsePercentWithLimit(raw: string, max: number): number | null {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function parseBoolean(raw: string): boolean | null {
  if (/\bno\b|\bfalse\b|\bnon[-\s]?compliant\b/i.test(raw)) return false;
  if (/\byes\b|\btrue\b|\bcompliant\b/i.test(raw)) return true;
  return null;
}

function extractCompanyName(text: string, fileName: string, reviews: ReviewField[]): FieldCandidate | null {
  const patterns = [
    /(?:company\s*name|enterprise\s*name|registered\s*(?:company\s*)?name|entity\s*name|supplier\s*name|name\s*of\s*(?:entity|company|enterprise|organisation))[:\s]+([^\n\r]{3,140})/i,
    /(?:certificate\s+(?:is\s+)?issued\s+to|issued\s+to)[:\s]+([^\n\r]{3,140})/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const value = m[1].split(/\s{3,}|\t/)[0].replace(/[.,;:]+$/g, '').trim();
    if (isValidSupplierName(value)) {
      return {
        field: 'companyName',
        mongoField: 'supplierName',
        value: value.slice(0, 150),
        confidence: 0.9,
        evidence: textSnippet(text, m.index, m[0].length),
        source: 'text',
      };
    }
    pushReview(reviews, 'companyName', 'Company name label was found but value looked unsafe', {
      value,
      evidence: textSnippet(text, m.index, m[0].length),
    });
  }

  return null;
}

function extractTradingName(text: string): FieldCandidate | null {
  const m = /(?:trading\s*(?:as|name)|trade\s*name|t\/a)[:\s-]+([^\n\r]{3,120})/i.exec(text);
  if (!m) return null;
  const value = cleanSingleLineValue(m[1], 120);
  if (value.length < 3) return null;
  return {
    field: 'tradingName',
    mongoField: 'tradingName',
    value,
    confidence: 0.86,
    evidence: textSnippet(text, m.index, m[0].length),
    source: 'text',
  };
}

function extractRegistrationNumber(text: string, reviews: ReviewField[]): FieldCandidate | null {
  const matches = [...text.matchAll(/(?:registration|enterprise|company|entity)\s*(?:no|number|nr\.?|reg\.?\s*(?:no\.?|number)?)[:\s#-]*([0-9]{4}\s*\/\s*[0-9]{6}\s*\/\s*[0-9]{2,3}|[0-9]{10,14})/gi)];
  for (const m of matches) {
    const value = normalizeRegistrationNumber(m[1]);
    if (value) {
      return {
        field: 'registrationNumber',
        mongoField: 'registrationNumber',
        value,
        confidence: 0.94,
        evidence: textSnippet(text, m.index ?? 0, m[0].length),
        source: 'text',
      };
    }
    pushReview(reviews, 'registrationNumber', 'Registration number label found but value failed South African pattern validation', {
      value: m[1],
      evidence: textSnippet(text, m.index ?? 0, m[0].length),
    });
  }
  return null;
}

function extractVat(text: string, reviews: ReviewField[]): FieldCandidate | null {
  const matches = [...text.matchAll(/(?:vat|value\s*added\s*tax|tax\s*registration)(?:\s*(?:no|number|nr\.?|reg\.?\s*(?:no\.?|number)?))?[:\s#-]*(4[\d\s-]{9,16})/gi)];
  for (const m of matches) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('4')) {
      return {
        field: 'vatNumber',
        mongoField: 'vatNumber',
        value: digits,
        confidence: 0.95,
        evidence: textSnippet(text, m.index ?? 0, m[0].length),
        source: 'text',
      };
    }
    pushReview(reviews, 'vatNumber', 'VAT-like label found but number failed validation', {
      value: digits,
      evidence: textSnippet(text, m.index ?? 0, m[0].length),
    });
  }
  return null;
}

function extractTaxNumber(text: string, reviews: ReviewField[]): FieldCandidate | null {
  const matches = [...text.matchAll(/(?:income\s*tax|tax)\s*(?:no|number|nr\.?|reference)?[:\s#-]*(?!4[\d\s-]{9,16})([0-9][0-9\s-]{8,14})/gi)];
  for (const m of matches) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 13 && !/^0{5,}/.test(digits)) {
      return {
        field: 'taxNumber',
        mongoField: 'taxNumber',
        value: digits,
        confidence: 0.9,
        evidence: textSnippet(text, m.index ?? 0, m[0].length),
        source: 'text',
      };
    }
    pushReview(reviews, 'taxNumber', 'Tax number label found but value looked like an unsafe identifier', {
      value: digits,
      evidence: textSnippet(text, m.index ?? 0, m[0].length),
    });
  }
  return null;
}

function extractBbbeeLevel(text: string, reviews: ReviewField[]): FieldCandidate | null {
  const patterns = [
    /(?:b-?bbee|broad\s*based\s*black\s*economic\s*empowerment|bee)\s*(?:status\s*)?(?:level|contributor\s*level)[:\s-]*(?:level\s*)?(\d)\b/i,
    /(?:level\s*(\d)\s*(?:b-?bbee|bee)\s*(?:contributor|status)?)/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const level = Number(m[1]);
    if (Number.isInteger(level) && level >= 1 && level <= 8) {
      return {
        field: 'bbbeeLevel',
        mongoField: 'bbbeeLevel',
        value: level,
        confidence: 0.92,
        evidence: textSnippet(text, m.index, m[0].length),
        source: 'text',
      };
    }
    pushReview(reviews, 'bbbeeLevel', 'B-BBEE level label found but level was outside 1-8', {
      value: level,
      evidence: textSnippet(text, m.index, m[0].length),
    });
  }
  return null;
}

function extractBbbeeLevelStatus(text: string): FieldCandidate | null {
  const nonCompliant = /\bnon[-\s]?compliant\s+contributor\b/i.exec(text);
  if (nonCompliant) {
    return {
      field: 'bbbeeLevelStatus',
      mongoField: 'bbbeeLevelStatus',
      value: 'Non-compliant contributor',
      confidence: 0.94,
      evidence: textSnippet(text, nonCompliant.index, nonCompliant[0].length),
      source: 'text',
    };
  }
  const level = extractBbbeeLevel(text, []);
  if (!level) return null;
  return {
    field: 'bbbeeLevelStatus',
    mongoField: 'bbbeeLevelStatus',
    value: `Level ${level.value}`,
    confidence: level.confidence,
    evidence: level.evidence,
    source: 'text',
  };
}

function extractCertificateType(text: string): FieldCandidate | null {
  const value = normalizeCertificateType(text);
  if (!value) return null;
  const m = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/B\\-BEE/i, 'B-?BEE'), 'i').exec(text)
    ?? /\b(?:sworn\s+affidavit|b-?bbee\s+(?:verification\s+)?certificate|generic\s+certificate)\b/i.exec(text);
  return {
    field: 'certificateType',
    mongoField: 'certificateType',
    value,
    confidence: 0.9,
    evidence: m ? textSnippet(text, m.index, m[0].length) : value,
    source: 'text',
  };
}

function extractProcurementRecognition(text: string, reviews: ReviewField[]): FieldCandidate | null {
  const patterns = [
    /(?:procurement\s*recognition|recognition\s*level|b-?bbee\s*recognition|recognition\s*percentage)[:\s-]*(\d{1,3}(?:[.,]\d+)?)\s*%/i,
    /(\d{1,3}(?:[.,]\d+)?)\s*%[^\n\r]{0,60}(?:procurement\s*recognition|recognition\s*level)/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const pct = parsePercentWithLimit(m[1], 135);
    if (pct != null) {
      return {
        field: 'procurementRecognition',
        mongoField: 'procurementRecognition',
        value: pct,
        confidence: 0.9,
        evidence: textSnippet(text, m.index, m[0].length),
        source: 'text',
      };
    }
    pushReview(reviews, 'procurementRecognition', 'Procurement recognition percentage was outside 0-135', {
      value: m[1],
      evidence: textSnippet(text, m.index, m[0].length),
    });
  }
  return null;
}

function normalizeCompanySize(raw: string): string | null {
  if (/\bEME\b|exempt\s+micro/i.test(raw)) return 'EME';
  if (/\bQSE\b|qualifying\s+small/i.test(raw)) return 'QSE';
  if (/generic/i.test(raw)) return 'Generic Enterprise';
  if (/large/i.test(raw)) return 'Large Enterprise';
  if (/\bmicro\b/i.test(raw)) return 'Micro';
  if (/\bsmall\b/i.test(raw)) return 'Small';
  if (/\bmedium\b/i.test(raw)) return 'Medium';
  return null;
}

function extractCompanySize(text: string, reviews: ReviewField[]): FieldCandidate | null {
  const patterns = [
    /(?:enterprise\s*(?:classification|size)|company\s*size|entity\s*size|measured\s*entity\s*category)[:\s-]*([^\n\r]{2,90})/i,
    /\b(Exempt\s+Micro\s+Enterprise|Qualifying\s+Small\s+Enterprise|Generic\s+Enterprise|Large\s+Enterprise)\b/i,
    /\b(EME|QSE)\b\s+(?:certificate|affidavit|scorecard|entity|enterprise)/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const raw = m[1] || m[0];
    const size = normalizeCompanySize(raw);
    if (size) {
      return {
        field: 'companySize',
        mongoField: 'companySize',
        value: size,
        confidence: 0.88,
        evidence: textSnippet(text, m.index, m[0].length),
        source: 'text',
      };
    }
    pushReview(reviews, 'companySize', 'Company size label found but value was not recognized', {
      value: raw,
      evidence: textSnippet(text, m.index, m[0].length),
    });
  }
  return null;
}

function extractCompanySizeFromFilename(fileName: string): FieldCandidate | null {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '');
  const m = /(?:^|[\s_\-])((?:EME|QSE|Generic(?:\s+Enterprise)?|Large(?:\s+Enterprise)?|Micro|Small|Medium))(?:[\s_\-]|\b|$)/i.exec(base);
  if (!m) return null;
  const size = normalizeCompanySize(m[1]);
  if (!size) return null;
  return {
    field: 'companySize',
    mongoField: 'companySize',
    value: size,
    confidence: 0.8,
    evidence: fileName,
    source: 'filename',
  };
}

function parsePercent(raw: string): number | null {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function extractOwnership(text: string, field: 'blackOwnership' | 'blackWomenOwnership', reviews: ReviewField[]): FieldCandidate | null {
  const label = field === 'blackWomenOwnership'
    ? /black\s+wom(?:en|an)\s*(?:ownership|shareholding|economic\s*interest)?/i
    : /black\s*(?:ownership|shareholding|economic\s*interest)/i;
  const patterns = [
    new RegExp(`${label.source}[^\\d%]{0,70}(\\d{1,3}(?:[.,]\\d+)?)\\s*%`, 'i'),
    new RegExp(`(\\d{1,3}(?:[.,]\\d+)?)\\s*%[^\\n\\r]{0,70}${label.source}`, 'i'),
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const pct = parsePercent(m[1]);
    if (pct != null) {
      return {
        field,
        mongoField: field,
        value: pct,
        confidence: 0.9,
        evidence: textSnippet(text, m.index, m[0].length),
        source: 'text',
      };
    }
    pushReview(reviews, field, 'Ownership percentage was outside 0-100', {
      value: m[1],
      evidence: textSnippet(text, m.index, m[0].length),
    });
  }
  return null;
}

function extractDesignatedGroupOwnership(text: string, reviews: ReviewField[]): FieldCandidate | null {
  const patterns = [
    /(?:designated\s+group|youth|disabled|people\s+with\s+disabilities|rural)\s+(?:black\s+)?(?:ownership|shareholding|economic\s*interest)[^\d%]{0,70}(\d{1,3}(?:[.,]\d+)?)\s*%/i,
    /(\d{1,3}(?:[.,]\d+)?)\s*%[^\n\r]{0,80}(?:designated\s+group|youth|disabled|people\s+with\s+disabilities|rural)\s+(?:black\s+)?(?:ownership|shareholding|economic\s*interest)/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const pct = parsePercentWithLimit(m[1], 100);
    if (pct != null) {
      return {
        field: 'blackDesignatedGroupOwnership',
        mongoField: 'blackDesignatedGroupOwnership',
        value: pct,
        confidence: 0.9,
        evidence: textSnippet(text, m.index, m[0].length),
        source: 'text',
      };
    }
    pushReview(reviews, 'blackDesignatedGroupOwnership', 'Designated group ownership percentage was outside 0-100', {
      value: m[1],
      evidence: textSnippet(text, m.index, m[0].length),
    });
  }
  return null;
}

function extractSupplierStatus(text: string, field: 'empoweringSupplier' | 'valueAddingSupplier'): FieldCandidate | null {
  const label = field === 'empoweringSupplier' ? 'empowering supplier' : 'value[-\\s]*adding supplier';
  const p = new RegExp(`(?:${label})[:\\s-]*(yes|no|true|false|compliant|non[-\\s]?compliant)`, 'i');
  const m = p.exec(text);
  if (!m) return null;
  const value = parseBoolean(m[1]);
  if (value == null) return null;
  return {
    field,
    mongoField: field,
    value,
    confidence: 0.88,
    evidence: textSnippet(text, m.index, m[0].length),
    source: 'text',
  };
}

function extractExpiryDate(text: string, reviews: ReviewField[]): FieldCandidate | null {
  const patterns = [
    /(?:expir(?:y|es|ation)\s*(?:date)?|valid\s*(?:until|to|through|till)|date\s*of\s*expir(?:y|ation)|certificate\s*expires?|validity\s*(?:period\s*)?(?:ends?|to|until)|end\s*date|not\s*valid\s*after)[:\s-]*([^\n\r]{6,50})/gi,
  ];
  const candidates: FieldCandidate[] = [];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) != null) {
      const date = parseDateStrict(m[1]);
      if (date) {
        candidates.push({
          field: 'expiryDate',
          mongoField: 'expiryDate',
          value: date,
          confidence: 0.92,
          evidence: textSnippet(text, m.index, m[0].length),
          source: 'text',
        });
      } else {
        pushReview(reviews, 'expiryDate', 'Expiry label found but date could not be safely parsed', {
          value: m[1].trim(),
          evidence: textSnippet(text, m.index, m[0].length),
        });
      }
    }
  }
  return bestByConfidence(candidates);
}

function extractIssueDate(text: string, reviews: ReviewField[]): FieldCandidate | null {
  const patterns = [
    /(?:issue\s*(?:date)?|date\s*of\s*issue|certificate\s*date|verification\s*date)[:\s-]*([^\n\r]{6,50})/gi,
  ];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) != null) {
      const date = parseDateStrict(m[1]);
      if (date) {
        return {
          field: 'issueDate',
          mongoField: 'issueDate',
          value: date,
          confidence: 0.9,
          evidence: textSnippet(text, m.index, m[0].length),
          source: 'text',
        };
      }
      pushReview(reviews, 'issueDate', 'Issue date label found but date could not be safely parsed', {
        value: m[1].trim(),
        evidence: textSnippet(text, m.index, m[0].length),
      });
    }
  }
  return null;
}

function extractMeasurementPeriod(text: string): FieldCandidate | null {
  const m = /(?:financial\s*year|measurement\s*period|period\s*measured|financial\s*period)[:\s-]+([^\n\r]{4,80})/i.exec(text);
  if (!m) return null;
  const value = cleanSingleLineValue(m[1], 80);
  if (value.length < 4) return null;
  return {
    field: 'measurementPeriod',
    mongoField: 'measurementPeriod',
    value,
    confidence: 0.84,
    evidence: textSnippet(text, m.index, m[0].length),
    source: 'text',
  };
}

function extractCertificateNumber(text: string): FieldCandidate | null {
  const patterns = [
    /(?:certificate|verification|reference)\s*(?:no|number|#|ref(?:erence)?\.?)[:\s.#-]*([A-Z0-9][A-Z0-9\-_/]{3,40})/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    return {
      field: 'certificateNumber',
      mongoField: 'certificateNumber',
      value: m[1].toUpperCase().replace(/_/g, '-'),
      confidence: 0.86,
      evidence: textSnippet(text, m.index, m[0].length),
      source: 'text',
    };
  }
  return null;
}

function extractVerificationAgency(text: string): FieldCandidate | null {
  const patterns = [
    /(?:verification\s*agency|verified\s*by|issued\s*by|verification\s*by)[:\s-]+([A-Za-z0-9][A-Za-z0-9&.,'()\- ]{2,100})/i,
    /\b([A-Z][A-Za-z&.'()\- ]{2,80}\s+(?:Verification|Rating|Ratings|Auditors|Auditing|Consulting|Services|Analytics)(?:\s+\(Pty\)\s+Ltd|\s+Pty\s+Ltd|\s+Ltd|\s+Limited)?)\b/,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (!m) continue;
    const value = m[1].replace(/\s{2,}/g, ' ').replace(/[.,;:]+$/g, '').trim().slice(0, 120);
    if (value.length >= 3) {
      return {
        field: 'verificationAgency',
        mongoField: 'verificationAgency',
        value,
        confidence: 0.84,
        evidence: textSnippet(text, m.index, m[0].length),
        source: 'text',
      };
    }
  }
  return null;
}

function extractSanasAccreditationNumber(text: string): FieldCandidate | null {
  const m = /(?:SANAS|accreditation)\s*(?:accreditation\s*)?(?:no|number|nr\.?)?[:\s#-]*([A-Z]{2,5}\d{2,8}|BVA\s*\d{3}|[A-Z0-9/-]{4,20})/i.exec(text);
  if (!m) return null;
  return {
    field: 'sanasAccreditationNumber',
    mongoField: 'sanasAccreditationNumber',
    value: m[1].toUpperCase().replace(/\s+/g, ''),
    confidence: 0.92,
    evidence: textSnippet(text, m.index, m[0].length),
    source: 'text',
  };
}

function extractCommissionerDetails(text: string): FieldCandidate | null {
  const m = /(?:commissioner\s*of\s*oaths|SAPS\s*commissioner|commissioned\s*by)[:\s-]+([^\n\r]{3,140})/i.exec(text);
  if (!m) return null;
  const value = cleanSingleLineValue(m[1], 140);
  if (value.length < 3) return null;
  return {
    field: 'commissionerDetails',
    mongoField: 'commissionerDetails',
    value,
    confidence: 0.84,
    evidence: textSnippet(text, m.index, m[0].length),
    source: 'text',
  };
}

function extractPhysicalAddress(text: string): FieldCandidate | null {
  const m = /(?:physical\s*address|business\s*address|registered\s*address)[:\s-]+([^\n\r]{8,180})/i.exec(text);
  if (!m) return null;
  const value = cleanSingleLineValue(m[1], 180);
  if (value.length < 8 || !/\d/.test(value)) return null;
  return {
    field: 'physicalAddress',
    mongoField: 'physicalAddress',
    value,
    confidence: 0.84,
    evidence: textSnippet(text, m.index, m[0].length),
    source: 'text',
  };
}

function extractContactDetails(text: string): FieldCandidate | null {
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.exec(text)?.[0];
  const phone = /(?:tel|telephone|phone|cell|mobile)[:\s-]*(\+?\d[\d\s().-]{7,18})/i.exec(text)?.[1]?.replace(/\s+/g, ' ').trim();
  if (!email && !phone) return null;
  const value: Record<string, string> = {};
  if (email) value.email = email;
  if (phone) value.phone = phone;
  const idx = email ? text.search(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) : text.search(/(?:tel|telephone|phone|cell|mobile)/i);
  return {
    field: 'contactDetails',
    mongoField: 'contactDetails',
    value,
    confidence: 0.84,
    evidence: textSnippet(text, Math.max(0, idx), 80),
    source: 'text',
  };
}

function extractSector(text: string): FieldCandidate[] {
  const checks: Array<{ code: string; name: string; patterns: RegExp[] }> = [
    { code: 'GENERIC', name: 'Generic Codes', patterns: [/\bgeneric\s+codes?\b/i, /\bcodes?\s+of\s+good\s+practice\b/i] },
    { code: 'FSC', name: 'Financial Sector', patterns: [/\bfinancial\s+sector\s+code\b/i, /\bFSC\b/i] },
    { code: 'ICT', name: 'Information and Communications Technology', patterns: [/\binformation\s+(?:and|&)\s+communications?\s+technology\b/i, /\bICT\s+sector\b/i] },
    { code: 'CONSTRUCTION', name: 'Construction', patterns: [/\bconstruction\s+sector\s+code\b/i] },
    { code: 'TRANSPORT', name: 'Transport', patterns: [/\btransport\s+sector\s+code\b/i] },
    { code: 'FORESTRY', name: 'Forestry', patterns: [/\bforestry\s+sector\s+code\b/i] },
    { code: 'TOURISM', name: 'Tourism', patterns: [/\btourism\s+sector\s+code\b/i] },
    { code: 'PROPERTY', name: 'Property', patterns: [/\bproperty\s+sector\s+code\b/i] },
    { code: 'AGRI', name: 'AgriBEE', patterns: [/\bagri(?:culture)?\s*bee\b/i, /\bagricultural?\s+sector\s+code\b/i, /\bagriculture\b/i] },
    { code: 'MAC', name: 'Marketing, Advertising and Communication', patterns: [/\bmarketing,\s*advertising\s+and\s+communication\b/i, /\bMAC\s+sector\b/i] },
    { code: 'RCOGP', name: 'Retail, Construction, Oil & Gas, Property', patterns: [/\bretail\s+sector\s+code\b/i, /\boil\s*(?:&|and)\s*gas\b/i] },
  ];
  for (const check of checks) {
    for (const p of check.patterns) {
      const m = p.exec(text);
      if (!m) continue;
      const resolved = resolveOkiruHubSector(check.code);
      const code = resolved?.sectorCode ?? check.code;
      const name = resolved?.sectorName ?? check.name;
      return [
        {
          field: 'sectorCode',
          mongoField: 'sectorCode',
          value: code,
          confidence: 0.88,
          evidence: textSnippet(text, m.index, m[0].length),
          source: 'trusted_mapping',
        },
        {
          field: 'sectorName',
          mongoField: 'sectorName',
          value: name,
          confidence: 0.88,
          evidence: textSnippet(text, m.index, m[0].length),
          source: 'trusted_mapping',
        },
      ];
    }
  }

  for (const sector of OKIRU_HUB_SECTORS) {
    const escaped = sector.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const p = new RegExp(`\\b${escaped}\\b`, 'i');
    const m = p.exec(text);
    if (!m) continue;
    return [
      {
        field: 'sectorCode',
        mongoField: 'sectorCode',
        value: sector.code,
        confidence: 0.92,
        evidence: textSnippet(text, m.index, m[0].length),
        source: 'text',
      },
      {
        field: 'sectorName',
        mongoField: 'sectorName',
        value: sector.name,
        confidence: 0.92,
        evidence: textSnippet(text, m.index, m[0].length),
        source: 'text',
      },
    ];
  }
  return [];
}

async function ocrImage(image: Buffer): Promise<string> {
  try {
    const result = await Tesseract.recognize(image, 'eng', { logger: () => {} });
    return result.data.text.trim();
  } catch {
    return '';
  }
}

async function ocrPdf(pdfBuffer: Buffer, fileName: string): Promise<string> {
  const workDir = join(TMP_DIR, createHash('md5').update(`${fileName}:${Date.now()}`).digest('hex'));
  mkdirSync(workDir, { recursive: true });
  const pdfPath = join(workDir, 'input.pdf');
  writeFileSync(pdfPath, pdfBuffer);
  try {
    const outputPrefix = join(workDir, 'page');
    execSync(`pdftoppm -png -r 200 -l 3 "${pdfPath}" "${outputPrefix}"`, { timeout: 30_000, stdio: 'pipe' });
    const images = readdirSync(workDir).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort();
    const pages: string[] = [];
    for (const image of images) {
      const result = await Tesseract.recognize(join(workDir, image), 'eng', { logger: () => {} });
      if (result.data.text.trim()) pages.push(result.data.text.trim());
    }
    return pages.join('\n');
  } catch {
    return '';
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<{ text: string; extractionMode: CertificateExtractionMode }> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  let text = '';
  if (['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
    try {
      text = await extractTextWithDocIntelligence(buffer, fileName);
      if (hasUsefulExtractedText(text)) return { text, extractionMode: 'pdf_text' };
    } catch (err) {
      logger.warn('Primary certificate text extraction failed; trying fallback extractor', {
        fileName,
        error: errorDetails(err),
      });
    }
  }
  if (ext === 'pdf') {
    text = await ocrPdf(buffer, fileName);
    if (hasUsefulExtractedText(text)) return { text, extractionMode: 'ocr' };
  }
  if (['png', 'jpg', 'jpeg'].includes(ext)) {
    text = await ocrImage(buffer);
    if (hasUsefulExtractedText(text)) return { text, extractionMode: 'ocr' };
  }
  return { text: '', extractionMode: 'none' };
}

export function collectFieldCandidates(text: string, fileName: string, fields: EnrichmentField[], reviews: ReviewField[]): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const add = (candidate: FieldCandidate | null) => {
    if (candidate && fields.includes(candidate.field)) candidates.push(candidate);
  };

  if (!hasUsefulExtractedText(text)) {
    add(extractCompanySizeFromFilename(fileName));
    return candidates;
  }

  add(extractCompanyName(text, fileName, reviews));
  if (fields.includes('tradingName')) add(extractTradingName(text));
  if (fields.includes('registrationNumber')) add(extractRegistrationNumber(text, reviews));
  add(extractVat(text, reviews));
  if (fields.includes('taxNumber')) add(extractTaxNumber(text, reviews));
  add(extractBbbeeLevel(text, reviews));
  add(extractBbbeeLevelStatus(text));
  if (fields.includes('certificateType')) add(extractCertificateType(text));
  if (fields.includes('procurementRecognition')) add(extractProcurementRecognition(text, reviews));
  add(extractCompanySize(text, reviews));
  add(extractCompanySizeFromFilename(fileName));
  add(extractOwnership(text, 'blackOwnership', reviews));
  add(extractOwnership(text, 'blackWomenOwnership', reviews));
  if (fields.includes('blackDesignatedGroupOwnership')) add(extractDesignatedGroupOwnership(text, reviews));
  if (fields.includes('empoweringSupplier')) add(extractSupplierStatus(text, 'empoweringSupplier'));
  if (fields.includes('valueAddingSupplier')) add(extractSupplierStatus(text, 'valueAddingSupplier'));
  if (fields.includes('issueDate')) add(extractIssueDate(text, reviews));
  add(extractExpiryDate(text, reviews));
  if (fields.includes('measurementPeriod')) add(extractMeasurementPeriod(text));
  if (fields.includes('certificateNumber')) add(extractCertificateNumber(text));
  if (fields.includes('verificationAgency')) add(extractVerificationAgency(text));
  if (fields.includes('sanasAccreditationNumber')) add(extractSanasAccreditationNumber(text));
  if (fields.includes('commissionerDetails')) add(extractCommissionerDetails(text));
  if (fields.includes('physicalAddress')) add(extractPhysicalAddress(text));
  if (fields.includes('contactDetails')) add(extractContactDetails(text));
  for (const sectorCandidate of extractSector(text)) add(sectorCandidate);

  // Regex fallback is used only to add review hints for fields our strict
  // labelled patterns did not accept. We do not save these values directly.
  const loose = extractCertificateData(text, fileName);
  const looseHints: Array<[EnrichmentField, unknown]> = [
    ['expiryDate', loose.expiryDate],
    ['bbbeeLevel', loose.bbbeeLevel],
    ['companySize', loose.companySize],
    ['vatNumber', loose.vatNumber],
    ['blackOwnership', loose.blackOwnership],
    ['blackWomenOwnership', loose.blackWomenOwnership],
  ];
  const accepted = new Set(candidates.map((c) => c.field));
  for (const [field, value] of looseHints) {
    if (fields.includes(field) && hasValue(value) && !accepted.has(field)) {
      pushReview(reviews, field, 'Loose extractor found a value, but strict evidence rules did not accept it', {
        value: value instanceof Date || typeof value === 'string' || typeof value === 'number' ? value : String(value),
        evidence: 'regex fallback',
      });
    }
  }

  const missingKeyFields: Array<[EnrichmentField, string]> = [
    ['companyName', 'missing_supplier_name'],
    ['expiryDate', 'missing_expiry_date'],
    ['bbbeeLevel', 'missing_level'],
  ];
  for (const [field, reason] of missingKeyFields) {
    if (fields.includes(field) && !accepted.has(field)) {
      pushReview(reviews, field, reason);
    }
  }
  if (
    fields.includes('vatNumber')
    && !accepted.has('vatNumber')
  ) {
    pushReview(reviews, 'vatNumber', 'missing_vat_number');
  }

  return candidates;
}

function createAuditEntry(params: {
  dryRun: boolean;
  blobName: string;
  extractionMode: CertificateExtractionMode;
  extractedTextLength: number;
  extractionStatus: string;
  updates: Record<string, unknown>;
  reviewFields: ReviewField[];
}) {
  return {
    id: randomUUID(),
    at: new Date(),
    type: 'certificate_enrichment',
    version: CERTIFICATE_ENRICHMENT_VERSION,
    dryRun: params.dryRun,
    blobName: params.blobName,
    extractionMode: params.extractionMode,
    extractedTextLength: params.extractedTextLength,
    extractionStatus: params.extractionStatus,
    updatedFields: Object.keys(params.updates),
    reviewFields: params.reviewFields.map((r) => r.field),
  };
}

async function listAzureBlobs(blobServiceClient: BlobServiceClient): Promise<Array<{ name: string; lastModified: Date | null }>> {
  const container = getCertContainerClient(blobServiceClient);
  const blobs: Array<{ name: string; lastModified: Date | null }> = [];
  for await (const blob of container.listBlobsFlat()) {
    blobs.push({
      name: blob.name,
      lastModified: blob.properties.lastModified ?? null,
    });
  }
  return blobs;
}

function existingText(doc: MongoDoc | null): string {
  const text = typeof doc?.extractedText === 'string' ? doc.extractedText.trim() : '';
  return hasUsableCertificateExtractedText(doc) && hasUsefulExtractedText(text) ? text : '';
}

async function loadMetadataMap(blobNames: string[]): Promise<Map<string, MongoDoc>> {
  const map = new Map<string, MongoDoc>();
  const chunkSize = 500;
  for (let i = 0; i < blobNames.length; i += chunkSize) {
    const chunk = blobNames.slice(i, i + chunkSize);
    const basenames = chunk.map(blobBasename);
    const docs = await CertificateMetadataModel.find({
      $or: [
        { blobName: { $in: chunk } },
        { fileName: { $in: basenames } },
      ],
    }).lean();
    for (const doc of docs as MongoDoc[]) {
      for (const key of [doc.blobName, doc.fileName, blobBasename(doc.blobName || '')]) {
        if (typeof key === 'string' && key && !map.has(key)) map.set(key, doc);
      }
    }
  }
  return map;
}

async function listUsableTextMetadataDocs(fields: EnrichmentField[], force: boolean, limit: number): Promise<Array<{ blob: { name: string; lastModified: Date | null }; doc: MongoDoc }>> {
  const docs = await CertificateMetadataModel.find({
    ...usableTextQuery(),
  }).sort({ updatedAt: 1 }).limit(Math.max(limit * 4, limit)).lean();

  return (docs as MongoDoc[])
    .filter((doc) => typeof doc.blobName === 'string' && doc.blobName)
    .filter((doc) => needsEnrichment(doc, fields, force))
    .slice(0, limit)
    .map((doc) => ({
      blob: { name: doc.blobName, lastModified: doc.updatedAt ?? null },
      doc,
    }));
}

function needsEnrichment(doc: MongoDoc | null, fields: EnrichmentField[], force: boolean): boolean {
  if (force) return true;
  if (!doc) return true;
  return fields.some((field) => !hasValue(doc[FIELD_TO_MONGO[field]]));
}

function usableTextQuery() {
  return {
    extractionStatus: 'completed',
    extractionMode: { $in: ['azure_document_intelligence', 'pdf_text', 'ocr'] },
    extractedTextLength: { $gte: MIN_USEFUL_EXTRACTED_TEXT_LENGTH },
    extractedText: { $type: 'string', $nin: ['', null] },
  };
}

async function calculateCoverage(fields: EnrichmentField[]): Promise<Record<EnrichmentField, string>> {
  const total = await CertificateMetadataModel.countDocuments();
  const coverage = {} as Record<EnrichmentField, string>;
  for (const field of fields) {
    const mongoField = FIELD_TO_MONGO[field];
    const count = await countPresentCertificateField(mongoField);
    coverage[field] = `${count}/${total}`;
  }
  return coverage;
}

export async function countPresentCertificateField(field: string): Promise<number> {
  const result = await CertificateMetadataModel.aggregate([
    {
      $match: {
        $expr: {
          $and: [
            { $ne: [`$${field}`, null] },
            { $ne: [`$${field}`, ''] },
          ],
        },
      },
    },
    { $count: 'count' },
  ]);
  return Number(result[0]?.count ?? 0);
}

export async function countPresentAnyCertificateField(fields: string[]): Promise<number> {
  const result = await CertificateMetadataModel.aggregate([
    {
      $match: {
        $expr: {
          $or: fields.map((field) => ({
            $and: [
              { $ne: [`$${field}`, null] },
              { $ne: [`$${field}`, ''] },
            ],
          })),
        },
      },
    },
    { $count: 'count' },
  ]);
  return Number(result[0]?.count ?? 0);
}

export async function calculateProductionFieldCoverage(): Promise<Record<string, number>> {
  const fieldMap: Record<string, string> = {
    companyCount: 'supplierName',
    sectorCount: 'sectorCode',
    vatNumberCount: 'vatNumber',
    bbbeeLevelCount: 'bbbeeLevel',
    companySizeCount: 'companySize',
    expiryDateCount: 'expiryDate',
  };
  const entries = await Promise.all(Object.entries(fieldMap).map(async ([label, field]) => [
    label,
    await countPresentCertificateField(field),
  ] as const));
  return {
    ...Object.fromEntries(entries),
    ownershipCount: await countPresentAnyCertificateField(['blackOwnership', 'blackWomenOwnership']),
    blackOwnershipCount: await countPresentCertificateField('blackOwnership'),
    blackWomenOwnershipCount: await countPresentCertificateField('blackWomenOwnership'),
  };
}

export async function getProductionCertificateCoverage() {
  const [totalCertificates, usableTextCount, fieldCoverage] = await Promise.all([
    CertificateMetadataModel.countDocuments(),
    CertificateMetadataModel.countDocuments(usableTextQuery()),
    calculateProductionFieldCoverage(),
  ]);
  return {
    totalCertificates,
    usableTextCount,
    skippedMissingText: Math.max(0, totalCertificates - usableTextCount),
    productionFields: [
      'company',
      'sector',
      'vatNumber',
      'bbbeeLevel',
      'companySize',
      'ownership',
      'expiryDate',
    ],
    fieldCoverage,
  };
}

function statusForResult(updates: Record<string, unknown>, reviewFields: ReviewField[], failed = false): EnrichmentStatus {
  if (failed) return 'failed';
  if (reviewFields.length > 0) return 'review_required';
  if (Object.keys(updates).length > 0) return 'completed';
  return 'completed';
}

function reviewLinks(blobName: string, fileName: string, reviewFields: ReviewField[]) {
  return {
    blobName,
    fileName,
    reviewFields,
    reviewUrl: certificateReviewUrl(blobName),
    previewUrl: certificateDownloadUrl(blobName, 'inline'),
    downloadUrl: certificateDownloadUrl(blobName, 'attachment'),
  };
}

export async function runCertificateEnrichmentJob(
  blobServiceClient: BlobServiceClient,
  options: CertificateEnrichmentOptions = {},
): Promise<CertificateEnrichmentResult> {
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const onlyUsableText = options.onlyUsableText === true;
  const forceText = onlyUsableText ? false : options.forceText === true;
  const includeDetails = options.includeDetails === true;
  const reviewSampleLimit = Math.min(Math.max(Number(options.reviewSampleLimit) || 50, 0), 500);
  const fields = selectedFields(options.fields);
  const requestedLimit = Number(options.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), 5_000)
    : 50;
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const [totalCertificates, usableTextCount] = await Promise.all([
    CertificateMetadataModel.countDocuments(),
    CertificateMetadataModel.countDocuments(usableTextQuery()),
  ]);
  const allCandidates = !onlyUsableText
    ? await (async () => {
        const blobs = await listAzureBlobs(blobServiceClient);
        const metadataMap = await loadMetadataMap(blobs.map((b) => b.name));
        return blobs
          .map((blob) => ({
            blob,
            doc: metadataMap.get(blob.name) ?? metadataMap.get(blobBasename(blob.name)) ?? null,
          }))
          .filter(({ doc }) => needsEnrichment(doc, fields, force))
          .slice(0, limit);
      })()
    : await listUsableTextMetadataDocs(fields, force, limit);

  logger.info('Certificate enrichment batch started', {
    candidates: allCandidates.length,
    totalCertificates,
    dryRun,
    force,
    forceText,
    onlyUsableText,
    fields,
  });

  const container = onlyUsableText ? null : getCertContainerClient(blobServiceClient);
  const result: CertificateEnrichmentResult = {
    totalCertificates,
    usableTextCount,
    enrichedCount: 0,
    skippedMissingText: Math.max(0, totalCertificates - usableTextCount),
    reviewRequiredCount: 0,
    failedCount: 0,
    fieldCoverage: {},
    processed: 0,
    updated: 0,
    reviewRequired: 0,
    failed: 0,
    dryRun,
    coverage: {} as Record<EnrichmentField, string>,
    reviewSamples: [],
    details: [],
  };

  for (const { blob, doc } of allCandidates) {
    const fileName = blobBasename(blob.name);
    const reviewFields: ReviewField[] = [];
    const updates: Record<string, unknown> = {};
    const confidenceUpdates: Record<string, unknown> = {};
    let extractionMode: CertificateExtractionMode = 'none';
    let extractedTextLength = 0;
    let extractionStatus: 'completed' | 'text_too_short' = 'text_too_short';

    result.processed++;
    try {
      if (!dryRun && doc?.blobName) {
        await CertificateMetadataModel.updateOne(
          { blobName: doc.blobName },
          { $set: { enrichmentStatus: 'processing', updatedAt: new Date() } },
        );
      }

      let text = !forceText ? existingText(doc) : '';
      if (text) {
        extractionMode = (doc?.extractionMode as CertificateExtractionMode) || 'pdf_text';
        extractedTextLength = usefulExtractedTextLength(text);
        extractionStatus = 'completed';
      } else if (onlyUsableText) {
        pushReview(reviewFields, 'companyName', 'Certificate is pending text recovery; enrichment skipped until usable extracted text exists');
        result.reviewRequired++;
        if (result.reviewSamples.length < reviewSampleLimit) {
          result.reviewSamples.push(reviewLinks(blob.name, fileName, reviewFields));
        }
        if (includeDetails) {
          result.details.push({
            status: 'pending_text_recovery',
            updates: {},
            ...reviewLinks(blob.name, fileName, reviewFields),
          });
        }
        continue;
      } else {
        if (!container) throw new Error('Azure certificate container is unavailable for text extraction');
        const buffer = await container.getBlobClient(blob.name).downloadToBuffer();
        const extracted = await extractTextFromBuffer(buffer, fileName);
        text = extracted.text;
        extractionMode = extracted.extractionMode;
        extractedTextLength = usefulExtractedTextLength(text);
        extractionStatus = extractionStatusForText(text) as 'completed' | 'text_too_short';
        if (!dryRun && extractionStatus === 'completed') {
          updates.extractedText = text.substring(0, 4000);
        }
      }

      if (extractionStatus !== 'completed') {
        pushReview(reviewFields, 'companyName', 'No usable extracted text; only filename-safe metadata can be considered');
      }

      const fieldCandidates = collectFieldCandidates(text, fileName, fields, reviewFields);
      for (const candidate of fieldCandidates) {
        if (candidate.confidence < MIN_SAVE_CONFIDENCE[candidate.field]) {
          pushReview(reviewFields, candidate.field, 'Candidate confidence below safe-save threshold', candidate);
          continue;
        }
        if (!shouldUpdateField(doc, candidate.field, candidate, force)) continue;

        updates[candidate.mongoField] = candidate.value;
        confidenceUpdates[candidate.field] = {
          confidence: candidate.confidence,
          source: candidate.source,
          extractionMethod: candidate.source === 'filename' ? 'filename_safe_fallback' : candidate.source === 'trusted_mapping' ? 'text_parser' : 'text_regex',
          evidence: candidate.evidence,
          sourceTextSnippet: candidate.evidence,
          version: CERTIFICATE_ENRICHMENT_VERSION,
          at: new Date(),
        };
      }

      if (updates.vatNumber) {
        updates.vatNumberNormalized = normalizeVat(String(updates.vatNumber));
      }
      if (updates.expiryDate instanceof Date) {
        const now = new Date();
        const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
        updates.status = updates.expiryDate < now ? 'expired' : updates.expiryDate <= sixtyDays ? 'expiring' : 'valid';
      }

      if (extractionStatus !== 'completed' && fieldCandidates.some((c) => c.source === 'filename')) {
        extractionMode = 'filename_only';
      }
      updates.extractionStatus = extractionStatus;
      updates.extractionMode = extractionMode;
      updates.extractedTextLength = extractedTextLength;
      updates.extractionError = extractionStatus === 'completed'
        ? null
        : `No usable extracted text (${extractedTextLength} chars)`;
      updates.extractedAt = new Date();
      updates.processedAt = new Date();

      const status = statusForResult(updates, reviewFields);
      if (reviewFields.length > 0) result.reviewRequired++;
      if (Object.keys(updates).length > 0) result.updated++;
      if (reviewFields.length > 0 && result.reviewSamples.length < reviewSampleLimit) {
        result.reviewSamples.push(reviewLinks(blob.name, fileName, reviewFields));
      }

      logger.info('Certificate enrichment extraction completed', {
        blobName: blob.name,
        fileName,
        downloadSucceeded: true,
        extractionMode,
        extractedTextLength,
        extractionStatus,
        extractionError: updates.extractionError,
      });

      const auditEntry = createAuditEntry({
        dryRun,
        blobName: blob.name,
        extractionMode,
        extractedTextLength,
        extractionStatus,
        updates,
        reviewFields,
      });
      if (!dryRun) {
        const updateDoc = {
          $set: {
            blobName: blob.name,
            fileName,
            ...updates,
            enrichmentStatus: status,
            lastEnrichedAt: new Date(),
            enrichmentVersion: CERTIFICATE_ENRICHMENT_VERSION,
            reviewFields: reviewFields.map((r) => r.field),
            ...(Object.keys(confidenceUpdates).length ? { fieldConfidence: { ...(doc?.fieldConfidence ?? {}), ...confidenceUpdates } } : {}),
            updatedAt: new Date(),
          },
          $inc: {
            extractionAttempts: text ? 0 : 1,
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
          $push: {
            auditLog: {
              $each: [auditEntry],
              $slice: -50,
            },
          },
        };
        await CertificateMetadataModel.findOneAndUpdate(
          { blobName: blob.name },
          updateDoc,
          { upsert: true, returnDocument: 'after' },
        );
      }

      if (includeDetails) {
        result.details.push({
          status: dryRun ? 'dry_run' : status,
          updates: responseUpdates(updates),
          ...reviewLinks(blob.name, fileName, reviewFields),
        });
      }
    } catch (err: any) {
      result.failed++;
      const failureReviewFields: ReviewField[] = [{
        field: 'companyName',
        reason: 'Certificate enrichment failed before safe metadata could be saved',
        evidence: errorMessage(err),
      }];
      logger.error('Certificate enrichment failed', { blobName: blob.name, error: errorDetails(err) });
      if (!dryRun) {
        await CertificateMetadataModel.findOneAndUpdate(
          { blobName: blob.name },
          {
            $set: {
              blobName: blob.name,
              fileName,
              enrichmentStatus: 'failed',
              extractionStatus: 'failed',
              extractionMode: 'failed',
              extractionError: errorMessage(err),
              extractedAt: new Date(),
              lastEnrichedAt: new Date(),
              enrichmentVersion: CERTIFICATE_ENRICHMENT_VERSION,
              updatedAt: new Date(),
            },
            $inc: {
              extractionAttempts: 1,
            },
            $push: {
              auditLog: {
                $each: [{
                  id: randomUUID(),
                  at: new Date(),
                  type: 'certificate_enrichment_failed',
                  version: CERTIFICATE_ENRICHMENT_VERSION,
                  blobName: blob.name,
                  error: errorDetails(err),
                }],
                $slice: -50,
              },
            },
          },
          { upsert: true, returnDocument: 'after' },
        );
      }
      if (result.reviewSamples.length < reviewSampleLimit) {
        result.reviewSamples.push(reviewLinks(blob.name, fileName, failureReviewFields));
      }
      if (includeDetails) {
        result.details.push({
          status: 'failed',
          updates: {},
          ...reviewLinks(blob.name, fileName, failureReviewFields),
          error: errorMessage(err),
        });
      }
    }

    if (result.processed % 25 === 0 || result.processed === allCandidates.length) {
      logger.info('Certificate enrichment progress', {
        processed: result.processed,
        candidates: allCandidates.length,
        updated: result.updated,
        reviewRequired: result.reviewRequired,
        failed: result.failed,
      });
    }
  }

  result.enrichedCount = result.updated;
  result.reviewRequiredCount = result.reviewRequired;
  result.failedCount = result.failed;
  result.coverage = await calculateCoverage(fields);
  result.fieldCoverage = await calculateProductionFieldCoverage();
  return result;
}
