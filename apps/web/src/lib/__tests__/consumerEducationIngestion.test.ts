/**
 * FSC Consumer Education ingestion — regression for the "points the workbook
 * accounts for aren't reflecting" class of bug.
 *
 * The FSC "Consumer Education" sheet is a per-programme contribution table that
 * matchSheetName leaves unmapped, so its spend never reached the SED & CE
 * scorecard and the Consumer Education line scored 0 despite real data.
 * normalizeExcelBuffer now sums the Spend column into sed.meta.ceSpend.
 *
 * Ground truth (Sechaba_Financial_Group_FSC_Banks_LongTerm workbook):
 *   Money Smart Townships   R1,008,000
 *   Save & Plan Schools     R  756,000
 *   Digital Banking Safety  R  756,000
 *   Total                   R2,520,000  (= 0.6% of R420M NPAT, matching the
 *                                        workbook's own Sector Targets sheet)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeExcelBuffer } from '@/lib/workbookExcelNormalizer';

const DIR = resolve(process.cwd(), '../../docs/Toolkit Testing Data');

function ceSpendFor(file: string): number | undefined {
  const buf = readFileSync(resolve(DIR, file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const imp = normalizeExcelBuffer(ab);
  const meta = (imp.sections['sed']?.meta ?? {}) as Record<string, unknown>;
  return meta.ceSpend as number | undefined;
}

describe('FSC Consumer Education ingestion → sed.meta.ceSpend', () => {
  it('sums the Consumer Education Spend column into ceSpend (Banks workbook)', () => {
    expect(ceSpendFor('Sechaba_Financial_Group_FSC_Banks_LongTerm_BBBEE.xlsx')).toBe(2_520_000);
  });

  it('ingests CE spend for every FSC test workbook that carries the sheet', () => {
    const fscFiles = [
      'Mzansi_Asset_Managers_FSC_Other_BBBEE.xlsx',
      'QSE_Mzansi_Advisory_FSC_Other_BBBEE.xlsx',
      'QSE_Sechaba_Mutual_FSC_Banks_LongTerm_BBBEE.xlsx',
      'QSE_Vela_ShortTerm_FSC_BBBEE.xlsx',
      'Sechaba_Financial_Group_FSC_Banks_LongTerm_BBBEE.xlsx',
      'Vela_ShortTerm_Insurance_FSC_BBBEE.xlsx',
    ];
    for (const f of fscFiles) {
      const ce = ceSpendFor(f);
      expect(ce, `${f} should ingest a positive Consumer Education spend`).toBeGreaterThan(0);
    }
  });

  it('does not fabricate ceSpend for a non-FSC workbook (no CE sheet)', () => {
    // RCOGP workbook has no Consumer Education sheet → ceSpend stays unset.
    expect(ceSpendFor('Kgodiso_Industrial_Holdings_Generic_BBBEE.xlsx')).toBeUndefined();
  });
});
