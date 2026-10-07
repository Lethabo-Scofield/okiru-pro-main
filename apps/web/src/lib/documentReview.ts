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

/** Where a value lives in the parser case, so a person can correct it in place. */
export type ReviewEdit =
  | { kind: "field"; field: string }
  | { kind: "entity"; extraction: number; index: number };

export interface ReviewValue {
  label: string;
  value: string;
  /** The text in the document the value was read from, when the parser kept it. */
  source?: string;
  /** Present when the value can be corrected before building. */
  edit?: ReviewEdit;
  /** A person typed this, in the review — not the parser. */
  entered?: boolean;
  /** The question that places an unplaced value — "put it here" — when a person can answer it. */
  ask?: ReviewQuestion;
  /** Where a person placed it, in words; the question stays so it can be taken back. */
  answered?: string;
  /** Kept as evidence: no cell in the workbook needs this value. Not a failure to place. */
  evidence?: boolean;
}

/**
 * One question that places a value: what the document did not say (which
 * site, which month), each with the options a person picks from.
 */
export interface ReviewQuestion {
  /** Identifies the question to whoever asked it. */
  id: string;
  /** "Which of your sites is this for?" */
  prompt: string;
  fields: Array<{ key: string; label: string; options: Array<{ value: string; label: string }> }>;
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
  /**
   * Read, but not placed in the workbook — with the reason, so it can be placed
   * by hand. Values carrying `ask` wait for an answer; `evidence` values need
   * no cell at all.
   */
  unplaced: ReviewValue[];
  problems: ReviewProblem[];
  /** Things this document should have carried and did not. */
  notFound: string[];
  /** The same gaps with the parser's field key, so a person can fill them in. */
  missing?: Array<{ label: string; field: string }>;
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

export function humanize(field: string): string {
  return field
    .replace(/^(current_year_|cy_)/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function display(value: unknown): string | null {
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

type Extraction = { sourceFile?: unknown; values?: Array<Record<string, unknown>> };
const extractionsOf = (parserCase: ParserCaseLike): Extraction[] =>
  (parserCase as { ai_entities?: { extractions?: Extraction[] } }).ai_entities?.extractions ?? [];

/** Every value we can attribute to this file, from both extraction paths. */
function valuesFor(parserCase: ParserCaseLike, filename: string): ReviewValue[] {
  const out: ReviewValue[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string, source: string | undefined, edit?: ReviewEdit, entered = false) => {
    const key = `${label}\u0000${value}`;
    if (seen.has(key) || out.length >= MAX_VALUES) return;
    seen.add(key);
    out.push({
      label,
      value,
      ...(entered ? { source: "Entered by you", entered: true } : source ? { source } : {}),
      ...(edit ? { edit } : {}),
    });
  };

  extractionsOf(parserCase).forEach((e, extraction) => {
    if (String(e.sourceFile ?? "") !== filename) return;
    (e.values ?? []).forEach((v, index) => {
      const shown = display(v.value);
      if (shown) push(humanize(String(v.field ?? "")), shown, sourceText(v), { kind: "entity", extraction, index }, v.entered_by_user === true);
    });
  });

  const fields = (parserCase.fields_extracted?.[filename] ?? {}) as Record<string, Record<string, unknown>>;
  for (const [field, f] of Object.entries(fields)) {
    const shown = display(f?.normalized_value ?? f?.raw_value);
    if (shown) push(humanize(field), shown, sourceText(f ?? {}), { kind: "field", field }, f?.entered_by_user === true);
  }

  const suppliers = (parserCase.supplier_rows ?? []).filter((r) => r.source_file === filename);
  if (suppliers.length) push("Suppliers listed", suppliers.length.toLocaleString("en-ZA"), undefined);
  return out;
}

/** Why nothing came out of a document, as the client should hear it. */
export function whyNotRead(texts: string[], documentType: string, couldNotOpen: boolean, productNoun: string): ReviewProblem {
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

/** Words that mean a human genuinely has to look — anything else is parser noise. */
const REAL_TROUBLE =
  /\b(expired|expires? before|conflict|conflicting|disagree|mismatch|does not match|doesn't match|misread|checksum|invalid|outside the|duplicate|could not|unreadable|failed|hallucinat)/i;

/** Real trouble on a document that DID give us something: conflicts, expiry, misreads. */
function troubleFor(texts: string[]): ReviewProblem[] {
  const out: ReviewProblem[] = [];
  const seen = new Set<string>();
  for (const raw of texts) {
    const t = raw.trim();
    if (!t || seen.has(t) || isClassificationNote(t) || isInternalJargon(t) || isInternalArtifact(t)) continue;
    // "X missing" / "x_field not found" is a gap, listed under Not found — not
    // trouble. Counting it as trouble is what marked nearly every document
    // "Needs a look". Only real trouble flags a document.
    if (/\b(missing|not found)$/i.test(t) || !REAL_TROUBLE.test(t)) continue;
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
    // Plain field names only: "registration_number not found" becomes
    // "Registration number"; sentences of trouble were said above.
    const notFound = Array.from(
      new Set(
        v.gaps
          .map((g: string) => {
            const m = /^(.*?)\s+(?:not found|missing)$/i.exec(g.trim());
            return m ? humanize(m[1]) : g.trim();
          })
          .filter((g: string) => g && !/[.!?]$/.test(g) && g.length <= 60 && !problems.some((p) => p.detail === g)),
      ),
    );
    // The parser's own key for each gap, so filling one in lands where the
    // workbook mapping reads it. A gap the parser never keyed gets a key made
    // from its label.
    const keyByLabel = new Map(
      (detected?.validation?.missing_fields ?? []).map((f) => [squash(humanize(String(f))), String(f)] as const),
    );
    const missing = notFound.map((label) => ({
      label,
      field: keyByLabel.get(squash(label)) ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    }));

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
      missing,
    });
  }

  // Worst first: what needs the user is what they came to the review for.
  const rank: Record<ReviewState, number> = { "not-read": 0, "needs-look": 1, read: 2 };
  return docs.sort((a, b) => rank[a.state] - rank[b.state] || a.filename.localeCompare(b.filename));
}

/** Lowercase letters and digits only — "Signed date" and "signed_date" are the same key. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * What a person typed, as the type the parser would have produced: a number
 * where the parser read a number (so "R1 200 000" scores as 1200000), text
 * everywhere else — an ID or registration number must keep its leading zeros.
 */
function coerceTyped(raw: string, parserValue: unknown): unknown {
  if (typeof parserValue !== "number") return raw;
  const n = Number(raw.replace(/[R\s,%]/g, ""));
  return Number.isFinite(n) ? n : raw;
}

/** "X missing" / "x_field not found" about this field. */
function isGapLine(text: unknown, key: string): boolean {
  const m = /^(.*?)\s+(?:not found|missing)$/i.exec(String(text ?? "").trim());
  return Boolean(m && squash(m[1]) === key);
}

/**
 * Apply a correction made in the review to the parser case, so building uses
 * it. The parser's reading is kept on the value (`parser_value`) and the value
 * is marked `entered_by_user`, so the review can say a person typed it. A field
 * that was missing stops being listed as missing.
 */
export function applyReviewEdit(parserCase: ParserCaseLike, filename: string, edit: ReviewEdit, raw: string): ParserCaseLike {
  const typed = raw.trim();
  if (!typed) return parserCase;

  if (edit.kind === "entity") {
    const ai = (parserCase as { ai_entities?: { extractions?: Extraction[] } }).ai_entities;
    const extractions = [...(ai?.extractions ?? [])];
    const e = extractions[edit.extraction];
    const v = e?.values?.[edit.index];
    if (!e || !v || String(e.sourceFile ?? "") !== filename) return parserCase;
    const values = [...(e.values ?? [])];
    const parserValue = v.entered_by_user === true ? v.parser_value : v.value;
    values[edit.index] = { ...v, value: coerceTyped(typed, parserValue), entered_by_user: true, parser_value: parserValue ?? null };
    extractions[edit.extraction] = { ...e, values };
    return { ...parserCase, ai_entities: { ...ai, extractions } } as ParserCaseLike;
  }

  const before = parserCase.fields_extracted?.[filename]?.[edit.field] as Record<string, unknown> | undefined;
  const parserValue = before?.entered_by_user === true ? before.parser_value : before?.normalized_value ?? before?.raw_value;
  const corrected = {
    ...(before ?? {}),
    raw_value: typed,
    normalized_value: coerceTyped(typed, parserValue),
    confidence: 1,
    entered_by_user: true,
    parser_value: parserValue ?? null,
  };
  const fields_extracted = {
    ...(parserCase.fields_extracted ?? {}),
    [filename]: { ...(parserCase.fields_extracted?.[filename] ?? {}), [edit.field]: corrected },
  } as ParserCaseLike["fields_extracted"];

  const key = squash(edit.field);
  const documents_detected = (parserCase.documents_detected ?? []).map((d) =>
    d.filename !== filename || !d.validation
      ? d
      : {
          ...d,
          validation: {
            ...d.validation,
            missing_fields: (d.validation.missing_fields ?? []).filter((f) => squash(String(f)) !== key && squash(humanize(String(f))) !== key),
            errors: (d.validation.errors ?? []).filter((t) => !isGapLine(t, key)),
            warnings: (d.validation.warnings ?? []).filter((t) => !isGapLine(t, key)),
          },
        },
  );
  const documents_needing_review = (parserCase.documents_needing_review ?? []).map((r) =>
    r.filename !== filename ? r : { ...r, reasons: (r.reasons ?? []).filter((t) => !isGapLine(t, key)) },
  );
  return { ...parserCase, fields_extracted, documents_detected, documents_needing_review };
}

export function reviewCounts(docs: ReviewDocument[]): Record<ReviewState, number> {
  return {
    read: docs.filter((d) => d.state === "read").length,
    "needs-look": docs.filter((d) => d.state === "needs-look").length,
    "not-read": docs.filter((d) => d.state === "not-read").length,
  };
}
