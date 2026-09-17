/**
 * Generic — the shared South African base, unmodified.
 *
 * This is the honest default: national emission factors, SA Carbon Tax Act
 * parameters, and the workbook v1.7 thresholds. Nothing is claimed to be
 * sector-specific, and `inheritedPaths` covers every leaf.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_GENERIC = defineEsgSector({
  id: "generic",
  label: "Generic",
  coverLabel: "Generic",
  calibration: "inherited",
  notes:
    "The shared base with no overrides. Emission factors and carbon tax parameters are " +
    "national and correct for any SA entity; thresholds and pillar weights are the " +
    "FMCG-calibrated workbook v1.7 values and should be read as defaults, not findings.",
});
