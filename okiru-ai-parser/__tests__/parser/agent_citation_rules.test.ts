/**
 * Regression tests for the second review of the agent loop's citation check:
 *
 *  - a text value that carries a date is matched as words, not by its date;
 *  - a short value (level, percentage, count, flag) must sit next to its own
 *    label in the quote, not merely share a long quote with it;
 *  - every submitted value passes the format/range/check-digit checks;
 *  - plus the cheap advisories: the ticked box decides a flag, a negative
 *    value needs a negative printed amount, a label is not a value, and a
 *    "_present" matrix field is a yes/no field.
 *
 * All document content is invented.
 */
import { describe, expect, it } from 'vitest';
import * as agent from '../../src/services/agentExtraction.js';
import type { AgentDocument, AgentTarget } from '../../src/services/agentExtraction.js';

const CERT = 'bbbee_verification_certificate';
const CIPC = 'ownership__cipc_registration_documents_cor14_1_cor14_3';

function target(id: string): AgentTarget {
  const t = agent.agentTargetFor(id);
  if (!t) throw new Error(`no target for ${id}`);
  return t;
}

const certDoc: AgentDocument = {
  filename: 'cert.pdf',
  scanned: false,
  pages: [
    'B-BBEE Verification Certificate\nMeasured Entity: Acme Trading (Pty) Ltd\nB-BBEE Status Level: Level 4\nDate of Issue: 1 March 2025\nPage 1 of 2',
    'Page 2 of 2\nEmpowering Supplier: Yes ☐ No ☒\nBlack Ownership 51%\nValid until 28 February 2026\nBlack Women Ownership 30%\nProcurement Recognition 100%',
    '| Element | Score | Weighting |\n| Black Ownership | 25.00 | 51% |\nB-BBEE Status Level: Level 9\nBlack Ownership 151%\nEmpowering Supplier: Yes ☒ No ☐',
  ],
  tables: [{
    index: 1,
    name: 'Table 1',
    page: 3,
    rows: [
      ['Element', 'Score', 'Weighting'],
      ['Black Ownership', '25.00', '51%'],
      ['Black Ownership', '51%', 'Black Women Ownership', '30%'],
    ],
  }],
};

const cipcDoc: AgentDocument = {
  filename: 'cor14.pdf',
  scanned: false,
  pages: ['Enterprise Name: ACME TRADING (PTY) LTD\nRegistration Number: 2015 / 123456 / 07\nFinancial year end: 2015\nDirector ID 8001015009087'],
  tables: [],
};

const cert = (raw: Record<string, unknown>) => agent.validateSubmission(raw, target(CERT), certDoc);
const cipc = (raw: Record<string, unknown>) => agent.validateSubmission(raw, target(CIPC), cipcDoc);

describe('a text value carrying a date is matched as words', () => {
  it('refuses an invented name that only shares the date with the quote', () => {
    expect(cert({ field: 'entity_name', value: 'Ghost Trading 1 March 2025', page: 1, quote: 'Date of Issue: 1 March 2025' })).toMatchObject({ ok: false });
    expect(cert({ field: 'entity_name', value: 'Ghost 2025-03-01', page: 1, quote: 'Date of Issue: 1 March 2025' })).toMatchObject({ ok: false });
    expect(agent.valueInQuote('Ghost Trading 1 March 2025', 'Date of Issue: 1 March 2025', 'text')).toBe(false);
    expect(agent.valueInQuote('Ghost 2025-03-01', 'Date of Issue: 1 March 2025')).toBe(false);
  });

  it('still compares a date field, or a value that is one whole date, by meaning', () => {
    expect(agent.valueInQuote('2025-03-01', 'Date of Issue: 1 March 2025', 'date')).toBe(true);
    expect(agent.valueInQuote('2025-03-01', 'Date of Issue: 1 March 2025')).toBe(true);
    expect(agent.valueInQuote('March 1st, 2025', 'Date of Issue: 01/03/2025')).toBe(true);
    expect(cert({ field: 'certificate_expiry_date', value: '2026-02-28', page: 2, quote: 'Valid until 28 February 2026' })).toMatchObject({ ok: true });
  });
});

describe('a short value sits next to its own label', () => {
  it('refuses a level taken from a date or a page number further along the quote', () => {
    expect(cert({ field: 'bee_level', value: '1', page: 1, quote: 'B-BBEE Status Level: Level 4 Date of Issue: 1 March 2025' })).toMatchObject({ ok: false });
    expect(cert({ field: 'bee_level', value: '1', page: 1, quote: 'Level 4 Date of Issue: 1 March 2025 Page 1 of 2' })).toMatchObject({ ok: false });
    expect(cert({ field: 'bee_level', value: '2', page: 1, quote: 'B-BBEE Status Level: Level 4 Date of Issue: 1 March 2025 Page 1 of 2' })).toMatchObject({ ok: false });
  });

  it('accepts the level printed after its label, as digits or as the printed phrase', () => {
    expect(cert({ field: 'bee_level', value: '4', page: 1, quote: 'B-BBEE Status Level: Level 4' })).toMatchObject({ ok: true });
    expect(cert({ field: 'bee_level', value: 'Level 4', page: 1, quote: 'B-BBEE Status Level: Level 4 Date of Issue: 1 March 2025' })).toMatchObject({ ok: true });
  });

  it('refuses a percentage that belongs to another label in the same quote', () => {
    const long = 'Black Ownership 51% Valid until 28 February 2026 Black Women Ownership 30%';
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '30', page: 2, quote: long })).toMatchObject({ ok: false });
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '28', page: 2, quote: 'Black Ownership 51% Valid until 28 February 2026' })).toMatchObject({ ok: false });
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '100', page: 2, quote: `${long} Procurement Recognition 100%` })).toMatchObject({ ok: false });
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '2', page: 2, quote: 'Page 2 of 2 Empowering Supplier: Yes ☐ No ☒ Black Ownership 51%' })).toMatchObject({ ok: false });
    // The figures that do belong to their labels in the same quote.
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '51', page: 2, quote: long })).toMatchObject({ ok: true });
    expect(cert({ field: 'supplier_black_women_ownership_percentage', value: '30%', page: 2, quote: long })).toMatchObject({ ok: true });
  });

  it('a table row on a page: a score column between label and percentage does not hide it', () => {
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '51%', page: 3, quote: '| Black Ownership | 25.00 | 51% |' })).toMatchObject({ ok: true });
  });

  it('a cell: the label must be to its left in the row, without another figure of the kind between', () => {
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '51%', cellRef: 'T1!C2', quote: '51%' })).toMatchObject({ ok: true });
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '51%', cellRef: 'T1!B3', quote: '51%' })).toMatchObject({ ok: true });
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '30%', cellRef: 'T1!D3', quote: '30%' })).toMatchObject({ ok: false });
    expect(cert({ field: 'supplier_black_women_ownership_percentage', value: '30%', cellRef: 'T1!D3', quote: '30%' })).toMatchObject({ ok: true });
  });

  it('valueBesideLabel on its own', () => {
    const level = target(CERT).fields.find((f) => f.name === 'bee_level')!;
    expect(agent.valueBesideLabel(level, '1', 'LEVEL ONE B-BBEE CONTRIBUTOR')).toBe(true);
    expect(agent.valueBesideLabel(level, '1', 'Status: Active, Page 1 of 2')).toBe(false);
  });
});

describe('a flag is decided by the answer next to its label', () => {
  it('reads the ticked box, not whichever answer word appears', () => {
    expect(cert({ field: 'empowering_supplier', value: true, page: 2, quote: 'Empowering Supplier: Yes ☐ No ☒' })).toMatchObject({ ok: false });
    expect(cert({ field: 'empowering_supplier', value: false, page: 2, quote: 'Empowering Supplier: Yes ☐ No ☒' })).toMatchObject({ ok: true });
    expect(cert({ field: 'empowering_supplier', value: true, page: 3, quote: 'Empowering Supplier: Yes ☒ No ☐' })).toMatchObject({ ok: true });
    expect(cert({ field: 'empowering_supplier', value: false, page: 3, quote: 'Empowering Supplier: Yes ☒ No ☐' })).toMatchObject({ ok: false });
  });
});

describe('every submitted value passes its format, range and check-digit checks', () => {
  it('refuses a year or a part of a registration number, and an ID number in its place', () => {
    expect(cipc({ field: 'registration_number', value: '2015', page: 1, quote: 'Financial year end: 2015' })).toMatchObject({ ok: false });
    expect(cipc({ field: 'registration_number', value: '123456', page: 1, quote: 'Registration Number: 2015 / 123456 / 07' })).toMatchObject({ ok: false });
    expect(cipc({ field: 'registration_number', value: '8001015009087', page: 1, quote: 'Director ID 8001015009087' })).toMatchObject({ ok: false });
    expect(cipc({ field: 'registration_number', value: '2015/123456/07', page: 1, quote: 'Registration Number: 2015 / 123456 / 07' })).toMatchObject({ ok: true });
  });

  it('refuses a level outside 1-8 and a percentage over 100, saying why', () => {
    expect(cert({ field: 'bee_level', value: '9', page: 3, quote: 'B-BBEE Status Level: Level 9' })).toMatchObject({
      ok: false,
      rejection: { reason: expect.stringMatching(/level 1-8/) },
    });
    expect(cert({ field: 'supplier_black_ownership_percentage', value: '151%', page: 3, quote: 'Black Ownership 151%' })).toMatchObject({ ok: false });
  });

  it('procurement recognition runs to 135%, not 100%', () => {
    const t = target(CERT);
    expect(agent.checkValue(t, 'procurement_recognition_level', '135.00%').ok).toBe(true);
    expect(agent.checkValue(t, 'procurement_recognition_level', '150%').ok).toBe(false);
    expect(agent.checkValue(t, 'supplier_black_ownership_percentage', '135%').ok).toBe(false);
  });
});

describe('cheap advisories', () => {
  it('a negative value needs a negative printed amount; a positive value may come from a bracketed one', () => {
    expect(agent.valueInQuote('-1000', 'R 1 000')).toBe(false);
    expect(agent.valueInQuote('(1 000)', '1 000', 'money')).toBe(false);
    expect(agent.valueInQuote('-1000', 'Net R -1 000')).toBe(true);
    expect(agent.valueInQuote('-1000', 'Net (1 000)', 'money')).toBe(true);
    expect(agent.valueInQuote('1000', 'Deduction (R1 000)', 'money')).toBe(true);
    expect(agent.valueInQuote('2021', 'Period 2020-2021', 'money')).toBe(true);
  });

  it('a label is not a value', () => {
    expect(cert({ field: 'entity_name', value: 'Measured Entity', page: 1, quote: 'Measured Entity: Acme Trading (Pty) Ltd' })).toMatchObject({ ok: false });
    expect(cert({ field: 'entity_name', value: 'Acme Trading (Pty) Ltd', page: 1, quote: 'Measured Entity: Acme Trading (Pty) Ltd' })).toMatchObject({ ok: true });
  });

  it('a matrix field named "..._present" is a yes/no field, not a registration number', () => {
    expect(target(CIPC).fields.find((f) => f.name === 'cipc_stamp_present')?.type).toBe('bool');
    expect(agent.checkValue(target(CIPC), 'cipc_stamp_present', 'yes').ok).toBe(true);
  });
});
