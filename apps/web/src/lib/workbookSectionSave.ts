export type WorkbookSectionSaveBody = {
  rows?: Array<Record<string, unknown> & { _id: string }>;
  meta?: Record<string, unknown>;
};

type WorkbookSectionSnapshot = {
  rows?: WorkbookSectionSaveBody["rows"];
  meta?: Record<string, unknown>;
};

/**
 * Merges a partial section save with pending/workbook state so row-only or meta-only
 * updates do not wipe the other half of hybrid sections (e.g. skills-development).
 */
export function mergeWorkbookSectionSaveBody(
  pending: WorkbookSectionSaveBody | undefined,
  incoming: WorkbookSectionSaveBody,
  fromWorkbook?: WorkbookSectionSnapshot,
): WorkbookSectionSaveBody {
  const rows =
    incoming.rows !== undefined
      ? incoming.rows
      : pending?.rows !== undefined
        ? pending.rows
        : fromWorkbook?.rows ?? [];

  const meta =
    incoming.meta !== undefined
      ? incoming.meta
      : pending?.meta !== undefined
        ? pending.meta
        : fromWorkbook?.meta;

  return meta !== undefined ? { rows, meta } : { rows };
}
