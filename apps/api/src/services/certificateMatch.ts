/**
 * Supplier → certificate matching. The join between the certificate registry
 * and the procurement pillar.
 *
 * WHAT THIS IS FOR
 *
 * A client's procurement schedule names its suppliers and states what it spent.
 * It rarely states their B-BBEE level, and almost never their black ownership,
 * size or empowering-supplier status — the facts that actually SCORE. Those live
 * on each supplier's certificate, and we hold 2,951 of them. This module answers
 * one question, in bulk: for this supplier, which certificate in the registry is
 * theirs?
 *
 * WHY IT IS NOT JUST A NAME SEARCH
 *
 * The registry's `search` is an unanchored regex OR across ten fields — perfect
 * for a human scanning a directory, wrong for autofill. "Lake" matches Lake
 * Trading, Lakeside Freight and Blake Motors, and putting Blake Motors'
 * Level 1 onto Lake Trading's spend inflates the client's score with someone
 * else's certificate. So matching here is deliberately conservative:
 *
 *   1. IDENTIFIERS BEAT NAMES. A registration or VAT number is an identity
 *      claim; a name is a label. Numbers are tried first.
 *
 *   2. AN IDENTIFIER SHARED BY TWO COMPANIES IS NOT AN IDENTIFIER. A registry
 *      audit found one VAT attached to 14 different companies and 506 of 2,951
 *      certificates carrying a VAT that belongs to someone else — the agency's,
 *      usually, read out of the same page. Some are legitimate group
 *      certificates. Either way a number that points at two entities cannot
 *      identify one, so it is dropped as a match key. (This is the cross-record
 *      check `certificateFieldValidation` documents as living in
 *      `reconcileSharedCertificateFields` — it now exists, here, where the whole
 *      registry is in hand.)
 *
 *   3. FUZZY IS A LAST RESORT WITH A FLOOR. Edit-distance over canonicalised
 *      names catches "ABC Traders (PTY) LTD" vs "ABC Traders Pty Ltd" and stops
 *      well short of merging different companies.
 *
 *   4. A TIE IS A REFUSAL. When two DIFFERENT entities score within a hair of
 *      each other, no match is returned. Silence is recoverable; the wrong
 *      certificate is not.
 *
 *   5. NOTHING IMPLAUSIBLE IS EVER OFFERED. Every value is run back through
 *      `certificateFieldValidation` before it leaves here, so a level of 47 or a
 *      120% ownership stays in the registry and never reaches a scorecard.
 *
 * The caller decides what to do with a match; this module never writes anything.
 */
import { CertificateMetadataModel } from '../../models.js';
import { isMongoConnected } from '../../db.js';
import { buildCertSlug } from './certificateNormalize.js';
import {
  isPlausibleBbbeeLevel,
  isPlausibleOwnership,
  isValidSaVatNumber,
  looksLikeAgencyReference,
  ownershipPairIsCoherent,
} from './certificateFieldValidation.js';
import { createLogger } from '../logger.js';

const logger = createLogger('CertificateMatch');

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** How a certificate was tied to the supplier — reported so a human can judge it. */
export type MatchBasis =
  | 'registration'
  | 'vat'
  | 'name-exact'
  | 'name-reordered'
  | 'name-fuzzy';

export type NoMatchReason =
  | 'no-identifiers'
  | 'registry-unavailable'
  | 'no-candidate'
  | 'ambiguous'
  | 'below-threshold';

/**
 * Certificate facts expressed in the workbook's PROCUREMENT COLUMN vocabulary.
 *
 * Deliberately not the certificate's own field names: the workbook columns are
 * the shared procurement vocabulary in this codebase (the parser field bridge
 * already targets them), so translating once here means every caller — parser
 * flow, section import, manual grid, Toolkit dialog — applies the same values
 * without its own mapping table drifting out of step.
 */
export interface ProcurementCertificateFields {
  bbbeeLevel?: string;
  currentSize?: string;
  currentBlackOwnership?: number;
  currentBlackFemaleOwnership?: number;
  registrationNumber?: string;
  vatNumber?: string;
  certificateExpiryDate?: string;
  empoweringSupplier?: string;
  sdRecipient?: string;
  threeYearContract?: string;
  designated?: string;
  sizeAtFirstProcurement?: string;
  firstProcurementDate?: string;
  measuredUnder?: string;
}

/** One certificate offered as this supplier's. */
export interface CertificateMatchCandidate {
  certificateId: string | null;
  slug: string | null;
  companyName: string;
  certificateNumber: string | null;
  agency: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  /** Validity AT THE MEASUREMENT DATE, not today. */
  validAtAsOf: boolean;
  verified: boolean;
  basis: MatchBasis;
  /** 0–1. 1.0 for an unambiguous identifier hit. */
  confidence: number;
  fields: ProcurementCertificateFields;
}

export interface SupplierMatchQuery {
  /** Caller's row id. Echoed back untouched so results can be re-joined. */
  key: string;
  name?: string | null;
  registrationNumber?: string | null;
  vatNumber?: string | null;
}

export interface SupplierMatchResult {
  key: string;
  match: CertificateMatchCandidate | null;
  /**
   * Other certificates for the SAME entity — renewals, and the expired ones a
   * measurement period may still need. Never a different company.
   */
  alternatives: CertificateMatchCandidate[];
  reason?: NoMatchReason;
  /** Company names that tied, when the refusal was `ambiguous`. */
  ambiguousWith?: string[];
}

export interface MatchOptions {
  /**
   * Certificates are preferred if valid on this date — the measurement period
   * end, not today. A supplier measured for FY2025 is qualified by the
   * certificate that was live then, even if it has since lapsed.
   */
  asOf?: Date;
  /** Minimum name similarity for a fuzzy match. */
  threshold?: number;
  /** Include expired/superseded certificates in `alternatives`. */
  includeAlternatives?: boolean;
}

/** Tolerant of suffix, spacing and OCR noise; strict enough not to merge companies. */
export const DEFAULT_NAME_THRESHOLD = 0.88;

/** Two different entities within this much of each other is a tie, not a winner. */
const AMBIGUITY_MARGIN = 0.03;

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const LEGAL_SUFFIXES =
  /\b(proprietary limited|proprietary|pty\.? ?ltd\.?|pty|ltd\.?|limited|incorporated|inc\.?|cc|npc|npo|soc|trust|t\/a|ta)\b/gi;

/** Lowercase, drop legal suffixes and punctuation, collapse space. Matching only. */
export function canonicalName(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Word order is not identity: an ageing debtors report writes "Hauliers,
 * Thandanani" where the schedule writes "Thandanani Hauliers". Tokens sorted,
 * trailing plurals dropped — every step exact, nothing guessed.
 */
export function nameSortKey(value: string | null | undefined): string {
  return canonicalName(value)
    .split(' ')
    .filter(Boolean)
    .map((t) => t.replace(/s$/, ''))
    .sort()
    .join(' ');
}

/** SA company registration numbers: 1234/567890/07, or a bare digit run. */
export function normalizeRegistrationNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = String(value).toUpperCase().replace(/\s+/g, '').replace(/[()]/g, '');
  if (/^\d{4}\/\d{6}\/\d{2,3}$/.test(cleaned)) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  // Separators are formatting, not identity: "202012345607" and
  // "2020/123456/07" are one number, so both canonicalise to the slashed form.
  if (digits.length === 12 || digits.length === 13) {
    return `${digits.slice(0, 4)}/${digits.slice(4, 10)}/${digits.slice(10)}`;
  }
  if (digits.length >= 10 && digits.length <= 14) return digits;
  return null;
}

/** Only a structurally valid SA VAT number is usable as an identity key. */
export function normalizeVatKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return isValidSaVatNumber(digits) ? digits : null;
}

/** Levenshtein distance, two-row (O(min) memory). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Similarity in [0,1] over already-canonical strings. */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/** The subset of a certificate matching needs. Kept lean — this is all in memory. */
export interface IndexedCertificate {
  id: string | null;
  slug: string | null;
  companyName: string;
  tradingName: string | null;
  canonical: string;
  sortKey: string;
  tokens: string[];
  registrationKey: string | null;
  vatKey: string | null;
  /** Groups renewals of the same company together. */
  entityKey: string;
  issueDate: Date | null;
  expiryDate: Date | null;
  verified: boolean;
  certificateNumber: string | null;
  agency: string | null;
  raw: RawCertificate;
}

export interface RawCertificate {
  companySize: string | null;
  bbbeeLevel: number | null;
  bbbeeLevelStatus: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  blackDesignatedGroupOwnership: number | null;
  empoweringSupplier: boolean | null;
  sdRecipient: boolean | null;
  threeYearContract: boolean | null;
  firstProcurementDate: Date | null;
  sizeAtFirstProcurement: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  sectorCode: string | null;
  verificationAgency: string | null;
  certificateNumber: string | null;
}

export interface MatchIndex {
  certificates: IndexedCertificate[];
  byRegistration: Map<string, IndexedCertificate[]>;
  byVat: Map<string, IndexedCertificate[]>;
  byCanonical: Map<string, IndexedCertificate[]>;
  bySortKey: Map<string, IndexedCertificate[]>;
  /** token → certificates containing it. Blocking set for the fuzzy pass. */
  byToken: Map<string, IndexedCertificate[]>;
  /** Identifiers held by more than one distinct entity — unusable as match keys. */
  sharedRegistrations: Set<string>;
  sharedVats: Set<string>;
  builtAt: number;
}

const INDEX_TTL_MS = 5 * 60 * 1000;
/** A token this common blocks nothing — scanning it costs more than it saves. */
const MAX_TOKEN_POSTINGS = 400;
const MIN_TOKEN_LENGTH = 4;

let cachedIndex: MatchIndex | null = null;
let inFlight: Promise<MatchIndex> | null = null;

const PROJECTION = {
  id: 1,
  supplierName: 1,
  tradingName: 1,
  fileName: 1,
  registrationNumber: 1,
  vatNumber: 1,
  companySize: 1,
  bbbeeLevel: 1,
  bbbeeLevelStatus: 1,
  blackOwnership: 1,
  blackWomenOwnership: 1,
  blackDesignatedGroupOwnership: 1,
  empoweringSupplier: 1,
  sdRecipient: 1,
  threeYearContract: 1,
  firstProcurementDate: 1,
  sizeAtFirstProcurement: 1,
  issueDate: 1,
  expiryDate: 1,
  certificateNumber: 1,
  verificationAgency: 1,
  sectorCode: 1,
  verified: 1,
} as const;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBool(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  return null;
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

export function indexCertificate(doc: Record<string, unknown>): IndexedCertificate | null {
  const companyName = toStr(doc.supplierName) ?? '';
  const tradingName = toStr(doc.tradingName);
  // No name and no identifier means nothing can ever match it — a filename-only
  // registry row. Indexing it would only add noise to the fuzzy pass.
  const canonical = canonicalName(companyName || tradingName);
  const registrationKey = normalizeRegistrationNumber(toStr(doc.registrationNumber));
  const vatKey = normalizeVatKey(toStr(doc.vatNumber));
  if (!canonical && !registrationKey && !vatKey) return null;

  const tokens = Array.from(
    new Set(canonical.split(' ').filter((t) => t.length >= MIN_TOKEN_LENGTH)),
  );

  return {
    id: toStr(doc.id),
    slug: buildCertSlug(companyName, toStr(doc.id)),
    companyName: companyName || tradingName || 'Unknown company',
    tradingName,
    canonical,
    sortKey: nameSortKey(companyName || tradingName),
    tokens,
    registrationKey,
    vatKey,
    // Provisional. Rewritten in buildMatchIndex once the whole registry is in
    // hand and shared identifiers are known — see assignEntityKeys.
    entityKey: registrationKey ? `reg:${registrationKey}` : `name:${canonical}`,
    issueDate: toDate(doc.issueDate),
    expiryDate: toDate(doc.expiryDate),
    verified: doc.verified === true,
    certificateNumber: toStr(doc.certificateNumber),
    agency: toStr(doc.verificationAgency),
    raw: {
      companySize: toStr(doc.companySize),
      bbbeeLevel: toNumber(doc.bbbeeLevel),
      bbbeeLevelStatus: toStr(doc.bbbeeLevelStatus),
      blackOwnership: toNumber(doc.blackOwnership),
      blackWomenOwnership: toNumber(doc.blackWomenOwnership),
      blackDesignatedGroupOwnership: toNumber(doc.blackDesignatedGroupOwnership),
      empoweringSupplier: toBool(doc.empoweringSupplier),
      sdRecipient: toBool(doc.sdRecipient),
      threeYearContract: toBool(doc.threeYearContract),
      firstProcurementDate: toDate(doc.firstProcurementDate),
      sizeAtFirstProcurement: toStr(doc.sizeAtFirstProcurement),
      registrationNumber: toStr(doc.registrationNumber),
      vatNumber: toStr(doc.vatNumber),
      sectorCode: toStr(doc.sectorCode),
      verificationAgency: toStr(doc.verificationAgency),
      certificateNumber: toStr(doc.certificateNumber),
    },
  };
}

function push<K>(map: Map<K, IndexedCertificate[]>, key: K, cert: IndexedCertificate): void {
  const list = map.get(key);
  if (list) list.push(cert);
  else map.set(key, [cert]);
}

/**
 * Decide which certificates are the SAME COMPANY, once the whole registry is
 * visible.
 *
 * Grouping matters because the fuzzy tier scores per entity and then returns a
 * certificate from the winning group. If a group spans two companies, the score
 * can come from one and the certificate from the other — and the caller is
 * handed a certificate that never matched anything, at a confidence it never
 * earned. A dry run over the real corpus produced exactly that: a query for
 * "The Standard Bank of South Africa" answered with Sandoz South Africa's
 * certificate at 0.939, when those two names score 0.545 against each other.
 *
 * The cause was grouping by registration number before knowing whether that
 * number was trustworthy. Certificate text puts the VERIFICATION AGENCY's
 * registration number on the same page as the client's, so one agency's number
 * can appear on hundreds of certificates and fuse hundreds of unrelated
 * companies into a single "entity".
 *
 * So: a registration number groups certificates only if the registry does not
 * also show it against a different company. Otherwise the company NAME is the
 * grouping key, and a group can never span two names.
 */
function assignEntityKeys(
  certificates: IndexedCertificate[],
  sharedRegistrations: Set<string>,
): void {
  for (const cert of certificates) {
    if (cert.registrationKey && !sharedRegistrations.has(cert.registrationKey)) {
      cert.entityKey = `reg:${cert.registrationKey}`;
    } else if (cert.canonical) {
      cert.entityKey = `name:${cert.canonical}`;
    } else {
      // No trustworthy number and no name: its own entity, so it can never be
      // lumped in with — or returned instead of — anything else.
      cert.entityKey = `id:${cert.id ?? Math.random().toString(36).slice(2)}`;
    }
  }
}

/** Build the lookup structures. Exported so tests can drive it without Mongo. */
export function buildMatchIndex(docs: Array<Record<string, unknown>>): MatchIndex {
  const certificates: IndexedCertificate[] = [];
  const byRegistration = new Map<string, IndexedCertificate[]>();
  const byVat = new Map<string, IndexedCertificate[]>();
  const byCanonical = new Map<string, IndexedCertificate[]>();
  const bySortKey = new Map<string, IndexedCertificate[]>();
  const byToken = new Map<string, IndexedCertificate[]>();

  for (const doc of docs) {
    const cert = indexCertificate(doc);
    if (!cert) continue;
    certificates.push(cert);
    if (cert.registrationKey) push(byRegistration, cert.registrationKey, cert);
    if (cert.vatKey) push(byVat, cert.vatKey, cert);
    if (cert.canonical) {
      push(byCanonical, cert.canonical, cert);
      push(bySortKey, cert.sortKey, cert);
    }
    for (const token of cert.tokens) push(byToken, token, cert);
  }

  // An identifier pointing at two DIFFERENT entities identifies neither. Whether
  // that is field bleed (the agency's VAT on 14 certificates) or a legitimate
  // group certificate, it cannot select one supplier, so it is not a key.
  const sharedRegistrations = new Set<string>();
  for (const [key, list] of byRegistration) {
    if (new Set(list.map((c) => c.canonical).filter(Boolean)).size > 1) sharedRegistrations.add(key);
  }
  const sharedVats = new Set<string>();
  for (const [key, list] of byVat) {
    if (new Set(list.map((c) => c.canonical).filter(Boolean)).size > 1) sharedVats.add(key);
  }

  assignEntityKeys(certificates, sharedRegistrations);

  return {
    certificates,
    byRegistration,
    byVat,
    byCanonical,
    bySortKey,
    byToken,
    sharedRegistrations,
    sharedVats,
    builtAt: Date.now(),
  };
}

/** Load (or reuse) the registry index. Concurrent callers share one load. */
export async function getMatchIndex(force = false): Promise<MatchIndex | null> {
  if (!force && cachedIndex && Date.now() - cachedIndex.builtAt < INDEX_TTL_MS) return cachedIndex;
  if (!isMongoConnected()) return cachedIndex ?? null;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const docs = (await CertificateMetadataModel.find({}, PROJECTION).lean()) as Array<
      Record<string, unknown>
    >;
    const index = buildMatchIndex(docs);
    logger.info('Certificate match index built', {
      matchable: index.certificates.length,
      records: docs.length,
      sharedRegistrationsExcluded: index.sharedRegistrations.size,
      sharedVatsExcluded: index.sharedVats.size,
    });
    cachedIndex = index;
    return index;
  })();

  try {
    return await inFlight;
  } catch (err) {
    logger.error('Failed to build certificate match index', err);
    return cachedIndex ?? null;
  } finally {
    inFlight = null;
  }
}

/** Drop the cache — for tests, and after a registry sync. */
export function invalidateMatchIndex(): void {
  cachedIndex = null;
}

/** Seed the cache directly. Tests only. */
export function primeMatchIndex(docs: Array<Record<string, unknown>>): void {
  cachedIndex = buildMatchIndex(docs);
}

// ---------------------------------------------------------------------------
// Certificate → procurement columns
// ---------------------------------------------------------------------------

function mapCompanySize(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/^eme$/i.test(s) || /exempt/i.test(s)) return 'EME';
  if (/^qse$/i.test(s) || /qualifying\s+small/i.test(s)) return 'QSE';
  // The workbook models three sizes; "Large" is Generic for scoring purposes.
  if (/generic/i.test(s) || /large/i.test(s)) return 'Generic';
  // "Specialised" and anything unrecognised: leave blank rather than guess.
  return undefined;
}

function isoDate(d: Date | null): string | undefined {
  if (!d || !Number.isFinite(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function yesNo(v: boolean | null): string | undefined {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return undefined;
}

/**
 * Translate a certificate into procurement column values, dropping anything
 * that fails validation.
 *
 * The same fail-closed rule the extractor uses: a wrong value is worse than a
 * missing one, because a blank cell invites a look at the document while a
 * wrong level is quietly authoritative and scores.
 */
export function certificateToProcurementFields(cert: IndexedCertificate): ProcurementCertificateFields {
  const raw = cert.raw;
  const fields: ProcurementCertificateFields = {};

  if (isPlausibleBbbeeLevel(raw.bbbeeLevel)) {
    fields.bbbeeLevel = String(raw.bbbeeLevel);
  } else if (raw.bbbeeLevelStatus && /non[-\s]?compliant/i.test(raw.bbbeeLevelStatus)) {
    fields.bbbeeLevel = 'Non-compliant';
  }

  const size = mapCompanySize(raw.companySize);
  if (size) fields.currentSize = size;

  // Ownership travels as a coherent PAIR or not at all — a black-women figure
  // above total black ownership means one of the two was misread, and filling
  // either half of a broken pair puts a number nobody can defend on a scorecard.
  const ownershipCoherent = ownershipPairIsCoherent(raw.blackOwnership, raw.blackWomenOwnership);
  if (ownershipCoherent) {
    if (isPlausibleOwnership(raw.blackOwnership)) {
      fields.currentBlackOwnership = raw.blackOwnership as number;
    }
    if (isPlausibleOwnership(raw.blackWomenOwnership)) {
      fields.currentBlackFemaleOwnership = raw.blackWomenOwnership as number;
    }
  }

  if (cert.registrationKey) fields.registrationNumber = cert.registrationKey;
  if (cert.vatKey) fields.vatNumber = cert.vatKey;

  const expiry = isoDate(cert.expiryDate);
  if (expiry) fields.certificateExpiryDate = expiry;

  const es = yesNo(raw.empoweringSupplier);
  if (es) fields.empoweringSupplier = es;
  const sd = yesNo(raw.sdRecipient);
  if (sd) fields.sdRecipient = sd;
  const tyc = yesNo(raw.threeYearContract);
  if (tyc) fields.threeYearContract = tyc;

  // Designated-group status is a claim about the OWNERS, so it is only asserted
  // when the registry actually carries a designated-group percentage.
  if (isPlausibleOwnership(raw.blackDesignatedGroupOwnership)) {
    fields.designated = (raw.blackDesignatedGroupOwnership as number) > 0 ? 'Yes' : 'No';
  }

  const firstSize = mapCompanySize(raw.sizeAtFirstProcurement);
  if (firstSize) fields.sizeAtFirstProcurement = firstSize;
  const firstDate = isoDate(raw.firstProcurementDate);
  if (firstDate) fields.firstProcurementDate = firstDate;

  // Only the generic codes map to this column. ICT/FSC/AGRI are sector codes —
  // a supplier under one of those is not measured under CoGP or RCoGP.
  if (raw.sectorCode && /^rcogp$/i.test(raw.sectorCode)) fields.measuredUnder = 'RCoGP';

  return fields;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function certValidAt(cert: IndexedCertificate, asOf: Date): boolean {
  if (!cert.expiryDate) return false;
  return cert.expiryDate.getTime() >= asOf.getTime();
}

/**
 * How much of a certificate's scoring payload is actually filled. Between two
 * certificates that are equally valid, the one that answers more questions is
 * the more useful autofill.
 */
function payloadRichness(cert: IndexedCertificate): number {
  const f = certificateToProcurementFields(cert);
  return Object.keys(f).length + (cert.verified ? 2 : 0);
}

/**
 * Pick the certificate to offer from one entity's certificates.
 *
 * Validity at the MEASUREMENT DATE comes first — a supplier measured for FY2025
 * is qualified by the certificate that was live then, not by the renewal issued
 * afterwards. Within that, the latest issue wins, then the richer record.
 */
function selectBestCertificate(
  group: IndexedCertificate[],
  asOf: Date,
): { best: IndexedCertificate; rest: IndexedCertificate[] } {
  const ranked = [...group].sort((a, b) => {
    const va = certValidAt(a, asOf) ? 1 : 0;
    const vb = certValidAt(b, asOf) ? 1 : 0;
    if (va !== vb) return vb - va;
    const ia = a.issueDate?.getTime() ?? 0;
    const ib = b.issueDate?.getTime() ?? 0;
    if (ia !== ib) return ib - ia;
    const ea = a.expiryDate?.getTime() ?? 0;
    const eb = b.expiryDate?.getTime() ?? 0;
    if (ea !== eb) return eb - ea;
    return payloadRichness(b) - payloadRichness(a);
  });
  return { best: ranked[0], rest: ranked.slice(1) };
}

function toCandidate(
  cert: IndexedCertificate,
  basis: MatchBasis,
  confidence: number,
  asOf: Date,
): CertificateMatchCandidate {
  return {
    certificateId: cert.id,
    slug: cert.slug,
    companyName: cert.companyName,
    // An agency's own reference is not the client's certificate number; the
    // registry stores some of those, so it is checked on the way out too.
    certificateNumber: looksLikeAgencyReference(cert.certificateNumber, cert.agency)
      ? null
      : cert.certificateNumber,
    agency: cert.agency,
    issueDate: isoDate(cert.issueDate) ?? null,
    expiryDate: isoDate(cert.expiryDate) ?? null,
    validAtAsOf: certValidAt(cert, asOf),
    verified: cert.verified,
    basis,
    confidence,
    fields: certificateToProcurementFields(cert),
  };
}

/**
 * Candidates worth scoring for a name, without walking all 2,951.
 *
 * Certificates sharing a reasonably distinctive token with the query. A token
 * appearing on hundreds of certificates ("transport", "holdings") blocks
 * nothing, so it is skipped — anything it would have contributed is reachable
 * through the query's other tokens.
 */
function blockedCandidates(index: MatchIndex, canonical: string): IndexedCertificate[] {
  const tokens = canonical.split(' ').filter((t) => t.length >= MIN_TOKEN_LENGTH);
  if (tokens.length === 0) {
    // Short names ("BP", "ABC") have no usable token. They are also the names
    // most easily confused, so they get an exact/reordered match only.
    return [];
  }
  const seen = new Set<IndexedCertificate>();
  for (const token of tokens) {
    const postings = index.byToken.get(token);
    if (!postings || postings.length > MAX_TOKEN_POSTINGS) continue;
    for (const cert of postings) seen.add(cert);
  }
  return Array.from(seen);
}

function groupByEntity(certs: IndexedCertificate[]): Map<string, IndexedCertificate[]> {
  const groups = new Map<string, IndexedCertificate[]>();
  for (const cert of certs) {
    const list = groups.get(cert.entityKey);
    if (list) list.push(cert);
    else groups.set(cert.entityKey, [cert]);
  }
  return groups;
}

function buildResult(
  key: string,
  group: IndexedCertificate[],
  basis: MatchBasis,
  confidence: number,
  asOf: Date,
  includeAlternatives: boolean,
): SupplierMatchResult {
  const { best, rest } = selectBestCertificate(group, asOf);
  return {
    key,
    match: toCandidate(best, basis, confidence, asOf),
    alternatives: includeAlternatives ? rest.map((c) => toCandidate(c, basis, confidence, asOf)) : [],
  };
}

/** Match one supplier against a prepared index. Pure — no I/O. */
export function matchSupplierInIndex(
  query: SupplierMatchQuery,
  index: MatchIndex,
  options: MatchOptions = {},
): SupplierMatchResult {
  const asOf = options.asOf ?? new Date();
  const threshold = options.threshold ?? DEFAULT_NAME_THRESHOLD;
  const includeAlternatives = options.includeAlternatives !== false;

  const regKey = normalizeRegistrationNumber(query.registrationNumber);
  const vatKey = normalizeVatKey(query.vatNumber);
  const canonical = canonicalName(query.name);

  if (!regKey && !vatKey && !canonical) {
    return { key: query.key, match: null, alternatives: [], reason: 'no-identifiers' };
  }

  // 1. Registration number — the strongest identity claim, unless the registry
  //    has it against more than one company.
  if (regKey && !index.sharedRegistrations.has(regKey)) {
    const hits = index.byRegistration.get(regKey);
    if (hits?.length) return buildResult(query.key, hits, 'registration', 1, asOf, includeAlternatives);
  }

  // 2. VAT — same rule. 506 registry records carry someone else's VAT, so a VAT
  //    seen on two companies is dropped rather than trusted.
  if (vatKey && !index.sharedVats.has(vatKey)) {
    const hits = index.byVat.get(vatKey);
    if (hits?.length) return buildResult(query.key, hits, 'vat', 1, asOf, includeAlternatives);
  }

  if (!canonical) {
    return { key: query.key, match: null, alternatives: [], reason: 'no-candidate' };
  }

  // 3. Exact canonical name.
  const exact = index.byCanonical.get(canonical);
  if (exact?.length) {
    const groups = groupByEntity(exact);
    if (groups.size === 1) {
      return buildResult(query.key, exact, 'name-exact', 0.99, asOf, includeAlternatives);
    }
    // One name, two registration numbers: two real companies. Refuse.
    return {
      key: query.key,
      match: null,
      alternatives: [],
      reason: 'ambiguous',
      ambiguousWith: Array.from(new Set(exact.map((c) => c.companyName))),
    };
  }

  // 4. Same words, different order.
  const sortKey = nameSortKey(query.name);
  const reordered = sortKey ? index.bySortKey.get(sortKey) : undefined;
  if (reordered?.length) {
    const groups = groupByEntity(reordered);
    if (groups.size === 1) {
      return buildResult(query.key, reordered, 'name-reordered', 0.95, asOf, includeAlternatives);
    }
    return {
      key: query.key,
      match: null,
      alternatives: [],
      reason: 'ambiguous',
      ambiguousWith: Array.from(new Set(reordered.map((c) => c.companyName))),
    };
  }

  // 5. Fuzzy, over the blocked candidate set, scored per ENTITY so a company
  //    with four renewals does not out-vote one with a single certificate.
  const candidates = blockedCandidates(index, canonical);
  if (candidates.length === 0) {
    return { key: query.key, match: null, alternatives: [], reason: 'no-candidate' };
  }

  const scored = new Map<string, { score: number; certs: IndexedCertificate[] }>();
  for (const cert of candidates) {
    if (!cert.canonical) continue;
    const score = Math.max(similarity(canonical, cert.canonical), similarity(sortKey, cert.sortKey));
    const existing = scored.get(cert.entityKey);
    if (existing) {
      existing.certs.push(cert);
      existing.score = Math.max(existing.score, score);
    } else {
      scored.set(cert.entityKey, { score, certs: [cert] });
    }
  }

  const ranked = Array.from(scored.values()).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top || top.score < threshold) {
    return { key: query.key, match: null, alternatives: [], reason: 'below-threshold' };
  }

  // A near-tie between two DIFFERENT companies is a refusal. "Lakeside Freight"
  // and "Lakeside Freights" are one company; "Lake Trading" and "Blake Trading"
  // are not, and nothing here can tell which case it is looking at.
  const runnerUp = ranked[1];
  if (runnerUp && top.score - runnerUp.score < AMBIGUITY_MARGIN) {
    return {
      key: query.key,
      match: null,
      alternatives: [],
      reason: 'ambiguous',
      ambiguousWith: [top.certs[0].companyName, runnerUp.certs[0].companyName],
    };
  }

  return buildResult(query.key, top.certs, 'name-fuzzy', Number(top.score.toFixed(3)), asOf, includeAlternatives);
}

/** Batch entry point. One index load serves the whole schedule. */
export async function matchSuppliers(
  queries: SupplierMatchQuery[],
  options: MatchOptions = {},
): Promise<SupplierMatchResult[]> {
  if (queries.length === 0) return [];
  const index = await getMatchIndex();
  if (!index) {
    return queries.map((q) => ({
      key: q.key,
      match: null,
      alternatives: [],
      reason: 'registry-unavailable' as const,
    }));
  }
  return queries.map((q) => matchSupplierInIndex(q, index, options));
}
