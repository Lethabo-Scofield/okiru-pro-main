/**
 * Claim-vs-evidence verification — the types.
 *
 * The score is computed from CLAIMS: the client's own schedules, placed into
 * workbook sections. The documents the parser read alongside them are
 * EVIDENCE. This layer checks each claim against the evidence that bears on it
 * and says what it found, with the document and field it found it in.
 *
 * Two totals come from the SAME calculators:
 *   - CLAIMED   — today's number, with only the replacements the rules below
 *                 decide (a statutory or accounting record, or a certificate,
 *                 that contradicts a schedule).
 *   - EVIDENCED — CLAIMED with every unproven or out-of-period claim removed.
 *
 * Evidence precedence (highest first):
 *   4 statutory / accounting — CIPC, share register, EMP201, AFS, ledger, SA ID
 *   3 certificate / affidavit — B-BBEE certificate, share certificate
 *   2 signed declaration      — EEA1, representation or management letter, contract
 *   1 client schedule         — the client's own workbook sheets and lists
 *
 * What a result does (the only ways this layer moves points):
 *   - contradicted by a statutory record  → replaced in BOTH totals, flagged
 *   - contradicted by a certificate       → the certificate's value (the lower
 *                                           one when certificates disagree) in
 *                                           BOTH totals, flagged
 *   - unproven                            → flagged; kept in CLAIMED, removed
 *                                           from EVIDENCED
 *   - outside the measurement period      → removed from EVIDENCED
 *   - two client documents disagree and
 *     the choice changes the score        → needs-you; CLAIMED holds the value
 *                                           that claims less until answered,
 *                                           and both totals are shown
 *   - anything else                       → reported only
 */

export type EvidenceRank = 1 | 2 | 3 | 4;

export const RANK_LABEL: Record<EvidenceRank, string> = {
  4: 'statutory or accounting record',
  3: 'certificate',
  2: 'signed declaration',
  1: 'client schedule',
};

/** What the parser read from one document (one reader of one file). */
export interface EvidenceRead {
  sourceFile: string;
  documentId: string;
  element?: string;
  values: Array<{ field: string; value: unknown }>;
}

export type VerificationRow = Record<string, unknown> & { _id?: string; _sourceFiles?: string[] };
export type VerificationSections = Record<string, { rows?: VerificationRow[]; meta?: Record<string, unknown> }>;

export interface MeasurementPeriod {
  /** ISO date, inclusive. */
  start: string;
  /** ISO date, inclusive. */
  end: string;
}

export interface VerificationInput {
  /** The reconciled workbook sections — the claims. */
  sections: VerificationSections;
  /** Every document read the parser produced — the evidence. */
  evidence: EvidenceRead[];
  /** The measurement period; derived from the financial year end when absent. */
  period?: MeasurementPeriod | null;
}

/** The fourteen checks the design names. */
export type CheckKind =
  | 'ownership.holding'
  | 'people.demographics'
  | 'ownership.acquisitionDebt'
  | 'management.band'
  | 'people.foreignNational'
  | 'people.payroll'
  | 'skills.leviableAmount'
  | 'skills.trainingSpend'
  | 'procurement.supplierCertificate'
  | 'procurement.supplierSpend'
  | 'procurement.tmps'
  | 'financials.npatRevenue'
  | 'sed.proofOfPayment'
  | 'entity.identity';

export type CheckStatus = 'pass' | 'flag' | 'needs-you' | 'unproven' | 'out-of-period';

/**
 * What the check did to the numbers. `none` and `flag-only` never move a
 * point; the others are the rules in the header, by name.
 */
export type CheckRule =
  | 'none'
  | 'flag-only'
  | 'replaced-statutory'
  | 'replaced-certificate'
  | 'excluded-from-evidenced'
  | 'lower-until-answered';

export interface EvidenceCitation {
  /** The file (and sheet, for a workbook tab) the value was read from. */
  document: string;
  /** The reader that read it. */
  reader: string;
  /** The field the parser put it under — the cell or label it came from. */
  field: string;
  value: unknown;
  rank: EvidenceRank;
}

/**
 * One way the numbers change.
 * - `set` writes `value` into a row's column (rowId) or a section's meta (key).
 * - `exclude` removes a row (an amount that was not proven: a contribution,
 *   a training entry).
 * - `notBlack` keeps a person but stops counting them as black: the claim
 *   that was not proven is "a black person holds this", and removing the row
 *   instead would change the denominators — dropping an unproven black man
 *   from top management would RAISE the black-women share of the rest.
 * - basis `both` applies to CLAIMED and EVIDENCED, `evidenced` to EVIDENCED
 *   only, `alternative` only when the user picks that answer to a needs-you.
 */
export interface OverlayOp {
  kind: 'set' | 'exclude' | 'notBlack';
  basis: 'both' | 'evidenced' | 'alternative';
  section: string;
  rowId?: string;
  column?: string;
  metaKey?: string;
  value?: unknown;
}

export interface NeedsYouChoice {
  /** The value this answer puts in the cell. */
  value: unknown;
  /** The documents that state it. */
  sources: string[];
  /** Whether CLAIMED holds this one now (the one that claims less). */
  held: boolean;
  ops: OverlayOp[];
}

export interface VerificationCheck {
  /** Stable within a report: kind plus the row or key it concerns. */
  id: string;
  kind: CheckKind;
  section: string;
  rowId?: string;
  /** Who or what the claim is about, as the documents name it. */
  subject: string;
  status: CheckStatus;
  rule: CheckRule;
  claim: { column?: string; value: unknown; documents?: string[] };
  evidence: EvidenceCitation[];
  tolerance?: string;
  /** One plain sentence. */
  statement: string;
  ops: OverlayOp[];
  /** needs-you only: each answer and what it does. */
  choices?: NeedsYouChoice[];
}

export interface VerificationReport {
  version: 1;
  period: MeasurementPeriod | null;
  checks: VerificationCheck[];
  counts: Record<CheckStatus, number>;
}
