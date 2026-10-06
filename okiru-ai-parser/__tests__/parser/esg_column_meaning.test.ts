/**
 * The model maps a register column by its header; the code checks the values
 * can mean that field. Every case here is a column Super Group's fleet list
 * actually had mapped wrongly.
 */
import { describe, expect, it } from 'vitest';
import { checkEsgColumnMeaning } from '../../src/services/esgSheetTableExtraction.js';

describe('checkEsgColumnMeaning', () => {
  it('refuses an odometer as the kilometres driven in the month', () => {
    const rows = [
      { 'Monthly Update - Current KM': 433_425 },
      { 'Monthly Update - Current KM': 70_735 },
      { 'Monthly Update - Current KM': 91_085 },
    ];
    const out = checkEsgColumnMeaning(rows, { 'Monthly Update - Current KM': 'monthly_km' });
    expect(out.mapping).toEqual({});
    expect(out.exceptions[0]).toMatch(/holds odometer readings \(typically 91085\), so it was not read as kilometres driven in the month/);
  });

  it('refuses a column whose heading names another measure', () => {
    const rows = [{ 'CURRENT DIESEL HOURS': 1_575, 'ELECTRIC TEST DATE': 45_227, 'Height ': 2.73 }];
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
      { Reg: 'KB33CSGP', 'JULY MTD KMs': 4_348, 'Total fuel July': 1_121, 'Fuel economy km/l': 2.5, GVM: 26_000 },
      { Reg: 'LC36DCGP', 'JULY MTD KMs': 4_098, 'Total fuel July': 1_621, 'Fuel economy km/l': 2.4, GVM: 26_000 },
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
