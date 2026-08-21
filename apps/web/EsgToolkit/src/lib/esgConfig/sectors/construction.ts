/**
 * Construction. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_CONSTRUCTION = defineEsgSector({
  id: "construction",
  label: "Construction",
  coverLabel: "Construction",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: embodied carbon in materials (cement, steel) " +
    "and construction-and-demolition waste streams dominate the footprint and are unmodelled; " +
    "the inherited LTIFR maximum of 2 (Assumptions!B55) is not a construction benchmark.",
});
