import { describe, expect, it } from 'vitest';
import { startsLibraryRead } from '../parserDocuments.js';

describe('the document-reading switch on the library routes', () => {
  it('stops the upload and every re-read, and nothing else', () => {
    for (const path of ['/upload', '/abc123/reparse', '/abc123/reread', '/abc123/reread/quote']) {
      expect(startsLibraryRead('POST', path), path).toBe(true);
    }
    expect(startsLibraryRead('GET', '/')).toBe(false);
    expect(startsLibraryRead('GET', '/abc123/download')).toBe(false);
    expect(startsLibraryRead('POST', '/abc123/runs')).toBe(false);
    expect(startsLibraryRead('PATCH', '/abc123')).toBe(false);
  });
});
