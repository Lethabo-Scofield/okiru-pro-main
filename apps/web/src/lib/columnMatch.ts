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
  designation: ["designation", "position", "role", "job title", "title"],
  occupationalLevel: ["occupational level", "occ level", "level", "management level"],
  programName: ["programme", "program", "course", "training", "training programme", "intervention"],
  categoryCode: ["category", "category code", "learning category", "sd category"],
  totalCost: ["total cost", "cost", "amount", "spend", "total spend", "expenditure"],
  courseCost: ["course cost", "tuition", "course fee"],
  supplierName: ["supplier", "supplier name", "vendor", "vendor name", "beneficiary"],
  currentSize: ["size", "enterprise size", "company size", "current size", "supplier size"],
  bbbeeLevel: ["bbbee level", "b-bbee level", "bee level", "level", "contributor level"],
  measuredUnder: ["measured under", "codes", "scorecard codes"],
  empoweringSupplier: ["empowering supplier", "empowering"],
  currentBlackOwnership: ["black ownership", "% black ownership", "black owned"],
  currentBlackFemaleOwnership: ["black female ownership", "black women ownership", "bwo"],
  spend: ["spend", "expenditure", "procurement spend", "amount", "value", "spend incl vat"],
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

export function matchHeaderToField(
  header: string,
  fields: TargetField[],
): { targetKey: string; confidence: number; method: FieldMappingMethod } | null {
  if (!norm(header)) return null;
  let best: { targetKey: string; confidence: number; method: FieldMappingMethod } | null = null;
  for (const field of fields) {
    for (const alias of buildFieldAliases(field)) {
      const score = headerSimilarity(header, alias);
      let method: FieldMappingMethod = "fuzzy";
      if (score === 1) {
        method = norm(alias) === norm(field.label) || norm(alias) === norm(field.key) ? "exact" : "alias";
      } else if (score >= 0.6) {
        method = "alias";
      }
      if (!best || score > best.confidence) best = { targetKey: field.key, confidence: score, method };
    }
  }
  if (!best || best.confidence < FUZZY_ACCEPT) return null;
  return best;
}

/**
 * Build a deterministic header → field mapping. Each target field is claimed by
 * at most one (highest-confidence) source column; losers fall back to unmapped.
 */
export function buildFieldMapping(headers: string[], fields: TargetField[]): FieldMapping[] {
  const candidates: Array<FieldMapping & { _score: number }> = headers.map((header, sourceIndex) => {
    const match = matchHeaderToField(header, fields);
    return {
      sourceIndex,
      sourceHeader: header,
      targetKey: match?.targetKey ?? null,
      confidence: match?.confidence ?? 0,
      method: (match ? match.method : "unmapped") as FieldMappingMethod,
      _score: match?.confidence ?? 0,
    };
  });

  const claimed = new Map<string, number>();
  for (const c of [...candidates].sort((a, b) => b._score - a._score)) {
    if (!c.targetKey) continue;
    if (claimed.has(c.targetKey)) {
      const loser = candidates.find((x) => x.sourceIndex === c.sourceIndex)!;
      loser.targetKey = null;
      loser.confidence = 0;
      loser.method = "unmapped";
    } else {
      claimed.set(c.targetKey, c.sourceIndex);
    }
  }

  return candidates
    .sort((a, b) => a.sourceIndex - b.sourceIndex)
    .map(({ _score, ...m }) => m);
}
