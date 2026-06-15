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
});
