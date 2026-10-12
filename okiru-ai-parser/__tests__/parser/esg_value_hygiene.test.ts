/**
 * What the code does to a first-pass ESG read before anything places it:
 *  - a count holding a fraction is refused;
 *  - a field the skill asks for as several items is kept as a list;
 *  - another field's caption run into a value is taken off;
 *  - a policy rule's figure is kept alone, its limit word with its basis;
 *  - a date field's printed date is written yyyy-mm-dd;
 *  - what the code keeps about one document (derived counts, printed lines,
 *    the document's own table of lines) never meets another document's
 *    values as a rival answer;
 *  - a short register that is the whole upload keeps the code's rows and the
 *    first pass's header.
 * Every value is invented.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentExtraction, ExtractedValue } from '../../src/services/aiExtraction.js';
import {
  fractionalCountsAsExceptions,
  isDocumentOwnValue,
  listFieldsAsArrays,
  printedDatesAsIso,
  ruleFiguresAlone,
  runInCaptionsRemoved,
  trailingMinusCreditsAsNegative,
  wholeShortRegister,
  withoutDocumentFacts,
  withoutRegisterRows,
} from '../../src/services/esgCaseExtraction.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

function read(documentId: string, values: Array<[string, unknown] | ExtractedValue>): DocumentExtraction {
  return {
    documentId,
    documentName: 'Invented read',
    sourceFile: 'invented.pdf',
    values: values.map((v) => (Array.isArray(v) ? { field: v[0], value: v[1], sourceFile: 'invented.pdf', sourceDocumentId: documentId } : v)),
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };
}
const fields = (e: DocumentExtraction) => Object.fromEntries(e.values.map((v) => [v.field, v.value]));

const DEBRIEF = 'fleet__telematics_driver_debrief_report';

describe('a count holding a fraction', () => {
  it('is refused at document level and in a row, a whole count kept', () => {
    const out = fractionalCountsAsExceptions(read(DEBRIEF, [
      ['total_fatigue_events_count', '1 234.5678'],
      ['total_routes', 1200],
      ['fleet_debrief_rows', [{ route_name: 'R1', planned_stops: 12.5 }, { route_name: 'R2', planned_stops: 9 }]],
    ]));
    expect(fields(out).total_fatigue_events_count).toBeUndefined();
    expect(fields(out).total_routes).toBe(1200);
    expect((fields(out).fleet_debrief_rows as Array<Record<string, unknown>>).map((r) => r.planned_stops)).toEqual([null, 9]);
    expect(out.exceptions.join(' ')).toMatch(/a count is a whole number/);
  });
});

describe('a field the skill asks for as several items', () => {
  it('is split into a list, item by item, and a credit printed with its minus after it is negative', () => {
    const email = listFieldsAsArrays(read('email_correspondence', [['email_message_dates', '2026-01-05; 2026-01-09;2026-01-20'], ['email_subject', 'RE: data; more']]));
    expect(fields(email).email_message_dates).toEqual(['2026-01-05', '2026-01-09', '2026-01-20']);
    // A field the skill does not mark as a list keeps its semicolons.
    expect(fields(email).email_subject).toBe('RE: data; more');
    const bill = trailingMinusCreditsAsNegative(listFieldsAsArrays(read('ghg_energy__municipal_electricity_bill', [['generation_offset_credits', '12.50-; 3.10-']])));
    expect(fields(bill).generation_offset_credits).toEqual(['-12.50', '-3.10']);
  });
});

describe('another field\'s caption run into a value', () => {
  it('is taken off, and the reviewer is told', () => {
    const out = runInCaptionsRemoved(read('policy_document', [['policy_version', 'Policy Title Revision 4'], ['policy_title', 'Example Travel Policy']]));
    expect(fields(out)).toMatchObject({ policy_version: 'Revision 4', policy_title: 'Example Travel Policy' });
    expect(out.exceptions[0]).toMatch(/opens with "Policy title"/);
  });

  it('leaves a value that opens with its own caption, or is only a caption', () => {
    const out = runInCaptionsRemoved(read('policy_document', [['policy_version', 'Revision 4'], ['policy_owners', 'Policy title']]));
    expect(fields(out)).toEqual({ policy_version: 'Revision 4', policy_owners: 'Policy title' });
  });
});

describe('a policy rule\'s figure', () => {
  it('is kept alone; its limit word joins its basis', () => {
    const out = ruleFiguresAlone(read('policy_document', [['policy_rule_rows', [
      { rule_subject: 'Donations', rule_figure: 'Maximum of 0.5%', rule_basis: 'of NPAT' },
      { rule_subject: 'Local spend', rule_figure: 'at least 40%', rule_basis: null },
      { rule_subject: 'Budget', rule_figure: '2%', rule_basis: 'of revenue' },
    ]]]));
    expect(fields(out).policy_rule_rows).toEqual([
      { rule_subject: 'Donations', rule_figure: '0.5%', rule_basis: 'maximum of NPAT' },
      { rule_subject: 'Local spend', rule_figure: '40%', rule_basis: 'at least' },
      { rule_subject: 'Budget', rule_figure: '2%', rule_basis: 'of revenue' },
    ]);
  });
});

describe('a date field\'s printed date', () => {
  it('is written yyyy-mm-dd, day first; a month or a range stays as printed', () => {
    const out = printedDatesAsIso(read('iso_environmental__iso14001_certificate', [
      ['audit_start_date', '23-Sep-2026'],
      ['audit_report_date', '30/09/2026'],
      ['iso14001_scope_statement', '23-Sep-2026'],
    ]));
    expect(fields(out)).toMatchObject({ audit_start_date: '2026-09-23', audit_report_date: '2026-09-30', iso14001_scope_statement: '23-Sep-2026' });
    const debrief = printedDatesAsIso(read(DEBRIEF, [['reporting_period_end', 'JUNE 2026'], ['report_date', '06-Aug-2026 09:41:12 PM']]));
    expect(fields(debrief)).toEqual({ reporting_period_end: 'JUNE 2026', report_date: '2026-08-06' });
  });
});

describe('what the code keeps about one document', () => {
  it('never reaches the case as a rival answer: derived counts, printed lines, a document\'s own table of lines', () => {
    const derived: ExtractedValue = { field: 'lost_time_injuries_count', value: 2, sourceFile: 'f', sourceDocumentId: 'x', source: { method: 'derived', quote: 'derived: rows' } };
    expect(isDocumentOwnValue(derived)).toBe(true);
    expect(isDocumentOwnValue({ field: 'printed_title_lines', value: ['A'], sourceFile: 'f', sourceDocumentId: 'x' })).toBe(true);
    expect(isDocumentOwnValue({ field: 'policy_rule_rows', value: [{ rule_subject: 'a' }], sourceFile: 'f', sourceDocumentId: 'x' })).toBe(true);
    // A register the workbook keeps, the monthly rows and a printed figure stay.
    expect(isDocumentOwnValue({ field: 'incident_rows', value: [{ incident_date: '2026-01-01' }], sourceFile: 'f', sourceDocumentId: 'x' })).toBe(false);
    expect(isDocumentOwnValue({ field: 'esg_monthly_rows', value: [{ monthly_value: 1 }], sourceFile: 'f', sourceDocumentId: 'x' })).toBe(false);
    expect(isDocumentOwnValue({ field: 'lost_time_injuries_count', value: 2, sourceFile: 'f', sourceDocumentId: 'x' })).toBe(false);
    const out = withoutDocumentFacts(read('health_safety__injury_statistics_report', [['site_name', 'Depot North'], derived]));
    expect(out.values.map((v) => v.field)).toEqual(['site_name']);
  });
});

describe('a short register that is the whole upload', () => {
  const register = read('health_safety__injury_statistics_report', [['incident_rows', Array.from({ length: 12 }, (_, i) => ({ incident_date: `0${(i % 9) + 1}-01-2026` }))]]);
  const input = (single: boolean): RawExtractionInput => ({
    file_id: 'x', filename: 'invented.xlsx', mime_type: 'x', raw_text: '', tables: [], metadata: { single_sheet: single, sheet_name: 'Sheet1' },
  });

  it('is read for its header too; a sheet of a larger workbook or a long register is not', () => {
    expect(wholeShortRegister(input(true), register)).toBe(true);
    expect(wholeShortRegister(input(false), register)).toBe(false);
    const long = read('training__ofo_intervention_register', [['training_intervention_rows', Array.from({ length: 41 }, () => ({ learner_name: 'A' }))]]);
    expect(wholeShortRegister(input(true), long)).toBe(false);
  });

  it('keeps the code\'s rows: the first pass\'s copy is dropped, its header kept', () => {
    const first = read('health_safety__injury_statistics_report', [['reporting_period_start', '1 July 2025'], ['incident_rows', [{ incident_date: 'x' }]]]);
    expect(fields(withoutRegisterRows(first, register))).toEqual({ reporting_period_start: '1 July 2025' });
  });
});
