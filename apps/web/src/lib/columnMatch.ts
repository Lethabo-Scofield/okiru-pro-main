/**
 * Pure, dependency-free column-name matching used by both the browser
 * normalization engine (tabularNormalize.ts) and the Node AI mapping
 * endpoints (server/aiMappingRoutes.ts).
 *
 * It operates on a generic `TargetField` shape (key/label/aliases/synonyms)
 * rather than the browser-only `ColumnDef`, so it can be imported server-side
 * via a relative path without pulling in the `@/` alias or any DOM types.
 */

export type FieldMappingMethod =
  | "exact"
  | "alias"
  | "fuzzy"
  | "ai"
  | "position"
  | "unmapped";

export interface TargetField {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  aliases?: string[];
}

export interface FieldMapping {
  sourceIndex: number;
  sourceHeader: string;
  targetKey: string | null;
  confidence: number;
  method: FieldMappingMethod;
  /**
   * True when the column NAME alone does not decide the field — a runner-up
   * scored within `AMBIGUITY_MARGIN` of the winner. `Level` means the B-BBEE
   * level on a supplier schedule and the occupational level on an employee
   * register, and both score 1.00; the pick was made, but not earned.
   */
  ambiguous?: boolean;
  /**
   * The other fields this column could plausibly be, best first, excluding the
   * one it was assigned. A column that lost its first choice to a
   * higher-scoring column lists that first choice here.
   */
  alternatives?: Array<{ targetKey: string; confidence: number }>;
}

/** Built-in synonyms keyed by field key, supplementing label/alias matching. */
export const FIELD_SYNONYMS: Record<string, string[]> = {
  shareholderName: ["shareholder", "shareholder name", "owner", "name", "name & surname", "full name"],
  name: ["first name", "name", "name & surname", "employee name", "director name"],
  surname: ["last name", "surname", "family name"],
  idNumber: ["id", "id no", "id number", "identity number", "passport"],
  race: ["race", "ethnicity", "population group", "designated group"],
  gender: ["gender", "sex"],
  votingRights: ["voting rights", "voting", "votes", "% voting"],
  economicInterest: ["economic interest", "ei", "% economic interest"],
  shareholding: ["shareholding", "shares", "% shareholding", "ownership %"],
  designation: ["designation", "position", "role", "job title", "title", "job", "occupation", "occupational level", "occ level", "management level", "management tier", "job level", "seniority"],
  occupationalLevel: ["occupational level", "occ level", "level", "management level", "management tier", "job level"],
  programName: ["programme", "program", "course", "training", "training programme", "training program", "intervention", "learnership", "qualification", "course name", "programme name"],
  categoryCode: ["category", "category code", "learning category", "sd category", "category (a-g)", "category a-g", "cat", "learning programme category"],
  totalCost: ["total cost", "cost", "amount", "spend", "total spend", "expenditure", "training cost", "training spend", "cost incl vat", "value"],
  courseCost: ["course cost", "tuition", "course fee"],
  supplierName: ["supplier", "supplier name", "vendor", "vendor name", "beneficiary", "trading name", "company", "company name"],
  currentSize: ["size", "enterprise size", "company size", "current size", "supplier size", "supplier classification", "classification", "supplier type", "enterprise type", "size classification", "eme/qse/generic", "exemption category"],
  bbbeeLevel: ["bbbee level", "b-bbee level", "bee level", "level", "contributor level", "bbbee status", "bee status", "recognition level", "b-bbee contributor level"],
  measuredUnder: ["measured under", "codes", "scorecard codes"],
  empoweringSupplier: ["empowering supplier", "empowering"],
  currentBlackOwnership: ["black ownership", "% black ownership", "black owned"],
  currentBlackFemaleOwnership: ["black female ownership", "black women ownership", "bwo"],
  spend: ["spend", "expenditure", "procurement spend", "amount", "value", "spend incl vat", "spend excl vat", "spend ex vat", "claimed spend", "claimed spend ex vat", "supplier spend", "annual spend", "rand value", "total spend"],
  payroll: ["payroll", "total payroll", "annual payroll", "salaries", "wages", "staff costs", "total staff costs", "wage bill", "remuneration", "total remuneration"],
  leviableAmount: ["leviable amount", "total leviable amount", "leviable", "sdl leviable amount"],
  certificateExpiryDate: ["certificate expiry", "expiry date", "certificate expiry date", "valid until"],
  beneficiaryName: ["beneficiary", "beneficiary name", "recipient"],
  amount: ["amount", "value", "contribution", "rand value", "spend"],
  contributionType: ["contribution type", "type", "type of contribution"],
  esdCategory: ["esd category", "category", "ed/sd"],
  percentBenefitingBlack: ["% benefiting black", "benefiting black", "black beneficiaries %"],
  dateOfTransaction: ["date", "transaction date", "date of transaction"],
  invoiceDate: ["invoice date", "date of invoice"],
  paymentDate: ["payment date", "date paid", "date of payment"],
  startDate: ["start date", "from", "training start"],
  endDate: ["end date", "to", "training end"],
};

/** Minimum confidence a fuzzy match needs to be accepted. */
export const FUZZY_ACCEPT = 0.62;

/**
 * How close a runner-up must be for the winner to count as unearned.
 *
 * Tight on purpose. Real header sets produce near-misses constantly ("Spend"
 * scores against both `spend` and `amount`); the signal we want is the case
 * where the name genuinely does not decide, which in practice means a tie or
 * near-tie.
 */
export const AMBIGUITY_MARGIN = 0.05;

/**
 * Below this length, a run of letters inside a longer word is coincidence, not
 * a match. `bo` is an alias for black ownership AND a substring of `carbon`;
 * the old character-containment rule scored that 0.72 — comfortably over the
 * 0.62 accept floor — and silently mapped a carbon column to black ownership.
 */
const MIN_LOOSE_SUBSTRING = 4;

export function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function buildFieldAliases(field: TargetField): string[] {
  const out = new Set<string>();
  out.add(field.key);
  const label = (field.label || "").replace(/\*+$/, "").trim();
  if (label) out.add(label);
  if (label.includes("—")) out.add(label.split("—")[0].trim());
  if (label.includes("(")) out.add(label.split("(")[0].trim());
  for (const a of field.aliases ?? []) out.add(a);
  for (const a of FIELD_SYNONYMS[field.key] ?? []) out.add(a);
  return [...out].filter(Boolean);
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function headerSimilarity(header: string, alias: string): number {
  const a = norm(header);
  const b = norm(alias);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return 0.6 + ratio * 0.35;
  }
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 0 : 1 - levenshtein(a, b) / maxLen;
}

/** Word-ish tokens: `"Black Ownership %"` → `["black","ownership"]`. */
export function tokens(s: string): string[] {
  return (s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Does `needle` appear as a contiguous run of WHOLE tokens inside `haystack`? */
function containsTokenRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { hit = false; break; }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Similarity between a COLUMN NAME and a field alias.
 *
 * Deliberately not `headerSimilarity`, which `selectOptionMatch` uses to match
 * CELL VALUES against enum options — a different problem with different rules.
 * There, `"M"` really should suggest `"Male"`; here, a two-letter run inside a
 * longer word is noise. The two use cases were sharing one function and the
 * looser of the two requirements was winning.
 *
 * Containment is judged on whole words first, and only falls back to raw
 * character containment for aliases long enough that an accidental run is
 * implausible. Everything else is edit distance, exactly as before.
 */
export function aliasSimilarity(header: string, alias: string): number {
  const a = norm(header);
  const b = norm(alias);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const headerTokens = tokens(header);
  const aliasTokens = tokens(alias);

  // "level" IS a word of "Occupational Level" — a real containment.
  if (containsTokenRun(headerTokens, aliasTokens) || containsTokenRun(aliasTokens, headerTokens)) {
    return 0.6 + ratio * 0.35;
  }
  // "ownership" inside "blackownership" (no separator to tokenise on) is still
  // a real match; "bo" inside "carbon" is not.
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= MIN_LOOSE_SUBSTRING) {
    return 0.6 + ratio * 0.35;
  }

  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 0 : 1 - levenshtein(a, b) / maxLen;
}

/** The best-scoring alias of one field against one header. */
function scoreField(
  header: string,
  field: TargetField,
): { confidence: number; method: FieldMappingMethod } {
  let confidence = 0;
  let method: FieldMappingMethod = "fuzzy";
  for (const alias of buildFieldAliases(field)) {
    const score = aliasSimilarity(header, alias);
    if (score <= confidence) continue;
    confidence = score;
    if (score === 1) {
      method = norm(alias) === norm(field.label) || norm(alias) === norm(field.key) ? "exact" : "alias";
    } else if (score >= 0.6) {
      method = "alias";
    } else {
      method = "fuzzy";
    }
  }
  return { confidence, method };
}

export interface HeaderMatch {
  targetKey: string;
  confidence: number;
  method: FieldMappingMethod;
  /** Other fields within `AMBIGUITY_MARGIN` of the winner, best first. */
  alternatives: Array<{ targetKey: string; confidence: number }>;
  /** True when a runner-up is within the margin — the name does not decide. */
  ambiguous: boolean;
}

/**
 * The single best field for one header, plus what else it could have been.
 *
 * `confidence` keeps its old meaning and value: callers such as
 * `looksLikeHeaderRow` gate header-row DETECTION on it, and a row of ambiguous
 * headers is still a header row. Ambiguity is reported alongside, never by
 * quietly deflating the score.
 */
export function matchHeaderToField(header: string, fields: TargetField[]): HeaderMatch | null {
  if (!norm(header)) return null;

  const scored = fields
    .map((field) => ({ targetKey: field.key, ...scoreField(header, field) }))
    .filter((s) => s.confidence >= FUZZY_ACCEPT)
    // Ties broken by the field's declared order, so the result is stable.
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (!best) return null;

  const alternatives = scored
    .slice(1)
    .filter((s) => best.confidence - s.confidence <= AMBIGUITY_MARGIN)
    .map((s) => ({ targetKey: s.targetKey, confidence: s.confidence }));

  return {
    targetKey: best.targetKey,
    confidence: best.confidence,
    method: best.method,
    alternatives,
    ambiguous: alternatives.length > 0,
  };
}

/**
 * Build a deterministic header → field mapping.
 *
 * THE BUG THIS REPLACES
 *
 * The old pass asked each header for its ONE best field, then resolved
 * collisions by deleting the loser:
 *
 *     if (claimed.has(c.targetKey)) { loser.targetKey = null; … "unmapped" }
 *
 * A column that lost its first choice was not offered its second. It became
 * unmapped, and an unmapped column contributes nothing to a score — silently.
 * On a schedule with `Training Programme` and `Programme Name`, one of them
 * scores marginally higher for `programName`, the other is discarded, and the
 * cost column beneath it never reaches Skills Development.
 *
 * WHAT IT DOES INSTEAD
 *
 * This is a bipartite assignment problem, so it is solved as one — with
 * augmenting paths (Kuhn's algorithm), not a single greedy sweep. The
 * difference is not academic. Given `Beneficiary` and `Supplier` against the
 * fields `supplierName` and `beneficiaryName`, both headers score 1.00 for
 * `supplierName`. A greedy sweep hands it to the first and leaves the second
 * unmapped. Augmenting asks the incumbent to MOVE: `Beneficiary` shifts to
 * `beneficiaryName`, which it also matches, and both columns map.
 *
 * Headers are processed strongest-match-first, and each tries its own fields in
 * descending score order, so the matching is maximal in coverage and greedy in
 * quality. Every ordering is fully determined (score, then declaration index on
 * both axes), so the same sheet always maps the same way — no run-to-run drift.
 */
export function buildFieldMapping(headers: string[], fields: TargetField[]): FieldMapping[] {
  // Full score matrix — every header against every field.
  const matrix: Array<Array<{ confidence: number; method: FieldMappingMethod }>> = headers.map(
    (header) =>
      norm(header)
        ? fields.map((field) => scoreField(header, field))
        : fields.map(() => ({ confidence: 0, method: "unmapped" as FieldMappingMethod })),
  );

  // Each header's acceptable fields, its own best first.
  const preferences: number[][] = matrix.map((row) =>
    row
      .map((cell, f) => ({ confidence: cell.confidence, f }))
      .filter((c) => c.confidence >= FUZZY_ACCEPT)
      .sort((a, b) => b.confidence - a.confidence || a.f - b.f)
      .map((c) => c.f),
  );

  const fieldToHeader = new Map<number, number>();

  /**
   * Seat header `h`, moving incumbents down their own preference lists when
   * that frees a seat. `visiting` stops a cycle from recursing forever.
   */
  function seat(h: number, visiting: Set<number>): boolean {
    for (const f of preferences[h]) {
      if (visiting.has(f)) continue;
      visiting.add(f);
      const incumbent = fieldToHeader.get(f);
      if (incumbent === undefined || seat(incumbent, visiting)) {
        fieldToHeader.set(f, h);
        return true;
      }
    }
    return false;
  }

  // Strongest match first, so the best-evidenced columns get their first choice
  // and weaker ones do the moving. Index breaks ties for determinism.
  const order = headers
    .map((_, i) => i)
    .filter((i) => preferences[i].length > 0)
    .sort((a, b) => matrix[b][preferences[b][0]].confidence - matrix[a][preferences[a][0]].confidence || a - b);
  for (const h of order) seat(h, new Set<number>());

  // forEach, not for-of: this file targets a build without downlevelIteration.
  const headerToField = new Map<number, number>();
  fieldToHeader.forEach((h, f) => headerToField.set(h, f));

  return headers.map((sourceHeader, sourceIndex) => {
    const seatIndex = headerToField.get(sourceIndex);
    const pick = seatIndex === undefined
      ? undefined
      : { f: seatIndex, ...matrix[sourceIndex][seatIndex] };
    if (!pick) {
      return {
        sourceIndex,
        sourceHeader,
        targetKey: null,
        confidence: 0,
        method: "unmapped" as FieldMappingMethod,
      };
    }
    // Everything else this column could plausibly have been — including a first
    // choice it lost to a stronger column, which will outrank the assignment.
    const alternatives = matrix[sourceIndex]
      .map((cell, idx) => ({ targetKey: fields[idx].key, confidence: cell.confidence, idx }))
      .filter((alt) => alt.idx !== pick.f && alt.confidence >= FUZZY_ACCEPT)
      .filter((alt) => Math.abs(alt.confidence - pick.confidence) <= AMBIGUITY_MARGIN)
      .sort((a, b) => b.confidence - a.confidence || a.idx - b.idx)
      .map(({ targetKey, confidence }) => ({ targetKey, confidence }));

    return {
      sourceIndex,
      sourceHeader,
      targetKey: fields[pick.f].key,
      confidence: pick.confidence,
      method: pick.method,
      ambiguous: alternatives.length > 0,
      alternatives,
    };
  });
}
