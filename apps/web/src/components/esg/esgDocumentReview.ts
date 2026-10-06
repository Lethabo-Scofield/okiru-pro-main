/**
 * The ESG side of "Review your documents": one entry per UPLOADED file, built
 * from the ESG parser's own shapes, for the shared side-by-side review.
 *
 * ESG differs from B-BBEE in three ways this has to respect:
 *  - a workbook is read sheet by sheet, so a source is often "File.xlsx ›
 *    Sheet"; values are grouped back under the file the user uploaded, and the
 *    sheet becomes where the value came from;
 *  - the verdict is the extraction itself (there is no per-document status):
 *    values placed = read, values read but none placed = needs a look, nothing
 *    = not read;
 *  - placement is decided by `applyEsgParserResult`, so "placed", "unplaced"
 *    and "conflicts" come from the injection result, never re-derived here.
 */
import { display, humanize, whyNotRead, type ReviewDocument, type ReviewProblem, type ReviewValue } from "@/lib/documentReview";
import {
  esgCaseFileNames,
  esgUploadNameForSource,
  type EsgInjectionResult,
  type EsgParserCaseLike,
} from "./esgParserInjection";

const PRODUCT = "your ESG workbook";
const MAX_VALUES = 60;

export interface EsgReviewInputs {
  parserCase: EsgParserCaseLike;
  injection: EsgInjectionResult;
  /** The files uploaded in this session — the names everything is grouped under. */
  uploadNames: string[];
  /** Files the stream reported an error for. */
  failedFiles?: string[];
}

/** "Fuel.xlsx › Darwin" → { upload: "Fuel.xlsx", sheet: "Darwin" }. */
function splitSource(source: unknown, uploadNames: string[]): { upload: string; sheet: string | null } {
  const raw = String(source ?? "").trim();
  const upload = esgUploadNameForSource(raw, uploadNames) ?? (raw.includes("›") ? raw.split("›")[0].trim() : raw);
  const marker = raw.indexOf("›");
  return { upload, sheet: marker >= 0 ? raw.slice(marker + 1).trim() || null : null };
}

export function buildEsgDocumentReview({ parserCase, injection, uploadNames, failedFiles = [] }: EsgReviewInputs): ReviewDocument[] {
  const names = new Set<string>(uploadNames);
  for (const name of esgCaseFileNames(parserCase)) names.add(splitSource(name, uploadNames).upload);
  for (const name of failedFiles) names.add(name);

  const extractions = parserCase.ai_entities?.extractions ?? [];
  const unreadable = parserCase.unreadable_files ?? [];

  const docs: ReviewDocument[] = [];
  for (const name of Array.from(names)) {
    if (!name) continue;
    const own = extractions.filter((e) => splitSource(e.sourceFile, uploadNames).upload === name);

    const values: ReviewValue[] = [];
    const seen = new Set<string>();
    for (const e of own) {
      const { sheet } = splitSource(e.sourceFile, uploadNames);
      for (const v of e.values ?? []) {
        const shown = display(v.value);
        if (!shown || values.length >= MAX_VALUES) continue;
        const label = humanize(String(v.field ?? ""));
        const key = `${label}\u0000${shown}\u0000${sheet ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        values.push(sheet ? { label, value: shown, source: `Sheet: ${sheet}` } : { label, value: shown });
      }
    }

    const placed = injection.placed.filter((p) => splitSource(p.sourceFile, uploadNames).upload === name);
    const unplaced: ReviewValue[] = injection.unplaced
      .filter((u) => splitSource(u.sourceFile, uploadNames).upload === name)
      .slice(0, MAX_VALUES)
      .map((u) => ({ label: humanize(u.field), value: display(u.value) ?? "—", source: u.reason }));

    const problems: ReviewProblem[] = [];
    // Figures this document disagrees with another on — left blank, not guessed.
    for (const conflict of injection.conflicts) {
      const mine = conflict.candidates.find((c) => c.sources.some((s) => splitSource(s, uploadNames).upload === name));
      if (!mine) continue;
      const others = conflict.candidates.filter((c) => c !== mine);
      problems.push({
        headline: `Your documents disagree on ${conflict.label}.`,
        detail: `This one says ${String(mine.value)}${others.length ? `; ${others.map((o) => `${o.sources.join(", ")} says ${String(o.value)}`).join("; ")}` : ""}.`,
        fix: "Left blank rather than guessed — enter the right figure in the workbook.",
        replace: false,
      });
    }
    // Notes the extraction itself raised — a total the rows don't sum to, a
    // period outside the reporting year.
    for (const e of own) {
      for (const note of e.exceptions ?? []) {
        const text = String(note ?? "").trim();
        if (!text || problems.some((p) => p.detail === text)) continue;
        problems.push({
          headline: "Something here needs a human look.",
          detail: text,
          fix: "Check it against the document before you rely on it.",
          replace: false,
        });
      }
    }

    const unreadableReason = unreadable.find((u) => String(u.file_name ?? "") === name)?.reason;
    let state: ReviewDocument["state"];
    if (values.length === 0) {
      state = "not-read";
      problems.unshift(
        whyNotRead(unreadableReason ? [String(unreadableReason)] : [], "", failedFiles.includes(name), PRODUCT),
      );
    } else if (placed.length === 0 && unplaced.length > 0) {
      state = "needs-look";
      problems.unshift({
        headline: `We read ${values.length} value${values.length === 1 ? "" : "s"} from this document but could place none of them in the workbook.`,
        detail: "They are listed below with the reason for each.",
        fix: "Enter them yourself, or check the document covers your sites and reporting period.",
        replace: false,
      });
    } else {
      state = problems.length > 0 ? "needs-look" : "read";
    }

    const notFound = Array.from(new Set(own.flatMap((e) => (e.missingFields ?? []).map((f) => humanize(String(f)))))).slice(0, 12);
    const documentType = own.map((e) => e.documentName).find(Boolean) ?? "";
    const summary =
      values.length === 0
        ? ""
        : `${placed.length} placed · ${values.length} read${own.length > 1 ? ` · ${own.length} sheets` : ""}`;

    docs.push({ filename: name, documentType: String(documentType), state, summary, values, unplaced, problems, notFound });
  }

  const rank = { "not-read": 0, "needs-look": 1, read: 2 } as const;
  return docs.sort((a, b) => rank[a.state] - rank[b.state] || a.filename.localeCompare(b.filename));
}
