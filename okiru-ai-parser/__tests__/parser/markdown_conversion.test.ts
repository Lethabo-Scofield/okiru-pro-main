import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  htmlToMarkdown,
  pptxToMarkdown,
  reconstructPdfLines,
  rowsToMarkdownTable,
  worksheetToMarkdown,
} from '../../src/services/markdownConversion.js';
import { rawExtractionInputFromUpload } from '../../src/services/fileExtraction.js';

describe('rowsToMarkdownTable', () => {
  it('renders a pipe table with union-of-keys headers', () => {
    const md = rowsToMarkdownTable([
      { Supplier: 'ABC', Spend: '100000' },
      { Supplier: 'XYZ', Spend: '50000', Level: '2' },
    ]);
    const lines = md.split('\n');
    expect(lines[0]).toBe('| Supplier | Spend | Level |');
    expect(lines[1]).toBe('| --- | --- | --- |');
    expect(lines[2]).toBe('| ABC | 100000 |  |');
    expect(lines[3]).toBe('| XYZ | 50000 | 2 |');
  });

  it('escapes pipe characters inside cells', () => {
    const md = rowsToMarkdownTable([{ Note: 'a|b' }]);
    expect(md).toContain('a\\|b');
  });
});

describe('htmlToMarkdown', () => {
  it('converts headings, lists and inline emphasis', () => {
    const md = htmlToMarkdown('<h2>Certificate</h2><p>Issued to <strong>ABC</strong></p><ul><li>One</li><li>Two</li></ul>');
    expect(md).toContain('## Certificate');
    expect(md).toContain('Issued to **ABC**');
    expect(md).toContain('- One');
    expect(md).toContain('- Two');
  });

  it('converts an HTML table into a markdown pipe table', () => {
    const md = htmlToMarkdown('<table><tr><th>Field</th><th>Value</th></tr><tr><td>Level</td><td>2</td></tr></table>');
    expect(md).toContain('| Field | Value |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Level | 2 |');
  });
});

describe('reconstructPdfLines', () => {
  it('orders items top-to-bottom then left-to-right regardless of stream order', () => {
    // Deliberately out of order; y descending = visual top-to-bottom.
    const lines = reconstructPdfLines([
      { str: 'Value', x: 200, y: 700 },
      { str: 'Expiry', x: 10, y: 500 },
      { str: 'Field', x: 10, y: 700 },
      { str: '2027', x: 200, y: 500 },
    ]);
    expect(lines).toEqual(['Field Value', 'Expiry 2027']);
  });
});

describe('worksheetToMarkdown', () => {
  it('prefixes a heading and renders the table', () => {
    const md = worksheetToMarkdown('Suppliers', [{ Name: 'ABC', Spend: '100' }]);
    expect(md.startsWith('## Suppliers')).toBe(true);
    expect(md).toContain('| Name | Spend |');
  });
});

// Build a minimal but valid .pptx (a zip with two slide XML parts).
async function makePptx(): Promise<Buffer> {
  const zip = new JSZip();
  const slide = (paras: string[]) =>
    `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${paras
      .map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`)
      .join('')}</p:spTree></p:cSld></p:sld>`;
  zip.file('ppt/slides/slide1.xml', slide(['Empowerment Report', 'Q4 2026']));
  zip.file('ppt/slides/slide2.xml', slide(['Ownership: 51%']));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('pptxToMarkdown', () => {
  it('extracts each slide as a heading with bulleted paragraphs', async () => {
    const md = (await pptxToMarkdown(await makePptx())).markdown;
    expect(md).toContain('## Slide 1');
    expect(md).toContain('- Empowerment Report');
    expect(md).toContain('- Q4 2026');
    expect(md).toContain('## Slide 2');
    expect(md).toContain('- Ownership: 51%');
  });
});

describe('rawExtractionInputFromUpload markdown field', () => {
  it('adds a markdown pipe table for CSV without changing raw_text', async () => {
    const input = await rawExtractionInputFromUpload({
      originalname: 'suppliers.csv',
      mimetype: 'text/csv',
      size: 64,
      buffer: Buffer.from(['Supplier,Spend', 'ABC,100000', 'XYZ,50000'].join('\n')),
    });
    // raw_text regression guard: still the flat "key: value" projection.
    expect(input.raw_text).toContain('Supplier: ABC');
    // markdown is the new structured rendering.
    expect(input.markdown).toContain('| Supplier | Spend |');
    expect(input.markdown).toContain('| ABC | 100000 |');
  });

  it('routes a .pptx upload through slide markdown', async () => {
    const input = await rawExtractionInputFromUpload({
      originalname: 'deck.pptx',
      mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size: 2048,
      buffer: await makePptx(),
    });
    expect(input.markdown).toContain('## Slide 1');
    expect(input.markdown).toContain('- Ownership: 51%');
  });
});
