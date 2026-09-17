/**
 * FMCG / Distribution — the SG Consumer fork of the ESG workbook.
 *
 * The ONLY sector with a real, filled workbook behind it. `Assumptions!A3` says
 * so outright: "THIS INSTANCE IS CONFIGURED FOR SUPERGROUP — Transport / FMCG
 * Distribution | Sector-locked deep build".
 *
 * Everything numeric here is already in the shared base (see `../base.ts` for why
 * the base carries the FMCG-calibrated thresholds rather than duplicating them),
 * so the overrides below are the entity-shaped values that genuinely belong to
 * this fork and nowhere else.
 */
import { defineEsgSector } from "../base";

export const ESG_SECTOR_CONSUMER_GOODS = defineEsgSector({
  id: "consumer-goods",
  label: "FMCG / Distribution",
  coverLabel: "FMCG / Distribution",
  calibration: "workbook-verified",
  notes:
    "Sourced from the filled SG Consumer workbook v1.7 (docs/esg/extracted/Assumptions.json). " +
    "The thresholds, emission factors, pillar maxima and pillar weights in the shared base " +
    "were all lifted from THIS workbook, which is why this sector overrides so little.",
  overrides: {
    reporting: {
      // Assumptions!B10 — the workbook's own sector string, which is not
      // identical to the cover dropdown's "FMCG / Distribution".
      sectorVariant: "Transport / FMCG Distribution",
      // Assumptions!B105 — ENT_FY, verbatim.
      reportingPeriodLabel: "FY 2025/2026  |  Jul 2025 – Jun 2026",
    },
    // E_Data rows 14–18 — the five SG Consumer depots.
    defaultSites: ["BLOEM", "CPT", "DBN", "ISANDO", "PE"],
    // E_Data columns C–K — nine months, matching Assumptions!B111 (ENT_MOS = 9).
    defaultMonths: [
      "Jul-25",
      "Aug-25",
      "Sep-25",
      "Oct-25",
      "Nov-25",
      "Dec-25",
      "Jan-26",
      "Feb-26",
      "Mar-26",
    ],
  },
});
