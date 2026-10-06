/**
 * What the review page shows for each document: what we took from it, what we
 * read but could not place, and — in plain English — why anything was not
 * read and what the user can do about it.
 *
 * This replaces the list of collapsed sections that used to sit under the
 * Build button ("Documents still worth adding", "What we read", "Evidence that
 * didn't reconcile" …): the same facts, but attached to the document they are
 * about, next to the document itself. Nothing here decides a score; it only
 * explains the read. The verdict per document comes from `assessDocuments`,
 * which already credits every path a value can arrive by and filters parser
 * jargon — this module never re-derives it.
 */
import {
  assessDocuments,
  isClassificationNote,
  isInternalArtifact,
  isInternalJargon,
  type SectionPatchLike,
} from "./documentVerdicts";
import type { ParserCaseLike } from "./parserWorkbookMap";

export type ReviewState = "read" | "needs-look" | "not-read";

export interface ReviewValue {
  label: string;
  value: string;
  /** The text in the document the value was read from, when the parser kept it. */
  source?: string;
}

export interface ReviewProblem {
  /** One sentence a client understands. Never a parser message. */
  headline: string;
  /** Optional specifics (e.g. the conflicting figures). */
  detail?: string;
  /** What to do about it. */
  fix: string;
  /** Whether a new upload is the way to fix it. */
  replace: boolean;
}

export interface ReviewDocument {
  filename: string;
  documentType: string;
  state: ReviewState;
  /** e.g. "12 managers · Level 2". */
  summary: string;
  values: ReviewValue[];
  /** Read, but not placed in the workbook — with the reason, so it can be placed by hand. */
  unplaced: ReviewValue[];
  problems: ReviewProblem[];
  /** Things this document should have carried and did not. */
  notFound: string[];
}

export interface ReviewInputs {
  parserCase: ParserCaseLike;
  /** The merged workbook patch (rows carry `_sourceFiles` provenance). */
  sections?: Record<string, SectionPatchLike>;
  /** Values the mapper read but could not place, attributed to their file. */
  rejected?: Array<{ field: string; value: unknown; detail: string; sourceFile: string }>;
  /** Cross-checks that failed, attributed to their file (totals that don't add up, etc.). */
  flags?: Array<{ sourceFile: string; note: string }>;
  /** Files the parser could not even open (the stream reported an error for them). */
  failedFiles?: string[];
}

const MAX_VALUES = 60;

function humanize(field: string): string {
  return field
    .replace(/^(current_year_|cy_)/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function display(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("en-ZA") : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? "" : "s"}` : null;
  if (typeof value === "object") return null;
  const s = String(value).trim();
  return s ? s : null;
}

function sourceText(v: Record<string, unknown>): string | undefined {
  for (const key of ["evidence", "sourceText", "source_text", "text_snippet", "snippet", "quote"]) {
    const s = v[key];
    if (typeof s === "string" && s.trim()) return s.trim().slice(0, 240);
  }
  const src = v.source as { text_snippet?: unknown } | undefined;
  if (src && typeof src.text_snippet === "string" && src.text_snippet.trim()) return src.text_snippet.trim().slice(0, 240);
  return undefined;
}

/** Every value we can attribute to this file, from both extraction paths. */
function valuesFor(parserCase: ParserCaseLike, filename: string): ReviewValue[] {
  const out: ReviewValue[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string, source?: string) => {
    const key = `${label}\u0000${value}`;
    if (seen.has(key) || out.length >= MAX_VALUES) return;
    seen.add(key);
    out.push(source ? { label, value, source } : { label, value });
  };

  const extractions =
    (parserCase as { ai_entities?: { extractions?: Array<{ sourceFile?: unknown; values?: Array<Record<string, unknown>> }> } })
      .ai_entities?.extractions ?? [];
  for (const e of extractions) {
    if (String(e.sourceFile ?? "") !== filename) continue;
    for (const v of e.values ?? []) {
      const shown = display(v.value);
      if (shown) push(humanize(String(v.field ?? "")), shown, sourceText(v));
    }
  }

  const fields = (parserCase.fields_extracted?.[filename] ?? {}) as Record<string, Record<string, unknown>>;
  for (const [field, f] of Object.entries(fields)) {
    const shown = display(f?.normalized_value ?? f?.raw_value);
    if (shown) push(humanize(field), shown, sourceText(f ?? {}));
  }

  const suppliers = (parserCase.supplier_rows ?? []).filter((r) => r.source_file === filename);
  if (suppliers.length) push("Suppliers listed", suppliers.length.toLocaleString("en-ZA"));
  return out;
}

/** Why nothing came out of a document, as the client should hear it. */
function whyNotRead(texts: string[], documentType: string, couldNotOpen: boolean, productNoun: string): ReviewProblem {
  const all = texts.join(" \n ");
  if (couldNotOpen) {
    return {
      headline: "We couldn't open this file.",
      fix: "Upload it again. If it keeps failing, save it as a PDF and upload that.",
      replace: true,
    };
  }
  if (/password|encrypt/i.test(all)) {
    return { headline: "This file is password-protected, so we couldn't open it.", fix: "Upload a copy without a password.", replace: true };
  }
  if (/\b(ocr|scan(ned)?|image|photo|handwrit|blurr|illegible|low.?quality|no text layer)\b/i.test(all)) {
    return {
      headline: "This looks like a scan or photo we couldn't read clearly.",
      fix: "Upload a clearer scan, or the original PDF if you have it.",
      replace: true,
    };
  }
  if (/\b(empty|no pages|no readable|blank|zero pages|0 pages)\b/i.test(all)) {
    return { headline: "This file has no readable content.", fix: "Check it is the file you meant to upload.", replace: true };
  }
  if (/\bunsupported|not supported\b/i.test(all)) {
    return { headline: "We can't read this kind of file.", fix: "Save it as a PDF or an Excel file and upload that.", replace: true };
  }
  if (texts.some(isClassificationNote) || /unrecognised|unknown/i.test(documentType)) {
    return {
      headline: "We couldn't tell what kind of document this is, so we didn't know what to look for in it.",
      fix: "Check it is the document you meant. If it is, a clearer copy usually fixes this.",
      replace: true,
    };
  }
  return {
    headline: `We read this document but found nothing ${productNoun} uses in it.`,
    detail: documentType ? `It looks like: ${documentType}.` : undefined,
    fix: "If it should count — a payroll, a share register, a certificate — check it is the right file and the right year.",
    replace: true,
  };
}

/** Real trouble on a document that DID give us something: conflicts, expiry, misreads. */
function troubleFor(texts: string[]): ReviewProblem[] {
  const out: ReviewProblem[] = [];
  const seen = new Set<string>();
  for (const raw of texts) {
    const t = raw.trim();
    if (!t || seen.has(t) || isClassificationNote(t) || isInternalJargon(t) || isInternalArtifact(t)) continue;
    if (/\smissing$/i.test(t)) continue; // a missing field is a gap, listed separately
    seen.add(t);
    const expired = /\bexpired\b/i.test(t);
    out.push({
      headline: expired ? "This document has expired." : "Something here needs a human look.",
      detail: t,
      fix: expired
        ? "Upload the current version if there is one."
        : "Check it against the document, and correct the value in the workbook if it's wrong.",
      replace: expired,
    });
    if (out.length >= 4) break;
  }
  return out;
}

export function buildDocumentReview(inputs: ReviewInputs, productNoun = "your scorecard"): ReviewDocument[] {
  const { parserCase, sections, rejected = [], flags = [], failedFiles = [] } = inputs;
  const { verdicts } = assessDocuments(parserCase, sections);
  const byName = new Map(verdicts.map((v) => [v.filename, v]));
  // A file the parser could not even open never reaches the case — it still
  // gets a row, or it would silently vanish from the review.
  for (const name of failedFiles) {
    if (!byName.has(name)) {
      byName.set(name, { filename: name, documentType: "", verdict: "none", summary: "", gaps: [], confidence: null });
    }
  }

  const docs: ReviewDocument[] = [];
  for (const v of Array.from(byName.values())) {
    const detected = (parserCase.documents_detected ?? []).find((d) => d.filename === v.filename);
    const review = (parserCase.documents_needing_review ?? []).find((r) => r.filename === v.filename);
    const parserTexts = [
      ...(detected?.validation?.errors ?? []),
      ...(review?.reasons ?? []),
      ...(detected?.validation?.warnings ?? []),
    ].map(String);
    const fileFlags = flags.filter((f) => f.sourceFile === v.filename).map((f) => f.note);
    const unplaced = rejected
      .filter((r) => r.sourceFile === v.filename)
      .map((r) => ({ label: humanize(r.field), value: display(r.value) ?? "—", source: r.detail }))
      .slice(0, MAX_VALUES);

    let state: ReviewState = v.verdict === "found" ? "read" : v.verdict === "confused" ? "needs-look" : "not-read";
    const values = valuesFor(parserCase, v.filename);
    const problems: ReviewProblem[] = [];
    if (state === "not-read") {
      problems.push(whyNotRead(parserTexts, v.documentType, failedFiles.includes(v.filename), productNoun));
    } else {
      problems.push(...troubleFor([...(detected?.validation?.errors ?? []).map(String), ...(review?.reasons ?? []).map(String)]));
      for (const note of fileFlags) {
        problems.push({
          headline: "The figures in this document don't reconcile.",
          detail: note,
          fix: "A verifier will ask about this first — check the totals before you submit.",
          replace: false,
        });
      }
      if (problems.length > 0 && state === "read") state = "needs-look";
    }

    // Gaps are the missing fields; anything that is a sentence of trouble was
    // already said above.
    const notFound = v.gaps.filter((g: string) => !/[.!?]$/.test(g) && g.length <= 60 && !problems.some((p) => p.detail === g));

    docs.push({
      filename: v.filename,
      // The parser's "Unknown" is a classifier state, not a document type.
      documentType: /^(unknown|unrecognised document)$/i.test(v.documentType.trim()) ? "" : v.documentType,
      state,
      summary: state === "not-read" ? "" : v.summary,
      values,
      unplaced,
      problems,
      notFound,
    });
  }

  // Worst first: what needs the user is what they came to the review for.
  const rank: Record<ReviewState, number> = { "not-read": 0, "needs-look": 1, read: 2 };
  return docs.sort((a, b) => rank[a.state] - rank[b.state] || a.filename.localeCompare(b.filename));
}

export function reviewCounts(docs: ReviewDocument[]): Record<ReviewState, number> {
  return {
    read: docs.filter((d) => d.state === "read").length,
    "needs-look": docs.filter((d) => d.state === "needs-look").length,
    "not-read": docs.filter((d) => d.state === "not-read").length,
  };
}
