import type { ScorecardId } from '../scorecards';

/**
 * Source leaves that exist in a scorecard's SectorConfig but that its converter does
 * not carry into the CalculatorConfig, so editing them cannot change any score.
 * Exposing them would be a phantom control, so the registry omits them.
 *
 * Found by perturbing every candidate leaf and diffing the effective config; the
 * registry test re-derives this list and fails if it drifts in either direction.
 * Each entry is a calculator gap worth a developer change request (needs a hook):
 *  - employmentEquity.{senior,middle,junior}MaxPts and (generic) managementControl
 *    per-band black / black-female targets are not read from config today.
 *  - QSE procurement qse/eme/bwo30 rows are fixed by the QSE converter.
 *  - fsc esd.edJobsBonus is not carried by the FSC converters.
 *  - the Empower toolkit methods overwrite skills.absorptionTargetPercent (RCOGP and Agri
 *    Generic) and the ESD percentages (ICT QSE) after conversion.
 *  - benefitFactors[].edFactor: the calculator carries ONE factor (the sdFactor) for
 *    both supplier and enterprise development, so edFactor is never offered.
 */
export const UNWIRED_SOURCE_PATHS: Partial<Record<ScorecardId, string[]>> = {
  'rcogp-generic': [
    'targets.skills.absorptionTargetPercent',
    'targets.managementControl.seniorBlackTarget',
    'targets.managementControl.seniorBWTarget',
    'targets.managementControl.middleBlackTarget',
    'targets.managementControl.middleBWTarget',
    'targets.managementControl.juniorBlackTarget',
    'targets.managementControl.juniorBWTarget',
    'targets.employmentEquity.seniorMaxPts',
    'targets.employmentEquity.middleMaxPts',
    'targets.employmentEquity.juniorMaxPts',
  ],
  'rcogp-qse': [
    'targets.employmentEquity.seniorMaxPts',
    'targets.employmentEquity.middleMaxPts',
    'targets.employmentEquity.juniorMaxPts',
    'targets.procurement.qseTarget',
    'targets.procurement.qseMaxPts',
    'targets.procurement.emeTarget',
    'targets.procurement.emeMaxPts',
    'targets.procurement.bwo30Target',
    'targets.procurement.bwo30MaxPts',
  ],
  'ict-generic': [
    'targets.employmentEquity.seniorMaxPts',
    'targets.employmentEquity.middleMaxPts',
    'targets.employmentEquity.juniorMaxPts',
  ],
  'ict-qse': [
    'targets.esd.sdPercent',
    'targets.esd.edPercent',
    'targets.employmentEquity.seniorMaxPts',
    'targets.employmentEquity.middleMaxPts',
    'targets.employmentEquity.juniorMaxPts',
    'targets.procurement.qseTarget',
    'targets.procurement.qseMaxPts',
    'targets.procurement.emeTarget',
    'targets.procurement.emeMaxPts',
    'targets.procurement.bwo30Target',
    'targets.procurement.bwo30MaxPts',
  ],
  'agri-generic': [
    'targets.skills.absorptionTargetPercent',
    'targets.employmentEquity.seniorMaxPts',
    'targets.employmentEquity.middleMaxPts',
    'targets.employmentEquity.juniorMaxPts',
  ],
  'fsc-others': [
    'targets.employmentEquity.seniorMaxPts',
    'targets.employmentEquity.middleMaxPts',
    'targets.employmentEquity.juniorMaxPts',
    'targets.esd.edJobsBonus',
  ],
  'fsc-banks': [
    'targets.employmentEquity.seniorMaxPts',
    'targets.employmentEquity.middleMaxPts',
    'targets.employmentEquity.juniorMaxPts',
  ],
  'fsc-lti': [
    'targets.employmentEquity.seniorMaxPts',
    'targets.employmentEquity.middleMaxPts',
    'targets.employmentEquity.juniorMaxPts',
    'targets.esd.edJobsBonus',
  ],
  'fsc-sti': [
    'targets.employmentEquity.seniorMaxPts',
    'targets.employmentEquity.middleMaxPts',
    'targets.employmentEquity.juniorMaxPts',
    'targets.esd.edJobsBonus',
  ],
};
