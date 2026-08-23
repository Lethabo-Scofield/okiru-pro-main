/**
 * The sector list the upload flow offers.
 *
 * MAC was implemented end to end — MAC_GENERIC and MAC_QSE score, and the
 * Toolkit carries mac-generic/mac-qse — but it never reached SECTOR_OPTIONS, so
 * no client could pick it. It was the only implemented sector missing from the
 * dropdown.
 *
 * It is offered PROVISIONAL rather than plain, because sectorConfig.ts marks
 * MAC's level ladder, priority elements and sub-minimums as applied by analogy
 * with the Amended Codes rather than transcribed from GG 39887. A sector that
 * scores on assumptions must say so where it is chosen; a level nobody flagged
 * is a level someone will certify.
 */
import { describe, expect, it } from 'vitest';
import { SECTOR_OPTIONS } from '../../parser/sector_documents.js';

describe('SECTOR_OPTIONS', () => {
  it('offers MAC', () => {
    const mac = SECTOR_OPTIONS.find((s) => s.code === 'MAC');
    expect(mac).toBeDefined();
    expect(mac!.label).toContain('Marketing');
  });

  it('marks MAC provisional and says what is unconfirmed', () => {
    const mac = SECTOR_OPTIONS.find((s) => s.code === 'MAC')!;
    expect(mac.provisional).toBe(true);
    expect(mac.provisionalNote).toBeTruthy();
    // The note has to name the actual gap, not just hedge.
    expect(mac.provisionalNote!.toLowerCase()).toContain('level ladder');
    expect(mac.provisionalNote!.toLowerCase()).toContain('sub-minimum');
  });

  it('leaves every verified sector unflagged', () => {
    for (const sector of SECTOR_OPTIONS.filter((s) => s.code !== 'MAC')) {
      expect(sector.provisional, `${sector.code} should not be provisional`).toBeFalsy();
    }
  });

  it('has no duplicate codes and labels every option', () => {
    const codes = SECTOR_OPTIONS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const sector of SECTOR_OPTIONS) {
      expect(sector.label.trim().length).toBeGreaterThan(0);
    }
  });
});
