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
import { injectIntoSection, injectMetaValue, type InjectionRejection } from "./workbookInjection";
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

export interface ParserToWorkbookResult {
  /** Grid rows, per workbook section. */
  rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>>;
  /** Entity-level values (TMPS, revenue, NPAT), per section. */
  meta: Partial<Record<WorkbookSectionKey, Record<string, unknown>>>;
  /** Values that could not be placed in a cell, with the reason. */
  rejected: Array<InjectionRejection & { sourceFile: string }>;
  /** Required columns still unfilled + parser fields with no mapping. */
  coverage: CoverageReport;
  /**
   * Where two documents describe the same entity but disagree on a figure —
   * a supplier's own ledger against the client's schedule, most usefully.
   * Advisory: the lower figure is scored and the gap is reported.
   */
  reconciliation: ReconciliationFinding[];
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
 * When two documents disagree on a figure the LOWER one is kept and the gap is
 * reported. Never inflating a claim on our own judgement is the whole point:
 * over-claiming is what gets a certificate revoked, and a client under-claiming
 * against their own ledger is something to TELL them, not to silently correct.
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
      const lower = Math.min(left, right);
      const higher = Math.max(left, right);
      const lowerFile = (left <= right ? a : b)._sourceFiles?.[0] ?? "one document";
      const higherFile = (left <= right ? b : a)._sourceFiles?.[0] ?? "another document";
      finding = `${entity}: ${higherFile} supports ${column} of ${higher.toLocaleString()} but ${lowerFile} claims ${lower.toLocaleString()} — a difference of ${(higher - lower).toLocaleString()}. The lower figure is being used; confirm which is in scope.`;
      a[column] = lower;
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
  options: { sectorCode?: string; scorecardType?: string } = {},
): ParserToWorkbookResult {
  const rows: Partial<Record<WorkbookSectionKey, WorkbookRow[]>> = {};
  const meta: Partial<Record<WorkbookSectionKey, Record<string, unknown>>> = {};
  const rejected: ParserToWorkbookResult["rejected"] = [];
  const unmapped = new Set<string>();

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
        const injected = injectMetaValue(target.section, target.column, value, options);
        if (injected.ok) {
          const metaKey = `${target.section}.${target.column}`;
          const authoritative = AUTHORITATIVE_DOCS.has(extraction.documentId);
          // First value wins between peers, but a labelled (deterministic)
          // reading replaces a model-computed one, and once a labelled value is
          // in, nothing overwrites it.
          if (
            bucket[target.column] === undefined
            || (authoritative && !metaFromAuthoritative.has(metaKey))
          ) {
            bucket[target.column] = injected.value;
            if (authoritative) metaFromAuthoritative.add(metaKey);
          }
        } else {
          rejected.push({ ...injected.rejection, sourceFile: extraction.sourceFile });
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
        rejected.push({ ...rejection, sourceFile: extraction.sourceFile });
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
          rejected.push({ ...rejection, sourceFile: extraction.sourceFile });
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

  const coverage = huntRequiredFields(linked.rows, Array.from(unmapped), options);
  return { rows: linked.rows, meta, rejected, coverage, reconciliation: linked.reconciliation };
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
