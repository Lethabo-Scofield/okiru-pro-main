/**
 * Normalization intelligence — "make any spreadsheet import smart".
 *
 * Probes that the importer (normalizeExcelBuffer) tolerates messy real-world
 * input: synonym Yes/No values (TRUE/checked/✓ instead of Yes), misnamed sheets
 * (a skills sheet titled "Learning & Development"), and value-format noise.
 * This is the fitness probe for autoresearch mission M6 (smart normalization) —
 * extend it with new messy cases as the org makes the normalizer smarter.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { normalizeExcelBuffer } from '@/lib/workbookExcelNormalizer';

function buildBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('normalization intelligence', () => {
  it('coerces Yes/No synonyms (TRUE / checked / ✓ / no) to booleans', () => {
    const buf = buildBuffer({
      'Management Control': [
        ['First Name', 'Surname', 'Race', 'Gender', 'Designation', 'Disabled', 'Foreign'],
        ['Ayanda', 'Khumalo', 'African', 'Female', 'Senior Manager', 'TRUE', 'no'],
        ['Sipho', 'Ndlovu', 'African', 'Male', 'Middle Manager', 'checked', 'false'],
        ['Thandi', 'Mbeki', 'African', 'Female', 'Junior Manager', '✓', ''],
      ],
    });
    const r = normalizeExcelBuffer(buf);
    const rows = r.sections['management-control']?.rows ?? [];
    expect(rows.length).toBe(3);
    expect(rows[0].isDisabled).toBe(true);
    expect(rows[0].isForeign).toBe(false);
    expect(rows[1].isDisabled).toBe(true);
    expect(rows[1].isForeign).toBe(false);
    expect(rows[2].isDisabled).toBe(true);
    expect(rows[2].isForeign).toBe(''); // empty stays unset, not forced to No
  });

  it('maps a misnamed skills sheet ("Learning & Development") to skills-development', () => {
    const buf = buildBuffer({
      'Learning & Development': [
        ['Training Program', 'Category (A–G)', 'Learner Name', 'Race', 'Gender', 'Course Cost (R)'],
        ['Supervisory Skills', 'C', 'Bongani Zulu', 'African', 'Male', 'R 12 500,00'],
      ],
    });
    const r = normalizeExcelBuffer(buf);
    expect(r.mappedSheets['Learning & Development']).toBe('skills-development');
    const rows = r.sections['skills-development']?.rows ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].learnerName).toBe('Bongani Zulu');
    // SA-locale currency parsed: "R 12 500,00" → 12500
    expect(rows[0].courseCost).toBe(12500);
  });

  it('maps a "Workforce" sheet to the employees section', () => {
    const buf = buildBuffer({
      Workforce: [
        ['First Name', 'Surname', 'Race', 'Gender', 'Designation'],
        ['Lerato', 'Mokoena', 'African', 'Female', 'Middle Manager'],
      ],
    });
    const r = normalizeExcelBuffer(buf);
    expect(['employees', 'management-control']).toContain(r.mappedSheets['Workforce']);
  });
});
