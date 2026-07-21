import { describe, expect, it } from 'vitest';
import { decodeImageCodes, certificateNumberFromCodes, crossCheckCertificateNumber } from '../../parser/qrDecode.js';

describe('qrDecode seam', () => {
  it('no-ops safely when the optional decoder is not installed', async () => {
    await expect(decodeImageCodes(Buffer.from('not-an-image'))).resolves.toEqual([]);
  });

  it('extracts a certificate number from decoded QR text', () => {
    const codes = [{ text: 'https://verify.example/cert/BEE2026001234', format: 'QR_CODE' }];
    expect(certificateNumberFromCodes(codes)).toBe('BEE2026001234');
  });

  it('cross-checks OCR vs QR certificate numbers', () => {
    const codes = [{ text: 'BEE2026001234', format: 'QR_CODE' }];
    expect(crossCheckCertificateNumber('BEE2026001234', codes)).toBe('match');
    expect(crossCheckCertificateNumber('BEE2026009999', codes)).toBe('mismatch');
    expect(crossCheckCertificateNumber('anything', [])).toBe('no_qr');
  });
});
