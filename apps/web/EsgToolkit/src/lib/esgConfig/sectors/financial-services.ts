/**
 * Financial Services. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_FINANCIAL_SERVICES = defineEsgSector({
  id: "financial-services",
  label: "Financial Services",
  coverLabel: "Financial Services",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: financed emissions (PCAF) dominate a " +
    "financial institution's footprint and are not modelled at all, so the 0.4 environmental " +
    "pillar weight inherited from the fuel-intensive FMCG fork is almost certainly wrong here. " +
    "See Assumptions!A4, which warns against retrofitting the FMCG fork for FinServ.",
});
