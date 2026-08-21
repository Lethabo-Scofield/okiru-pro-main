/**
 * Manufacturing. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_MANUFACTURING = defineEsgSector({
  id: "manufacturing",
  label: "Manufacturing",
  coverLabel: "Manufacturing",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: process-emission scope (the base models " +
    "combustion + electricity + water only, no process emissions), and an energy-intensity " +
    "benchmark per production unit.",
});
