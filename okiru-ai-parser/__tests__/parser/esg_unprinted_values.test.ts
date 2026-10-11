/**
 * A first-pass value its own read contradicts is the reviewer's, never a value:
 *  - the read's own note says the document does not print the field, yet the
 *    field was filled (a supplier name on a page with no letterhead);
 *  - a unit field holds a word that is no unit of its kind ("UNITS", a column
 *    heading, as a mass unit);
 *  - an issuer field holds a filing label (a place with a month and year,
 *    handwritten on a scan or typed in a footer).
 * The agent's cited fills, notes about one part of a long document, and the
 * notes the code writes itself never refuse a value. Every value is invented.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentExtraction, ExtractedValue } from '../../src/services/aiExtraction.js';
import { unprintedValuesAsExceptions } from '../../src/services/esgCaseExtraction.js';

function extraction(values: Array<[string, unknown] | ExtractedValue>, exceptions: string[] = []): DocumentExtraction {
  return {
    documentId: 'ghg_energy__municipal_electricity_bill',
    documentName: 'Municipal electricity account',
    element: 'GHG_ENERGY',
    sourceFile: 'invented-account.pdf',
    values: values.map((v) => (Array.isArray(v) ? { field: v[0], value: v[1], sourceFile: 'invented-account.pdf', sourceDocumentId: 'x' } : v)),
    missingFields: [],
    unexpectedFields: [],
    exceptions,
  };
}

const fields = (e: DocumentExtraction) => Object.fromEntries(e.values.map((v) => [v.field, v.value]));

describe('a value the read itself says is not printed', () => {
  it('is refused when a note opens with the field and says it is absent', () => {
    const out = unprintedValuesAsExceptions(extraction(
      [['municipality_or_supplier_name', 'Example Metro'], ['electricity_kwh', '12 345.6']],
      ['municipality_or_supplier_name not present on provided pages; letterhead page may be missing.'],
    ));
    expect(fields(out)).toEqual({ electricity_kwh: '12 345.6' });
    expect(out.exceptions.join(' ')).toMatch(/municipality_or_supplier_name: "Example Metro" was not kept/);
  });

  it('"no <field>" refuses it too', () => {
    const out = unprintedValuesAsExceptions(extraction(
      [['meter_number', 'M-0001']],
      ['No meter_number is printed on this statement.'],
    ));
    expect(fields(out)).toEqual({});
  });

  it('a note that only mentions the field keeps it', () => {
    const out = unprintedValuesAsExceptions(extraction(
      [['electricity_rand_excl_vat', '1 234.56']],
      ['VAT treatment of electricity_rand_excl_vat is not stated on the document.'],
    ));
    expect(fields(out)).toEqual({ electricity_rand_excl_vat: '1 234.56' });
    expect(out.exceptions).toHaveLength(1);
  });

  it('a note about one part of a long document keeps a value another part printed', () => {
    const out = unprintedValuesAsExceptions(extraction(
      [['ee_forum_established', 'Yes'], ['ee_reporting_period_start', '01/09/2023']],
      ['ee_forum_established and ee_forum_meeting_dates not printed in this part.', 'ee_reporting_period_start not stated in this part; returned as null.'],
    ));
    expect(fields(out)).toEqual({ ee_forum_established: 'Yes', ee_reporting_period_start: '01/09/2023' });
  });

  it("the code's own notes (grounding, second read) never refuse a value", () => {
    const out = unprintedValuesAsExceptions(extraction(
      [['policy_version', 'Revision 2']],
      ['Values not found in the source document (possible extraction error): policy_version', 'Second read disagrees on policy_version: the agent read "2".'],
    ));
    expect(fields(out)).toEqual({ policy_version: 'Revision 2' });
  });

  it("the agent's cited fill is kept whatever the first pass's notes say", () => {
    const cited: ExtractedValue = {
      field: 'municipality_or_supplier_name', value: 'Example Metro', sourceFile: 'invented-account.pdf', sourceDocumentId: 'x',
      source: { method: 'agent', page: 1, quote: 'Example Metro Account' },
    };
    const out = unprintedValuesAsExceptions(extraction([cited], ['municipality_or_supplier_name not present on provided pages.']));
    expect(fields(out)).toEqual({ municipality_or_supplier_name: 'Example Metro' });
  });
});

describe('a unit field holds a unit of its kind, or nothing', () => {
  it('a column heading word is no mass unit', () => {
    const out = unprintedValuesAsExceptions(extraction([['waste_mass_unit', 'UNITS'], ['reporting_period_end', '25/03/2026']]));
    expect(fields(out)).toEqual({ reporting_period_end: '25/03/2026' });
    expect(out.exceptions.join(' ')).toMatch(/waste_mass_unit: "UNITS" was not kept: it is not a unit of mass/);
  });

  it('a unit of the wrong kind is refused; units of the right kind are kept', () => {
    const out = unprintedValuesAsExceptions(extraction([
      ['waste_mass_unit', 'kWh'],
      ['electricity_unit', 'Units'],
      ['water_unit', 'Kilolitres (kl)'],
      ['fuel_unit', 'litres'],
    ]));
    expect(fields(out)).toEqual({ electricity_unit: 'Units', water_unit: 'Kilolitres (kl)', fuel_unit: 'litres' });
  });

  it('kg and tonnes are mass units', () => {
    const out = unprintedValuesAsExceptions(extraction([['waste_mass_unit', 'kg']]));
    expect(fields(out)).toEqual({ waste_mass_unit: 'kg' });
    const tonnes = unprintedValuesAsExceptions(extraction([['waste_mass_unit', 'Tonnes']]));
    expect(fields(tonnes)).toEqual({ waste_mass_unit: 'Tonnes' });
  });
});

describe('an issuer is never a filing label', () => {
  it('a place with a month and year is refused', () => {
    const out = unprintedValuesAsExceptions(extraction([
      ['municipality_or_supplier_name', 'Depot North July 2025'],
      ['waste_contractor_name', "Depot South Mar '26"],
    ]));
    expect(fields(out)).toEqual({});
    expect(out.exceptions).toHaveLength(2);
  });

  it("a name is kept, and a month in another field is no issuer's", () => {
    const out = unprintedValuesAsExceptions(extraction([
      ['municipality_or_supplier_name', 'Example Utilities (Pty) Ltd'],
      ['site_name', 'Depot North July 2025'],
    ]));
    expect(fields(out)).toEqual({ municipality_or_supplier_name: 'Example Utilities (Pty) Ltd', site_name: 'Depot North July 2025' });
  });
});
