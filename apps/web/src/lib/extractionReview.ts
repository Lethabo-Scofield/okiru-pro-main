/**
 * The reasoning layer between extraction and a workbook a verifier can trust.
 *
 * Everything the AI placed in the workbook is re-examined here as a WHOLE —
 * across rows and across sections — and turned into four honest artefacts:
 *
 *   extracted   what landed where, with per-section document provenance
 *   suggestions relationships the evidence itself proves (an SA ID number
 *               encodes gender; the same ID in Ownership carries a race that
 *               Management Control lacks) — each carries its BASIS and is
 *               applied only when the user confirms. Nothing is ever guessed:
 *               a value with no evidence trail becomes a decision, not a fill.
 *   conflicts   places where two pieces of evidence disagree (the same person
 *               is "African" in the share register and "Indian" in the
 *               management sheet; an aggregate black-women % sits on a row
 *               whose stated demographics contradict it) — surfaced for a
 *               human decision, never silently resolved.
 *   decisions   missing required fields grouped into single choices — "68 rows
 *               from the SED sheet need a contribution type" is ONE decision
 *               applied to every affected row, not 68 errors.
 *
 * Pure functions over workbook sections — no fetches, no model calls — so the
 * same review is reproducible on any load of the same workbook.
 */
import { getSection, type ColumnDef } from "@/components/workbook/sections";
import {
  aggregateWorkbookValidation,
  type WorkbookSectionsInput,
} from "@/components/workbook/workbookValidation";

export interface ReviewRowRef {
  rowId: string;
  /** Human handle for the row — the entity's name where one exists. */
  label: string;
}

export interface ReviewSectionSummary {
  section: string;
  sectionLabel: string;
  rowCount: number;
  /** Rows that carry document provenance (arrived via AI extraction). */
  aiRowCount: number;
  sources: string[];
}

export interface ReviewSuggestion {
  id: string;
  section: string;
  sectionLabel: string;
  rowId: string;
  rowLabel: string;
  column: string;
  columnLabel: string;
  value: string;
  /** One sentence: what will be filled. */
  statement: string;
  /** The evidence this rests on — shown beside the apply button. */
  basis: string;
}

export interface ReviewConflict {
  id: string;
  statement: string;
  /** Each side of the disagreement with where it came from. */
  sides: Array<{ label: string; value: string }>;
  section?: string;
  rows: ReviewRowRef[];
}

export interface ReviewDecision {
  id: string;
  section: string;
  sectionLabel: string;
  column: string;
  columnLabel: string;
  rows: ReviewRowRef[];
  /** Dropdown options when the column is a select — enables one-click bulk apply. */
  options?: string[];
  statement: string;
}

export interface ExtractionReview {
  extracted: ReviewSectionSummary[];
  suggestions: ReviewSuggestion[];
  conflicts: ReviewConflict[];
  decisions: ReviewDecision[];
  /** suggestions + conflicts + decisions — the modal badge count. */
  openItems: number;
}

type Row = Record<string, unknown> & { _id?: string; _sourceFiles?: string[] };

const str = (v: unknown): string => String(v ?? "").trim();

/** Sections whose rows describe PEOPLE (identity can link across them). */
const PEOPLE_SECTIONS: Array<{ key: string; nameCols: string[] }> = [
  { key: "ownership", nameCols: ["shareholderName"] },
  { key: "management-control", nameCols: ["name", "surname"] },
  { key: "employees", nameCols: ["name", "surname"] },
  { key: "skills-development", nameCols: ["learnerName"] },
];

const BLACK_RACES = new Set(["african", "coloured", "indian", "chinese"]);

function rowLabel(section: string, row: Row): string {
  for (const spec of PEOPLE_SECTIONS) {
    if (spec.key === section) {
      const name = spec.nameCols.map((c) => str(row[c])).filter(Boolean).join(" ");
      if (name) return name;
    }
  }
  return (
    str(row.supplierName) ||
    str(row.beneficiaryName) ||
    str(row.programName) ||
    str(row._id) ||
    "row"
  );
}

/**
 * South African ID numbers state gender: digits 7–10 (SSSS) are 0000–4999 for
 * female, 5000–9999 for male. Validity is checked with the ID's own Luhn
 * digit, so a typo'd number never produces a derivation.
 */
export function genderFromSaId(idNumber: unknown): "Male" | "Female" | null {
  const id = str(idNumber).replace(/\s+/g, "");
  if (!/^\d{13}$/.test(id)) return null;
  // Luhn checksum over the full 13 digits (last digit is the check digit).
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let d = Number(id[12 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  if (sum % 10 !== 0) return null;
  return Number(id.slice(6, 10)) >= 5000 ? "Male" : "Female";
}

interface IdentityFact {
  section: string;
  rowId: string;
  label: string;
  race?: string;
  gender?: string;
}

/** idNumber → every row that carries it, across the people sections. */
function identityIndex(sections: WorkbookSectionsInput): Map<string, IdentityFact[]> {
  const byId = new Map<string, IdentityFact[]>();
  for (const spec of PEOPLE_SECTIONS) {
    const rows = (sections[spec.key]?.rows ?? []) as Row[];
    for (const row of rows) {
      const id = str(row.idNumber).replace(/\s+/g, "");
      if (!/^\d{13}$/.test(id)) continue;
      const fact: IdentityFact = {
        section: spec.key,
        rowId: str(row._id),
        label: rowLabel(spec.key, row),
        race: str(row.race) || undefined,
        gender: str(row.gender) || undefined,
      };
      const list = byId.get(id) ?? [];
      list.push(fact);
      byId.set(id, list);
    }
  }
  return byId;
}

function sectionLabelOf(key: string): string {
  return getSection(key)?.label ?? key;
}

function columnDefOf(section: string, column: string): ColumnDef | undefined {
  return getSection(section)?.columns?.find((c) => c.key === column);
}

/** Build the full review. Pure; recomputable on every workbook load. */
export function buildExtractionReview(sections: WorkbookSectionsInput): ExtractionReview {
  const extracted: ReviewSectionSummary[] = [];
  const suggestions: ReviewSuggestion[] = [];
  const conflicts: ReviewConflict[] = [];
  const decisions: ReviewDecision[] = [];
  /**
   * Item ids are derived from WHAT the item is about, never from its position.
   *
   * These used to be a shared running counter. The modal remembers applied
   * items by id, and the review is recomputed from scratch on every workbook
   * change — so applying one suggestion renumbered everything after it, a
   * different untouched suggestion inherited the retired id, and the modal
   * filtered it out as "already applied". It vanished from the list without
   * ever being applied, and the more you applied the more silently disappeared.
   *
   * A content-derived id is stable across recomputation: the same finding keeps
   * the same id whatever else happens around it.
   */
  const id = (prefix: string, ...parts: Array<string | number>) =>
    `${prefix}_${parts.map((p) => String(p).replace(/[^A-Za-z0-9]+/g, "-")).join("_")}`;

  // ── 1. What landed where, with provenance ────────────────────────────────
  for (const [key, sec] of Object.entries(sections)) {
    const rows = (sec?.rows ?? []) as Row[];
    if (rows.length === 0) continue;
    const sources = new Set<string>();
    let aiRowCount = 0;
    for (const row of rows) {
      if (Array.isArray(row._sourceFiles) && row._sourceFiles.length > 0) {
        aiRowCount += 1;
        for (const s of row._sourceFiles) sources.add(String(s));
      }
    }
    extracted.push({
      section: key,
      sectionLabel: sectionLabelOf(key),
      rowCount: rows.length,
      aiRowCount,
      sources: Array.from(sources).sort(),
    });
  }

  // ── 2. Identity reasoning across sections ────────────────────────────────
  const byId = identityIndex(sections);
  for (const [idNumber, facts] of Array.from(byId.entries())) {
    for (const attr of ["race", "gender"] as const) {
      const stated = facts.filter((f) => f[attr]);
      const missing = facts.filter((f) => !f[attr]);
      const distinct = Array.from(new Set(stated.map((f) => f[attr] as string)));

      if (distinct.length > 1) {
        // The same person, two different answers — a human must pick.
        conflicts.push({
          id: id("conflict", "identity", idNumber, attr),
          statement: `${facts[0].label} (ID …${idNumber.slice(-4)}) has a different ${attr} in different sections.`,
          sides: stated.map((f) => ({
            label: sectionLabelOf(f.section),
            value: f[attr] as string,
          })),
          rows: facts.map((f) => ({ rowId: f.rowId, label: f.label })),
        });
      } else if (distinct.length === 1 && missing.length > 0) {
        // GENDER IS NOT COPIED WHEN THE ID STATES IT. Every row in this group
        // carries the same ID number, and digits 7–10 of a checksum-valid SA ID
        // ARE the gender — arithmetic on the person's own identity document.
        // A value copied off another sheet is hearsay by comparison. Letting
        // the copy win meant "Apply all" could write a gender into a row whose
        // own ID says the opposite, and nothing flagged it because this branch
        // suppressed the ID-derived suggestion for the same cell. The ID pass
        // below now owns gender; where the copied value disagrees with the ID,
        // the stated-vs-ID check raises it against the row that stated it.
        if (attr === "gender" && genderFromSaId(idNumber)) continue;

        // One consistent answer elsewhere → grounded fill for the blanks.
        for (const f of missing) {
          const from = stated[0];
          suggestions.push({
            id: id("suggest", f.section, f.rowId, attr),
            section: f.section,
            sectionLabel: sectionLabelOf(f.section),
            rowId: f.rowId,
            rowLabel: f.label,
            column: attr,
            columnLabel: attr === "race" ? "Race" : "Gender",
            value: distinct[0],
            statement: `Fill ${attr} "${distinct[0]}" for ${f.label} in ${sectionLabelOf(f.section)}.`,
            basis: `Same ID number (…${idNumber.slice(-4)}) in ${sectionLabelOf(from.section)} states ${attr} = ${distinct[0]}.`,
          });
        }
      }
    }
  }

  // ── 3. Gender from the SA ID number itself ───────────────────────────────
  for (const spec of PEOPLE_SECTIONS) {
    const rows = (sections[spec.key]?.rows ?? []) as Row[];
    for (const row of rows) {
      const derived = genderFromSaId(row.idNumber);
      if (!derived) continue;
      const stated = str(row.gender);
      const label = rowLabel(spec.key, row);
      if (!stated) {
        // Skip if an identity-link suggestion already covers this row+column.
        const covered = suggestions.some(
          (s) => s.rowId === str(row._id) && s.column === "gender",
        );
        if (!covered) {
          suggestions.push({
            id: id("suggest", spec.key, str(row._id), "gender"),
            section: spec.key,
            sectionLabel: sectionLabelOf(spec.key),
            rowId: str(row._id),
            rowLabel: label,
            column: "gender",
            columnLabel: "Gender",
            value: derived,
            statement: `Fill gender "${derived}" for ${label}.`,
            basis: `SA ID numbers encode gender in digits 7–10; this ID (checksum-valid) states ${derived.toLowerCase()}.`,
          });
        }
      } else if (stated.toLowerCase() !== derived.toLowerCase()) {
        conflicts.push({
          id: id("conflict", "said-gender", spec.key, str(row._id)),
          statement: `${label}: the stated gender ("${stated}") contradicts the SA ID number, which encodes ${derived.toLowerCase()}.`,
          sides: [
            { label: sectionLabelOf(spec.key), value: stated },
            { label: "SA ID number (digits 7–10)", value: derived },
          ],
          section: spec.key,
          rows: [{ rowId: str(row._id), label }],
        });
      }
    }
  }

  // ── 4. Aggregate-vs-person coherence (the phantom-points guard) ──────────
  // An aggregate black-women % must never silently sit on a row whose OWN
  // stated demographics contradict it — that is exactly how a company with one
  // Indian male director earned black-women ownership points.
  const ownRows = (sections.ownership?.rows ?? []) as Row[];
  for (const row of ownRows) {
    const label = rowLabel("ownership", row);
    const race = str(row.race).toLowerCase();
    const gender = str(row.gender).toLowerCase();
    const bwo = Number(row.blackWomenOwnership ?? 0);
    const bo = Number(row.blackOwnership ?? 0);
    if (bwo > 0 && gender && gender !== "female") {
      conflicts.push({
        id: id("conflict", "bwo-vs-gender", str(row._id)),
        statement: `${label} carries ${Math.round(bwo * 100)}% black-women ownership, but the row's stated gender is "${str(row.gender)}". These points would be scored for a black woman who does not appear in the register.`,
        sides: [
          { label: "Aggregate on this row", value: `${Math.round(bwo * 100)}% black women` },
          { label: "Row's stated gender", value: str(row.gender) },
        ],
        section: "ownership",
        rows: [{ rowId: str(row._id), label }],
      });
    }
    if (bo > 0 && race && !BLACK_RACES.has(race)) {
      conflicts.push({
        id: id("conflict", "bo-vs-race", str(row._id)),
        statement: `${label} carries ${Math.round(bo * 100)}% black ownership, but the row's stated race is "${str(row.race)}".`,
        sides: [
          { label: "Aggregate on this row", value: `${Math.round(bo * 100)}% black` },
          { label: "Row's stated race", value: str(row.race) },
        ],
        section: "ownership",
        rows: [{ rowId: str(row._id), label }],
      });
    }
  }

  // ── 5. Shareholding must add up ──────────────────────────────────────────
  if (ownRows.length > 0) {
    const shares = ownRows.map((r) => Number(r.numberOfShares ?? 0)).filter((n) => n > 0);
    const looksLikePercents = shares.length > 1 && shares.every((n) => n <= 100);
    if (looksLikePercents) {
      const total = shares.reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > 0.5) {
        conflicts.push({
          id: id("conflict", "shareholdings-total"),
          statement: `Shareholdings add up to ${total}%, not 100% — a percentage is missing or double-counted.`,
          sides: ownRows.map((r) => ({
            label: rowLabel("ownership", r),
            value: `${Number(r.numberOfShares ?? 0)}%`,
          })),
          section: "ownership",
          rows: ownRows.map((r) => ({ rowId: str(r._id), label: rowLabel("ownership", r) })),
        });
      }
    }
  }

  // ── 6. Missing required fields → grouped decisions ───────────────────────
  const aggregate = aggregateWorkbookValidation(sections, { strictSelectOptions: true });
  const groups = new Map<string, { section: string; column: string; rows: ReviewRowRef[] }>();
  for (const sectionSummary of aggregate.sections) {
    for (const issue of sectionSummary.issues) {
      if (!issue.field || !issue.rowId) continue;
      if (!/required/i.test(issue.message)) continue;
      const key = `${issue.sectionKey}::${issue.field}`;
      const group = groups.get(key) ?? { section: issue.sectionKey, column: issue.field, rows: [] };
      const rows = (sections[issue.sectionKey]?.rows ?? []) as Row[];
      const row = rows.find((r) => str(r._id) === issue.rowId);
      group.rows.push({
        rowId: issue.rowId,
        label: row ? rowLabel(issue.sectionKey, row) : issue.rowId,
      });
      groups.set(key, group);
    }
  }
  for (const group of Array.from(groups.values())) {
    const def = columnDefOf(group.section, group.column);
    const columnLabel = def?.label ?? group.column;
    const secLabel = sectionLabelOf(group.section);
    decisions.push({
      id: id("decision", group.section, group.column),
      section: group.section,
      sectionLabel: secLabel,
      column: group.column,
      columnLabel,
      rows: group.rows,
      options: def?.options,
      statement:
        group.rows.length === 1
          ? `${group.rows[0].label} in ${secLabel} needs "${columnLabel}".`
          : `${group.rows.length} rows in ${secLabel} need "${columnLabel}" — set once for all of them.`,
    });
  }
  // Biggest decisions first — one click clears the most rows.
  decisions.sort((a, b) => b.rows.length - a.rows.length);

  return {
    extracted,
    suggestions,
    conflicts,
    decisions,
    openItems: suggestions.length + conflicts.length + decisions.length,
  };
}
