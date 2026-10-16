/**
 * NPAT deemed / Leibrandt logic for ESD/SED/Skills target bases.
 *
 * Toolkit sectors follow the Empower toolkit exactly (see resolveNpatForTargets):
 * the larger of current NPAT and the current + 4-year average stands unless it
 * is below revenue × norm ÷ 4; then the smallest qualifying year margin × revenue,
 * floored at revenue × norm ÷ 4. Transport keeps the full-norm fallback its
 * verified certificates use.
 */

export type FinancialYearRecord = {
  yearLabel?: string;
  revenue: number;
  npat: number;
};

export type NpatResolutionMethod =
  | "actual"
  | "five-year-average"
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
 * Resolve NPAT used for SD/ED/SED target calculations — the Empower toolkit's
 * rule ('Financials'!C11:C17 → 'Client Information'!C23):
 *
 *   base       = MAX(average NPAT of the current + up to 4 prior years, current NPAT)
 *   indicative = revenue × industry norm ÷ 4
 *   if base ≥ indicative → deemed NPAT = base
 *   otherwise            → deemed NPAT = MAX(smallest year margin strictly above
 *                          norm ÷ 4 × revenue, indicative)
 *   a manual deemed NPAT always wins.
 *
 * `fallbackBasis: 'fullNorm'` keeps the certificate-backed Transport practice
 * (deemed = revenue × the FULL norm when nothing qualifies); the toolkit
 * sectors use a quarter of the norm.
 */
export function resolveNpatForTargets(params: {
  currentRevenue: number;
  currentNpat: number;
  industryNormPercent: number;
  priorYears: FinancialYearRecord[];
  deemedNpatOverride?: unknown;
  fallbackBasis?: "quarterNorm" | "fullNorm";
}): NpatResolutionResult {
  if (params.fallbackBasis !== "fullNorm") return resolveNpatToolkit(params);
  return resolveNpatFullNormFallback(params);
}

function resolveNpatToolkit(params: {
  currentRevenue: number;
  currentNpat: number;
  industryNormPercent: number;
  priorYears: FinancialYearRecord[];
  deemedNpatOverride?: unknown;
}): NpatResolutionResult {
  const { currentRevenue, currentNpat, industryNormPercent } = params;
  if (!blank(params.deemedNpatOverride)) {
    const override = num(params.deemedNpatOverride);
    return { effectiveNpat: override, deemedNpat: override, deemedNpatUsed: true, method: "override" };
  }

  const years: FinancialYearRecord[] = [
    { yearLabel: "Current", revenue: currentRevenue, npat: currentNpat },
    ...params.priorYears.slice(0, 4),
  ];
  const average = years.reduce((sum, y) => sum + y.npat, 0) / years.length;
  const base = Math.max(average, currentNpat);
  const baseMethod: NpatResolutionMethod = base > currentNpat ? "five-year-average" : "actual";
  const quarterNorm = industryNormPercent / 100 / 4;
  const indicative = currentRevenue * quarterNorm;

  if (base >= indicative) {
    return {
      effectiveNpat: base,
      deemedNpat: base,
      deemedNpatUsed: baseMethod !== "actual",
      method: baseMethod,
      ...(params.priorYears.length === 0 ? { priorYearsMissing: true } : {}),
    };
  }

  const qualifying = years
    .filter((y) => y.revenue > 0)
    .map((y) => ({ year: y, margin: y.npat / y.revenue }))
    .filter((q) => q.margin > quarterNorm)
    .sort((a, b) => a.margin - b.margin);
  const smallest = qualifying[0];
  const fromMargin = smallest ? smallest.margin * currentRevenue : 0;
  const deemed = Math.max(fromMargin, indicative);
  const usedMargin = smallest !== undefined && fromMargin >= indicative;
  return {
    effectiveNpat: deemed,
    deemedNpat: deemed,
    deemedNpatUsed: true,
    method: usedMargin ? "leibrandt" : "industry-norm-deemed",
    indicativeProfitMarginPercent: usedMargin ? smallest.margin * 100 : industryNormPercent / 4,
    ...(usedMargin ? { qualifyingYearLabel: smallest.year.yearLabel } : {}),
    ...(params.priorYears.length === 0 ? { priorYearsMissing: true } : {}),
  };
}

/** The pre-toolkit rule, kept for Transport (certificate BE13609 practice). */
function resolveNpatFullNormFallback(params: {
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
    // No 5-year AFS to find an indicative margin from a past profitable year.
    // The Codes still provide for a DEEMED NPAT off the industry (Stats SA) norm
    // — revenue × norm — rather than penalising a loss-making entity with a
    // zero/negative target that scores its real SED/ED contribution as 0. This is
    // the SAME industry-norm-deemed method applied below when prior years exist
    // but none qualify; it must apply when there are no prior years at all.
    // (Certificate BE13609 deemed Thandanani's NPAT this way; without it a live
    // SED contribution of R6,500 scored 0 for want of a positive target.)
    const deemed = currentRevenue * (industryNormPercent / 100);
    return {
      effectiveNpat: deemed,
      deemedNpat: deemed,
      deemedNpatUsed: true,
      method: "industry-norm-deemed",
      indicativeProfitMarginPercent: industryNormPercent,
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
