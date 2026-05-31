function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function s(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function blank(v: unknown): boolean {
  return v === "" || v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

export type WorkbookClientFinancials = {
  revenue: number;
  npat: number;
  leviableAmount: number;
  tmps: number;
  industrySector?: string;
  scorecardType?: string;
  annualTurnover: number;
  /** NPAT used for ESD/SED target bases (actual, deemed, or override). */
  effectiveNpat?: number;
  deemedNpat?: number;
  deemedNpatUsed?: boolean;
  industryNormPercent?: number;
  /** Group-level leviable amount from cover sheet (grey cell). */
  groupLeviableAmount?: number;
  /** Measured financial period start/end from cover sheet (grey cells). */
  measurementPeriodStart?: string;
  measurementPeriodEnd?: string;
  /** Skills scorecard aggregate inputs (grey cells). */
  eapProvince?: string;
  eapYear?: number;
  headcount?: number;
  trainingManagerSalary?: number;
  trainingOverheadCost?: number;
  selectPeriod?: string;
  dataDate?: string;
  /** MC layout toggle from company-information meta. */
  combineExcoSenior?: boolean;
  /** Ownership net-value inputs from financial-information meta. */
  companyValue?: number;
  outstandingDebt?: number;
  /**
   * AGRI-specific: whether farm workers are included in the Designated Groups
   * indicator for Ownership (4% EI target, 3 pts). From company-information meta.
   */
  farmWorkersIncluded?: boolean;
  /**
   * FSC-specific: sub-sector variant (Others / Banks / Long-Term Insurers /
   * Short-Term Insurers). Drives which EF/AFS scorecard sheets apply.
   */
  fscSubSector?: string;
  /**
   * FSC-specific CE (Consumer Education) aggregate inputs from SED & CE meta.
   * ceSpend: 0.4% NPAT target = 2 pts.
   * ceBonusSpend: additional 0.1% NPAT = 1 bonus pt.
   * fundisaSpend: Fundisa grant 0.2% NPAT = 2 bonus pts.
   */
  ceSpend?: number;
  ceBonusSpend?: number;
  fundisaSpend?: number;
};

function resolveEffectiveNpat(
  revenue: number,
  npat: number,
  finMeta: Record<string, unknown>,
): { effectiveNpat: number; deemedNpat: number; deemedNpatUsed: boolean } {
  const override = finMeta.deemedNpatOverride;
  if (!blank(override)) {
    const n = num(override);
    return { effectiveNpat: n, deemedNpat: n, deemedNpatUsed: true };
  }

  const industryNorm = num(finMeta.industryNormPercent);
  if (industryNorm > 0 && revenue > 0) {
    const actualMargin = (npat / revenue) * 100;
    const threshold = industryNorm / 4;
    if (actualMargin < threshold) {
      const deemed = revenue * (industryNorm / 100);
      return { effectiveNpat: deemed, deemedNpat: deemed, deemedNpatUsed: true };
    }
  }

  return { effectiveNpat: npat, deemedNpat: npat, deemedNpatUsed: false };
}

function resolveTmps(finMeta: Record<string, unknown>): number {
  const basis = s(finMeta.tmpsBasis).trim().toLowerCase();
  const projected = num(finMeta.forecastTmps);
  const actual = num(finMeta.tmps);
  if (basis === "projected" && projected > 0) return projected;
  if (actual > 0) return actual;
  return projected;
}

/**
 * Maps workbook meta sections to client fields used by the scoring engine.
 *
 * @param finMeta     financial-information section meta
 * @param companyMeta company-information section meta
 * @param skillsMeta  skills-development section meta (optional)
 * @param sedMeta     sed section meta (optional; used for FSC CE inputs)
 */
export function mapWorkbookFinancialsToClient(
  finMeta: Record<string, unknown>,
  companyMeta: Record<string, unknown>,
  skillsMeta?: Record<string, unknown>,
  sedMeta?: Record<string, unknown>,
): WorkbookClientFinancials {
  // Skills section leviable amount overrides financial payroll when explicitly set (> 0).
  const skillsLeviable = skillsMeta ? num(skillsMeta.leviableAmount) : 0;

  const revenue = num(finMeta.forecastRevenue) || num(finMeta.revenue);
  const npat =
    finMeta.forecastNpat !== "" && finMeta.forecastNpat != null
      ? num(finMeta.forecastNpat)
      : num(finMeta.npat);

  const npatResolved = resolveEffectiveNpat(revenue, npat, finMeta);

  const result: WorkbookClientFinancials = {
    revenue,
    npat: npatResolved.effectiveNpat,
    effectiveNpat: npatResolved.effectiveNpat,
    deemedNpat: npatResolved.deemedNpat,
    deemedNpatUsed: npatResolved.deemedNpatUsed,
    leviableAmount:
      skillsLeviable > 0
        ? skillsLeviable
        : num(finMeta.forecastPayroll) ||
          num(finMeta.leviableAmount) ||
          num(finMeta.payroll),
    tmps: resolveTmps(finMeta),
    industrySector: s(companyMeta.industrySector) || undefined,
    scorecardType: s(companyMeta.scorecardType) || undefined,
    annualTurnover: revenue,
  };

  if (!blank(finMeta.industryNormPercent)) {
    result.industryNormPercent = num(finMeta.industryNormPercent);
  }
  if (!blank(finMeta.companyValueToUse)) {
    result.companyValue = num(finMeta.companyValueToUse);
  }
  if (!blank(finMeta.outstandingDebt)) {
    result.outstandingDebt = num(finMeta.outstandingDebt);
  }

  // Cover-sheet global inputs.
  if (!blank(companyMeta.groupLeviableAmount)) {
    result.groupLeviableAmount = num(companyMeta.groupLeviableAmount);
  }
  if (!blank(companyMeta.measurementPeriodStart)) {
    result.measurementPeriodStart = s(companyMeta.measurementPeriodStart);
  }
  if (!blank(companyMeta.measurementPeriodEnd)) {
    result.measurementPeriodEnd = s(companyMeta.measurementPeriodEnd);
  }
  if (companyMeta.combineExcoSenior !== undefined) {
    result.combineExcoSenior = Boolean(companyMeta.combineExcoSenior);
  }

  // Skills aggregate inputs.
  if (skillsMeta) {
    const ep = s(skillsMeta.eapProvince);
    if (ep) result.eapProvince = ep;

    const ey = num(skillsMeta.eapYear);
    if (ey > 0) result.eapYear = ey;

    const hc = num(skillsMeta.headcount);
    if (hc > 0) result.headcount = hc;

    if (!blank(skillsMeta.trainingManagerSalary)) {
      result.trainingManagerSalary = num(skillsMeta.trainingManagerSalary);
    }
    if (!blank(skillsMeta.trainingOverheadCost)) {
      result.trainingOverheadCost = num(skillsMeta.trainingOverheadCost);
    }

    const sp = s(skillsMeta.selectPeriod);
    if (sp) result.selectPeriod = sp;

    const dd = s(skillsMeta.dataDate);
    if (dd) result.dataDate = dd;
  }

  // AGRI-specific: farm workers in designated groups flag (company-information meta).
  if (companyMeta.farmWorkersIncluded !== undefined) {
    result.farmWorkersIncluded = Boolean(companyMeta.farmWorkersIncluded);
  }

  // FSC-specific: sub-sector variant (company-information meta).
  const fscSub = s(companyMeta.fscSubSector);
  if (fscSub) result.fscSubSector = fscSub;

  // FSC-specific: Consumer Education aggregate inputs (sed section meta).
  if (sedMeta) {
    if (!blank(sedMeta.ceSpend)) result.ceSpend = num(sedMeta.ceSpend);
    if (!blank(sedMeta.ceBonusSpend)) result.ceBonusSpend = num(sedMeta.ceBonusSpend);
    if (!blank(sedMeta.fundisaSpend)) result.fundisaSpend = num(sedMeta.fundisaSpend);
  }

  return result;
}
