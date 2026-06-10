import { describe, it, expect } from 'vitest';
import { getSectorConfig } from '../../../../../../api/pipeline/sectorConfig';
import { sectorConfigToCalculatorConfig } from '../../sectors/rcogp-generic';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateManagementScore } from '../management';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';
import { SectorConfigError } from '../shared';
import type { SkillsData, ProcurementData, ManagementData, ESDData, SEDData } from '../../types';
import type { CalculatorConfig } from '../../../../../shared/schema';

const SKILLS_DATA: SkillsData = {
  id: '1',
  clientId: 'C-1',
  leviableAmount: 10_000_000,
  trainingPrograms: [{
    id: '1',
    name: 'Program',
    category: 'short_course',
    cost: 350_000,
    isEmployed: true,
    isBlack: true,
    gender: 'Male',
    race: 'African',
    isDisabled: false,
  }],
};

const PROCUREMENT_DATA: ProcurementData = {
  id: '1',
  clientId: 'C-1',
  tmps: 10_000_000,
  suppliers: [],
};

const MANAGEMENT_DATA: ManagementData = {
  id: '1',
  clientId: 'C-1',
  employees: [],
};

const ESD_DATA: ESDData = { id: '1', clientId: 'C-1', contributions: [] };
const SED_DATA: SEDData = { id: '1', clientId: 'C-1', contributions: [] };
const NPAT = 10_000_000;

function incompleteSectorConfig(sectorCode: string): CalculatorConfig {
  return {
    sectorCode,
    scorecardType: 'Generic',
    totalMaxPoints: 120,
    ownership: {
      votingRightsMax: 25,
      womenBonusMax: 2,
      economicInterestMax: 4,
      netValueMax: 8,
      targetEconomicInterest: 0.25,
      subMinNetValue: 10,
    },
    management: {} as CalculatorConfig['management'],
    skills: {} as CalculatorConfig['skills'],
    procurement: {} as CalculatorConfig['procurement'],
    esd: {} as CalculatorConfig['esd'],
    sed: {} as CalculatorConfig['sed'],
    discounting: { dropLevels: 1, maxDropLevel: 8 },
    benefitFactors: [],
    industryNorms: [],
  };
}

describe('sector config required (no silent RCOGP fallback)', () => {
  describe.each(['ICT', 'AGRI', 'FSC'] as const)('%s Generic', (sectorCode) => {
    it('skills throws when pillar config is missing', () => {
      expect(() => calculateSkillsScore(SKILLS_DATA, incompleteSectorConfig(sectorCode)))
        .toThrow(SectorConfigError);
      expect(() => calculateSkillsScore(SKILLS_DATA, incompleteSectorConfig(sectorCode)))
        .toThrow(new RegExp(`missing skills config for sector ${sectorCode} Generic`, 'i'));
    });

    it('procurement throws when pillar config is missing', () => {
      expect(() => calculateProcurementScore(PROCUREMENT_DATA, incompleteSectorConfig(sectorCode)))
        .toThrow(SectorConfigError);
    });

    it('management throws when pillar config is missing', () => {
      expect(() => calculateManagementScore(MANAGEMENT_DATA, incompleteSectorConfig(sectorCode)))
        .toThrow(SectorConfigError);
    });

    it('esd throws when pillar config is missing', () => {
      expect(() => calculateEsdScore(ESD_DATA, NPAT, incompleteSectorConfig(sectorCode)))
        .toThrow(SectorConfigError);
    });

    it('sed throws when pillar config is missing', () => {
      expect(() => calculateSedScore(SED_DATA, NPAT, incompleteSectorConfig(sectorCode)))
        .toThrow(SectorConfigError);
    });

    it('does not silently score skills with RCOGP defaults', () => {
      const incomplete = incompleteSectorConfig(sectorCode);
      expect(() => calculateSkillsScore(SKILLS_DATA, incomplete)).toThrow(SectorConfigError);

      const fullConfig = sectorConfigToCalculatorConfig(getSectorConfig(sectorCode, 'Generic'));
      const sectorResult = calculateSkillsScore(SKILLS_DATA, fullConfig);
      const rcogpResult = calculateSkillsScore(SKILLS_DATA);

      // Each non-RCOGP sector has a different learningProgrammes max than RCOGP Generic (6 pts).
      // ICT=8, AGRI=8, FSC=11 — verifying the sector-specific config was loaded and used.
      // Note: FSC Generic uses the same 3.5% spend approximation as RCOGP (intentional
      // approximation — FSC has per-level targets not yet fully modelled), so targetOverall
      // may coincidentally match. The learningProgrammes cap is the reliable differentiator.
      expect(sectorResult.learningProgrammes).not.toBe(rcogpResult.learningProgrammes);
    });
  });

  describe('RCOGP Generic backward compatibility', () => {
    it('scores with embedded defaults when no config is supplied (tests)', () => {
      const result = calculateSkillsScore(SKILLS_DATA);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.rawStats.targetOverall).toBeCloseTo(10_000_000 * 0.035, 0);
    });

    it('scores with explicit RCOGP Generic sector metadata and empty pillar objects', () => {
      const config: CalculatorConfig = {
        ...incompleteSectorConfig('RCOGP'),
        sectorCode: 'RCOGP',
        scorecardType: 'Generic',
      };
      const result = calculateSkillsScore(SKILLS_DATA, config);
      expect(result.rawStats.targetOverall).toBeCloseTo(10_000_000 * 0.035, 0);
    });

    it('scores with full RCOGP Generic sector config from sectorConfig.ts', () => {
      const config = sectorConfigToCalculatorConfig(getSectorConfig('RCOGP', 'Generic'));
      const result = calculateSkillsScore(SKILLS_DATA, config);
      expect(Number.isFinite(result.total)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });
});
