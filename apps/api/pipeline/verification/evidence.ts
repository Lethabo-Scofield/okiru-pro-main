/**
 * Reading the evidence: what kind of document a read is, how much it weighs,
 * and the small, strict parsers the checks share (names, amounts, percentages,
 * dates, SA ID numbers). Pure and deterministic.
 */
import type { EvidenceCitation, EvidenceRank, EvidenceRead, MeasurementPeriod } from './types.js';

export type DocKind =
  | 'cipc' | 'shareRegister' | 'biRegister' | 'emp201' | 'afs' | 'ledger' | 'saId'
  | 'shareCertificate' | 'supplierCertificate'
  | 'eea1' | 'representationLetter' | 'contract' | 'jobDescription' | 'payroll' | 'proofOfPayment'
  | 'trainingEvidence'
  | 'schedule' | 'other';

/**
 * The kind of a read, from the reader's document id (the evidence matrix names
 * the document it was asked to read) and, failing that, the fields it carries.
 * A workbook tab (`sheet_*`) is always the client's own schedule.
 */
export function docKind(read: EvidenceRead): DocKind {
  const id = read.documentId.toLowerCase();
  const has = (f: string) => read.values.some((v) => v.field === f);
  if (/^sheet_|^case__|duplicate_workbook/.test(id)) return 'schedule';
  if (/cipc/.test(id) || (has('director_rows') && has('incorporation_date'))) return 'cipc';
  if (/share_register|securities_register/.test(id) || has('holdings_table')) return 'shareRegister';
  if (/share_certificate|security_c/.test(id)) return 'shareCertificate';
  if (/beneficial_interest/.test(id) || has('beneficial_owner_rows')) return 'biRegister';
  if (/emp201|emp501/.test(id) || has('emp201_rows')) return 'emp201';
  if (/audited_financial|annual_financial|financial_statements/.test(id)) return 'afs';
  if (/ledger|accounts_payable/.test(id) || has('ap_subledger_total')) return 'ledger';
  if (/sa_id_document|id_document/.test(id)) return 'saId';
  if (/verification_certifica|bbbee_certificate|b_bbee_certificate/.test(id)) return 'supplierCertificate';
  if (/eea1/.test(id)) return 'eea1';
  if (/representation_letter|representation_let|management_letter|affidavit/.test(id)) return 'representationLetter';
  if (/employment_contract/.test(id)) return 'contract';
  if (/job_description/.test(id)) return 'jobDescription';
  if (/payroll/.test(id)) return 'payroll';
  if (/proof_of_payment/.test(id)) return 'proofOfPayment';
  if (/training_invoice|attendance_register|training_attendance/.test(id)) return 'trainingEvidence';
  return 'other';
}

const RANK: Record<DocKind, EvidenceRank> = {
  cipc: 4, shareRegister: 4, biRegister: 4, emp201: 4, afs: 4, ledger: 4, saId: 4,
  shareCertificate: 3, supplierCertificate: 3,
  eea1: 2, representationLetter: 2, contract: 2, jobDescription: 2, payroll: 4, proofOfPayment: 4,
  trainingEvidence: 3,
  schedule: 1, other: 1,
};

export function rankOf(kind: DocKind): EvidenceRank {
  return RANK[kind];
}

/** The first value the read states under `field`, or undefined. */
export function valueOf(read: EvidenceRead, field: string): unknown {
  const hit = read.values.find((v) => v.field === field && !blank(v.value));
  return hit?.value;
}

/** A table the read carries under `field` (an array of row objects). */
export function rowsOf(read: EvidenceRead, field: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const v of read.values) {
    if (v.field !== field || !Array.isArray(v.value)) continue;
    for (const r of v.value) if (r && typeof r === 'object' && !Array.isArray(r)) out.push(r as Record<string, unknown>);
  }
  return out;
}

export function cite(read: EvidenceRead, field: string, value: unknown): EvidenceCitation {
  return { document: read.sourceFile, reader: read.documentId, field, value, rank: rankOf(docKind(read)) };
}

export const blank = (v: unknown): boolean => v === undefined || v === null || String(v).trim() === '';
export const str = (v: unknown): string => String(v ?? '').trim();

const NAME_NOISE = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'pty', 'ltd', 'cc', 'inc', 'the', 'and', 'limited', 'proprietary', 'npc', 'trust', 'ta']);

function nameTokens(v: unknown): string[] {
  return str(v)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 0 && !NAME_NOISE.has(t));
}

/**
 * The same person or company, however the document writes it: the same words
 * in any order ("Dube Thandi" = "Thandi Dube"); every word of a name of two or
 * more words inside the other ("Thandi Dube" ⊂ "Thandi Grace Dube"); or
 * initials for the given names ("T.G. Dube" = "Thandi Grace Dube"). At least
 * one whole word must match, and a lone word only matches a lone word.
 */
export function sameName(a: unknown, b: unknown): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.length === 0 || y.length === 0) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const unused = [...long];
  let whole = 0;
  for (const t of short.filter((t) => t.length > 1)) {
    const at = unused.indexOf(t);
    if (at < 0) return false;
    unused.splice(at, 1);
    whole += 1;
  }
  for (const initial of short.filter((t) => t.length === 1)) {
    const at = unused.findIndex((t) => t.startsWith(initial));
    if (at < 0) return false;
    unused.splice(at, 1);
  }
  if (whole === 0) return false;
  return short.length >= 2 || short.length === long.length;
}

/** "R 1,250.50", "1 250", 1250.5 → a number; null when it is not a plain amount. */
export function amountOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = str(v).replace(/^r\s*/i, '').replace(/[\s,]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/**
 * A percentage in PERCENT points: "25%" → 25, 25 → 25, 0.25 → 25. A bare
 * number of 1 or less is read as a fraction — the documents state holdings as
 * either, and no holding check turns on a holder of exactly one percent.
 */
export function percentOf(v: unknown): number | null {
  if (blank(v)) return null;
  const raw = str(v);
  const n = amountOf(raw.replace(/%$/, ''));
  if (n === null) return null;
  if (/%$/.test(raw)) return n;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** A date however a document writes it → ISO yyyy-mm-dd, or null. */
export function dateOf(v: unknown): string | null {
  if (blank(v)) return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // An Excel serial date (1900 system).
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const t = str(v);
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})/i);
  if (m) {
    const word = m[2].toLowerCase();
    const month = MONTHS[word.slice(0, 4)] ?? MONTHS[word.slice(0, 3)];
    if (month !== undefined) return iso(+m[3], month, +m[1]);
  }
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return date.toISOString().slice(0, 10);
}

/** The twelve months ending on the financial year end. */
export function periodFromYearEnd(yearEnd: unknown): MeasurementPeriod | null {
  const end = dateOf(yearEnd);
  if (!end) return null;
  const d = new Date(`${end}T00:00:00Z`);
  // A year end on a month's last day follows the month end, not the date: the
  // year to 28 Feb 2025 starts on 1 Mar 2024, the day after 29 Feb 2024.
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() === d.getUTCDate();
  const start = monthEnd
    ? new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth() + 1, 1))
    : new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate() + 1));
  return { start: start.toISOString().slice(0, 10), end };
}

export function inPeriod(date: string | null, period: MeasurementPeriod | null): boolean | null {
  if (!date || !period) return null;
  return date >= period.start && date <= period.end;
}

export function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** A 13-digit South African ID number with a valid check digit, or null. */
export function saId(v: unknown): { gender: 'Male' | 'Female'; citizen: boolean; permanentResident: boolean } | null {
  const digits = str(v).replace(/\s+/g, '');
  if (!/^\d{13}$/.test(digits)) return null;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let d = Number(digits[12 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  if (sum % 10 !== 0) return null;
  const sequence = Number(digits.slice(6, 10));
  const citizenship = digits[10];
  return { gender: sequence >= 5000 ? 'Male' : 'Female', citizen: citizenship === '0', permanentResident: citizenship === '1' };
}

export function sameIdNumber(a: unknown, b: unknown): boolean {
  const x = str(a).replace(/\s+/g, '');
  const y = str(b).replace(/\s+/g, '');
  return x.length >= 6 && x === y;
}

const BLACK = /\b(african|black|coloured|colored|indian|chinese)\b/i;
export function isBlack(race: unknown): boolean | null {
  const t = str(race);
  if (!t) return null;
  if (/white/i.test(t) && !BLACK.test(t)) return false;
  return BLACK.test(t) ? true : null;
}

export function genderOf(v: unknown): 'Male' | 'Female' | null {
  const t = str(v).toLowerCase();
  if (/^(f|female|woman|women)$/.test(t)) return 'Female';
  if (/^(m|male|man|men)$/.test(t)) return 'Male';
  return null;
}

export function yes(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const t = str(v).toLowerCase();
  if (/^(y|yes|true|1)$/.test(t)) return true;
  if (/^(n|no|false|0)$/.test(t)) return false;
  return null;
}

/**
 * Management bands in the order of what they claim (board highest). A band
 * outside this ladder ranks 0 — it claims no top-management credit.
 */
export function bandRank(v: unknown): number {
  const t = str(v).toLowerCase();
  if (!t) return 0;
  if (/non.?executive|board/.test(t)) return 7;
  if (/executive director|top management|chief executive|\bceo\b|managing director/.test(t)) return 6;
  if (/other executive/.test(t)) return 5;
  if (/senior/.test(t)) return 4;
  if (/middle|professionally qualified/.test(t)) return 3;
  if (/junior|skilled technical/.test(t)) return 2;
  if (/semi.?skilled|unskilled/.test(t)) return 1;
  return 0;
}
