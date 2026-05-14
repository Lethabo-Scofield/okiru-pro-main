import { API_BASE } from "@toolkit/lib/config";

/** Shared row shape aligned with `/api/sectors/options` and build forms */
export interface BbeeSectorOptionRow {
  value: string;
  label: string;
  code: string;
  hasQSE: boolean;
  availableTypes: string[];
}

const FALLBACK_ROWS: BbeeSectorOptionRow[] = [
  { value: "RCOGP", label: "Revised Codes of Good Practice (RCOGP)", code: "RCOGP", hasQSE: true, availableTypes: ["Generic", "QSE"] },
  { value: "ICT", label: "ICT Sector Code", code: "ICT", hasQSE: true, availableTypes: ["Generic", "QSE"] },
  { value: "FSC", label: "Financial Sector Code (FSC)", code: "FSC", hasQSE: false, availableTypes: ["Generic"] },
  { value: "AGRI", label: "AgriBEE Sector Code", code: "AGRI", hasQSE: false, availableTypes: ["Generic"] },
  { value: "TRANSPORT", label: "Transport Sector Code", code: "TRANSPORT", hasQSE: true, availableTypes: ["Generic", "QSE"] },
];

let cachedRows: BbeeSectorOptionRow[] | null = null;
/** True only when cached rows came from a healthy API response */
let cachedFromLiveApi = false;

export function invalidateBbeeSectorOptionsCache(): void {
  cachedRows = null;
  cachedFromLiveApi = false;
}

function normalizeRow(option: unknown): BbeeSectorOptionRow | null {
  if (!option || typeof option !== "object") return null;
  const o = option as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code : typeof o.value === "string" ? o.value : "";
  if (!code) return null;
  const label = typeof o.label === "string" && o.label.trim() ? o.label : code;
  const availableTypes = Array.isArray(o.availableTypes) ? o.availableTypes.filter((t): t is string => typeof t === "string") : [];
  return {
    value: code,
    code,
    label,
    hasQSE: Boolean(o.hasQSE),
    availableTypes,
  };
}

/**
 * Loads sector dropdown rows from `/api/sectors/options` with in-memory caching.
 * Survives non-JSON error bodies, HTTP errors with embedded options, and proxies down.
 */
export async function loadBbeeSectorOptionRows(opts?: {
  reload?: boolean;
  signal?: AbortSignal;
}): Promise<{
  rows: BbeeSectorOptionRow[];
  fromLiveApi: boolean;
  httpStatus: number | null;
  detail?: string;
}> {
  if (!opts?.reload && cachedRows?.length) {
    return { rows: cachedRows, fromLiveApi: cachedFromLiveApi, httpStatus: null };
  }

  const url = `${API_BASE}/api/sectors/options`;
  try {
    const response = await fetch(url, { signal: opts?.signal });
    const httpStatus = response.status;
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const rawOptions = body.options;
    const rowsRaw = Array.isArray(rawOptions) ? rawOptions : [];
    const rows = rowsRaw.map(normalizeRow).filter((r): r is BbeeSectorOptionRow => r !== null);

    if (response.ok && body.success !== false && rows.length > 0) {
      cachedRows = rows;
      cachedFromLiveApi = true;
      return { rows, fromLiveApi: true, httpStatus };
    }

    const msg =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : rows.length === 0
            ? `Sectors request failed (${httpStatus}).`
            : undefined;

    if (rows.length > 0) {
      cachedRows = rows;
      cachedFromLiveApi = false;
      return { rows, fromLiveApi: false, httpStatus, detail: msg };
    }

    cachedRows = null;
    cachedFromLiveApi = false;
    return { rows: [...FALLBACK_ROWS], fromLiveApi: false, httpStatus, detail: msg || `Unreachable or empty (${httpStatus}).` };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Network error";
    cachedRows = null;
    cachedFromLiveApi = false;
    return { rows: [...FALLBACK_ROWS], fromLiveApi: false, httpStatus: null, detail };
  }
}

export const BBEE_SECTOR_FALLBACK_ROWS: ReadonlyArray<BbeeSectorOptionRow> = FALLBACK_ROWS;
