/**
 * Excel → workbook section normalizer for Create Scorecard / Information Request flow.
 *
 * Pipeline: parse → map sheets → map columns → normalize types → structure → validate
 */
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import {
  SECTIONS,
  getSection,
  parseWorkbookDate,
  BBBEE_LEVEL_MAP,
  OCC_LEVEL_MAP,
  SUPPLIER_SIZE_MAP,
  type ColumnDef,
} from "@/components/workbook/sections";
import {
  validateWorkbook,
  type WorkbookValidationIssue,
} from "@/components/workbook/workbookValidation";

export type WorkbookRow = Record<string, unknown> & { _id: string };
export type WorkbookSectionPayload = { rows: WorkbookRow[]; meta?: Record<string, unknown> };
export type WorkbookSectionsInput = Record<string, WorkbookSectionPayload>;

export type ExcelImportResult = {
  sections: WorkbookSectionsInput;
  validationIssues: WorkbookValidationIssue[];
  criticalBlocked: boolean;
  warnings: string[];
  mappedSheets: Record<string, string>;
};

const SHEET_SECTION_HINTS: Array<{ sectionKey: string; hints: string[] }> = [
  { sectionKey: "company-information", hints: ["information request", "company information", "company info", "general", "client"] },
  { sectionKey: "financial-information", hints: ["financial information", "financial", "finance", "p&l", "revenue"] },
  { sectionKey: "ownership", hints: ["ownership", "shareholder", "voting rights", "equity"] },
  { sectionKey: "management-control", hints: ["management control", "management", "board", "directors"] },
  { sectionKey: "employees", hints: ["employees", "employee", "staff list", "employment equity", "ee profile"] },
  { sectionKey: "skills-development", hints: ["skills development", "skills", "training", "learnership"] },
  // The "suppliers" / "vendor" hints map to the canonical Procurement section
  // (the standalone "Suppliers" section was removed in May 2026).
  { sectionKey: "procurement", hints: ["procurement", "preferential procurement", "suppliers", "supplier", "vendor", "vendors"] },
  { sectionKey: "esd", hints: ["enterprise development", "supplier development", "esd", "es&sd"] },
  { sectionKey: "sed", hints: ["socioeconomic", "socio-economic", "socio economic", "sed", "csi"] },
];

const CRITICAL_META_KEYS = new Set([
  "companyName",
  "industrySector",
  "scorecardType",
  "revenue",
  "npat",
  "payroll",
  "forecastRevenue",
  "forecastNpat",
  "forecastPayroll",
]);

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

function matchSheetName(sheetName: string): string | null {
  const n = norm(sheetName);
  if (!n) return null;
  // Two-pass match. (1) exact normalised match. (2) substring containment but
  // only against hints of length ≥ 4 so short noise tokens like "pl" (from
  // "p&l") don't accidentally swallow "Suppliers" → "financial-information".
  for (const { sectionKey, hints } of SHEET_SECTION_HINTS) {
    if (hints.some((h) => norm(h) === n)) return sectionKey;
  }
  let bestKey: string | null = null;
  let bestLen = 0;
  for (const { sectionKey, hints } of SHEET_SECTION_HINTS) {
    for (const h of hints) {
      const a = norm(h);
      if (a.length < 4) continue;
      if (n.includes(a) || a.includes(n)) {
        if (a.length > bestLen) {
          bestLen = a.length;
          bestKey = sectionKey;
        }
      }
    }
  }
  return bestKey;
}

function buildColumnAliases(col: ColumnDef): string[] {
  const aliases = [col.key, col.label];
  const label = col.label.replace(/\*+$/, "").trim();
  aliases.push(label);
  if (label.includes("—")) aliases.push(label.split("—")[0].trim());
  if (label.includes("(")) aliases.push(label.split("(")[0].trim());
  if (col.aliases) aliases.push(...col.aliases);
  return aliases;
}

function mapHeaderToKey(header: string, columns: ColumnDef[]): string | null {
  const h = norm(header);
  if (!h) return null;
  // First pass: exact normalised match — beats substring matches when both
  // would qualify (e.g. "Spend" vs "Total Spend" → prefer the exact "Spend").
  for (const col of columns) {
    for (const alias of buildColumnAliases(col)) {
      if (norm(alias) === h) return col.key;
    }
  }
  // Second pass: substring/contains match (looser).
  for (const col of columns) {
    for (const alias of buildColumnAliases(col)) {
      const a = norm(alias);
      if (!a) continue;
      if (h.includes(a) || a.includes(h)) return col.key;
    }
  }
  return null;
}

/**
 * Robust currency / numeric parser. Tolerates:
 *  - `R` / `$` / `€` / `£` prefix
 *  - thin/non-breaking spaces, plain spaces as thousands separators
 *  - parentheses indicating negatives `(1,234)`
 *  - either `,` or `.` as decimal separator (last separator wins)
 *  - mixed thousands + decimal e.g. `R 1,234.50` or `R 1.234,50`
 */
export function parseLooseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  const negative = /^-/.test(s) || /^\(.+\)$/.test(s);
  s = s
    .replace(/[Rr$€£]/g, "")
    .replace(/["'`]/g, "")
    .replace(/[\s\u00A0\u202F]/g, "")
    .replace(/[()]/g, "")
    .replace(/^[+-]/, "");
  if (!s || s === "." || s === ",") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const commaCount = (s.match(/,/g) || []).length;
    const after = s.length - lastComma - 1;
    if (commaCount === 1 && after !== 3) {
      // Single comma not followed by exactly 3 digits → decimal.
      normalized = s.replace(",", ".");
    } else {
      // Otherwise treat all commas as thousands separators.
      normalized = s.replace(/,/g, "");
    }
  } else if (lastDot >= 0) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      // e.g. 1.234.567 → European thousands → 1234567
      normalized = s.replace(/\./g, "");
    } else {
      // Single dot → keep as decimal (covers "1234.5" and "1.234" which we
      // intentionally read as 1.234, not 1234 — without ambiguity we trust
      // the user's punctuation).
      normalized = s;
    }
  } else {
    normalized = s;
  }
  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return negative && n > 0 ? -n : n;
}

function coerceValue(key: string, col: ColumnDef | undefined, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return "";
  if (col?.type === "boolean") {
    const s = String(raw).trim().toLowerCase();
    return s === "yes" || s === "true" || s === "1" || s === "y";
  }
  if (col?.type === "number") {
    const n = parseLooseNumber(raw);
    return n === null ? "" : n;
  }
  if (col?.type === "date") {
    if (raw instanceof Date) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, "0");
      const d = String(raw.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const parsed = parseWorkbookDate(raw);
    if (parsed) {
      const y = parsed.getUTCFullYear();
      const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const d = String(parsed.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(raw).trim();
  }
  if (col?.type === "select") {
    const s = String(raw).trim();
    const n = norm(s);
    if (col.key === "race") {
      const mapped = RACE_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "gender") {
      const mapped = GENDER_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "currentSize" || col.key === "sizeAtFirstProcurement") {
      const mapped = SUPPLIER_SIZE_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "occupationalLevel") {
      const mapped = OCC_LEVEL_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "bbbeeLevel") {
      const mapped = BBBEE_LEVEL_MAP[n];
      if (mapped) return mapped;
    }
    if (col.key === "industrySector") return s.toUpperCase();
    return s;
  }
  if (key === "industrySector") return String(raw).trim().toUpperCase();
  return String(raw).trim();
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] || [];
    const filled = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length;
    if (filled >= 2) return i;
  }
  return 0;
}

function parseMetaFromSheet(
  rows: unknown[][],
  columns: ColumnDef[],
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.length >= 2) {
      const label = String(row[0] ?? "").trim();
      const value = row[1];
      if (!label) continue;
      const key = mapHeaderToKey(label, columns);
      if (key) {
        const col = columns.find((c) => c.key === key);
        meta[key] = coerceValue(key, col, value);
      }
    }
  }
  return meta;
}

function parseGridFromSheet(
  rows: unknown[][],
  columns: ColumnDef[],
): WorkbookRow[] {
  if (rows.length < 2) return [];
  const headerIdx = findHeaderRow(rows);
  const headers = (rows[headerIdx] as unknown[]).map((h) => String(h ?? "").trim());
  const keyByCol: (string | null)[] = headers.map((h) => mapHeaderToKey(h, columns));

  const out: WorkbookRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const vals = rows[i] as unknown[];
    if (!vals || vals.every((v) => v === null || v === undefined || String(v).trim() === "")) continue;
    const row: WorkbookRow = { _id: uuidv4() };
    let hasData = false;
    keyByCol.forEach((key, colIdx) => {
      if (!key) return;
      const col = columns.find((c) => c.key === key);
      const val = coerceValue(key, col, vals[colIdx]);
      if (val !== "" && val !== null && val !== undefined) hasData = true;
      row[key] = val;
    });
    if (hasData) out.push(row);
  }
  return out;
}

function emptySections(): WorkbookSectionsInput {
  const sections: WorkbookSectionsInput = {};
  for (const s of SECTIONS) {
    if (!s.enabled) continue;
    sections[s.key] = s.meta ? { rows: [], meta: {} } : { rows: [] };
  }
  return sections;
}

function hasCriticalGaps(issues: WorkbookValidationIssue[]): boolean {
  return issues.some((issue) => {
    if (issue.sectionKey === "company-information" || issue.sectionKey === "financial-information") {
      if (issue.field && CRITICAL_META_KEYS.has(issue.field)) return true;
      if (issue.message.toLowerCase().includes("required")) return true;
    }
    if (issue.message.toLowerCase().includes("scorecard type")) return true;
    return false;
  });
}

export function normalizeExcelBuffer(buffer: ArrayBuffer): ExcelImportResult {
  const warnings: string[] = [];
  const mappedSheets: Record<string, string> = {};
  const sections = emptySections();

  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  for (const sheetName of wb.SheetNames) {
    const sectionKey = matchSheetName(sheetName);
    if (!sectionKey) {
      warnings.push(`Skipped unmapped sheet "${sheetName}".`);
      continue;
    }
    mappedSheets[sheetName] = sectionKey;
    const def = getSection(sectionKey);
    if (!def) continue;

    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];

    if (def.meta) {
      const meta = parseMetaFromSheet(matrix, def.meta);
      sections[sectionKey] = { rows: [], meta: { ...sections[sectionKey]?.meta, ...meta } };
    } else if (def.columns) {
      const rows = parseGridFromSheet(matrix, def.columns);
      const existing = sections[sectionKey]?.rows || [];
      sections[sectionKey] = { rows: [...existing, ...rows] };
    }
  }

  const validationIssues = validateWorkbook(sections);
  const criticalBlocked = hasCriticalGaps(validationIssues);

  return { sections, validationIssues, criticalBlocked, warnings, mappedSheets };
}

export async function normalizeExcelFile(file: File): Promise<ExcelImportResult> {
  const buffer = await file.arrayBuffer();
  return normalizeExcelBuffer(buffer);
}
