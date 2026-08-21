/**
 * Hospitality. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_HOSPITALITY = defineEsgSector({
  id: "hospitality",
  label: "Hospitality",
  coverLabel: "Hospitality",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: per-guest-night energy, water and food-waste " +
    "intensity are the sector's standard metrics (HCMI) and none has a sourced value here.",
});
