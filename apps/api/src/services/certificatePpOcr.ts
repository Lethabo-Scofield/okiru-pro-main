/**
 * PP-OCR (Baidu PaddleOCR) certificate OCR provider — runs fully in-process
 * via onnxruntime-node, using the bundled PP-OCR models from `@gutenye/ocr-models`.
 *
 * Free and offline: no API keys, no per-page cost, and certificate bytes never
 * leave the host (unlike the Azure DI / any cloud OCR path).
 *
 * This is a drop-in alternative to the tesseract.js fallback in
 * `certificateTextExtractionJob.ts`. It is OFF by default and only engages when
 * `CERT_OCR_PPOCR` is truthy, so the existing pipeline is untouched unless opted in.
 *
 * The `@gutenye/ocr-node` package (and its native onnxruntime binary) is imported
 * dynamically inside a try/catch — exactly like the Azure Form Recognizer path —
 * so the API process still boots cleanly when the package or its models are absent.
 */
import { createHash } from 'crypto';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createLogger } from '../logger.js';

const logger = createLogger('CertPpOcr');
const PP_TMP_DIR = join(tmpdir(), 'cert-ppocr');

/** Opt-in flag. OFF unless CERT_OCR_PPOCR is 1/true/yes/on. */
export function isPpOcrEnabled(): boolean {
  const v = (process.env.CERT_OCR_PPOCR ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

// Cached engine promise so models load once per process. `null` = unavailable.
let enginePromise: Promise<PpOcrEngine | null> | null = null;

type PpOcrEngine = { detect: (imagePath: string, options?: unknown) => Promise<unknown> };

async function getEngine(): Promise<PpOcrEngine | null> {
  if (!isPpOcrEnabled()) return null;
  if (!enginePromise) {
    enginePromise = (async () => {
      try {
        // Indirect specifier + dynamic import: the app typechecks and boots even
        // when this optional, heavy native package isn't installed in a given deploy.
        const specifier = '@gutenye/ocr-node';
        const mod: any = await import(specifier);
        const Ocr = mod?.default ?? mod?.Ocr ?? mod;
        if (!Ocr || typeof Ocr.create !== 'function') {
          logger.warn('PP-OCR package present but Ocr.create not found; falling back');
          return null;
        }
        const engine = (await Ocr.create()) as PpOcrEngine; // defaults to @gutenye/ocr-models
        logger.info('PP-OCR (Baidu PaddleOCR via onnxruntime) initialised');
        return engine;
      } catch (err: any) {
        logger.warn('PP-OCR unavailable; will use tesseract fallback', {
          error: err?.message || String(err),
        });
        return null;
      }
    })();
  }
  return enginePromise;
}

/** Normalise the various result shapes `detect` can return into plain text. */
function resultToText(result: unknown): string {
  const lines: unknown[] = Array.isArray(result)
    ? result
    : (result as any)?.texts ?? (result as any)?.lines ?? (result as any)?.results ?? [];
  return lines
    .map((l) => (typeof l === 'string' ? l : (l as any)?.text ?? ''))
    .join('\n')
    .trim();
}

/** OCR a single image file (PNG/JPG) with PP-OCR. Returns '' when unavailable or on error. */
export async function ppOcrRecognizeFile(imagePath: string): Promise<string> {
  const engine = await getEngine();
  if (!engine) return '';
  try {
    const result = await engine.detect(imagePath);
    return resultToText(result);
  } catch (err: any) {
    logger.warn('PP-OCR detect failed', { imagePath, error: err?.message || String(err) });
    return '';
  }
}

/** OCR a raw image buffer with PP-OCR by staging it to a temp file. */
export async function ppOcrRecognizeBuffer(buffer: Buffer, ext = 'png'): Promise<string> {
  const engine = await getEngine();
  if (!engine) return '';
  const workDir = join(PP_TMP_DIR, createHash('sha1').update(buffer).digest('hex').slice(0, 16));
  const imagePath = join(workDir, `image.${ext}`);
  try {
    mkdirSync(workDir, { recursive: true });
    writeFileSync(imagePath, buffer);
    return await ppOcrRecognizeFile(imagePath);
  } catch (err: any) {
    logger.warn('PP-OCR buffer OCR failed', { error: err?.message || String(err) });
    return '';
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

/** Reset the cached engine — test-only. */
export function __resetPpOcrEngineForTests(): void {
  enginePromise = null;
}
