/**
 * A training register is one row per learner per course. The learners it
 * names are counted as people: the same ID number is one person, and so is
 * one name whose ID numbers are missing or a keystroke apart. All values are
 * invented.
 */
import { describe, expect, it } from 'vitest';
import { distinctLearners } from '../../src/services/learnerRegister.js';
import { addDistinctLearners } from '../../src/services/caseExtraction.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';

const ROWS = [
  { learner_name: 'Ayanda Zulu', id_number: 9001015800081, program_name: 'First aid' },
  { learner_name: 'Ben  Mokoena', id_number: '8502025800082', program_name: 'First aid' },
  { learner_name: 'Ayanda Zulu', id_number: 9001015800081, program_name: 'Forklift' },
  // One digit dropped from Ben's ID number: still Ben.
  { learner_name: 'Ben Mokoena', id_number: '850202580082', program_name: 'Forklift' },
  // Surname first, a passport number with a stray quote mark.
  { learner_name: 'Dube, Carol', id_number: "  'PA123456", program_name: 'Rigging' },
  { learner_name: 'Carol Dube', id_number: 'PA123456', program_name: 'Forklift' },
  // No ID number written: the name belongs to one person.
  { learner_name: 'Ayanda Zulu', program_name: 'Rigging' },
];

describe('distinctLearners', () => {
  it('counts people, not course entries', () => {
    const result = distinctLearners(ROWS);
    expect(result.entries).toBe(7);
    expect(result.names).toEqual(['Ayanda Zulu', 'Ben Mokoena', 'Dube, Carol']);
  });

  it('reports a learner written with two ID numbers', () => {
    expect(distinctLearners(ROWS).idVariants).toEqual([{ name: 'Ben Mokoena', ids: ['8502025800082', '850202580082'] }]);
  });

  it('keeps two people who share a name but not an ID number', () => {
    const result = distinctLearners([
      { learner_name: 'Sipho Ndlovu', id_number: '9001015800081' },
      { learner_name: 'Sipho Ndlovu', id_number: '7703035800083' },
    ]);
    expect(result.names).toEqual(['Sipho Ndlovu', 'Sipho Ndlovu']);
  });

  it('never guesses which of two same-named people an unnumbered row is', () => {
    const result = distinctLearners([
      { learner_name: 'Sipho Ndlovu', id_number: '9001015800081' },
      { learner_name: 'Sipho Ndlovu', id_number: '7703035800083' },
      { learner_name: 'Sipho Ndlovu' },
    ]);
    expect(result.names).toHaveLength(3);
  });

  it('joins the same ID number under two spellings', () => {
    expect(distinctLearners([
      { learner_name: 'Thabo Mokoena', id_number: '9001015800081' },
      { learner_name: 'T. Mokoena', id_number: '9001015800081' },
    ]).names).toEqual(['Thabo Mokoena']);
  });

  it('ignores rows that name nobody', () => {
    expect(distinctLearners([{ program_name: 'First aid', total_cost: 100 }, null, 'x']).entries).toBe(0);
    expect(distinctLearners(undefined).names).toEqual([]);
  });
});

describe('addDistinctLearners', () => {
  function register(values: Record<string, unknown>): DocumentExtraction {
    return {
      documentId: 'sheet_table__skills_development',
      documentName: 'SKILLS_DEVELOPMENT table',
      element: 'SKILLS_DEVELOPMENT',
      sourceFile: 'Gathering.xlsx › Skills Development',
      values: Object.entries(values).map(([field, value]) => ({ field, value, sourceFile: 'Gathering.xlsx › Skills Development', sourceDocumentId: 'sheet_table__skills_development' })),
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
    };
  }

  it('places the learners beside the rows, labelled derived, and leaves the rows alone', () => {
    const extraction = register({ learner_rows: ROWS });
    addDistinctLearners([extraction]);
    const learners = extraction.values.find((v) => v.field === 'derived_learner_names');
    expect(learners?.value).toEqual(['Ayanda Zulu', 'Ben Mokoena', 'Dube, Carol']);
    expect(learners?.source?.method).toBe('derived');
    expect(learners?.source?.quote).toMatch(/3 learner\(s\) on 7 learner-course entries/);
    expect((extraction.values.find((v) => v.field === 'learner_rows')?.value as unknown[]).length).toBe(7);
    expect(extraction.exceptions.join(' ')).toMatch(/Ben Mokoena.*2 different ID numbers/);
  });

  it('adds nothing to a document without a learner register', () => {
    const extraction = register({ employee_rows: [{ employee_name: 'Ayanda Zulu' }] });
    addDistinctLearners([extraction]);
    expect(extraction.values.map((v) => v.field)).toEqual(['employee_rows']);
  });
});
