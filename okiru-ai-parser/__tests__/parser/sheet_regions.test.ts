import { describe, it, expect } from 'vitest';
import { sheetGridToMarkdown } from '../../src/services/sheetRegions.js';

/**
 * Fixture mirrors the real Thandanani SED sheet that produced 68 phantom
 * contributions: preamble rows, the real header on a later row, a
 * blank-means-ditto ledger, and side columns holding dropdown reference lists.
 */
function thandananiShapedGrid(): string[][] {
  const g = (...cells: string[]) => cells;
  return [
    g('Measured Entity: Thandanani', '', '', '', '', '', '', '', '', '', 'Grant'),
    g('Year End: 28 February', '', '', '', '', '', '', '', '', '', 'Direct Cost'),
    g('Summary', '', '', '', '', '', '', '', '', '', 'HIV (Aviation)'),
    g('Total Value of Contributions', '', '16700', '', '', '', '', '', '', '', 'Bursaries (Forwarding & Clearing)'),
    g('Beneficiary', 'Site', '% Black participation', 'Contribution Type', 'Description', 'Date', 'Amount'),
    g('Essentially Edenvale', 'Edenvale', '100%', 'Donation', 'Monthly support', '2024-03-01', '500'),
    g('', '', '', '', '', '2024-04-01', '500'),
    g('', '', '', '', '', '2024-05-01', '500'),
    g('Germiston Youth Centre', 'Germiston', '100%', 'Donation', '', '2024-03-04', '100'),
    g('', '', '', '', '', '2024-03-11', '100'),
  ];
}

describe('sheetGridToMarkdown — table understanding', () => {
  const md = sheetGridToMarkdown('Social Development', thandananiShapedGrid());

  it('finds the real header row instead of keying off the preamble', () => {
    expect(md).toContain('| Beneficiary | Site | % Black participation | Contribution Type |');
    // Preamble is kept as context lines, not table cells.
    expect(md).toContain('Measured Entity: Thandanani');
  });

  it('ditto-fills TEXT attributes on continuation rows from the stated row above', () => {
    // The 2024-04-01 payment row inherits beneficiary + type (text columns).
    // Percent columns are numeric and deliberately NOT filled — only the
    // block's stated row carries them, so nothing numeric can be fabricated.
    expect(md).toMatch(/Essentially Edenvale \| Edenvale \|  \| Donation \| Monthly support \| 2024-04-01/);
    // Germiston block starts fresh — it must NOT inherit Edenvale's description.
    const germistonContinuation = md.split('\n').find((l) => l.includes('2024-03-11'));
    expect(germistonContinuation).toContain('Germiston Youth Centre');
    expect(germistonContinuation).toContain('Donation');
    expect(germistonContinuation).not.toContain('Monthly support');
  });

  it('never fills numeric or date columns — a blank amount stays blank', () => {
    // No row should have a fabricated amount: every amount in the output must
    // exist in the fixture.
    const amounts = [...md.matchAll(/\| (\d+) \|$/gm)].map((m) => m[1]);
    for (const a of amounts) expect(['500', '100', '16700']).toContain(a);
  });

  it('renders side dropdown columns as labelled reference options, not data rows', () => {
    expect(md).toContain('### Reference options (dropdown values — not data)');
    expect(md).toContain('- HIV (Aviation)');
    // The reference values must NOT appear inside the data table.
    const tableLines = md.split('\n').filter((l) => l.startsWith('|'));
    expect(tableLines.join('\n')).not.toContain('HIV (Aviation)');
    expect(tableLines.join('\n')).not.toContain('Bursaries (Forwarding & Clearing)');
  });

  it('handles a plain single-region sheet without inventing structure', () => {
    const simple = sheetGridToMarkdown('Suppliers', [
      ['Supplier', 'Spend'],
      ['Alpha', '1000'],
      ['Beta', '2000'],
    ]);
    expect(simple).toContain('| Supplier | Spend |');
    expect(simple).toContain('| Alpha | 1000 |');
    expect(simple).not.toContain('Reference options');
  });
});
