/**
 * MAC (Marketing, Advertising and Communication) — QSE CalculatorConfig.
 *
 * Derived from MAC_QSE in apps/api/pipeline/sectorConfig.ts, which encodes
 * docs/toolkits/MAC Codes.xlsx (Government Gazette No. 39887, 1 April 2016),
 * QSE sheet.
 *
 * The QSE scorecard is markedly leaner than the Generic one:
 *   - Management Control has only two bands, executive (5+2) and non-executive
 *     (6+2) — no board, senior/middle/junior or disabled rows at all.
 *   - Skills is two spend lines (20 @ 4%, 5 @ 3%) plus the 10-pt absorption bonus.
 *   - Preferential Procurement is two indicators (12 @ 60%, 8 @ 20% BO51).
 *   - Ownership folds new entrants and designated groups into one 3-pt row.
 */
import { getSectorConfig, type SectorConfig } from '../../../../../api/pipeline/sectorConfig';
import { sectorConfigToCalculatorConfig } from './rcogp-generic';
import type { CalculatorConfig } from '../../../../shared/schema';

export const MAC_QSE_SECTOR_CODE = 'MAC' as const;
export const MAC_QSE_SCORECARD_TYPE = 'QSE' as const;

/** Convert the verified MAC QSE SectorConfig → CalculatorConfig. */
export function sectorConfigToMacQseCalculatorConfig(sc: SectorConfig): CalculatorConfig {
  const base = sectorConfigToCalculatorConfig(sc);
  return {
    ...base,
    ownership: {
      ...base.ownership,
      // §15.2.3 is a single "new entrants OR black designated groups" row, the
      // same combined indicator RCOGP/ICT QSE use. Without this flag the
      // calculator emits a separate always-zero new-entrants line and the
      // breakdown stops reconciling to the 25-pt cap.
      combinedNewEntrantsDesignated: true,
    },
  };
}

/** Complete MAC QSE config — use for scorecard, tests, and explicit wiring. */
export const MAC_QSE_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToMacQseCalculatorConfig(getSectorConfig('MAC', 'QSE'));
