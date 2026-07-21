import { createLogger } from '../logger.js';

/**
 * Image preprocessing for OCR.
 *
 * Tesseract's accuracy depends far more on the INPUT IMAGE than on any engine
 * setting. Scanned B-BBEE certificates arrive as low-contrast phone photos and
 * 150-DPI faxes, where glyphs blur into the background and small type falls below
 * the resolution Tesseract needs. The classic pipeline — greyscale, normalise
 * contrast, sharpen, upscale — recovers far more characters than swapping models.
 *
 * sharp is optional: if it cannot be loaded the original buffer is returned
 * unchanged, so OCR still runs (just without the accuracy boost).
 */

const logger = createLogger('ImagePreprocessing');

/**
 * Tesseract works best around 300 DPI. Images narrower than this are upscaled;
 * beyond it the extra pixels cost time without improving recognition.
 */
const TARGET_MIN_WIDTH = 2000;
const MAX_WIDTH = 4000;

export interface PreprocessResult {
  buffer: Buffer;
  applied: boolean;
  note?: string;
}

/**
 * Enhance an image for OCR. Never throws — on any failure the original buffer is
 * returned so extraction continues.
 */
export async function preprocessForOcr(input: Buffer): Promise<PreprocessResult> {
  // Type as the module's DEFAULT export (the callable factory), not the module
  // namespace — `typeof import('sharp')` is the namespace and is not callable.
  let sharp: (typeof import('sharp'))['default'];
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return { buffer: input, applied: false, note: 'sharp not installed' };
  }

  try {
    const image = sharp(input, { failOn: 'none' });
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;

    // Upscale small scans so small type clears Tesseract's recognition floor,
    // but never past MAX_WIDTH (diminishing returns, rising cost).
    const targetWidth = width > 0 && width < TARGET_MIN_WIDTH
      ? Math.min(Math.round(width * (TARGET_MIN_WIDTH / width)), MAX_WIDTH)
      : 0;

    let pipeline = image
      .rotate()                    // honour EXIF orientation — phone photos are often sideways
      .greyscale()                 // colour carries no signal for OCR and adds noise
      .toColourspace('b-w')        // force a single channel; greyscale() alone still writes RGB
      .normalise();                // stretch contrast so faded print separates from paper

    if (targetWidth > 0) {
      pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: false });
    }

    // Mild sharpen recovers edges softened by scanning/resizing. Deliberately not
    // binarising (threshold): it destroys faint stamps and low-contrast table
    // rules that carry real values on certificates.
    const buffer = await pipeline.sharpen().png().toBuffer();

    logger.info('Preprocessed image for OCR', {
      originalWidth: width,
      targetWidth: targetWidth || width,
      originalBytes: input.length,
      processedBytes: buffer.length,
    });

    return { buffer, applied: true };
  } catch (error) {
    logger.warn('Image preprocessing failed; using original buffer', { error: String(error) });
    return { buffer: input, applied: false, note: String(error) };
  }
}
