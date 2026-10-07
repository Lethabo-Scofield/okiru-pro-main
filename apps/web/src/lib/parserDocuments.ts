export type ParserStatus = "passed" | "review_required" | "failed";

export interface ParserDocumentSummary {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  /** The saved company this document is filed under, or null if unassigned. */
  entityId: string | null;
  status: ParserStatus | null;
  documentType: string | null;
  overallConfidence: number | null;
  extractedFieldCount: number;
  problemFieldCount: number;
  reviewRequired: boolean;
  missingFields: string[];
  lowConfidenceFields: string[];
  latestRunId: string | null;
  lastRunAt: string | null;
  /** When a teammate signed off this document's read — it has left "Needs review". */
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
}

export interface ParserRunDetail {
  runId: string;
  documentId: string;
  status: ParserStatus;
  documentType: string;
  overallConfidence: number;
  extractedFieldCount: number;
  missingFieldCount: number;
  problemFieldCount: number;
  missingFields: string[];
  lowConfidenceFields: string[];
  warnings: string[];
  errors: string[];
  reviewReasons: string[];
  requiresHumanReview: boolean;
  parserVersion: string | null;
  graphVersion: string | null;
  createdAt: string;
  parserOutput?: Record<string, any>;
  /**
   * What the model and the agent read from the same file — the AI block of the
   * parser's signed record. Empty (or absent) on a run that predates it.
   */
  aiValues?: ParserAiValue[];
  aiValueCount?: number;
  /** The run is the parser's signed record (not one stored before runs were signed). */
  signed?: boolean;
  reviewHistory?: unknown[];
}

/** Which reader produced a value. */
export type ParserValueLayer = "rule" | "ai" | "agent";

/**
 * One value the model or the agent read. Mirrors RunAiValue in the parser's
 * runAttestation.ts; `key` is what a correction to it is filed under.
 */
export interface ParserAiValue {
  key: string;
  field: string;
  value: unknown;
  layer: ParserValueLayer;
  /** Null: the reader does not score a confidence. */
  confidence: number | null;
  documentId: string;
  documentName: string;
  element: string | null;
  /** The part of the upload it came from — a workbook sheet is "File.xlsx › Sheet". */
  sourceFile: string;
  page: number | null;
  cell: string | null;
  quote: string | null;
  /** False when the value could not be found in the document's own text. */
  grounded: boolean | null;
  /** A register's full row count, when only its first rows were kept. */
  rowCount?: number;
}

export const VALUE_LAYER_PRESENTATION: Record<ParserValueLayer, { label: string; title: string; tone: string }> = {
  rule: { label: "Rules", title: "Read by the parser's rules, without a model", tone: "border-sky-400/30 text-sky-200" },
  ai: { label: "AI", title: "Read by the AI model", tone: "border-violet-400/30 text-violet-200" },
  agent: { label: "Agent", title: "Read by the AI agent on a second, cited look at the document", tone: "border-emerald-400/30 text-emerald-200" },
};

/** The sheet a value came from, when it came from a workbook sheet ("File.xlsx › Sheet"). */
export function sheetOfSource(sourceFile: string | null | undefined): string | null {
  const name = String(sourceFile ?? "");
  const marker = name.indexOf("›");
  return marker >= 0 ? name.slice(marker + 1).trim() || null : null;
}

/** Where a value was read, in words: "Page 3", "Sheet Skills, cell B4". Null when the reader did not say. */
export function citationLabel(value: Pick<ParserAiValue, "page" | "cell" | "sourceFile">): string | null {
  const parts: string[] = [];
  const sheet = sheetOfSource(value.sourceFile);
  if (sheet) parts.push(`Sheet ${sheet}`);
  if (value.page != null) parts.push(`Page ${value.page}`);
  if (value.cell) parts.push(`cell ${value.cell}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

export const PARSER_STATUS_PRESENTATION: Record<ParserStatus, { label: string; description: string; tone: string; dot: string }> = {
  passed: { label: "Good", description: "Good extraction", tone: "text-emerald-300", dot: "bg-emerald-400" },
  review_required: { label: "Needs review", description: "Some values need review", tone: "text-amber-300", dot: "bg-amber-400" },
  failed: { label: "Problem", description: "The parser could not safely use this document", tone: "text-red-300", dot: "bg-red-400" },
};

export function fieldLabel(key: string): string {
  return key.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatParserValue(value: unknown): string {
  if (value == null || value === "") return "Could not be read";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
