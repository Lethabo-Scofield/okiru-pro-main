/**
 * The display label for a certificate whose text has not been extracted yet.
 *
 * After the registry sync, 2,951 certificates had storage metadata but no
 * supplierName, and every card read "Missing supplier name" — while the file
 * name itself carried the company. This is a display fallback only; it is never
 * written back to the registry or treated as a verified supplier name.
 */
import { describe, expect, it } from 'vitest';
import { labelFromFileName } from '../pages/CertificateHub';

describe('labelFromFileName', () => {
  it('strips the leading date and the trailing size', () => {
    expect(labelFromFileName('2027 01 12 Vital Distribution Solutions (Pty) Ltd - QSE.pdf'))
      .toBe('Vital Distribution Solutions (Pty) Ltd');
  });

  it('handles the EME and Generic suffixes', () => {
    expect(labelFromFileName('2026 01 01 BIBO WATER PTY LTD -EME.pdf')).toBe('BIBO WATER PTY LTD');
    expect(labelFromFileName('2026 01 05 Thembelihle Equipment (Pty) Ltd-Generic.pdf'))
      .toBe('Thembelihle Equipment (Pty) Ltd');
  });

  it('handles a non-compliant letter', () => {
    expect(labelFromFileName('2026 01 05 Tectra Automation (RF) (Pty) Ltd - Non-compliant Letter.pdf'))
      .toBe('Tectra Automation (RF) (Pty) Ltd');
  });

  it('leaves a name that follows no convention alone, minus its extension', () => {
    expect(labelFromFileName('some scanned document.pdf')).toBe('some scanned document');
  });

  it('never returns an empty label', () => {
    // A file that is nothing but a date would otherwise reduce to "".
    expect(labelFromFileName('2026 01 06.pdf')).toBe('2026 01 06.pdf');
  });
});
