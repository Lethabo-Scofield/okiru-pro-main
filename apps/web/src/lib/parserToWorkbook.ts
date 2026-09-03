/**
 * Parser output → workbook sections. The wiring that closes the loop.
 *
 *   document → extraction → field bridge → cell injection → workbook rows
 *
 * Everything either side of this already exists and validates independently:
 * `targetForField` says WHERE a parser field belongs, `injectIntoSection` says
 * whether the value can legally live there. This joins them and answers the one
 * remaining question — how do a document's values become ROWS?
 *
 * ONE DOCUMENT IS NOT ONE ROW. A share certificate describes one shareholder; a
 * share register describes twelve. So a value that arrives as an ARRAY of
 * objects (the matrix asks for `holdings_table`, `management_breakdown_by_level_race_gender`
 * and similar) expands into one row per entry, while scalar values on the same
 * document form a single row. Flattening a register into one row would collapse
 * twelve shareholders into one and score a fraction of the ownership.
 *
 * NOTHING IS FORCED. A value that cannot satisfy its column is reported, a field
 * with no mapping is reported, and a required column left empty is reported.
 * The caller gets rows it can trust plus an honest account of what is missing.
 */
import { injectIntoSection, injectMetaValue, type InjectionRejection, type VocabularyDecisions } from "./workbookInjection";
import {
  huntRequiredFields,
  targetForField,
  type CoverageReport,
  type WorkbookSectionKey,
} from "./parserFieldBridge";

/** One document's worth of extracted values, as the parser reports it. */
export interface ParserExtraction {
  documentId: string;
  sourceFile: string;
  values: Array<{ field: string; value: unknown }>;
  /** Matrix element (OWNERSHIP | MANAGEMENT_CONTROL | SKILLS_DEVELOPMENT | ESD | SED). */
  element?: string;
}

export interface WorkbookRow extends Record<string, unknown> {
  _id: string;
  /** Files this row's values came from — provenance, kept on the row itself. */
  _sourceFiles?: string[];
}

/**
 * One field, already compared across every document by the parser's resolver.
 *
 * Mirrors `ResolvedField` in okiru-ai-parser/src/services/entityResolution.ts.
 * Kept as its own type rather than imported because the parser is a separate
 * service reached over HTTP — this is the wire shape, and it should break
 * loudly here if the service changes it.
 */
export interface ResolvedFieldInfo {
  field: string;
  value: unknown;
  /** Files that reported this value. */
  sources: string[];
  /** How many documents agreed on it. */
  agreementCount: number;
  /** True when documents reported materially different values. */
  conflicted: boolean;
  /** Rival values, present only when conflicted. */
  alternatives: Array<{ value: unknown; sources: string[] }>;
}

/**
 * An entity-level figure the documents disagree on — two different revenues,
 * two different TMPS totals.
 *
 * NOTHING IS SCORED FROM ONE. A single number wrong by a factor of ten moves a
 * whole scorecard, and there is no honest way to choose between two documents
 * that each state a total plainly. Arrival order is not evidence. So the value
 * is withheld and the choice goes to the person holding the documents.
 */
export interface MetaConflict {
  section: WorkbookSectionKey;
  column: string;
  /** The parser field name, so the choice can be traced back to the extraction. */
  field: string;
  /** Every distinct value asserted, each with the files that asserted it. */
  candidates: Array<{ value: unknown; sources: string[] }>;
}

/**
 * An entity-level figure more than one document agrees on.
 *
 * Corroboration is the cheapest evidence there is: two independently-produced
 * documents stating the same total is far stronger than one, and worth showing
 * as such rather than presenting every extracted number with equal weight.
 */
export interface MetaCorroboration {
  section: WorkbookSectionKey;
  column: string;
  field: string;
  value: unknown;
  /** Number of separate documents asserting this value. Always ≥ 2. */
  agreementCount: number;
  sources: string[];
}

/**
 * Reserved section-meta keys carrying the extraction's unfinished business.
 *
 * Underscore-prefixed so they can never collide with a workbook column, and
 * exported so the review layer reads the same constant the writer used rather
 * than a string literal that can drift.
 */
export const META_CONFLICTS_KEY = "_metaConflicts";
export const META_CORROBORATION_KEY = "_metaCorroboration";

export interface ParserToWorkbookResult {
  /** Grid rows, per workbook section. */
  rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>>;
  /** Entity-level values (TMPS, revenue, NPAT), per section. */
  meta: Partial<Record<WorkbookSectionKey, Record<string, unknown>>>;
  /** Values that could not be placed in a cell, with the reason. */
  rejected: Array<InjectionRejection & { sourceFile: string; section?: WorkbookSectionKey }>;
  /** Required columns still unfilled + parser fields with no mapping. */
  coverage: CoverageReport;
  /**
   * Where two documents describe the same entity but disagree on a figure —
   * a supplier's own ledger against the client's schedule, most usefully.
   * Advisory: the lower figure is scored and the gap is reported.
   */
  reconciliation: ReconciliationFinding[];
  /** Entity-level figures withheld because the documents disagree. */
  metaConflicts: MetaConflict[];
  /** Entity-level figures more than one document confirmed. */
  metaCorroboration: MetaCorroboration[];
}

let rowCounter = 0;
function nextRowId(): string {
  rowCounter += 1;
  return `parsed_${Date.now().toString(36)}_${rowCounter}`;
}

/**
 * ── Cross-document row linking ─────────────────────────────────────────────
 *
 * One supplier's evidence arrives as THREE documents: the workbook schedule
 * row (name + spend), the B-BBEE certificate (name + level + expiry +
 * empowering status), and the ledger (name + spend). Without linking, each
 * became its own half-empty row — and a certificate's level never reached the
 * row whose spend it qualifies, so the evidence never scored together.
 *
 * Rows in the same section are linked by NAME — normalised conservatively
 * (case, punctuation, legal suffixes like "(Pty) Ltd" / "cc"), never fuzzily:
 * "S. Nhlanhla" and "Sandile Nhlanhla" stay separate, because guessing that
 * two names are the same person is how someone else's certificate ends up on
 * the wrong supplier.
 *
 * Linking only ever FILLS BLANKS. If both rows carry a value for an EVIDENCE
 * column (spend, amount, shares) and the values differ, the rows are NOT
 * merged — two spend lines for the same supplier are two pieces of evidence,
 * and collapsing them would delete money. A certificate (no spend) merging
 * into a schedule row (spend, no level) conflicts on nothing, which is the
 * whole point.
 */
const LINK_KEY_COLUMNS: Partial<Record<WorkbookSectionKey, string[]>> = {
  procurement: ["supplierName"],
  esd: ["supplierName"],
  sed: ["beneficiaryName"],
  ownership: ["shareholderName"],
  "management-control": ["name", "surname"],
  "skills-development": ["learnerName"],
};

/** Columns that are evidence in themselves — present on both sides, no merge. */
const EVIDENCE_COLUMNS: Partial<Record<WorkbookSectionKey, string[]>> = {
  procurement: ["spend"],
  esd: ["amount"],
  sed: ["amount"],
  ownership: ["numberOfShares", "shareholding", "votingRights", "economicInterest"],
  "management-control": ["salary", "occupationalLevel"],
  "skills-development": ["totalCost", "courseCost"],
};

/**
 * Columns that describe WHO the entity is rather than one transaction — a
 * supplier's B-BBEE level holds for every spend line against them, a person's
 * race for every training row. These propagate across a name-group's blanks,
 * so one certificate qualifies ALL of its supplier's spend lines. Per-line
 * facts (descriptions, dates, amounts) never propagate.
 */
const IDENTITY_COLUMNS: Partial<Record<WorkbookSectionKey, string[]>> = {
  procurement: ["bbbeeLevel", "empoweringSupplier", "currentSize", "registrationNumber", "vatNumber", "certificateExpiryDate", "currentBlackOwnership"],
  sed: ["percentBenefitingBlack"],
  ownership: ["race", "gender", "idNumber"],
  "management-control": ["race", "gender", "idNumber"],
  "skills-development": ["race", "gender", "idNumber"],
};

/** "Thandanani Packers & Hauliers cc" → "thandanani packers and hauliers". */
export function normaliseEntityName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(proprietary|pty|ltd|limited|cc|inc|incorporated|npc|npo|t\/a|ta)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The keys two rows are considered the same entity by.
 *
 * One step looser than the display name, in three ways the real evidence
 * forces — and none of them fuzzy. Each is an EXACT transformation:
 *
 *  - SPACING is not identity. The client's schedule says "BP Edenvale"; the
 *    ledger for that same account is filed as "B P EDENVALE". (squashed key)
 *  - A TRAILING PLURAL is not identity. The schedule says "Subbiah
 *    Enterprises", its ledger "SUBBIAH ENTERPRISE". (per-token de-plural)
 *  - WORD ORDER is not identity. The EE register writes "Chiyangwa, Jeffrey";
 *    the Management Control sheet writes "Jeffrey Chiyangwa". (sorted key)
 *
 * Spacing and word order cannot share one canonical form ("B P EDENVALE"
 * token-sorted is not "BP Edenvale" token-sorted), so a row carries BOTH keys
 * and two rows match when EITHER agrees. Still nothing fuzzy: "S. Nhlanhla"
 * and "Sandile Nhlanhla" key apart on both forms, because guessing that two
 * names are one person is how someone else's certificate lands on the wrong
 * supplier.
 */
export function entityMatchKey(value: unknown): string {
  return normaliseEntityName(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.replace(/s$/, ""))
    .join("");
}

/** The order-insensitive twin of entityMatchKey. */
export function entityMatchKeySorted(value: unknown): string {
  return normaliseEntityName(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.replace(/s$/, ""))
    .sort()
    .join("");
}

function cellBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

/** Same value? Numeric when both parse as numbers, else trimmed string equality. */
function cellsAgree(a: unknown, b: unknown): boolean {
  const numA = Number(String(a).replace(/[R\s,]/g, ""));
  const numB = Number(String(b).replace(/[R\s,]/g, ""));
  if (Number.isFinite(numA) && Number.isFinite(numB)) return Math.abs(numA - numB) < 0.005;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Do these two rows come from the very same document? */
function shareASourceFile(a: WorkbookRow, b: WorkbookRow): boolean {
  const left = a._sourceFiles ?? [];
  const right = b._sourceFiles ?? [];
  return left.some((file) => right.includes(file));
}

export interface ReconciliationFinding {
  section: WorkbookSectionKey;
  entity: string;
  column: string;
  message: string;
}

interface MergeDecision {
  merge: boolean;
  finding?: string;
}

/** Does this row's evidence come from an accounting SOURCE document? */
function fromAccountingRecord(row: WorkbookRow): boolean {
  return (row._sourceFiles ?? []).some((file) => /ledger|statement|accounts?\s*payable/i.test(file));
}

/**
 * Should these two rows for the same entity become one?
 *
 * The distinction is WHICH DOCUMENT each came from.
 *
 * - SAME document: two line items, never merged. Thirteen monthly R500
 *   donations to one beneficiary are thirteen contributions; collapsing equal
 *   figures deletes money.
 * - DIFFERENT documents: the same fact stated twice — a supplier's ledger and
 *   the client's schedule both reporting that supplier's spend. Merged, so a
 *   ledger corroborates a schedule row instead of doubling it.
 *
 * When two documents disagree on a figure, precedence follows the EVIDENCE
 * CLASS, not the direction of the difference: verification methodology ranks
 * accounting records (creditors/supplier ledgers, reconciled to the AFS) above
 * client-prepared schedules, so a ledger figure wins whether it is higher or
 * lower. Between two documents of the same class the LOWER figure is kept —
 * never inflate a claim on our own judgement. Every disagreement is reported
 * either way: a client whose schedule under-claims against their own ledger is
 * told so in Rands.
 */
function mergeDecision(section: WorkbookSectionKey, a: WorkbookRow, b: WorkbookRow, entity: string): MergeDecision {
  let finding: string | undefined;

  for (const column of EVIDENCE_COLUMNS[section] ?? []) {
    if (cellBlank(a[column]) || cellBlank(b[column])) continue;
    if (shareASourceFile(a, b)) return { merge: false };
    if (cellsAgree(a[column], b[column])) continue;

    const left = Number(String(a[column]).replace(/[R\s,]/g, ""));
    const right = Number(String(b[column]).replace(/[R\s,]/g, ""));
    if (Number.isFinite(left) && Number.isFinite(right)) {
      const aLedger = fromAccountingRecord(a);
      const bLedger = fromAccountingRecord(b);
      const useLedger = aLedger !== bLedger;
      const keep = useLedger ? (aLedger ? left : right) : Math.min(left, right);
      const keptFile = (useLedger ? (aLedger ? a : b) : (left <= right ? a : b))._sourceFiles?.[0] ?? "one document";
      const otherFile = (useLedger ? (aLedger ? b : a) : (left <= right ? b : a))._sourceFiles?.[0] ?? "another document";
      const other = keep === left ? right : left;
      finding = `${entity}: ${keptFile} states ${column} of ${keep.toLocaleString()} but ${otherFile} says ${other.toLocaleString()} — a difference of ${Math.abs(other - keep).toLocaleString()}. ${useLedger ? "The accounting record's figure is being used" : "The lower figure is being used"}; confirm which is in scope.`;
      a[column] = keep;
    } else {
      finding = `${entity}: documents disagree on ${column} (${String(a[column])} vs ${String(b[column])}).`;
    }
  }

  return { merge: true, finding };
}

/** Fill `into`'s blanks from `from`; existing values are never overwritten. */
function mergeInto(into: WorkbookRow, from: WorkbookRow): void {
  for (const [column, value] of Object.entries(from)) {
    if (column === "_id" || column === "_sourceFiles") continue;
    if (cellBlank(into[column]) && !cellBlank(value)) into[column] = value;
  }
  const sources = new Set([...(into._sourceFiles ?? []), ...(from._sourceFiles ?? [])]);
  if (sources.size > 0) into._sourceFiles = Array.from(sources);
}

/**
 * Link each section's rows by entity name. Order-preserving: the first row for
 * a name is kept and enriched; later mergeable rows fold into it; conflicting
 * rows (real second spend lines) stay as their own rows.
 */
export function linkWorkbookRows(
  rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>>,
): { rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>>; reconciliation: ReconciliationFinding[] } {
  const linked: Partial<Record<WorkbookSectionKey, WorkbookRow[]>> = {};
  const reconciliation: ReconciliationFinding[] = [];

  for (const [sectionKey, sectionRows] of Object.entries(rows)) {
    const section = sectionKey as WorkbookSectionKey;
    const keyColumns = LINK_KEY_COLUMNS[section];
    if (!keyColumns || !sectionRows || sectionRows.length < 2) {
      linked[section] = sectionRows;
      continue;
    }

    const kept: WorkbookRow[] = [];
    const byName = new Map<string, WorkbookRow[]>();

    for (const row of sectionRows) {
      const joinKeys = (fn: (v: unknown) => string) =>
        keyColumns.map((column) => fn(row[column])).join("|").replace(/^\|+|\|+$/g, "");
      const squashed = joinKeys(entityMatchKey);
      const sorted = joinKeys(entityMatchKeySorted);
      if (squashed === "") {
        kept.push(row);
        continue;
      }
      const display = keyColumns.map((column) => String(row[column] ?? "").trim()).filter(Boolean).join(" ");
      // Either key form finds the group; both forms register it, so a later
      // spelling under the OTHER form still lands in the same group.
      const candidates = byName.get(squashed) ?? byName.get(sorted) ?? [];

      let merged = false;
      for (const candidate of candidates) {
        const decision = mergeDecision(section, candidate, row, display);
        if (!decision.merge) continue;
        if (decision.finding) {
          reconciliation.push({ section, entity: display, column: "spend", message: decision.finding });
        }
        mergeInto(candidate, row);
        merged = true;
        break;
      }
      if (!merged) {
        candidates.push(row);
        kept.push(row);
      }
      byName.set(squashed, candidates);
      byName.set(sorted, candidates);
    }

    // A ledger row that never linked to anything is either a supplier the
    // schedule omits, or the SAME supplier under a different spelling — and in
    // the second case its spend is now counted twice. Name matching is
    // deliberately exact ("TST TRUCK" does not become "TST Truc Chassis"), so
    // rather than guess, say so: the user can see both rows and decide.
    for (const row of kept) {
      const sources = row._sourceFiles ?? [];
      if (sources.length !== 1 || !/ledger|statement/i.test(sources[0])) continue;
      const name = keyColumns.map((column) => String(row[column] ?? "").trim()).filter(Boolean).join(" ");
      if (!name) continue;
      reconciliation.push({
        section,
        entity: name,
        column: "supplierName",
        message: `${sources[0]} did not match any supplier already on the schedule. If "${name}" is the same supplier under a different spelling, its spend is being counted twice — otherwise it is a supplier the schedule omits.`,
      });
    }

    // Identity propagation: the certificate merged into ONE of the supplier's
    // rows; its level and empowering status hold for all of them.
    const identityColumns = IDENTITY_COLUMNS[section] ?? [];
    if (identityColumns.length > 0) {
      for (const group of Array.from(byName.values())) {
        if (group.length < 2) continue;
        for (const column of identityColumns) {
          const value = group.map((r) => r[column]).find((v) => !cellBlank(v));
          if (cellBlank(value)) continue;
          for (const row of group) {
            if (cellBlank(row[column])) row[column] = value;
          }
        }
      }
    }

    linked[section] = kept;
  }

  return { rows: linked, reconciliation };
}

/**
 * Add a value to a conflict's candidate list, merging into an existing
 * candidate when the value already appears — a third document agreeing with
 * the first is corroboration for that side, not a new option to choose from.
 */
function addCandidate(conflict: MetaConflict, value: unknown, sourceFile: string): void {
  const same = conflict.candidates.find((c) => cellsAgree(c.value, value));
  if (same) {
    if (sourceFile && !same.sources.includes(sourceFile)) same.sources.push(sourceFile);
    return;
  }
  conflict.candidates.push({ value, sources: sourceFile ? [sourceFile] : [] });
}

/** Is this value a table — an array of row-shaped objects? */
function isRowTable(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry));
}

/**
 * Turn parser extractions into workbook rows and meta.
 *
 * `options.element` on each extraction disambiguates fields that exist in more
 * than one pillar (contribution_type is ESD or SED, never a guess).
 */
export function parserExtractionsToWorkbook(
  extractions: ParserExtraction[],
  options: {
    sectorCode?: string;
    scorecardType?: string;
    /**
     * The parser's RESOLVED entity-level fields, keyed by parser field name.
     *
     * The resolver saw every document at once and compared them, so where it
     * has an opinion it beats anything decided here from one extraction at a
     * time: it knows how many documents agreed, and it knows when they did not.
     * Rows still come from the per-document extractions — a share register
     * genuinely is many rows — but a single entity-level figure like revenue or
     * TMPS should be the resolver's answer or nobody's.
     */
    resolved?: Record<string, ResolvedFieldInfo>;
    /** Remembered closed-vocabulary decisions (see vocabularyRoutes) applied at injection. */
    vocabulary?: VocabularyDecisions;
  } = {},
): ParserToWorkbookResult {
  const rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>> = {};
  const meta: Partial<Record<WorkbookSectionKey, Record<string, unknown>>> = {};
  const rejected: ParserToWorkbookResult["rejected"] = [];
  const unmapped = new Set<string>();
  const metaConflicts: MetaConflict[] = [];
  const metaCorroboration: MetaCorroboration[] = [];
  /** Entity-level figures settled by rule rather than by the user — each one explained. */
  const metaResolutions: ReconciliationFinding[] = [];

  const addRow = (section: WorkbookSectionKey, row: WorkbookRow) => {
    (rows[section] ??= []).push(row);
  };

  // Meta keys whose value came from a LABELLED, deterministically-read source.
  // "First value wins" is right between two model readings, but a stated total
  // must beat a computed one whatever order the extractions arrived in: the
  // model-computed TMPS summed the exclusions back in and overstated the
  // denominator by millions on the real pack.
  const AUTHORITATIVE_DOCS = new Set(["sheet_financials"]);
  const metaFromAuthoritative = new Set<string>();
  /** Meta keys already decided by the resolver — settled, not revisited. */
  const metaFromResolver = new Set<string>();
  /**
   * What each meta key was first filled with, so a LATER disagreement is
   * reported instead of dropped. Without this a second document stating a
   * different revenue simply vanished: whichever figure arrived first was
   * scored and nobody was told there had been a choice.
   */
  const metaFirstValue = new Map<string, { value: unknown; sourceFile: string; field: string }>();
  /**
   * Meta keys known to be contested. Once a figure is in dispute it stays out
   * of the workbook — otherwise the next document to mention it would find the
   * cell empty and quietly fill it back in, reinstating the value we had just
   * established we cannot stand behind.
   */
  const metaContested = new Set<string>();

  for (const extraction of extractions) {
    // Values for THIS document, split into the scalar ones (which together make
    // one row per section) and the tabular ones (which make many).
    const scalarBySection = new Map<WorkbookSectionKey, Array<{ field: string; value: unknown }>>();
    const tables: Array<{ section: WorkbookSectionKey; entries: Array<Record<string, unknown>> }> = [];

    for (const { field, value } of extraction.values) {
      if (isRowTable(value)) {
        // A table's own column names are parser fields too, so resolve the
        // section from the FIRST entry's keys rather than from the table name.
        const firstKey = Object.keys(value[0]).find((key) => targetForField(key, extraction.element));
        const target = firstKey ? targetForField(firstKey, extraction.element) : null;
        if (!target) {
          unmapped.add(field);
          continue;
        }
        tables.push({ section: target.section, entries: value });
        continue;
      }

      const target = targetForField(field, extraction.element);
      if (!target) {
        unmapped.add(field);
        continue;
      }

      if (target.meta) {
        // Entity-level: one value for the whole case, not a row. Meta fields
        // live in the section's `meta` array, not its `columns`, so they take
        // the meta injection path — same type/validation rules, different lookup.
        const bucket = (meta[target.section] ??= {});
        const metaKey = `${target.section}.${target.column}`;

        // THE RESOLVER'S ANSWER WINS. It compared every document at once; this
        // loop only ever sees one at a time, so anything decided here would be
        // a worse version of a question already answered properly.
        const resolvedField = options.resolved?.[field];
        // A LABELLED, deterministic reading (the Finance sheet's own stated
        // TMPS) outranks anything the resolver settled from another field
        // feeding the same column. Two parser fields map to `tmps`; whichever
        // arrived first used to claim the column for good — and on a real pack
        // the first was `total_pre_exclusions_tmps` read as 23 (a row count),
        // which then blocked the sheet's stated R4,674,995 from ever landing.
        const authoritativeReading = AUTHORITATIVE_DOCS.has(extraction.documentId);
        if (resolvedField && !authoritativeReading) {
          if (metaFromResolver.has(metaKey) || metaFromAuthoritative.has(metaKey)) continue; // settled
          metaFromResolver.add(metaKey);

          if (resolvedField.conflicted) {
            const candidates = [
              { value: resolvedField.value, sources: resolvedField.sources },
              ...resolvedField.alternatives,
            ];
            // A lopsided disagreement is not an open question. See
            // resolveLopsidedConflict — the corroborated figure is scored and
            // the outlier is reported, instead of blanking the pillar.
            const settled = resolveLopsidedConflict(candidates);
            if (settled) {
              const fromSettled = injectMetaValue(target.section, target.column, settled.value, options);
              if (fromSettled.ok) {
                bucket[target.column] = fromSettled.value;
                metaCorroboration.push({
                  section: target.section,
                  column: target.column,
                  field,
                  value: fromSettled.value,
                  agreementCount: settled.sources.length,
                  sources: settled.sources,
                });
                metaResolutions.push({
                  section: target.section,
                  entity: target.column,
                  column: target.column,
                  message: settled.note,
                });
                continue;
              }
            }
            metaConflicts.push({ section: target.section, column: target.column, field, candidates });
            continue;
          }

          const fromResolver = injectMetaValue(target.section, target.column, resolvedField.value, options);
          if (fromResolver.ok) {
            bucket[target.column] = fromResolver.value;
            if (resolvedField.agreementCount > 1) {
              metaCorroboration.push({
                section: target.section,
                column: target.column,
                field,
                value: fromResolver.value,
                agreementCount: resolvedField.agreementCount,
                sources: resolvedField.sources,
              });
            }
          } else {
            rejected.push({ ...fromResolver.rejection, sourceFile: extraction.sourceFile, section: target.section });
          }
          continue;
        }

        const injected = injectMetaValue(target.section, target.column, value, options);
        if (injected.ok) {
          const authoritative = authoritativeReading;
          if (authoritative && !metaFromAuthoritative.has(metaKey)) {
            // The stated figure settles the column: it replaces whatever a
            // resolver or a peer document put there, and closes any open
            // conflict on it — a labelled total is not one opinion among many.
            bucket[target.column] = injected.value;
            metaFromAuthoritative.add(metaKey);
            metaFromResolver.add(metaKey);
            metaContested.delete(metaKey);
            const openAt = metaConflicts.findIndex((c) => c.section === target.section && c.column === target.column);
            if (openAt >= 0) metaConflicts.splice(openAt, 1);
            metaFirstValue.set(metaKey, { value: injected.value, sourceFile: extraction.sourceFile, field });
            continue;
          }
          if (metaContested.has(metaKey)) {
            const open = metaConflicts.find(
              (c) => c.section === target.section && c.column === target.column,
            );
            if (open) addCandidate(open, injected.value, extraction.sourceFile);
            continue;
          }
          // First value wins between peers, but a labelled (deterministic)
          // reading replaces a model-computed one, and once a labelled value is
          // in, nothing overwrites it.
          if (
            bucket[target.column] === undefined
            || (authoritative && !metaFromAuthoritative.has(metaKey))
          ) {
            bucket[target.column] = injected.value;
            if (authoritative) metaFromAuthoritative.add(metaKey);
            metaFirstValue.set(metaKey, {
              value: injected.value,
              sourceFile: extraction.sourceFile,
              field,
            });
          } else {
            // A disagreement with a LABELLED total is not a conflict — it is
            // already settled. The stated figure on the Finance sheet beats a
            // model-computed one by rule (the computed TMPS summed the
            // exclusions back in and overstated the denominator by millions),
            // so putting that to the user would be asking them to re-decide
            // something we know the answer to.
            if (metaFromAuthoritative.has(metaKey)) continue;

            const first = metaFirstValue.get(metaKey);
            if (first && !cellsAgree(first.value, injected.value)) {
              // Contested, so nothing is scored from it — the first-arrived
              // value comes back OUT of the bucket.
              delete bucket[target.column];
              metaContested.add(metaKey);
              metaConflicts.push({
                section: target.section,
                column: target.column,
                field,
                candidates: [
                  { value: first.value, sources: [first.sourceFile].filter(Boolean) },
                  { value: injected.value, sources: [extraction.sourceFile].filter(Boolean) },
                ],
              });
            } else if (first) {
              // Two documents, same figure. Worth saying so.
              const agreed = metaCorroboration.find(
                (c) => c.section === target.section && c.column === target.column,
              );
              if (agreed) {
                if (extraction.sourceFile && !agreed.sources.includes(extraction.sourceFile)) {
                  agreed.sources.push(extraction.sourceFile);
                  agreed.agreementCount = agreed.sources.length;
                }
              } else {
                metaCorroboration.push({
                  section: target.section,
                  column: target.column,
                  field,
                  value: first.value,
                  agreementCount: 2,
                  sources: [first.sourceFile, extraction.sourceFile].filter(Boolean),
                });
              }
            }
          }
        } else {
          rejected.push({ ...injected.rejection, sourceFile: extraction.sourceFile, section: target.section });
        }
        continue;
      }

      const list = scalarBySection.get(target.section) ?? [];
      list.push({ field: target.column, value });
      scalarBySection.set(target.section, list);
    }

    // Scalars: one row per section this document contributed to.
    for (const [section, values] of Array.from(scalarBySection.entries())) {
      const injected = injectIntoSection(section, values.map((v: { field: string; value: unknown }) => ({ ...v, sourceFile: extraction.sourceFile })), options);
      for (const rejection of injected.rejected) {
        rejected.push({ ...rejection, sourceFile: extraction.sourceFile, section });
      }
      if (Object.keys(injected.cells).length > 0) {
        addRow(section, { _id: nextRowId(), ...injected.cells, _sourceFiles: [extraction.sourceFile] });
      }
    }

    // Tables: one row per entry. A share register is twelve shareholders, and
    // flattening it would score a fraction of the ownership.
    for (const table of tables) {
      for (const entry of table.entries) {
        const values = Object.entries(entry)
          .map(([key, value]) => {
            const target = targetForField(key, extraction.element);
            if (!target) { unmapped.add(key); return null; }
            return { field: target.column, value, sourceFile: extraction.sourceFile };
          })
          .filter((v): v is { field: string; value: unknown; sourceFile: string } => v !== null);

        if (values.length === 0) continue;

        const injected = injectIntoSection(table.section, values, options);
        for (const rejection of injected.rejected) {
          rejected.push({ ...rejection, sourceFile: extraction.sourceFile, section: table.section });
        }
        if (Object.keys(injected.cells).length > 0) {
          addRow(table.section, { _id: nextRowId(), ...injected.cells, _sourceFiles: [extraction.sourceFile] });
        }
      }
    }
  }

  // Link before coverage: a certificate row enriched with its schedule row's
  // spend is complete; counted separately both halves would report gaps.
  const linked = linkWorkbookRows(rows);

  // Completion pass: derive required fields from values ALREADY in the row and
  // drop identity-less fragments. The 64-file Thandanani pack produced 339
  // "Required" validation issues, most of them derivable — never fabricated.
  completeWorkbookRows(linked.rows, rejected);

  // Collapse exact same-document duplicates AFTER completion: ledger-block
  // inheritance fills a continuation row's blank type/%-black to match its
  // header row, so two "same beneficiary, same amount" rows that DIFFERED
  // before the completion pass become identical after it. Deduping earlier
  // missed exactly this (real SED case: two "Essentially Edenvale · R500" rows
  // from one sheet, distinguished only once inheritance had run).
  const duplicateFindings = dedupeExactDuplicateRows(linked.rows);

  // Peer conflicts (two documents, first-come) can BECOME lopsided once a third
  // document weighs in and addCandidate merges its source onto one side. Settle
  // those the same way the resolver's conflicts were settled above.
  for (let i = metaConflicts.length - 1; i >= 0; i--) {
    const conflict = metaConflicts[i];
    const settled = resolveLopsidedConflict(conflict.candidates);
    if (!settled) continue;
    const injected = injectMetaValue(conflict.section, conflict.column, settled.value, options);
    if (!injected.ok) continue;
    (meta[conflict.section] ??= {})[conflict.column] = injected.value;
    metaConflicts.splice(i, 1);
    metaCorroboration.push({
      section: conflict.section,
      column: conflict.column,
      field: conflict.field,
      value: injected.value,
      agreementCount: settled.sources.length,
      sources: settled.sources,
    });
    metaResolutions.push({ section: conflict.section, entity: conflict.column, column: conflict.column, message: settled.note });
  }

  // Cross-checks that need the WHOLE case assembled: a denominator against
  // the rows it must contain, and one person's race across the sections that
  // name them. Both report; neither guesses.
  const tmpsFindings = sanityCheckTmps(meta, linked.rows, metaConflicts);
  const raceFindings = reconcileRaceAcrossSections(linked.rows);

  const coverage = huntRequiredFields(linked.rows, Array.from(unmapped), options);
  return {
    rows: linked.rows,
    meta,
    rejected,
    coverage,
    reconciliation: [...linked.reconciliation, ...duplicateFindings, ...metaResolutions, ...tmpsFindings, ...raceFindings],
    metaConflicts,
    metaCorroboration,
  };
}

/**
 * Settle a lopsided disagreement about an entity-level figure.
 *
 * The conflict rule ("two documents disagree → blank it, the user picks") is
 * right when the documents are peers. It is wrong when one figure is stated by
 * two or more documents and the only dissent is a single document off by an
 * order of magnitude — that is not a disagreement, it is a monthly figure next
 * to an annual one, or a subtotal next to a total. Measured: leviable payroll
 * R2,124,744 on the Finance sheets of two workbooks against R22,057.61 on one
 * PDF, and the conflict rule blanked the Skills denominator for a figure two
 * sources had already agreed on.
 *
 * Returns the corroborated candidate with a plain-language note, or null when
 * the disagreement is genuinely open (peers, or the outlier is not far off).
 */
export function resolveLopsidedConflict(
  candidates: Array<{ value: unknown; sources: string[] }>,
): { value: unknown; sources: string[]; note: string } | null {
  const numeric = candidates
    .map((c) => ({ ...c, n: Number(String(c.value ?? "").replace(/[^0-9.-]/g, "")) }))
    .filter((c) => Number.isFinite(c.n) && c.n !== 0);
  if (numeric.length < 2 || numeric.length !== candidates.length) return null;

  const corroborated = numeric.filter((c) => c.sources.length >= 2);
  if (corroborated.length !== 1) return null;
  const winner = corroborated[0];
  const others = numeric.filter((c) => c !== winner);
  if (others.some((c) => c.sources.length >= 2)) return null;
  const farOff = others.every((c) => {
    const ratio = Math.max(Math.abs(winner.n), Math.abs(c.n)) / Math.min(Math.abs(winner.n), Math.abs(c.n));
    return ratio >= 10;
  });
  if (!farOff) return null;

  const fmt = (n: number) => `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
  return {
    value: winner.value,
    sources: winner.sources,
    note:
      `${fmt(winner.n)} is stated by ${winner.sources.length} documents (${winner.sources.join(", ")}); `
      + `${others.map((c) => `${fmt(c.n)} in ${c.sources.join(", ") || "one document"}`).join("; ")} `
      + `is a single reading at least 10× away — most likely a monthly or partial figure — so the corroborated figure is used and the outlier is noted here.`,
  };
}

/**
 * Total Measured Procurement Spend must CONTAIN the supplier schedule. When
 * the figure read as TMPS is smaller than the largest single supplier's spend,
 * or equals the schedule's row count, it is not TMPS — it is a count or a
 * misplaced cell. (Measured, twice: `tmps = 23` on a schedule of 23 rows
 * summing to R3.3M. Scored, that makes every supplier "more than all
 * procurement" and the pillar nonsense.) The figure is withdrawn from meta and
 * put to the user as a conflict against the schedule total, which is the
 * lower bound any verifier would start from.
 */
function sanityCheckTmps(
  meta: Partial<Record<WorkbookSectionKey, Record<string, unknown>>>,
  rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>>,
  metaConflicts: MetaConflict[],
): ReconciliationFinding[] {
  const fin = meta["financial-information"];
  const tmps = Number(fin?.tmps);
  if (!fin || !Number.isFinite(tmps) || tmps <= 0) return [];
  const suppliers = rows.procurement ?? [];
  const spends = suppliers.map((r) => Number(String(r.spend ?? "").replace(/[^0-9.]/g, "")) || 0);
  if (spends.length === 0) return [];
  const largest = Math.max(...spends);
  const sum = spends.reduce((n, v) => n + v, 0);
  const looksLikeCount = Number.isInteger(tmps) && tmps <= suppliers.length + 2;
  if (!(largest > tmps) && !looksLikeCount) return [];

  delete fin.tmps;
  const fmt = (n: number) => `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
  const already = metaConflicts.find((c) => c.section === "financial-information" && c.column === "tmps");
  const candidates = [
    { value: tmps, sources: ["as read"] },
    { value: Math.round(sum), sources: ["sum of the supplier schedule (lower bound)"] },
  ];
  if (already) already.candidates = candidates;
  else metaConflicts.push({ section: "financial-information", column: "tmps", field: "total_measured_procurement_spend", candidates });
  return [{
    section: "financial-information",
    entity: "Total Measured Procurement Spend",
    column: "tmps",
    message:
      `TMPS was read as ${fmt(tmps)}, but the supplier schedule it must contain has ${suppliers.length} rows summing to ${fmt(sum)}`
      + ` (largest single supplier ${fmt(largest)})${looksLikeCount ? " — the figure equals a row count, not a spend" : ""}.`
      + ` It has been withdrawn; confirm TMPS in the workbook (the schedule total ${fmt(sum)} is the lower bound).`,
  }];
}

/**
 * One person, one race. The Ownership sheet often records an owner as
 * "Black" — the Codes' umbrella term — which normalises to African, while the
 * EE register states the specific race the person actually declared. When
 * the SAME 13-digit ID appears on both, the EE register's specific race is
 * the evidence and the ownership row takes it. Exact ID equality only; a
 * name is never enough to say two rows are one person.
 */
function reconcileRaceAcrossSections(
  rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>>,
): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const idOf = (v: unknown) => String(v ?? "").replace(/\s+/g, "");
  const declared = new Map<string, string>();
  for (const row of rows["management-control"] ?? []) {
    const id = idOf(row.idNumber);
    const race = String(row.race ?? "").trim();
    if (/^\d{13}$/.test(id) && race && !declared.has(id)) declared.set(id, race);
  }
  if (declared.size === 0) return findings;
  for (const row of rows.ownership ?? []) {
    const id = idOf(row.idNumber);
    const stated = declared.get(id);
    const current = String(row.race ?? "").trim();
    if (!stated || !current || stated.toLowerCase() === current.toLowerCase()) continue;
    row.race = stated;
    findings.push({
      section: "ownership",
      entity: String(row.shareholderName ?? id),
      column: "race",
      message: `${String(row.shareholderName ?? "This owner")} is recorded as ${current} on the ownership evidence but as ${stated} on the EE register under the same ID (${id}). The register's declared race is used.`,
    });
  }
  return findings;
}

/**
 * Collapse EXACT duplicate rows emitted from the same document. The model
 * sometimes returns the same schedule twice (a region rendered twice, or the
 * same table under two field names), and a verbatim duplicate from one file is
 * the same evidence stated twice. Only collapses when EVERY non-blank cell
 * agrees AND the provenance is identical — a genuine repeated line item almost
 * always differs somewhere (date, reference, description); when it truly does
 * not, the mergeDecision precedent applies: never inflate on our own judgement.
 * Every collapse is reported so the user can restore a real repeat.
 */
function dedupeExactDuplicateRows(
  rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>>,
): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  for (const [sectionKey, sectionRows] of Object.entries(rows)) {
    const section = sectionKey as WorkbookSectionKey;
    if (!sectionRows || sectionRows.length < 2) continue;
    const seen = new Map<string, { row: WorkbookRow; dropped: number }>();
    const kept: WorkbookRow[] = [];
    for (const row of sectionRows) {
      const signature = JSON.stringify([
        (row._sourceFiles ?? []).slice().sort(),
        Object.entries(row)
          .filter(([key, value]) => !key.startsWith("_") && !cellBlank(value))
          .map(([key, value]) => [key, String(value).trim().toLowerCase()])
          .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      ]);
      const existing = seen.get(signature);
      if (existing) {
        existing.dropped += 1;
        continue;
      }
      seen.set(signature, { row, dropped: 0 });
      kept.push(row);
    }
    if (kept.length === sectionRows.length) continue;
    rows[section] = kept;
    for (const { row, dropped } of seen.values()) {
      if (!dropped) continue;
      const nameColumn = (LINK_KEY_COLUMNS[section] ?? [])[0];
      const entity = String((nameColumn && row[nameColumn]) ?? "").trim() || "unnamed row";
      findings.push({
        section,
        entity,
        column: nameColumn ?? "",
        message: `${entity}: ${dropped + 1} identical ${section} rows came out of ${row._sourceFiles?.[0] ?? "the same document"} — collapsed to one so the same evidence is not counted twice. If these are genuinely separate transactions, add a date or description to tell them apart.`,
      });
    }
  }
  return findings;
}

/**
 * Fill required fields that are DERIVABLE from the row's own extracted values,
 * and drop rows with no identity at all (a share-register totals line arrives
 * as a bare `numberOfShares` fragment). Each rule is evidence-faithful:
 *
 * - name → surname split (last whitespace token; "Given Names, Surname" comma
 *   form honoured) — mirrors the excel importer's W3 rule.
 * - management `designation` ← `occupationalLevel`: the projection treats them
 *   as the same dimension, so an absent designation adds no information.
 * - sed `descriptionOfSpend` ← composed from the row's own type + beneficiary —
 *   a description of extracted values, not new evidence.
 * - procurement `currentSize` ← "Generic": scoring already treats an unknown
 *   supplier size as generic (no EME/QSE recognition), so the default states
 *   the existing behaviour instead of leaving a Required error. Conservative:
 *   generic earns the FEWEST procurement points.
 */
function completeWorkbookRows(
  rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>>,
  rejected: ParserToWorkbookResult["rejected"],
): void {
  const splitName = (full: string): { name: string; surname: string } | null => {
    const trimmed = full.trim();
    if (!trimmed) return null;
    // "Given Names, Surname" — the comma states the boundary explicitly.
    const comma = trimmed.match(/^(.+),\s*(\S.*)$/);
    if (comma) return { name: comma[1].trim(), surname: comma[2].trim() };
    if (!/\s/.test(trimmed)) return null;
    const parts = trimmed.split(/\s+/);
    const surname = parts.pop() as string;
    return { name: parts.join(" "), surname };
  };

  for (const row of rows["management-control"] ?? []) {
    const nm = String(row.name ?? "").trim();
    if (nm && !String(row.surname ?? "").trim()) {
      const split = splitName(nm);
      if (split) { row.name = split.name; row.surname = split.surname; }
    }
    // NOTE: designation is NOT back-filled from occupationalLevel. They are
    // different dropdowns ("Top Management" is an Occupational Level, never a
    // Designation), so copying across put an out-of-vocab value in the cell —
    // the exact silent-zero / disconnected-dropdown failure we are ending.
    // Scoring reads occupationalLevel; an absent designation is left blank and
    // surfaced as a review item rather than filled with a wrong option.
  }

  // Ledger continuation rows: the sheet states type / % black once on the
  // block's header row; the model often emits it only there. Inherit those
  // attributes to rows of the SAME beneficiary — evidence from the same block,
  // never invented across beneficiaries.
  for (const contribSection of ["sed", "esd"] as const) {
    const stated = new Map<string, { type?: unknown; pct?: unknown }>();
    for (const row of rows[contribSection] ?? []) {
      const key = String(row.beneficiaryName ?? "").trim().toLowerCase();
      if (!key) continue;
      const entry = stated.get(key) ?? {};
      if (String(row.contributionType ?? "").trim() && entry.type === undefined) entry.type = row.contributionType;
      if (row.percentBenefitingBlack !== undefined && row.percentBenefitingBlack !== null && entry.pct === undefined) entry.pct = row.percentBenefitingBlack;
      stated.set(key, entry);
    }
    for (const row of rows[contribSection] ?? []) {
      const entry = stated.get(String(row.beneficiaryName ?? "").trim().toLowerCase());
      if (!entry) continue;
      if (!String(row.contributionType ?? "").trim() && entry.type !== undefined) row.contributionType = entry.type;
      if ((row.percentBenefitingBlack === undefined || row.percentBenefitingBlack === null) && entry.pct !== undefined) {
        row.percentBenefitingBlack = entry.pct;
      }
    }
  }

  for (const row of rows.sed ?? []) {
    if (!String(row.descriptionOfSpend ?? "").trim()) {
      const type = String(row.contributionType ?? "").trim();
      const beneficiary = String(row.beneficiaryName ?? "").trim();
      if (beneficiary) row.descriptionOfSpend = type ? `${type} — ${beneficiary}` : `Contribution — ${beneficiary}`;
    }
  }

  // PURITY RULE: a supplier's size is NOT entailed by anything on the row, so it
  // is never guessed. Defaulting unknown size to "Generic" wrote a value the
  // evidence did not contain and quietly moved the procurement score. An unknown
  // size stays blank and is surfaced as a coverage gap by reconcileEntity — the
  // score reflects only what the documents actually established.

  // Cross-section identity adoption: the SAME 13-digit ID on a NAMED row
  // elsewhere in this pack names an ID-only row — exact ID equality, never a
  // name guess. (An ID register names people the share certificate only IDs.)
  const nameById = new Map<string, string>();
  const idKey = (id: unknown): string => String(id ?? "").replace(/\s+/g, "");
  const recordName = (id: unknown, name: string) => {
    const key = idKey(id);
    if (!/^\d{13}$/.test(key)) return;
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (trimmed && !nameById.has(key)) nameById.set(key, trimmed);
  };
  for (const row of rows.ownership ?? []) recordName(row.idNumber, String(row.shareholderName ?? ""));
  for (const row of rows["management-control"] ?? []) recordName(row.idNumber, `${String(row.name ?? "")} ${String(row.surname ?? "")}`);
  for (const row of rows["skills-development"] ?? []) recordName(row.idNumber, String(row.learnerName ?? ""));

  // A person-grid row with no NAME is not something anyone can complete or
  // score — "2 owners without a name" is worse than an open item. Adopt the
  // name from an exact ID match if the pack has one; otherwise PARK the row
  // for review instead of rendering a nameless person. Nothing is silently
  // dropped: every parked row is reported with the cells it carried.
  const parkNameless = (
    section: WorkbookSectionKey,
    nameField: string,
    hasName: (r: WorkbookRow) => boolean,
    adoptName: (r: WorkbookRow, adopted: string) => void,
  ) => {
    const sectionRows = rows[section];
    if (!sectionRows) return;
    for (const row of sectionRows) {
      if (hasName(row)) continue;
      const adopted = nameById.get(idKey(row.idNumber));
      if (adopted) adoptName(row, adopted);
    }
    const kept: WorkbookRow[] = [];
    for (const row of sectionRows) {
      if (hasName(row)) {
        kept.push(row);
        continue;
      }
      const carried = Object.keys(row).filter((k) => !k.startsWith("_") && !cellBlank(row[k]));
      if (carried.length === 0) continue; // pure fragment — nothing to report
      const id = String(row.idNumber ?? "").trim();
      rejected.push({
        field: nameField,
        value: id || "(no identity)",
        reason: "failed_validation",
        detail: `${section} row with no name${id ? ` (ID ${id})` : ""} — parked for review rather than created nameless. It carried: ${carried.join(", ")}.`,
        sourceFile: row._sourceFiles?.[0] ?? "",
      });
    }
    rows[section] = kept;
  };

  parkNameless(
    "ownership",
    "shareholderName",
    (r) => Boolean(String(r.shareholderName ?? "").trim()),
    (r, adopted) => { r.shareholderName = adopted; },
  );
  parkNameless(
    "management-control",
    "name",
    (r) => Boolean(String(r.name ?? "").trim()),
    (r, adopted) => {
      const split = splitName(adopted);
      if (split) { r.name = split.name; r.surname = r.surname || split.surname; }
      else r.name = adopted;
    },
  );
}

/**
 * Shape the result as workbook sections, ready to merge into a workbook.
 *
 * Mirrors the importer's section shape ({ rows, meta }) so both front doors
 * hand the workbook the same thing — which is the Phase 2 contract.
 */
export function toWorkbookSections(
  result: ParserToWorkbookResult,
): Record<string, { rows: WorkbookRow[]; meta?: Record<string, unknown> }> {
  const sections: Record<string, { rows: WorkbookRow[]; meta?: Record<string, unknown> }> = {};

  for (const [section, sectionRows] of Object.entries(result.rows)) {
    sections[section] = { rows: sectionRows ?? [] };
  }
  for (const [section, sectionMeta] of Object.entries(result.meta)) {
    sections[section] = { rows: sections[section]?.rows ?? [], meta: sectionMeta };
  }

  // Unresolved disagreements travel WITH the workbook, under reserved keys.
  //
  // A conflict is found once, at upload, but it is answered later — in the
  // workbook, by someone with the documents open. If it lived only in the
  // upload screen's memory it would be gone by the time anyone could act on
  // it, and the figure would just be permanently missing with no explanation.
  // Reserved `_` keys are not columns, so the grid ignores them and
  // persistSection writes the section wholesale, so they survive a reload.
  const attach = (section: string, key: string, value: unknown[]) => {
    if (value.length === 0) return;
    const target = (sections[section] ??= { rows: [] });
    target.meta = { ...(target.meta ?? {}), [key]: value };
  };

  for (const section of Array.from(new Set(result.metaConflicts.map((c) => c.section)))) {
    attach(
      section,
      META_CONFLICTS_KEY,
      result.metaConflicts.filter((c) => c.section === section).map(({ column, field, candidates }) => ({ column, field, candidates })),
    );
  }
  for (const section of Array.from(new Set(result.metaCorroboration.map((c) => c.section)))) {
    attach(
      section,
      META_CORROBORATION_KEY,
      result.metaCorroboration
        .filter((c) => c.section === section)
        .map(({ column, field, value, agreementCount, sources }) => ({ column, field, value, agreementCount, sources })),
    );
  }
  return sections;
}

/** A section as either mapper hands it over: rows and/or entity-level meta. */
export interface MergeableSection {
  rows?: unknown[];
  meta?: Record<string, unknown>;
}

/**
 * Merge the legacy parser-case sections with the richer AI-entity sections.
 *
 * The parser returns BOTH shapes at once: the deterministic case result (with
 * its own supplier / ownership / SED rows) and the AI-entity extractions. The
 * AI-entity path reads whole SCHEDULES (every supplier, every shareholder, every
 * beneficiary) and carries provenance, so where it produced ROWS for a section
 * those are authoritative and REPLACE the legacy rows. Adding them instead would
 * double-count the same suppliers and beneficiaries once they score, and for
 * ownership would stack the legacy synthetic "aggregate black shareholding"
 * holder on top of the real share register — distorting a share-weighted calc.
 *
 * Legacy rows survive only for sections the AI-entity path left empty, so no
 * evidence the richer path missed is lost. Meta is merged with the LEGACY value
 * winning a conflict — it is the deterministic reading of an entity-level number.
 */
export function mergeWorkbookSections(
  legacy: Record<string, MergeableSection>,
  injected: Record<string, MergeableSection>,
): Record<string, MergeableSection> {
  const out: Record<string, MergeableSection> = {};
  for (const [key, section] of Object.entries(legacy)) {
    out[key] = { rows: [...(section.rows ?? [])], ...(section.meta ? { meta: { ...section.meta } } : {}) };
  }
  for (const [key, section] of Object.entries(injected)) {
    const existing = out[key] ?? {};
    const injectedRows = section.rows ?? [];
    const mergedMeta = { ...(section.meta ?? {}), ...(existing.meta ?? {}) };
    const merged: MergeableSection = {
      // Injected rows are authoritative WHERE PRESENT; otherwise keep legacy's.
      rows: injectedRows.length > 0 ? injectedRows : (existing.rows ?? []),
    };
    if (Object.keys(mergedMeta).length > 0) merged.meta = mergedMeta;
    out[key] = merged;
  }
  return out;
}
