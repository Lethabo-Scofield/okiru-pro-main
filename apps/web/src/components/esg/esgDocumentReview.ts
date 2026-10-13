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
import {
  display,
  humanize,
  whyNotRead,
  type ReviewDocument,
  type ReviewProblem,
  type ReviewQuestion,
  type ReviewValue,
} from "@/lib/documentReview";
import type { EsgReportingAxes } from "@/components/esg-workbook/esgDefaults";
import type { EsgPlacementChoice } from "@/lib/esg/esgParserToWorkbook";
import {
  ESG_NO_CELL_REJECTIONS,
  esgCaseFileNames,
  esgUploadNameForSource,
  type EsgInjectionResult,
  type EsgParserCaseLike,
  type EsgUnplacedValue,
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

/** A held figure, as a person reads it: "95 949,25 kWh". */
function figureText(choice: EsgPlacementChoice): string {
  return `${new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 2 }).format(choice.value)} ${choice.unit}`;
}

/**
 * The question that places a held figure, with the company's own sites and
 * months to answer from. None when the workbook has nothing to offer.
 */
export function esgPlacementQuestion(choice: EsgPlacementChoice, axes: EsgReportingAxes | undefined): ReviewQuestion | undefined {
  if (!axes) return undefined;
  const fields: ReviewQuestion["fields"] = [];
  if (choice.needs.includes("site")) {
    if (axes.depots.length === 0) return undefined;
    fields.push({ key: "site", label: "Site", options: axes.depots.map((site, i) => ({ value: String(i), label: site })) });
  }
  if (choice.needs.includes("month")) {
    if (axes.months.length === 0) return undefined;
    fields.push({
      key: "month",
      label: "Month",
      options: axes.months.slice(0, 24).map((month, i) => ({ value: String.fromCharCode(67 + i), label: month })),
    });
  }
  const site = choice.needs.includes("site")
    ? `Which of your sites is this${choice.statedSite ? ` — the document says “${choice.statedSite}”` : ""}?`
    : "";
  const month = choice.needs.includes("month") ? (site ? "And which month is it for?" : "Which month is it for?") : "";
  return { id: choice.id, prompt: [site, month].filter(Boolean).join(" "), fields };
}

/** One unplaced reading for the review: a question to answer, evidence, or a value to enter by hand. */
function unplacedValue(u: EsgUnplacedValue, axes: EsgReportingAxes | undefined): ReviewValue {
  const ask = u.choice ? esgPlacementQuestion(u.choice, axes) : undefined;
  if (u.choice && ask) return { label: u.choice.measure, value: figureText(u.choice), source: u.reason, ask };
  return {
    label: humanize(u.field),
    value: display(u.value) ?? "—",
    source: u.reason,
    ...(u.rejection && ESG_NO_CELL_REJECTIONS.has(u.rejection) ? { evidence: true } : {}),
  };
}

/** "Fuel.xlsx › Durban" → { upload: "Fuel.xlsx", sheet: "Durban" }. */
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
    // A figure's site and period travel with it, so they are not listed twice.
    const unplaced: ReviewValue[] = [
      ...injection.unplaced
        .filter((u) => splitSource(u.sourceFile, uploadNames).upload === name && !u.partOf)
        // A figure read twice is one figure, asked about once.
        .filter((u, i, all) => !u.choice || all.findIndex((v) => v.choice?.id === u.choice!.id) === i)
        .slice(0, MAX_VALUES)
        .map((u) => unplacedValue(u, injection.axes)),
      // Figures a person placed: where they went, and the way back.
      ...(injection.answered ?? [])
        .filter((a) => splitSource(a.sourceFile, uploadNames).upload === name)
        .map((a): ReviewValue => ({
          label: a.choice.measure,
          value: figureText(a.choice),
          answered: a.placement.where,
          ask: esgPlacementQuestion(a.choice, injection.axes) ?? { id: a.choice.id, prompt: "", fields: [] },
        })),
    ];
    const toPlace = unplaced.filter((v) => v.ask && !v.answered).length;
    const forAPerson = unplaced.filter((v) => !v.evidence && !v.answered).length;

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
    } else if (placed.length === 0 && forAPerson > 0) {
      state = "needs-look";
      problems.unshift({
        headline: toPlace > 0
          ? `${toPlace} figure${toPlace === 1 ? "" : "s"} from this document need${toPlace === 1 ? "s" : ""} you to say where ${toPlace === 1 ? "it goes" : "they go"}.`
          : `We read ${values.length} value${values.length === 1 ? "" : "s"} from this document but could place none of them in the workbook.`,
        detail: toPlace > 0 ? "Answer each question below and the figure goes into the workbook." : "They are listed below with the reason for each.",
        fix: toPlace > 0 ? "Nothing is guessed meanwhile." : "Enter them yourself, or check the document covers your sites and reporting period.",
        replace: false,
      });
    } else {
      state = problems.length > 0 || toPlace > 0 ? "needs-look" : "read";
    }

    const notFound = Array.from(new Set(own.flatMap((e) => (e.missingFields ?? []).map((f) => humanize(String(f)))))).slice(0, 12);
    const documentType = own.map((e) => e.documentName).find(Boolean) ?? "";
    const kept = unplaced.filter((v) => v.evidence).length;
    const summary =
      values.length === 0
        ? ""
        : [
          `${placed.length} placed`,
          `${values.length} read`,
          toPlace > 0 ? `${toPlace} to place` : "",
          kept > 0 ? `${kept} kept as evidence` : "",
          own.length > 1 ? `${own.length} sheets` : "",
        ].filter(Boolean).join(" · ");

    docs.push({ filename: name, documentType: String(documentType), state, summary, values, unplaced, problems, notFound });
  }

  const rank = { "not-read": 0, "needs-look": 1, read: 2 } as const;
  return docs.sort((a, b) => rank[a.state] - rank[b.state] || a.filename.localeCompare(b.filename));
}
