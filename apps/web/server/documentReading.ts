/**
 * Switch for reading uploaded documents.
 *
 * Reading a document needs the AI services behind the parser. Where they are
 * not available (the temporary AWS host has none) a read cannot succeed, and
 * uploads are priced in tokens before they run — so set
 * DOCUMENT_READING_DISABLED=true and every request that would start or price
 * a read answers 503 with a plain message instead, while the upload screens
 * say so before anyone picks a file. Off unless the variable says "true".
 *
 * apps/api applies the same switch to library uploads and re-reads
 * (/api/parser-documents), which the ingress sends there directly.
 */

export const DOCUMENT_READING_STATUS_PATH = "/api/parser/availability";

export const DOCUMENT_READING_UNAVAILABLE_MESSAGE =
  "Reading documents is temporarily unavailable. You can still enter your figures on each scorecard page or import your completed Excel workbook.";

export function documentReadingDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.DOCUMENT_READING_DISABLED || "").trim().toLowerCase() === "true";
}

/**
 * Would this request start, price or repeat a document read? Looking things up
 * (document types, required documents, a document already read) stays open.
 */
export function startsDocumentRead(method: string, path: string): boolean {
  const m = (method || "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  if (path === "/api/parser" || path.startsWith("/api/parser/")) return true;
  return /^\/api\/parser-documents\/(upload|[^/]+\/(reparse|reread(\/quote)?))\/?$/.test(path);
}

export function documentReadingStatus(env: NodeJS.ProcessEnv = process.env): { available: boolean; message?: string } {
  return documentReadingDisabled(env)
    ? { available: false, message: DOCUMENT_READING_UNAVAILABLE_MESSAGE }
    : { available: true };
}
