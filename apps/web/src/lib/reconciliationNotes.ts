/**
 * Which "disagreements between documents" are real.
 *
 * The results screen listed every finding the linking step raised under one
 * count. On a real pack that count was 30, and most of it was not a
 * disagreement at all (figures below are invented):
 *
 *  - a supplier's spend on the gathering workbook (R12,500) against the same
 *    supplier on the spend schedule (R12,500.40) — one document rounded to
 *    the Rand, the other did not;
 *  - the same value written two ways ("51%" and "0.51", "2025-03-31" and
 *    "31/03/2025"), or one document blank where the other is filled;
 *  - notes on how readings were joined: a group certificate taken as its
 *    supplier's, a person's initials taken to be the person named in full,
 *    two identical rows folded into one, a level worked out from a job title;
 *  - the same note twice.
 *
 * Only what is left is a disagreement a person must settle. The rest is kept
 * — folded, and said once — never deleted: the figure scored is unchanged
 * (the linking step already chose it), and a person can still read every note.
 */

export interface ReconciliationFlag {
  sourceFile: string;
  note: string;
  /** Set on a note that is not a disagreement (see ReconciliationFinding.kind). */
  kind?: "linked" | "collapsed" | "worked-out";
  /** The two values the documents stated, when the finding knows them. */
  values?: [unknown, unknown];
  /** The workbook column the two values are for ("spend", "shareholding"). */
  column?: string;
  /**
   * Both rows were kept rather than one figure chosen (two readings of one
   * document disagree). Always a disagreement: nothing was settled, and both
   * figures count until a person removes one.
   */
  rowsKept?: boolean;
}

export interface SortedReconciliationFlags {
  /** Documents that state different values. These are the count. */
  disagreements: ReconciliationFlag[];
  /** Figures that differ by less than R1: one document rounded. */
  rounding: ReconciliationFlag[];
  /** The same value written two ways, or blank in one document. */
  sameValue: ReconciliationFlag[];
  /** How readings were joined, folded or worked out. */
  notes: ReconciliationFlag[];
}

/** Below this, two Rand figures for one thing are the same figure, rounded. */
export const ROUNDING_TOLERANCE = 1;

/**
 * The columns that hold Rand amounts — the only ones where R1 of rounding
 * means anything. A share (51 vs 50.5 crosses the 51% line), a fraction
 * (every difference between two is under 1), a level or a share count is
 * never "only rounding".
 */
export const RAND_COLUMNS: ReadonlySet<string> = new Set(["spend", "amount", "totalCost", "courseCost", "salary"]);

const blank = (value: unknown) => value == null || String(value).trim() === "";

/** "R 1 234,50" / "(27 124)" / "49.67%" → a number, and whether it was a percentage. */
function asNumber(value: unknown): { n: number; percent: boolean } | null {
  if (typeof value === "number") return Number.isFinite(value) ? { n: value, percent: false } : null;
  if (typeof value !== "string") return null;
  let text = value.trim().replace(/[\s  ]/g, "").replace(/^R/i, "");
  const negative = /^\(.*\)$/.test(text);
  if (negative) text = text.slice(1, -1);
  const percent = text.endsWith("%");
  if (percent) text = text.slice(0, -1);
  // A lone comma with two decimals is a decimal comma ("1234,50"); otherwise commas group thousands.
  text = /^-?\d+,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? { n: negative ? -n : n, percent } : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A date written any common way → "2025-03-31"; null when it is not a date. */
function asDate(value: unknown): string | null {
  const text = String(value ?? "").trim().toLowerCase();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t\s].*)?$/.exec(text);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (dmy) return `${dmy[3]}-${pad(+dmy[2])}-${pad(+dmy[1])}`;
  const words = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(text);
  if (words && MONTHS.includes(words[2])) return `${words[3]}-${pad(MONTHS.indexOf(words[2]) + 1)}-${pad(+words[1])}`;
  return null;
}

const asText = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The same value, written two ways. */
export function sameValue(a: unknown, b: unknown): boolean {
  const x = asNumber(a);
  const y = asNumber(b);
  if (x && y) {
    if (Math.abs(x.n - y.n) < 0.005) return true;
    // "49.67%" and "0.4967" are one share.
    if (x.percent !== y.percent) {
      const [pct, frac] = x.percent ? [x.n, y.n] : [y.n, x.n];
      return Math.abs(frac) <= 1 && Math.abs(pct - frac * 100) < 0.005;
    }
    return false;
  }
  const d = asDate(a);
  if (d && d === asDate(b)) return true;
  const t = asText(a);
  return t !== "" && t === asText(b);
}

/** Two Rand figures that differ only by rounding (a percentage never does). */
export function onlyRounding(a: unknown, b: unknown): boolean {
  const x = asNumber(a);
  const y = asNumber(b);
  return Boolean(x && y && !x.percent && !y.percent && Math.abs(x.n - y.n) < ROUNDING_TOLERANCE);
}

/** Sort the results screen's findings into real disagreements and the rest. */
export function sortReconciliationFlags(flags: ReconciliationFlag[]): SortedReconciliationFlags {
  const out: SortedReconciliationFlags = { disagreements: [], rounding: [], sameValue: [], notes: [] };
  const seen = new Set<string>();
  for (const flag of flags) {
    const key = `${flag.sourceFile}\u0000${flag.note}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (flag.kind) {
      out.notes.push(flag);
      continue;
    }
    // Both rows were kept: nothing was chosen, so this is never folded away.
    if (flag.rowsKept) {
      out.disagreements.push(flag);
      continue;
    }
    const [a, b] = flag.values ?? [undefined, undefined];
    if (flag.values && (blank(a) || blank(b) || sameValue(a, b))) out.sameValue.push(flag);
    // R1 of rounding means something only for a Rand column; one with no
    // known column is a disagreement.
    else if (flag.values && flag.column && RAND_COLUMNS.has(flag.column) && onlyRounding(a, b)) out.rounding.push(flag);
    else out.disagreements.push(flag);
  }
  return out;
}
