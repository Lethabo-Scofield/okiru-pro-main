/**
 * MAC (Marketing, Advertising and Communication) — Generic CalculatorConfig.
 *
 * Derived from MAC_GENERIC in apps/api/pipeline/sectorConfig.ts, which encodes
 * docs/toolkits/MAC Codes.xlsx (Government Gazette No. 39887, 1 April 2016).
 *
 * MAC follows the amended-codes shape closely enough to reuse the generic
 * calculators — Employment Equity is folded into Management Control, and the
 * ESD element is Preferential Procurement + Supplier Development + Enterprise
 * Development. Two things are MAC-specific:
 *
 *   1. A sixth element, Responsible Social Marketing and Communications (5 pts),
 *      which no calculator scores yet — see the note on the config below.
 *   2. A 10-point Skills absorption bonus, the largest in any code we implement.
 */
import { getSectorConfig, type SectorConfig } from '../../../../../api/pipeline/sectorConfig';
import { sectorConfigToCalculatorConfig } from './rcogp-generic';
import type { CalculatorConfig } from '../../../../shared/schema';

export const MAC_GENERIC_SECTOR_CODE = 'MAC' as const;
export const MAC_GENERIC_SCORECARD_TYPE = 'Generic' as const;

/**
 * Convert the verified MAC Generic SectorConfig → CalculatorConfig.
 *
 * The generic converter already maps every element MAC shares with RCOGP, so
 * this is a thin wrapper rather than a copy: the point values and targets differ
 * (ownership at 45%/30% rather than 25%/10%, skills at 6% of leviable) but the
 * SHAPE is the same, and duplicating the mapping is how sector configs drift.
 */
export function sectorConfigToMacGenericCalculatorConfig(sc: SectorConfig): CalculatorConfig {
  return sectorConfigToCalculatorConfig(sc);
}

/** Complete MAC Generic config — use for scorecard, tests, and explicit wiring. */
export const MAC_GENERIC_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToMacGenericCalculatorConfig(getSectorConfig('MAC', 'Generic'));
