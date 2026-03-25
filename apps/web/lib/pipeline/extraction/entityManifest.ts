export interface EntityRequirement {
  name: string;
  fieldType: string;
  definition: string;
  aliases: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  zones: string[];
  pillar: string;
  required: boolean;
}

export interface EntityManifest {
  sectorCode: string;
  scorecardType: string;
  requiredEntities: EntityRequirement[];
}

const OWNERSHIP_ENTITIES: EntityRequirement[] = [
  {
    name: 'black_voting_rights',
    fieldType: 'percentage',
    definition: 'Percentage of voting rights held by black people',
    aliases: ['Black Voting Rights', 'voting rights'],
    positiveExamples: ['25.1%'],
    negativeExamples: [],
    zones: ['ownership', 'shareholding'],
    pillar: 'Ownership',
    required: true,
  },
  {
    name: 'black_economic_interest',
    fieldType: 'percentage',
    definition: 'Percentage of economic interest held by black people',
    aliases: ['Black Economic Interest', 'economic interest'],
    positiveExamples: ['25%'],
    negativeExamples: [],
    zones: ['ownership', 'shareholding'],
    pillar: 'Ownership',
    required: true,
  },
  {
    name: 'black_women_voting_rights',
    fieldType: 'percentage',
    definition: 'Percentage of voting rights held by black women',
    aliases: ['Black Women Voting Rights'],
    positiveExamples: ['10%'],
    negativeExamples: [],
    zones: ['ownership'],
    pillar: 'Ownership',
    required: true,
  },
];

const MANAGEMENT_ENTITIES: EntityRequirement[] = [
  {
    name: 'black_board_members',
    fieldType: 'percentage',
    definition: 'Percentage of black board members',
    aliases: ['Board Representation'],
    positiveExamples: ['50%'],
    negativeExamples: [],
    zones: ['management', 'board'],
    pillar: 'Management Control',
    required: true,
  },
  {
    name: 'black_executive_directors',
    fieldType: 'percentage',
    definition: 'Percentage of black executive directors',
    aliases: ['Executive Directors'],
    positiveExamples: ['50%'],
    negativeExamples: [],
    zones: ['management', 'executive'],
    pillar: 'Management Control',
    required: true,
  },
];

const SKILLS_ENTITIES: EntityRequirement[] = [
  {
    name: 'skills_development_spend',
    fieldType: 'percentage',
    definition: 'Skills development expenditure as percentage of leviable amount',
    aliases: ['Training Spend', 'Skills Spend'],
    positiveExamples: ['6%'],
    negativeExamples: [],
    zones: ['skills', 'training'],
    pillar: 'Skills Development',
    required: true,
  },
];

const ESD_ENTITIES: EntityRequirement[] = [
  {
    name: 'preferential_procurement_spend',
    fieldType: 'currency',
    definition: 'Total procurement spend with B-BBEE compliant suppliers',
    aliases: ['Procurement Spend'],
    positiveExamples: ['R5,000,000'],
    negativeExamples: [],
    zones: ['procurement', 'enterprise'],
    pillar: 'Enterprise and Supplier Development',
    required: true,
  },
  {
    name: 'supplier_development_contributions',
    fieldType: 'currency',
    definition: 'Annual value of supplier development contributions',
    aliases: ['Supplier Dev'],
    positiveExamples: ['R1,000,000'],
    negativeExamples: [],
    zones: ['supplier', 'enterprise'],
    pillar: 'Enterprise and Supplier Development',
    required: true,
  },
];

const SED_ENTITIES: EntityRequirement[] = [
  {
    name: 'socio_economic_spend',
    fieldType: 'currency',
    definition: 'Annual spend on socio-economic development initiatives',
    aliases: ['SED Spend', 'CSI Spend'],
    positiveExamples: ['R500,000'],
    negativeExamples: [],
    zones: ['sed', 'socio-economic', 'csi'],
    pillar: 'Socio-Economic Development',
    required: true,
  },
];

const ALL_ENTITIES = [
  ...OWNERSHIP_ENTITIES,
  ...MANAGEMENT_ENTITIES,
  ...SKILLS_ENTITIES,
  ...ESD_ENTITIES,
  ...SED_ENTITIES,
];

export function buildManifestForSector(sectorCode: string, scorecardType: string): EntityManifest {
  return {
    sectorCode,
    scorecardType,
    requiredEntities: ALL_ENTITIES,
  };
}

export function buildRCOGPGenericManifest(): EntityManifest {
  return buildManifestForSector('RCOGP_GENERIC', 'generic');
}

export function getAllManifests(): EntityManifest[] {
  return [
    buildManifestForSector('RCOGP_GENERIC', 'generic'),
    buildManifestForSector('ICT_GENERIC', 'generic'),
    buildManifestForSector('FSC_GENERIC', 'generic'),
    buildManifestForSector('AGRI_GENERIC', 'generic'),
  ];
}
