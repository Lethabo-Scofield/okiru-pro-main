/** Canonical FSC sub-sector codes used by calculator routing. */
export type FscSubSectorCode = 'Others' | 'Banks' | 'LTI' | 'STI';

/** Workbook / toolkit display labels for the sub-sector picker. */
export const FSC_SUB_SECTOR_LABELS = [
  'Others',
  'Banks',
  'Long-Term Insurers',
  'Short-Term Insurers',
] as const;

/**
 * Normalise workbook or API sub-sector values to canonical calculator codes.
 * Workbook uses full labels; store/routing uses Banks / LTI / STI / Others.
 */
export function normalizeFscSubSector(raw?: string | null): FscSubSectorCode {
  const v = String(raw ?? '').trim();
  if (v === 'Banks') return 'Banks';
  if (v === 'LTI' || v === 'Long-Term Insurers') return 'LTI';
  if (v === 'STI' || v === 'Short-Term Insurers') return 'STI';
  return 'Others';
}

export function fscSubSectorHasAfs(code: FscSubSectorCode): boolean {
  return code === 'Banks' || code === 'LTI' || code === 'STI';
}

export function fscSubSectorDisplayLabel(code: FscSubSectorCode): string {
  switch (code) {
    case 'Banks': return 'Banks (FS701)';
    case 'LTI': return 'Long-Term Insurers (FS702)';
    case 'STI': return 'Short-Term Insurers (FS703)';
    default: return 'Others (FS700)';
  }
}
