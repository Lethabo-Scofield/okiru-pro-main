/**
 * Chunking replaces the silent truncation that read the first 60,000 characters
 * of a document and reported everything after it as missing.
 *
 * The properties that matter: nothing is lost, a label is never severed from its
 * value, a document that fits pays nothing, and any remaining limit is REPORTED
 * rather than silent.
 */
import { describe, expect, it } from 'vitest';
import { chunkDocument, mergeChunkResults } from '../../src/services/documentChunking.js';

/** Text of a given length with position markers, so loss is detectable. */
function longText(chars: number): string {
  let out = '';
  let n = 0;
  while (out.length < chars) {
    out += `line ${n} of the document with some filler content to take up space\n`;
    n += 1;
  }
  return out.slice(0, chars);
}

describe('a document that fits is untouched', () => {
  it('returns exactly one chunk, byte-identical', () => {
    const text = 'B-BBEE certificate\nLevel 4\nExpiry 14 March 2027';
    const result = chunkDocument(text);

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].text).toBe(text);
    expect(result.truncated).toBe(false);
  });

  it('returns no chunks for an empty document rather than one empty chunk', () => {
    expect(chunkDocument('').chunks).toEqual([]);
  });
});

describe('nothing is lost', () => {
  it('covers the whole document across chunks', () => {
    const text = longText(150_000);
    const { chunks, truncated } = chunkDocument(text, { chunkChars: 10_000, overlapChars: 500 });

    expect(truncated).toBe(false);
    // Every character of the source appears in some chunk: the last chunk must
    // reach the end of the document.
    const last = chunks[chunks.length - 1];
    expect(last.startOffset + last.text.length).toBe(text.length);
  });

  it('reads past the old 60,000-character truncation point', () => {
    // The regression: a value at 100k was previously unreachable.
    const text = `${longText(100_000)}\nEXPIRY DATE: 14 March 2027\n`;
    const { chunks } = chunkDocument(text, { chunkChars: 20_000, overlapChars: 1_000 });

    expect(chunks.some((c) => c.text.includes('EXPIRY DATE: 14 March 2027'))).toBe(true);
  });

  it('records where each chunk started, for provenance', () => {
    const { chunks } = chunkDocument(longText(60_000), { chunkChars: 10_000, overlapChars: 500 });
    expect(chunks[0].startOffset).toBe(0);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startOffset).toBeGreaterThan(chunks[i - 1].startOffset);
    }
  });
});

describe('a label is never severed from its value', () => {
  it('overlaps consecutive chunks', () => {
    const text = longText(50_000);
    const { chunks } = chunkDocument(text, { chunkChars: 10_000, overlapChars: 1_000 });

    expect(chunks.length).toBeGreaterThan(1);
    // The start of chunk N+1 must re-appear inside chunk N.
    for (let i = 1; i < chunks.length; i++) {
      const head = chunks[i].text.slice(0, 200);
      expect(chunks[i - 1].text.includes(head)).toBe(true);
    }
  });

  it('keeps a field and its value together across a boundary', () => {
    // Engineer the pair to sit exactly where a naive cut would land.
    const filler = longText(9_900);
    const text = `${filler}\nCertificate Number: BEE/2026/00184\n${longText(5_000)}`;
    const { chunks } = chunkDocument(text, { chunkChars: 10_000, overlapChars: 1_000 });

    expect(chunks.some((c) => c.text.includes('Certificate Number: BEE/2026/00184'))).toBe(true);
  });
});

describe('splitting prefers structure', () => {
  it('cuts at a heading rather than mid-line', () => {
    const section = (title: string) => `## ${title}\n${longText(4_000)}\n`;
    const text = section('Ownership') + section('Management') + section('Skills');
    const { chunks } = chunkDocument(text, { chunkChars: 6_000, overlapChars: 200 });

    expect(chunks.length).toBeGreaterThan(1);
    // Alignment shows in where a chunk ENDS. The next chunk deliberately starts
    // `overlapChars` EARLIER than the cut, so it will not begin at the heading —
    // that overlap is what stops a label being severed from its value.
    const cutsAtHeading = chunks.slice(0, -1).some((c) => {
      const after = text.slice(c.startOffset + c.text.length);
      return after.startsWith('## ');
    });
    expect(cutsAtHeading).toBe(true);
  });

  it('never cuts mid-line', () => {
    const text = longText(40_000);
    const { chunks } = chunkDocument(text, { chunkChars: 8_000, overlapChars: 400 });

    for (const c of chunks.slice(0, -1)) {
      const nextChar = text.charAt(c.startOffset + c.text.length - 1);
      // The cut lands on a newline boundary, so a line is never split in two.
      expect(nextChar).toBe('\n');
    }
  });
});

describe('limits are reported, never silent', () => {
  it('flags truncation when a document exceeds the chunk ceiling', () => {
    const { chunks, truncated, totalChars } = chunkDocument(longText(500_000), {
      chunkChars: 5_000,
      overlapChars: 100,
      maxChunks: 3,
    });

    expect(chunks).toHaveLength(3);
    // The caller can SEE that it did not get everything — the whole point.
    expect(truncated).toBe(true);
    expect(totalChars).toBe(500_000);
  });
});

describe('merging chunk results', () => {
  it('combines fields found in different chunks', () => {
    const { merged } = mergeChunkResults([
      { supplier_name: 'Acme', bee_level: null },
      { bee_level: 4, expiry_date: '2027-03-14' },
    ]);

    expect(merged).toEqual({ supplier_name: 'Acme', bee_level: 4, expiry_date: '2027-03-14' });
  });

  it('keeps the FIRST value, so an appendix cannot overwrite the cover page', () => {
    const { merged } = mergeChunkResults([
      { bee_level: 4 },
      { bee_level: 8 },
    ]);
    expect(merged.bee_level).toBe(4);
  });

  it('ignores empty values rather than letting them claim a field', () => {
    const { merged } = mergeChunkResults([
      { supplier_name: '' },
      { supplier_name: 'Beta Logistics' },
    ]);
    expect(merged.supplier_name).toBe('Beta Logistics');
  });

  it('reports how many fields each chunk contributed', () => {
    const { fieldsFoundPerChunk } = mergeChunkResults([
      { a: 1, b: 2 },
      { c: 3 },
      { d: null },
    ]);
    // Tells us whether the later chunks were worth reading.
    expect(fieldsFoundPerChunk).toEqual([2, 1, 0]);
  });

  it('handles no results without throwing', () => {
    expect(mergeChunkResults([]).merged).toEqual({});
  });
});
