/**
 * NPAT deemed / Leibrandt logic for ESD/SED/Skills target bases.
 *
 * When current NPAT margin is below 25% of the industry norm:
 * 1. Find the most recent year (current + up to 5 prior) with margin >= 25% of norm.
 * 2. Indicative Profit Margin (Leibrandt) = qualifying NPAT / qualifying turnover.
 * 3. Effective NPAT = IPM × current turnover (turnover-based target).
 * 4. If no qualifying year within 5 years: deemed NPAT = turnover × industry norm %.
 *
 * Deemed NPAT (auto or manual override) requires prior-year history to be captured.
 */

export type FinancialYearRecord = {
  yearLabel?: string;
  revenue: number;
  npat: number;
};

export type NpatResolutionMethod =
  | "actual"
  | "leibrandt"
  | "industry-norm-deemed"
  | "override";

export type NpatResolutionResult = {
  effectiveNpat: number;
  deemedNpat: number;
  deemedNpatUsed: boolean;
  method: NpatResolutionMethod;
  /** Indicative profit margin (%) from the qualifying year used for Leibrandt. */
  indicativeProfitMarginPercent?: number;
  qualifyingYearLabel?: string;
  /** True when deemed logic was attempted but prior-year rows are missing. */
  priorYearsMissing?: boolean;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function blank(v: unknown): boolean {
  return v === "" || v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

export function extractPriorYearsFromMeta(finMeta: Record<string, unknown>): FinancialYearRecord[] {
  const years: FinancialYearRecord[] = [];
  for (let i = 1; i <= 5; i++) {
    const revenue = num(finMeta[`priorYear${i}Revenue`]);
    const npat = num(finMeta[`priorYear${i}Npat`]);
    const yearLabel = String(finMeta[`priorYear${i}Label`] ?? "").trim() || `Year -${i}`;
    if (revenue > 0 || npat !== 0) {
      years.push({ yearLabel, revenue, npat });
    }
  }
  return years;
}

export function hasPriorYearFinancialHistory(finMeta: Record<string, unknown>): boolean {
  return extractPriorYearsFromMeta(finMeta).length > 0;
}

export function marginPercent(npat: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return (npat / revenue) * 100;
}

/** True when current NPAT margin is below 25% of the industry norm (deemed NPAT / Leibrandt applies). */
export function isBelowIndustryNormQuarterThreshold(
  currentRevenue: number,
  currentNpat: number,
  industryNormPercent: number,
): boolean {
  if (industryNormPercent <= 0 || currentRevenue <= 0) return false;
  return marginPercent(currentNpat, currentRevenue) < industryNormPercent / 4;
}

/**
 * Resolve NPAT used for SD/ED/SED target calculations.
 */
export function resolveNpatForTargets(params: {
  currentRevenue: number;
  currentNpat: number;
  industryNormPercent: number;
  priorYears: FinancialYearRecord[];
  deemedNpatOverride?: unknown;
}): NpatResolutionResult {
  const { currentRevenue, currentNpat, industryNormPercent, priorYears } = params;
  const hasPriorYears = priorYears.length > 0;

  if (!blank(params.deemedNpatOverride)) {
    const override = num(params.deemedNpatOverride);
    if (!hasPriorYears) {
      return {
        effectiveNpat: currentNpat,
        deemedNpat: currentNpat,
        deemedNpatUsed: false,
        method: "actual",
        priorYearsMissing: true,
      };
    }
    return {
      effectiveNpat: override,
      deemedNpat: override,
      deemedNpatUsed: true,
      method: "override",
    };
  }

  if (industryNormPercent <= 0 || currentRevenue <= 0) {
    return {
      effectiveNpat: currentNpat,
      deemedNpat: currentNpat,
      deemedNpatUsed: false,
      method: "actual",
    };
  }

  const threshold = industryNormPercent / 4;
  const currentMargin = marginPercent(currentNpat, currentRevenue);

  if (currentMargin >= threshold) {
    return {
      effectiveNpat: currentNpat,
      deemedNpat: currentNpat,
      deemedNpatUsed: false,
      method: "actual",
    };
  }

  if (!hasPriorYears) {
    return {
      effectiveNpat: currentNpat,
      deemedNpat: currentNpat,
      deemedNpatUsed: false,
      method: "actual",
      priorYearsMissing: true,
    };
  }

  const timeline: FinancialYearRecord[] = [
    { yearLabel: "Current", revenue: currentRevenue, npat: currentNpat },
    ...priorYears.slice(0, 5),
  ];

  for (const yr of timeline) {
    if (yr.revenue <= 0) continue;
    const yrMargin = marginPercent(yr.npat, yr.revenue);
    if (yrMargin >= threshold) {
      const ipm = yr.npat / yr.revenue;
      const effectiveNpat = ipm * currentRevenue;
      return {
        effectiveNpat,
        deemedNpat: effectiveNpat,
        deemedNpatUsed: true,
        method: "leibrandt",
        indicativeProfitMarginPercent: yrMargin,
        qualifyingYearLabel: yr.yearLabel,
      };
    }
  }

  const deemed = currentRevenue * (industryNormPercent / 100);
  return {
    effectiveNpat: deemed,
    deemedNpat: deemed,
    deemedNpatUsed: true,
    method: "industry-norm-deemed",
  };
}
