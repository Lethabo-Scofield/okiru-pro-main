/**
 * Education. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_EDUCATION = defineEsgSector({
  id: "education",
  label: "Education",
  coverLabel: "Education",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: campus energy per student / per m2 is the " +
    "sector metric and has no sourced benchmark; the inherited training-hours target " +
    "(Assumptions!B53, 40h) measures staff development and should not be conflated with " +
    "teaching hours.",
});
