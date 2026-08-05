/**
 * measureFreeOcrCoverage — "measure before cut" for dropping paid Azure Document Intelligence.
 *
 * Samples real certificate blobs from the Azure `clients-certs` container and runs the
 * extraction pipeline with Azure DI FORCED OFF, so it exercises exactly the FREE path
 * (pdf.js selectable-text -> tesseract.js OCR). It reports how the corpus splits:
 *
 *   - pdf_text : born-digital PDFs read for free, no OCR needed
 *   - ppocr/ocr: scans that needed (free, local) OCR
 *   - none/failed/text_too_short : the free path could NOT read it (these are the cases
 *     that today only Azure DI might rescue — the risk of removing it)
 *
 * Privacy: runs locally, sends nothing out, and never prints certificate text/PII —
 * only per-file extraction mode, status, text length, and generic field signals.
 *
 * Run (from apps/api):
 *   node ../../node_modules/tsx/dist/cli.mjs scripts/measureFreeOcrCoverage.ts [sampleSize]
 * Env: SAMPLE (overrides sampleSize), PER_FILE_TIMEOUT_MS (default 90000).
 */
import 'dotenv/config';

// Force the paid OCR off BEFORE importing the pipeline (module reads these at load time).
delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

const { extractCertificateTextFromBuffer, getTextExtractionDependencies } = await import(
  '../src/services/certificateTextExtractionJob.js'
);
const { getCertBlobServiceClient, getCertContainerClient, getCertBlobContainerName } = await import(
  '../src/services/azureCertStorage.js'
);

const SAMPLE = Number(process.env.SAMPLE ?? process.argv[2] ?? 20);
const PER_FILE_TIMEOUT_MS = Number(process.env.PER_FILE_TIMEOUT_MS ?? 90_000);
const SUPPORTED = ['pdf', 'png', 'jpg', 'jpeg'];

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(onTimeout()), ms))]);
}

// Generic B-BBEE signals — do we get text a field-extractor could actually use?
function fieldSignals(text: string) {
  return {
    level: /level\s*(one|two|three|four|five|six|seven|eight|[1-8])/i.test(text),
    percent: /\d{1,3}(?:\.\d+)?\s*%/.test(text),
    year: /\b20\d{2}\b/.test(text),
  };
}

async function main() {
  const svc = getCertBlobServiceClient();
  if (!svc) {
    console.error('No cert blob connection configured (AZURE_CERT_STORAGE_CONNECTION_STRING). Aborting.');
    process.exit(1);
  }
  const container = getCertContainerClient(svc);
  console.log(`Container: ${getCertBlobContainerName()}`);
  console.log('Deps (Azure DI forced OFF):', getTextExtractionDependencies());

  // Collect blob names (cap the scan), then evenly sample across the corpus for spread.
  const names: string[] = [];
  const SCAN_CAP = 3000;
  for await (const b of container.listBlobsFlat()) {
    const ext = b.name.split('.').pop()?.toLowerCase() ?? '';
    if (SUPPORTED.includes(ext)) names.push(b.name);
    if (names.length >= SCAN_CAP) break;
  }
  if (names.length === 0) {
    console.error('No supported certificate blobs found.');
    process.exit(1);
  }
  const step = Math.max(1, Math.floor(names.length / SAMPLE));
  const sample = [];
  for (let i = 0; i < names.length && sample.length < SAMPLE; i += step) sample.push(names[i]);
  console.log(`Scanned ${names.length} blobs; testing an even sample of ${sample.length}.\n`);

  const tally: Record<string, number> = {};
  const statusTally: Record<string, number> = {};
  let usable = 0, signalUsable = 0, totalLen = 0;
  const secsAll: number[] = [];
  const secsOcr: number[] = [];

  for (let i = 0; i < sample.length; i++) {
    const name = sample[i];
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const label = `#${String(i + 1).padStart(2, '0')}/${sample.length} (.${ext})`;
    const t0 = Date.now();
    try {
      const buf = await container.getBlockBlobClient(name).downloadToBuffer();
      const r = await withTimeout(
        extractCertificateTextFromBuffer(Buffer.from(buf), name),
        PER_FILE_TIMEOUT_MS,
        () => ({ text: '', status: 'failed' as const, mode: 'failed' as const, extractedTextLength: 0, failureReason: 'timeout', failureReasons: ['timeout'] }),
      );
      tally[r.mode] = (tally[r.mode] ?? 0) + 1;
      statusTally[r.status] = (statusTally[r.status] ?? 0) + 1;
      totalLen += r.extractedTextLength;
      const ok = r.status === 'completed';
      if (ok) usable++;
      const sig = fieldSignals(r.text);
      const sigCount = Number(sig.level) + Number(sig.percent) + Number(sig.year);
      if (ok && sigCount >= 2) signalUsable++;
      const secs = (Date.now() - t0) / 1000;
      secsAll.push(secs);
      if (r.mode === 'ocr' || r.mode === 'ppocr') secsOcr.push(secs);
      process.stdout.write(`${label}  mode=${r.mode.padEnd(22)} status=${r.status.padEnd(14)} len=${String(r.extractedTextLength).padStart(6)}  signals=${sigCount}/3  ${secs.toFixed(1)}s\n`);
    } catch (err: any) {
      tally['download_error'] = (tally['download_error'] ?? 0) + 1;
      process.stdout.write(`${label}  ERROR ${err?.message || String(err)}\n`);
    }
  }
  const n = sample.length;
  const pct = (x: number) => `${Math.round((x / n) * 100)}%`;
  console.log('\n===== FREE-PATH COVERAGE (Azure DI removed) =====');
  console.log(`Sample size:            ${n}`);
  console.log(`Extraction mode split:  ${JSON.stringify(tally)}`);
  console.log(`Status split:           ${JSON.stringify(statusTally)}`);
  console.log(`Usable text (completed):${usable}/${n}  (${pct(usable)})`);
  console.log(`...and field-usable:    ${signalUsable}/${n}  (${pct(signalUsable)})  [>=2 of level/percent/year]`);
  console.log(`Avg text length:        ${Math.round(totalLen / n)} chars`);
  const stat = (arr: number[]) => {
    if (!arr.length) return 'n/a';
    const s = [...arr].sort((a, b) => a - b);
    const p = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    return `min ${s[0].toFixed(1)}s  median ${p(0.5).toFixed(1)}s  avg ${avg.toFixed(1)}s  p95 ${p(0.95).toFixed(1)}s  max ${s[s.length - 1].toFixed(1)}s`;
  };
  console.log(`\nSpeed per cert (all):   ${stat(secsAll)}`);
  console.log(`Speed per cert (OCR'd): ${stat(secsOcr)}   (n=${secsOcr.length}; digital certs are ~instant)`);
  const digital = tally['pdf_text'] ?? 0;
  const ocr = (tally['ocr'] ?? 0) + (tally['ppocr'] ?? 0);
  const missed = n - usable;
  console.log('\nInterpretation:');
  console.log(`  born-digital, no OCR needed:  ${digital}/${n} (${pct(digital)})`);
  console.log(`  scans rescued by free OCR:    ${ocr}/${n} (${pct(ocr)})`);
  console.log(`  free path could NOT read:     ${missed}/${n} (${pct(missed)})  <- the only cases Azure DI might help`);
}

main().catch((e) => { console.error(e); process.exit(1); });
