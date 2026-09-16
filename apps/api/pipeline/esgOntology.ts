/**
 * ESG domain ontology derived from ESG_Full_Workshop.pptx.
 *
 * This module is intentionally deterministic. It contains no model calls and
 * keeps slide-level provenance so downstream tools can cite their source.
 * Time-sensitive regulatory statements must be verified before operational use.
 */

export type EsgPillarCode = 'environmental' | 'social' | 'governance';
export type MaterialityCode = 'financial' | 'impact' | 'double';
export type FrameworkCode = 'GRI' | 'SASB' | 'ISSB_S1' | 'ISSB_S2' | 'TCFD' | 'CSRD_ESRS' | 'GHG_PROTOCOL';
export type MetricValueType = 'number' | 'percentage' | 'currency' | 'boolean' | 'text';

export interface EsgSource {
  deck: 'ESG_Full_Workshop.pptx';
  slides: number[];
  note?: string;
  timeSensitive?: boolean;
}

export interface EsgTopic {
  id: string;
  name: string;
  pillar: EsgPillarCode;
  description: string;
  aliases: string[];
  candidateMetrics: string[];
  bbbeeLinks?: string[];
  source: EsgSource;
}

export interface EsgFramework {
  code: FrameworkCode;
  name: string;
  scope: string;
  materiality: MaterialityCode[];
  primaryAudience: string[];
  mandatoryBasis: string;
  coreRequirements: string[];
  relatedFrameworks: FrameworkCode[];
  source: EsgSource;
}

export interface EsgMetric {
  id: string;
  name: string;
  pillar: EsgPillarCode;
  unit: string;
  valueType: MetricValueType;
  description: string;
  calculation?: string;
  evidence: string[];
  frameworks: FrameworkCode[];
  source: EsgSource;
}

export interface EsgRelationship {
  from: string;
  relation: 'contains' | 'measured_by' | 'reported_under' | 'integrates' | 'overlaps_with' | 'owned_by' | 'requires' | 'informs';
  to: string;
  source: EsgSource;
}

const source = (slides: number[], note?: string, timeSensitive = false): EsgSource => ({
  deck: 'ESG_Full_Workshop.pptx',
  slides,
  ...(note ? { note } : {}),
  ...(timeSensitive ? { timeSensitive: true } : {}),
});

export const ESG_PILLARS: Record<EsgPillarCode, { name: string; purpose: string; source: EsgSource }> = {
  environmental: {
    name: 'Environmental',
    purpose: 'Measure climate, emissions, energy, natural-resource, water, waste, and biodiversity impacts and risks.',
    source: source([19]),
  },
  social: {
    name: 'Social',
    purpose: 'Measure outcomes for workers, supply chains, customers, communities, and human rights.',
    source: source([19]),
  },
  governance: {
    name: 'Governance',
    purpose: 'Measure oversight, ethics, controls, risk management, accountability, and executive incentives.',
    source: source([19]),
  },
};

export const ESG_TOPICS: EsgTopic[] = [
  { id: 'climate_emissions', name: 'Climate and emissions', pillar: 'environmental', description: 'Greenhouse-gas emissions, climate risks, transition plans, and decarbonisation.', aliases: ['GHG', 'carbon', 'decarbonisation', 'climate change'], candidateMetrics: ['scope_1_emissions', 'scope_2_emissions', 'scope_3_emissions'], source: source([19, 46, 50, 55, 56]) },
  { id: 'energy', name: 'Energy and resource use', pillar: 'environmental', description: 'Energy consumed, efficiency, renewable sourcing, and resource intensity.', aliases: ['electricity', 'renewables', 'resource use'], candidateMetrics: ['energy_consumption', 'renewable_energy_share'], source: source([19, 46]) },
  { id: 'water', name: 'Water stewardship', pillar: 'environmental', description: 'Water withdrawal, consumption, discharge, quality, and local water stress.', aliases: ['water usage', 'water withdrawal', 'water discharge'], candidateMetrics: ['water_withdrawal', 'water_discharge'], source: source([19, 46]) },
  { id: 'waste', name: 'Waste and circularity', pillar: 'environmental', description: 'Waste generation, treatment, recovery, and diversion from landfill.', aliases: ['packaging waste', 'recycling', 'landfill'], candidateMetrics: ['waste_generated', 'waste_diverted_share'], source: source([19, 25, 46]) },
  { id: 'biodiversity', name: 'Biodiversity', pillar: 'environmental', description: 'Actual and potential impacts on species, habitats, and ecosystems.', aliases: ['ecosystems', 'habitat', 'nature'], candidateMetrics: ['biodiversity_impact_assessment'], source: source([19, 21]) },
  { id: 'workforce', name: 'Labour and workforce', pillar: 'social', description: 'Working conditions, retention, development, fair pay, and employee wellbeing.', aliases: ['labor', 'employees', 'turnover', 'training'], candidateMetrics: ['employee_turnover', 'training_hours'], bbbeeLinks: ['skillsDevelopment'], source: source([8, 14, 19, 46]) },
  { id: 'health_safety', name: 'Health and safety', pillar: 'social', description: 'Prevention and measurement of workplace injuries, illness, and fatalities.', aliases: ['OHS', 'driver safety', 'injuries', 'LTIFR'], candidateMetrics: ['lost_time_injury_frequency_rate'], source: source([8, 24, 46]) },
  { id: 'diversity_inclusion', name: 'Diversity, equity and inclusion', pillar: 'social', description: 'Representation, equitable pay, accessibility, and inclusive employment outcomes.', aliases: ['DEI', 'diversity', 'gender pay gap', 'representation'], candidateMetrics: ['gender_pay_gap'], bbbeeLinks: ['ownership', 'managementControl', 'employmentEquity'], source: source([13, 14, 19, 46]) },
  { id: 'human_rights', name: 'Human rights and supply-chain labour', pillar: 'social', description: 'Human-rights due diligence and labour standards across operations and suppliers.', aliases: ['modern slavery', 'supplier labor', 'due diligence'], candidateMetrics: ['supply_chain_audited_share'], bbbeeLinks: ['preferentialProcurement', 'supplierDevelopment'], source: source([19, 46, 57]) },
  { id: 'community_impact', name: 'Community and economic impact', pillar: 'social', description: 'Community investment, local impacts, access, and inclusive economic participation.', aliases: ['community investment', 'social impact', 'SED'], candidateMetrics: ['community_investment'], bbbeeLinks: ['enterpriseDevelopment', 'socioEconomicDevelopment'], source: source([13, 14, 19]) },
  { id: 'board_oversight', name: 'Board oversight', pillar: 'governance', description: 'Board accountability for ESG strategy, risk, disclosure, and assurance.', aliases: ['board governance', 'audit committee', 'oversight'], candidateMetrics: ['independent_board_share', 'board_esg_oversight_frequency'], bbbeeLinks: ['managementControl'], source: source([13, 19, 30, 43, 46]) },
  { id: 'ethics_corruption', name: 'Ethics and anti-corruption', pillar: 'governance', description: 'Ethical conduct, anti-bribery controls, training, investigations, and remediation.', aliases: ['bribery', 'corruption', 'whistleblowing', 'fronting'], candidateMetrics: ['anti_corruption_training_completion', 'whistleblower_cases_resolved'], bbbeeLinks: ['frontingRules'], source: source([9, 13, 19, 46]) },
  { id: 'risk_controls', name: 'Risk management and controls', pillar: 'governance', description: 'Identification, assessment, escalation, control, and assurance of ESG risks and data.', aliases: ['enterprise risk', 'internal controls', 'audit'], candidateMetrics: ['control_test_completion'], source: source([19, 30, 43, 44, 49, 51]) },
  { id: 'executive_pay', name: 'Executive remuneration', pillar: 'governance', description: 'Executive compensation structure and alignment with long-term ESG performance.', aliases: ['executive compensation', 'remuneration', 'incentives'], candidateMetrics: ['esg_linked_executive_pay'], source: source([19, 25]) },
];

export const ESG_FRAMEWORKS: EsgFramework[] = [
  { code: 'GRI', name: 'Global Reporting Initiative Standards', scope: 'Global sustainability reporting through Universal, Sector, and Topic Standards.', materiality: ['impact'], primaryAudience: ['workers', 'communities', 'customers', 'NGOs', 'investors'], mandatoryBasis: 'Generally voluntary; may be referenced by local policy or contractual requirements.', coreRequirements: ['Identify impacts', 'Determine material topics', 'Report topic disclosures and management approach'], relatedFrameworks: ['ISSB_S1', 'ISSB_S2', 'CSRD_ESRS'], source: source([27, 32, 33]) },
  { code: 'SASB', name: 'SASB Standards', scope: 'Industry-specific sustainability disclosure metrics across 77 industries.', materiality: ['financial'], primaryAudience: ['investors'], mandatoryBasis: 'Used as industry guidance and incorporated into the ISSB ecosystem.', coreRequirements: ['Determine industry', 'Use industry-specific financially material topics and metrics'], relatedFrameworks: ['ISSB_S1', 'ISSB_S2'], source: source([28, 29, 32]) },
  { code: 'ISSB_S1', name: 'IFRS S1', scope: 'General sustainability-related financial disclosure requirements.', materiality: ['financial'], primaryAudience: ['investors', 'lenders', 'creditors'], mandatoryBasis: 'Depends on adoption by each jurisdiction.', coreRequirements: ['Governance', 'Strategy', 'Risk management', 'Metrics and targets', 'Connected financial information'], relatedFrameworks: ['ISSB_S2', 'SASB', 'TCFD'], source: source([20, 29, 32, 35], 'Jurisdictional adoption changes over time.', true) },
  { code: 'ISSB_S2', name: 'IFRS S2', scope: 'Climate-related financial disclosures.', materiality: ['financial'], primaryAudience: ['investors', 'lenders', 'creditors'], mandatoryBasis: 'Depends on adoption by each jurisdiction.', coreRequirements: ['Climate governance', 'Climate strategy', 'Physical and transition risk', 'Scenario analysis', 'GHG emissions', 'Climate metrics and targets'], relatedFrameworks: ['ISSB_S1', 'SASB', 'TCFD', 'GHG_PROTOCOL'], source: source([29, 30, 32, 35], 'Jurisdictional adoption changes over time.', true) },
  { code: 'TCFD', name: 'Task Force on Climate-related Financial Disclosures', scope: 'Climate-related financial disclosure structure integrated into IFRS S2.', materiality: ['financial'], primaryAudience: ['investors'], mandatoryBasis: 'Conceptual backbone; jurisdictional obligations vary.', coreRequirements: ['Governance', 'Strategy', 'Risk management', 'Metrics and targets'], relatedFrameworks: ['ISSB_S1', 'ISSB_S2'], source: source([29, 30, 32]) },
  { code: 'CSRD_ESRS', name: 'CSRD and European Sustainability Reporting Standards', scope: 'EU sustainability reporting for in-scope undertakings, including some non-EU groups.', materiality: ['double'], primaryAudience: ['investors', 'workers', 'communities', 'regulators'], mandatoryBasis: 'Mandatory for entities within the applicable EU scope and timetable.', coreRequirements: ['Double materiality assessment', 'ESRS disclosures', 'Value-chain information', 'Governance and strategy', 'Assurance'], relatedFrameworks: ['GRI', 'ISSB_S1', 'ISSB_S2'], source: source([21, 31, 32, 35, 36], 'Scope thresholds and implementation dates are time-sensitive and require legal verification.', true) },
  { code: 'GHG_PROTOCOL', name: 'GHG Protocol Corporate Standard', scope: 'Corporate greenhouse-gas inventory boundaries and Scope 1, 2, and 3 accounting.', materiality: ['financial', 'impact', 'double'], primaryAudience: ['report preparers', 'assurers', 'investors', 'regulators'], mandatoryBasis: 'Referenced by major reporting frameworks; exact obligations depend on the applicable regime.', coreRequirements: ['Choose organizational boundary', 'Set operational boundary', 'Collect activity data', 'Apply emission factors', 'Document methods and factors'], relatedFrameworks: ['GRI', 'ISSB_S2', 'CSRD_ESRS'], source: source([50, 55, 56, 60]) },
];

export const ESG_METRICS: EsgMetric[] = [
  { id: 'scope_1_emissions', name: 'Scope 1 GHG emissions', pillar: 'environmental', unit: 'tCO2e', valueType: 'number', description: 'Direct emissions from sources owned or controlled by the reporting entity.', calculation: 'sum(activity data x applicable emission factor) / 1000 when factors return kgCO2e', evidence: ['Fuel invoices', 'Meter or equipment logs', 'Current emission-factor source', 'Boundary methodology'], frameworks: ['GHG_PROTOCOL', 'ISSB_S2', 'GRI', 'CSRD_ESRS'], source: source([46, 55, 56]) },
  { id: 'scope_2_emissions', name: 'Scope 2 GHG emissions', pillar: 'environmental', unit: 'tCO2e', valueType: 'number', description: 'Indirect emissions from purchased energy.', calculation: 'purchased energy x applicable location-based or market-based emission factor', evidence: ['Utility invoices', 'Energy meter data', 'Contractual instruments', 'Emission-factor source'], frameworks: ['GHG_PROTOCOL', 'ISSB_S2', 'GRI', 'CSRD_ESRS'], source: source([46, 55]) },
  { id: 'scope_3_emissions', name: 'Scope 3 GHG emissions', pillar: 'environmental', unit: 'tCO2e', valueType: 'number', description: 'Other indirect value-chain emissions across applicable categories.', calculation: 'sum(category activity data x category emission factors)', evidence: ['Procurement ledger', 'Supplier data', 'Travel and logistics records', 'Estimation methodology'], frameworks: ['GHG_PROTOCOL', 'ISSB_S2', 'GRI', 'CSRD_ESRS'], source: source([46, 50, 55]) },
  { id: 'renewable_energy_share', name: 'Renewable energy share', pillar: 'environmental', unit: '%', valueType: 'percentage', description: 'Share of total energy consumption supplied from renewable sources.', calculation: '(renewable energy consumed / total energy consumed) x 100', evidence: ['Energy invoices', 'Meter data', 'Renewable certificates or contracts'], frameworks: ['GRI', 'CSRD_ESRS'], source: source([46]) },
  { id: 'waste_diverted_share', name: 'Waste diverted from landfill', pillar: 'environmental', unit: '%', valueType: 'percentage', description: 'Share of generated waste reused, recycled, composted, or otherwise diverted.', calculation: '(waste diverted / total waste generated) x 100', evidence: ['Waste manifests', 'Contractor certificates', 'Weight tickets'], frameworks: ['GRI', 'CSRD_ESRS'], source: source([46]) },
  { id: 'employee_turnover', name: 'Employee turnover rate', pillar: 'social', unit: '%', valueType: 'percentage', description: 'Rate at which employees leave during a reporting period.', calculation: '(employees leaving / average headcount) x 100', evidence: ['HR roster', 'Termination records', 'Headcount reconciliation'], frameworks: ['GRI', 'CSRD_ESRS'], source: source([25, 46]) },
  { id: 'lost_time_injury_frequency_rate', name: 'Lost-time injury frequency rate', pillar: 'social', unit: 'injuries per hours worked', valueType: 'number', description: 'Frequency of lost-time injuries normalized by hours worked.', calculation: '(lost-time injuries x normalization factor) / total hours worked', evidence: ['Incident register', 'Medical or compensation records', 'Hours-worked report'], frameworks: ['GRI', 'CSRD_ESRS'], source: source([46]) },
  { id: 'gender_pay_gap', name: 'Gender pay gap', pillar: 'social', unit: '%', valueType: 'percentage', description: 'Difference in pay outcomes between gender groups using a documented method.', evidence: ['Payroll extract', 'Job-grade mapping', 'Calculation methodology'], frameworks: ['GRI', 'CSRD_ESRS'], source: source([46]) },
  { id: 'supply_chain_audited_share', name: 'Supply chain audited for labour standards', pillar: 'social', unit: '%', valueType: 'percentage', description: 'Share of the defined supplier population assessed against labour standards.', calculation: '(suppliers or spend audited / in-scope suppliers or spend) x 100', evidence: ['Supplier register', 'Risk assessment', 'Audit reports', 'Remediation plans'], frameworks: ['GRI', 'CSRD_ESRS'], source: source([46, 57]) },
  { id: 'independent_board_share', name: 'Independent board membership', pillar: 'governance', unit: '%', valueType: 'percentage', description: 'Share of board members meeting the entity\'s documented independence criteria.', calculation: '(independent directors / total directors) x 100', evidence: ['Board roster', 'Independence declarations', 'Governance charter'], frameworks: ['GRI', 'ISSB_S1', 'CSRD_ESRS'], source: source([43, 46]) },
  { id: 'anti_corruption_training_completion', name: 'Anti-corruption training completion', pillar: 'governance', unit: '%', valueType: 'percentage', description: 'Share of the in-scope workforce completing required anti-corruption training.', calculation: '(completed training / in-scope population) x 100', evidence: ['Training roster', 'Completion records', 'Population definition'], frameworks: ['GRI', 'CSRD_ESRS'], source: source([46]) },
];

export const MATERIALITY = {
  financial: { question: 'Could the issue reasonably affect cash flows, access to finance, or cost of capital?', perspective: 'outside-in', frameworks: ['ISSB_S1', 'ISSB_S2', 'SASB', 'TCFD'] as FrameworkCode[], source: source([20]) },
  impact: { question: 'Does the organization have a significant actual or potential effect on people or the environment?', perspective: 'inside-out', frameworks: ['GRI'] as FrameworkCode[], source: source([20]) },
  double: { question: 'Is the issue financially material, impact material, or both?', perspective: 'outside-in and inside-out', frameworks: ['CSRD_ESRS'] as FrameworkCode[], source: source([21]) },
} satisfies Record<MaterialityCode, { question: string; perspective: string; frameworks: FrameworkCode[]; source: EsgSource }>;

export const ESG_GOVERNANCE_ROLES = [
  { id: 'board_audit_committee', name: 'Board or Audit Committee', responsibilities: ['Approve ESG strategy and disclosures', 'Oversee ESG risk', 'Review assurance results'], source: source([43]) },
  { id: 'executive_sponsor', name: 'Executive Sponsor', responsibilities: ['Own strategy execution', 'Report to the board', 'Resolve cross-functional blockers'], source: source([43]) },
  { id: 'esg_working_group', name: 'ESG Working Group', responsibilities: ['Coordinate topic owners', 'Coordinate data collection', 'Prepare disclosure inputs'], source: source([43]) },
  { id: 'data_systems_owner', name: 'Data and Systems Owner', responsibilities: ['Maintain systems of record', 'Operate validation controls', 'Preserve evidence trails'], source: source([43, 49]) },
  { id: 'internal_audit', name: 'Internal Audit', responsibilities: ['Test controls', 'Identify data-quality issues', 'Prepare for external assurance'], source: source([43, 51]) },
];

export const ESG_IMPLEMENTATION_STEPS = [
  { order: 1, id: 'scope_applicability', name: 'Scope and applicability', outputs: ['Jurisdiction inventory', 'Legal and contractual obligation map', 'Framework selection'], source: source([39, 40]) },
  { order: 2, id: 'materiality_assessment', name: 'Materiality assessment', outputs: ['Topic long-list', 'Stakeholder evidence', 'Scored material topics', 'Validated materiality result'], source: source([20, 22, 23, 24, 41]) },
  { order: 3, id: 'governance_design', name: 'Governance design', outputs: ['Governance charter', 'Named owners', 'Escalation paths', 'Board reporting cadence'], source: source([39, 43, 44]) },
  { order: 4, id: 'targets_kpis', name: 'Targets and KPIs', outputs: ['Verified baselines', 'Specific time-bound targets', 'Metric owners', 'Review cadence'], source: source([39, 45, 46]) },
  { order: 5, id: 'disclosure_assurance', name: 'Disclosure and assurance planning', outputs: ['Framework mapping', 'Disclosure vehicle', 'Sign-off workflow', 'Assurance scope', 'Reporting calendar'], source: source([39, 47, 51]) },
];

export const ESG_RELATIONSHIPS: EsgRelationship[] = [
  ...ESG_TOPICS.map((topic): EsgRelationship => ({ from: topic.pillar, relation: 'contains', to: topic.id, source: topic.source })),
  ...ESG_TOPICS.flatMap((topic) => topic.candidateMetrics.map((metric): EsgRelationship => ({ from: topic.id, relation: 'measured_by', to: metric, source: topic.source }))),
  { from: 'ISSB_S2', relation: 'integrates', to: 'TCFD', source: source([29, 30]) },
  { from: 'ISSB_S2', relation: 'requires', to: 'GHG_PROTOCOL', source: source([29, 55]) },
  { from: 'CSRD_ESRS', relation: 'requires', to: 'double', source: source([21, 31]) },
  { from: 'materiality_assessment', relation: 'informs', to: 'targets_kpis', source: source([39, 41, 45]) },
  { from: 'targets_kpis', relation: 'informs', to: 'disclosure_assurance', source: source([45, 47]) },
  { from: 'diversity_inclusion', relation: 'overlaps_with', to: 'B-BBEE', source: source([13, 14, 15]) },
  { from: 'community_impact', relation: 'overlaps_with', to: 'B-BBEE', source: source([13, 14, 15]) },
  { from: 'climate_emissions', relation: 'reported_under', to: 'ISSB_S2', source: source([29, 46, 55]) },
];

export const ESG_ONTOLOGY = {
  id: 'okiru.esg.workshop.v1',
  version: '1.0.0',
  status: 'workshop-derived',
  source: source([1, 61], 'Derived from the full 61-slide workshop. External standards remain authoritative.'),
  pillars: ESG_PILLARS,
  topics: ESG_TOPICS,
  frameworks: ESG_FRAMEWORKS,
  metrics: ESG_METRICS,
  materiality: MATERIALITY,
  governanceRoles: ESG_GOVERNANCE_ROLES,
  implementationSteps: ESG_IMPLEMENTATION_STEPS,
  relationships: ESG_RELATIONSHIPS,
  cautions: [
    'This ontology is educational source material, not legal advice.',
    'Verify regulatory scope, thresholds, adoption dates, and amended standards against authoritative current sources.',
    'Emission factors are versioned external data and must not be hard-coded into the ontology as universally current.',
    'Materiality conclusions are organization-specific and require documented stakeholder and leadership validation.',
  ],
} as const;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findEsgTopics(query: string): EsgTopic[] {
  const terms = new Set(normalize(query).split(' ').filter((term) => term.length > 2));
  if (terms.size === 0) return [];
  return ESG_TOPICS
    .map((topic) => {
      const haystack = normalize([topic.id, topic.name, topic.description, ...topic.aliases].join(' '));
      const score = [...terms].reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { topic, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.topic.name.localeCompare(b.topic.name))
    .map(({ topic }) => topic);
}

export function getEsgFramework(code: FrameworkCode): EsgFramework | undefined {
  return ESG_FRAMEWORKS.find((framework) => framework.code === code);
}

export function getEsgMetric(id: string): EsgMetric | undefined {
  return ESG_METRICS.find((metric) => metric.id === id);
}

export function calculateActivityEmissions(activityAmount: number, emissionFactorKgCo2e: number): number {
  if (!Number.isFinite(activityAmount) || activityAmount < 0) throw new Error('Activity amount must be a non-negative finite number.');
  if (!Number.isFinite(emissionFactorKgCo2e) || emissionFactorKgCo2e < 0) throw new Error('Emission factor must be a non-negative finite number.');
  return (activityAmount * emissionFactorKgCo2e) / 1000;
}
