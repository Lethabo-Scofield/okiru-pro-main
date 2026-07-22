/**
 * The sweep pass — a targeted second look for fields the first pass missed.
 *
 * A single pass reads a whole prompt's worth of fields at once and reliably
 * overlooks some, particularly values in tables, footers and stamps. Asking
 * again while naming ONLY what is still missing is a much easier question.
 *
 * The rules that matter are about not making things worse: a sweep may only
 * FILL a gap, never overwrite a first-pass answer; it must not fire when nothing
 * is missing; and its failure must leave the document exactly as it was.
 */
import { describe, expect, it, vi } from 'vitest';
import { extractWithSpec } from '../../src/services/aiExtraction.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';

/** A real matrix document, so the prompt and field list are genuine. */
const SPEC = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.expectedFields.length >= 3)!;
const [FIELD_A, FIELD_B, FIELD_C] = SPEC.expectedFields;

function input(text = 'a short document') {
  return { filename: 'evidence.pdf', raw_text: text, markdown: text };
}

/**
 * A model whose FIRST reply is the extraction pass and whose SECOND is the
 * sweep, so the two can be asserted independently.
 */
function twoPassModel(first: unknown, sweep: unknown) {
  const calls: string[] = [];
  const model: ExtractionModel = {
    name: 'fake',
    complete: vi.fn(async (system: string) => {
      const isSweep = system.includes('re-reading');
      calls.push(isSweep ? 'sweep' : 'extract');
      return JSON.stringify(isSweep ? sweep : first);
    }),
  };
  return { model, calls };
}

describe('the sweep fires only when something is missing', () => {
  it('does not run a second pass when the first found everything', async () => {
    const complete = { [FIELD_A]: 'a', [FIELD_B]: 'b', [FIELD_C]: 'c' };
    // Fill every expected field so nothing is outstanding.
    for (const f of SPEC.expectedFields) (complete as Record<string, unknown>)[f] = 'value';

    const { model, calls } = twoPassModel(complete, {});
    await extractWithSpec(model, SPEC, input());

    expect(calls).not.toContain('sweep');
  });

  it('runs a second pass when fields are outstanding', async () => {
    const { model, calls } = twoPassModel({ [FIELD_A]: 'found' }, {});
    await extractWithSpec(model, SPEC, input());

    expect(calls).toContain('sweep');
  });
});

describe('what the sweep is allowed to do', () => {
  it('fills a field the first pass missed', async () => {
    const { model } = twoPassModel({ [FIELD_A]: 'from first pass' }, { [FIELD_B]: 'from sweep' });
    const result = await extractWithSpec(model, SPEC, input());

    const byField = Object.fromEntries(result.values.map((v) => [v.field, v.value]));
    expect(byField[FIELD_A]).toBe('from first pass');
    expect(byField[FIELD_B]).toBe('from sweep');
    expect(result.missingFields).not.toContain(FIELD_B);
  });

  it('never overwrites a value the first pass already found', async () => {
    // A second opinion must not silently replace a first answer — that would
    // make the result depend on how many times we asked.
    const { model } = twoPassModel({ [FIELD_A]: 'original' }, { [FIELD_A]: 'contradiction' });
    const result = await extractWithSpec(model, SPEC, input());

    const byField = Object.fromEntries(result.values.map((v) => [v.field, v.value]));
    expect(byField[FIELD_A]).toBe('original');
  });

  it('leaves a genuinely absent field missing rather than inventing it', async () => {
    const { model } = twoPassModel({ [FIELD_A]: 'found' }, { [FIELD_B]: null });
    const result = await extractWithSpec(model, SPEC, input());

    expect(result.missingFields).toContain(FIELD_B);
  });

  it('treats the model\'s evasions as absent, not as answers', async () => {
    const { model } = twoPassModel({ [FIELD_A]: 'found' }, { [FIELD_B]: 'not stated', [FIELD_C]: 'N/A' });
    const result = await extractWithSpec(model, SPEC, input());

    expect(result.missingFields).toContain(FIELD_B);
    expect(result.missingFields).toContain(FIELD_C);
  });
});

describe('the sweep cannot make things worse', () => {
  it('keeps the first-pass result when the sweep call throws', async () => {
    const model: ExtractionModel = {
      name: 'fake',
      complete: vi.fn(async (system: string) => {
        if (system.includes('re-reading')) throw new Error('upstream 500');
        return JSON.stringify({ [FIELD_A]: 'survived' });
      }),
    };

    const result = await extractWithSpec(model, SPEC, input());
    const byField = Object.fromEntries(result.values.map((v) => [v.field, v.value]));
    expect(byField[FIELD_A]).toBe('survived');
  });

  it('keeps the first-pass result when the sweep returns junk', async () => {
    const model: ExtractionModel = {
      name: 'fake',
      complete: vi.fn(async (system: string) =>
        (system.includes('re-reading') ? 'not json at all' : JSON.stringify({ [FIELD_A]: 'survived' }))),
    };

    const result = await extractWithSpec(model, SPEC, input());
    const byField = Object.fromEntries(result.values.map((v) => [v.field, v.value]));
    expect(byField[FIELD_A]).toBe('survived');
  });

  it('is bounded to one extra round trip per chunk, not a retry loop', async () => {
    const { model, calls } = twoPassModel({ [FIELD_A]: 'found' }, {});
    await extractWithSpec(model, SPEC, input());

    // Short document => one chunk => exactly one extract + one sweep.
    expect(calls.filter((c) => c === 'sweep')).toHaveLength(1);
  });

  it('respects the kill switch', async () => {
    process.env.AI_EXTRACTION_SWEEP = 'false';
    try {
      const { model, calls } = twoPassModel({ [FIELD_A]: 'found' }, { [FIELD_B]: 'would have been found' });
      await extractWithSpec(model, SPEC, input());
      expect(calls).not.toContain('sweep');
    } finally {
      delete process.env.AI_EXTRACTION_SWEEP;
    }
  });
});

describe('checksum cross-check on extracted identifiers', () => {
  const withIdField = VERIFICATION_DOCUMENT_MATRIX.find((d) =>
    d.expectedFields.some((f) => /id_number/.test(f)))!;
  const idField = withIdField.expectedFields.find((f) => /id_number/.test(f))!;

  function modelReturning(value: string): ExtractionModel {
    return { name: 'fake', complete: async () => JSON.stringify({ [idField]: value }) };
  }

  it('flags an ID number whose check digit does not match', async () => {
    // One transposed digit in an OCR'd scan produces a plausible-looking number
    // that identifies the WRONG PERSON. Grounding cannot catch it — a misread
    // digit grounds perfectly well against a blurry source.
    const bad = '5608305112084'; // real ID with the last digit changed
    const result = await extractWithSpec(modelReturning(bad), withIdField, {
      filename: 'id.pdf',
      raw_text: `Identity Number: ${bad}`,
    });

    expect(result.exceptions.join(' ')).toMatch(/failed its checksum/i);
  });

  it('does not flag a valid ID number', async () => {
    const good = '5608305112083'; // the real Thandanani shareholder ID
    const result = await extractWithSpec(modelReturning(good), withIdField, {
      filename: 'id.pdf',
      raw_text: `Identity Number: ${good}`,
    });

    expect(result.exceptions.join(' ')).not.toMatch(/failed its checksum/i);
  });

  it('reports the bad value rather than dropping it', async () => {
    const bad = '5608305112084';
    const result = await extractWithSpec(modelReturning(bad), withIdField, {
      filename: 'id.pdf',
      raw_text: `Identity Number: ${bad}`,
    });

    // A reviewer decides; a genuinely malformed number is itself a finding.
    expect(result.values.map((v) => v.field)).toContain(idField);
  });
});
