/**
 * Synthetic scorecard fixtures for the impact engine.
 *
 * Entirely invented data - no client information, ever. Each fixture is a complete
 * PillarState built from one "strength" dial (0 = nothing captured, 1 = fully
 * empowered), so a rule change can be seen across the whole range of outcomes:
 * every point and every level boundary a real client could sit on.
 */
import type { PillarState } from '../../scoring/calculateScorecard';
import type { ScorecardId } from '../scorecards';
import type {
  Client, OwnershipData, ManagementData, SkillsData, ProcurementData, ESDData, SEDData,
  Employee, Contribution, ScorecardResult,
} from '../../types';

export const FIXTURE_PROFILES = [
  { id: 'none', strength: 0 },
  { id: 'weak', strength: 0.25 },
  { id: 'mid', strength: 0.5 },
  { id: 'strong', strength: 0.8 },
  { id: 'full', strength: 1 },
] as const;
export type FixtureProfileId = (typeof FIXTURE_PROFILES)[number]['id'];

const CLIENT_BY_SCORECARD: Record<ScorecardId, Partial<Client>> = {
  'rcogp-generic': { sectorCode: 'RCOGP', scorecardType: 'Generic', companySize: 'Generic' },
  'rcogp-qse': { sectorCode: 'RCOGP', scorecardType: 'QSE', companySize: 'QSE' },
  'ict-generic': { sectorCode: 'ICT', scorecardType: 'Generic', companySize: 'Generic' },
  'ict-qse': { sectorCode: 'ICT', scorecardType: 'QSE', companySize: 'QSE' },
  'agri-generic': { sectorCode: 'AGRI', scorecardType: 'Generic', companySize: 'Generic' },
  'fsc-others': { sectorCode: 'FSC', scorecardType: 'Generic', companySize: 'Generic', fscSubSector: 'Others' },
  'fsc-banks': { sectorCode: 'FSC', scorecardType: 'Generic', companySize: 'Generic', fscSubSector: 'Banks' },
  'fsc-lti': { sectorCode: 'FSC', scorecardType: 'Generic', companySize: 'Generic', fscSubSector: 'LTI' },
  'fsc-sti': { sectorCode: 'FSC', scorecardType: 'Generic', companySize: 'Generic', fscSubSector: 'STI' },
};

const DESIGNATIONS = ['Board', 'Executive Director', 'Other Executive Management', 'Senior', 'Middle', 'Junior'] as const;
const NPAT = 10_000_000;
const LEVIABLE = 8_000_000;
const TMPS = 100_000_000;

export interface Fixture {
  id: string;
  scorecardId: ScorecardId;
  profile: FixtureProfileId;
  strength: number;
  state: PillarState;
}

export function buildFixture(scorecardId: ScorecardId, profile: (typeof FIXTURE_PROFILES)[number]): Fixture {
  const s = profile.strength;
  const clientId = `fixture-${scorecardId}-${profile.id}`;

  const client = {
    id: clientId, name: `Synthetic ${scorecardId} ${profile.id}`, financialYear: '2026',
    revenue: 120_000_000, npat: NPAT, leviableAmount: LEVIABLE, industry: 'Generic', eapProvince: 'National',
    financialHistory: [], registrationNumber: '', physicalAddress: '', contactPerson: '', contactEmail: '',
    contactPhone: '', annualTurnover: 120_000_000, numberOfEmployees: 60,
    ...CLIENT_BY_SCORECARD[scorecardId],
  } as Client;

  const ownership: OwnershipData = {
    id: clientId, clientId,
    shareholders: [{
      id: 'sh1', name: 'Synthetic holder', ownershipType: 'shareholder',
      blackOwnership: s, blackWomenOwnership: s * 0.5, shares: 100, shareValue: 1,
      votingRightsPercent: 1, economicInterestPercent: 1, isDesignatedGroup: false, blackNewEntrant: s >= 0.5,
    } as OwnershipData['shareholders'][number]],
    companyValue: 50_000_000, outstandingDebt: Math.round(20_000_000 * (1 - s)), yearsHeld: 5,
    ownershipScorePoints: 0, ownershipScorePercent: 0, netValuePoints: 0, netValuePercent: 0,
  };

  const employees: Employee[] = [];
  for (const [d, designation] of DESIGNATIONS.entries()) {
    for (let i = 0; i < 6; i++) {
      const black = i / 6 < s;
      employees.push({
        id: `e${d}-${i}`, name: `Emp ${d}-${i}`, designation,
        gender: i % 2 === 0 ? 'Female' : 'Male', race: black ? 'African' : 'White', isDisabled: s >= 0.8 && i === 0,
      } as Employee);
    }
  }
  const management: ManagementData = { id: clientId, clientId, employees };

  const skills: SkillsData = {
    id: clientId, clientId, leviableAmount: LEVIABLE, yesCandidatesCount: 0, yesAbsorbedCount: 0,
    trainingPrograms: [
      { id: 'tp1', name: 'Learning programme', category: 'short_course', cost: LEVIABLE * 0.06 * s, isEmployed: true, isBlack: true, gender: 'Female', race: 'African', isDisabled: false },
      { id: 'tp2', name: 'Bursary', category: 'bursary', cost: LEVIABLE * 0.03 * s, isEmployed: false, isBlack: true, gender: 'Male', race: 'African', isDisabled: false },
    ] as SkillsData['trainingPrograms'],
  };

  const procurement: ProcurementData = {
    id: clientId, clientId, tmps: TMPS,
    suppliers: [
      { id: 'sup1', name: 'Empowered supplier', beeLevel: 1, blackOwnership: 0.75, blackWomenOwnership: 0.4, youthOwnership: 0, disabledOwnership: 0, enterpriseType: 'generic', spend: TMPS * 0.9 * s },
      { id: 'sup2', name: 'EME supplier', beeLevel: 2, blackOwnership: 0.6, blackWomenOwnership: 0.3, youthOwnership: 0, disabledOwnership: 0, enterpriseType: 'eme', spend: TMPS * 0.2 * s },
      { id: 'sup3', name: 'QSE supplier', beeLevel: 3, blackOwnership: 0.5, blackWomenOwnership: 0.2, youthOwnership: 0, disabledOwnership: 0, enterpriseType: 'qse', spend: TMPS * 0.15 * s },
    ] as ProcurementData['suppliers'],
  };

  const contribution = (id: string, category: string, amount: number, type = 'grant') =>
    ({ id, beneficiary: id, type, amount, category }) as Contribution;
  const esd: ESDData = {
    id: clientId, clientId, graduationBonus: s >= 0.8, jobsCreatedBonus: s >= 0.8,
    contributions: [
      contribution('sd1', 'supplier_development', NPAT * 0.02 * s),
      contribution('ed1', 'enterprise_development', NPAT * 0.01 * s),
      contribution('g1', 'supplier_development', NPAT * 0.01 * s, 'guarantees'),
    ],
  };
  const sed: SEDData = { id: clientId, clientId, contributions: [contribution('sed1', 'socio_economic', NPAT * 0.01 * s)] };

  return {
    id: clientId, scorecardId, profile: profile.id, strength: s,
    state: {
      client, ownership, management, skills, procurement, esd, sed,
      afs: { id: clientId, clientId }, empowermentFinancing: { id: clientId, clientId },
      scorecard: {} as ScorecardResult, // never read by the scorer; present only to satisfy PillarState
    } as PillarState,
  };
}

export function buildFixtures(scorecardId: ScorecardId): Fixture[] {
  return FIXTURE_PROFILES.map((p) => buildFixture(scorecardId, p));
}
