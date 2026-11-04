/**
 * The nine scorecards the Rules Studio can edit, each as a (source SectorConfig,
 * converter) pair taken straight from the shipped sector files. The converter is the
 * SAME function that builds the shipped `X_CALCULATOR_CONFIG`, so an empty override
 * set reproduces the shipped configuration exactly.
 *
 * Identifiers match `REVIEW_SCORECARDS` in the directive (which names the calcReview
 * registry; that file does not exist in this repository - see docs/rules-studio).
 */
import {
  RCOGP_GENERIC, RCOGP_QSE, ICT_GENERIC, ICT_QSE, AGRI_GENERIC,
  FSC_GENERIC, FSC_BANKS, FSC_LTI, FSC_STI,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';
import { sectorConfigToCalculatorConfig, withEmpowerToolkitMethod, RCOGP_GENERIC_CALCULATOR_CONFIG } from '../sectors/rcogp-generic';
import { sectorConfigToQseCalculatorConfig, withEmpowerQseToolkitMethod, RCOGP_QSE_CALCULATOR_CONFIG } from '../sectors/rcogp-qse';
import { ictSectorConfigToCalculatorConfig, withEmpowerIctToolkitMethod, ICT_GENERIC_CALCULATOR_CONFIG } from '../sectors/ict-generic';
import { sectorConfigToIctQseCalculatorConfig, withEmpowerIctQseToolkitMethod, ICT_QSE_CALCULATOR_CONFIG } from '../sectors/ict-qse';
import { sectorConfigToAgriGenericCalculatorConfig, withEmpowerAgriToolkitMethod, AGRI_GENERIC_CALCULATOR_CONFIG } from '../sectors/agri-generic';
import { sectorConfigToFscCalculatorConfig, FSC_GENERIC_CALCULATOR_CONFIG } from '../sectors/fsc-generic';
import { sectorConfigToFscBanksCalculatorConfig, FSC_BANKS_CALCULATOR_CONFIG } from '../sectors/fsc-banks';
import { sectorConfigToFscLtiCalculatorConfig, FSC_LTI_CALCULATOR_CONFIG } from '../sectors/fsc-lti';
import { sectorConfigToFscStiCalculatorConfig, FSC_STI_CALCULATOR_CONFIG } from '../sectors/fsc-sti';

export const SCORECARD_IDS = [
  'rcogp-generic', 'rcogp-qse', 'ict-generic', 'ict-qse', 'agri-generic',
  'fsc-others', 'fsc-banks', 'fsc-lti', 'fsc-sti',
] as const;
export type ScorecardId = (typeof SCORECARD_IDS)[number];

export interface ScorecardSource {
  id: ScorecardId;
  label: string;
  /** The shipped, unmodified source object. NEVER mutate - buildEffectiveConfig clones it. */
  source: SectorConfig;
  convert: (sc: SectorConfig) => CalculatorConfig;
  /** The shipped CalculatorConfig the store loads today; parity target for empty overrides. */
  shipped: CalculatorConfig;
}

export const SCORECARD_SOURCES: Readonly<Record<ScorecardId, ScorecardSource>> = {
  'rcogp-generic': { id: 'rcogp-generic', label: 'RCOGP Generic', source: RCOGP_GENERIC, convert: (sc) => withEmpowerToolkitMethod(sectorConfigToCalculatorConfig(sc)), shipped: RCOGP_GENERIC_CALCULATOR_CONFIG },
  'rcogp-qse': { id: 'rcogp-qse', label: 'RCOGP QSE', source: RCOGP_QSE, convert: (sc) => withEmpowerQseToolkitMethod(sectorConfigToQseCalculatorConfig(sc)), shipped: RCOGP_QSE_CALCULATOR_CONFIG },
  'ict-generic': { id: 'ict-generic', label: 'ICT Generic', source: ICT_GENERIC, convert: (sc) => withEmpowerIctToolkitMethod(ictSectorConfigToCalculatorConfig(sc)), shipped: ICT_GENERIC_CALCULATOR_CONFIG },
  'ict-qse': { id: 'ict-qse', label: 'ICT QSE', source: ICT_QSE, convert: (sc) => withEmpowerIctQseToolkitMethod(sectorConfigToIctQseCalculatorConfig(sc)), shipped: ICT_QSE_CALCULATOR_CONFIG },
  'agri-generic': { id: 'agri-generic', label: 'Agri Generic', source: AGRI_GENERIC, convert: (sc) => withEmpowerAgriToolkitMethod(sectorConfigToAgriGenericCalculatorConfig(sc)), shipped: AGRI_GENERIC_CALCULATOR_CONFIG },
  'fsc-others': { id: 'fsc-others', label: 'FSC Others (Generic)', source: FSC_GENERIC, convert: (sc) => ({ ...sectorConfigToFscCalculatorConfig(sc), fscToolkit: { subSector: 'Others' } }), shipped: FSC_GENERIC_CALCULATOR_CONFIG },
  'fsc-banks': { id: 'fsc-banks', label: 'FSC Banks', source: FSC_BANKS, convert: (sc) => ({ ...sectorConfigToFscBanksCalculatorConfig(sc), fscToolkit: { subSector: 'Banks' } }), shipped: FSC_BANKS_CALCULATOR_CONFIG },
  'fsc-lti': { id: 'fsc-lti', label: 'FSC Long-term Insurers', source: FSC_LTI, convert: (sc) => ({ ...sectorConfigToFscLtiCalculatorConfig(sc), fscToolkit: { subSector: 'LTI' } }), shipped: FSC_LTI_CALCULATOR_CONFIG },
  'fsc-sti': { id: 'fsc-sti', label: 'FSC Short-term Insurers', source: FSC_STI, convert: (sc) => ({ ...sectorConfigToFscStiCalculatorConfig(sc), fscToolkit: { subSector: 'STI' } }), shipped: FSC_STI_CALCULATOR_CONFIG },
};

export function isScorecardId(v: unknown): v is ScorecardId {
  return typeof v === 'string' && (SCORECARD_IDS as readonly string[]).includes(v);
}
