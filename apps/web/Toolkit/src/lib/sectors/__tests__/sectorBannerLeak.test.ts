/**
 * Guard against SECTOR-NAME LEAKS in UI copy.
 *
 * The Management Control page showed "FSC Management Control: Senior, Middle and
 * Junior bands are NOT AVAILABLE…" to a Transport QSE client (Thandanani). The
 * banner was gated on a purely STRUCTURAL test — Senior/Middle/Junior all worth
 * zero — which is true for eight configs: the four FSC ones, Transport QSE, and
 * all three Construction. So every Transport and Construction client was told
 * they were being measured under the Financial Sector Code.
 *
 * The lesson generalises: a structural condition must never carry a hardcoded
 * sector name. These tests pin the two halves of the fix — the condition really
 * does span sectors, and the label really is derived from the client's config.
 */
import { describe, it, expect } from 'vitest';
import { activeSectorDisplayLabel } from '../sector-labels';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '../rcogp-generic';
import { FSC_GENERIC_CALCULATOR_CONFIG } from '../fsc-generic';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '../transport-qse';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from '../transport-generic';
import type { CalculatorConfig } from '../../../../../shared/schema';
import type { Client } from '../../types';

/** The MC page's `smjNotAvailable` predicate, mirrored. */
function smjNotAvailable(cfg: CalculatorConfig): boolean {
  const mc = cfg.managementControl;
  return (mc?.seniorMaxPts ?? 0) === 0 && (mc?.middleMaxPts ?? 0) === 0 && (mc?.juniorMaxPts ?? 0) === 0;
}

const clientFor = (cfg: CalculatorConfig): Client =>
  ({
    sectorCode: cfg.sectorCode,
    scorecardType: cfg.scorecardType,
    companySize: cfg.scorecardType,
  }) as Client;

describe('sector-name leaks in shared UI copy', () => {
  it('the SMJ-not-available condition is NOT unique to FSC', () => {
    // If this ever becomes FSC-only the banner could safely say "FSC" — until
    // then, any copy behind this condition must derive its sector name.
    expect(smjNotAvailable(FSC_GENERIC_CALCULATOR_CONFIG)).toBe(true);
    expect(smjNotAvailable(TRANSPORT_QSE_CALCULATOR_CONFIG)).toBe(true);
  });

  it('names the client\'s own sector, never a hardcoded one', () => {
    const label = activeSectorDisplayLabel(
      clientFor(TRANSPORT_QSE_CALCULATOR_CONFIG),
      TRANSPORT_QSE_CALCULATOR_CONFIG,
    );
    expect(label).toContain('Transport');
    expect(label).not.toContain('FSC');
  });

  it('names the FSC SUB-SECTOR for an FSC client, not a generic "FSC"', () => {
    // FSC resolves to its gazetted sub-sector code — "Others (FS700)", "Banks
    // (FS600)" and so on — which is what a verifier expects to see, and is more
    // specific than the word the banner used to hardcode.
    const label = activeSectorDisplayLabel(
      clientFor(FSC_GENERIC_CALCULATOR_CONFIG),
      FSC_GENERIC_CALCULATOR_CONFIG,
    );
    expect(label).toMatch(/FS\d{3}/);
    expect(label).not.toContain('Transport');
  });

  it('does not leak between unrelated sectors', () => {
    for (const [cfg, forbidden] of [
      [RCOGP_GENERIC_CALCULATOR_CONFIG, ['FSC', 'Transport', 'AgriBEE']],
      [TRANSPORT_GENERIC_CALCULATOR_CONFIG, ['FSC', 'RCOGP', 'AgriBEE']],
    ] as Array<[CalculatorConfig, string[]]>) {
      const label = activeSectorDisplayLabel(clientFor(cfg), cfg);
      for (const bad of forbidden) expect(label).not.toContain(bad);
    }
  });
});
