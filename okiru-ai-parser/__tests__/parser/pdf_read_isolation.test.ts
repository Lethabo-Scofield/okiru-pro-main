/**
 * Building a PDF's markdown must never cost the PDF its text.
 *
 * The markdown rendering groups pdfjs text items into reading-order lines
 * (reconstructPdfLines). It used to run as its own pass behind
 * `.catch(() => '')`, so a throw there left the document with its plain text
 * and no markdown. When the text and markdown were merged into one pass, that
 * isolation went with it: a throw in line reconstruction failed the whole PDF
 * read, and the upload was refused. Now a throw falls back to the plain
 * page text (items joined in stream order, the old reading) and empty markdown.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/markdownConversion.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/markdownConversion.js')>();
  return {
    ...actual,
    reconstructPdfLines: () => {
      throw new Error('line reconstruction failed');
    },
  };
});

const { extractPdfText, rawExtractionInputFromUpload } = await import('../../src/services/fileExtraction.js');

/** A one-page PDF with text drawn at the given positions. */
function minimalPdf(items: Array<{ x: number; y: number; text: string }>): Buffer {
  const stream = items
    .map(({ x, y, text }) => `BT /F1 12 Tf ${x} ${y} Td (${text.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const PDF = minimalPdf([
  { x: 72, y: 700, text: 'Company Name: Acme Trading (Pty) Ltd' },
  { x: 72, y: 680, text: 'Registration Number: 2001/000001/07' },
  { x: 72, y: 660, text: 'B-BBEE Level: Level 1' },
]);

describe('a throw while building PDF lines', () => {
  it('does not fail the upload read: the text survives, and the markdown falls back to it', async () => {
    const input = await rawExtractionInputFromUpload({
      buffer: PDF,
      originalname: 'certificate.pdf',
      mimetype: 'application/pdf',
      size: PDF.length,
    });
    expect(input.raw_text).toContain('Company Name: Acme Trading (Pty) Ltd');
    expect(input.raw_text).toContain('Registration Number: 2001/000001/07');
    // No line-built page markdown; the upload's usual empty-markdown fallback
    // (the plain text) applies, as it did when the markdown pass failed alone.
    expect(input.markdown).toBe(input.raw_text);
    expect(input.markdown).not.toContain('## Page');
  }, 30_000);

  it('does not fail the quote-time text read either', async () => {
    const text = await extractPdfText(PDF);
    expect(text).toContain('B-BBEE Level: Level 1');
  }, 30_000);
});
