/**
 * NPAT deemed / Leibrandt logic (API pipeline mirror of apps/web/src/lib/npatDeemedCalculation.ts).
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
  indicativeProfitMarginPercent?: number;
  qualifyingYearLabel?: string;
  priorYearsMissing?: boolean;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function blank(v: unknown): boolean {
  return v === "" || v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

export function marginPercent(npat: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return (npat / revenue) * 100;
}

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
