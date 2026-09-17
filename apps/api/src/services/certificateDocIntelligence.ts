/**
 * Structured certificate extraction via Azure Document Intelligence.
 *
 * WHY A SECOND EXTRACTOR EXISTS
 *
 * The regex extractor reads a flat text stream from the PDF text layer. That
 * stream has no columns, no table cells and no key/value association, so on a
 * certificate — which is a FORM — a label and its value can be hundreds of
 * characters apart with somebody else's value in between. The probe that
 * motivated this file found an affidavit whose supplier name extracted as
 * "Trading Name (If Applicable):  Registration Number:  Physical Address:" —
 * the printed labels, not the filled-in values.
 *
 * `prebuilt-document` returns labelled key/value pairs, so "VAT Registration No"
 * is ATTACHED to its value rather than merely near it. This module turns those
 * pairs into our fields.
 *
 * IMPORTANT: this is a GAP FILLER, not a replacement. The caller writes only
 * fields that are currently empty (plus companyRegistrationNumber, which nothing
 * else populates). 99% of supplier names are already correct and there is no
 * reason to pay to re-read them, nor to risk overwriting a good value with a
 * worse one.
 *
 * Model choice: `prebuilt-document`, not `prebuilt-layout` — on api-version
 * 2023-07-31 the keyValuePairs feature is rejected on layout as unsupported.
 */
import { createLogger } from '../logger.js';

const logger = createLogger('CertDocIntelligence');

const API_VERSION = '2023-07-31';

/**
 * A large share of the archive is EME/QSE SWORN AFFIDAVITS rather than
 * agency-issued certificates. An affidavit has no certificate number and no
 * verification agency — it is commissioned by a Commissioner of Oaths — so
 * treating those fields as "missing data" is wrong, and paying to look for them
 * is waste. It also states its B-BBEE level as a TICKED BOX rather than a value.
 */
export type CertificateKind = 'affidavit' | 'certificate';

export interface DocIntelligenceFields {
  companyRegistrationNumber: string | null;
  vatNumber: string | null;
  certificateNumber: string | null;
  bbbeeLevel: number | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  expiryDate: string | null;
  issueDate: string | null;
  verificationAgency: string | null;
  /** Which kind of document this is — populates certificateType, which nothing else does. */
  documentKind: CertificateKind | null;
  /** Pages billed by the service — the caller sums these to report real spend. */
  pages: number;
}

export function emptyDocIntelligenceFields(): DocIntelligenceFields {
  return {
    companyRegistrationNumber: null, vatNumber: null, certificateNumber: null,
    bbbeeLevel: null, blackOwnership: null, blackWomenOwnership: null,
    expiryDate: null, issueDate: null, verificationAgency: null,
    documentKind: null, pages: 0,
  };
}

/**
 * Is this a sworn affidavit? Judged on the machinery of an affidavit — a
 * deponent, a commissioner of oaths, the standard enterprise declaration
 * block — none of which appears on an agency certificate.
 */
export function detectDocumentKind(
  pairs: Array<{ key?: { content?: string }; value?: { content?: string } }>,
): CertificateKind | null {
  const keys = pairs.map((p) => normKey(String(p.key?.content ?? '')));
  const joined = keys.join(' | ');
  const affidavitSignals = [
    /\bdeponent\b/, /\bcommissioner\b/, /\bfull name\s*(&|and)?\s*surname\b/,
    /\benterprise name\b/, /\bsworn\b/, /\bidentity number\b/,
  ].filter((re) => re.test(joined)).length;
  const certificateSignals = [
    /\bcert(ificate)?\b.*\b(no|number)\b/, /\bverification\b/, /\bissued by\b/,
    /\bexpiry date\b/, /\bmeasured entity\b/,
  ].filter((re) => re.test(joined)).length;

  if (affidavitSignals >= 2 && affidavitSignals > certificateSignals) return 'affidavit';
  if (certificateSignals >= 2) return 'certificate';
  return null;
}

/**
 * An affidavit states its level as a ticked box: the LEVEL IS IN THE LABEL and
 * the value is the selection mark, e.g.
 *   ["Level Four (100% B-BBEE procurement recognition)"] = ":selected:"
 * so the level must be read from the key, and only when the box is actually
 * ticked — an unticked box carries the same label.
 */
export function parseCheckedLevel(rawKey: string, value: string): number | null {
  if (!/:selected:/i.test(value)) return null;
  return parseLevel(normKey(rawKey));
}

/** Label matching is on a normalised key: lowercase, punctuation stripped, spaces collapsed. */
function normKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A CIPC company registration number: YYYY/NNNNNN/NN. This is the field that
 * distinguishes "one legal entity trading under many names" (Hudaco, Bidvest,
 * Massmart — which legitimately share a VAT) from a genuine cross-company leak.
 */
export function parseRegistrationNumber(value: string): string | null {
  const m = /\b((?:19|20)\d{2}\s*\/\s*\d{4,7}\s*\/\s*\d{2})\b/.exec(value);
  return m ? m[1].replace(/\s+/g, '') : null;
}

export function parseVat(value: string): string | null {
  // Spaces are stripped first ("4740 230 513"), which can leave a letter hard
  // against the digits ("VAT4740230513") — so the boundary is "not a digit",
  // not \b, which would fail between T and 4. The lookahead stops an 11-digit
  // run being read as a valid 10-digit VAT.
  const m = /(?:^|\D)(4\d{9})(?=\D|$)/.exec(value.replace(/[\s-]/g, ''));
  return m ? m[1] : null;
}

export function parseLevel(value: string): number | null {
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  };
  const word = /\blevel\s+(one|two|three|four|five|six|seven|eight)\b/i.exec(value);
  if (word) return words[word[1].toLowerCase()];
  const num = /\blevel\s*0*([1-8])\b/i.exec(value) ?? /^0*([1-8])$/.exec(value.trim());
  return num ? Number(num[1]) : null;
}

export function parsePercent(value: string): number | null {
  const m = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(value);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Dates on certificates are written many ways; normalise to ISO yyyy-mm-dd.
 *
 * Built from LOCAL date parts, never toISOString(): "22 May 2026" parses as
 * local midnight, which in SAST (UTC+2) is 21 May 22:00 UTC, so toISOString()
 * would silently report every certificate as expiring a day early.
 */
export function parseCertDate(value: string): string | null {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const parsed = Date.parse(cleaned);
  if (!Number.isFinite(parsed)) return null;
  const d = new Date(parsed);
  const year = d.getFullYear();
  if (year < 1990 || year > 2100) return null;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Map DI key/value pairs onto our fields.
 *
 * Only the FIRST plausible value for each field is taken. A certificate repeats
 * its expiry date in a header, a body table and a footer; the first labelled
 * occurrence is as good as any and taking the last would let a footer's
 * "reprint date" win.
 */
export function mapKeyValuePairs(
  pairs: Array<{ key?: { content?: string }; value?: { content?: string } }>,
): Omit<DocIntelligenceFields, 'pages'> {
  const out = emptyDocIntelligenceFields();
  const take = <K extends keyof typeof out>(field: K, v: (typeof out)[K]) => {
    if (out[field] === null && v !== null) out[field] = v;
  };

  out.documentKind = detectDocumentKind(pairs);

  for (const pair of pairs) {
    const rawKey = String(pair.key?.content ?? '');
    const value = String(pair.value?.content ?? '').replace(/\s+/g, ' ').trim();
    if (!rawKey || !value) continue;
    const key = normKey(rawKey);

    // An affidavit puts the level in the LABEL and a tick in the value.
    take('bbbeeLevel', parseCheckedLevel(rawKey, value));

    // Registration number: "Company Registration No", "Registration Number",
    // "Company Reg No". Excludes "VAT Registration No", handled below.
    if (/\breg(istration)?\b/.test(key) && !/\bvat\b/.test(key)) {
      take('companyRegistrationNumber', parseRegistrationNumber(value));
    }
    if (/\bvat\b/.test(key)) {
      take('vatNumber', parseVat(value));
    }
    if (/\bcert(ificate)?\b/.test(key) && /\b(no|number|#)\b/.test(key)) {
      if (value.length <= 60) take('certificateNumber', value);
    }
    if (/\b(b bbee|bbbee|bee)\b/.test(key) && /\b(status|level|contributor)\b/.test(key)) {
      take('bbbeeLevel', parseLevel(value));
    } else if (/^level$/.test(key) || /\bstatus level\b/.test(key)) {
      take('bbbeeLevel', parseLevel(value));
    }
    if (/\bblack\b/.test(key) && /\bwom(a|e)n\b/.test(key)) {
      take('blackWomenOwnership', parsePercent(value));
    } else if (/\bblack\b/.test(key) && /(ownership|owned|economic|shareholding)/.test(key)) {
      take('blackOwnership', parsePercent(value));
    }
    if (/\bexpir/.test(key) || /\bvalid (until|to)\b/.test(key)) {
      take('expiryDate', parseCertDate(value));
    }
    if (/\bissue/.test(key) || /\bdate of issue\b/.test(key)) {
      take('issueDate', parseCertDate(value));
    }
    if (/(verification agency|verified by|issued by|agency)/.test(key)) {
      if (value.length >= 3 && value.length <= 80) take('verificationAgency', value);
    }
  }

  const { pages: _pages, ...fields } = out;
  return fields;
}

export interface AnalyseOptions {
  endpoint: string;
  apiKey: string;
  /** Abort a single document rather than hanging the whole run. */
  timeoutMs?: number;
}

/**
 * Run prebuilt-document over one certificate and return mapped fields.
 *
 * Throws on a service failure so the caller can record it and move on — a
 * failed document must not be recorded as "no data", which would be
 * indistinguishable from a certificate that genuinely lacks the field.
 */
/**
 * Content type from the BYTES, not from an assumption.
 *
 * The call used to declare every upload `application/pdf`. Roughly 18 of the
 * archived certificates are .png/.jpg scans, and Document Intelligence answers
 * a mislabelled image with `400 UnsupportedContent` — which the caller then
 * records as a permanent failure, so those certificates could never be read at
 * any price.
 */
function sniffContentType(buffer: Buffer): string {
  if (buffer.length >= 4 && buffer.toString('latin1', 0, 4) === '%PDF') return 'application/pdf';
  if (buffer.length >= 8 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') return 'image/png';
  if (buffer.length >= 3 && buffer.toString('hex', 0, 3) === 'ffd8ff') return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length >= 4) {
    const h = buffer.toString('hex', 0, 4);
    if (h === '49492a00' || h === '4d4d002a') return 'image/tiff';
  }
  // Unknown: let the service decide rather than asserting a type it will reject.
  return 'application/octet-stream';
}

export async function analyseCertificate(
  buffer: Buffer,
  opts: AnalyseOptions,
): Promise<DocIntelligenceFields> {
  if (buffer.length === 0) throw new Error('empty file');
  const endpoint = opts.endpoint.replace(/\/$/, '');
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);

  const res = await fetch(
    `${endpoint}/formrecognizer/documentModels/prebuilt-document:analyze?api-version=${API_VERSION}`,
    {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': opts.apiKey, 'Content-Type': sniffContentType(buffer) },
      body: new Uint8Array(buffer),
    },
  );
  if (res.status !== 202) {
    throw new Error(`analyze -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const operation = res.headers.get('operation-location');
  if (!operation) throw new Error('no operation-location header');

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(operation, { headers: { 'Ocp-Apim-Subscription-Key': opts.apiKey } });
    const body = await poll.json() as any;
    if (body.status === 'succeeded') {
      const result = body.analyzeResult ?? {};
      const mapped = mapKeyValuePairs(result.keyValuePairs ?? []);
      return { ...mapped, pages: (result.pages ?? []).length };
    }
    if (body.status === 'failed') {
      throw new Error(`analysis failed: ${JSON.stringify(body.error).slice(0, 200)}`);
    }
  }
  throw new Error('timed out waiting for analysis');
}

export function logSpend(pages: number, docs: number): void {
  // prebuilt-document is billed per page at $10 / 1,000 pages.
  const usd = (pages / 1000) * 10;
  logger.info('Document Intelligence spend', { docs, pages, estimatedUsd: usd.toFixed(2) });
}
