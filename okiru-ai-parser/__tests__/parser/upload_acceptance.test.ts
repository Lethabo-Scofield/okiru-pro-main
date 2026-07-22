/**
 * What we accept for upload.
 *
 * Judging on the declared MIME type alone rejected real client workbooks: every
 * BEE Information Gathering file is .xlsm, and browsers and curl frequently
 * declare those as application/octet-stream. In production that surfaced as a
 * 500 on the single most common upload there is.
 */
import { describe, expect, it } from 'vitest';
import { isSupportedUpload, SUPPORTED_UPLOAD_MIME_TYPES } from '../../src/services/fileExtraction.js';

describe('upload acceptance', () => {
  it('accepts macro-enabled Excel by its own MIME type', () => {
    expect(SUPPORTED_UPLOAD_MIME_TYPES.has('application/vnd.ms-excel.sheet.macroEnabled.12')).toBe(true);
    expect(isSupportedUpload('application/vnd.ms-excel.sheet.macroEnabled.12', 'gathering.xlsm')).toBe(true);
  });

  it('accepts a correct file that arrives as application/octet-stream', () => {
    // The production failure: real .xlsm, generic declared type, hard rejection.
    expect(isSupportedUpload('application/octet-stream', 'BEE Information Gathering File.xlsm')).toBe(true);
    expect(isSupportedUpload('application/octet-stream', 'certificate.pdf')).toBe(true);
    expect(isSupportedUpload('application/octet-stream', 'deck.pptx')).toBe(true);
  });

  it('still accepts the ordinary declared types', () => {
    expect(isSupportedUpload('application/pdf', 'a.pdf')).toBe(true);
    expect(isSupportedUpload('text/csv', 'spend.csv')).toBe(true);
    expect(isSupportedUpload('image/png', 'scan.png')).toBe(true);
  });

  it('still refuses what we genuinely cannot read', () => {
    // The extension fallback must not become a way in for anything at all.
    expect(isSupportedUpload('application/x-msdownload', 'malware.exe')).toBe(false);
    expect(isSupportedUpload('application/octet-stream', 'archive.zip')).toBe(false);
    expect(isSupportedUpload('application/octet-stream', 'noextension')).toBe(false);
  });

  it('is case-insensitive about the extension', () => {
    expect(isSupportedUpload('application/octet-stream', 'GATHERING.XLSM')).toBe(true);
  });
});
