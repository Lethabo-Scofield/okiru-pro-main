/**
 * The files a person uploaded, as a case names them.
 *
 * A workbook is read sheet by sheet, so the case names its parts "File.xlsx ›
 * Fills" and "File.xlsx › Vehicles". Counted as they come, six uploads read as
 * "8 documents" and a workbook with one empty sheet was listed as a document
 * we read nothing from. Every count and every per-document list on the ESG
 * screens goes through here, so a sheet is always counted as its workbook.
 */
import { esgCaseFileNames, esgUploadNameForSource, type EsgParserCaseLike } from "./esgParserInjection";

/** "Fuel.xlsx › Durban" → "Fuel.xlsx"; a plain file name is itself. */
export function esgUploadOf(source: unknown, uploadNames: readonly string[] = []): string {
  const raw = String(source ?? "").trim();
  if (!raw) return "";
  const known = esgUploadNameForSource(raw, uploadNames);
  if (known) return known;
  const marker = raw.indexOf("›");
  return marker >= 0 ? raw.slice(0, marker).trim() : raw;
}

/** Every upload the case covers, once each, sheets folded into their workbook. */
export function esgCaseUploadNames(caseResult: EsgParserCaseLike | null, uploadNames: readonly string[] = []): string[] {
  const out = new Set<string>();
  for (const name of esgCaseFileNames(caseResult)) {
    const upload = esgUploadOf(name, uploadNames);
    if (upload) out.add(upload);
  }
  return Array.from(out);
}
