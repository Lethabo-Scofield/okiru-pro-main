/**
 * Words inside a picture on a digital PDF page.
 *
 * A waste contractor's report had a text layer, so it was not a scan, but its
 * letterhead (the contractor's name, VAT and registration numbers) was a
 * picture: none of it was in the text, no OCR ran, and the agent was offered
 * page images for scanned documents only. Now the file reader notes which of
 * a digital PDF's first pages paint a picture, the agent may look at exactly
 * those page images, and a value quoted from the picture is accepted (it is
 * not in the text layer) and flagged for the reviewer. The model is a stub;
 * every document here is invented.
 */
import { describe, expect, it, vi } from 'vitest';
import { pdfPicturePages, rawExtractionInputFromUpload } from '../../src/services/fileExtraction.js';
import {
  agentDocumentFrom,
  agentTargetFor,
  mergeAgentValues,
  runAgentExtraction,
  validateSubmission,
  type AgentTarget,
} from '../../src/services/agentExtraction.js';
import type { AgentMessage, AgentTool, AgentToolCall, AgentTurn } from '../../src/services/agentModel.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

const TEXT_LINES = [
  'SITE REPORT - MATERIAL AND TREATMENT',
  'Customer: Acme Foods   Site: Depot North',
  'Period: 01/03/2026 to 31/03/2026',
  'Material      Treatment     Units',
  'Cardboard     Recycling     12 345.67',
  'Plastic       Recycling     1 234.5',
];

/** A one-page PDF: the text lines, and optionally an inline greyscale picture of the given size. */
function pdfWith(picture: { width: number; height: number } | null): Buffer {
  const text = TEXT_LINES.map((line, i) => `BT /F1 11 Tf 72 ${640 - i * 18} Td (${line}) Tj ET`).join('\n');
  let image = '';
  if (picture) {
    const bytesPerRow = Math.ceil(picture.width / 8);
    const data = String.fromCharCode(0xaa).repeat(bytesPerRow * picture.height);
    image = `\nq 200 0 0 60 72 700 cm\nBI /W ${picture.width} /H ${picture.height} /CS /G /BPC 1 ID ${data} EI\nQ`;
  }
  const stream = text + image;
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

const upload = (buffer: Buffer) => ({ buffer, originalname: 'invented-site-report.pdf', mimetype: 'application/pdf', size: buffer.length });

describe('pdfPicturePages', () => {
  it('names a digital page that paints a picture, and no page that does not', async () => {
    expect(await pdfPicturePages(pdfWith({ width: 160, height: 48 }))).toEqual([1]);
    expect(await pdfPicturePages(pdfWith(null))).toEqual([]);
  }, 30_000);

  it('a speck (a rule, a bullet, a spacer) is not a picture', async () => {
    expect(await pdfPicturePages(pdfWith({ width: 8, height: 8 }))).toEqual([]);
  }, 30_000);

  it('never throws on a file that is not a PDF', async () => {
    expect(await pdfPicturePages(Buffer.from('not a pdf'))).toEqual([]);
  });

  it('the upload read records the picture pages of a digital PDF', async () => {
    const withPicture = await rawExtractionInputFromUpload(upload(pdfWith({ width: 160, height: 48 })));
    expect(withPicture.raw_text).toContain('Customer: Acme Foods');
    expect(withPicture.metadata?.picture_pages).toEqual([1]);
    const plain = await rawExtractionInputFromUpload(upload(pdfWith(null)));
    expect(plain.metadata?.picture_pages).toBeUndefined();
  }, 30_000);
});

// ── the agent ────────────────────────────────────────────────────────────────

const WASTE = 'waste__contractor_report_safe_disposal_certificate';

function wasteTarget(): AgentTarget {
  const target = agentTargetFor(WASTE, 'esg');
  if (!target) throw new Error('waste target missing');
  return target;
}

function report(metadata: Record<string, unknown>): RawExtractionInput {
  return {
    file_id: 'r1',
    filename: 'invented-site-report.pdf',
    mime_type: 'application/pdf',
    raw_text: TEXT_LINES.join('\n'),
    markdown: ['## Page 1', '', ...TEXT_LINES].join('\n'),
    tables: [],
    metadata,
  };
}

let calls = 0;
function call(name: string, args: Record<string, unknown>): AgentToolCall {
  calls += 1;
  return { id: `c${calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function scripted(steps: AgentToolCall[][]): ExtractionModel & { seen: Array<{ messages: AgentMessage[]; tools: AgentTool[] }> } {
  const seen: Array<{ messages: AgentMessage[]; tools: AgentTool[] }> = [];
  let turn = 0;
  return {
    name: 'stub',
    seen,
    async complete() { return '{}'; },
    async completeWithTools(messages, tools): Promise<AgentTurn> {
      seen.push({ messages: structuredClone(messages), tools: structuredClone(tools) });
      const step = steps[Math.min(turn, steps.length - 1)];
      turn += 1;
      return { message: { role: 'assistant', content: null, tool_calls: step.map((c) => ({ ...c, id: `${c.id}_t${turn}` })) } };
    },
  };
}

const LETTERHEAD = 'EXAMPLE RECYCLING (PTY) LTD  VAT No 4123456789';
const fromLetterhead = { field: 'waste_contractor_name', value: 'EXAMPLE RECYCLING (PTY) LTD', page: 1, quote: LETTERHEAD };

describe('a picture on a digital page, for the agent', () => {
  it('only a page the reader marked as carrying a picture is offered, and only on a digital document', () => {
    expect(agentDocumentFrom(report({ picture_pages: [1, 'x', 0, 1] })).picturePages).toEqual([1]);
    expect(agentDocumentFrom(report({})).picturePages).toBeUndefined();
    expect(agentDocumentFrom(report({ scanned: true, picture_pages: [1] })).picturePages).toBeUndefined();
  });

  it('a quote from the picture is accepted only once that page image was shown', () => {
    const doc = agentDocumentFrom(report({ picture_pages: [1] }));
    const unseen = validateSubmission(fromLetterhead, wasteTarget(), doc);
    expect(unseen.ok).toBe(false);
    const seen = validateSubmission(fromLetterhead, wasteTarget(), doc, new Set([1]));
    expect(seen.ok && seen.value.fromPicture).toBe(true);
    // A page without a picture still needs its quote in the text.
    const plain = agentDocumentFrom(report({}));
    expect(validateSubmission(fromLetterhead, wasteTarget(), plain, new Set([1])).ok).toBe(false);
  });

  it('a quote the page text holds is an ordinary citation, not a picture read', () => {
    const doc = agentDocumentFrom(report({ picture_pages: [1] }));
    const result = validateSubmission(
      { field: 'site_name', value: 'Depot North', page: 1, quote: 'Site: Depot North' },
      wasteTarget(), doc, new Set([1]),
    );
    expect(result.ok && result.value.fromPicture).toBeUndefined();
  });

  it('offers get_page_image for the picture pages, reads the letterhead, and flags the value for the reviewer', async () => {
    const pageImage = vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo=');
    const model = scripted([
      [call('get_page_image', { page: 1 })],
      [call('submit_values', { values: [fromLetterhead] })],
    ]);
    const target = wasteTarget();
    const run = await runAgentExtraction(model, report({ picture_pages: [1] }), target, { pageImage });
    const imageTool = model.seen[0].tools.find((t) => t.function.name === 'get_page_image');
    expect(imageTool?.function.description).toMatch(/picture/);
    expect(pageImage).toHaveBeenCalledWith(1);
    expect(run.values.map((v) => v.field)).toEqual(['waste_contractor_name']);

    const merged = mergeAgentValues([], target, 'invented-site-report.pdf', run);
    const home = merged.extractions.find((e) => e.documentId === target.specId)!;
    expect(home.values.find((v) => v.field === 'waste_contractor_name')?.value).toBe('EXAMPLE RECYCLING (PTY) LTD');
    expect(home.exceptions.some((e) => /read from a picture on page 1/.test(e))).toBe(true);
  });

  it('a page without a picture is refused, and a digital document without pictures gets no image tool', async () => {
    const pageImage = vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo=');
    const twoPages: RawExtractionInput = { ...report({ picture_pages: [1] }), markdown: ['## Page 1', '', ...TEXT_LINES, '', '## Page 2', '', 'Signed'].join('\n') };
    const asks = scripted([[call('get_page_image', { page: 2 })], [call('submit_values', { values: [] })]]);
    await runAgentExtraction(asks, twoPages, wasteTarget(), { pageImage });
    expect(pageImage).not.toHaveBeenCalled();

    const plain = scripted([[call('submit_values', { values: [] })]]);
    await runAgentExtraction(plain, report({}), wasteTarget(), { pageImage });
    expect(plain.seen[0].tools.map((t) => t.function.name)).not.toContain('get_page_image');
  });
});
