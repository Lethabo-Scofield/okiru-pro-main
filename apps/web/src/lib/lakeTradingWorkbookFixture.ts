/**
 * Lake Trading workbook sections — maps lakeTradingDemo.ts / SCORECARD_GROUND_TRUTH §17
 * into Information Request workbook grid/meta shape.
 */

import {
  lakeTradingClientInfo,
  lakeTradingFinancials,
  lakeTradingOwnership,
  lakeTradingManagement,
  lakeTradingPillars,
  LAKE_REVENUE,
  LAKE_NPAT,
  LAKE_LEVIABLE,
  LAKE_TMPS,
} from "@/lib/lakeTradingDemo";

export const LAKE_TRADING_DEMO_CLIENT_ID = "C-LAKE-DEMO";
export const LAKE_TRADING_DEMO_NAME = "Lake Trading (Demo)";

type WorkbookRow = Record<string, unknown> & { _id: string };
type WorkbookSection = { rows: WorkbookRow[]; meta?: Record<string, unknown> };

function rowId(prefix: string, n: number): string {
  return `${prefix}_${n}`;
}

function splitEmployeeName(full: string): { name: string; surname: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { name: full.trim(), surname: "—" };
  return { name: parts[0], surname: parts.slice(1).join(" ") };
}

const DESIGNATION_TO_WORKBOOK: Record<string, string> = {
  Board: "Non-executive Director",
  "Executive Director": "Executive Director",
  "Other Executive Management": "Other Executive Manager",
  Senior: "Senior Manager",
  Middle: "Middle Manager",
  Junior: "Junior Manager",
};

function mapEmployeeRows(): WorkbookRow[] {
  return lakeTradingManagement.employees.map((e, i) => {
    const { name, surname } = splitEmployeeName(e.name);
    const designation =
      DESIGNATION_TO_WORKBOOK[e.designation] ?? e.designation ?? "Junior Manager";
    const isBoard = e.designation === "Board";
    return {
      _id: e.id || rowId("lt_emp", i),
      name,
      surname,
      race: e.race,
      gender: e.gender,
      designation,
      occupationalLevel: designation,
      isDisabled: Boolean(e.isDisabled),
      isForeign: Boolean(e.isForeign),
      votingRights: isBoard ? 50 : 0,
    };
  });
}

function pct100(fraction: number): number {
  return fraction <= 1 ? Math.round(fraction * 10000) / 100 : fraction;
}

export function buildLakeTradingWorkbookSections(): Record<string, WorkbookSection> {
  const payroll =
    lakeTradingFinancials.totalPayroll ?? lakeTradingFinancials.leviableAmount ?? LAKE_LEVIABLE;

  const companyMeta: Record<string, unknown> = {
    companyName: lakeTradingClientInfo.companyName,
    tradingName: lakeTradingClientInfo.tradingName,
    registrationNumber: lakeTradingClientInfo.registrationNumber,
    vatNumber: lakeTradingClientInfo.vatNumber,
    taxNumber: lakeTradingClientInfo.taxNumber,
    industrySector: "RCOGP",
    scorecardType: "Generic",
    financialYearEnd: "2026-02-28",
    physicalAddress: lakeTradingClientInfo.physicalAddress,
    postalAddress: lakeTradingClientInfo.postalAddress,
    contactPerson: lakeTradingClientInfo.contactPerson,
    contactEmail: lakeTradingClientInfo.contactEmail,
    contactPhone: lakeTradingClientInfo.contactPhone,
  };

  const financialMeta: Record<string, unknown> = {
    revenue: LAKE_REVENUE,
    npat: LAKE_NPAT,
    payroll,
    leviableAmount: LAKE_LEVIABLE,
    tmps: LAKE_TMPS,
    forecastRevenue: LAKE_REVENUE,
    forecastNpat: LAKE_NPAT,
    forecastPayroll: payroll,
  };

  const sh = lakeTradingOwnership.shareholders[0];
  const ownershipRows: WorkbookRow[] = [
    {
      _id: "lt_sh_1",
      shareholderName: sh.name,
      idNumber: sh.shareholderId ?? "",
      race: "",
      gender: "",
      isDisabled: false,
      isYouth: false,
      votingRights: pct100(sh.votingRightsPercent ?? 1),
      economicInterest: pct100(sh.economicInterestPercent ?? 1),
      shareholding: pct100(sh.shares ?? 100),
      modifiedFlowThrough: false,
    },
  ];

  const employeeRows = mapEmployeeRows();
  const certExpiry = lakeTradingClientInfo.beeCertificateExpiry ?? "2027-02-28";

  const supplierRows: WorkbookRow[] = (lakeTradingPillars.procurement?.suppliers ?? []).map(
    (s: Record<string, unknown>, i: number) => {
      const size =
        String(s.enterpriseType ?? "").toLowerCase() === "qse"
          ? "QSE"
          : String(s.enterpriseType ?? "").toLowerCase() === "eme"
            ? "EME"
            : "Large";
      return {
        _id: String(s.id ?? rowId("lt_sup", i)),
        supplierName: s.name,
        currentSize: size,
        bbbeeLevel: String(s.beeLevel ?? ""),
        measuredUnder: "RCoGP",
        empoweringSupplier: Boolean(s.isEmpoweringSupplier ?? true),
        currentBlackOwnership: pct100(Number(s.blackOwnership ?? 1)),
        currentBlackFemaleOwnership: pct100(Number(s.blackWomenOwnership ?? 0)),
        hasModifiedBlackOwnership: false,
        sdRecipient: Boolean(s.isSupplierDevRecipient),
        threeYearContract: Boolean(s.hasThreeYearContract),
        designated: false,
        spend: Number(s.spend ?? 0),
        certificateExpiryDate: certExpiry,
      };
    },
  );

  const esdRows: WorkbookRow[] = (lakeTradingPillars.esd?.contributions ?? []).map(
    (c: Record<string, unknown>, i: number) => ({
      _id: String(c.id ?? rowId("lt_esd", i)),
      supplierName: c.beneficiary,
      currentBlackOwnership: pct100(Number(c.blackBenefitPercent ?? 100)),
      currentSize: "EME",
      contributionDescription: c.description ?? "",
      contributionType: "Other Monetary",
      amount: Number(c.amount ?? 0),
      dateOfTransaction: String(c.transactionDate ?? "2025-09-01"),
    }),
  );

  const sedRows: WorkbookRow[] = (lakeTradingPillars.sed?.contributions ?? []).map(
    (c: Record<string, unknown>, i: number) => ({
      _id: String(c.id ?? rowId("lt_sed", i)),
      beneficiaryName: c.beneficiary,
      descriptionOfSpend: c.description ?? "Grant",
      ictSpecificInitiative: false,
      contributionType: "Grant Contribution",
      percentBenefitingBlack: pct100(Number(c.blackBenefitPercent ?? 100)),
      amount: Number(c.amount ?? 0),
      dateOfTransaction: String(c.transactionDate ?? "2025-06-01"),
    }),
  );

  return {
    "company-information": { rows: [], meta: companyMeta },
    "financial-information": { rows: [], meta: financialMeta },
    ownership: { rows: ownershipRows },
    "management-control": { rows: employeeRows },
    employees: { rows: employeeRows },
    "skills-development": { rows: [] },
    procurement: { rows: supplierRows },
    suppliers: { rows: supplierRows },
    esd: { rows: esdRows },
    sed: { rows: sedRows },
  };
}
