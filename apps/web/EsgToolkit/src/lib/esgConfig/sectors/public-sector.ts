/**
 * Public Sector. Fully inherited — no sourced sector values yet.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_PUBLIC_SECTOR = defineEsgSector({
  id: "public-sector",
  label: "Public Sector",
  coverLabel: "Public Sector",
  calibration: "inherited",
  notes:
    "Inherits the base end to end. OUTSTANDING: the B-BBEE element weights " +
    "(Assumptions!B68:B72) and the carbon-tax model do not apply to organs of state in the " +
    "same way; PFMA/MFMA governance replaces the King V Apply-and-Explain basis behind " +
    "Assumptions!B59.",
});
