/**
 * Construction sector — Toolkit wiring.
 *
 * Construction scoring uses a separate, expert-verified indicator-matrix evaluator
 * (apps/api/pipeline/constructionScoring.ts) rather than the Toolkit's pillar
 * calculators. This module provides:
 *   - isConstructionSector() / resolveConstructionScorecardKey() routing helpers
 *   - buildConstructionCalculatorConfig(): a CalculatorConfig that lets the Toolkit
 *     run its pillar calculators ONLY to harvest rawStats (the points they compute
 *     are ignored); its pillar maxPoints + total are the real construction values so
 *     the ScorecardResult targets/levels are correct.
 *
 * See docs/construction-wiring-spec.md for the full mapping blueprint.
 */
import type { CalculatorConfig } from '../../../../shared/schema';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from './rcogp-generic';
import {
  CONSTRUCTION_SCORECARDS,
  resolveConstructionEntityType,
} from '../../../../../api/pipeline/constructionIndicators';

export const CONSTRUCTION_SECTOR_CODE = 'CONSTRUCTION' as const;

export function isConstructionSector(sectorCode?: string | null): boolean {
  return String(sectorCode ?? '').toUpperCase() === CONSTRUCTION_SECTOR_CODE;
}

/**
 * Resolve the construction scorecard key (construction_qse | construction_contractor
 * | construction_bep) from the entity's sub-sector × size. QSE-size entities use the
 * single QSE scorecard regardless of sub-sector (Contractor/BEP).
 */
export function resolveConstructionScorecardKey(
  scorecardType?: string | null,
  constructionSubSector?: string | null,
): string {
  // resolveConstructionEntityType(subSector, scorecardType) handles the QSE collapse.
  return resolveConstructionEntityType(
    (constructionSubSector ?? 'Contractor') as string,
    (scorecardType ?? 'Generic') as string,
  );
}

/**
 * A CalculatorConfig for a construction entity. Pillar target sub-objects are
 * inherited from RCOGP Generic so the Toolkit's pillar calculators run without
 * crashing (their POINTS are discarded — only rawStats are consumed by the mapper).
 * Only the pillar maxPoints + total reflect the real construction element weights.
 * Construction's "Enterprise & Supplier Development" element (which combines PP + SD)
 * maps onto the preferentialProcurement pillar slot; SD/ED/EE/YES slots are zeroed.
 */
export function buildConstructionCalculatorConfig(entityType: string): CalculatorConfig {
  const sc = CONSTRUCTION_SCORECARDS[entityType] ?? CONSTRUCTION_SCORECARDS.construction_contractor;
  const el = sc.elementMaxPoints;
  const base = RCOGP_GENERIC_CALCULATOR_CONFIG;
  const pc = base.pillarConfigs ?? {};
  const withMax = <T extends object>(p: T | undefined, maxPoints: number): T =>
    ({ ...(p ?? ({} as T)), maxPoints } as T);

  return {
    ...base,
    sectorCode: CONSTRUCTION_SECTOR_CODE,
    scorecardType: sc.scorecardType,
    totalMaxPoints: sc.totalMaxPoints,
    pillarConfigs: {
      ...pc,
      ownership: withMax(pc.ownership, el.ownership),
      managementControl: withMax(pc.managementControl, el.managementControl),
      employmentEquity: withMax(pc.employmentEquity, 0),
      skillsDevelopment: withMax(pc.skillsDevelopment, el.skillsDevelopment),
      // Construction folds PP + Supplier/Contractor Dev into one ESD element.
      preferentialProcurement: withMax(pc.preferentialProcurement, el.enterpriseSupplierDevelopment),
      supplierDevelopment: withMax(pc.supplierDevelopment, 0),
      enterpriseDevelopment: withMax(pc.enterpriseDevelopment, 0),
      socioEconomicDevelopment: withMax(pc.socioEconomicDevelopment, el.socioEconomicDevelopment),
      yesInitiative: withMax(pc.yesInitiative, 0),
    },
  } as CalculatorConfig;
}
