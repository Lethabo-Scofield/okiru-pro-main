import { describe, expect, it } from 'vitest';
import { classifyPdfPages } from '../pipeline/extraction/visionPdfExtractor.js';

/**
 * Mixed scanned/digital documents are the real-world case: a digital contract
 * with a scanned certificate stapled in, or a photographed signature page. The
 * old whole-document check classified those as "digital" in aggregate, so the
 * scanned pages contributed empty text and their values were silently lost.
 */

// Comfortably over the 50-char scanned threshold.
const DIGITAL_TEXT =
  'B-BBEE CERTIFICATE Measured Entity Name: Real World Supplier (Pty) Ltd Level Four';
// A scanned page's text layer is empty or near-empty.
const SCANNED_TEXT = '   ';

describe('classifyPdfPages', () => {
  it('flags an all-digital document', () => {
    const result = classifyPdfPages([
      { pageNumber: 1, text: DIGITAL_TEXT },
      { pageNumber: 2, text: DIGITAL_TEXT },
    ]);
    expect(result.mode).toBe('all_digital');
    expect(result.scannedPages).toEqual([]);
    expect(result.digitalPages).toEqual([1, 2]);
  });

  it('flags an all-scanned document', () => {
    const result = classifyPdfPages([
      { pageNumber: 1, text: SCANNED_TEXT },
      { pageNumber: 2, text: '' },
    ]);
    expect(result.mode).toBe('all_scanned');
    expect(result.scannedPages).toEqual([1, 2]);
    expect(result.digitalPages).toEqual([]);
  });

  it('identifies exactly which pages are scanned in a mixed document', () => {
    const result = classifyPdfPages([
      { pageNumber: 1, text: DIGITAL_TEXT },
      { pageNumber: 2, text: SCANNED_TEXT },
      { pageNumber: 3, text: DIGITAL_TEXT },
      { pageNumber: 4, text: '' },
    ]);
    expect(result.mode).toBe('mixed');
    // The regression this guards: pages 2 and 4 must be routed to OCR, not
    // written off as digital just because the document is mostly digital.
    expect(result.scannedPages).toEqual([2, 4]);
    expect(result.digitalPages).toEqual([1, 3]);
  });

  it('does not let a mostly-digital document hide a single scanned page', () => {
    const pages = Array.from({ length: 9 }, (_, i) => ({ pageNumber: i + 1, text: DIGITAL_TEXT }));
    pages.push({ pageNumber: 10, text: '' });

    const result = classifyPdfPages(pages);
    expect(result.mode).toBe('mixed');
    expect(result.scannedPages).toEqual([10]);
  });

  it('reports per-page char counts for diagnostics', () => {
    const result = classifyPdfPages([{ pageNumber: 1, text: '  hello   world  ' }]);
    expect(result.pages[0].charCount).toBe('hello world'.length);
    expect(result.pages[0].kind).toBe('scanned'); // under the 50-char threshold
  });

  it('handles an empty document without throwing', () => {
    const result = classifyPdfPages([]);
    expect(result.mode).toBe('all_digital');
    expect(result.pages).toEqual([]);
  });
});
