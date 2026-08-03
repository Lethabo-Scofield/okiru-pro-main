/**
 * INVARIANT: an ownership breakdown must reconcile to its pillar cap.
 *
 * The Scorecard page shows a pillar's weighting (e.g. 28) and, below it, the
 * per-indicator sub-lines with their own weightings. If those sub-line
 * weightings sum to MORE than the pillar cap, the breakdown is nonsense — the
 * "how does the possible weight pass 28 but say 28" defect the user hit on
 * Transport QSE (a stray default-3 "designated groups" line the charter has no
 * indicator for, pushing Σ to 31).
 *
 * This test runs EVERY sector config through the real ownership calculator and
 * asserts Σ(sub-line weightings) === pillarConfigs.ownership.maxPoints. It is
 * data-independent: the weightings come from config, not from any company's
 * numbers, so it guards every sector at once and fails the moment a new or
 * edited config mis-allocates its indicator points.
 */
import { describe, expect, it } from 'vitest';
import { calculateOwnershipScore } from '../ownership';
import type { OwnershipData } from '../../types';
import type { CalculatorConfig } from '../../../../shared/schema';

import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '../../sectors/transport-qse';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from '../../sectors/transport-generic';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '../../sectors/rcogp-qse';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '../../sectors/rcogp-generic';
import { ICT_QSE_CALCULATOR_CONFIG } from '../../sectors/ict-qse';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '../../sectors/ict-generic';
import { FSC_QSE_CALCULATOR_CONFIG } from '../../sectors/fsc-qse';
import { FSC_GENERIC_CALCULATOR_CONFIG } from '../../sectors/fsc-generic';
import { FSC_BANKS_CALCULATOR_CONFIG } from '../../sectors/fsc-banks';
import { FSC_LTI_CALCULATOR_CONFIG } from '../../sectors/fsc-lti';
import { FSC_STI_CALCULATOR_CONFIG } from '../../sectors/fsc-sti';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '../../sectors/agri-generic';

const CONFIGS: Array<[string, CalculatorConfig]> = [
  ['TRANSPORT_QSE', TRANSPORT_QSE_CALCULATOR_CONFIG],
  ['TRANSPORT_GENERIC', TRANSPORT_GENERIC_CALCULATOR_CONFIG],
  ['RCOGP_QSE', RCOGP_QSE_CALCULATOR_CONFIG],
  ['RCOGP_GENERIC', RCOGP_GENERIC_CALCULATOR_CONFIG],
  ['ICT_QSE', ICT_QSE_CALCULATOR_CONFIG],
  ['ICT_GENERIC', ICT_GENERIC_CALCULATOR_CONFIG],
  ['FSC_QSE', FSC_QSE_CALCULATOR_CONFIG],
  ['FSC_GENERIC', FSC_GENERIC_CALCULATOR_CONFIG],
  ['FSC_BANKS', FSC_BANKS_CALCULATOR_CONFIG],
  ['FSC_LTI', FSC_LTI_CALCULATOR_CONFIG],
  ['FSC_STI', FSC_STI_CALCULATOR_CONFIG],
  ['AGRI_GENERIC', AGRI_GENERIC_CALCULATOR_CONFIG],
];

const EMPTY: OwnershipData = {
  id: '', clientId: '', shareholders: [],
  companyValue: 0, outstandingDebt: 0, yearsHeld: 0,
} as OwnershipData;

describe('ownership breakdown reconciles to the pillar cap in every sector', () => {
  it.each(CONFIGS)('%s: Σ(sub-line weightings) === ownership maxPoints', (_name, cfg) => {
    const cap = cfg.pillarConfigs?.ownership?.maxPoints ?? 25;
    const res = calculateOwnershipScore(EMPTY, cfg);
    const sum = res.subLines.reduce((acc, l) => acc + l.weighting, 0);
    expect(sum).toBe(cap);
  });

  it('never emits a sub-line whose weighting is zero (no phantom rows)', () => {
    for (const [name, cfg] of CONFIGS) {
      const res = calculateOwnershipScore(EMPTY, cfg);
      const zeroLines = res.subLines.filter((l) => l.weighting === 0).map((l) => l.name);
      expect(zeroLines, `${name} has always-zero breakdown rows: ${zeroLines.join(', ')}`).toEqual([]);
    }
  });
});
