/**
 * TMPS, as decided on 11 Oct 2026: the supplier schedule's sum by default —
 * exactly the score live clients already had. A TMPS the documents state is
 * shown beside it as a flagged difference, and is scored only when the user
 * explicitly switches the client to it. The workbook sync's "stated" label is
 * provenance, never a choice. (Invented figures.)
 */
import { describe, expect, it } from 'vitest';
import { resolveTmps, tmpsChoiceOf } from '../shared';
import { resolveProcurementTmps, tmpsAfterSupplierEdit } from '../../store';
import { calculateProcurementScore } from '../procurement';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '../../sectors/transport-qse';

const suppliers = [
  { spend: 300_000 },
  { spend: 200_000 },
];

describe('resolveTmps — the supplier sum by default', () => {
  it('a stated TMPS with no explicit choice scores the supplier sum, and is reported beside it', () => {
    expect(resolveTmps({ persistedTmps: 2_000_000, manualOverride: false, tmpsSource: 'stated', suppliers })).toEqual({
      tmps: 500_000,
      source: 'supplier_spend_sum',
      stated: 2_000_000,
      held: null,
      supplierSum: 500_000,
      differs: true,
      canUseStated: true,
    });
  });

  it('the stated figure is scored only on the explicit choice', () => {
    expect(resolveTmps({ persistedTmps: 2_000_000, manualOverride: false, tmpsSource: 'stated', tmpsChoice: 'stated', suppliers }))
      .toMatchObject({ tmps: 2_000_000, source: 'stated' });
    // Anything that is not exactly the choice is no choice.
    for (const notAChoice of [undefined, null, '', 'Stated', 'supplier_sum', true, 1]) {
      expect(resolveTmps({ persistedTmps: 2_000_000, manualOverride: false, tmpsSource: 'stated', tmpsChoice: notAChoice, suppliers }).tmps)
        .toBe(500_000);
    }
  });

  it('never scores a stated TMPS below the suppliers listed, even when chosen (the sum is its floor)', () => {
    const schedule = [{ spend: 1_000_000 }, { spend: 2_000_000 }];
    const r = resolveTmps({ persistedTmps: 300_000, manualOverride: false, tmpsSource: 'stated', tmpsChoice: 'stated', suppliers: schedule });
    expect(r).toMatchObject({ tmps: 3_000_000, source: 'supplier_spend_sum', stated: 300_000, differs: true, canUseStated: false });
  });

  it('a TMPS held open (contested or #REF!) is reported; the score stays on the supplier sum', () => {
    expect(resolveTmps({ persistedTmps: 0, manualOverride: false, tmpsHeld: 'contested', suppliers }))
      .toMatchObject({ tmps: 500_000, source: 'supplier_spend_sum', held: 'contested', stated: null });
  });

  it('nothing stated: the supplier sum, nothing flagged', () => {
    expect(resolveTmps({ persistedTmps: 0, manualOverride: false, suppliers }))
      .toMatchObject({ tmps: 500_000, source: 'supplier_spend_sum', stated: null, differs: false });
  });

  it('a stated TMPS equal to the sum is not a difference', () => {
    expect(resolveTmps({ persistedTmps: 500_000.4, manualOverride: false, tmpsSource: 'stated', suppliers }).differs).toBe(false);
  });

  it('honours a pinned value exactly, including zero', () => {
    expect(resolveTmps({ persistedTmps: 0, manualOverride: true, tmpsSource: 'stated', suppliers }))
      .toMatchObject({ tmps: 0, source: 'manual' });
  });

  it('tmpsChoiceOf: only the exact word is a choice', () => {
    expect(tmpsChoiceOf('stated')).toBe('stated');
    expect(tmpsChoiceOf('STATED')).toBe('supplier_sum');
    expect(tmpsChoiceOf(undefined)).toBe('supplier_sum');
  });
});

describe('TMPS on a supplier edit', () => {
  const base = { id: '', clientId: '', tmps: 500_000, statedTmps: 2_000_000, suppliers: [] as never[] };

  it('follows the schedule by default, even with a stated figure on record', () => {
    expect(tmpsAfterSupplierEdit({ ...base, tmpsSource: 'supplier_spend_sum' }, [{ spend: 7 } as never])).toBe(7);
  });

  it('keeps a chosen stated figure while it is not below the schedule', () => {
    const chosen = { ...base, tmps: 2_000_000, tmpsChoice: 'stated' as const, tmpsSource: 'stated' as const };
    expect(tmpsAfterSupplierEdit(chosen, [{ spend: 7 } as never])).toBe(2_000_000);
    expect(tmpsAfterSupplierEdit(chosen, [{ spend: 2_500_000 } as never])).toBe(2_500_000);
  });

  it('a pinned TMPS stays exactly as it is', () => {
    expect(tmpsAfterSupplierEdit({ ...base, tmps: 42, tmpsManualOverride: true }, [{ spend: 7 } as never])).toBe(42);
  });

  it('resolveProcurementTmps reads the stated figure the state keeps, not the scored one', () => {
    expect(resolveProcurementTmps({ ...base, suppliers: [{ spend: 500_000 } as never] }))
      .toMatchObject({ tmps: 500_000, stated: 2_000_000, differs: true });
  });
});

describe('the denominator changes the score', () => {
  it('R500k empowering spend is 25/25 against its own sum, and only 15.63 against a stated R2m the user chose', () => {
    const sups = [{ id: 's1', name: 'Quarry Tools', spend: 500_000, beeLevel: 4, blackOwnership: 0, blackWomenOwnership: 0, enterpriseType: 'generic', isEmpoweringSupplier: true }];
    const byDefault = calculateProcurementScore({ id: '', clientId: '', tmps: resolveTmps({ persistedTmps: 2_000_000, manualOverride: false, tmpsSource: 'stated', suppliers: sups }).tmps, suppliers: sups as never }, TRANSPORT_QSE_CALCULATOR_CONFIG);
    const chosen = calculateProcurementScore({ id: '', clientId: '', tmps: resolveTmps({ persistedTmps: 2_000_000, manualOverride: false, tmpsSource: 'stated', tmpsChoice: 'stated', suppliers: sups }).tmps, suppliers: sups as never }, TRANSPORT_QSE_CALCULATOR_CONFIG);
    expect(byDefault.total).toBe(25);
    expect(chosen.total).toBeCloseTo(15.63, 2);
  });
});
