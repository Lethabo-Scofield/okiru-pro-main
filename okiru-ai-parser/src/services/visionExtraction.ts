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
import { isOcrSidecarEnabled, transcribeWithOcrSidecar } from './ocrClient.js';

const logger = createLogger('VisionExtraction');

/**
 * Pages beyond this are not transcribed.
 *
 * Was 12, which silently stopped at roughly page 12 of a scanned pack and
 * reported the rest as absent — the same silent-truncation bug fixed in the text
 * path. Raised because cost is explicitly not the constraint here: an evidence
 * pack that is genuinely 60 pages of scans should be READ, and a scanned share
 * register is worth far more than the tokens it costs.
 *
 * The remaining ceiling exists only to stop a pathological upload running
 * unbounded, and when it bites it is REPORTED via `truncated`, never silent.
 */
function maxVisionPages(): number {
  const configured = Number(process.env.PARSER_MAX_VISION_PAGES);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 60;
}
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
  /** Which path read it — the OCR sidecar, or the general vision model. */
  engine?: string;
}

export function visionExtractionConfigured(): boolean {
  return Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY)
    || isOcrSidecarEnabled();
}

/**
 * Pages per general-model call.
 *
 * The general vision path has a hard OUTPUT ceiling per call (a few thousand
 * tokens). Showing it 60 pages and asking for one transcription therefore
 * truncated the document mid-table and reported success — the silent-truncation
 * class again, this time in the scanned path. Pages are batched so the ceiling
 * is per-batch, and a batch that still hits it is REPORTED.
 *
 * The OCR sidecar has no such ceiling and reads every page in one pass, so this
 * applies only to the fallback.
 */
function pagesPerVisionCall(): number {
  const configured = Number(process.env.PARSER_VISION_PAGES_PER_CALL);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 2;
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
      const base64 = normaliseBase64((rendered as { base64?: string }).base64);
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

/** PNG magic bytes, base64-encoded — every PNG's payload starts with this. */
const PNG_BASE64_PREFIX = 'iVBORw0KGgo';

/**
 * pdf2pic's `base64` field is not consistently shaped: depending on version it
 * is either raw base64 or a full `data:image/png;base64,...` URI, and it can
 * carry line breaks. Re-wrapping a data URI produces
 * `data:image/png;base64,data:image/png;base64,...`, which Azure rejects with
 * "You uploaded an unsupported image" — the exact failure seen in production on
 * the Thandanani share certificate.
 */
function normaliseBase64(value: string | undefined): string | null {
  if (!value) return null;

  const withoutPrefix = value.includes('base64,') ? value.slice(value.lastIndexOf('base64,') + 7) : value;
  const compact = withoutPrefix.replace(/\s+/g, '');
  if (compact.length < 100) return null;

  if (!compact.startsWith(PNG_BASE64_PREFIX)) {
    // Usually benign: past the last page, ghostscript returns its own message
    // ("Requested FirstPage is greater than the number of pages") which pdf2pic
    // hands back in the base64 field. Treated as end-of-document, not an error.
    logger.debug('Rendered page is not a PNG — treating as end of document', {
      leading: compact.slice(0, 12),
    });
    return null;
  }
  return compact;
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

  let images: string[];
  try {
    images = await pdfPagesToBase64(buffer, maxVisionPages());
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

  const pageTruncated = images.length >= maxVisionPages();

  // The purpose-built OCR path first: it reads every page in ONE pass with no
  // output ceiling, so a register spanning a page break stays one table.
  const viaSidecar = await transcribeWithOcrSidecar(images, filename);
  if (viaSidecar) {
    return {
      markdown: viaSidecar.markdown,
      pagesRead: viaSidecar.pagesRead,
      truncated: pageTruncated,
      engine: viaSidecar.model,
    };
  }

  return transcribeWithGeneralModel(images, filename, pageTruncated);
}

/**
 * Fallback: the general multimodal deployment, one call per small batch of
 * pages so the per-call output ceiling cannot silently swallow a long document.
 */
async function transcribeWithGeneralModel(
  images: string[],
  filename: string,
  pageTruncated: boolean,
): Promise<VisionExtractionResult | null> {
  if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_API_KEY) return null;

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, '');
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_MODEL_DEPLOYMENT ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview';
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const batchSize = pagesPerVisionCall();
  const sections: string[] = [];
  let outputTruncated = false;
  let pagesRead = 0;

  for (let start = 0; start < images.length; start += batchSize) {
    const batch = images.slice(start, start + batchSize);
    const firstPage = start + 1;
    const lastPage = start + batch.length;

    const content: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: `Transcribe page${batch.length > 1 ? 's' : ''} ${firstPage}${lastPage > firstPage ? `-${lastPage}` : ''} of ${images.length}: ${filename}`,
      },
      ...batch.map((base64) => ({
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
        logger.warn('Vision transcription rejected for a page batch', {
          filename,
          pages: `${firstPage}-${lastPage}`,
          status: response.status,
          detail: (await response.text().catch(() => '')).slice(0, 200),
        });
        continue;
      }

      const body = await response.json() as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };
      const choice = body.choices?.[0];
      const markdown = choice?.message?.content?.trim() ?? '';
      if (!markdown) continue;

      // A batch that hit the output ceiling lost text. Report it — a scanned
      // page silently half-read is indistinguishable from a page that is short.
      if (choice?.finish_reason === 'length') {
        outputTruncated = true;
        logger.warn('Vision transcription hit the output ceiling for a page batch', {
          filename,
          pages: `${firstPage}-${lastPage}`,
        });
      }

      sections.push(markdown);
      pagesRead += batch.length;
    } catch (err) {
      logger.error('Vision transcription failed for a page batch', err as Error);
    }
  }

  if (sections.length === 0) {
    logger.warn('Vision transcription returned no content', { filename });
    return null;
  }

  logger.info('Scanned document transcribed with vision', {
    filename,
    pages: pagesRead,
    batches: Math.ceil(images.length / batchSize),
    characters: sections.join('').length,
    model: deployment,
    outputTruncated,
  });

  return {
    markdown: sections.join('\n\n'),
    pagesRead,
    truncated: pageTruncated || outputTruncated,
    engine: deployment,
  };
}
