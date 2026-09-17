/**
 * Agriculture. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_AGRICULTURE = defineEsgSector({
  id: "agriculture",
  label: "Agriculture",
  coverLabel: "Agriculture",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: land use, livestock CH4/N2O and fertiliser " +
    "emissions are the dominant agricultural sources and have no factor in the base; water " +
    "abstraction (not municipal supply) is the material water metric.",
});
