/**
 * FSC QSFI — Qualifying Small Financial Institution (annual revenue R10-50m).
 *
 * Derived from FSC_QSE in apps/api/pipeline/sectorConfig.ts. Element weights
 * are gazette-verified (GG 41287 §8.2: 25 + 15 + 25 + 30 + 5 = 100); inner
 * indicator splits are derived from the amended-codes QSE statements and the
 * FSC Others patterns — see the SectorConfig's own provenance comment.
 *
 * Before this existed, an FSC client on a QSE scorecard fell through to the
 * 105-pt Others scorecard: a wrong answer rather than a refusal.
 *
 * Reuses the QSE converter (the QSFI scorecard is the amended QSE shape), then
 * overlays the FSC-specific SED & Consumer Education split (FS500): SED 3 pts
 * @ 0.6% NPAT + CE 2 pts @ 0.4% NPAT — the split calculateSedScore consumes
 * for FSC configs.
 */
import { FSC_QSE } from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';
import { sectorConfigToQseCalculatorConfig } from './rcogp-qse';

export const FSC_QSE_SECTOR_CODE = 'FSC' as const;
export const FSC_QSE_SCORECARD_TYPE = 'QSE' as const;

const base = sectorConfigToQseCalculatorConfig(FSC_QSE);

export const FSC_QSE_CALCULATOR_CONFIG: CalculatorConfig = {
  ...base,
  sed: {
    ...base.sed,
    // FS500 split of the 5-pt SED & CE element.
    sedBaseMaxPts: 3,
    sedNpatTarget: 0.006,
    ceMaxPts: 2,
    ceNpatTarget: 0.004,
  },
};

export function isFscQseSector(sectorCode: string, scorecardType: string): boolean {
  return sectorCode.toUpperCase() === FSC_QSE_SECTOR_CODE
    && /qse/i.test(scorecardType);
}
