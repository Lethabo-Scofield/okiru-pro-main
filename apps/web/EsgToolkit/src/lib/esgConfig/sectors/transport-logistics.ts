/**
 * Transport / Logistics.
 *
 * Fully inherited. The workbook's transport depth (ISO 14083, Fleet_Register,
 * Driver_Debrief) is already generic to the base build, but no transport-specific
 * threshold set has been signed off, so nothing here claims to be one.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_TRANSPORT_LOGISTICS = defineEsgSector({
  id: "transport-logistics",
  label: "Transport / Logistics",
  coverLabel: "Transport / Logistics",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: sector-specific fleet intensity benchmark " +
    "(L/100km by vehicle class) for Assumptions!B45 THR_FUEL_TOL, and an EV-transition " +
    "trajectory for B46/B47 — road-freight operators are not comparable to a generic fleet.",
});
