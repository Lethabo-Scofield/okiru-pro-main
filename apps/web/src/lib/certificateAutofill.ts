/**
 * Procurement autofill from the certificate registry.
 *
 * THE PROBLEM THIS SOLVES
 *
 * A client's procurement schedule is a list of names and rands. The columns that
 * actually score — B-BBEE level, black ownership, size, empowering-supplier
 * status — are on each supplier's certificate, and the client mostly does not
 * have them. So procurement gets filled in by hand, supplier by supplier, from
 * PDFs chased over email. We already hold 2,951 of those certificates.
 *
 * This module is the bridge: hand it procurement rows, it asks the registry
 * which certificate belongs to each supplier and fills what it can.
 *
 * THE THREE RULES THAT KEEP IT SAFE
 *
 *  1. BLANKS ONLY. A value the user typed, or a document stated, is never
 *     overwritten. The registry is a fallback for what nobody supplied, not an
 *     authority over what someone did. Where the two disagree the existing value
 *     stays and the disagreement is REPORTED — that gap is worth a human's
 *     attention (a stale certificate, or the wrong supplier matched).
 *
 *  2. AN EXPIRED CERTIFICATE DOES NOT SCORE. Under the codes a lapsed
 *     certificate cannot support a recognition claim, so when the matched
 *     certificate was not valid at the measurement date the SCORING columns are
 *     left alone. The identity columns — including the expiry date itself — are
 *     still filled, because seeing "expired 2024-03-31" in the grid is exactly
 *     what tells procurement to chase the renewal. The caller can override this
 *     deliberately; it is never overridden silently.
 *
 *  3. EVERY FILLED CELL CARRIES ITS SOURCE. Each touched row gets a
 *     `_certificate` record naming the certificate, how it was matched, how
 *     confident that was, and which cells it filled. Nothing arrives in a
 *     scorecard without a traceable origin, and an autofill can always be
 *     explained — or undone.
 *
 * Matching itself is server-side (`POST /api/certificates/match`), where the
 * whole registry is in hand and the conservative identifier/name precedence
 * lives. This module only decides what to DO with a match.
 */

/** A procurement grid row. Same shape the workbook and the importer use. */
export interface ProcurementRow extends Record<string, unknown> {
  _id: string;
}

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

export interface CertificateMatchCandidate {
  certificateId: string | null;
  slug: string | null;
  companyName: string;
  certificateNumber: string | null;
  agency: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  validAtAsOf: boolean;
  verified: boolean;
  basis: MatchBasis;
  confidence: number;
  fields: Record<string, string | number>;
}

export interface SupplierMatchResult {
  key: string;
  match: CertificateMatchCandidate | null;
  alternatives: CertificateMatchCandidate[];
  reason?: NoMatchReason;
  ambiguousWith?: string[];
}

/** Where a certificate disagreed with a value already in the row. */
export interface AutofillConflict {
  column: string;
  existing: unknown;
  certificate: unknown;
}

/** Stamped onto every row the registry touched. Provenance, kept on the row. */
export interface CertificateProvenance {
  certificateId: string | null;
  slug: string | null;
  companyName: string;
  certificateNumber: string | null;
  agency: string | null;
  expiryDate: string | null;
  validAtAsOf: boolean;
  verified: boolean;
  basis: MatchBasis;
  confidence: number;
  /** Columns this certificate filled. */
  filled: string[];
  /** Columns withheld because the certificate was not valid at the measurement date. */
  withheldExpired: string[];
  conflicts: AutofillConflict[];
  matchedAt: string;
}

export interface AutofillReport {
  requested: number;
  matched: number;
  rowsChanged: number;
  cellsFilled: number;
  conflicts: Array<{ rowId: string; supplierName: string; conflicts: AutofillConflict[] }>;
  /**
   * Matched, but the certificate could not be shown valid at the measurement
   * date — scoring columns left blank.
   *
   * Two distinct situations, kept apart because they need different actions: a
   * certificate that HAS lapsed needs a renewal chased, while one with no expiry
   * date on record needs the registry record fixed. Calling both "expired"
   * would send procurement after the wrong thing.
   */
  notValid: Array<{
    rowId: string;
    supplierName: string;
    expiryDate: string | null;
    reason: 'expired' | 'no-expiry-date';
  }>;
  /** Two different companies scored the same. Deliberately left for a human. */
  ambiguous: Array<{ rowId: string; supplierName: string; candidates: string[] }>;
  unmatched: Array<{ rowId: string; supplierName: string; reason: NoMatchReason }>;
  registryUnavailable: boolean;
}

export interface AutofillOptions {
  /**
   * Measurement-period end. A supplier measured for FY2025 is qualified by the
   * certificate that was live then, not by whichever renewal is current today.
   */
  asOf?: string;
  /** Fill scoring columns even from a lapsed certificate. The user's call. */
  allowExpired?: boolean;
  /** Override the server's fuzzy floor. Raise it, don't lower it. */
  threshold?: number;
  signal?: AbortSignal;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  apiBase?: string;
}

/**
 * The only columns autofill may write.
 *
 * An explicit allowlist, not "whatever the certificate returned". A field added
 * to the registry tomorrow cannot silently start writing into a scorecard
 * column nobody vetted — it has to be added here, on purpose.
 *
 * `supplierName` and `spend` are absent by design: the name is the match key
 * (rewriting it would make the match unauditable) and the spend is the client's
 * own figure, the one number the registry has no business touching.
 */
export const AUTOFILLABLE_COLUMNS = [
  'bbbeeLevel',
  'currentSize',
  'currentBlackOwnership',
  'currentBlackFemaleOwnership',
  'registrationNumber',
  'vatNumber',
  'certificateExpiryDate',
  'empoweringSupplier',
  'sdRecipient',
  'threeYearContract',
  'designated',
  'sizeAtFirstProcurement',
  'firstProcurementDate',
  'measuredUnder',
] as const;

export type AutofillableColumn = (typeof AUTOFILLABLE_COLUMNS)[number];

/**
 * Columns that carry recognition — the ones a lapsed certificate may not fill.
 *
 * The rest are identity: who the supplier is, what their numbers are, when the
 * certificate expired. Those stay true after expiry, and filling the expiry date
 * is what makes the lapse visible in the grid.
 */
const SCORING_COLUMNS = new Set<string>([
  'bbbeeLevel',
  'currentSize',
  'currentBlackOwnership',
  'currentBlackFemaleOwnership',
  'empoweringSupplier',
  'sdRecipient',
  'threeYearContract',
  'designated',
  'measuredUnder',
]);

const AUTOFILLABLE = new Set<string>(AUTOFILLABLE_COLUMNS);

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Workbook date → ISO, for the `asOf` the matcher measures validity against.
 *
 * The workbook accepts dd/mm/yyyy and yyyy-mm-dd. `new Date("03/02/2026")`
 * reads that as 2 March in a US locale and 3 February here — an eight-month
 * error, straddling most of the registry's expiry dates. So dd/mm/yyyy is
 * parsed by hand rather than handed to the Date constructor.
 */
export function workbookDateToIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return undefined;
}

/**
 * Same value? Numbers compare numerically ("51" and 51 agree, and so do 51 and
 * 51.0), everything else case-insensitively trimmed ("yes" and "Yes" agree).
 * Only a real disagreement should be reported as a conflict.
 */
function valuesAgree(a: unknown, b: unknown): boolean {
  const numA = Number(String(a).replace(/[R\s,%]/g, ''));
  const numB = Number(String(b).replace(/[R\s,%]/g, ''));
  if (Number.isFinite(numA) && Number.isFinite(numB)) return Math.abs(numA - numB) < 0.005;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Rows worth asking about: named, and missing at least one fillable value. */
export function rowsNeedingCertificateData(rows: ProcurementRow[]): ProcurementRow[] {
  return rows.filter((row) => {
    const name = String(row.supplierName ?? '').trim();
    const hasIdentifier =
      name || !isBlank(row.registrationNumber) || !isBlank(row.vatNumber);
    if (!hasIdentifier) return false;
    return AUTOFILLABLE_COLUMNS.some((col) => isBlank(row[col]));
  });
}

/** Ask the registry which certificate belongs to each of these suppliers. */
export async function fetchCertificateMatches(
  rows: ProcurementRow[],
  options: AutofillOptions = {},
): Promise<SupplierMatchResult[]> {
  if (rows.length === 0) return [];
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.apiBase ?? '';

  const response = await doFetch(`${base}/api/certificates/match`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      suppliers: rows.map((row) => ({
        key: row._id,
        name: String(row.supplierName ?? '').trim() || null,
        registrationNumber: String(row.registrationNumber ?? '').trim() || null,
        vatNumber: String(row.vatNumber ?? '').trim() || null,
      })),
      asOf: options.asOf,
      threshold: options.threshold,
      includeAlternatives: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Certificate match failed (${response.status})`);
  }
  const body = (await response.json()) as {
    success?: boolean;
    data?: { results?: SupplierMatchResult[] };
  };
  return body?.data?.results ?? [];
}

/**
 * Apply matches to rows. Pure — no I/O, input never mutated.
 *
 * Split from the fetch so the fill algebra is testable on its own, and so a
 * caller that already has matches (a preview the user confirmed) can apply them
 * without asking again.
 */
export function applyCertificateMatches(
  rows: ProcurementRow[],
  results: SupplierMatchResult[],
  options: Pick<AutofillOptions, 'allowExpired'> = {},
): { rows: ProcurementRow[]; report: AutofillReport } {
  const byKey = new Map(results.map((r) => [r.key, r]));
  const report: AutofillReport = {
    requested: results.length,
    matched: 0,
    rowsChanged: 0,
    cellsFilled: 0,
    conflicts: [],
    notValid: [],
    ambiguous: [],
    unmatched: [],
    registryUnavailable: results.some((r) => r.reason === 'registry-unavailable'),
  };

  const nextRows = rows.map((row) => {
    const result = byKey.get(row._id);
    if (!result) return row;

    const supplierName = String(row.supplierName ?? '').trim();

    if (!result.match) {
      if (result.reason === 'ambiguous') {
        report.ambiguous.push({
          rowId: row._id,
          supplierName,
          candidates: result.ambiguousWith ?? [],
        });
      } else if (result.reason && result.reason !== 'no-identifiers') {
        report.unmatched.push({ rowId: row._id, supplierName, reason: result.reason });
      }
      return row;
    }

    report.matched += 1;
    const match = result.match;
    const useScoring = match.validAtAsOf || options.allowExpired === true;

    const filled: string[] = [];
    const withheldExpired: string[] = [];
    const conflicts: AutofillConflict[] = [];
    const patch: Record<string, unknown> = {};

    for (const [column, value] of Object.entries(match.fields)) {
      if (!AUTOFILLABLE.has(column)) continue;
      if (value === undefined || value === null || value === '') continue;

      if (!useScoring && SCORING_COLUMNS.has(column)) {
        // Only worth reporting as withheld if the cell was actually empty —
        // a column the user already filled loses nothing by the certificate
        // being stale.
        if (isBlank(row[column])) withheldExpired.push(column);
        continue;
      }

      const existing = row[column];
      if (!isBlank(existing)) {
        if (!valuesAgree(existing, value)) {
          conflicts.push({ column, existing, certificate: value });
        }
        continue;
      }

      patch[column] = value;
      filled.push(column);
    }

    if (!match.validAtAsOf) {
      report.notValid.push({
        rowId: row._id,
        supplierName,
        expiryDate: match.expiryDate,
        reason: match.expiryDate ? 'expired' : 'no-expiry-date',
      });
    }
    if (conflicts.length > 0) {
      report.conflicts.push({ rowId: row._id, supplierName, conflicts });
    }

    // A match with nothing to add is still worth recording: it tells the next
    // reader this supplier WAS checked against the registry and found complete,
    // rather than never looked at.
    const provenance: CertificateProvenance = {
      certificateId: match.certificateId,
      slug: match.slug,
      companyName: match.companyName,
      certificateNumber: match.certificateNumber,
      agency: match.agency,
      expiryDate: match.expiryDate,
      validAtAsOf: match.validAtAsOf,
      verified: match.verified,
      basis: match.basis,
      confidence: match.confidence,
      filled,
      withheldExpired,
      conflicts,
      matchedAt: new Date().toISOString(),
    };

    if (filled.length > 0) {
      report.rowsChanged += 1;
      report.cellsFilled += filled.length;
    }

    return { ...row, ...patch, _certificate: provenance };
  });

  return { rows: nextRows, report };
}

/**
 * The whole flow: find the rows with gaps, match them, fill the blanks.
 *
 * Never throws on a registry problem — procurement data entry must not be
 * blocked because a lookup was unavailable. The rows come back untouched and
 * the report says the registry could not be reached.
 */
export async function autofillProcurementFromCertificates(
  rows: ProcurementRow[],
  options: AutofillOptions = {},
): Promise<{ rows: ProcurementRow[]; report: AutofillReport }> {
  const emptyReport: AutofillReport = {
    requested: 0,
    matched: 0,
    rowsChanged: 0,
    cellsFilled: 0,
    conflicts: [],
    notValid: [],
    ambiguous: [],
    unmatched: [],
    registryUnavailable: false,
  };

  const candidates = rowsNeedingCertificateData(rows);
  if (candidates.length === 0) return { rows, report: emptyReport };

  try {
    const results = await fetchCertificateMatches(candidates, options);
    return applyCertificateMatches(rows, results, options);
  } catch {
    return { rows, report: { ...emptyReport, requested: candidates.length, registryUnavailable: true } };
  }
}

/** One-line summary for a toast. Empty string when nothing happened. */
export function summariseAutofill(report: AutofillReport): string {
  if (report.registryUnavailable) return 'Certificate registry unavailable — nothing auto-filled.';
  const parts: string[] = [];
  if (report.cellsFilled > 0) {
    parts.push(
      `Auto-filled ${report.cellsFilled} field${report.cellsFilled === 1 ? '' : 's'} across ` +
        `${report.rowsChanged} supplier${report.rowsChanged === 1 ? '' : 's'}`,
    );
  }
  const lapsed = report.notValid.filter((n) => n.reason === 'expired').length;
  const undated = report.notValid.length - lapsed;
  if (lapsed > 0) parts.push(`${lapsed} certificate${lapsed === 1 ? '' : 's'} expired`);
  if (undated > 0) {
    parts.push(`${undated} with no expiry date on record`);
  }
  if (report.conflicts.length > 0) {
    parts.push(`${report.conflicts.length} disagree with entered data`);
  }
  if (report.ambiguous.length > 0) {
    parts.push(`${report.ambiguous.length} need manual selection`);
  }
  return parts.join(' · ');
}
