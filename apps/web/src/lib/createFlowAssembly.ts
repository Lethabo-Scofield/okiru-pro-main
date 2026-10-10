/**
 * How the B-BBEE create flow turns a read case and the form into the sections
 * it builds a company from — kept out of the component so the end-to-end gate
 * runs the very same code instead of a copy of it.
 *
 * A copy is what let the gate and the product drift apart: the gate hard-coded
 * the sector and size and scored the pack under the right scorecard while the
 * product built the same pack under another one. Everything here is pure; the
 * component adds what needs the network (the certificate registry lookup) and
 * the user (the form) around it.
 */
import { mergeWorkbookSections, parserExtractionsToWorkbook, toWorkbookSections, type ParserExtraction, type ParserToWorkbookResult } from "@/lib/parserToWorkbook";
import type { VocabularyDecisions } from "@/lib/workbookInjection";
import { formFactMismatches, undecidedMismatches, workbookFormFacts, type FormFactMismatch } from "@/lib/workbookInstructionFacts";

/**
 * The create form's sector code → the workbook's `industrySector`.
 *
 * The parser's generic option is coded "Generic", but every Toolkit sector
 * config (and okiruHubSectors) keys the generic Codes as "RCOGP". Mapping
 * "Generic" → "Generic" produced an industrySector no config matched, so the
 * workbook silently fell back and the chosen sector "didn't reflect". Both
 * "Generic" and "RCOGP" now resolve to the RCOGP config.
 */
export const SECTOR_TO_WORKBOOK: Record<string, string> = {
  Generic: "RCOGP",
  RCOGP: "RCOGP",
  CONSTRUCTION: "CONSTRUCTION",
  FSC: "FSC",
  TRANSPORT: "TRANSPORT",
  ICT: "ICT",
  AGRI: "AGRI",
};

type CaseExtraction = {
  documentId?: string;
  sourceFile?: string;
  element?: string;
  values?: Array<{ field: string; value: unknown }>;
  exceptions?: unknown[];
};

/** The case's AI-entity extractions in the mapper's shape; empty when the read produced none. */
export function caseExtractions(parserCase: unknown): ParserExtraction[] {
  const extractions = (parserCase as { ai_entities?: { extractions?: CaseExtraction[] } } | null)?.ai_entities?.extractions;
  return (extractions ?? []).map((e) => ({
    documentId: String(e.documentId ?? ""),
    sourceFile: String(e.sourceFile ?? ""),
    element: e.element,
    values: e.values ?? [],
    // The reader's findings travel too: a TMPS cell holding #REF! is filed in
    // the workbook as withdrawn, so the sync leaves it blank.
    exceptions: (e.exceptions ?? []).map((note) => String(note ?? "")),
  }));
}

/** The AI-entity path of a case, placed under the form's sector and size. */
export function injectCase(
  parserCase: unknown,
  form: { sector: string; size: string; vocabulary?: VocabularyDecisions },
): ParserToWorkbookResult | null {
  const extractions = caseExtractions(parserCase);
  if (!extractions.length) return null;
  return parserExtractionsToWorkbook(extractions, {
    sectorCode: form.sector || "Generic",
    scorecardType: form.size || "Generic",
    vocabulary: form.vocabulary,
  });
}

export interface CreateForm {
  companyName: string;
  sector: string;
  size: string;
  yearEnd: string;
  subSector?: string;
}

type Sections = Record<string, { rows?: unknown[]; meta?: Record<string, unknown> }>;

/**
 * The sections a company is built from, before reconciliation: the
 * deterministic and AI-entity shapes merged (AI rows replace legacy rows where
 * both read a section), with the form's company profile stamped on.
 */
export function assembleCreateSections(
  legacySections: Sections | undefined,
  injected: ParserToWorkbookResult | null,
  form: CreateForm,
): Sections {
  const sections: Sections = mergeWorkbookSections(legacySections ?? {}, injected ? toWorkbookSections(injected) : {});
  const companyMeta: Record<string, unknown> = {
    companyName: form.companyName.trim(),
    industrySector: SECTOR_TO_WORKBOOK[form.sector] ?? "Generic",
    scorecardType: form.size,
    financialYearEnd: form.yearEnd,
  };
  if (form.sector === "CONSTRUCTION" && form.subSector) companyMeta.constructionSubSector = form.subSector;
  if (form.sector === "FSC" && form.subSector) companyMeta.fscSubSector = form.subSector;
  sections["company-information"] = {
    ...(sections["company-information"] ?? {}),
    meta: { ...(sections["company-information"]?.meta ?? {}), ...companyMeta },
  };
  return sections;
}

/**
 * The sector and year end a form starting EMPTY ends up with after a read: the
 * workbook's, which is what the create form fills in. Used where there is no
 * person to pick (the gate); a form already holding values asks instead (see
 * undecidedMismatches) — `undecided` is what it would be asking.
 */
export function formAfterRead(
  parserCase: unknown,
  form: { sector: string; yearEnd: string },
): { sector: string; yearEnd: string; undecided: FormFactMismatch[] } {
  const facts = workbookFormFacts(parserCase);
  const sector = form.sector || facts.sector || "";
  const yearEnd = form.yearEnd || facts.yearEnd || "";
  return { sector, yearEnd, undecided: undecidedMismatches(formFactMismatches({ sector, yearEnd }, facts), new Set()) };
}
