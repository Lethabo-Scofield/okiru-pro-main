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
import { sectorConfigToCalculatorConfig, RCOGP_GENERIC_CALCULATOR_CONFIG } from '../sectors/rcogp-generic';
import { sectorConfigToQseCalculatorConfig, RCOGP_QSE_CALCULATOR_CONFIG } from '../sectors/rcogp-qse';
import { ictSectorConfigToCalculatorConfig, ICT_GENERIC_CALCULATOR_CONFIG } from '../sectors/ict-generic';
import { sectorConfigToIctQseCalculatorConfig, ICT_QSE_CALCULATOR_CONFIG } from '../sectors/ict-qse';
import { sectorConfigToAgriGenericCalculatorConfig, AGRI_GENERIC_CALCULATOR_CONFIG } from '../sectors/agri-generic';
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
  'rcogp-generic': { id: 'rcogp-generic', label: 'RCOGP Generic', source: RCOGP_GENERIC, convert: sectorConfigToCalculatorConfig, shipped: RCOGP_GENERIC_CALCULATOR_CONFIG },
  'rcogp-qse': { id: 'rcogp-qse', label: 'RCOGP QSE', source: RCOGP_QSE, convert: sectorConfigToQseCalculatorConfig, shipped: RCOGP_QSE_CALCULATOR_CONFIG },
  'ict-generic': { id: 'ict-generic', label: 'ICT Generic', source: ICT_GENERIC, convert: ictSectorConfigToCalculatorConfig, shipped: ICT_GENERIC_CALCULATOR_CONFIG },
  'ict-qse': { id: 'ict-qse', label: 'ICT QSE', source: ICT_QSE, convert: sectorConfigToIctQseCalculatorConfig, shipped: ICT_QSE_CALCULATOR_CONFIG },
  'agri-generic': { id: 'agri-generic', label: 'Agri Generic', source: AGRI_GENERIC, convert: sectorConfigToAgriGenericCalculatorConfig, shipped: AGRI_GENERIC_CALCULATOR_CONFIG },
  'fsc-others': { id: 'fsc-others', label: 'FSC Others (Generic)', source: FSC_GENERIC, convert: sectorConfigToFscCalculatorConfig, shipped: FSC_GENERIC_CALCULATOR_CONFIG },
  'fsc-banks': { id: 'fsc-banks', label: 'FSC Banks', source: FSC_BANKS, convert: sectorConfigToFscBanksCalculatorConfig, shipped: FSC_BANKS_CALCULATOR_CONFIG },
  'fsc-lti': { id: 'fsc-lti', label: 'FSC Long-term Insurers', source: FSC_LTI, convert: sectorConfigToFscLtiCalculatorConfig, shipped: FSC_LTI_CALCULATOR_CONFIG },
  'fsc-sti': { id: 'fsc-sti', label: 'FSC Short-term Insurers', source: FSC_STI, convert: sectorConfigToFscStiCalculatorConfig, shipped: FSC_STI_CALCULATOR_CONFIG },
};

export function isScorecardId(v: unknown): v is ScorecardId {
  return typeof v === 'string' && (SCORECARD_IDS as readonly string[]).includes(v);
}
