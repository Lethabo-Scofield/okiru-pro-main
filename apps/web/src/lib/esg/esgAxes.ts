/**
 * The reporting axes of the ESG workbook — the month columns and the site/depot
 * rows every monthly grid, register dropdown and import translation shares.
 *
 * Lives in lib (not in `EsgMonthlyGrid`) because the DATA layer needs it too:
 * `esgGridSections` builds dropdown vocabularies from it and
 * `esgSheetStructure` matches imported depot labels against it. The component
 * re-exports these for its existing importers.
 */

/** Jul-25 → Mar-26 — the v1.7 workbook's reporting window. */
export const ESG_DEFAULT_MONTHS: string[] = [
  "Jul-25",
  "Aug-25",
  "Sep-25",
  "Oct-25",
  "Nov-25",
  "Dec-25",
  "Jan-26",
  "Feb-26",
  "Mar-26",
];

/**
 * The site axis, in the E_Data electricity-block order. ROW ORDER IS
 * LOAD-BEARING: monthly-grid cells are keyed by row index, so index i must
 * mean the same site in every grid.
 */
export const ESG_DEFAULT_DEPOTS: string[] = ["BLOEM", "CPT", "DBN", "ISANDO", "PE"];
