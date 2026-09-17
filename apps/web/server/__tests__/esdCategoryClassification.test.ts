/**
 * mapEsdCategory — the SD-vs-ED split, read from what the sheet actually says.
 *
 * The regression this pins: our own export template carries no category column,
 * so the projection falls back to the Contribution Description. Those read
 * "SD beneficiary (existing supplier…)" and "ENTERPRISE DEVELOPMENT
 * (non-supplier…)". A previous version stripped every non-letter before
 * matching, which welded the first into "sdbeneficiaryexistingsupplier" —
 * matching neither "sd" nor a "supplier" prefix. Every Supplier Development row
 * in every imported workbook fell to unclassified and scored zero, while the ED
 * rows matched the "enterprise" prefix by luck. Level-1 fitness across the 16
 * test workbooks fell from 12 to 3 before this was caught.
 *
 * The other half of the contract still holds: a category we cannot read is
 * unclassified, never a favourable guess.
 */
import { describe, it, expect } from 'vitest';
import { mapEsdCategory } from '../workbookRoutes';

describe('mapEsdCategory', () => {
  it('reads the descriptions our own export template writes', () => {
    // The exact strings in docs/Toolkit Testing Data/*.xlsx.
    expect(mapEsdCategory('SD beneficiary (existing supplier)')).toBe('supplier_development');
    expect(mapEsdCategory('ENTERPRISE DEVELOPMENT (non-supplier)')).toBe('enterprise_development');
  });

  it('tests ED before SD, because the ED wording names suppliers to exclude them', () => {
    // "non-supplier" contains "supplier". If the SD test ran first, every ED
    // row on the sheet would be claimed as Supplier Development — the same
    // pillar, mis-scored in the opposite direction.
    expect(mapEsdCategory('ENTERPRISE DEVELOPMENT (non-supplier beneficiary)')).toBe('enterprise_development');
  });

  it('reads the dropdown values and their shorthand', () => {
    expect(mapEsdCategory('Supplier Development')).toBe('supplier_development');
    expect(mapEsdCategory('Enterprise Development')).toBe('enterprise_development');
    expect(mapEsdCategory('SD')).toBe('supplier_development');
    expect(mapEsdCategory('ED')).toBe('enterprise_development');
    expect(mapEsdCategory('sd')).toBe('supplier_development');
    expect(mapEsdCategory('  Ed  ')).toBe('enterprise_development');
  });

  it('reads the unspaced synonyms the batch/AI paths emit', () => {
    expect(mapEsdCategory('supplierdev')).toBe('supplier_development');
    expect(mapEsdCategory('supplierdevelopment')).toBe('supplier_development');
    expect(mapEsdCategory('enterprisedev')).toBe('enterprise_development');
    expect(mapEsdCategory('enterprisedevelopmentcontributions')).toBe('enterprise_development');
  });

  it('does not read "development" as the ED shorthand', () => {
    // "development" must not trip a bare \bed\b test.
    expect(mapEsdCategory('development')).toBe('unclassified');
  });

  it('still abstains rather than guessing — no favourable default', () => {
    for (const raw of ['', '   ', 'n/a', '-', 'TBC', 'misc contribution', '12345']) {
      expect(mapEsdCategory(raw)).toBe('unclassified');
    }
    expect(mapEsdCategory(undefined as unknown as string)).toBe('unclassified');
    expect(mapEsdCategory(null as unknown as string)).toBe('unclassified');
  });
});
