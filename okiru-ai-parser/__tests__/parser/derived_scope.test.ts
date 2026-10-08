/**
 * Where code-derived figures may appear, and where they may go.
 *
 * - The B-BBEE skills read standalone documents, never workbook sheets, so the
 *   figures derived from a skill's rows are not worked out on a sheet table
 *   either: a gathering template's fill-down rows counted as "employee rows on
 *   the report" gave 500 and 3000.
 * - A derived figure that carries an existing matrix field name (the ledger's
 *   invoice count and its total check) is still derived: it is never offered to
 *   the calculator's semantic placement as if a document printed it.
 *
 * All values are invented.
 */
import { describe, expect, it } from 'vitest';
import { addSkillDerivations } from '../../src/services/caseExtraction.js';
import { isReportedNotScored } from '../../src/services/entityCalculatorMapping.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';

function extraction(documentId: string, values: Record<string, unknown>, sourceFile: string): DocumentExtraction {
  return {
    documentId,
    documentName: documentId,
    sourceFile,
    values: Object.entries(values).map(([field, value]) => ({ field, value, sourceFile, sourceDocumentId: documentId })),
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };
}

const employees = (n: number) => Array.from({ length: n }, (_, i) => ({ employee_name: `Employee ${i + 1}` }));

describe('derived figures are worked out on documents, not on workbook sheets', () => {
  it('a sheet table\'s rows are never counted', () => {
    const sheet = extraction('sheet_table__management_control', { employee_rows: employees(5) }, 'Gathering Workbook.xlsx › Management Control');
    addSkillDerivations([sheet]);
    expect(sheet.values.some((v) => v.field === 'derived_employee_count')).toBe(false);
    expect(sheet.exceptions).toEqual([]);
  });

  it('a payroll report still is', () => {
    const payroll = extraction('management_control__payroll_as_at_measurement_date', { employee_rows: employees(3) }, 'Payroll November.pdf');
    addSkillDerivations([payroll]);
    expect(payroll.values.find((v) => v.field === 'derived_employee_count')?.value).toBe(3);
  });
});

describe('a derived ledger check is never placed on a calculator key', () => {
  it.each(['supporting_invoices_reviewed', 'ledger_total_matches_entries'])('%s', (field) => {
    expect(isReportedNotScored(field)).toBe(true);
  });
});
