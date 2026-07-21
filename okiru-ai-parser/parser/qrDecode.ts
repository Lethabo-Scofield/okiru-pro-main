/**
 * QR / barcode decoding for certificates — an OCR-proof cross-check.
 *
 * SANAS-accredited B-BBEE certificates carry a verification QR/barcode encoding
 * the certificate number (and often a verification URL). Decoding it gives a
 * GROUND-TRUTH anchor no OCR error can corrupt, to validate the OCR'd certificate
 * number against.
 *
 * STATUS: integration seam. Real decoding needs two deps not yet installed:
 *   - `zxing-wasm` (Apache-2.0) — the decoder
 *   - an image decoder (`sharp`) to turn a PNG/JPEG/PDF-page into pixel data
 * Until they are installed this module NO-OPS (returns no codes) so the pipeline
 * never breaks. Once installed, implement `decodeImage` below; callers already
 * handle the empty result. Install:  pnpm add zxing-wasm sharp
 */

export interface DecodedCode {
  text: string;
  format: string;
}

/** True once the optional decoder deps are installed and wired in. */
let decoderAvailable: boolean | null = null;

async function loadDecoder(): Promise<unknown | null> {
  if (decoderAvailable === false) return null;
  try {
    // Variable specifier so TypeScript does not require the (optional) module to
    // exist at build time; resolves at runtime only when installed.
    const moduleName = 'zxing-wasm';
    const mod = await import(moduleName);
    decoderAvailable = true;
    return mod;
  } catch {
    decoderAvailable = false;
    return null;
  }
}

/**
 * Decode any QR/barcodes in an image buffer (PNG/JPEG). Returns [] when the
 * optional decoder is not installed or nothing is found — never throws, so it is
 * safe to call unconditionally in the extraction path.
 */
export async function decodeImageCodes(_imageBuffer: Buffer): Promise<DecodedCode[]> {
  const decoder = await loadDecoder();
  if (!decoder) return [];
  // TODO(zxing): decode `_imageBuffer` via sharp → ImageData → zxing-wasm
  // readBarcodes(), mapping results to { text, format }. Left unimplemented until
  // the deps land so we never ship code that silently pretends to have run.
  return [];
}

/** Pull a B-BBEE certificate number out of decoded QR text, if present. */
export function certificateNumberFromCodes(codes: DecodedCode[]): string | null {
  for (const code of codes) {
    const match = code.text.match(/\b([A-Z]{2,}\d{3,}[A-Z0-9-]*)\b/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Cross-check: does the QR-decoded certificate number agree with the OCR'd one?
 * Returns 'match' | 'mismatch' | 'no_qr' so callers can raise confidence on a
 * match and flag on a mismatch.
 */
export function crossCheckCertificateNumber(
  ocrNumber: string | null,
  codes: DecodedCode[],
): 'match' | 'mismatch' | 'no_qr' {
  const qrNumber = certificateNumberFromCodes(codes);
  if (!qrNumber) return 'no_qr';
  if (!ocrNumber) return 'mismatch';
  const norm = (s: string) => s.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return norm(qrNumber) === norm(ocrNumber) ? 'match' : 'mismatch';
}
