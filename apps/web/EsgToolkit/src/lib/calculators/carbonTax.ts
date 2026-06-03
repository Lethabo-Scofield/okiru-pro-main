import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";

export type CarbonTaxResult = {
  taxableTco2e: number;
  tier1Liability: number;
  tier2Liability: number;
  tier1Rate: number;
  tier2Rate: number;
};

export function computeCarbonTax(workbook: EsgWorkbookData): CarbonTaxResult {
  const annualise = readEsgCell(workbook, "assumptions", "B112") ?? 1.3333333333;
  const allowance = readEsgCell(workbook, "assumptions", "B39") ?? 0.6;
  const rate1 = readEsgCell(workbook, "assumptions", "B37") ?? 236;
  const rate2 = readEsgCell(workbook, "assumptions", "B38") ?? 640;

  const scopes = ["L75", "L76", "L77", "L78", "L82"] as const;
  let ytd = 0;
  for (const ref of scopes) {
    ytd += readEsgCell(workbook, "e-data", ref) ?? 0;
  }
  const annualised = ytd * annualise;
  const taxable = annualised * (1 - allowance);
  return {
    taxableTco2e: taxable,
    tier1Liability: taxable * rate1,
    tier2Liability: taxable * rate2,
    tier1Rate: rate1,
    tier2Rate: rate2,
  };
}
