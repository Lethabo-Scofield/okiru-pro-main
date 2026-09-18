/**
 * The Information Request workbook a client fills in, built for one sector.
 *
 * The product asked people to upload "the downloaded template" and then never
 * offered one to download. So the only file anybody could bring was their own
 * information-gathering workbook, whose headers the bulk-upload parsers did not
 * recognise — the upload button that "does nothing" is that gap, seen from the
 * user's side.
 *
 * It is generated rather than shipped as a file, for two reasons. The sector
 * changes the questions — FSC Banks answer Access to Financial Services, ICT
 * has an SED column nobody else has, Construction and AgriBEE each add their
 * own — and we hold exactly one static workbook, filled in for a Transport
 * client. And a generated file is built from the SAME column definitions the
 * importer reads, so the template cannot drift out of step with what the
 * product accepts. `informationRequestTemplate.test.ts` holds that to be true
 * by importing what this writes.
 *
 * Sheet names are the ones `SHEET_SECTION_HINTS` already recognises, so a
 * filled-in template also imports through "Import Excel workbook" whole.
 */
import * as XLSX from "xlsx";
import {
  getOrderedSectionKeysForSector,
  getSection,
  type ColumnDef,
  type SectionDef,
} from "@/components/workbook/sections";

export interface TemplateSpec {
  /** RCOGP | ICT | FSC | AGRI | TRANSPORT | CONSTRUCTION */
  sectorCode: string;
  /** Generic | QSE | Contractor | BEP — narrows a few sections when known. */
  scorecardType?: string;
  /** FSC only: Others | Banks | Long-Term Insurers | Short-Term Insurers. */
  fscSubSector?: string;
  /** Written onto the cover so two clients' files are told apart on sight. */
  companyName?: string;
}

export interface TemplateChoice {
  id: string;
  label: string;
  spec: TemplateSpec;
}

/**
 * What a consultant picks from. FSC is four entries rather than one because the
 * sub-sector decides whether the workbook carries an AFS pillar at all, and
 * which indicators it holds — a Banks template and a Short-Term Insurer
 * template are different documents.
 */
export const TEMPLATE_CHOICES: TemplateChoice[] = [
  { id: "RCOGP", label: "Generic Codes (RCOGP)", spec: { sectorCode: "RCOGP" } },
  { id: "ICT", label: "ICT", spec: { sectorCode: "ICT" } },
  { id: "TRANSPORT", label: "Transport (Road Freight)", spec: { sectorCode: "TRANSPORT" } },
  { id: "CONSTRUCTION", label: "Construction", spec: { sectorCode: "CONSTRUCTION" } },
  { id: "AGRI", label: "AgriBEE", spec: { sectorCode: "AGRI" } },
  { id: "FSC", label: "FSC — other financial services", spec: { sectorCode: "FSC", fscSubSector: "Others" } },
  { id: "FSC_BANKS", label: "FSC — Banks", spec: { sectorCode: "FSC", fscSubSector: "Banks" } },
  { id: "FSC_LTI", label: "FSC — Long-Term Insurers", spec: { sectorCode: "FSC", fscSubSector: "Long-Term Insurers" } },
  { id: "FSC_STI", label: "FSC — Short-Term Insurers", spec: { sectorCode: "FSC", fscSubSector: "Short-Term Insurers" } },
];

/**
 * Sheet names, chosen to match the hints in `workbookExcelNormalizer`'s
 * `SHEET_SECTION_HINTS` exactly. Renaming one here silently stops that section
 * importing, which is what the round-trip test guards.
 */
const SHEET_NAMES: Record<string, string> = {
  "company-information": "Company Information",
  "financial-information": "Financials",
  "afs-additions": "AFS Additions",
  ownership: "Ownership",
  "management-control": "Management Control",
  "skills-development": "Skills Development",
  procurement: "Procurement",
  esd: "Enterprise Development",
  sed: "Social Development",
};

/** Excel's own limit, and it truncates silently rather than telling you. */
const MAX_SHEET_NAME = 31;

const REQUIRED_MARK = " *";

function headerFor(col: ColumnDef): string {
  return col.required ? `${col.label}${REQUIRED_MARK}` : col.label;
}

function columnWidths(columns: ColumnDef[]): Array<{ wch: number }> {
  return columns.map((c) => ({
    wch: Math.min(Math.max(Math.round((c.width ?? 130) / 7), 12), 40),
  }));
}

/**
 * A register sheet: one title row, one header row, then the client's rows.
 *
 * The title row holds a single cell on purpose. The importer looks for the
 * first row carrying two or more values when it cannot recognise a header, so a
 * two-cell title would be read as the header and the real one skipped.
 */
function registerSheet(section: SectionDef, columns: ColumnDef[]): XLSX.WorkSheet {
  const headers = columns.map(headerFor);
  const aoa: unknown[][] = [
    [section.label, ...Array(Math.max(headers.length - 1, 0)).fill("")],
    headers,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (headers.length > 1) {
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  }
  ws["!cols"] = columnWidths(columns);
  ws["!freeze"] = { xSplit: "0", ySplit: "2", topLeftCell: "A3" };
  return ws;
}

/** A single-record sheet: the field down column A, the answer in column B. */
function formSheet(section: SectionDef, fields: ColumnDef[]): XLSX.WorkSheet {
  const aoa: unknown[][] = [
    [section.label, ""],
    ["Field", "Value"],
    ...fields.map((f) => [headerFor(f), ""]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 46 }, { wch: 34 }];
  return ws;
}

/**
 * A hybrid section — Skills Development, and SED under FSC — asks a few
 * questions about the period and then wants a register. Both live on one sheet,
 * questions first, because that is the shape the importer reads: it scans
 * column A for field names and hunts the register's header row separately.
 */
function hybridSheet(section: SectionDef, fields: ColumnDef[], columns: ColumnDef[]): XLSX.WorkSheet {
  const headers = columns.map(headerFor);
  const width = Math.max(headers.length, 2);
  const pad = (row: unknown[]): unknown[] => [
    ...row,
    ...Array(Math.max(width - row.length, 0)).fill(""),
  ];
  const aoa: unknown[][] = [
    pad([section.label]),
    ...fields.map((f) => pad([headerFor(f), ""])),
    pad([]),
    pad([section.gridLabel ?? "Entries"]),
    headers,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columnWidths(columns);
  return ws;
}

function instructionsSheet(spec: TemplateSpec, sheetPlan: Array<{ sheet: string; about: string }>): XLSX.WorkSheet {
  const sector = TEMPLATE_CHOICES.find(
    (c) => c.spec.sectorCode === spec.sectorCode && (c.spec.fscSubSector ?? "") === (spec.fscSubSector ?? ""),
  );
  const aoa: unknown[][] = [
    ["B-BBEE Information Request"],
    [sector?.label ?? spec.sectorCode],
    ...(spec.companyName ? [[spec.companyName]] : []),
    [],
    ["How to complete this workbook"],
    ["1.", "Fill in one row per record on each register sheet, under the headings."],
    ["2.", "A heading ending in * is required. A row missing one is reported when you import."],
    ["3.", "Dates are dd/mm/yyyy. Amounts are numbers in Rands — no R, no thousands separators."],
    ["4.", "Yes/No columns take Yes or No."],
    ["5.", "Leave a column blank when it does not apply. Do not delete it."],
    ["6.", "Do not rename the sheets or edit the heading row — that is how the import finds your data."],
    ["7.", "Allowed values for every dropdown column are on the Lists sheet."],
    [],
    ["This workbook's sheets"],
    ["Sheet", "What it holds"],
    ...sheetPlan.map((s) => [s.sheet, s.about]),
    [],
    ["Sector", spec.sectorCode],
    ...(spec.fscSubSector ? [["FSC sub-sector", spec.fscSubSector]] : []),
    ...(spec.scorecardType ? [["Scorecard type", spec.scorecardType]] : []),
    ["Generated", new Date().toISOString().slice(0, 10)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, { wch: 92 }];
  return ws;
}

/**
 * Every dropdown column's allowed values, in one place.
 *
 * SheetJS cannot write Excel data validation, so the choices cannot be attached
 * to the cells themselves. Listing them beats leaving someone to guess and have
 * the import reject the row later.
 */
function listsSheet(entries: Array<{ sheet: string; column: string; options: string[] }>): XLSX.WorkSheet {
  const aoa: unknown[][] = [
    ["Allowed values"],
    ["Sheet", "Column", "Enter one of"],
    ...entries.map((e) => [e.sheet, e.column, e.options.join(" · ")]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 24 }, { wch: 34 }, { wch: 96 }];
  return ws;
}

export function buildInformationRequestTemplate(spec: TemplateSpec): XLSX.WorkBook {
  const keys = getOrderedSectionKeysForSector(spec.sectorCode, spec.fscSubSector);
  const wb = XLSX.utils.book_new();

  const sheetPlan: Array<{ sheet: string; about: string }> = [];
  const lists: Array<{ sheet: string; column: string; options: string[] }> = [];
  const built: Array<{ name: string; ws: XLSX.WorkSheet }> = [];

  for (const key of keys) {
    const section = getSection(key, spec.sectorCode, spec.scorecardType, spec.fscSubSector);
    if (!section || section.enabled === false) continue;

    const columns = section.columns ?? [];
    const fields = (section.meta ?? []).filter((f) => !f.readOnly);
    if (columns.length === 0 && fields.length === 0) continue;

    const name = (SHEET_NAMES[key] ?? section.label).slice(0, MAX_SHEET_NAME);
    const ws =
      columns.length > 0 && fields.length > 0
        ? hybridSheet(section, fields, columns)
        : columns.length > 0
          ? registerSheet(section, columns)
          : formSheet(section, fields);

    built.push({ name, ws });
    sheetPlan.push({ sheet: name, about: section.description });

    for (const col of [...fields, ...columns]) {
      if (col.type === "select" && col.options && col.options.length > 0) {
        lists.push({ sheet: name, column: col.label, options: [...col.options] });
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, instructionsSheet(spec, sheetPlan), "Instructions");
  for (const { name, ws } of built) XLSX.utils.book_append_sheet(wb, ws, name);
  if (lists.length > 0) XLSX.utils.book_append_sheet(wb, listsSheet(lists), "Lists");

  return wb;
}

/** `B-BBEE Information Request - FSC Banks.xlsx`, safe on every filesystem. */
export function templateFileName(spec: TemplateSpec): string {
  const choice = TEMPLATE_CHOICES.find(
    (c) => c.spec.sectorCode === spec.sectorCode && (c.spec.fscSubSector ?? "") === (spec.fscSubSector ?? ""),
  );
  const parts = [choice?.label ?? spec.sectorCode];
  if (spec.companyName) parts.unshift(spec.companyName);
  const suffix = parts.join(" - ").replace(/[^\w \-.()]+/g, " ").replace(/\s+/g, " ").trim();
  return `B-BBEE Information Request - ${suffix}.xlsx`.slice(0, 120);
}

export function downloadInformationRequestTemplate(spec: TemplateSpec): void {
  XLSX.writeFile(buildInformationRequestTemplate(spec), templateFileName(spec));
}

/**
 * One section's sheet on its own, for a pillar's bulk upload.
 *
 * Same headers as the full workbook's matching sheet, so a row filled in here
 * imports through either door.
 */
export function buildSectionTemplate(
  sectionKey: string,
  spec: TemplateSpec,
): { workbook: XLSX.WorkBook; fileName: string } | null {
  const section = getSection(sectionKey, spec.sectorCode, spec.scorecardType, spec.fscSubSector);
  if (!section) return null;

  const columns = section.columns ?? [];
  const fields = (section.meta ?? []).filter((f) => !f.readOnly);
  if (columns.length === 0 && fields.length === 0) return null;

  const name = (SHEET_NAMES[sectionKey] ?? section.label).slice(0, MAX_SHEET_NAME);
  const ws =
    columns.length > 0
      ? registerSheet(section, columns)
      : formSheet(section, fields);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name);

  const lists = columns
    .filter((c) => c.type === "select" && c.options?.length)
    .map((c) => ({ sheet: name, column: c.label, options: [...(c.options ?? [])] }));
  if (lists.length > 0) XLSX.utils.book_append_sheet(wb, listsSheet(lists), "Lists");

  const safe = `${section.label}`.replace(/[^\w \-.()]+/g, " ").replace(/\s+/g, " ").trim();
  return { workbook: wb, fileName: `${safe} template.xlsx` };
}

export function downloadSectionTemplate(sectionKey: string, spec: TemplateSpec): void {
  const built = buildSectionTemplate(sectionKey, spec);
  if (!built) return;
  XLSX.writeFile(built.workbook, built.fileName);
}
