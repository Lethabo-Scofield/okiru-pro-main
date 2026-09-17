/**
 * ICT / Technology. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_ICT = defineEsgSector({
  id: "ict",
  label: "ICT / Technology",
  coverLabel: "ICT / Technology",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: task-based / data-centre emissions " +
    "(Assumptions!A4 names these explicitly as the ICT fork's bespoke depth) and a PUE-style " +
    "energy-intensity benchmark. Fleet thresholds B45/B46/B47 are near-meaningless here.",
});
