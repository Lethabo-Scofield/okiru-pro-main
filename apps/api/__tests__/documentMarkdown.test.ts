import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { htmlToMarkdown, pptxToMarkdown } from '../pipeline/extraction/documentMarkdown.js';

describe('htmlToMarkdown (hybrid path)', () => {
  it('converts an HTML table into a markdown pipe table', () => {
    const md = htmlToMarkdown('<table><tr><th>Field</th><th>Value</th></tr><tr><td>Level</td><td>2</td></tr></table>');
    expect(md).toContain('| Field | Value |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Level | 2 |');
    // No leftover [TABLE] marker from the old inline converter.
    expect(md).not.toContain('[TABLE]');
  });

  it('preserves headings, emphasis and lists', () => {
    const md = htmlToMarkdown('<h2>Cert</h2><p>To <strong>ABC</strong></p><ul><li>One</li></ul>');
    expect(md).toContain('## Cert');
    expect(md).toContain('To **ABC**');
    expect(md).toContain('- One');
  });
});

async function makePptx(): Promise<Buffer> {
  const zip = new JSZip();
  const slide = (t: string) =>
    `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`;
  zip.file('ppt/slides/slide1.xml', slide('Ownership: 51%'));
  zip.file('ppt/slides/slide2.xml', slide('Level 2'));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('pptxToMarkdown (hybrid path)', () => {
  it('renders each slide as a heading with bullets in order', async () => {
    const { markdown: md } = await pptxToMarkdown(await makePptx());
    expect(md).toContain('## Slide 1');
    expect(md).toContain('- Ownership: 51%');
    expect(md).toContain('## Slide 2');
    expect(md).toContain('- Level 2');
    expect(md.indexOf('## Slide 1')).toBeLessThan(md.indexOf('## Slide 2'));
  });
});
