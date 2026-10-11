/**
 * What a batch costs in credit tokens, and what the wallet holds.
 *
 * The server converts the parser's quote into tokens and reports the balance
 * in the same call (GET /api/tokens/quote/:id), so the number shown and the
 * number charged are the same number. Shared by both products: one wallet.
 */
export interface TokenCostFile {
  filename: string;
  tokens: number;
  /** Which pricing rule the server put this document under. */
  effort: "standard" | "high" | "workbook";
  requiresOcr: boolean;
  pages: number | null;
  sheets: number | null;
  rows: number | null;
}

export interface TokenCost {
  quoteId: string;
  tokens: number;
  /** Per-document itemisation — each file priced under its rule. */
  files?: TokenCostFile[];
  /** Tokens the batch minimum adds beyond the itemised documents. */
  minimumTopUp?: number;
  /** The pricing rules themselves, served so the UI never restates them wrong. */
  effortRules?: Array<{ tier: string; label: string; rule: string }>;
  balance: number;
  balanceAfter: number;
  sufficient: boolean;
  shortfall: number;
  alreadyAuthorized: boolean;
  /** Uploads are not charged for (TOKENS_REQUIRE_PAYMENT=false). */
  free?: boolean;
}

/** The parts of a parser quote's file the cost panel shows. */
export interface QuotedFile {
  filename: string;
  requiresOcr: boolean;
  structure: { pages: number | null; sheets: number | null; rows: number | null };
}

export const tokenText = (value: number): string => value.toLocaleString("en-ZA");

/** A file's size in whatever unit the structure scan actually established. */
export function fileUnits(file: Pick<QuotedFile, "structure">): string {
  if (file.structure.pages) return `${file.structure.pages} page${file.structure.pages === 1 ? "" : "s"}`;
  if (file.structure.sheets) return `${file.structure.sheets} sheet${file.structure.sheets === 1 ? "" : "s"}`;
  if (file.structure.rows) return `${file.structure.rows.toLocaleString("en-ZA")} rows`;
  return "";
}

/** The pricing rule, in words a customer uses. */
export const PRICE_LABELS: Record<string, string> = {
  standard: "Price: standard",
  high: "Price: scanned or long",
  workbook: "Price: spreadsheet",
};

/** "3 documents" / "1 document". */
export function documentsText(n: number, adjective = ""): string {
  return `${n} ${adjective ? `${adjective} ` : ""}document${n === 1 ? "" : "s"}`;
}
