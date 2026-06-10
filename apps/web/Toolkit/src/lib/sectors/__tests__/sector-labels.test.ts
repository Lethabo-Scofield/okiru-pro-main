import { describe, expect, it } from 'vitest';
import {
  activeSectorDisplayLabel,
  pillarBreakdownSubtitle,
} from '../sector-labels';

describe('sector-labels', () => {
  it('labels RCOGP Generic', () => {
    expect(
      activeSectorDisplayLabel({ sectorCode: 'RCOGP', companySize: 'Generic' }),
    ).toBe('RCOGP Generic Codes');
  });

  it('labels FSC Banks sub-sector', () => {
    expect(
      activeSectorDisplayLabel({
        sectorCode: 'FSC',
        companySize: 'Generic',
        fscSubSector: 'Banks',
      }),
    ).toBe('Banks (FS701)');
  });

  it('builds skills breakdown subtitle from sub-lines', () => {
    const subLines = [
      { weighting: 8, isBonus: false },
      { weighting: 8, isBonus: false },
      { weighting: 4, isBonus: false },
      { weighting: 5, isBonus: true },
    ];
    expect(
      pillarBreakdownSubtitle(
        subLines,
        { sectorCode: 'FSC', companySize: 'Generic', fscSubSector: 'Banks' },
      ),
    ).toBe('4 sub-line indicators per Banks (FS701) (20 base + 5 bonus)');
  });
});
