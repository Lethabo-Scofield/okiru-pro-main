/**
 * Retail. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_RETAIL = defineEsgSector({
  id: "retail",
  label: "Retail",
  coverLabel: "Retail",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: refrigerant leakage is a material Scope 1 " +
    "source for retail and the base carries no refrigerant GWP factors; store energy " +
    "intensity (kWh/m² trading area) has no sourced benchmark.",
});
