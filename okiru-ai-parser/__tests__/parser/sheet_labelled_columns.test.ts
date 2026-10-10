/**
 * Labelled template columns outside the model's target fields are still read.
 *
 * The ownership register's "Outstanding Debt by Black Participants" column
 * decides ownership fulfilment and net value. The column mapping is only asked
 * about the shape's target fields, so the column was never read and a stated
 * nil debt reached scoring as "not stated". (Invented holders.)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { extractSheetTable, withLabelledTemplateColumns } from '../../src/services/sheetTableExtraction.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

beforeEach(() => {
  resetDecisionCacheForTest();
});

const rows = [
  { 'Name & Surname': 'Sipho Ndlovu', Race: 'Black', Gender: 'Male', 'Voting Rights': 1, 'Outstanding Debt by Black Participants': 0 },
];

/** Picks the shape, then maps only the target fields — never the debt column. */
const model: ExtractionModel = {
  name: 'fake',
  complete: async (system: string) => {
    if (/WHAT KIND/i.test(system)) return JSON.stringify({ shape: 'shareholders' });
    if (/map the columns/i.test(system)) {
      return JSON.stringify({ mapping: { 'Name & Surname': 'shareholder_name', Race: 'race', Gender: 'gender', 'Voting Rights': 'voting_rights' } });
    }
    return '{}';
  },
};

describe('labelled template columns', () => {
  it('reads the register\'s stated outstanding debt — a stated nil included', async () => {
    const result = await extractSheetTable(model, 'OWNERSHIP', {
      filename: 'Gathering.xlsx › Ownership', raw_text: 't', markdown: 't', rows,
    });
    const out = result!.values[0].value as Array<Record<string, unknown>>;
    expect(out).toHaveLength(1);
    expect(out[0].shareholder_name).toBe('Sipho Ndlovu');
    expect(out[0].black_participant_outstanding_debt).toBe(0);
  });

  it('never overrides a column the model mapped, and only touches the register shape', () => {
    const mapping = { 'Outstanding Debt by Black Participants': 'voting_rights' };
    expect(withLabelledTemplateColumns(mapping, 'shareholder_rows', rows)).toEqual(mapping);
    expect(withLabelledTemplateColumns({}, 'supplier_rows', rows)).toEqual({});
  });
});
