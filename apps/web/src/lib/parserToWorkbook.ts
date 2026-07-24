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

/** Columns that are evidence in themselves — a differing value blocks a merge. */
const EVIDENCE_COLUMNS: Partial<Record<WorkbookSectionKey, string[]>> = {
  procurement: ["spend"],
  esd: ["amount"],
  sed: ["amount"],
  ownership: ["numberOfShares", "shareholding", "votingRights", "economicInterest"],
  "management-control": ["salary", "occupationalLevel"],
  "skills-development": ["totalCost", "courseCost"],
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

function canMerge(section: WorkbookSectionKey, a: WorkbookRow, b: WorkbookRow): boolean {
  for (const column of EVIDENCE_COLUMNS[section] ?? []) {
    if (!cellBlank(a[column]) && !cellBlank(b[column]) && !cellsAgree(a[column], b[column])) {
      return false;
    }
  }
  return true;
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
): Partial<Record<WorkbookSectionKey, WorkbookRow[]>> {
  const linked: Partial<Record<WorkbookSectionKey, WorkbookRow[]>> = {};

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
      const name = keyColumns.map((column) => normaliseEntityName(row[column])).join(" ").trim();
      if (name === "") {
        kept.push(row);
        continue;
      }
      const candidates = byName.get(name) ?? [];
      const target = candidates.find((candidate) => canMerge(section, candidate, row));
      if (target) {
        mergeInto(target, row);
        continue;
      }
      candidates.push(row);
      byName.set(name, candidates);
      kept.push(row);
    }

    linked[section] = kept;
  }

  return linked;
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
          // First value wins — a later document may FILL a meta field but must
          // not overwrite one already established.
          if (bucket[target.column] === undefined) bucket[target.column] = injected.value;
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
  const linkedRows = linkWorkbookRows(rows);

  const coverage = huntRequiredFields(linkedRows, Array.from(unmapped), options);
  return { rows: linkedRows, meta, rejected, coverage };
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
