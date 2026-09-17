/**
 * ESG spec retrieval — does a document reach the right ESG extraction prompt?
 *
 * The properties under test are the ones a wrong answer costs real numbers:
 *  - each ESG document family routes to its own element, not to a neighbour's;
 *  - a COMBINED municipal account yields BOTH the water spec and the electricity
 *    spec, because on a real bill the electricity vocabulary is denser and the
 *    kilolitres would otherwise be silently lost;
 *  - the B-BBEE domain is completely unaffected by any of it.
 */
import { describe, expect, it } from 'vitest';
import {
  elementFromContent,
  elementFromHint,
  rankSpecsForDocument,
  selectSpecIds,
} from '../../src/services/specRetrieval.js';

describe('ESG filename / sheet-name → element', () => {
  it('routes each evidence family to its own element', () => {
    expect(elementFromHint('City of Johannesburg electricity account.pdf', 'esg')).toBe('GHG_ENERGY');
    expect(elementFromHint('Solar generation report Feb 2026.pdf', 'esg')).toBe('GHG_ENERGY');
    expect(elementFromHint('Carbon tax return 2025.pdf', 'esg')).toBe('GHG_ENERGY');
    expect(elementFromHint('Fleet register February 2026.xlsx', 'esg')).toBe('FLEET');
    expect(elementFromHint('Standard Bank fuel card statement.pdf', 'esg')).toBe('FLEET');
    expect(elementFromHint('Waste contractor report Q3.pdf', 'esg')).toBe('WASTE');
    expect(elementFromHint('Municipal water and sanitation account.pdf', 'esg')).toBe('WATER');
    expect(elementFromHint('ISO 14001 certificate.pdf', 'esg')).toBe('ISO_ENVIRONMENTAL');
    expect(elementFromHint('EEA2 return 2025.pdf', 'esg')).toBe('EMPLOYMENT_EQUITY');
    expect(elementFromHint('ISO 45001 certificate.pdf', 'esg')).toBe('HEALTH_SAFETY');
    expect(elementFromHint('WSP ATR submission TETA.pdf', 'esg')).toBe('TRAINING');
    expect(elementFromHint('CSI spend register.xlsx', 'esg')).toBe('COMMUNITY_CSI');
    expect(elementFromHint('Supplier self-assessment questionnaire.pdf', 'esg')).toBe('SUPPLIER_ESG');
    expect(elementFromHint('King V application register.xlsx', 'esg')).toBe('BOARD_GOVERNANCE');
    expect(elementFromHint('Whistleblower policy Rev 3.pdf', 'esg')).toBe('ETHICS_COMPLIANCE');
    expect(elementFromHint('Enterprise risk register.xlsx', 'esg')).toBe('RISK_ASSURANCE');
    expect(elementFromHint('Annual financial statements FY2026.pdf', 'esg')).toBe('FINANCIAL');
  });

  it('keeps ISO 45001 with health and safety, not with the EMS', () => {
    // 45001 is the OHS management system: its certificate belongs beside LTIFR,
    // and the ISO_ENVIRONMENTAL vocabulary must not claim it just for "ISO".
    expect(elementFromHint('ISO 45001:2018 certificate of registration.pdf', 'esg')).toBe('HEALTH_SAFETY');
    expect(elementFromHint('ISO 14001:2015 certificate of registration.pdf', 'esg')).toBe('ISO_ENVIRONMENTAL');
  });

  it('routes a fuel card statement to FLEET rather than to stationary energy', () => {
    // Both are "fuel". Fleet evidence is per-vehicle and fills register grids;
    // GHG_ENERGY is bills and stationary combustion.
    expect(elementFromHint('Fuel card statement Jan.pdf', 'esg')).toBe('FLEET');
    expect(elementFromHint('Generator diesel bowser reconciliation.xlsx', 'esg')).toBe('GHG_ENERGY');
  });

  it('returns null for a name that states no element', () => {
    expect(elementFromHint('Scan_20260114_0001.pdf', 'esg')).toBeNull();
    expect(elementFromHint(undefined, 'esg')).toBeNull();
  });
});

describe('ESG content → element (anonymous scans)', () => {
  it('routes a clear water account to WATER', () => {
    expect(elementFromContent(
      'Account statement. 77 kilolitres consumed this period. Sanitation charge R1 204. Water meter reading actual.',
      'esg',
    )).toBe('WATER');
  });

  it('asserts NOTHING for a combined water-and-electricity account', () => {
    // Two elements really are present. Naming one would boost its specs and bury
    // the other's fields — the exact failure the matrix author flagged.
    expect(elementFromContent(
      'City of Cape Town municipal account. 35 332 kWh consumed at R2.48. Notified maximum demand 320 kVA. '
      + 'Water 77 kilolitres. Sanitation charge R1 204. Water meter reading actual.',
      'esg',
    )).toBeNull();
  });

  it('returns null on weak or absent signals', () => {
    expect(elementFromContent('one mention of a kilolitre', 'esg')).toBeNull();
    expect(elementFromContent(undefined, 'esg')).toBeNull();
  });
});

describe('ranking ESG specs', () => {
  it('surfaces the electricity spec for a municipal electricity bill', () => {
    const ranked = rankSpecsForDocument(
      'City of Johannesburg account 5104238771. Meter 71344220. 35 332 kWh at R2.48 per kWh. '
      + 'Notified maximum demand 320 kVA. Consumption charge R87 623.36 excluding VAT.',
      'CoJ electricity account Oct 2025.pdf',
      { domain: 'esg' },
    );
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.some((c) => c.spec.id === 'ghg_energy__municipal_electricity_bill')).toBe(true);
  });

  it('surfaces the fleet register spec for a vehicle asset list', () => {
    const ranked = rankSpecsForDocument(
      'Fleet register. Vehicle registration, GVM, tare, payload, licence disc expiry, telematics fitted.',
      'Fleet register Feb 2026.xlsx',
      { domain: 'esg' },
    );
    expect(ranked[0].spec.element).toBe('FLEET');
  });

  it('A COMBINED MUNICIPAL ACCOUNT yields BOTH the water and the electricity spec', () => {
    const combined = 'CITY OF CAPE TOWN MUNICIPAL ACCOUNT 3009884120\n'
      + 'ELECTRICITY: meter 71344220, previous 482110, current 517442, 35 332 kWh at R2.48/kWh, '
      + 'notified maximum demand 320 kVA, R87 623.36 excl VAT.\n'
      + 'WATER: meter A14-772301, previous 8412 kl, current 8489 kl, 77 kilolitres consumed, R2 918.40 excl VAT.\n'
      + 'SANITATION: 61.6 kl charged.\n';
    const ids = selectSpecIds(combined, 'Municipal account Feb 2026.pdf', { domain: 'esg' });

    expect(ids).toContain('ghg_energy__municipal_electricity_bill');
    expect(ids).toContain('water__municipal_water_bill');
  });

  it('keeps both utility specs even when a confident classification names only one', () => {
    // Pass A normally FILTERS the candidate pool to its element. On a combined
    // account that would discard the other utility outright, so the pin is
    // applied after the filter.
    const combined = 'Municipal account. 35 332 kWh consumed, maximum demand 320 kVA. '
      + '77 kilolitres water consumption, sanitation 61.6 kl.';
    const ids = selectSpecIds(combined, 'account.pdf', {
      domain: 'esg',
      elementOverride: 'GHG_ENERGY',
    });

    expect(ids).toContain('ghg_energy__municipal_electricity_bill');
    expect(ids).toContain('water__municipal_water_bill');
  });

  it('does NOT pin the water spec onto an electricity-only bill', () => {
    // One utility is an ordinary bill and needs no help; pinning it anyway would
    // spend a model call per upload proving a water spec finds no water.
    const ids = selectSpecIds(
      'Eskom account. 35 332 kWh consumed at R2.48 per kWh. Notified maximum demand 320 kVA.',
      'Eskom account.pdf',
      { domain: 'esg' },
    );
    expect(ids).not.toContain('water__municipal_water_bill');
  });

  it('never mixes the two matrices', () => {
    const esgIds = selectSpecIds('kWh consumed electricity account', 'bill.pdf', { domain: 'esg' });
    const bbbeeIds = selectSpecIds('share register total shares in issue', 'register.pdf');
    expect(esgIds.every((id) => !bbbeeIds.includes(id))).toBe(true);
    expect(esgIds.length).toBeGreaterThan(0);
    expect(bbbeeIds.length).toBeGreaterThan(0);
  });
});

describe('the B-BBEE domain is untouched', () => {
  it('still routes the sheet names and filenames it always did', () => {
    expect(elementFromHint('Ownership')).toBe('OWNERSHIP');
    expect(elementFromHint('Employment Equity')).toBe('MANAGEMENT_CONTROL');
    expect(elementFromHint('Preferential Procurement')).toBe('ESD');
    expect(elementFromHint('Social Development')).toBe('SED');
    expect(elementFromHint('Skills Development')).toBe('SKILLS_DEVELOPMENT');
    // Explicitly asking for the default domain is the same answer.
    expect(elementFromHint('Ownership', 'bbbee')).toBe('OWNERSHIP');
  });

  it('is not affected by the ESG combined-utility pins', () => {
    // The same combined-bill text through the B-BBEE domain pins nothing.
    const ranked = rankSpecsForDocument(
      '35 332 kWh consumed. 77 kilolitres water. Sanitation charge.',
      'municipal.pdf',
    );
    expect(ranked.every((c) => !c.spec.id.startsWith('water__'))).toBe(true);
  });
});
