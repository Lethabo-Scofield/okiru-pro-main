/**
 * Industry norm margin (%) lookup for deemed NPAT / Leibrandt.
 * Build flow uses practitioner industry labels; workbook uses B-BBEE sector codes.
 */

/**
 * Build / Toolkit industry dropdown → norm %.
 *
 * ONE source: the dated SARS/Stats-SA quarterly industry norms table.
 * This table previously carried round-number estimates that DISAGREED with it
 * (Transport 5 vs 2.69, Construction 4 vs 5.22, Mining 12 vs 16.25…), so the
 * deemed-NPAT outcome depended on which code path resolved the norm.
 * (Audit 2026-07-26 item 13.)
 * Energy is genuinely negative in the source quarter; resolveNpatForTargets
 * treats a non-positive norm as "no deeming applies".
 *
 * TRANSPORT UPDATED 2026-08-03 to 5.98% — the trailing-four-quarter NPAT/turnover
 * margin for "Transport Storage and Communication Industry" from Stats SA P0044
 * Quarterly Financial Statistics (March 2026): NPAT 69,597 ÷ turnover 1,163,164.
 * The old 2.69% (Q3 2023) understated deemed NPAT, which inflated SED/ED scores
 * (a lower norm = smaller 1%-NPAT target). See docs/NPAT industries norms.xlsx.
 * The OTHER industries here are still on the older quarter — refresh them from the
 * same P0044 release when revisited.
 */
const BUILD_INDUSTRY_NORMS: Record<string, number> = {
  Retail: 4.29,
  Manufacturing: 4.58,
  "IT Services": 10,
  "Financial Services": 15,
  Construction: 5.22,
  Agriculture: 8,
  Mining: 16.25,
  Transport: 5.98,
  Hospitality: 5,
  Healthcare: 8,
  Education: 10,
  "Professional Services": 20,
  "Real Estate": 8.24,
  Telecommunications: 10,
  Energy: -4.64,
  Other: 5.58,
};

/** B-BBEE sector code → default SARS-style norm % (aligned with sectorConfig STANDARD_INDUSTRY_NORMS). */
const SECTOR_INDUSTRY_NORMS: Record<string, number> = {
  RCOGP: 5.58,
  ICT: 10,
  FSC: 15,
  AGRI: 8,
  TRANSPORT: 5.98,
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
