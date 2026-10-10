/**
 * The stated TMPS is the Preferential Procurement denominator; the supplier
 * schedule's sum is only its floor. The live store used to recompute TMPS as
 * the schedule sum on every load and every supplier edit, so a TMPS the
 * client's workbook stated never reached the score. (Invented figures.)
 */
import { describe, expect, it } from 'vitest';
import { resolveTmps } from '../shared';
import { tmpsAfterSupplierEdit } from '../../store';
import { calculateProcurementScore } from '../procurement';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '../../sectors/transport-qse';

const suppliers = [
  { spend: 300_000 },
  { spend: 200_000 },
];

describe('resolveTmps', () => {
  it('keeps a TMPS a document stated instead of the supplier sum', () => {
    expect(resolveTmps({ persistedTmps: 2_000_000, manualOverride: false, tmpsSource: 'stated', suppliers }))
      .toEqual({ tmps: 2_000_000, source: 'stated' });
  });

  it('scores nothing from a TMPS held open (contested or #REF!)', () => {
    expect(resolveTmps({ persistedTmps: 0, manualOverride: false, tmpsHeld: 'contested', suppliers }))
      .toEqual({ tmps: 0, source: 'held' });
  });

  it('uses the supplier sum only when nothing was stated, and labels it', () => {
    expect(resolveTmps({ persistedTmps: 0, manualOverride: false, suppliers }))
      .toEqual({ tmps: 500_000, source: 'supplier_spend_sum' });
  });

  it('honours a pinned value exactly, including zero', () => {
    expect(resolveTmps({ persistedTmps: 0, manualOverride: true, tmpsSource: 'stated', suppliers }))
      .toEqual({ tmps: 0, source: 'manual' });
  });

  it('a stated TMPS survives a supplier edit', () => {
    const procurement = { id: '', clientId: '', tmps: 2_000_000, tmpsSource: 'stated' as const, suppliers: [] };
    expect(tmpsAfterSupplierEdit(procurement, [{ spend: 1 } as never])).toBe(2_000_000);
    expect(tmpsAfterSupplierEdit({ ...procurement, tmpsSource: 'supplier_spend_sum' }, [{ spend: 7 } as never])).toBe(7);
  });

  it('the denominator changes the score: R500k empowering spend is 25/25 against its own sum but 15.63 against a stated R2m', () => {
    const sups = [{ id: 's1', name: 'Quarry Tools', spend: 500_000, beeLevel: 4, blackOwnership: 0, blackWomenOwnership: 0, enterpriseType: 'generic', isEmpoweringSupplier: true }];
    const againstSum = calculateProcurementScore({ id: '', clientId: '', tmps: resolveTmps({ persistedTmps: 0, manualOverride: false, suppliers: sups }).tmps, suppliers: sups as never }, TRANSPORT_QSE_CALCULATOR_CONFIG);
    const againstStated = calculateProcurementScore({ id: '', clientId: '', tmps: resolveTmps({ persistedTmps: 2_000_000, manualOverride: false, tmpsSource: 'stated', suppliers: sups }).tmps, suppliers: sups as never }, TRANSPORT_QSE_CALCULATOR_CONFIG);
    expect(againstSum.total).toBe(25);
    expect(againstStated.total).toBeCloseTo(15.63, 2);
  });
});
