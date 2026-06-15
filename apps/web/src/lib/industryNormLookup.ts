/**
 * Industry norm margin (%) lookup for deemed NPAT / Leibrandt.
 * Build flow uses practitioner industry labels; workbook uses B-BBEE sector codes.
 */

/** Build / Toolkit industry dropdown → norm % (TOOLKIT_TAB_MAP reference values). */
const BUILD_INDUSTRY_NORMS: Record<string, number> = {
  Retail: 4,
  Manufacturing: 6,
  "IT Services": 10,
  "Financial Services": 15,
  Construction: 4,
  Agriculture: 6,
  Mining: 12,
  Transport: 5,
  Hospitality: 8,
  Healthcare: 10,
  Education: 5,
  "Professional Services": 12,
  "Real Estate": 15,
  Telecommunications: 12,
  Energy: 15,
  Other: 6,
};

/** B-BBEE sector code → default SARS-style norm % (aligned with sectorConfig STANDARD_INDUSTRY_NORMS). */
const SECTOR_INDUSTRY_NORMS: Record<string, number> = {
  RCOGP: 5.58,
  ICT: 10,
  FSC: 15,
  AGRI: 8,
  TRANSPORT: 2.69,
  CONSTRUCTION: 5.22,
};

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Resolve industry norm margin (%) from industry label and/or sector code.
 * Sector code takes precedence when both are supplied (workbook path).
 */
export function lookupIndustryNormPercent(
  industry?: string,
  sectorCode?: string,
): number | undefined {
  const sector = String(sectorCode ?? "").trim().toUpperCase();
  if (sector && SECTOR_INDUSTRY_NORMS[sector] != null) {
    return SECTOR_INDUSTRY_NORMS[sector];
  }

  const ind = String(industry ?? "").trim();
  if (!ind) return undefined;

  if (BUILD_INDUSTRY_NORMS[ind] != null) {
    return BUILD_INDUSTRY_NORMS[ind];
  }

  const key = normKey(ind);
  for (const [label, pct] of Object.entries(BUILD_INDUSTRY_NORMS)) {
    if (normKey(label) === key) return pct;
  }

  return BUILD_INDUSTRY_NORMS.Other;
}

export { BUILD_INDUSTRY_NORMS };
