/**
 * A Word document's page headers and footers are part of what it states: a
 * controlled form prints its document number and revision date in the
 * header; a letter prints its company registration number, directors and
 * secretary in the footer. mammoth reads the body only, so they never reached
 * the reader. They now follow the body under "## Header" and "## Footer", each
 * distinct part once. Every name and number here is invented.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractDocxHeadersAndFooters, rawExtractionInputFromUpload } from '../../src/services/fileExtraction.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const row = (cells: string[]) => `<w:tr>${cells.map((c) => `<w:tc>${para(c)}</w:tc>`).join('')}</w:tr>`;

async function makeDocx(parts: { header?: string[]; footer?: string; secondHeader?: string } = {}): Promise<Buffer> {
  const zip = new JSZip();
  const rels: string[] = [];
  const overrides: string[] = [];
  if (parts.header) {
    zip.file('word/header1.xml', `<?xml version="1.0"?><w:hdr ${W}>${parts.header.join('')}</w:hdr>`);
    rels.push('<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>');
    overrides.push('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>');
  }
  if (parts.secondHeader) {
    zip.file('word/header2.xml', `<?xml version="1.0"?><w:hdr ${W}>${parts.secondHeader}</w:hdr>`);
  }
  if (parts.footer) {
    zip.file('word/footer1.xml', `<?xml version="1.0"?><w:ftr ${W}>${parts.footer}</w:ftr>`);
    rels.push('<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>');
    overrides.push('<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>');
  }
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${overrides.join('')}</Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body>${para('Dear Supplier')}${para('Please complete the questions below.')}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const formHeader = [
  `<w:tbl>${row(['DOCUMENT NUMBER', 'REVISED DATE'])}${row(['ABC-T-001-02', '25-03-2026'])}</w:tbl>`,
];
const letterFooter = `${para('A division of Example Holdings (Pty) Ltd Reg No. 2001/123456/07')}<w:p><w:r><w:t>Directors: A Person</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>B Person</w:t></w:r></w:p>`;

describe('Word headers and footers', () => {
  it('reads a header table row by row and a footer paragraph by paragraph', async () => {
    const text = await extractDocxHeadersAndFooters(await makeDocx({ header: formHeader, footer: letterFooter }));
    expect(text).toContain('## Header');
    expect(text).toContain('DOCUMENT NUMBER | REVISED DATE');
    expect(text).toContain('ABC-T-001-02 | 25-03-2026');
    expect(text).toContain('## Footer');
    expect(text).toContain('Reg No. 2001/123456/07');
    expect(text).toContain('Directors: A Person B Person');
    expect(text.indexOf('## Header')).toBeLessThan(text.indexOf('## Footer'));
  });

  it('a header repeated for the first page is read once', async () => {
    const text = await extractDocxHeadersAndFooters(await makeDocx({ header: formHeader, secondHeader: formHeader[0] }));
    expect(text.match(/ABC-T-001-02/g)).toHaveLength(1);
  });

  it('reach the upload\'s markdown and text after the body', async () => {
    const input = await rawExtractionInputFromUpload({
      originalname: 'Invented form.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1,
      buffer: await makeDocx({ header: formHeader, footer: letterFooter }),
    });
    expect(input.markdown).toContain('Dear Supplier');
    expect(input.markdown).toContain('ABC-T-001-02 | 25-03-2026');
    expect(input.markdown!.indexOf('Dear Supplier')).toBeLessThan(input.markdown!.indexOf('## Header'));
    expect(input.raw_text).toContain('Reg No. 2001/123456/07');
  });

  it('a document without headers or footers reads exactly as before', async () => {
    const buffer = await makeDocx();
    expect(await extractDocxHeadersAndFooters(buffer)).toBe('');
    const input = await rawExtractionInputFromUpload({
      originalname: 'Plain.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1,
      buffer,
    });
    expect(input.markdown).not.toContain('## Header');
    expect(input.markdown).not.toContain('## Footer');
  });

  it('a file that is no package yields nothing and never throws', async () => {
    expect(await extractDocxHeadersAndFooters(Buffer.from('not a zip'))).toBe('');
  });
});
