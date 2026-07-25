/**
 * Client for an optional OCR sidecar — a vision model that transcribes scanned
 * pages, served behind an OpenAI-compatible API.
 *
 * WHY A SIDECAR RATHER THAN THE GENERAL MODEL: the scanned half of a B-BBEE
 * evidence pack (share certificates, affidavits, stamped registers, payroll
 * runs) is transcription work, and a general chat model does it expensively and
 * with a hard output ceiling — the Azure path caps at a few thousand tokens per
 * call however many pages it was shown. A purpose-built long-document OCR model
 * reads a whole document in one pass at constant memory, which is exactly the
 * shape of this problem.
 *
 * The reference implementation is Baidu's Unlimited-OCR (MIT, 3B MoE), served
 * with `vllm/vllm-openai:unlimited-ocr`. But nothing here is Baidu-specific
 * beyond one prompt convention: any OpenAI-compatible vision endpoint works,
 * so this is a capability the deployment can switch on, not a dependency.
 *
 * STRICTLY AN ENHANCEMENT. Every failure path returns null and the caller falls
 * back to the existing vision path. Unset PARSER_OCR_ENDPOINT = disabled =
 * today's behaviour, unchanged.
 *
 * Enable with:
 *   PARSER_OCR_ENDPOINT=http://unlimited-ocr:8000/v1   (required — off when unset)
 *   PARSER_OCR_MODEL=baidu/Unlimited-OCR               (default)
 *   PARSER_OCR_API_KEY=...                             (optional bearer)
 */
import { createLogger } from '../logger.js';

const logger = createLogger('OcrClient');

function endpoint(): string {
  return (process.env.PARSER_OCR_ENDPOINT ?? '').replace(/\/+$/, '');
}

function model(): string {
  return process.env.PARSER_OCR_MODEL ?? 'baidu/Unlimited-OCR';
}

function timeoutMs(): number {
  const configured = Number(process.env.PARSER_OCR_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 300_000;
}

export function isOcrSidecarEnabled(): boolean {
  return endpoint().length > 0;
}

/**
 * The prompt Unlimited-OCR is trained on. It has NO chat template and expects
 * the literal `<image>` prefix — without it the model returns nothing. Other
 * OpenAI-compatible servers ignore the prefix as ordinary text, so sending it
 * unconditionally is safe.
 */
const OCR_PROMPT = '<image>document parsing.';

/**
 * Strip the grounding tokens the DeepSeek-OCR lineage emits around recognised
 * text: `<|ref|>text<|/ref|><|det|>[[x,y,x,y]]<|/det|>`. The coordinates are a
 * layout artefact; the extraction prompts downstream consume markdown. Text
 * inside `<|ref|>` is KEPT — dropping the whole block would delete the content.
 */
export function unwrapGroundingTokens(raw: string): string {
  return raw
    .replace(/<\|det\|>.*?<\|\/det\|>/gs, '')
    .replace(/<\|ref\|>(.*?)<\|\/ref\|>/gs, '$1')
    .replace(/<\|grounding\|>/g, '')
    .replace(/<\|(?:begin|end)_of_(?:image|text)\|>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface OcrResult {
  markdown: string;
  pagesRead: number;
  model: string;
}

/**
 * Transcribe already-rasterised pages in ONE request.
 *
 * One request is the point: this model class keeps a flat KV cache across a
 * whole document, so page 40 is read with page 1 still in context — a share
 * register that runs over a page break stays one table. Returns null on any
 * failure so the caller can fall back.
 */
export async function transcribeWithOcrSidecar(
  pagesBase64: string[],
  filename: string,
): Promise<OcrResult | null> {
  if (!isOcrSidecarEnabled() || pagesBase64.length === 0) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.PARSER_OCR_API_KEY;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(`${endpoint()}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: model(),
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: OCR_PROMPT },
            ...pagesBase64.map((base64) => ({
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64}` },
            })),
          ],
        }],
        // The same scan must transcribe identically twice, or a score could move
        // between runs on identical evidence.
        temperature: 0,
        // No ceiling that could truncate a long document mid-table: the whole
        // reason for this path is that the general-model call had one.
        max_tokens: 32_768,
        // Unlimited-OCR emits grounding tokens as SPECIAL tokens; dropping them
        // server-side loses the text they wrap.
        skip_special_tokens: false,
        // Its decode recipe. Ignored by servers that do not know the field;
        // window 1024 is the multi-page/PDF setting.
        vllm_xargs: { ngram_size: 35, window_size: 1024 },
      }),
    });

    if (!response.ok) {
      logger.warn('OCR sidecar rejected the request; falling back', {
        filename,
        status: response.status,
        detail: (await response.text().catch(() => '')).slice(0, 200),
      });
      return null;
    }

    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const markdown = unwrapGroundingTokens(body.choices?.[0]?.message?.content ?? '');
    if (!markdown) {
      logger.warn('OCR sidecar returned no content; falling back', { filename });
      return null;
    }

    logger.info('Scanned document transcribed by OCR sidecar', {
      filename,
      pages: pagesBase64.length,
      characters: markdown.length,
      model: model(),
    });
    return { markdown, pagesRead: pagesBase64.length, model: model() };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    logger.warn(aborted ? 'OCR sidecar timed out; falling back' : 'OCR sidecar failed; falling back', {
      filename,
      error: String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
