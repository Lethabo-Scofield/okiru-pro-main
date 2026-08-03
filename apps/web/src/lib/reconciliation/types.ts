/**
 * Reconciliation — the layer between extraction and scoring.
 *
 * Extraction produces a flat bag of (field, value, source) facts. Placing each
 * value into a cell only checks LOCAL plausibility (does this token fit this
 * cell?). Reconciliation checks GLOBAL consistency: it assembles the facts into
 * ONE canonical entity keyed by identity and enforces the invariants every real
 * B-BBEE entity must satisfy, so scoring never runs on an impossible company.
 *
 * The five invariant classes (every extraction defect is an instance of one):
 *
 *   representation   — every value carries a canonical type. A date is a date
 *                      (Excel serial 46066 included); a count is not a
 *                      percentage; "1" is not a gender.
 *   identity         — one ID ⇒ one entity with one stable attribute set across
 *                      every section. The same person is never two rows, and
 *                      never two races.
 *   well-formedness  — the measured entity is not a member of its own
 *                      shareholder set; a category label is not a transaction.
 *   conservation     — the parts sum to the whole. Ownership closes to 100%.
 *   derivation       — dimensions that are absent but ENTAILED are computed,
 *                      not left null. 100% shareholding ⇒ 100% economic interest.
 *
 * Output is the cleaned sections PLUS a severity-ranked, plain-language issue
 * list — which is also what the review UI and the progress view render.
 */

export type InvariantClass =
  | "representation"
  | "identity"
  | "well-formedness"
  | "conservation"
  | "derivation";

/**
 * - `resolved`  — reconciliation fixed it; shown as "handled automatically".
 * - `blocking`  — the entity cannot be made coherent without the user; must be
 *                 answered before the score can be trusted.
 * - `coverage`  — evidence is simply missing for something; not an error, a gap.
 */
export type IssueSeverity = "resolved" | "blocking" | "coverage";

export interface ReconciliationIssue {
  id: string;
  invariant: InvariantClass;
  severity: IssueSeverity;
  /** Workbook section this concerns, when it is section-specific. */
  section?: string;
  /** Human handle for the entity/row(s) involved. */
  entity?: string;
  /** One plain sentence a non-specialist understands. */
  statement: string;
  /** What reconciliation DID (resolved), or what the user must do (blocking/coverage). */
  action?: string;
  /** Row ids touched, for the UI to anchor to. */
  rowIds?: string[];
}

/** A compact, human-facing summary of the reconciled company. */
export interface EntitySummary {
  companyName: string;
  sectorCode: string;
  scorecardType: string;
  shareholderCount: number;
  /** Total black economic interest as a fraction (0–1), post-reconciliation. */
  blackOwnershipFraction: number;
  /** Total black-women economic interest as a fraction (0–1). */
  blackWomenOwnershipFraction: number;
  ownershipClosesTo: number; // percent the shareholders sum to (should be ~100)
  employeeCount: number;
  supplierCount: number;
  trainingProgrammeCount: number;
  scoredSedContributions: number;
  scoredEsdContributions: number;
  /** True when 100% black-owned → deemed Level 1 by affidavit (QSE/EME). */
  deemedLevel: number | null;
  deemedLevelReason?: string;
}

export type WorkbookRow = Record<string, unknown> & {
  _id?: string;
  _sourceFiles?: string[];
};

export type WorkbookSection = { rows?: WorkbookRow[]; meta?: Record<string, unknown> };
export type WorkbookSections = Record<string, WorkbookSection>;

export interface ReconcileResult {
  /** The cleaned sections — the ONLY thing scoring should consume. */
  sections: WorkbookSections;
  /** Severity-ranked (blocking → coverage → resolved), invariant-tagged. */
  issues: ReconciliationIssue[];
  summary: EntitySummary;
  /** Counts for the review header: {blocking, coverage, resolved}. */
  counts: Record<IssueSeverity, number>;
}

export interface ReconcileOptions {
  sectorCode?: string;
  scorecardType?: string;
  /**
   * Every name the MEASURED ENTITY is known by — the display name PLUS the
   * registered names and registration numbers pulled from the documents. The
   * self-shareholder check matches against all of them, because the registered
   * entity ("Thandanani Packers and Hauliers cc") is usually NOT the display
   * name the user typed ("Thandanani Transport").
   */
  entityAliases?: string[];
}
