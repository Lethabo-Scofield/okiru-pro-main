/**
 * BEE Information Gathering File → structured company / workbook data.
 * Deterministic extraction from known sheet layouts; AI normalization is server-side only.
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

export interface ExtractedCompanyData {
  companyName?: string;
  registrationNumber?: string;
  sector?: string;
  scorecardType?: string;
  financialYearEnd?: string;
  revenue?: number;
  npat?: number;

  blackOwnership?: number;
  blackWomenOwnership?: number;

  boardBlackPercent?: number;
  seniorMgmtBlackPercent?: number;

  topMgmtBlackPercent?: number;
  seniorMgmtEEBlackPercent?: number;

  skillsSpend?: number;
  skillsSpendOnBlack?: number;
  learnershipsBlack?: number;

  totalProcurement?: number;
  beeCompliantSpend?: number;
  blackOwnedSpend?: number;
  blackWomenOwnedSpend?: number;

  esdContributions?: number;
  sedContributions?: number;

  payroll?: number;
  leviableAmount?: number;
}

export type FieldStatus = "mapped" | "warning" | "unrecognized";

export interface ExcelExtractionResult {
  data: ExtractedCompanyData;
  warnings: string[];
  unmappedFields: string[];
  fieldStatuses: Record<string, FieldStatus>;
  isBeeGatheringFormat: boolean;
  mappedSheets: string[];
}

export interface NormalizeRequest {
  sector?: string;
  scorecardType?: string;
  financialYearEnd?: string;
}

export interface NormalizeResponse {
  sector?: string;
  scorecardType?: string;
  financialYearEnd?: string;
  usedAi: boolean;
  notes: string[];
}

type SheetMatrix = unknown[][];

const BEE_SHEET_SIGNATURES = ["instructions", "finance", "ownership", "employment equity"];

const SECTOR_ALIASES: Record<string, string> = {
  transport: "TRANSPORT",
  tourism: "RCOGP",
  agricultural: "AGRI",
  agriculture: "AGRI",
  agri: "AGRI",
  construction: "CONSTRUCTION",
  financialservices: "FSC",
  financial: "FSC",
  ict: "ICT",
  informationcommunicationtechnology: "ICT",
  property: "RCOGP",
  legal: "RCOGP",
  charteredaccounting: "RCOGP",
  marketingadvertisingcommunication: "RCOGP",
  forestry: "AGRI",
  defence: "RCOGP",
};

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
  const negative = s.startsWith("-") || s.startsWith("( ");
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
  return undefined;
}

export function isBeeGatheringWorkbook(wb: XLSX.WorkBook): boolean {
  const names = wb.SheetNames.map(norm);
  const hits = BEE_SHEET_SIGNATURES.filter((sig) =>
    names.some((n) => n.includes(norm(sig)) || norm(sig).includes(n)),
  );
  return hits.length >= 3;
}

function findLabelValue(matrix: SheetMatrix, labelPatterns: string[]): string | undefined {
  for (const row of matrix) {
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = cellStr(row[c]);
      if (!cell) continue;
      for (const pat of labelPatterns) {
        if (cell.toLowerCase().includes(pat.toLowerCase())) {
          for (let k = c + 1; k < row.length; k++) {
            const val = cellStr(row[k]);
            if (val && !val.toLowerCase().startsWith("year -")) return val;
          }
        }
      }
    }
  }
  return undefined;
}

function findCurrencyAfterLabel(matrix: SheetMatrix, labelPatterns: string[]): number | undefined {
  for (const row of matrix) {
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = cellStr(row[c]);
      if (!cell) continue;
      for (const pat of labelPatterns) {
        if (cell.toLowerCase().includes(pat.toLowerCase())) {
          for (let k = c + 1; k < row.length; k++) {
            const amount = parseCurrency(row[k]);
            if (amount !== undefined) return amount;
          }
        }
      }
    }
  }
  return undefined;
}

function extractMeasuredEntity(matrix: SheetMatrix): string | undefined {
  for (const row of matrix) {
    for (const cell of row || []) {
      const s = cellStr(cell);
      const m = /^measured entity:\s*(.+)$/i.exec(s);
      if (m) return m[1].trim();
    }
  }
  return undefined;
}

function extractYearEnd(matrix: SheetMatrix): string | undefined {
  for (const row of matrix) {
    for (const cell of row || []) {
      const iso = parseDateToIso(cell);
      if (iso && cellStr(cell).toLowerCase().includes("year end")) return iso;
    }
  }
  return undefined;
}

function inferScorecardTypeFromRevenue(revenue: number | undefined): string | undefined {
  if (revenue === undefined) return undefined;
  if (revenue >= 50_000_000) return "Generic";
  if (revenue >= 10_000_000) return "QSE";
  return "QSE";
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
  return undefined;
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
    const nameIdx = colIdx(headers, "namesurname", "name");
    const idIdx = colIdx(headers, "idnumber", "id");
    const raceIdx = colIdx(headers, "race");
    const genderIdx = colIdx(headers, "gender");
    const voteIdx = colIdx(headers, "votingrights", "economicinterest");
    const name = nameIdx !== undefined ? cellStr(row[nameIdx]) : "";
    if (!name || /^\d+$/.test(name)) return null;
    return {
      _id: uuidv4(),
      shareholderName: name,
      idNumber: idIdx !== undefined ? cellStr(row[idIdx]) : "",
      race: raceIdx !== undefined ? RACE_MAP[norm(cellStr(row[raceIdx]))] || cellStr(row[raceIdx]) : "",
      gender: genderIdx !== undefined ? GENDER_MAP[norm(cellStr(row[genderIdx]))] || cellStr(row[genderIdx]) : "",
      votingRights: voteIdx !== undefined ? parsePercent(row[voteIdx]) ?? "" : "",
      economicInterest: voteIdx !== undefined ? parsePercent(row[voteIdx]) ?? "" : "",
      shareholding: voteIdx !== undefined ? parsePercent(row[voteIdx]) ?? "" : "",
      isDisabled: false,
      isYouth: false,
      modifiedFlowThrough: false,
    };
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
      _id: uuidv4(),
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
    return {
      _id: uuidv4(),
      name: first,
      surname,
      idNumber: idIdx !== undefined ? cellStr(row[idIdx]) : "",
      race: raceIdx !== undefined ? RACE_MAP[norm(cellStr(row[raceIdx]))] || cellStr(row[raceIdx]) : "",
      gender: genderIdx !== undefined ? GENDER_MAP[norm(cellStr(row[genderIdx]))] || cellStr(row[genderIdx]) : "",
      occupationalLevel: jobIdx !== undefined ? cellStr(row[jobIdx]) : "",
      isDisabled: false,
      isForeign: false,
    };
  });
}

function computeEeBlackPercent(matrix: SheetMatrix): number | undefined {
  for (const row of matrix) {
    const label = cellStr(row?.[1]);
    if (!label.toLowerCase().includes("sub total")) continue;
    const african = parseFloat(cellStr(row[2])) || 0;
    const africanF = parseFloat(cellStr(row[3])) || 0;
    const indian = parseFloat(cellStr(row[4])) || 0;
    const indianF = parseFloat(cellStr(row[5])) || 0;
    const coloured = parseFloat(cellStr(row[6])) || 0;
    const colouredF = parseFloat(cellStr(row[7])) || 0;
    const total = parseFloat(cellStr(row[10])) || parseFloat(cellStr(row[9])) || 0;
    if (total <= 0) continue;
    const black = african + africanF + indian + indianF + coloured + colouredF;
    return Math.round((black / total) * 10000) / 100;
  }
  return undefined;
}

function extractOwnershipChainTotals(matrix: SheetMatrix): { black?: number; blackWomen?: number } {
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const row = matrix[i] || [];
    const rowText = row.map(cellStr).join(" ").toLowerCase();
    if (!rowText.includes("total black voting")) continue;
    const headerIdx = i;
    const headers = mapHeaderRow(matrix[headerIdx] as unknown[]);
    for (let r = headerIdx + 1; r < Math.min(matrix.length, headerIdx + 5); r++) {
      const dataRow = matrix[r] as unknown[];
      const tier = cellStr(dataRow[0]);
      if (tier !== "1" && tier !== "1.0") continue;
      const voteIdx = colIdx(headers, "totalblackvotingrights");
      const womenIdx = colIdx(headers, "blackwomenvotingrights", "blackwomeneconomicinterest");
      return {
        black: voteIdx !== undefined ? parsePercent(dataRow[voteIdx]) : undefined,
        blackWomen: womenIdx !== undefined ? parsePercent(dataRow[womenIdx]) : undefined,
      };
    }
  }

  for (const row of matrix) {
    if (cellStr(row?.[0]) === "1") {
      for (let c = 5; c < (row?.length || 0); c++) {
        const pct = parsePercent(row[c]);
        if (pct !== undefined && pct > 0) {
          return { black: pct };
        }
      }
    }
  }
  return {};
}

export function validateExtractedData(data: ExtractedCompanyData): {
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

  if (data.companyName) setStatus("companyName", "mapped");
  else setStatus("companyName", "warning", "Company name not found — required.");

  if (data.sector && SECTOR_CODE_OPTIONS.includes(data.sector.toUpperCase())) {
    setStatus("sector", "mapped");
  } else if (data.sector) {
    setStatus("sector", "warning", `Sector "${data.sector}" could not be mapped to a known code.`);
  } else {
    setStatus("sector", "warning", "Industry sector not found.");
  }

  if (data.scorecardType) setStatus("scorecardType", "mapped");
  else setStatus("scorecardType", "warning", "Scorecard type not determined — confirm Generic or QSE.");

  if (data.revenue !== undefined) {
    if (data.revenue <= 0) setStatus("revenue", "warning", "Revenue should be greater than zero.");
    else setStatus("revenue", "mapped");
  } else {
    setStatus("revenue", "warning", "Annual turnover / revenue not found.");
  }

  if (data.npat !== undefined) setStatus("npat", "mapped");
  else setStatus("npat", "warning", "NPAT not found.");

  if (data.financialYearEnd) setStatus("financialYearEnd", "mapped");
  else setStatus("financialYearEnd", "warning", "Financial year-end date not found.");

  const pctFields: Array<keyof ExtractedCompanyData> = [
    "blackOwnership", "blackWomenOwnership", "boardBlackPercent",
    "seniorMgmtBlackPercent", "topMgmtBlackPercent", "seniorMgmtEEBlackPercent",
  ];
  for (const f of pctFields) {
    const v = data[f];
    if (v === undefined) continue;
    if (typeof v === "number" && (v < 0 || v > 100)) {
      setStatus(String(f), "warning", `${String(f)} (${v}%) is outside 0–100.`);
    } else {
      setStatus(String(f), "mapped");
    }
  }

  return { warnings, fieldStatuses, unmappedFields };
}

export function extractBeeGatheringBuffer(buffer: ArrayBuffer): ExcelExtractionResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const isBee = isBeeGatheringWorkbook(wb);
  const mappedSheets: string[] = [];
  const data: ExtractedCompanyData = {};

  if (!isBee) {
    return {
      data,
      warnings: ["File does not match BEE Information Gathering layout."],
      unmappedFields: [],
      fieldStatuses: {},
      isBeeGatheringFormat: false,
      mappedSheets,
    };
  }

  const instructions = findSheet(wb, "Instructions");
  const finance = findSheet(wb, "Finance");
  const ownership = findSheet(wb, "Ownership");
  const ownershipChain = findSheet(wb, "Ownership Chain");
  const management = findSheet(wb, "Management Control");
  const ee = findSheet(wb, "Employment Equity");
  const skills = findSheet(wb, "Skills Development");
  const procurement = findSheet(wb, "Procurement");
  const esd = findSheet(wb, "Enterprise Development");
  const sed = findSheet(wb, "Social Development", "Socio-Economic Development");

  if (instructions) mappedSheets.push(instructions);
  if (finance) mappedSheets.push(finance);

  const instMatrix = instructions ? sheetMatrix(wb, instructions) : [];
  data.companyName =
    findLabelValue(instMatrix, ["Measured Entity Name"]) ||
    (finance ? extractMeasuredEntity(sheetMatrix(wb, finance)) : undefined);

  const rawSector = findLabelValue(instMatrix, ["Industry Sector"]);
  data.sector = normalizeSectorDeterministic(rawSector) || rawSector;

  data.financialYearEnd =
    parseDateToIso(findLabelValue(instMatrix, ["Financial Year End"])) ||
    (finance ? extractYearEnd(sheetMatrix(wb, finance)) : undefined);

  if (finance) {
    const finMatrix = sheetMatrix(wb, finance);
    data.revenue = findCurrencyAfterLabel(finMatrix, ["Turnover /Revenue", "Turnover/Revenue", "Allocated Budget"]);
    data.npat = findCurrencyAfterLabel(finMatrix, ["NPAT / Loss", "Nett Profit After Tax"]);
    data.payroll = findCurrencyAfterLabel(finMatrix, ["Annual Payroll"]);
    data.leviableAmount = findCurrencyAfterLabel(finMatrix, ["Total Leviable Amount"]);
    data.totalProcurement = findCurrencyAfterLabel(finMatrix, ["Total Measured Procurement Spend"]);
  }

  data.scorecardType = inferScorecardTypeFromRevenue(data.revenue);

  if (ownershipChain) {
    mappedSheets.push(ownershipChain);
    const totals = extractOwnershipChainTotals(sheetMatrix(wb, ownershipChain));
    data.blackOwnership = totals.black;
    data.blackWomenOwnership = totals.blackWomen;
  }

  if (ee) {
    mappedSheets.push(ee);
    data.topMgmtBlackPercent = computeEeBlackPercent(sheetMatrix(wb, ee));
  }

  if (skills) {
    mappedSheets.push(skills);
    data.skillsSpend = findCurrencyAfterLabel(sheetMatrix(wb, skills), ["Total Expenditure"]);
  }

  if (procurement) {
    mappedSheets.push(procurement);
    data.beeCompliantSpend = findCurrencyAfterLabel(
      sheetMatrix(wb, procurement),
      ["Total Procurement Expenditure from suppliers"],
    );
  }

  if (esd) {
    mappedSheets.push(esd);
    data.esdContributions = findCurrencyAfterLabel(sheetMatrix(wb, esd), ["Total Contributions"]);
  }

  if (sed) {
    mappedSheets.push(sed);
    data.sedContributions = findCurrencyAfterLabel(
      sheetMatrix(wb, sed),
      ["Total Value of Contributions"],
    );
  }

  if (ownership) mappedSheets.push(ownership);
  if (management) mappedSheets.push(management);

  const { warnings, fieldStatuses, unmappedFields } = validateExtractedData(data);

  return {
    data,
    warnings,
    unmappedFields,
    fieldStatuses,
    isBeeGatheringFormat: true,
    mappedSheets,
  };
}

export function mapExtractedToWorkbookSections(
  data: ExtractedCompanyData,
  wb?: XLSX.WorkBook,
): WorkbookSectionsInput {
  const sections: WorkbookSectionsInput = {
    "company-information": { rows: [], meta: {} },
    "financial-information": { rows: [], meta: {} },
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
    const mgmtSheet = findSheet(wb, "Management Control");
    const eeSheet = findSheet(wb, "Employment Equity");

    if (ownershipSheet) {
      sections.ownership.rows = parseOwnershipRows(sheetMatrix(wb, ownershipSheet));
    }
    if (mgmtSheet) {
      sections["management-control"].rows = parseManagementRows(sheetMatrix(wb, mgmtSheet));
    }
    if (eeSheet) {
      sections.employees.rows = parseEmployeeRows(sheetMatrix(wb, eeSheet));
    }
  }

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
    },
    apiBase,
  );

  if (normalized.sector) extraction.data.sector = normalized.sector;
  if (normalized.scorecardType) extraction.data.scorecardType = normalized.scorecardType;
  if (normalized.financialYearEnd) extraction.data.financialYearEnd = normalized.financialYearEnd;
  if (normalized.notes.length) extraction.warnings.push(...normalized.notes);

  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sections = mapExtractedToWorkbookSections(extraction.data, wb);
  const validationIssues = validateWorkbook(sections);
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
  sector: "Industry Sector",
  scorecardType: "Scorecard Type",
  financialYearEnd: "Financial Year End",
  revenue: "Annual Turnover (R)",
  npat: "NPAT (R)",
  blackOwnership: "Black Ownership (%)",
  blackWomenOwnership: "Black Women Ownership (%)",
  boardBlackPercent: "Board Black (%)",
  seniorMgmtBlackPercent: "Senior Mgmt Black (%)",
  topMgmtBlackPercent: "EE Black (%)",
  seniorMgmtEEBlackPercent: "Senior EE Black (%)",
  skillsSpend: "Skills Spend (R)",
  skillsSpendOnBlack: "Skills Spend on Black (R)",
  learnershipsBlack: "Black Learnerships",
  totalProcurement: "Total Procurement (R)",
  beeCompliantSpend: "BEE Compliant Spend (R)",
  blackOwnedSpend: "Black-Owned Spend (R)",
  blackWomenOwnedSpend: "Black Women-Owned Spend (R)",
  esdContributions: "ESD Contributions (R)",
  sedContributions: "SED Contributions (R)",
  payroll: "Annual Payroll (R)",
  leviableAmount: "Leviable Amount (R)",
};
