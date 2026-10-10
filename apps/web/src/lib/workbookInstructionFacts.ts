/**
 * The sector and financial year end a gathering workbook states on its
 * Instructions sheet, as the parser reads them (`sheet_instructions`), in the
 * create form's own terms.
 *
 * The form is where the sector and year end are decided: the sector picks the
 * scorecard the company is judged against, the year end the period every dated
 * pillar is measured over. The workbook's statement of them is evidence the
 * form must not ignore. So it fills a field the user left EMPTY and, where the
 * form's value differs, the build waits for the user to take the workbook's
 * value or keep their own (unsettledMismatches) — never resolved silently
 * either way.
 */
import { normalizeSectorDeterministic } from "@/lib/excelImport";
import { parseWorkbookDate } from "@/components/workbook/sections";

export const SHEET_INSTRUCTIONS_DOCUMENT_ID = "sheet_instructions";

export interface WorkbookFormFacts {
  /** Form sector code (TRANSPORT, RCOGP, …), when every workbook agrees on one. */
  sector?: string;
  /** The sector as the workbook names it, for the note. */
  sectorStated?: string;
  /** yyyy-mm-dd, when every workbook agrees on one. */
  yearEnd?: string;
  /** The workbook sheet(s) the facts came from. */
  sources: string[];
}

interface ExtractionLike {
  documentId?: string;
  sourceFile?: string;
  values?: Array<{ field?: string; value?: unknown }>;
}

/** The workbook's year end as yyyy-mm-dd (the parser sends ISO; dd/mm/yyyy is tolerated). */
function isoYearEnd(value: unknown): string | undefined {
  const date = parseWorkbookDate(String(value ?? "").trim());
  return date ? date.toISOString().slice(0, 10) : undefined;
}

/** One value when every statement agrees, none when they disagree. */
function agreed<T>(values: T[]): T | undefined {
  const distinct = Array.from(new Set(values));
  return distinct.length === 1 ? distinct[0] : undefined;
}

/**
 * What the case's workbooks state on their Instructions sheets.
 *
 * Several workbooks in one pack usually state the same profile. When they
 * disagree with each other there is nothing to prefill — the user decides, as
 * they would have anyway.
 */
export function workbookFormFacts(parserCase: unknown): WorkbookFormFacts {
  const extractions = ((parserCase as { ai_entities?: { extractions?: unknown } } | null)?.ai_entities?.extractions ?? []) as ExtractionLike[];
  const sectors: Array<{ code: string; stated: string }> = [];
  const yearEnds: string[] = [];
  const sources: string[] = [];
  for (const extraction of Array.isArray(extractions) ? extractions : []) {
    if (extraction?.documentId !== SHEET_INSTRUCTIONS_DOCUMENT_ID) continue;
    if (extraction.sourceFile) sources.push(extraction.sourceFile);
    for (const { field, value } of extraction.values ?? []) {
      if (field === "industry_sector") {
        const stated = String(value ?? "").trim();
        const code = normalizeSectorDeterministic(stated);
        if (code) sectors.push({ code, stated });
      } else if (field === "financial_year_end") {
        const iso = isoYearEnd(value);
        if (iso) yearEnds.push(iso);
      }
    }
  }
  const sector = agreed(sectors.map((s) => s.code));
  return {
    sector,
    sectorStated: sector ? sectors.find((s) => s.code === sector)?.stated : undefined,
    yearEnd: agreed(yearEnds),
    sources,
  };
}

export interface FormFactMismatch {
  field: "sector" | "yearEnd";
  /** What the form holds. */
  form: string;
  /** What the workbook states. */
  workbook: string;
  /** The workbook's value in the form's own terms (a sector code, an ISO date): what "use the workbook's" sets. */
  use: string;
}

/**
 * Where the form's sector or year end differs from the workbook's.
 *
 * A blank form field is no disagreement (it is about to be filled), and neither
 * is a sector the form and workbook name differently but mean the same.
 */
export function formFactMismatches(
  form: { sector: string; yearEnd: string },
  facts: WorkbookFormFacts,
): FormFactMismatch[] {
  const out: FormFactMismatch[] = [];
  const formSector = normalizeSectorDeterministic(form.sector) ?? form.sector;
  if (form.sector && facts.sector && formSector !== facts.sector) {
    out.push({ field: "sector", form: form.sector, workbook: facts.sectorStated ?? facts.sector, use: facts.sector });
  }
  const formYearEnd = isoYearEnd(form.yearEnd);
  if (form.yearEnd && facts.yearEnd && formYearEnd !== facts.yearEnd) {
    out.push({ field: "yearEnd", form: form.yearEnd, workbook: facts.yearEnd, use: facts.yearEnd });
  }
  return out;
}

/**
 * The disagreements the user has not yet settled.
 *
 * The sector decides which scorecard the company is judged against and the
 * year end which twelve months every dated pillar covers, so a form that
 * disagrees with the workbook cannot build on its own: a value restored from an
 * earlier session, or picked before the documents were read, silently beat the
 * workbook and scored a Transport company under the generic Codes, five levels
 * down. Each disagreement is settled by taking the workbook's value (the form
 * then agrees) or by keeping the form's, which the user does for that exact
 * pair of values; a new disagreement asks again.
 */
export function unsettledMismatches(mismatches: FormFactMismatch[], kept: FormFactMismatch[]): FormFactMismatch[] {
  return mismatches.filter((m) => !kept.some((k) => k.field === m.field && k.form === m.form && k.workbook === m.workbook));
}
