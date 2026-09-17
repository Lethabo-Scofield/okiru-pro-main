/**
 * Mining. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_MINING = defineEsgSector({
  id: "mining",
  label: "Mining",
  coverLabel: "Mining",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: fugitive methane, blasting emissions, tailings " +
    "and mine-closure liabilities are unmodelled; the inherited LTIFR maximum of 2 " +
    "(Assumptions!B55) is a general-industry figure, not an MHSA mining benchmark.",
});
