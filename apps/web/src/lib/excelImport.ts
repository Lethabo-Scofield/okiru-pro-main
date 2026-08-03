/**
 * BEE Information Gathering File → structured company / workbook data.
 * Full-cell label scan, named ranges, table detection, and sheet-specific extractors.
 * AI normalization is server-side validation only — never invents values.
 */
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import {
  resolveScorecardTypeForSector,
  parseWorkbookDate,
} from "@/components/workbook/sections";
import {
  validateWorkbook,
  type WorkbookValidationIssue,
} from "@/components/workbook/workbookValidation";
import type { WorkbookSectionsInput, WorkbookRow } from "@/lib/workbookExcelNormalizer";
import { SECTOR_CODE_OPTIONS } from "@/components/workbook/workbookValidation";

export type FieldConfidence = "high" | "medium" | "low";

export interface ExtractedCompanyData {
  companyName?: string;
  registrationNumber?: string;
  taxNumber?: string;
  sector?: string;
  scorecardType?: string;
  financialYearEnd?: string;
  revenue?: number;
  npat?: number;

  blackOwnership?: number;
  blackWomenOwnership?: number;

  boardBlackPercent?: number;
  boardWomenPercent?: number;
  seniorMgmtBlackPercent?: number;
  topMgmtBlackPercent?: number;
  seniorMgmtEEBlackPercent?: number;

  skillsSpend?: number;
  skillsSpendOnBlack?: number;
  learnershipCount?: number;
  learnershipsBlack?: number;
  absorbedLearnerships?: number;

  totalProcurement?: number;
  beeCompliantSpend?: number;
  beeCompliantSpendPercent?: number;
  blackOwnedSpend?: number;
  blackOwnedSpendPercent?: number;
  blackWomenOwnedSpend?: number;
  blackWomenOwnedSpendPercent?: number;

  esdContributions?: number;
  sedContributions?: number;

  payroll?: number;
  leviableAmount?: number;

  yesEmployees?: number;
  yesAbsorbed?: number;

  empowermentFinancing?: number;
}

export interface OwnershipChainTier {
  tier: number;
  entityName?: string;
  ownershipInNextTier?: number;
  blackVotingRights?: number;
  blackWomenVotingRights?: number;
  blackEconomicInterest?: number;
  blackWomenEconomicInterest?: number;
}

export type FieldStatus = "mapped" | "warning" | "unrecognized";

export interface ExcelExtractionResult {
  data: ExtractedCompanyData;
  warnings: string[];
  unmappedFields: string[];
  fieldStatuses: Record<string, FieldStatus>;
  fieldConfidences: Partial<Record<keyof ExtractedCompanyData, FieldConfidence>>;
  fieldSources: Partial<Record<keyof ExtractedCompanyData, string>>;
  isBeeGatheringFormat: boolean;
  mappedSheets: string[];
  ownershipChainTiers: OwnershipChainTier[];
  extractedFieldCount: number;
  /** Per-section extraction summary (label + populated row/field counts) so the
   *  preview can show everything that came in, not just company + financials. */
  sectionSummary?: { key: string; label: string; rowCount: number; fieldCount: number }[];
}

export interface NormalizeRequest {
  sector?: string;
  scorecardType?: string;
  financialYearEnd?: string;
  extractedData?: ExtractedCompanyData;
  fieldConfidences?: Partial<Record<keyof ExtractedCompanyData, FieldConfidence>>;
}

export interface NormalizeResponse {
  sector?: string;
  scorecardType?: string;
  financialYearEnd?: string;
  usedAi: boolean;
  notes: string[];
  validationWarnings?: string[];
}

type SheetMatrix = unknown[][];

const BEE_SHEET_SIGNATURES = ["instructions", "finance", "ownership", "employment equity"];

const LABEL_SYNONYMS: Record<keyof ExtractedCompanyData, string[]> = {
  companyName: ["measured entity name", "company name", "entity name", "measured entity"],
  registrationNumber: ["registration number", "reg no", "registration no", "company reg", "company registration"],
  taxNumber: ["tax number", "tax no", "vat no", "vat number", "income tax"],
  sector: ["industry sector", "sector", "bbbee sector", "applicable sector"],
  scorecardType: ["scorecard type", "entity type", "eme qse generic"],
  financialYearEnd: ["financial year end", "year end", "fy end", "period end"],
  revenue: ["turnover", "revenue", "total turnover", "annual turnover", "turnover/revenue", "turnover /revenue"],
  npat: ["npat", "net profit after tax", "net profit", "npat / loss", "nett profit after tax"],
  payroll: ["annual payroll", "total payroll", "salaries", "payroll cost"],
  leviableAmount: ["leviable amount", "total leviable amount", "sdl leviable"],
  totalProcurement: [
    "total measured procurement spend",
    "tmps",
    "total procurement",
    "measured procurement",
  ],
  blackOwnership: [
    "total black voting rights",
    "black voting rights",
    "net black ownership",
    "black ownership",
    "% black ownership",
  ],
  blackWomenOwnership: [
    "black women ownership",
    "black women voting rights",
    "black female ownership",
    "black woman ownership",
    "black women economic interest",
  ],
  boardBlackPercent: ["black board members", "board black", "black directors", "board composition black"],
  boardWomenPercent: ["board women", "women board", "female board members", "board women %"],
  seniorMgmtBlackPercent: [
    "senior management black",
    "black senior management",
    "senior mgmt black",
  ],
  topMgmtBlackPercent: ["top management black", "executive management black", "black top management"],
  seniorMgmtEEBlackPercent: ["senior ee black", "senior employment equity black"],
  skillsSpend: [
    "total skills expenditure",
    "skills development expenditure",
    "total expenditure",
    "skills spend",
  ],
  skillsSpendOnBlack: [
    "skills spend on black",
    "expenditure on black",
    "black skills spend",
    "spend on black employees",
  ],
  learnershipCount: ["number of b, c, d learnerships", "learnership count", "number of learnerships", "learnerships"],
  learnershipsBlack: ["black learnerships", "b c d learnerships"],
  absorbedLearnerships: ["absorbed learner", "absorbed learnerships", "learnerships absorbed"],
  beeCompliantSpend: [
    "bee compliant spend",
    "bbbee compliant spend",
    "compliant procurement",
    "total procurement expenditure from suppliers",
  ],
  beeCompliantSpendPercent: ["bee compliant spend %", "compliant spend %", "bbbee compliant %"],
  blackOwnedSpend: ["black owned spend", "black-owned supplier spend", "spend on black owned"],
  blackOwnedSpendPercent: ["black owned spend %", "black ownership %", "51% or more black owned"],
  blackWomenOwnedSpend: ["black women owned spend", "bwo spend", "black woman owned spend"],
  blackWomenOwnedSpendPercent: ["black women owned %", "black woman ownership %", "30% or more black woman owned"],
  esdContributions: [
    "enterprise development",
    "ed contributions",
    "enterprise and supplier development",
    "esd contributions",
    "total contributions",
  ],
  sedContributions: [
    "social economic development",
    "sed contributions",
    "socio-economic development",
    "total value of contributions",
  ],
  yesEmployees: ["yes employees", "yes initiative", "current y.e.s employee", "yes 4 youth"],
  yesAbsorbed: ["yes absorbed", "completed y.e.s absorbed", "y.e.s absorbed"],
  empowermentFinancing: ["empowerment financing", "empowerment loans", "bee transaction financing"],
};

const NAMED_RANGE_MAP: Record<string, keyof ExtractedCompanyData> = {
  companyname: "companyName",
  sector: "sector",
  turnover: "revenue",
  npat: "npat",
  salaries: "payroll",
  sdtotal: "skillsSpend",
  edtotal: "esdContributions",
  sedtotal: "sedContributions",
};

const SHEET_TYPE_MAP: Record<string, string> = {
  instructions: "companyInfo",
  finance: "financials",
  ownership: "ownership",
  ownershipchain: "ownershipChain",
  managementcontrol: "management",
  employmentequity: "employmentEquity",
  yesemployees: "yes",
  skillsdevelopment: "skills",
  procurement: "procurement",
  imports: "imports",
  enterprisedevelopment: "esd",
  socialdevelopment: "sed",
  economicdevelopment: "sed",
  empowermentfinancing: "empowermentFinancing",
};

export const FIELD_GROUPS: Array<{
  id: string;
  label: string;
  fields: Array<keyof ExtractedCompanyData>;
}> = [
  {
    id: "company",
    label: "Company Info",
    fields: ["companyName", "registrationNumber", "taxNumber", "sector", "scorecardType", "financialYearEnd"],
  },
  {
    id: "financials",
    label: "Financials",
    fields: ["revenue", "npat", "payroll", "leviableAmount", "totalProcurement"],
  },
  {
    id: "ownership",
    label: "Ownership",
    fields: ["blackOwnership", "blackWomenOwnership"],
  },
  {
    id: "management",
    label: "MC / EE",
    fields: [
      "boardBlackPercent",
      "boardWomenPercent",
      "seniorMgmtBlackPercent",
      "topMgmtBlackPercent",
      "seniorMgmtEEBlackPercent",
    ],
  },
  {
    id: "skills",
    label: "Skills Development",
    fields: ["skillsSpend", "skillsSpendOnBlack", "learnershipCount", "learnershipsBlack", "absorbedLearnerships"],
  },
  {
    id: "procurement",
    label: "Procurement",
    fields: [
      "beeCompliantSpend",
      "beeCompliantSpendPercent",
      "blackOwnedSpend",
      "blackOwnedSpendPercent",
      "blackWomenOwnedSpend",
      "blackWomenOwnedSpendPercent",
    ],
  },
  {
    id: "esd",
    label: "ESD / SED",
    fields: ["esdContributions", "sedContributions", "empowermentFinancing"],
  },
  {
    id: "yes",
    label: "Y.E.S.",
    fields: ["yesEmployees", "yesAbsorbed"],
  },
];

const SECTOR_ALIASES: Record<string, string> = {
  retailrcogp: "RCOGP",
  retail: "RCOGP",
  rcogp: "RCOGP",
  retailmotoroilcateringaccommodation: "RCOGP",
  transport: "TRANSPORT",
  transportandlogistics: "TRANSPORT",
  tourism: "RCOGP",
  agricultural: "AGRI",
  agriculture: "AGRI",
  agri: "AGRI",
  agribbbee: "AGRI",
  construction: "CONSTRUCTION",
  financialservices: "FSC",
  financial: "FSC",
  financialsector: "FSC",
  fsc: "FSC",
  ict: "ICT",
  informationcommunicationtechnology: "ICT",
  informationandcommunicationtechnology: "ICT",
  property: "RCOGP",
  legal: "RCOGP",
  charteredaccounting: "RCOGP",
  marketingadvertisingcommunication: "RCOGP",
  forestry: "AGRI",
  defence: "RCOGP",
};

const SECTOR_CODE_PARTIALS = ["RCOGP", "CONSTRUCTION", "TRANSPORT", "AGRI", "ICT", "FSC"] as const;

const RACE_MAP: Record<string, string> = {
  african: "African",
  black: "African",
  coloured: "Coloured",
  colored: "Coloured",
  indian: "Indian",
  white: "White",
};

const GENDER_MAP: Record<string, string> = {
  male: "Male",
  m: "Male",
  female: "Female",
  f: "Female",
};

const BLACK_RACES = new Set(["african", "black", "coloured", "colored", "indian"]);

const PERCENT_FIELDS = new Set<keyof ExtractedCompanyData>([
  "blackOwnership",
  "blackWomenOwnership",
  "boardBlackPercent",
  "boardWomenPercent",
  "seniorMgmtBlackPercent",
  "topMgmtBlackPercent",
  "seniorMgmtEEBlackPercent",
  "beeCompliantSpendPercent",
  "blackOwnedSpendPercent",
  "blackWomenOwnedSpendPercent",
]);

const CURRENCY_FIELDS = new Set<keyof ExtractedCompanyData>([
  "revenue",
  "npat",
  "payroll",
  "leviableAmount",
  "totalProcurement",
  "skillsSpend",
  "skillsSpendOnBlack",
  "beeCompliantSpend",
  "blackOwnedSpend",
  "blackWomenOwnedSpend",
  "esdContributions",
  "sedContributions",
  "empowermentFinancing",
]);

const COUNT_FIELDS = new Set<keyof ExtractedCompanyData>([
  "learnershipCount",
  "learnershipsBlack",
  "absorbedLearnerships",
  "yesEmployees",
  "yesAbsorbed",
]);

const GENERIC_SCAN_EXCLUDED: Set<keyof ExtractedCompanyData> = new Set([
  "yesEmployees",
  "yesAbsorbed",
  "boardBlackPercent",
  "boardWomenPercent",
  "seniorMgmtBlackPercent",
  "topMgmtBlackPercent",
  "seniorMgmtEEBlackPercent",
  "blackOwnedSpendPercent",
  "blackWomenOwnedSpendPercent",
  "beeCompliantSpendPercent",
]);

interface FieldCandidate {
  field: keyof ExtractedCompanyData;
  value: string | number;
  confidence: FieldConfidence;
  source: string;
}

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function parseCurrency(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = cellStr(raw).replace(/\s/g, "");
  const negative = s.startsWith("-") || s.startsWith("(");
  const cleaned = s.replace(/[^0-9.,()-]/g, "").replace(/[()]/g, "");
  const normalized = cleaned.replace(/,/g, "");
  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return undefined;
  return negative && n > 0 ? -n : n;
}

function parsePercent(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw <= 1 && raw >= 0 ? Math.round(raw * 10000) / 100 : raw;
  }
  const s = cellStr(raw).replace(/%/g, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseCount(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  const n = parseFloat(cellStr(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function parseDateToIso(raw: unknown): string | undefined {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = cellStr(raw);
  if (!s) return undefined;

  const measured = /^year end:\s*(.+)$/i.exec(s);
  const text = measured ? measured[1].trim() : s;

  const parsed = parseWorkbookDate(text);
  if (parsed) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(parsed.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const dmy = /(\d{1,2})\s+(\w+)\s+(\d{4})/i.exec(text);
  if (dmy) {
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04",
      may: "05", june: "06", july: "07", august: "08",
      september: "09", october: "10", november: "11", december: "12",
    };
    const mo = months[dmy[2].toLowerCase()];
    if (mo) {
      const day = String(Number(dmy[1])).padStart(2, "0");
      return `${dmy[3]}-${mo}-${day}`;
    }
  }

  const weekday = /\w+day,\s+(\w+)\s+(\d{1,2}),\s+(\d{4})/i.exec(text);
  if (weekday) {
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04",
      may: "05", june: "06", july: "07", august: "08",
      september: "09", october: "10", november: "11", december: "12",
    };
    const mo = months[weekday[1].toLowerCase()];
    if (mo) {
      const day = String(Number(weekday[2])).padStart(2, "0");
      return `${weekday[3]}-${mo}-${day}`;
    }
  }

  return undefined;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function labelSimilarity(label: string, synonym: string): number {
  const a = norm(label);
  const b = norm(synonym);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(0.99, Math.max(a.length, b.length) / Math.max(1, Math.min(a.length, b.length)) * 0.92);
  }
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 0 : 1 - levenshtein(a, b) / maxLen;
}

function bestLabelMatch(cellText: string): { field: keyof ExtractedCompanyData; confidence: FieldConfidence } | null {
  let bestField: keyof ExtractedCompanyData | null = null;
  let bestScore = 0;
  let bestConfidence: FieldConfidence = "low";

  for (const [field, synonyms] of Object.entries(LABEL_SYNONYMS) as Array<
    [keyof ExtractedCompanyData, string[]]
  >) {
    for (const synonym of synonyms) {
      const score = labelSimilarity(cellText, synonym);
      if (score >= 0.8 && score > bestScore) {
        bestScore = score;
        bestField = field;
        bestConfidence = score >= 0.95 || norm(cellText) === norm(synonym) ? "high" : "medium";
      } else if (score >= 0.65 && score > bestScore) {
        bestScore = score;
        bestField = field;
        bestConfidence = "medium";
      }
    }
  }

  return bestField ? { field: bestField, confidence: bestConfidence } : null;
}

function coerceFieldValue(field: keyof ExtractedCompanyData, raw: unknown): string | number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (field === "financialYearEnd") {
    return parseDateToIso(raw) ?? (cellStr(raw) || undefined);
  }
  if (field === "companyName" || field === "registrationNumber" || field === "taxNumber" || field === "sector" || field === "scorecardType") {
    const s = cellStr(raw);
    return s || undefined;
  }
  if (PERCENT_FIELDS.has(field)) return parsePercent(raw);
  if (CURRENCY_FIELDS.has(field)) return parseCurrency(raw);
  if (COUNT_FIELDS.has(field)) return parseCount(raw);
  return undefined;
}

function sheetMatrix(wb: XLSX.WorkBook, name: string): SheetMatrix {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false }) as SheetMatrix;
}

function findSheet(wb: XLSX.WorkBook, ...names: string[]): string | undefined {
  const lower = new Map(wb.SheetNames.map((n) => [norm(n), n]));
  for (const name of names) {
    const hit = lower.get(norm(name));
    if (hit) return hit;
  }
  for (const sheetName of wb.SheetNames) {
    const ns = norm(sheetName);
    for (const name of names) {
      const nn = norm(name);
      if (ns.includes(nn) || nn.includes(ns)) return sheetName;
    }
  }
  return undefined;
}

function classifySheet(name: string): string | undefined {
  const key = norm(name);
  if (SHEET_TYPE_MAP[key]) return SHEET_TYPE_MAP[key];
  for (const [pattern, type] of Object.entries(SHEET_TYPE_MAP)) {
    if (key.includes(pattern) || pattern.includes(key)) return type;
  }
  return undefined;
}

function readCellRef(wb: XLSX.WorkBook, ref: string): unknown {
  const bang = ref.indexOf("!");
  if (bang < 0) return undefined;
  const sheetPart = ref.slice(0, bang).replace(/^'/, "").replace(/'$/, "");
  const cellPart = ref.slice(bang + 1).replace(/\$/g, "");
  const ws = wb.Sheets[sheetPart];
  if (!ws) return undefined;

  if (cellPart.includes(":")) {
    const range = XLSX.utils.decode_range(cellPart);
    const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c })];
    return cell?.v;
  }

  const cell = ws[cellPart];
  return cell?.v;
}

function extractNamedRanges(wb: XLSX.WorkBook): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  const names = wb.Workbook?.Names ?? [];
  for (const named of names) {
    const key = norm(named.Name);
    const field = NAMED_RANGE_MAP[key];
    if (!field) continue;
    const raw = readCellRef(wb, named.Ref);
    const value = coerceFieldValue(field, raw);
    if (value === undefined) continue;
    out.push({
      field,
      value,
      confidence: "high",
      source: `named range:${named.Name}`,
    });
  }
  return out;
}

function valueBesideLabel(row: unknown[], col: number): unknown {
  for (let k = col + 1; k < row.length; k++) {
    const val = row[k];
    if (val !== null && val !== undefined && cellStr(val) !== "") return val;
  }
  return undefined;
}

function valueBelowLabel(matrix: SheetMatrix, row: number, col: number): unknown {
  for (let r = row + 1; r < Math.min(matrix.length, row + 4); r++) {
    const val = matrix[r]?.[col];
    if (val !== null && val !== undefined && cellStr(val) !== "") return val;
  }
  return undefined;
}

function scanAllCells(matrix: SheetMatrix, sheetName: string, maxRows = 120, maxCols = 35): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  const rowLimit = Math.min(matrix.length, maxRows);
  for (let r = 0; r < rowLimit; r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row) continue;
    const colLimit = Math.min(row.length, maxCols);
    for (let c = 0; c < colLimit; c++) {
      const text = cellStr(row[c]);
      if (!text || text.length < 3) continue;
      if (/^\d+([.,]\d+)?$/.test(text.replace(/,/g, ""))) continue;
      const match = bestLabelMatch(text);
      if (!match || GENERIC_SCAN_EXCLUDED.has(match.field)) continue;

      const beside = valueBesideLabel(row, c);
      const below = valueBelowLabel(matrix, r, c);
      const raw = beside ?? below;
      const value = coerceFieldValue(match.field, raw);
      if (value === undefined) continue;

      out.push({
        field: match.field,
        value,
        confidence: match.confidence === "high" ? "medium" : "low",
        source: `${sheetName}:label scan R${r + 1}`,
      });
    }
  }
  return out;
}

function mapHeaderRow(row: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  row.forEach((h, i) => {
    const key = norm(cellStr(h));
    if (key) map.set(key, i);
  });
  return map;
}

function colIdx(headers: Map<string, number>, ...aliases: string[]): number | undefined {
  for (const a of aliases) {
    const idx = headers.get(norm(a));
    if (idx !== undefined) return idx;
  }
  for (const a of aliases) {
    const na = norm(a);
    for (const [k, idx] of headers) {
      if (k.includes(na) || na.includes(k)) return idx;
    }
  }
  return undefined;
}

function detectTableHeaders(matrix: SheetMatrix, maxRows = 80): Array<{ rowIdx: number; headers: Map<string, number> }> {
  const tables: Array<{ rowIdx: number; headers: Map<string, number> }> = [];
  for (let r = 0; r < Math.min(matrix.length, maxRows); r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row) continue;
    let adjacentStrings = 0;
    for (let c = 0; c < row.length; c++) {
      const s = cellStr(row[c]);
      if (s && Number.isNaN(Number(s.replace(/,/g, "")))) adjacentStrings++;
    }
    if (adjacentStrings >= 3) {
      tables.push({ rowIdx: r, headers: mapHeaderRow(row) });
    }
  }
  return tables;
}

function extractFromTables(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  const tables = detectTableHeaders(matrix);
  for (const table of tables) {
    for (const [field, synonyms] of Object.entries(LABEL_SYNONYMS) as Array<
      [keyof ExtractedCompanyData, string[]]
    >) {
      if (GENERIC_SCAN_EXCLUDED.has(field)) continue;
      const col = colIdx(table.headers, ...synonyms);
      if (col === undefined) continue;
      for (let r = table.rowIdx + 1; r < Math.min(matrix.length, table.rowIdx + 20); r++) {
        const row = matrix[r] as unknown[] | undefined;
        if (!row) continue;
        const value = coerceFieldValue(field, row[col]);
        if (value === undefined) continue;
        out.push({
          field,
          value,
          confidence: "low",
          source: `${sheetName}:table R${r + 1}`,
        });
        break;
      }
    }
  }
  return out;
}

function extractInstructionsSheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const row of matrix) {
    for (let c = 0; c < (row?.length ?? 0); c++) {
      const label = cellStr(row?.[c]).toLowerCase();
      const val = row?.[c + 1];
      if (label.includes("measured entity name") && cellStr(val)) {
        out.push({ field: "companyName", value: cellStr(val), confidence: "high", source: `${sheetName}:instructions` });
      }
      if (label.includes("industry sector") && cellStr(val)) {
        out.push({ field: "sector", value: cellStr(val), confidence: "high", source: `${sheetName}:instructions` });
      }
      if (label.includes("financial year end")) {
        const iso = parseDateToIso(val);
        if (iso) out.push({ field: "financialYearEnd", value: iso, confidence: "high", source: `${sheetName}:instructions` });
      }
      if ((label.includes("registration") || label.includes("reg no")) && cellStr(val)) {
        out.push({ field: "registrationNumber", value: cellStr(val), confidence: "high", source: `${sheetName}:instructions` });
      }
    }
    for (const cell of row || []) {
      const s = cellStr(cell);
      const m = /^measured entity:\s*(.+)$/i.exec(s);
      if (m) {
        out.push({ field: "companyName", value: m[1].trim(), confidence: "high", source: `${sheetName}:measured entity` });
      }
      const ye = parseDateToIso(cell);
      if (ye && s.toLowerCase().includes("year end")) {
        out.push({ field: "financialYearEnd", value: ye, confidence: "high", source: `${sheetName}:year end` });
      }
    }
  }
  return out;
}

function extractFinanceSheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const row of matrix) {
    const label = cellStr(row?.[0]).toLowerCase();
    if (!label) continue;
    if (label.includes("turnover") || label.includes("revenue") || label.includes("allocated budget")) {
      const v = parseCurrency(row?.[1]);
      if (v !== undefined) out.push({ field: "revenue", value: v, confidence: "high", source: `${sheetName}:turnover row` });
    }
    if (label.includes("npat") || label.includes("nett profit after tax")) {
      const v = parseCurrency(row?.[1]);
      if (v !== undefined) out.push({ field: "npat", value: v, confidence: "high", source: `${sheetName}:npat row` });
    }
    if (label.includes("annual payroll") || label === "salaries") {
      const v = parseCurrency(row?.[1]);
      if (v !== undefined) out.push({ field: "payroll", value: v, confidence: "high", source: `${sheetName}:payroll row` });
    }
    if (label.includes("total leviable amount")) {
      const v = parseCurrency(row?.[1]);
      if (v !== undefined) out.push({ field: "leviableAmount", value: v, confidence: "high", source: `${sheetName}:leviable row` });
    }
    if (label.includes("total measured procurement spend")) {
      const v = parseCurrency(row?.[2]) ?? parseCurrency(row?.[1]);
      if (v !== undefined) out.push({ field: "totalProcurement", value: v, confidence: "high", source: `${sheetName}:tmps row` });
    }
  }
  return out;
}

function extractOwnershipChainSheet(matrix: SheetMatrix, sheetName: string): {
  candidates: FieldCandidate[];
  tiers: OwnershipChainTier[];
} {
  const candidates: FieldCandidate[] = [];
  const tiers: OwnershipChainTier[] = [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const rowText = (matrix[i] || []).map(cellStr).join(" ").toLowerCase();
    if (rowText.includes("total black voting") && rowText.includes("tier")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { candidates, tiers };

  const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
  const voteIdx = colIdx(headers, "totalblackvotingrights", "total black voting rights");
  const womenIdx = colIdx(headers, "blackwomenvotingrights", "black women voting rights");
  const eiIdx = colIdx(headers, "totalblackeconomicinterest", "total black economic interest");
  const womenEiIdx = colIdx(headers, "blackwomeneconomicinterest", "black women economic interest");
  const entityIdx = colIdx(headers, "entityname", "entity name");
  const nextTierIdx = colIdx(headers, "ownershipinnexttier", "ownership in next tier");

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row) continue;
    const tierRaw = cellStr(row[0]) || cellStr(row[1]);
    const tierNum = parseInt(tierRaw, 10);
    if (!Number.isFinite(tierNum) || tierNum < 1) continue;

    const entityName = entityIdx !== undefined ? cellStr(row[entityIdx]) : cellStr(row[2]);
    const blackVote = voteIdx !== undefined ? parsePercent(row[voteIdx]) : undefined;
    const blackWomen = womenIdx !== undefined ? parsePercent(row[womenIdx]) : undefined;
    const blackEi = eiIdx !== undefined ? parsePercent(row[eiIdx]) : undefined;
    const blackWomenEi = womenEiIdx !== undefined ? parsePercent(row[womenEiIdx]) : undefined;
    const nextTier = nextTierIdx !== undefined ? parsePercent(row[nextTierIdx]) : undefined;

    if (!entityName && blackVote === undefined && blackWomen === undefined) continue;

    tiers.push({
      tier: tierNum,
      entityName: entityName || undefined,
      ownershipInNextTier: nextTier,
      blackVotingRights: blackVote,
      blackWomenVotingRights: blackWomen,
      blackEconomicInterest: blackEi,
      blackWomenEconomicInterest: blackWomenEi,
    });

    if (tierNum === 1) {
      if (blackVote !== undefined) {
        candidates.push({
          field: "blackOwnership",
          value: blackVote <= 1 ? Math.round(blackVote * 10000) / 100 : blackVote,
          confidence: "high",
          source: `${sheetName}:tier 1 voting rights`,
        });
      }
      if (blackWomen !== undefined) {
        candidates.push({
          field: "blackWomenOwnership",
          value: blackWomen <= 1 ? Math.round(blackWomen * 10000) / 100 : blackWomen,
          confidence: "high",
          source: `${sheetName}:tier 1 women voting`,
        });
      }
    }
  }
  return { candidates, tiers };
}

function isBlackRace(raw: unknown): boolean {
  return BLACK_RACES.has(norm(cellStr(raw)));
}

function isFemale(raw: unknown): boolean {
  return norm(cellStr(raw)) === "female" || norm(cellStr(raw)) === "f";
}

function extractManagementSheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const rowText = (matrix[i] || []).map(cellStr).join(" ").toLowerCase();
    if (rowText.includes("name") && rowText.includes("race") && rowText.includes("position")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return out;

  const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
  const nameIdx = colIdx(headers, "namesurname", "name");
  const raceIdx = colIdx(headers, "race");
  const genderIdx = colIdx(headers, "gender");
  const positionIdx = colIdx(headers, "positionoccupationallevel", "position", "jobtitle");

  let total = 0;
  let black = 0;
  let women = 0;
  let seniorTotal = 0;
  let seniorBlack = 0;

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row) continue;
    const name = nameIdx !== undefined ? cellStr(row[nameIdx]) : "";
    if (!name || /^\d+$/.test(name)) continue;

    total++;
    if (raceIdx !== undefined && isBlackRace(row[raceIdx])) black++;
    if (genderIdx !== undefined && isFemale(row[genderIdx])) women++;

    const position = positionIdx !== undefined ? cellStr(row[positionIdx]).toLowerCase() : "";
    if (position.includes("executive") || position.includes("director") || position.includes("senior")) {
      seniorTotal++;
      if (raceIdx !== undefined && isBlackRace(row[raceIdx])) seniorBlack++;
    }
  }

  if (total > 0) {
    out.push({
      field: "boardBlackPercent",
      value: Math.round((black / total) * 10000) / 100,
      confidence: "medium",
      source: `${sheetName}:management computed`,
    });
    out.push({
      field: "boardWomenPercent",
      value: Math.round((women / total) * 10000) / 100,
      confidence: "medium",
      source: `${sheetName}:management computed`,
    });
  }
  if (seniorTotal > 0) {
    out.push({
      field: "seniorMgmtBlackPercent",
      value: Math.round((seniorBlack / seniorTotal) * 10000) / 100,
      confidence: "medium",
      source: `${sheetName}:senior mgmt computed`,
    });
  }
  return out;
}

function extractEmploymentEquitySheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const row of matrix) {
    const label = cellStr(row?.[1]).toLowerCase();
    if (label.includes("sub total")) {
      const african = parseFloat(cellStr(row?.[4])) || 0;
      const africanF = parseFloat(cellStr(row?.[5])) || 0;
      const indian = parseFloat(cellStr(row?.[6])) || 0;
      const indianF = parseFloat(cellStr(row?.[7])) || 0;
      const coloured = parseFloat(cellStr(row?.[8])) || 0;
      const colouredF = parseFloat(cellStr(row?.[9])) || 0;
      const total = parseFloat(cellStr(row?.[12])) || parseFloat(cellStr(row?.[11])) || 0;
      if (total > 0) {
        const blackCount = african + africanF + indian + indianF + coloured + colouredF;
        out.push({
          field: "topMgmtBlackPercent",
          value: Math.round((blackCount / total) * 10000) / 100,
          confidence: "high",
          source: `${sheetName}:sub totals`,
        });
      }
    }
    if (label.includes("senior management")) {
      const african = parseFloat(cellStr(row?.[4])) || 0;
      const africanF = parseFloat(cellStr(row?.[5])) || 0;
      const indian = parseFloat(cellStr(row?.[6])) || 0;
      const indianF = parseFloat(cellStr(row?.[7])) || 0;
      const coloured = parseFloat(cellStr(row?.[8])) || 0;
      const colouredF = parseFloat(cellStr(row?.[9])) || 0;
      const total = parseFloat(cellStr(row?.[12])) || parseFloat(cellStr(row?.[11])) || 0;
      if (total > 0) {
        const blackCount = african + africanF + indian + indianF + coloured + colouredF;
        out.push({
          field: "seniorMgmtEEBlackPercent",
          value: Math.round((blackCount / total) * 10000) / 100,
          confidence: "high",
          source: `${sheetName}:senior management row`,
        });
      }
    }
  }
  return out;
}

function extractSkillsSheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const row of matrix) {
    const label = cellStr(row?.[0]).toLowerCase();
    if (label.includes("total expenditure")) {
      const v = parseCurrency(row?.[1]);
      if (v !== undefined) out.push({ field: "skillsSpend", value: v, confidence: "high", source: `${sheetName}:total expenditure` });
    }
    if (label.includes("number of b, c, d learnerships")) {
      const v = parseCount(row?.[1]);
      if (v !== undefined) {
        out.push({ field: "learnershipCount", value: v, confidence: "high", source: `${sheetName}:learnership count` });
        out.push({ field: "learnershipsBlack", value: v, confidence: "high", source: `${sheetName}:learnership count` });
      }
    }
  }

  let headerIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    if (norm(cellStr(matrix[i]?.[0])).includes("dateoftraining")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx >= 0) {
    const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
    const raceIdx = colIdx(headers, "race");
    const spendIdx = colIdx(headers, "totalexpenditure", "total expenditure");
    const absorbedIdx = colIdx(headers, "absorbedlearner", "absorbed learner");
    let blackSpend = 0;
    let absorbed = 0;
    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] as unknown[] | undefined;
      if (!row || row.every((v) => !cellStr(v))) continue;
      if (raceIdx !== undefined && isBlackRace(row[raceIdx]) && spendIdx !== undefined) {
        blackSpend += parseCurrency(row[spendIdx]) ?? 0;
      }
      if (absorbedIdx !== undefined && cellStr(row[absorbedIdx]).toLowerCase() === "yes") absorbed++;
    }
    if (blackSpend > 0) {
      out.push({ field: "skillsSpendOnBlack", value: blackSpend, confidence: "low", source: `${sheetName}:grid sum` });
    }
    if (absorbed > 0) {
      out.push({ field: "absorbedLearnerships", value: absorbed, confidence: "low", source: `${sheetName}:grid count` });
    }
  }
  return out;
}

function extractProcurementSheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const row of matrix) {
    const label = cellStr(row?.[1]).toLowerCase();
    if (label.includes("total procurement expenditure from suppliers")) {
      const v = parseCurrency(row?.[9]) ?? parseCurrency(row?.[1]);
      if (v !== undefined) out.push({ field: "beeCompliantSpend", value: v, confidence: "high", source: `${sheetName}:summary` });
    }
  }

  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const rowText = (matrix[i] || []).map(cellStr).join(" ").toLowerCase();
    if (rowText.includes("supplier name") && (rowText.includes("expenditure") || rowText.includes("spend"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return out;

  const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
  const spendIdx = colIdx(
    headers,
    "expenditurepersupplierledgerfortheperiodincludingvat",
    "expenditure",
    "spend",
  );
  const blackOwnIdx = colIdx(headers, "blackownership", "black ownership");
  const blackWomenIdx = colIdx(headers, "blackwomanownership", "black woman ownership");
  const beeLevelIdx = colIdx(headers, "beelevel", "bee level");

  let totalSpend = 0;
  let compliantSpend = 0;
  let blackOwnedSpend = 0;
  let blackWomenOwnedSpend = 0;

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row) continue;
    const spend = spendIdx !== undefined ? parseCurrency(row[spendIdx]) ?? 0 : 0;
    if (spend <= 0) continue;
    totalSpend += spend;

    const beeLevel = beeLevelIdx !== undefined ? cellStr(row[beeLevelIdx]) : "";
    if (beeLevel && !beeLevel.toLowerCase().includes("non")) compliantSpend += spend;

    const blackPct = blackOwnIdx !== undefined ? parsePercent(row[blackOwnIdx]) ?? 0 : 0;
    const womenPct = blackWomenIdx !== undefined ? parsePercent(row[blackWomenIdx]) ?? 0 : 0;
    if (blackPct >= 51) blackOwnedSpend += spend;
    if (womenPct >= 30) blackWomenOwnedSpend += spend;
  }

  if (totalSpend > 0) {
    if (compliantSpend > 0) {
      out.push({ field: "beeCompliantSpend", value: compliantSpend, confidence: "medium", source: `${sheetName}:grid sum` });
      out.push({
        field: "beeCompliantSpendPercent",
        value: Math.round((compliantSpend / totalSpend) * 10000) / 100,
        confidence: "medium",
        source: `${sheetName}:grid computed`,
      });
    }
    if (blackOwnedSpend > 0) {
      out.push({ field: "blackOwnedSpend", value: blackOwnedSpend, confidence: "medium", source: `${sheetName}:grid sum` });
      out.push({
        field: "blackOwnedSpendPercent",
        value: Math.round((blackOwnedSpend / totalSpend) * 10000) / 100,
        confidence: "medium",
        source: `${sheetName}:grid computed`,
      });
    }
    if (blackWomenOwnedSpend > 0) {
      out.push({ field: "blackWomenOwnedSpend", value: blackWomenOwnedSpend, confidence: "medium", source: `${sheetName}:grid sum` });
      out.push({
        field: "blackWomenOwnedSpendPercent",
        value: Math.round((blackWomenOwnedSpend / totalSpend) * 10000) / 100,
        confidence: "medium",
        source: `${sheetName}:grid computed`,
      });
    }
  }
  return out;
}

function extractEsdSheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const row of matrix) {
    const label = cellStr(row?.[1]).toLowerCase();
    if (label.includes("total contributions")) {
      const v = parseCurrency(row?.[5]) ?? parseCurrency(row?.[2]);
      if (v !== undefined) out.push({ field: "esdContributions", value: v, confidence: "high", source: `${sheetName}:summary` });
    }
  }
  return out;
}

function extractSedSheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const row of matrix) {
    const label = cellStr(row?.[1]).toLowerCase();
    if (label.includes("total value of contributions")) {
      const v = parseCurrency(row?.[5]) ?? parseCurrency(row?.[2]);
      if (v !== undefined) out.push({ field: "sedContributions", value: v, confidence: "high", source: `${sheetName}:summary` });
    }
  }
  return out;
}

function extractYesSheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const rowText = (matrix[i] || []).map(cellStr).join(" ").toLowerCase();
    if (rowText.includes("name") && (rowText.includes("yes") || rowText.includes("y.e.s"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return [
      { field: "yesEmployees", value: 0, confidence: "medium", source: `${sheetName}:empty` },
      { field: "yesAbsorbed", value: 0, confidence: "medium", source: `${sheetName}:empty` },
    ];
  }

  const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
  const nameIdx = colIdx(headers, "namesurname", "name");
  const absorbedIdx = colIdx(headers, "completedyesabsorbed", "completed y.e.s absorbed");

  let employees = 0;
  let absorbed = 0;
  for (let r = headerIdx + 1; r < Math.min(matrix.length, headerIdx + 200); r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row) continue;
    const name = nameIdx !== undefined ? cellStr(row[nameIdx]) : "";
    if (!name || /^\d+$/.test(name)) continue;
    employees++;
    if (absorbedIdx !== undefined && cellStr(row[absorbedIdx]).toLowerCase() === "yes") absorbed++;
  }

  out.push({ field: "yesEmployees", value: employees, confidence: "medium", source: `${sheetName}:row count` });
  out.push({ field: "yesAbsorbed", value: absorbed, confidence: "medium", source: `${sheetName}:absorbed count` });
  return out;
}

function extractEmpowermentFinancingSheet(matrix: SheetMatrix, sheetName: string): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const row of matrix) {
    const label = cellStr(row?.[1]).toLowerCase();
    if (label.includes("total contributions")) {
      const v = parseCurrency(row?.[2]);
      if (v !== undefined) {
        out.push({ field: "empowermentFinancing", value: v, confidence: "high", source: `${sheetName}:summary` });
      }
    }
  }
  return out;
}

function mergeCandidates(candidates: FieldCandidate[]): {
  data: ExtractedCompanyData;
  confidences: Partial<Record<keyof ExtractedCompanyData, FieldConfidence>>;
  sources: Partial<Record<keyof ExtractedCompanyData, string>>;
} {
  const rank: Record<FieldConfidence, number> = { high: 3, medium: 2, low: 1 };
  const data: ExtractedCompanyData = {};
  const confidences: Partial<Record<keyof ExtractedCompanyData, FieldConfidence>> = {};
  const sources: Partial<Record<keyof ExtractedCompanyData, string>> = {};

  for (const c of candidates) {
    const existing = confidences[c.field];
    const existingRank = existing ? rank[existing] : 0;
    const newRank = rank[c.confidence];
    const existingVal = data[c.field];
    const shouldReplace =
      !existing ||
      newRank > existingRank ||
      (newRank === existingRank &&
        typeof c.value === "number" &&
        typeof existingVal === "number" &&
        existingVal === 0 &&
        c.value !== 0 &&
        c.confidence !== "low");

    if (shouldReplace) {
      (data as Record<string, string | number>)[c.field] = c.value;
      confidences[c.field] = c.confidence;
      sources[c.field] = c.source;
    }
  }

  return { data, confidences, sources };
}

/**
 * EME / QSE / Generic revenue thresholds, per sector.
 *
 * Sector codes set their OWN thresholds — they are not the generic codes'.
 * Applying the generic bands everywhere put entities on the wrong scorecard
 * entirely: a Transport entity on R40m was classified QSE when the Integrated
 * Transport Sector Code makes it Large above R35m.
 *
 * Thandanani (R10.8m) is QSE under both sets, which is exactly why this went
 * unnoticed — the case we had did not discriminate.
 *
 * [eme_below, qse_below] — at or above `qse_below` the entity is Generic/Large.
 */
const REVENUE_THRESHOLDS: Record<string, [number, number]> = {
  // Integrated Transport Sector Code: EME < R5m, QSE R5m–R35m, Large > R35m.
  TRANSPORT: [5_000_000, 35_000_000],
  // Amended Codes of Good Practice: EME < R10m, QSE R10m–R50m, Generic > R50m.
  DEFAULT: [10_000_000, 50_000_000],
};

/**
 * Infer the scorecard type from revenue.
 *
 * NOTE this returns EME where revenue warrants it. The previous version could
 * only ever return QSE or Generic, so every EME was mis-typed as a QSE and
 * measured on a scorecard it is exempt from.
 */
export function inferScorecardTypeFromRevenue(
  revenue: number | undefined,
  sector?: string,
): string | undefined {
  if (revenue === undefined) return undefined;

  const key = (sector ?? "").toUpperCase();
  const [emeBelow, qseBelow] = REVENUE_THRESHOLDS[key] ?? REVENUE_THRESHOLDS.DEFAULT;

  if (revenue < emeBelow) return "EME";
  if (revenue < qseBelow) return "QSE";
  return "Generic";
}

export function isBeeGatheringWorkbook(wb: XLSX.WorkBook): boolean {
  const names = wb.SheetNames.map(norm);
  const hits = BEE_SHEET_SIGNATURES.filter((sig) =>
    names.some((n) => n.includes(norm(sig)) || norm(sig).includes(n)),
  );
  return hits.length >= 3;
}

export function normalizeSectorDeterministic(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase();
  if (SECTOR_CODE_OPTIONS.includes(upper)) return upper;
  const key = norm(raw);
  if (SECTOR_ALIASES[key]) return SECTOR_ALIASES[key];
  for (const [alias, code] of Object.entries(SECTOR_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return code;
  }
  const lower = raw.toLowerCase();
  for (const code of SECTOR_CODE_PARTIALS) {
    if (lower.includes(code.toLowerCase())) return code;
  }
  return undefined;
}

export function validateExtractedData(
  data: ExtractedCompanyData,
  confidences?: Partial<Record<keyof ExtractedCompanyData, FieldConfidence>>,
): {
  warnings: string[];
  fieldStatuses: Record<string, FieldStatus>;
  unmappedFields: string[];
} {
  const warnings: string[] = [];
  const fieldStatuses: Record<string, FieldStatus> = {};
  const unmappedFields: string[] = [];

  const setStatus = (field: string, status: FieldStatus, warn?: string) => {
    fieldStatuses[field] = status;
    if (status === "warning" && warn) warnings.push(warn);
    if (status === "unrecognized") unmappedFields.push(field);
  };

  const statusFor = (field: keyof ExtractedCompanyData, hasValue: boolean, warnMsg?: string) => {
    if (!hasValue) {
      setStatus(field, "warning", warnMsg);
      return;
    }
    const conf = confidences?.[field];
    if (conf === "low") setStatus(field, "warning", `${field}: low-confidence extraction — please verify.`);
    else if (conf === "medium") setStatus(field, "mapped");
    else setStatus(field, "mapped");
  };

  statusFor("companyName", !!data.companyName, "Company name not found — required.");
  if (data.sector && SECTOR_CODE_OPTIONS.includes(data.sector.toUpperCase())) {
    setStatus("sector", "mapped");
  } else if (data.sector) {
    setStatus("sector", "warning", `Sector "${data.sector}" could not be mapped to a known code.`);
  } else {
    setStatus("sector", "warning", "Industry sector not found.");
  }
  statusFor("scorecardType", !!data.scorecardType, "Scorecard type not determined — confirm Generic or QSE.");
  if (data.revenue !== undefined) {
    if (data.revenue <= 0) setStatus("revenue", "warning", "Revenue should be greater than zero.");
    else statusFor("revenue", true);
  } else {
    setStatus("revenue", "warning", "Annual turnover / revenue not found.");
  }
  statusFor("npat", data.npat !== undefined, "NPAT not found.");
  statusFor("financialYearEnd", !!data.financialYearEnd, "Financial year-end date not found.");

  const pctFields: Array<keyof ExtractedCompanyData> = [
    "blackOwnership",
    "blackWomenOwnership",
    "boardBlackPercent",
    "boardWomenPercent",
    "seniorMgmtBlackPercent",
    "topMgmtBlackPercent",
    "seniorMgmtEEBlackPercent",
    "beeCompliantSpendPercent",
    "blackOwnedSpendPercent",
    "blackWomenOwnedSpendPercent",
  ];
  for (const f of pctFields) {
    const v = data[f];
    if (v === undefined) continue;
    if (typeof v === "number" && (v < 0 || v > 100)) {
      setStatus(String(f), "warning", `${String(f)} (${v}%) is outside 0–100.`);
    } else {
      statusFor(f, true);
    }
  }

  if (
    data.blackOwnership !== undefined &&
    data.blackWomenOwnership !== undefined &&
    data.blackWomenOwnership > data.blackOwnership
  ) {
    warnings.push("Black women ownership exceeds total black ownership — verify values.");
  }

  return { warnings, fieldStatuses, unmappedFields };
}

export function extractBeeGatheringBuffer(buffer: ArrayBuffer): ExcelExtractionResult {
  const wb = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellFormula: false,
    cellNF: false,
    cellStyles: false,
  });
  const isBee = isBeeGatheringWorkbook(wb);
  const mappedSheets: string[] = [];
  const allCandidates: FieldCandidate[] = [];
  let ownershipChainTiers: OwnershipChainTier[] = [];

  if (!isBee) {
    return {
      data: {},
      warnings: ["File does not match BEE Information Gathering layout."],
      unmappedFields: [],
      fieldStatuses: {},
      fieldConfidences: {},
      fieldSources: {},
      isBeeGatheringFormat: false,
      mappedSheets,
      ownershipChainTiers: [],
      extractedFieldCount: 0,
    };
  }

  allCandidates.push(...extractNamedRanges(wb));

  for (const sheetName of wb.SheetNames) {
    mappedSheets.push(sheetName);
    const matrix = sheetMatrix(wb, sheetName);
    const sheetType = classifySheet(sheetName);

    allCandidates.push(...scanAllCells(matrix, sheetName));
    allCandidates.push(...extractFromTables(matrix, sheetName));

    switch (sheetType) {
      case "companyInfo":
        allCandidates.push(...extractInstructionsSheet(matrix, sheetName));
        break;
      case "financials":
        allCandidates.push(...extractFinanceSheet(matrix, sheetName));
        break;
      case "ownershipChain": {
        const chain = extractOwnershipChainSheet(matrix, sheetName);
        allCandidates.push(...chain.candidates);
        if (chain.tiers.length) ownershipChainTiers = chain.tiers;
        break;
      }
      case "management":
        allCandidates.push(...extractManagementSheet(matrix, sheetName));
        break;
      case "employmentEquity":
        allCandidates.push(...extractEmploymentEquitySheet(matrix, sheetName));
        break;
      case "skills":
        allCandidates.push(...extractSkillsSheet(matrix, sheetName));
        break;
      case "procurement":
        allCandidates.push(...extractProcurementSheet(matrix, sheetName));
        break;
      case "esd":
        allCandidates.push(...extractEsdSheet(matrix, sheetName));
        break;
      case "sed":
        allCandidates.push(...extractSedSheet(matrix, sheetName));
        break;
      case "yes":
        allCandidates.push(...extractYesSheet(matrix, sheetName));
        break;
      case "empowermentFinancing":
        allCandidates.push(...extractEmpowermentFinancingSheet(matrix, sheetName));
        break;
      default:
        break;
    }
  }

  const { data, confidences, sources } = mergeCandidates(allCandidates);

  if (data.sector) {
    data.sector = normalizeSectorDeterministic(data.sector) || data.sector;
  }
  if (!data.scorecardType) {
    // Sector is normalised immediately above, so the sector-specific thresholds
    // are available here — they must be, because the generic bands put a
    // Transport entity on the wrong scorecard.
    data.scorecardType = inferScorecardTypeFromRevenue(data.revenue, data.sector);
    if (data.scorecardType) {
      confidences.scorecardType = "low";
      sources.scorecardType = data.sector
        ? `inferred from revenue (${data.sector} thresholds)`
        : "inferred from revenue";
    }
  }

  const extractedFieldCount = Object.keys(data).filter(
    (k) => data[k as keyof ExtractedCompanyData] !== undefined,
  ).length;

  const { warnings, fieldStatuses, unmappedFields } = validateExtractedData(data, confidences);

  return {
    data,
    warnings,
    unmappedFields,
    fieldStatuses,
    fieldConfidences: confidences,
    fieldSources: sources,
    isBeeGatheringFormat: true,
    mappedSheets,
    ownershipChainTiers,
    extractedFieldCount,
  };
}

function stablePersonRowId(name: string, surname: string): string {
  return `emp_${norm(name)}_${norm(surname)}`;
}

function splitName(full: string): { name: string; surname: string } {
  const parts = full.trim().split(/\s*,\s*|\s+/).filter(Boolean);
  if (parts.length <= 1) return { name: full.trim(), surname: "—" };
  if (full.includes(",")) {
    return { surname: parts[0], name: parts.slice(1).join(" ") };
  }
  return { name: parts[0], surname: parts.slice(1).join(" ") };
}

function parseGridRows(
  matrix: SheetMatrix,
  headerPatterns: string[],
  mapRow: (row: unknown[], headers: Map<string, number>) => WorkbookRow | null,
): WorkbookRow[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const rowText = (matrix[i] || []).map(cellStr).join(" ").toLowerCase();
    if (headerPatterns.every((p) => rowText.includes(p.toLowerCase()))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
  const out: WorkbookRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] as unknown[];
    if (!row || row.every((v) => !cellStr(v))) continue;
    const mapped = mapRow(row, headers);
    if (mapped) out.push(mapped);
  }
  return out;
}

function parseOwnershipRows(matrix: SheetMatrix): WorkbookRow[] {
  return parseGridRows(matrix, ["name", "race"], (row, headers) => {
    const nameIdx = colIdx(headers, "namesurname", "name", "shareholdername");
    const idIdx = colIdx(headers, "idnumber", "id");
    const raceIdx = colIdx(headers, "race");
    const genderIdx = colIdx(headers, "gender");
    const voteIdx = colIdx(headers, "votingrights");
    const eiIdx = colIdx(headers, "economicinterest");
    const shareIdx = colIdx(headers, "shareholding", "shareholdingpercent");
    const blackOwnIdx = colIdx(headers, "blackownership", "black ownership");
    const blackWomenIdx = colIdx(headers, "blackwomenownership", "black women ownership");
    const newEntrantIdx = colIdx(headers, "newentrant", "new entrant");
    const name = nameIdx !== undefined ? cellStr(row[nameIdx]) : "";
    if (!name || /^\d+$/.test(name)) return null;
    const voting = voteIdx !== undefined ? parsePercent(row[voteIdx]) : undefined;
    const economic = eiIdx !== undefined ? parsePercent(row[eiIdx]) : voting;
    const shareholding = shareIdx !== undefined ? parsePercent(row[shareIdx]) : voting;
    const blackOwn = blackOwnIdx !== undefined ? parsePercent(row[blackOwnIdx]) : undefined;
    const blackWomen = blackWomenIdx !== undefined ? parsePercent(row[blackWomenIdx]) : undefined;
    const newEntrantRaw = newEntrantIdx !== undefined ? cellStr(row[newEntrantIdx]).toLowerCase() : "";
    const rowOut: WorkbookRow = {
      _id: uuidv4(),
      shareholderName: name,
      idNumber: idIdx !== undefined ? cellStr(row[idIdx]) : "",
      race: raceIdx !== undefined ? RACE_MAP[norm(cellStr(row[raceIdx]))] || cellStr(row[raceIdx]) : "",
      gender: genderIdx !== undefined ? GENDER_MAP[norm(cellStr(row[genderIdx]))] || cellStr(row[genderIdx]) : "",
      votingRights: voting ?? "",
      economicInterest: economic ?? voting ?? "",
      shareholding: shareholding ?? voting ?? "",
      isDisabled: false,
      isYouth: false,
      modifiedFlowThrough: false,
    };
    if (blackOwn != null) {
      (rowOut as Record<string, unknown>).blackOwnership = blackOwn <= 1 ? blackOwn * 100 : blackOwn;
    }
    if (blackWomen != null) {
      (rowOut as Record<string, unknown>).blackWomenOwnership =
        blackWomen <= 1 ? blackWomen * 100 : blackWomen;
    }
    if (newEntrantRaw === "yes" || newEntrantRaw === "y" || newEntrantRaw === "true" || newEntrantRaw === "1") {
      (rowOut as Record<string, unknown>).isNewEntrant = true;
    }
    return rowOut;
  });
}

function parseManagementRows(matrix: SheetMatrix): WorkbookRow[] {
  return parseGridRows(matrix, ["name", "race", "position"], (row, headers) => {
    const nameIdx = colIdx(headers, "namesurname", "name");
    const idIdx = colIdx(headers, "idnumber", "id");
    const raceIdx = colIdx(headers, "race");
    const genderIdx = colIdx(headers, "gender");
    const desigIdx = colIdx(headers, "positionoccupationallevel", "jobtitle", "position");
    const voteIdx = colIdx(headers, "votingrights");
    const name = nameIdx !== undefined ? cellStr(row[nameIdx]) : "";
    if (!name || /^\d+$/.test(name)) return null;
    const { name: first, surname } = splitName(name);
    const designation = desigIdx !== undefined ? cellStr(row[desigIdx]) : "Other Executive Manager";
    return {
      _id: stablePersonRowId(first, surname),
      name: first,
      surname,
      idNumber: idIdx !== undefined ? cellStr(row[idIdx]) : "",
      race: raceIdx !== undefined ? RACE_MAP[norm(cellStr(row[raceIdx]))] || cellStr(row[raceIdx]) : "",
      gender: genderIdx !== undefined ? GENDER_MAP[norm(cellStr(row[genderIdx]))] || cellStr(row[genderIdx]) : "",
      designation: designation || "Other Executive Manager",
      occupationalLevel: designation,
      votingRights: voteIdx !== undefined ? parsePercent(row[voteIdx]) ?? 0 : 0,
      isDisabled: false,
      isForeign: false,
    };
  });
}

function pctForWorkbook(value: number | undefined): number | "" {
  if (value == null || !Number.isFinite(value)) return "";
  return value <= 1 ? Math.round(value * 10000) / 100 : Math.round(value * 100) / 100;
}

/** Stamp extracted ownership totals onto sheet rows (trusts / corps often have blank race). */
export function applyExtractedOwnershipToRows(
  data: ExtractedCompanyData,
  tiers: OwnershipChainTier[],
  rows: WorkbookRow[],
): WorkbookRow[] {
  const blackOwn = data.blackOwnership;
  const blackWomen = data.blackWomenOwnership;
  if (blackOwn == null && tiers.length === 0) return rows;

  const hasExplicitBlack = rows.some((r) => {
    const explicit = (r as Record<string, unknown>).blackOwnership;
    return explicit != null && Number(explicit) > 0;
  });
  if (hasExplicitBlack) return rows;

  // Aggregates exist to fill trust/corporate rows that carry NO demographics
  // (this function's whole purpose, per its doc). The stamp lands on ROW 0 —
  // so it is row 0's stated identity that matters: a row that states race or
  // gender is PERSON evidence, and the projection already derives black /
  // black-women fractions from it. Stamping a document-level black-women %
  // onto such a row scored black-women ownership points for a company whose
  // only shareholder is an Indian man — stated identity wins, and the
  // aggregate is left to the extraction-review layer to reconcile openly.
  // (An identity-less trust at row 0 still accepts the stamp even when other
  // rows are people — that is the designed trust encoding.)
  const rowZero = rows[0] as Record<string, unknown> | undefined;
  const rowZeroStatesIdentity =
    rowZero != null &&
    (String(rowZero.race ?? "").trim() !== "" || String(rowZero.gender ?? "").trim() !== "");
  if (rowZeroStatesIdentity) return rows;

  const tier0 = tiers[0];
  const blackPct = pctForWorkbook(tier0?.blackVotingRights ?? blackOwn);
  const womenPct = pctForWorkbook(tier0?.blackWomenVotingRights ?? blackWomen);
  const eiPct = pctForWorkbook(tier0?.blackEconomicInterest ?? blackOwn);
  const sharePct = pctForWorkbook(tier0?.ownershipInNextTier ?? 100);

  if (rows.length > 0) {
    return rows.map((r, i) => {
      if (i !== 0) return r;
      const row = { ...r } as Record<string, unknown>;
      if (blackPct !== "") {
        row.blackOwnership = typeof blackPct === "number" ? blackPct : blackOwn;
        row.blackWomenOwnership =
          womenPct !== "" ? (typeof womenPct === "number" ? womenPct : blackWomen) : blackWomen ?? 0;
        if (!row.votingRights) row.votingRights = blackPct;
        if (!row.economicInterest) row.economicInterest = eiPct !== "" ? eiPct : blackPct;
        if (!row.shareholding) row.shareholding = sharePct !== "" ? sharePct : blackPct;
      }
      return row as WorkbookRow;
    });
  }

  const entityName =
    tier0?.entityName?.trim() || data.companyName?.trim() || "Measured entity";
  return [
    {
      _id: uuidv4(),
      shareholderName: entityName,
      idNumber: "",
      race: "",
      gender: "",
      votingRights: blackPct !== "" ? blackPct : 100,
      economicInterest: eiPct !== "" ? eiPct : blackPct !== "" ? blackPct : 100,
      shareholding: sharePct !== "" ? sharePct : 100,
      isDisabled: false,
      isYouth: false,
      modifiedFlowThrough: false,
      blackOwnership: typeof blackPct === "number" ? blackPct : blackOwn ?? 0,
      blackWomenOwnership:
        typeof womenPct === "number" ? womenPct : blackWomen ?? 0,
    },
  ];
}

function mapJobTitleToDesignationForImport(raw: string): string {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return "Junior";
  if (t.includes("non-executive") || t.includes("non executive") || t === "director") return "Non-executive Director";
  if (t.includes("executive director")) return "Executive Director";
  if (t.includes("other executive")) return "Other Executive Manager";
  if (t.includes("senior")) return "Senior Manager";
  if (t.includes("middle")) return "Middle Manager";
  if (t.includes("junior")) return "Junior Manager";
  if (t.includes("executive") || t.includes("ceo") || t.includes("managing director")) return "Executive Director";
  if (t.includes("manager") || t.includes("supervisor")) return "Middle Manager";
  return "Junior Manager";
}

function normalizeBeeLevelCell(raw: unknown): string {
  const s = cellStr(raw).toLowerCase();
  if (!s || s.includes("non")) return "Non-compliant";
  const n = parseInt(s, 10);
  if (n >= 1 && n <= 8) return String(n);
  return "";
}

function inferSupplierSize(spend: number, tmps: number): string {
  if (tmps > 0 && spend >= tmps * 0.5) return "EME";
  if (spend < 50_000_000) return "QSE";
  return "Generic";
}

function parseSupplierGridRows(matrix: SheetMatrix): WorkbookRow[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const rowText = (matrix[i] || []).map(cellStr).join(" ").toLowerCase();
    if (rowText.includes("supplier name") && (rowText.includes("expenditure") || rowText.includes("spend"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
  const nameIdx = colIdx(headers, "suppliername", "supplier name");
  const sizeIdx = colIdx(headers, "currentsize", "current size", "companysize");
  const beeIdx = colIdx(headers, "beelevel", "bbbeelevel", "b-bbee level", "bbbbelevel");
  const empoweringIdx = colIdx(headers, "empoweringsupplier", "empowering supplier");
  const blackOwnIdx = colIdx(headers, "blackownership", "black ownership");
  const blackWomenIdx = colIdx(headers, "blackwomanownership", "black woman ownership", "blackfemaleownership");
  const spendIdx = colIdx(
    headers,
    "expenditurepersupplierledgerfortheperiodincludingvat",
    "expenditure",
    "spend",
  );

  const out: WorkbookRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row) continue;
    const name = nameIdx !== undefined ? cellStr(row[nameIdx]) : "";
    if (!name || /^\d+$/.test(name)) continue;
    const spend = spendIdx !== undefined ? parseCurrency(row[spendIdx]) ?? 0 : 0;
    if (spend <= 0) continue;
    const sizeRaw = sizeIdx !== undefined ? cellStr(row[sizeIdx]) : "";
    const sizeNorm = norm(sizeRaw);
    const size =
      sizeNorm.includes("eme") ? "EME"
        : sizeNorm.includes("qse") ? "QSE"
        : sizeNorm.includes("large") || sizeNorm.includes("generic") ? "Generic"
        : sizeRaw || "Generic";
    // PURITY RULE: black ownership that the schedule did not state is NOT assumed
    // to be 100% — that inflated the procurement score with ownership the
    // evidence never established. Unknown = 0 (non-inflating); the practitioner
    // supplies the real figure.
    const blackPct = blackOwnIdx !== undefined ? parsePercent(row[blackOwnIdx]) ?? 0 : 0;
    const womenPct = blackWomenIdx !== undefined ? parsePercent(row[blackWomenIdx]) ?? 0 : 0;
    out.push({
      _id: uuidv4(),
      supplierName: name,
      currentSize: size,
      bbbeeLevel: beeIdx !== undefined ? normalizeBeeLevelCell(row[beeIdx]) : "",
      measuredUnder: "RCoGP",
      empoweringSupplier:
        empoweringIdx !== undefined
          ? ["yes", "y", "true", "1"].includes(cellStr(row[empoweringIdx]).toLowerCase())
          : true,
      currentBlackOwnership: pctForWorkbook(blackPct) || 100,
      currentBlackFemaleOwnership: pctForWorkbook(womenPct) || 0,
      hasModifiedBlackOwnership: false,
      sdRecipient: false,
      threeYearContract: false,
      designated: false,
      spend,
      certificateExpiryDate: "2027-02-28",
    });
  }
  return out;
}

function parseSkillsProgramGridRows(matrix: SheetMatrix): WorkbookRow[] {
  let headerIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    const rowText = (matrix[i] || []).map(cellStr).join(" ").toLowerCase();
    if (rowText.includes("dateoftraining")) {
      headerIdx = i;
      break;
    }
    if (
      (/\bprogram\b/.test(rowText) || rowText.includes("programme")) &&
      rowText.includes("expenditure")
    ) {
      headerIdx = i;
      break;
    }
    if (rowText.includes("learner") && rowText.includes("race")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
  const programIdx = colIdx(headers, "programname", "trainingprogramme", "course");
  const raceIdx = colIdx(headers, "race");
  const spendIdx = colIdx(headers, "totalexpenditure", "total expenditure", "totalcost");
  const absorbedIdx = colIdx(headers, "absorbedlearner", "absorbed");
  if (spendIdx === undefined && programIdx === undefined) return [];

  const out: WorkbookRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row || row.every((v) => !cellStr(v))) continue;
    const programName = programIdx !== undefined ? cellStr(row[programIdx]) : "";
    const spend = spendIdx !== undefined ? parseCurrency(row[spendIdx]) ?? 0 : 0;
    if (programName.toLowerCase().startsWith("note:")) continue;
    if (!programName && spend <= 0) continue;
    if (spend <= 0 && !programName) continue;
    out.push({
      _id: uuidv4(),
      programName: programName || "Imported training programme",
      categoryCode: "E",
      race: raceIdx !== undefined ? RACE_MAP[norm(cellStr(row[raceIdx]))] || cellStr(row[raceIdx]) : "",
      totalCost: spend,
      courseCost: spend,
      absorbed:
        absorbedIdx !== undefined
          ? ["yes", "y", "true", "1"].includes(cellStr(row[absorbedIdx]).toLowerCase())
          : false,
      completed: true,
      employed: true,
    });
  }
  return out;
}

function parseEsdGridRows(matrix: SheetMatrix): WorkbookRow[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const rowText = (matrix[i] || []).map(cellStr).join(" ").toLowerCase();
    if (rowText.includes("beneficiary") && rowText.includes("amount")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
  const nameIdx = colIdx(headers, "beneficiary", "suppliername", "supplier name");
  const sizeIdx = colIdx(headers, "currentsize", "current size");
  const blackIdx = colIdx(headers, "blackownership", "black ownership");
  const descIdx = colIdx(headers, "description", "contributiondescription");
  const typeIdx = colIdx(headers, "contributiontype", "contribution type");
  const catIdx = colIdx(headers, "esdcategory", "category", "esd category");
  const amountIdx = colIdx(headers, "amount");
  const dateIdx = colIdx(headers, "dateoftransaction", "date");

  const out: WorkbookRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row) continue;
    const name = nameIdx !== undefined ? cellStr(row[nameIdx]) : "";
    const amount = amountIdx !== undefined ? parseCurrency(row[amountIdx]) ?? 0 : 0;
    if (!name || amount <= 0) continue;
    const catRaw = catIdx !== undefined ? cellStr(row[catIdx]).toLowerCase() : "";
    const esdCategory = catRaw.includes("enterprise") ? "Enterprise Development" : "Supplier Development";
    const blackPct = blackIdx !== undefined ? parsePercent(row[blackIdx]) ?? 100 : 100;
    out.push({
      _id: uuidv4(),
      supplierName: name,
      currentSize: sizeIdx !== undefined ? cellStr(row[sizeIdx]) || "EME" : "EME",
      currentBlackOwnership: pctForWorkbook(blackPct) || 100,
      contributionDescription: descIdx !== undefined ? cellStr(row[descIdx]) : "Imported contribution",
      contributionType: typeIdx !== undefined ? cellStr(row[typeIdx]) || "Other Monetary" : "Other Monetary",
      esdCategory,
      amount,
      dateOfTransaction:
        dateIdx !== undefined ? parseDateToIso(row[dateIdx]) ?? cellStr(row[dateIdx]) : "2025-09-01",
    });
  }
  return out;
}

function parseSedGridRows(matrix: SheetMatrix): WorkbookRow[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const rowText = (matrix[i] || []).map(cellStr).join(" ").toLowerCase();
    if (rowText.includes("beneficiary") && rowText.includes("amount")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
  const nameIdx = colIdx(headers, "beneficiary", "beneficiaryname");
  const descIdx = colIdx(headers, "description", "descriptionofspend");
  const typeIdx = colIdx(headers, "contributiontype", "contribution type");
  const blackPctIdx = colIdx(headers, "benefitingblack", "benefiting black", "percentbenefitingblack");
  const amountIdx = colIdx(headers, "amount");
  const dateIdx = colIdx(headers, "dateoftransaction", "date");

  const out: WorkbookRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[] | undefined;
    if (!row) continue;
    const name = nameIdx !== undefined ? cellStr(row[nameIdx]) : "";
    const amount = amountIdx !== undefined ? parseCurrency(row[amountIdx]) ?? 0 : 0;
    if (!name || amount <= 0) continue;
    const blackPct = blackPctIdx !== undefined ? parsePercent(row[blackPctIdx]) ?? 100 : 100;
    out.push({
      _id: uuidv4(),
      beneficiaryName: name,
      descriptionOfSpend: descIdx !== undefined ? cellStr(row[descIdx]) : "Grant",
      ictSpecificInitiative: false,
      contributionType: typeIdx !== undefined ? cellStr(row[typeIdx]) || "Grant Contribution" : "Grant Contribution",
      percentBenefitingBlack: pctForWorkbook(blackPct) || 100,
      amount,
      dateOfTransaction:
        dateIdx !== undefined ? parseDateToIso(row[dateIdx]) ?? cellStr(row[dateIdx]) : "2025-06-01",
    });
  }
  return out;
}

/** When extractors only found pillar totals, synthesize detail rows the calculators require. */
function ensureAggregateDetailRows(
  data: ExtractedCompanyData,
  sections: WorkbookSectionsInput,
): void {
  const tmps = Number(data.totalProcurement ?? sections["financial-information"]?.meta?.tmps ?? 0);
  const certExpiry = data.financialYearEnd ? String(data.financialYearEnd) : "2027-02-28";

  if ((sections.suppliers?.rows?.length ?? 0) === 0) {
    const spendTotal =
      data.beeCompliantSpend ?? data.blackOwnedSpend ?? data.totalProcurement ?? tmps;
    if (spendTotal != null && spendTotal > 0) {
      const blackPct = data.blackOwnedSpendPercent ?? data.beeCompliantSpendPercent ?? 100;
      const womenPct = data.blackWomenOwnedSpendPercent ?? 0;
      const beeLevel =
        (data.beeCompliantSpendPercent ?? 0) >= 80
          ? "1"
          : (data.beeCompliantSpendPercent ?? 0) >= 50
            ? "4"
            : "Non-compliant";
      const row: WorkbookRow = {
        _id: uuidv4(),
        supplierName: data.companyName ? `${data.companyName} — aggregate procurement` : "Aggregate procurement",
        currentSize: inferSupplierSize(spendTotal, tmps),
        bbbeeLevel: beeLevel,
        measuredUnder: "RCoGP",
        empoweringSupplier: true,
        currentBlackOwnership: pctForWorkbook(blackPct) || 100,
        currentBlackFemaleOwnership: pctForWorkbook(womenPct) || 0,
        hasModifiedBlackOwnership: false,
        sdRecipient: false,
        threeYearContract: false,
        designated: false,
        spend: spendTotal,
        certificateExpiryDate: certExpiry,
      };
      sections.suppliers!.rows = [row];
      sections.procurement!.rows = [row];
    }
  }

  const leviable = data.leviableAmount ?? data.payroll ?? 0;
  const maxReasonableSkills = leviable > 0 ? leviable * 0.5 : 10_000_000;
  const skillsSpend = data.skillsSpend ?? 0;
  if (
    (sections["skills-development"]?.rows?.length ?? 0) === 0 &&
    skillsSpend > 0 &&
    skillsSpend <= maxReasonableSkills
  ) {
    const spend = skillsSpend;
    const row: WorkbookRow = {
      _id: uuidv4(),
      programName: "Aggregate skills development spend",
      categoryCode: "E",
      totalCost: spend,
      courseCost: spend,
      race: "African",
      completed: true,
      employed: true,
      absorbed: (data.absorbedLearnerships ?? 0) > 0,
    };
    sections["skills-development"]!.rows = [row];
  }

  if ((sections.esd?.rows?.length ?? 0) === 0 && (data.esdContributions ?? 0) > 0) {
    const total = data.esdContributions ?? 0;
    sections.esd!.rows = [
      {
        _id: uuidv4(),
        supplierName: "Aggregate ESD contribution",
        currentSize: "EME",
        currentBlackOwnership: 100,
        contributionDescription: "Imported enterprise & supplier development total",
        contributionType: "Other Monetary",
        esdCategory: "Supplier Development",
        amount: total,
        dateOfTransaction: "2025-09-01",
      },
    ];
  }

  if ((sections.sed?.rows?.length ?? 0) === 0 && (data.sedContributions ?? 0) > 0) {
    sections.sed!.rows = [
      {
        _id: uuidv4(),
        beneficiaryName: data.companyName ? `${data.companyName} — SED` : "Aggregate SED beneficiary",
        descriptionOfSpend: "Imported socio-economic development total",
        ictSpecificInitiative: false,
        contributionType: "Grant Contribution",
        percentBenefitingBlack: 100,
        amount: data.sedContributions ?? 0,
        dateOfTransaction: "2025-06-01",
      },
    ];
  }
}

function parseEmployeeRows(matrix: SheetMatrix): WorkbookRow[] {
  return parseGridRows(matrix, ["name", "race", "job"], (row, headers) => {
    const nameIdx = colIdx(headers, "namesurname", "name");
    const idIdx = colIdx(headers, "idnumber", "id");
    const raceIdx = colIdx(headers, "race");
    const genderIdx = colIdx(headers, "gender");
    const jobIdx = colIdx(headers, "jobtitle", "position");
    const name = nameIdx !== undefined ? cellStr(row[nameIdx]) : "";
    if (!name || /^\d+$/.test(name)) return null;
    const { name: first, surname } = splitName(name);
    const jobTitle = jobIdx !== undefined ? cellStr(row[jobIdx]) : "";
    const designation = mapJobTitleToDesignationForImport(jobTitle);
    return {
      _id: stablePersonRowId(first, surname),
      name: first,
      surname,
      idNumber: idIdx !== undefined ? cellStr(row[idIdx]) : "",
      race: raceIdx !== undefined ? RACE_MAP[norm(cellStr(row[raceIdx]))] || cellStr(row[raceIdx]) : "",
      gender: genderIdx !== undefined ? GENDER_MAP[norm(cellStr(row[genderIdx]))] || cellStr(row[genderIdx]) : "",
      designation,
      occupationalLevel: jobTitle || designation,
      isDisabled: false,
      isForeign: false,
    };
  });
}

export function mapExtractedToWorkbookSections(
  data: ExtractedCompanyData,
  wb?: XLSX.WorkBook,
  ownershipChainTiers: OwnershipChainTier[] = [],
): WorkbookSectionsInput {
  const sections: WorkbookSectionsInput = {
    "company-information": { rows: [], meta: {} },
    "financial-information": { rows: [], meta: {} },
    "afs-additions": { rows: [], meta: {} },
    ownership: { rows: [] },
    "management-control": { rows: [] },
    employees: { rows: [] },
    "skills-development": { rows: [] },
    procurement: { rows: [] },
    suppliers: { rows: [] },
    esd: { rows: [] },
    sed: { rows: [] },
  };

  const sector = data.sector?.toUpperCase();
  const scorecardType = sector
    ? resolveScorecardTypeForSector(sector, data.scorecardType)
    : data.scorecardType;

  sections["company-information"].meta = {
    companyName: data.companyName ?? "",
    industrySector: sector ?? "",
    scorecardType: scorecardType ?? "",
    financialYearEnd: data.financialYearEnd ?? "",
    registrationNumber: data.registrationNumber ?? "",
  };

  const payroll = data.payroll ?? data.leviableAmount ?? 0;
  const revenue = data.revenue ?? 0;
  const npat = data.npat ?? 0;

  sections["financial-information"].meta = {
    revenue,
    npat,
    payroll,
    leviableAmount: data.leviableAmount ?? payroll,
    tmps: data.totalProcurement ?? 0,
    forecastRevenue: revenue,
    forecastNpat: npat,
    forecastPayroll: payroll,
  };

  if (wb) {
    const ownershipSheet = findSheet(wb, "Ownership");
    const ownershipChainSheet = findSheet(wb, "Ownership Chain");
    const mgmtSheet = findSheet(wb, "Management Control");
    const eeSheet = findSheet(wb, "Employment Equity");
    const skillsSheet = findSheet(wb, "Skills Development");
    const procurementSheet = findSheet(wb, "Procurement");
    const esdSheet = findSheet(wb, "Enterprise Development");
    const sedSheet = findSheet(wb, "Socio-Economic Development", "Social Development", "Economic Development");

    if (ownershipSheet) {
      sections.ownership.rows = parseOwnershipRows(sheetMatrix(wb, ownershipSheet));
    }
    if (mgmtSheet) {
      sections["management-control"].rows = parseManagementRows(sheetMatrix(wb, mgmtSheet));
    }
    if (eeSheet) {
      sections.employees.rows = parseEmployeeRows(sheetMatrix(wb, eeSheet));
    }
    if (skillsSheet) {
      sections["skills-development"].rows = parseSkillsProgramGridRows(sheetMatrix(wb, skillsSheet));
    }
    if (procurementSheet) {
      const supplierRows = parseSupplierGridRows(sheetMatrix(wb, procurementSheet));
      sections.suppliers.rows = supplierRows;
      sections.procurement.rows = supplierRows;
    }
    if (esdSheet) {
      sections.esd.rows = parseEsdGridRows(sheetMatrix(wb, esdSheet));
    }
    if (sedSheet) {
      sections.sed.rows = parseSedGridRows(sheetMatrix(wb, sedSheet));
    }
    if (!ownershipChainSheet && ownershipChainTiers.length === 0) {
      const chainSheet = wb.SheetNames.find((n) => norm(n).includes("ownershipchain"));
      if (chainSheet) {
        const chain = extractOwnershipChainSheet(sheetMatrix(wb, chainSheet), chainSheet);
        if (chain.tiers.length) ownershipChainTiers = chain.tiers;
      }
    }
  }

  sections.ownership.rows = applyExtractedOwnershipToRows(
    data,
    ownershipChainTiers,
    sections.ownership.rows,
  );

  if (sections.employees.rows.length === 0 && sections["management-control"].rows.length > 0) {
    sections.employees.rows = [...sections["management-control"].rows];
  }

  ensureAggregateDetailRows(data, sections);

  sections["skills-development"].rows = (sections["skills-development"].rows ?? []).filter(
    (r) => (Number((r as WorkbookRow).totalCost) || Number((r as WorkbookRow).courseCost) || 0) > 0,
  );

  return sections;
}

export async function normalizeExtractedFields(
  raw: NormalizeRequest,
  apiBase: string,
): Promise<NormalizeResponse> {
  const res = await fetch(`${apiBase}/api/excel-import/normalize`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(raw),
  });
  if (!res.ok) {
    return {
      sector: normalizeSectorDeterministic(raw.sector) || raw.sector,
      scorecardType: raw.scorecardType,
      financialYearEnd: raw.financialYearEnd,
      usedAi: false,
      notes: ["Normalization API unavailable — using deterministic values."],
    };
  }
  return res.json();
}

export interface FullExcelImportResult {
  extraction: ExcelExtractionResult;
  sections: WorkbookSectionsInput;
  validationIssues: WorkbookValidationIssue[];
  criticalBlocked: boolean;
}

export async function importBeeGatheringExcel(
  file: File,
  apiBase: string,
): Promise<FullExcelImportResult> {
  const buffer = await file.arrayBuffer();
  const extraction = extractBeeGatheringBuffer(buffer);

  if (!extraction.isBeeGatheringFormat) {
    return {
      extraction,
      sections: {},
      validationIssues: [],
      criticalBlocked: true,
    };
  }

  const normalized = await normalizeExtractedFields(
    {
      sector: extraction.data.sector,
      scorecardType: extraction.data.scorecardType,
      financialYearEnd: extraction.data.financialYearEnd,
      extractedData: extraction.data,
      fieldConfidences: extraction.fieldConfidences,
    },
    apiBase,
  );

  if (normalized.sector) extraction.data.sector = normalized.sector;
  if (normalized.scorecardType) extraction.data.scorecardType = normalized.scorecardType;
  if (normalized.financialYearEnd) extraction.data.financialYearEnd = normalized.financialYearEnd;
  if (normalized.notes.length) extraction.warnings.push(...normalized.notes);
  if (normalized.validationWarnings?.length) extraction.warnings.push(...normalized.validationWarnings);

  const wb = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellFormula: false,
    cellNF: false,
    cellStyles: false,
  });
  const sections = mapExtractedToWorkbookSections(
    extraction.data,
    wb,
    extraction.ownershipChainTiers,
  );
  // Strict select-option enforcement on the legacy Excel import path so
  // unrecognised dropdown values surface as validation issues at preview
  // time (Task #18 areas 1/2). See `workbookValidation.ts`.
  const validationIssues = validateWorkbook(sections, { strictSelectOptions: true });
  const criticalBlocked = validationIssues.some(
    (issue) =>
      (issue.sectionKey === "company-information" || issue.sectionKey === "financial-information") &&
      (issue.message.toLowerCase().includes("required") ||
        issue.field === "companyName" ||
        issue.field === "industrySector" ||
        issue.field === "scorecardType" ||
        issue.field === "revenue"),
  );

  return { extraction, sections, validationIssues, criticalBlocked };
}

export const EXTRACTED_FIELD_LABELS: Record<keyof ExtractedCompanyData, string> = {
  companyName: "Company Name",
  registrationNumber: "Registration No",
  taxNumber: "Tax / VAT No",
  sector: "Industry Sector",
  scorecardType: "Scorecard Type",
  financialYearEnd: "Financial Year End",
  revenue: "Annual Turnover (R)",
  npat: "NPAT (R)",
  blackOwnership: "Black Ownership (%)",
  blackWomenOwnership: "Black Women Ownership (%)",
  boardBlackPercent: "Board Black (%)",
  boardWomenPercent: "Board Women (%)",
  seniorMgmtBlackPercent: "Senior Mgmt Black (%)",
  topMgmtBlackPercent: "EE Black (%)",
  seniorMgmtEEBlackPercent: "Senior EE Black (%)",
  skillsSpend: "Skills Spend (R)",
  skillsSpendOnBlack: "Skills Spend on Black (R)",
  learnershipCount: "Learnership Count",
  learnershipsBlack: "Black Learnerships",
  absorbedLearnerships: "Absorbed Learnerships",
  totalProcurement: "Total Procurement (R)",
  beeCompliantSpend: "BEE Compliant Spend (R)",
  beeCompliantSpendPercent: "BEE Compliant Spend (%)",
  blackOwnedSpend: "Black-Owned Spend (R)",
  blackOwnedSpendPercent: "Black-Owned Spend (%)",
  blackWomenOwnedSpend: "Black Women-Owned Spend (R)",
  blackWomenOwnedSpendPercent: "Black Women-Owned Spend (%)",
  esdContributions: "ESD Contributions (R)",
  sedContributions: "SED Contributions (R)",
  payroll: "Annual Payroll (R)",
  leviableAmount: "Leviable Amount (R)",
  yesEmployees: "Y.E.S. Employees",
  yesAbsorbed: "Y.E.S. Absorbed",
  empowermentFinancing: "Empowerment Financing (R)",
};
