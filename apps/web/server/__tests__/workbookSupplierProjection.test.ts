/**
 * Workbook-path fixes for Polo feedback #8 / #10 (the data-entry surface users
 * actually use — the workbook grid, not the Toolkit pillar pages):
 *  - supplier registration number flows through projectWorkbookToClient
 *  - TMPS falls back to total supplier spend when the Financials section omits it,
 *    so entered suppliers actually score (procurement targets are tmps × pct)
 *  - the legacy ownership "Data Date" column is removed; suppliers gain a reg-number col
 */
import { describe, it, expect } from 'vitest';
import type { WorkbookData } from '../workbookRoutes';
import { projectWorkbookToClient } from '../workbookRoutes';
import { OWNERSHIP_COLUMNS, PROCUREMENT_COLUMNS } from '../../src/components/workbook/sections';

function workbookWithSuppliers(finMeta: Record<string, unknown> = {}): WorkbookData {
  return {
    companyId: 'c1',
    sections: {
      'company-information': { meta: { industrySector: 'RCOGP' } },
      'financial-information': { meta: finMeta },
      procurement: {
        rows: [
          {
            _id: 's1', supplierName: 'Acme (Pty) Ltd', registrationNumber: '2019/123456/07',
            currentSize: 'Generic', bbbeeLevel: '1',
            currentBlackOwnership: 60, currentBlackFemaleOwnership: 35, spend: 1_000_000,
          },
          {
            _id: 's2', supplierName: 'Beta CC',
            currentSize: 'QSE', bbbeeLevel: '2', spend: 500_000,
          },
        ],
      },
    },
  } as unknown as WorkbookData;
}

describe('workbook numeric parsing — formatted strings must not zero out', () => {
  it('parses thousands separators, currency symbols, spaces and percent signs', () => {
    const wb = {
      companyId: 'c1',
      sections: {
        'company-information': { meta: { industrySector: 'RCOGP' } },
        'financial-information': { meta: { revenue: '1,000,000', npat: 'R 250 000', payroll: '4 000 000' } },
        procurement: {
          rows: [
            {
              _id: 's1', supplierName: 'Acme', currentSize: 'Generic', bbbeeLevel: '1',
              currentBlackOwnership: '60%', currentBlackFemaleOwnership: '35%', spend: 'R 500,000',
            },
          ],
        },
      },
    } as unknown as WorkbookData;
    const p = projectWorkbookToClient(wb);
    // Financials: commas / currency / spaces no longer NaN→0
    expect(p.financials.revenue).toBe(1_000_000);
    expect(p.financials.npat).toBe(250_000);
    // payroll "4 000 000" parsed (not NaN→0) → leviableAmount = full payroll
    // (the skills-levy base; workbook: Leviable Amount for Skills = Total Payroll).
    expect(p.financials.leviableAmount).toBe(4_000_000);
    // Supplier: "R 500,000" spend, "60%" black ownership → fraction 0.6 (≥51%)
    const sup = p.suppliers[0];
    expect(sup.spend).toBe(500_000);
    expect(sup.blackOwnership).toBeCloseTo(0.6, 5);
    expect(sup.isBlackOwned51).toBe(true);
  });
});

describe('workbook supplier projection (Polo #8/#10)', () => {
  it('derives TMPS from supplier spend when Financials omits it', () => {
    const p = projectWorkbookToClient(workbookWithSuppliers());
    expect(p.financials.tmps).toBe(1_500_000);
  });

  it('keeps an explicit Financials TMPS over the supplier-spend fallback', () => {
    const p = projectWorkbookToClient(workbookWithSuppliers({ tmps: 9_000_000 }));
    expect(p.financials.tmps).toBe(9_000_000);
  });

  it('carries the supplier registration number through the projection', () => {
    const p = projectWorkbookToClient(workbookWithSuppliers());
    expect(p.suppliers[0].registrationNumber).toBe('2019/123456/07');
  });

  it('removed the meaningless ownership Data Date column; suppliers have a reg-number column', () => {
    expect(OWNERSHIP_COLUMNS.some((c) => c.key === 'dataDate')).toBe(false);
    expect(PROCUREMENT_COLUMNS.some((c) => c.key === 'registrationNumber')).toBe(true);
  });

  it('leaves isEmpoweringSupplier UNDEFINED when the row omits the column (not false)', () => {
    // The procurement calc reads `isEmpoweringSupplier ?? (beeLevel 1-8)`. A
    // parser-extracted supplier row has no "Empowering Supplier" cell; coercing
    // that absence to `false` is NOT nullish, so it excluded every such supplier
    // from the empowering-spend line — the ONLY scoring line for Transport QSE PP.
    const p = projectWorkbookToClient(workbookWithSuppliers());
    expect(p.suppliers[0].isEmpoweringSupplier).toBeUndefined();
  });

  it('keeps an explicit empowering flag when the row carries the column', () => {
    const wb: WorkbookData = {
      companyId: 'c', sections: {
        'company-information': { meta: { industrySector: 'RCOGP' } },
        procurement: { rows: [{ _id: 'x', supplierName: 'Ex', bbbeeLevel: '1', spend: 1000, empoweringSupplier: 'No' }] },
      }, updatedAt: new Date().toISOString(),
    } as any;
    expect(projectWorkbookToClient(wb).suppliers[0].isEmpoweringSupplier).toBe(false);
  });

  // A learner marked "No" for Foreign/Disabled must NOT come through as foreign/
  // disabled. The projection previously used Boolean("No") === true, so string
  // yes/no values (e.g. from Excel import) flipped the flags. coerceYesNo fixes it.
  it('coerces string Yes/No skills flags correctly (No -> false, Yes -> true)', () => {
    const wb = {
      companyId: 'c1',
      sections: {
        'company-information': { meta: { industrySector: 'RCOGP' } },
        'skills-development': {
          rows: [
            { _id: 's1', programName: 'P', categoryCode: 'D', learnerName: 'No One',
              race: 'African', gender: 'Male', isForeign: 'No', isDisabled: 'No', courseCost: 50000 },
            { _id: 's2', programName: 'P', categoryCode: 'D', learnerName: 'Yes One',
              race: 'African', gender: 'Female', isForeign: 'Yes', isDisabled: 'Yes', courseCost: 50000 },
          ],
        },
      },
    } as unknown as WorkbookData;
    const tps = projectWorkbookToClient(wb).trainingPrograms;
    const noOne = tps.find((t: any) => t.learnerName === 'No One');
    const yesOne = tps.find((t: any) => t.learnerName === 'Yes One');
    expect(noOne.isForeign).toBe(false);
    expect(noOne.isDisabled).toBe(false);
    expect(yesOne.isForeign).toBe(true);
    expect(yesOne.isDisabled).toBe(true);
  });
});
