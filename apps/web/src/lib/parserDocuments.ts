export type ParserStatus = "passed" | "review_required" | "failed";

export interface ParserDocumentSummary {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
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
  reviewHistory?: unknown[];
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
