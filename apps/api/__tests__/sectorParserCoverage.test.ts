/**
 * Sync test: the parser's sector/pillar coverage matrix
 * (okiru-ai-parser/schemas/sector_pillar_coverage.ts) must mirror the scoring
 * source of truth (apps/api/pipeline/sectorConfig.ts). If a sector config is
 * added, removed, renamed, or re-pointed, this test fails and forces a
 * deliberate matrix + readiness update.
 */
import { describe, expect, it } from 'vitest';
import { listSectorConfigsFull } from '../pipeline/sectorConfig.js';
import {
  SECTOR_PILLAR_COVERAGE,
  TRUSTED_SECTOR_CODES,
  isTrustedSectorCode,
} from '../../../okiru-ai-parser/schemas/sector_pillar_coverage.js';

function pillarPointsOf(config: ReturnType<typeof listSectorConfigsFull>[number]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(config.pillarConfigs)
      .filter(([, p]) => p && typeof (p as { maxPoints?: unknown }).maxPoints === 'number')
      .map(([k, p]) => [k, (p as { maxPoints: number }).maxPoints]),
  );
}

describe('parser coverage matrix ↔ sectorConfig sync', () => {
  const configs = listSectorConfigsFull();

  it('covers every sector config, in the same order, one-to-one', () => {
    expect(SECTOR_PILLAR_COVERAGE.length).toBe(configs.length);
    configs.forEach((config, i) => {
      const entry = SECTOR_PILLAR_COVERAGE[i];
      expect(entry.sectorCode, `index ${i}`).toBe(config.code);
      expect(entry.scorecardType, entry.configId).toBe(config.type);
      expect(entry.sectorName, entry.configId).toBe(config.name);
      expect(entry.totalMaxPoints, entry.configId).toBe(config.totalPoints);
    });
  });

  it('pillar point snapshots match sectorConfig exactly', () => {
    configs.forEach((config, i) => {
      const entry = SECTOR_PILLAR_COVERAGE[i];
      expect({ ...entry.pillarPoints }, entry.configId).toEqual(pillarPointsOf(config));
    });
  });

  it('trusted sector codes are exactly the distinct codes in sectorConfig', () => {
    const configCodes = Array.from(new Set(configs.map((c) => c.code))).sort();
    expect([...TRUSTED_SECTOR_CODES].sort()).toEqual(configCodes);
  });

  it('GENERIC is not a sector code anywhere in sectorConfig', () => {
    expect(configs.some((c) => c.code === 'GENERIC')).toBe(false);
    expect(isTrustedSectorCode('GENERIC')).toBe(false);
  });
});
