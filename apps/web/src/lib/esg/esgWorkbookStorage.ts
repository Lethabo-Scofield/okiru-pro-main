import { API_BASE } from "@toolkit/lib/config";
import { ESG_SECTION_IDS } from "./esgSections";

export type EsgWorkbookSection = {
  cells: Record<string, string | number | boolean | null>;
};

export type EsgWorkbookData = {
  companyId: string;
  sections: Record<string, EsgWorkbookSection>;
  updatedAt: string;
  submittedAt?: string | null;
};

const LS_PREFIX = "okiru-esg-workbook:";

function lsKey(companyId: string): string {
  return `${LS_PREFIX}${companyId}`;
}

export function loadEsgWorkbookLocal(companyId: string): EsgWorkbookData | null {
  try {
    const raw = localStorage.getItem(lsKey(companyId));
    if (!raw) return null;
    return JSON.parse(raw) as EsgWorkbookData;
  } catch {
    return null;
  }
}

export function saveEsgWorkbookLocal(data: EsgWorkbookData): void {
  try {
    localStorage.setItem(lsKey(data.companyId), JSON.stringify(data));
  } catch {
    // quota / private mode
  }
}

export function emptyEsgWorkbook(companyId: string): EsgWorkbookData {
  const sections: Record<string, EsgWorkbookSection> = {};
  for (const id of ESG_SECTION_IDS) {
    sections[id] = { cells: {} };
  }
  return { companyId, sections, updatedAt: new Date().toISOString() };
}

export async function fetchEsgWorkbook(companyId: string): Promise<EsgWorkbookData> {
  try {
    const res = await fetch(`${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as EsgWorkbookData;
      saveEsgWorkbookLocal(data);
      return data;
    }
  } catch {
    // fall through to local
  }
  return loadEsgWorkbookLocal(companyId) ?? emptyEsgWorkbook(companyId);
}

export async function saveEsgWorkbookSection(
  companyId: string,
  sectionId: string,
  cells: Record<string, string | number | boolean | null>,
  baseWorkbook?: EsgWorkbookData | null,
): Promise<EsgWorkbookData> {
  const current =
    baseWorkbook ??
    loadEsgWorkbookLocal(companyId) ??
    emptyEsgWorkbook(companyId);
  const next: EsgWorkbookData = {
    ...current,
    companyId,
    sections: {
      ...current.sections,
      [sectionId]: { cells },
    },
    updatedAt: new Date().toISOString(),
  };
  saveEsgWorkbookLocal(next);
  const res = await fetch(
    `${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/section/${sectionId}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cells }),
    },
  );
  if (!res.ok) {
    throw new Error(`ESG section save failed (${res.status})`);
  }
  return next;
}

/** Read a cell value from saved workbook sections (sheet-style refs e.g. "D30" or "G35"). */
export function readEsgCell(
  workbook: EsgWorkbookData | null | undefined,
  sectionId: string,
  cellRef: string,
): number | null {
  const raw = workbook?.sections?.[sectionId]?.cells?.[cellRef];
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read a cell as raw TEXT (trimmed). Use for text inputs (entity name, "Yes"/
 * "No" statuses, sector) — `readEsgCell` number-coerces, so a filled text value
 * reads as null and rules like "Entity name required" fire on a filled entity,
 * permanently blocking submit. Returns "" when absent.
 */
export function readEsgText(
  workbook: EsgWorkbookData | null | undefined,
  sectionId: string,
  cellRef: string,
): string {
  const raw = workbook?.sections?.[sectionId]?.cells?.[cellRef];
  return raw == null ? "" : String(raw).trim();
}
