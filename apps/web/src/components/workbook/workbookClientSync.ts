function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function s(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

export type WorkbookClientFinancials = {
  revenue: number;
  npat: number;
  leviableAmount: number;
  tmps: number;
  industrySector?: string;
  scorecardType?: string;
  annualTurnover: number;
};

/** Maps workbook meta to client fields used by the scoring engine. */
export function mapWorkbookFinancialsToClient(
  finMeta: Record<string, unknown>,
  companyMeta: Record<string, unknown>,
): WorkbookClientFinancials {
  return {
    revenue: num(finMeta.forecastRevenue) || num(finMeta.revenue),
    npat:
      finMeta.forecastNpat !== "" && finMeta.forecastNpat != null
        ? num(finMeta.forecastNpat)
        : num(finMeta.npat),
    leviableAmount:
      num(finMeta.forecastPayroll) ||
      num(finMeta.leviableAmount) ||
      num(finMeta.payroll),
    tmps: num(finMeta.tmps),
    industrySector: s(companyMeta.industrySector) || undefined,
    scorecardType: s(companyMeta.scorecardType) || undefined,
    annualTurnover: num(finMeta.forecastRevenue) || num(finMeta.revenue),
  };
}
