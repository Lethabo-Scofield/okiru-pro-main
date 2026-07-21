import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { preprocessForOcr } from '../../src/services/imagePreprocessing.js';

/**
 * Preprocessing is the biggest OCR accuracy lever (greyscale + contrast +
 * upscale). These tests prove it actually transforms the image and, critically,
 * that it NEVER throws — a preprocessing failure must degrade to the original
 * buffer rather than break extraction.
 */

/** A small, low-contrast colour image standing in for a poor phone scan. */
async function makeSmallColourImage(width = 400, height = 200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 175, b: 170 } },
  })
    .png()
    .toBuffer();
}

describe('preprocessForOcr', () => {
  it('upscales a small image toward the OCR-friendly target width', async () => {
    const original = await makeSmallColourImage(400, 200);
    const { buffer, applied } = await preprocessForOcr(original);

    expect(applied).toBe(true);
    const meta = await sharp(buffer).metadata();
    // 400px is far below Tesseract's comfortable range — it must be enlarged.
    expect(meta.width).toBeGreaterThan(400);
    expect(meta.width).toBeLessThanOrEqual(4000);
  });

  it('converts to a single greyscale channel', async () => {
    const { buffer } = await preprocessForOcr(await makeSmallColourImage());
    const meta = await sharp(buffer).metadata();
    expect(meta.channels).toBe(1);
  });

  it('does not upscale an already-large image past the cap', async () => {
    const large = await makeSmallColourImage(3000, 1000);
    const { buffer, applied } = await preprocessForOcr(large);

    expect(applied).toBe(true);
    const meta = await sharp(buffer).metadata();
    // Already above the target: width is preserved, not inflated.
    expect(meta.width).toBe(3000);
  });

  it('returns the original buffer instead of throwing on a non-image', async () => {
    const garbage = Buffer.from('this is definitely not an image');
    const { buffer, applied } = await preprocessForOcr(garbage);

    expect(applied).toBe(false);
    expect(buffer).toEqual(garbage);
  });
});
