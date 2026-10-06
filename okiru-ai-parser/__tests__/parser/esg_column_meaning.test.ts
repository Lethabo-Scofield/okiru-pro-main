/**
 * The model maps a register column by its header; the code checks the values
 * can mean that field. Every case here is a column Acme Group's fleet list
 * actually had mapped wrongly.
 */
import { describe, expect, it } from 'vitest';
import { checkEsgColumnMeaning } from '../../src/services/esgSheetTableExtraction.js';

describe('checkEsgColumnMeaning', () => {
  it('refuses an odometer as the kilometres driven in the month', () => {
    const rows = [
      { 'Monthly Update - Current KM': 436_180 },
      { 'Monthly Update - Current KM': 71_240 },
      { 'Monthly Update - Current KM': 92_310 },
    ];
    const out = checkEsgColumnMeaning(rows, { 'Monthly Update - Current KM': 'monthly_km' });
    expect(out.mapping).toEqual({});
    expect(out.exceptions[0]).toMatch(/holds odometer readings \(typically 92310\), so it was not read as kilometres driven in the month/);
  });

  it('refuses a column whose heading names another measure', () => {
    const rows = [{ 'CURRENT DIESEL HOURS': 1_610, 'ELECTRIC TEST DATE': 45_227, 'Height ': 2.73 }];
    const out = checkEsgColumnMeaning(rows, {
      'CURRENT DIESEL HOURS': 'monthly_km',
      'ELECTRIC TEST DATE': 'monthly_litres',
      'Height ': 'l_per_100km_actual',
    });
    expect(out.mapping).toEqual({});
    expect(out.exceptions).toHaveLength(3);
    expect(out.exceptions.every((e) => /its heading names a different measure/.test(e))).toBe(true);
  });

  it('converts kilometres per litre, and keeps a column that means what it says', () => {
    const rows = [
      { Reg: 'AB90LMGP', 'JULY MTD KMs': 4_410, 'Total fuel July': 1_140, 'Fuel economy km/l': 2.5, GVM: 26_000 },
      { Reg: 'AB12CDGP', 'JULY MTD KMs': 4_150, 'Total fuel July': 1_580, 'Fuel economy km/l': 2.4, GVM: 26_000 },
    ];
    const out = checkEsgColumnMeaning(rows, {
      Reg: 'vehicle_registration',
      'JULY MTD KMs': 'monthly_km',
      'Total fuel July': 'monthly_litres',
      'Fuel economy km/l': 'l_per_100km_actual',
      GVM: 'gvm_kg',
    });
    expect(out.mapping).toEqual({
      Reg: 'vehicle_registration',
      'JULY MTD KMs': 'monthly_km',
      'Total fuel July': 'monthly_litres',
      'Fuel economy km/l': 'l_per_100km_actual',
      GVM: 'gvm_kg',
    });
    expect(out.perLitreFields).toEqual(['l_per_100km_actual']);
  });

  it('refuses masses in tonnes or hours as kilograms', () => {
    const out = checkEsgColumnMeaning([{ 'ELECTRIC HOURS': 344 }, { Tonnes: 16 }, { Tonnes: 32 }], {
      'ELECTRIC HOURS': 'gvm_kg',
      Tonnes: 'tare_kg',
    });
    expect(out.mapping).toEqual({});
  });
});
