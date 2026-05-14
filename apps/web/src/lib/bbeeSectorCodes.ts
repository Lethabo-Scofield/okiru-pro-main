const VALID_SECTOR_CODES = new Set(['RCOGP', 'ICT', 'FSC', 'AGRI', 'TRANSPORT']);

/** Normalize sector codes used when mapping toolkit extraction into foundation state. */
export function normalizeSectorCodeForExtraction(raw: string): string {
  const t = (raw || '').trim().toUpperCase();
  if (VALID_SECTOR_CODES.has(t)) return t;
  return 'RCOGP';
}
