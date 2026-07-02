// CONSTRUCTION was missing — uploads with sectorCode "CONSTRUCTION" silently
// fell through to the "return RCOGP" default and were scored on the wrong
// scorecard (audit B10). The construction engine is live in apps/api/pipeline/
// constructionIndicators.ts + the Toolkit calculator path, so the code is
// safe to recognise here.
const VALID_SECTOR_CODES = new Set(['RCOGP', 'ICT', 'FSC', 'AGRI', 'TRANSPORT', 'CONSTRUCTION']);

/** Normalize sector codes used when mapping toolkit extraction into foundation state. */
export function normalizeSectorCodeForExtraction(raw: string): string {
  const t = (raw || '').trim().toUpperCase();
  if (VALID_SECTOR_CODES.has(t)) return t;
  return 'RCOGP';
}
