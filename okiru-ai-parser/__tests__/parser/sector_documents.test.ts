import { describe, it, expect } from 'vitest';
import { getRequiredDocumentGroups } from '../../parser/sector_documents.js';

describe('getRequiredDocumentGroups — sector awareness', () => {
  it('with no query returns the legacy 2 procurement groups (back-compat)', () => {
    const groups = getRequiredDocumentGroups();
    expect(groups.map((g) => g.key)).toEqual(['supplier_bbee_evidence', 'supplier_spend_schedule']);
  });

  it('Generic returns the full five-pillar evidence set + financials', () => {
    const keys = getRequiredDocumentGroups({ sector: 'Generic' }).map((g) => g.key);
    expect(keys).toContain('ownership_evidence');
    expect(keys).toContain('management_control');
    expect(keys).toContain('skills_development');
    expect(keys).toContain('supplier_spend_schedule');
    expect(keys).toContain('sed_contributions');
    expect(keys).toContain('financials_afs');
    // No sector add-ons for generic.
    expect(keys).not.toContain('cidb_registration');
    expect(keys).not.toContain('fsc_access_financial_services');
  });

  it('Construction Contractor adds CIDB but not the BEP professional registration', () => {
    const keys = getRequiredDocumentGroups({ sector: 'CONSTRUCTION', subSector: 'Contractor' }).map((g) => g.key);
    expect(keys).toContain('cidb_registration');
    expect(keys).not.toContain('bep_professional_registration');
  });

  it('Construction BEP adds both CIDB and professional registration', () => {
    const keys = getRequiredDocumentGroups({ sector: 'CONSTRUCTION', subSector: 'BEP' }).map((g) => g.key);
    expect(keys).toContain('cidb_registration');
    expect(keys).toContain('bep_professional_registration');
  });

  it('FSC adds AFS, Consumer Education and Empowerment Financing', () => {
    const keys = getRequiredDocumentGroups({ sector: 'FSC', subSector: 'Banks' }).map((g) => g.key);
    expect(keys).toContain('fsc_access_financial_services');
    expect(keys).toContain('fsc_consumer_education');
    expect(keys).toContain('fsc_empowerment_financing');
  });

  it('Transport adds the operating licence', () => {
    const keys = getRequiredDocumentGroups({ sector: 'TRANSPORT' }).map((g) => g.key);
    expect(keys).toContain('transport_operating_licence');
  });

  it('EME short-circuits every sector to a single affidavit group', () => {
    const groups = getRequiredDocumentGroups({ sector: 'CONSTRUCTION', size: 'EME' });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('eme_affidavit');
  });

  it('flags evidence-only groups (no parser extractor) honestly', () => {
    const groups = getRequiredDocumentGroups({ sector: 'FSC' });
    const afs = groups.find((g) => g.key === 'fsc_access_financial_services');
    const spend = groups.find((g) => g.key === 'supplier_spend_schedule');
    expect(afs?.autoExtract).toBe(false); // verifier evidence, not parser-read
    expect(spend?.autoExtract).toBe(true); // parser reads the spend schedule
  });
});
