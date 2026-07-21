import { describe, expect, it } from 'vitest';
import { buildManifest } from '../pipeline/extraction/entityManifest.js';
import {
  getSectorConfig,
  findSectorConfigIntegrityIssues,
  listSectorConfigsFull,
} from '../pipeline/sectorConfig.js';

/**
 * Cross-sector integrity guard.
 *
 * The sector config is the governed source of truth for scorecard points — it is
 * ledger-checked (sectorConfig.integrity.test.ts) and pinned per sector
 * (fscScorecard.test.ts). The manifest is DERIVED from it, so the points the
 * manifest can award must never exceed what the config declares.
 *
 * This guards a real defect: buildManifest fabricated 15/12/5 points for FSC's
 * empowermentFinancing / accessToFinancialServices / consumerEducation pillars
 * via `?? { maxPoints: N }` fallbacks when the config did not define them, so the
 * FSC manifest summed to 152 against a scorecard governed at 120 — inflating
 * financial-sector scores. Any future "helpful" default will fail here.
 */

const SECTORS: Array<[string, string]> = [
  ['RCOGP', 'Generic'],
  ['ICT', 'Generic'],
  ['FSC', 'Generic'],
  ['AGRI', 'Generic'],
  ['RCOGP', 'QSE'],
  ['ICT', 'QSE'],
];

describe('sector config internal integrity (all shipped configs)', () => {
  it('every config declares exactly the points its pillars can award', () => {
    // Covers ALL configs, not just the handful enumerated below — a new sector
    // with a bad total is caught the moment it ships. chooseOneGroup electives
    // are handled by the production helper (Transport QSE: 82 + one 25 = 107).
    const issues = findSectorConfigIntegrityIssues();
    const detail = issues
      .map((i) => `${i.configId}: declares ${i.declaredTotal} but pillars sum to ${i.pillarSum}`)
      .join('; ');
    expect(issues, `sector configs out of balance — ${detail}`).toEqual([]);
  });

  it('audits more than a token number of configs', () => {
    // Guards the guard: if the config registry is ever gutted, the check above
    // would pass vacuously.
    expect(listSectorConfigsFull().length).toBeGreaterThanOrEqual(10);
  });
});

describe('manifest ↔ sector config consistency', () => {
  for (const [code, type] of SECTORS) {
    it(`${code} ${type}: manifest max points equals the config's declared total`, async () => {
      const config = getSectorConfig(code, type);
      expect(config, `${code} ${type} has no sector config`).toBeTruthy();

      const manifest = await buildManifest(code, type);
      const manifestMax = manifest.pillarPacks.reduce((sum, p) => sum + p.maxPoints, 0);

      expect(
        manifestMax,
        `${code} ${type}: manifest can award ${manifestMax} points but the governed config declares ` +
          `${config!.totalMaxPoints}. The manifest must not invent points the config does not define.`,
      ).toBe(config!.totalMaxPoints);
    });
  }

  it('no manifest pillar awards points the config does not declare for that pillar', async () => {
    const config = getSectorConfig('FSC', 'Generic')!;
    const manifest = await buildManifest('FSC', 'Generic');

    // FSC's sector-specific pillars are the ones that regressed. Each must draw
    // its points from pillarConfigs, defaulting to zero when undefined.
    for (const pillarCode of ['empowermentFinancing', 'accessToFinancialServices', 'consumerEducation'] as const) {
      const pack = manifest.pillarPacks.find((p) => p.pillarCode === pillarCode);
      if (!pack) continue;
      const declared = (config.pillarConfigs as Record<string, { maxPoints: number } | undefined>)[pillarCode];
      expect(
        pack.maxPoints,
        `${pillarCode} awards ${pack.maxPoints} points but the config declares ${declared?.maxPoints ?? 0}`,
      ).toBe(declared?.maxPoints ?? 0);
    }
  });
});
