/**
 * FSC Empowerment Financing ingestion — the "Empowerment Financing" facility
 * sheet was unmapped, so R-billions of qualifying EF facilities never reached
 * the EF pillar. normalizeExcelBuffer now parses it into esd.meta.efFacilities
 * and projectWorkbookToClient carries it on financials.empowermentFinancing.
 *
 * Ground truth (Sechaba_Financial_Group_FSC_Banks_LongTerm workbook):
 * 6 facilities, Rand Value Advanced total R9,800,000,000, all Qualifying % = 100;
 * 4 Targeted-Investment categories (R7.8bn) + 2 Transaction-Financing/Risk-Capital
 * categories (R2.0bn).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeExcelBuffer } from '@/lib/workbookExcelNormalizer';
import { projectWorkbookToClient, type WorkbookData } from '../../../server/workbookRoutes';

const DIR = resolve(process.cwd(), '../../docs/Toolkit Testing Data');

function importOf(file: string) {
  const buf = readFileSync(resolve(DIR, file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return normalizeExcelBuffer(ab);
}

describe('FSC Empowerment Financing ingestion', () => {
  it('parses the Banks workbook EF sheet into esd.meta.efFacilities', () => {
    const imp = importOf('Sechaba_Financial_Group_FSC_Banks_LongTerm_BBBEE.xlsx');
    const meta = (imp.sections['esd']?.meta ?? {}) as Record<string, unknown>;
    const facilities = meta.efFacilities as Array<Record<string, unknown>>;
    expect(facilities).toBeDefined();
    expect(facilities.length).toBe(6);
    const totalAdvanced = facilities.reduce((s, f) => s + Number(f.valueAdvanced), 0);
    expect(totalAdvanced).toBe(9_800_000_000);
    // Every facility in this workbook states Qualifying % = 100.
    for (const f of facilities) expect(f.qualifyingPercent).toBe(100);
    // Categories preserved verbatim for the TI/TF split.
    const cats = facilities.map((f) => String(f.category));
    expect(cats).toContain('Transformational Infrastructure');
    expect(cats).toContain('B-BBEE Transaction Financing');
  });

  it('carries facilities through projectWorkbookToClient on financials.empowermentFinancing', () => {
    const imp = importOf('Sechaba_Financial_Group_FSC_Banks_LongTerm_BBBEE.xlsx');
    const wb: WorkbookData = {
      companyId: 'x', ownerOrganizationId: null, ownerUserId: 'x',
      sections: imp.sections as any, updatedAt: new Date().toISOString(),
    };
    const p = projectWorkbookToClient(wb);
    const ef = (p.financials as any).empowermentFinancing;
    expect(ef).toBeDefined();
    expect(ef.facilities.length).toBe(6);
  });

  it('does not fabricate EF for a non-FSC workbook (no EF sheet)', () => {
    const imp = importOf('Kgodiso_Industrial_Holdings_Generic_BBBEE.xlsx');
    const meta = (imp.sections['esd']?.meta ?? {}) as Record<string, unknown>;
    expect(meta.efFacilities).toBeUndefined();
  });
});
