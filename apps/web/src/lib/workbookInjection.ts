/**
 * Put extracted values INTO workbook cells.
 *
 * This is the step that was missing, and it is the one that decides whether
 * extraction is worth anything. Reading "100% black ownership" out of a scanned
 * share register achieves nothing if it cannot become a row in the Ownership
 * grid with a `race` that matches the dropdown, a `votingRights` that is a
 * number, and an `idNumber` in the right format.
 *
 * THE WORKBOOK ALREADY DECLARES ITS OWN RULES. `sections.ts` gives, per field:
 * a type (text / number / select / boolean / id / date), the permitted `options`
 * for a dropdown, whether Yes/No is stored as a boolean, and a `validate`
 * function. Injection's whole job is to respect them — so this module reads
 * that definition rather than restating it, and a field added to the workbook is
 * injectable with no change here.
 *
 * THE RULE THAT MATTERS: a value that cannot be made to satisfy its field is
 * REPORTED, never forced. Writing "Black" into a dropdown that only accepts
 * "African | Coloured | Indian | White" produces a cell that looks filled,
 * scores as nothing, and is invisible in review. That is the silent-zero failure
 * this whole programme exists to end, one layer further in.
 */
import {
  getSection,
  SUPPLIER_SIZE_MAP,
  DESIGNATION_MAP,
  OCC_LEVEL_MAP,
  BBBEE_LEVEL_MAP,
  CONTRIBUTION_TYPE_MAP,
  ESD_CATEGORY_MAP,
  type ColumnDef,
  type SectionDef,
} from "@/components/workbook/sections";
import { normalizeRace } from "@toolkit/lib/calculators/shared";

/** Lower-case and strip non-alphanumerics — the key shape the workbook's synonym maps use. */
function synonymKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Normalise an extracted value toward its column's DROPDOWN vocabulary, using
 * the workbook's OWN synonym maps — the very maps the Excel importer consults.
 *
 * The distinction that matters: the workbook dropdowns speak one vocabulary
 * ("Executive Director", "Top Management", "4", "EME"); the SCORING engine speaks
 * another ("Board", "Executive", recognition multipliers). Injection's job is to
 * land a value the DROPDOWN accepts — the projection layer
 * (projectWorkbookToClient) then translates the dropdown label into the scoring
 * band. Normalising to the scoring band HERE produced labels no dropdown holds
 * ("Non-executive Director" → "Board", "Executive Management" → "Executive
 * Director" which the Occupational-Level dropdown lacks), so a value read
 * correctly was rejected at the door — the last-mile silent zero, one layer in.
 */
/** "one".."eight" → "1".."8" — certificates write "Level One Contributor". */
const LEVEL_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8",
};

function normaliseForColumn(columnKey: string, value: unknown): unknown {
  // A boolean is a certificate's honest "empowering_supplier: true" — the
  // Yes/No dropdowns speak strings, so hand them their own vocabulary.
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const text = String(value ?? "").trim();
  if (!text) return value;
  const key = synonymKey(text);

  // B-BBEE level: "Level 4" / "4" / "Level One Contributor" / "Non-compliant"
  // → the "1".."8" | "Non-compliant" dropdown.
  if (/level$/i.test(columnKey) || columnKey === "bbbeeLevel") {
    if (BBBEE_LEVEL_MAP[key]) return BBBEE_LEVEL_MAP[key];
    const m = text.match(/\b([1-8])\b/);
    if (m) return m[1];
    const word = text.match(/level\s+(one|two|three|four|five|six|seven|eight)\b/i);
    if (word) return LEVEL_WORDS[word[1].toLowerCase()];
    if (/non.?compliant/i.test(text)) return "Non-compliant";
  }

  // Race: umbrella "Black" and common import variants → African/Coloured/Indian/White
  // (normalizeRace already yields exactly the dropdown's own vocabulary).
  if (columnKey === "race") {
    const normalised = normalizeRace(text);
    if (normalised) return normalised;
  }

  // Designation: EEA / job-band wording → the Designation dropdown vocabulary.
  if (columnKey === "designation") {
    if (DESIGNATION_MAP[key]) return DESIGNATION_MAP[key];
  }

  // Occupational level: "Executive Management" → "Top Management", etc.
  if (columnKey === "occupationalLevel") {
    if (OCC_LEVEL_MAP[key]) return OCC_LEVEL_MAP[key];
  }

  // Supplier size: "Exempted Micro Enterprise" → "EME", legacy "Large" → "Generic".
  if (columnKey === "currentSize") {
    if (SUPPLIER_SIZE_MAP[key]) return SUPPLIER_SIZE_MAP[key];
  }

  // Contribution type: "Donation" / "Sponsorship" / "In-kind" → the Codes'
  // recognition categories (Statement 400/500). Unmapped wordings fall through
  // to matchOption and reject into review — never guessed.
  if (columnKey === "contributionType") {
    if (CONTRIBUTION_TYPE_MAP[key]) return CONTRIBUTION_TYPE_MAP[key];
    if (/in.?kind/i.test(text)) return "Other Non-Monetary";
  }

  // ESD category: "SD" / "ED" are too short for containment matching.
  if (columnKey === "esdCategory") {
    if (ESD_CATEGORY_MAP[key]) return ESD_CATEGORY_MAP[key];
  }

  // Gender: single-letter register shorthand.
  if (columnKey === "gender") {
    if (key === "m") return "Male";
    if (key === "f") return "Female";
  }

  return value;
}

export interface InjectionValue {
  /** Workbook column key (e.g. "shareholderName", "votingRights"). */
  field: string;
  value: unknown;
  /** Where it came from, carried through so a cell can be traced to a file. */
  sourceFile?: string;
}

export type RejectionReason =
  | "unknown_field"
  | "not_a_number"
  | "not_a_date"
  | "no_matching_option"
  | "failed_validation"
  | "empty";

export interface InjectionRejection {
  field: string;
  value: unknown;
  reason: RejectionReason;
  /** Human-readable, safe to show a user. */
  detail: string;
}

export interface InjectionResult {
  /** Cell values, keyed by column, ready to write into a workbook row. */
  cells: Record<string, unknown>;
  /** What went in, for the provenance trail. */
  accepted: Array<{ field: string; value: unknown; sourceFile?: string }>;
  /** What could not go in, and why. Never silently dropped. */
  rejected: InjectionRejection[];
}

/** Loose text comparison for matching a value against dropdown options. */
function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Match a value to one of a dropdown's permitted options.
 *
 * Exact first, then normalised, then a contains-match in either direction —
 * "Black African" against the option "African", or "Exec" against
 * "Executive Director". Returns null when nothing matches, which is a rejection
 * rather than a guess: picking the closest option would put a wrong value on a
 * scorecard with no trace.
 */
export function matchOption(value: unknown, options: string[]): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const exact = options.find((o) => o === raw);
  if (exact) return exact;

  const target = norm(raw);
  const normalised = options.find((o) => norm(o) === target);
  if (normalised) return normalised;

  // One-directional containment only where it is unambiguous — a single
  // candidate. Two candidates means we cannot tell, so we do not choose.
  const candidates = options.filter((o) => {
    const n = norm(o);
    return n.length >= 3 && target.length >= 3 && (n.includes(target) || target.includes(n));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/** "R 1 030 806.68", "1,030,806.68", "(4 157 140)" → number, or null. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const negative = /^\(.*\)$/.test(value.trim());
  const cleaned = value.replace(/[()]/g, "").replace(/[R$€£\s,%]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "14 March 2027", "14/03/2027", "2027-03-14", Excel serial 45397 → ISO. Day-first, as SA writes. */
export function toIsoDate(value: unknown): string | null {
  // Excel exports dates as serial numbers (days since 1899-12-30). Recognise a
  // bare number in the plausible range as the date it is — otherwise a whole
  // schedule of dated rows loses its dates at the door, and rows that differ
  // only by date collapse into one.
  const serial = typeof value === "number"
    ? value
    : (typeof value === "string" && /^\d{5}(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : NaN);
  if (Number.isFinite(serial) && serial >= 20000 && serial <= 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
  }

  if (typeof value !== "string") return null;
  const text = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return Number.isNaN(new Date(text).getTime()) ? null : text;
  }

  const longForm = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (longForm) {
    const month = MONTHS[longForm[2].slice(0, 3).toLowerCase()];
    if (month) return `${longForm[3]}-${month}-${longForm[1].padStart(2, "0")}`;
  }

  const slashed = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashed) {
    const day = Number(slashed[1]);
    const month = Number(slashed[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${slashed[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

const TRUTHY = new Set(["yes", "y", "true", "1", "checked"]);
const FALSY = new Set(["no", "n", "false", "0", "unchecked"]);

/** Coerce one value to the type its column declares. */
export function coerceToColumn(
  column: ColumnDef,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; reason: RejectionReason; detail: string } {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { ok: false, reason: "empty", detail: "No value supplied" };
  }

  switch (column.type) {
    case "number": {
      const parsed = toNumber(value);
      if (parsed === null) {
        return { ok: false, reason: "not_a_number", detail: `"${String(value)}" is not a number` };
      }
      return { ok: true, value: parsed };
    }

    case "date": {
      const iso = toIsoDate(value);
      if (iso === null) {
        return { ok: false, reason: "not_a_date", detail: `"${String(value)}" is not a recognisable date` };
      }
      return { ok: true, value: iso };
    }

    case "boolean": {
      const text = String(value).trim().toLowerCase();
      if (TRUTHY.has(text)) return { ok: true, value: true };
      if (FALSY.has(text)) return { ok: true, value: false };
      return { ok: false, reason: "no_matching_option", detail: `"${String(value)}" is not Yes or No` };
    }

    case "select": {
      const options = column.options ?? [];
      if (options.length === 0) return { ok: true, value: String(value).trim() };

      // Normalise toward the dropdown's vocabulary first, using the scoring
      // engine's own domain maps, then match.
      const normalised = normaliseForColumn(column.key, value);
      const matched = matchOption(normalised, options);
      if (matched === null) {
        // Never pick the closest: a wrong dropdown value scores silently.
        return {
          ok: false,
          reason: "no_matching_option",
          detail: `"${String(value)}" is not one of: ${options.join(", ")}`,
        };
      }
      // A Yes/No select that the row stores as a boolean.
      if (column.yesNoBoolean) return { ok: true, value: matched.toLowerCase() === "yes" };
      return { ok: true, value: matched };
    }

    case "id":
    case "text":
    default:
      return { ok: true, value: String(value).trim() };
  }
}

/**
 * Inject values into one workbook row for a section.
 *
 * Every value is coerced to its column's declared type, matched against its
 * dropdown where it has one, and put through the column's own `validate`. What
 * survives becomes a cell; what does not is reported with a reason a user can
 * act on.
 */
export function injectIntoSection(
  sectionKey: string,
  values: InjectionValue[],
  options: { sectorCode?: string; scorecardType?: string; fscSubSector?: string } = {},
): InjectionResult {
  const section: SectionDef | undefined = getSection(sectionKey, options.sectorCode, options.scorecardType, options.fscSubSector);
  const columns = section?.columns ?? [];
  const byKey = new Map(columns.map((c) => [c.key, c]));

  const cells: Record<string, unknown> = {};
  const accepted: InjectionResult["accepted"] = [];
  const rejected: InjectionRejection[] = [];

  for (const { field, value, sourceFile } of values) {
    const column = byKey.get(field);
    if (!column) {
      rejected.push({
        field,
        value,
        reason: "unknown_field",
        detail: `"${field}" is not a column of the ${section?.label ?? sectionKey} section`,
      });
      continue;
    }

    const coerced = coerceToColumn(column, value);
    if (!coerced.ok) {
      rejected.push({ field, value, reason: coerced.reason, detail: coerced.detail });
      continue;
    }

    // The column's OWN validator has the last word — it encodes rules this
    // module has no business duplicating (ID checksums, ranges, formats).
    const failure = column.validate?.(coerced.value);
    if (failure) {
      rejected.push({ field, value, reason: "failed_validation", detail: failure });
      continue;
    }

    cells[field] = coerced.value;
    accepted.push({ field, value: coerced.value, sourceFile });
  }

  return { cells, accepted, rejected };
}

/**
 * Inject a single META value (entity-level fields like TMPS, revenue, NPAT).
 *
 * Meta fields live in a section's `meta` array, not its `columns`, so they need
 * their own lookup — but they are still ColumnDefs and go through the identical
 * type/validation path. Returns the coerced value or a rejection.
 */
export function injectMetaValue(
  sectionKey: string,
  field: string,
  value: unknown,
  options: { sectorCode?: string; scorecardType?: string; fscSubSector?: string } = {},
): { ok: true; value: unknown } | { ok: false; rejection: InjectionRejection } {
  const section = getSection(sectionKey, options.sectorCode, options.scorecardType, options.fscSubSector);
  const column = (section?.meta ?? []).find((c) => c.key === field);
  if (!column) {
    return {
      ok: false,
      rejection: { field, value, reason: "unknown_field", detail: `"${field}" is not a meta field of ${section?.label ?? sectionKey}` },
    };
  }

  const coerced = coerceToColumn(column, value);
  if (!coerced.ok) {
    return { ok: false, rejection: { field, value, reason: coerced.reason, detail: coerced.detail } };
  }
  const failure = column.validate?.(coerced.value);
  if (failure) {
    return { ok: false, rejection: { field, value, reason: "failed_validation", detail: failure } };
  }
  return { ok: true, value: coerced.value };
}

/** Which columns of a section are required but absent from a set of cells. */
export function missingRequiredColumns(
  sectionKey: string,
  cells: Record<string, unknown>,
  options: { sectorCode?: string; scorecardType?: string; fscSubSector?: string } = {},
): string[] {
  const section = getSection(sectionKey, options.sectorCode, options.scorecardType, options.fscSubSector);
  return (section?.columns ?? [])
    .filter((c) => c.required)
    .filter((c) => cells[c.key] === undefined || cells[c.key] === "")
    .map((c) => c.label);
}
