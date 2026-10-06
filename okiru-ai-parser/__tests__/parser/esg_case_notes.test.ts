/**
 * A model's notes on a document are that document's exceptions — never a
 * value that can "disagree" with another document's notes.
 */
import { describe, expect, it } from 'vitest';
import { notesAsExceptions } from '../../src/services/esgCaseExtraction.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';

const extraction = (values: DocumentExtraction['values'], exceptions: string[] = []): DocumentExtraction => ({
  documentId: 'doc',
  documentName: 'Doc',
  sourceFile: 'a.xlsx',
  values,
  missingFields: [],
  unexpectedFields: [],
  exceptions,
});

describe('notesAsExceptions', () => {
  it('moves the model\'s "exceptions" out of the values and into the document\'s exceptions', () => {
    const moved = notesAsExceptions(extraction([
      { field: 'fuel_litres', value: '1621', sourceFile: 'a.xlsx', sourceDocumentId: 'doc' },
      { field: 'exceptions', value: ['No site name stated.', 'Period inferred.'], sourceFile: 'a.xlsx', sourceDocumentId: 'doc' },
    ], ['Period inferred.']));
    expect(moved.values.map((v) => v.field)).toEqual(['fuel_litres']);
    expect(moved.exceptions).toEqual(['Period inferred.', 'No site name stated.']);
  });

  it('leaves an extraction without notes untouched', () => {
    const plain = extraction([{ field: 'kwh', value: 1, sourceFile: 'a.xlsx', sourceDocumentId: 'doc' }]);
    expect(notesAsExceptions(plain)).toBe(plain);
  });
});
