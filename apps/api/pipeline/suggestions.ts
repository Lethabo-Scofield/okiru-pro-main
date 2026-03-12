import type { PipelineResult } from './types.js';

export function generateSuggestions(
  pillars: PipelineResult['scorecard']['pillars'],
  subMins: { ownership: boolean; skills: boolean; procurement: boolean },
  beeLevel: string
): string[] {
  const suggestions: string[] = [];

  if (pillars.ownership >= 25) suggestions.push(`Ownership: Strong at 100% black – maintain for max 25 pts.`);
  else if (pillars.ownership >= 20) suggestions.push(`Ownership: ${pillars.ownership.toFixed(1)}/25 pts – consider increasing Net Value to reach 25.`);
  else suggestions.push(`Ownership: ${pillars.ownership.toFixed(1)}/25 pts – increase black shareholding or Net Value to gain points.`);

  if (pillars.managementControl >= 19) suggestions.push('Management Control: Maxed – excellent representation.');
  else suggestions.push(`Management Control: ${pillars.managementControl.toFixed(1)} pts – good, but check female representation for balance.`);

  if (pillars.skillsDevelopment === 0) suggestions.push('Skills Development: 0 pts – urgent: add training programs to reach 6% spend on black people.');
  else if (!subMins.skills) suggestions.push(`Skills Development: ${pillars.skillsDevelopment.toFixed(1)}/25 pts – below sub-minimum (40%). Increase training spend urgently.`);
  else suggestions.push(`Skills Development: ${pillars.skillsDevelopment.toFixed(1)}/25 pts – maintain or increase training spend.`);

  if (pillars.preferentialProcurement >= 25) suggestions.push(`Preferential Procurement: ${pillars.preferentialProcurement.toFixed(1)} pts – solid, but diversify to more QSE/EME for bonuses.`);
  else if (!subMins.procurement) suggestions.push(`Preferential Procurement: ${pillars.preferentialProcurement.toFixed(1)}/27 pts – below sub-minimum. Shift spend to higher B-BBEE level suppliers.`);
  else suggestions.push(`Preferential Procurement: ${pillars.preferentialProcurement.toFixed(1)}/27 pts – increase spend with Level 1-2 suppliers.`);

  if (pillars.enterpriseSupplierDevelopment === 0) suggestions.push('ESD: 0 pts – recommend grants/loans to black SMEs to hit 2% SD target.');
  else suggestions.push(`ESD: ${pillars.enterpriseSupplierDevelopment.toFixed(1)}/15 pts – continue supporting qualifying beneficiaries.`);

  if (pillars.socioEconomicDevelopment >= 5) suggestions.push('SED: maxed, focus on impactful CSI for reporting.');
  else if (pillars.socioEconomicDevelopment === 0) suggestions.push('SED: 0 pts – contribute 1% of NPAT to socio-economic development projects.');
  else suggestions.push(`SED: ${pillars.socioEconomicDevelopment.toFixed(1)}/5 pts – increase CSI contributions to reach target.`);

  suggestions.push(`Overall: ${beeLevel} at ${pillars.totalPoints.toFixed(1)} pts${pillars.totalPoints >= 100 ? ' – great! Explore YES for enhancement.' : ' – see above for improvement areas.'}`);

  return suggestions;
}
