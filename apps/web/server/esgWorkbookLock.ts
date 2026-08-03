/**
 * Submit/reopen state transitions for an ESG workbook.
 *
 * Kept in its own module (no route/DB imports) so the semantics are unit
 * testable — importing esgWorkbookRoutes pulls in the whole server bootstrap.
 */

export type LockableWorkbook = {
  sections: Record<string, { cells: Record<string, unknown> }>;
  submittedAt?: string | null;
};

export const ESG_SUBMITTED_AT_CELL = "_submittedAt";
export const ESG_REOPENED_AT_CELL = "_reopenedAt";
export const ESG_REOPENED_BY_CELL = "_reopenedBy";
export const ESG_PREVIOUSLY_SUBMITTED_CELL = "_previouslySubmittedAt";

export function canReopenEsgWorkbook(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

function assumptionCells(wb: LockableWorkbook): Record<string, unknown> {
  wb.sections.assumptions = wb.sections.assumptions ?? { cells: {} };
  return wb.sections.assumptions.cells as Record<string, unknown>;
}

/** Locks the workbook: mirrors the timestamp onto the assumptions cells. */
export function applyEsgWorkbookSubmit(wb: LockableWorkbook, submittedAt: string): void {
  wb.submittedAt = submittedAt;
  assumptionCells(wb)[ESG_SUBMITTED_AT_CELL] = submittedAt;
}

/**
 * Reopens a submitted workbook and records an audit trail of the reopen.
 * Returns the timestamp it was previously submitted at, or null if it was
 * never locked (in which case this is a no-op).
 */
export function applyEsgWorkbookReopen(
  wb: LockableWorkbook,
  reopenedBy: string,
  reopenedAt: string,
): string | null {
  const previouslySubmittedAt = wb.submittedAt ?? null;
  if (!previouslySubmittedAt) return null;
  wb.submittedAt = null;
  const cells = assumptionCells(wb);
  delete cells[ESG_SUBMITTED_AT_CELL];
  cells[ESG_REOPENED_AT_CELL] = reopenedAt;
  cells[ESG_REOPENED_BY_CELL] = reopenedBy;
  cells[ESG_PREVIOUSLY_SUBMITTED_CELL] = previouslySubmittedAt;
  return previouslySubmittedAt;
}
