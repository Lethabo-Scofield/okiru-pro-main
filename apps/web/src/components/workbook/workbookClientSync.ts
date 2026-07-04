import {
  extractPriorYearsFromMeta,
  resolveNpatForTargets,
  type NpatResolutionMethod,
} from "@/lib/npatDeemedCalculation";
import { lookupIndustryNormPercent } from "@/lib/industryNormLookup";
import { coerceYesNo } from "@/lib/yesNoValue";

function num(v: unknown): number {
  // Tolerant parse: "1,000,000" / "R 1 000 000" / "60%" are NaN under Number() and
  // previously coerced to 0, silently zeroing revenue/npat/payroll/tmps from
  // text-formatted Excel cells. Strip currency, thousands separators and "%".
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  const cleaned = String(v).replace(/\s/g, "").replace(/[R$,%]/gi, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function s(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function blank(v: unknown): boolean {
  return v === "" || v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/** Map workbook FSC sub-sector labels to canonical store codes. */
export function normalizeFscSubSector(raw?: string | null): string {
  const v = String(raw ?? "").trim();
  if (v === "Banks") return "Banks";
  if (v === "LTI" || v === "Long-Term Insurers") return "LTI";
  if (v === "STI" || v === "Short-Term Insurers") return "STI";
  return v || "Others";
}

export type WorkbookClientFinancials = {
  revenue: number;
  npat: number;
  /** Always derived as `payroll × 1%` — never a user-entered value. */
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
  /** FSC Reinsurer flag — reduces CE scoring. */
  fscReinsurer?: boolean;
  /**
   * FSC AFS aggregate inputs (afs-additions section meta; legacy workbooks may
   * still store these on financial-information).
   */
  afs?: Record<string, unknown>;
  /**
   * FSC-specific: prior financial year revenue. FSC SED/income scoring uses
   * prior year income rather than current year income.
   */
  priorYearRevenue?: number;
  npatResolutionMethod?: NpatResolutionMethod;
  indicativeProfitMarginPercent?: number;
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

function resolveIndustryNormFromMeta(
  finMeta: Record<string, unknown>,
  companyMeta: Record<string, unknown>,
): number {
  const stored = num(finMeta.industryNormPercent);
  if (stored > 0) return stored;
  const sector = s(companyMeta.industrySector).trim();
  return lookupIndustryNormPercent(undefined, sector) ?? 0;
}

function resolveEffectiveNpat(
  revenue: number,
  npat: number,
  finMeta: Record<string, unknown>,
  companyMeta: Record<string, unknown>,
): {
  effectiveNpat: number;
  deemedNpat: number;
  deemedNpatUsed: boolean;
  npatResolutionMethod?: NpatResolutionMethod;
  indicativeProfitMarginPercent?: number;
  priorYearsMissing?: boolean;
} {
  const industryNormPercent = resolveIndustryNormFromMeta(finMeta, companyMeta);
  const resolved = resolveNpatForTargets({
    currentRevenue: revenue,
    currentNpat: npat,
    industryNormPercent,
    priorYears: extractPriorYearsFromMeta(finMeta),
    deemedNpatOverride: finMeta.deemedNpatOverride,
  });
  return {
    effectiveNpat: resolved.effectiveNpat,
    deemedNpat: resolved.deemedNpat,
    deemedNpatUsed: resolved.deemedNpatUsed,
    npatResolutionMethod: resolved.method,
    indicativeProfitMarginPercent: resolved.indicativeProfitMarginPercent,
    priorYearsMissing: resolved.priorYearsMissing,
  };
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
  afsMeta?: Record<string, unknown>,
): WorkbookClientFinancials {
  const revenue = num(finMeta.revenue);
  const npat = num(finMeta.npat);
  const payroll = num(finMeta.payroll);

  // Leviable Amount for Skills = Total Payroll (the skills-levy BASE), NOT the
  // 1% SDL levy. Verified against the test workbooks: e.g. Kgodiso Financials
  // has "Total Payroll (R) 96,000,000" and "Leviable Amount for Skills (R)
  // 96,000,000" as the SAME value, and "Skills spend on black people 6.0% of
  // leviable = R5,760,000" (= 6% × 96M). The previous `payroll × 0.01` computed
  // the levy, making every live skills target 100× too small (targets trivially
  // met → skills over-scored). The harness path already used full payroll as
  // leviable, which is why headless fitness was correct while live was not.
  const leviableAmount = payroll;

  const npatResolved = resolveEffectiveNpat(revenue, npat, finMeta, companyMeta);
  const industryNormResolved = resolveIndustryNormFromMeta(finMeta, companyMeta);

  const sectorCode = s(companyMeta.industrySector).trim().toUpperCase();

  const result: WorkbookClientFinancials = {
    revenue,
    npat: npatResolved.effectiveNpat,
    effectiveNpat: npatResolved.effectiveNpat,
    deemedNpat: npatResolved.deemedNpat,
    deemedNpatUsed: npatResolved.deemedNpatUsed,
    leviableAmount,
    tmps: resolveTmps(finMeta),
    industrySector: s(companyMeta.industrySector) || undefined,
    scorecardType: s(companyMeta.scorecardType) || undefined,
    annualTurnover: revenue,
  };

  if (industryNormResolved > 0) {
    result.industryNormPercent = industryNormResolved;
  }
  if (npatResolved.npatResolutionMethod) {
    result.npatResolutionMethod = npatResolved.npatResolutionMethod;
  }
  if (npatResolved.indicativeProfitMarginPercent != null) {
    result.indicativeProfitMarginPercent = npatResolved.indicativeProfitMarginPercent;
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
    result.combineExcoSenior = coerceYesNo(companyMeta.combineExcoSenior);
  }

  // Skills aggregate inputs.
  if (skillsMeta) {
    const cardType = String(result.scorecardType ?? companyMeta.scorecardType ?? '').trim().toUpperCase();
    if (cardType !== 'QSE') {
      const ep = s(skillsMeta.eapProvince);
      if (ep) result.eapProvince = ep;

      const ey = num(skillsMeta.eapYear);
      if (ey > 0) result.eapYear = ey;
    }

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
    result.farmWorkersIncluded = coerceYesNo(companyMeta.farmWorkersIncluded);
  }

  // FSC-specific: sub-sector variant (company-information meta).
  const fscSub = s(companyMeta.fscSubSector);
  if (fscSub) result.fscSubSector = normalizeFscSubSector(fscSub);

  if (companyMeta.fscReinsurer !== undefined) {
    result.fscReinsurer = coerceYesNo(companyMeta.fscReinsurer);
  }

  // FSC AFS inputs from afs-additions meta (legacy: financial-information meta).
  if (sectorCode === "FSC") {
    const afsSource = afsMeta && Object.keys(afsMeta).length > 0 ? afsMeta : finMeta;
    const afs: Record<string, unknown> = {};
    const mapNum = (k: string, out: string) => {
      if (!blank(afsSource[k])) afs[out] = num(afsSource[k]);
    };
    const mapBool = (k: string, out: string) => {
      if (afsSource[k] !== undefined) afs[out] = coerceYesNo(afsSource[k]);
    };
    mapNum("afsTransactionPointCoverage", "transactionPointCoverage");
    mapNum("afsServicePointCoverage", "servicePointCoverage");
    mapNum("afsSalesPointCoverage", "salesPointCoverage");
    mapBool("afsElectronicAccessCompliant", "electronicAccessCompliant");
    mapBool("afsHasPointOfPresence", "hasPointOfPresence");
    mapBool("afsActiveAccountsCompliant", "activeAccountsCompliant");
    mapNum("afsAppropriateProductsNumerator", "appropriateProductsNumerator");
    mapNum("afsAppropriateProductsDenominator", "appropriateProductsDenominator");
    mapNum("afsMarketPenetrationPolicies", "marketPenetrationPolicies");
    mapNum("afsSaiaCommunicatedPolicies", "saiaCommunicatedPolicies");
    mapNum("afsTransactionalAccessCoverage", "transactionalAccessCoverage");
    mapBool("afsCommercialEquipment", "commercialEquipment");
    mapBool("afsCommercialLiability", "commercialLiability");
    mapBool("afsCommercialProperty", "commercialProperty");
    mapBool("afsCommercialAgriculture", "commercialAgriculture");
    mapBool("afsCommercialLivestock", "commercialLivestock");
    mapBool("afsCommercialOther", "commercialOther");
    mapBool("afsInsurancePoliciesCompliant", "insurancePoliciesCompliant");
    if (Object.keys(afs).length > 0) result.afs = afs;
  }

  // FSC-specific: prior year revenue (financial-information meta).
  // FSC SED/income scoring uses prior financial year income.
  if (sectorCode === "FSC" && !blank(finMeta.priorYearRevenue)) {
    result.priorYearRevenue = num(finMeta.priorYearRevenue);
  }

  // FSC-specific: Consumer Education aggregate inputs (sed section meta).
  if (sedMeta) {
    if (!blank(sedMeta.ceSpend)) result.ceSpend = num(sedMeta.ceSpend);
    if (!blank(sedMeta.ceBonusSpend)) result.ceBonusSpend = num(sedMeta.ceBonusSpend);
    if (!blank(sedMeta.fundisaSpend)) result.fundisaSpend = num(sedMeta.fundisaSpend);
  }

  return result;
}
