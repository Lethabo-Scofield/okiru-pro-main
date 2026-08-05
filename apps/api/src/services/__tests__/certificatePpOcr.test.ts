import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetPpOcrEngineForTests,
  isPpOcrEnabled,
  ppOcrRecognizeBuffer,
  ppOcrRecognizeFile,
} from '../certificatePpOcr.js';

describe('certificate PP-OCR provider gating', () => {
  const prev = process.env.CERT_OCR_PPOCR;

  beforeEach(() => {
    __resetPpOcrEngineForTests();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CERT_OCR_PPOCR;
    else process.env.CERT_OCR_PPOCR = prev;
    __resetPpOcrEngineForTests();
  });

  it('is disabled by default (no env var)', () => {
    delete process.env.CERT_OCR_PPOCR;
    expect(isPpOcrEnabled()).toBe(false);
  });

  it('recognises truthy flag values', () => {
    for (const v of ['1', 'true', 'YES', 'on', ' True ']) {
      process.env.CERT_OCR_PPOCR = v;
      expect(isPpOcrEnabled()).toBe(true);
    }
    for (const v of ['0', 'false', 'no', 'off', '']) {
      process.env.CERT_OCR_PPOCR = v;
      expect(isPpOcrEnabled()).toBe(false);
    }
  });

  it('returns empty text (no throw) when disabled — engine is never loaded', async () => {
    delete process.env.CERT_OCR_PPOCR;
    await expect(ppOcrRecognizeFile('nonexistent.png')).resolves.toBe('');
    await expect(ppOcrRecognizeBuffer(Buffer.from('not-an-image'))).resolves.toBe('');
  });
});
