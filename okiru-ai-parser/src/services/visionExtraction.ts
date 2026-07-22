/**
 * Read scanned documents with the multimodal model.
 *
 * WHY THIS EXISTS: five PDFs in the real Thandanani pack have no text layer at
 * all — 0, 0, 0, 4 and 28 characters. Two of them (the Share Certificate and the
 * Share Register) carry the entire 25-point Ownership case. They are page
 * images, so there is nothing to parse; the pages have to be LOOKED at.
 *
 * Azure Document Intelligence would be the purpose-built tool, but it is not
 * provisioned on this subscription (the deployment references the secret keys,
 * the secret has none). gpt-4o IS deployed and is multimodal, so pages are
 * rasterised and shown to it.
 *
 * DESIGN
 *  - Returns null on every failure path. A vision outage must degrade quality,
 *    never take uploads down.
 *  - Bounded: MAX_VISION_PAGES caps cost and latency on a 300-page pack. Scanned
 *    evidence documents are short; a 300-page scan is a pathological upload, not
 *    a certificate.
 *  - Asks for markdown, because that is what the extraction prompts consume, and
 *    tables (share registers, spend schedules) must keep their grid.
 */
import { createLogger } from '../logger.js';

const logger = createLogger('VisionExtraction');

/** Pages beyond this are ignored — cost and latency guard. */
const MAX_VISION_PAGES = 12;
/** 150 DPI is enough for stamped/handwritten certificates without huge payloads. */
const RENDER_DPI = 150;
const RENDER_WIDTH = 1700;

const SYSTEM_PROMPT = [
  'You transcribe scanned South African B-BBEE verification documents.',
  'Return the document as GitHub-flavoured markdown.',
  'Rules:',
  '- Transcribe ONLY what is visibly present. Never infer, complete or invent a value.',
  '- Preserve tables as markdown tables. Share registers and spend schedules are tables; their grid carries the meaning.',
  '- Keep headings, labels and their values together (e.g. "Registration Number: 2006/037260/23").',
  '- Preserve numbers, percentages and dates exactly as printed, including spaces in amounts (R4 157 140).',
  '- If a value is illegible, write [illegible] rather than guessing.',
  '- Output only the transcription. No commentary.',
].join('\n');

export interface VisionExtractionResult {
  markdown: string;
  pagesRead: number;
  truncated: boolean;
}

export function visionExtractionConfigured(): boolean {
  return Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY);
}

/**
 * Rasterise the first pages of a PDF to base64 PNGs.
 * Requires ghostscript + graphicsmagick (installed in the runtime image).
 */
async function pdfPagesToBase64(buffer: Buffer, maxPages: number): Promise<string[]> {
  const { fromBuffer } = await import('pdf2pic');
  const convert = fromBuffer(buffer, {
    density: RENDER_DPI,
    format: 'png',
    width: RENDER_WIDTH,
    preserveAspectRatio: true,
  });

  const images: string[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    try {
      const rendered = await convert(page, { responseType: 'base64' });
      const base64 = (rendered as { base64?: string }).base64;
      if (!base64) break;
      images.push(base64);
    } catch {
      // Past the last page, or one unrenderable page — keep what we have rather
      // than losing the whole document.
      break;
    }
  }
  return images;
}

/**
 * Transcribe a scanned PDF. Returns null when unconfigured, unrenderable, or on
 * any model failure.
 */
export async function extractScannedPdfWithVision(
  buffer: Buffer,
  filename: string,
): Promise<VisionExtractionResult | null> {
  if (!visionExtractionConfigured()) return null;

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, '');
  const apiKey = process.env.AZURE_OPENAI_API_KEY!;
  const deployment = process.env.AZURE_MODEL_DEPLOYMENT ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview';

  let images: string[];
  try {
    images = await pdfPagesToBase64(buffer, MAX_VISION_PAGES);
  } catch (err) {
    logger.warn('Could not rasterise PDF for vision extraction', {
      filename,
      reason: (err as Error).message,
    });
    return null;
  }

  if (images.length === 0) {
    logger.warn('PDF produced no renderable pages', { filename });
    return null;
  }

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: `Transcribe this document (${images.length} page(s)): ${filename}` },
    ...images.map((base64) => ({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' },
    })),
  ];

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        // Deterministic: the same scan must transcribe the same way twice, or a
        // score could move between runs on identical evidence.
        temperature: 0,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      logger.warn('Vision transcription rejected', {
        filename,
        status: response.status,
        detail: (await response.text().catch(() => '')).slice(0, 200),
      });
      return null;
    }

    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const markdown = body.choices?.[0]?.message?.content?.trim() ?? '';
    if (!markdown) {
      logger.warn('Vision transcription returned no content', { filename });
      return null;
    }

    logger.info('Scanned document transcribed with vision', {
      filename,
      pages: images.length,
      characters: markdown.length,
      model: deployment,
    });

    return {
      markdown,
      pagesRead: images.length,
      truncated: images.length >= MAX_VISION_PAGES,
    };
  } catch (err) {
    logger.error('Vision transcription failed', err as Error);
    return null;
  }
}
