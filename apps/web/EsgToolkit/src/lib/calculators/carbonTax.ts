import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import {
  CARBON_ANNUALISE_FACTOR,
  CARBON_TAX_ALLOWANCE,
  CARBON_TAX_RATE_TIER1,
  CARBON_TAX_RATE_TIER2,
} from "../esgConfig/consumer-goods";

export type CarbonTaxResult = {
  taxableTco2e: number;
  tier1Liability: number;
  tier2Liability: number;
  tier1Rate: number;
  tier2Rate: number;
};

export function computeCarbonTax(workbook: EsgWorkbookData): CarbonTaxResult {
  const annualise = readEsgCell(workbook, "assumptions", "B112") ?? CARBON_ANNUALISE_FACTOR;
  const allowance = readEsgCell(workbook, "assumptions", "B39") ?? CARBON_TAX_ALLOWANCE;
  const rate1 = readEsgCell(workbook, "assumptions", "B37") ?? CARBON_TAX_RATE_TIER1;
  const rate2 = readEsgCell(workbook, "assumptions", "B38") ?? CARBON_TAX_RATE_TIER2;

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
