/**
 * Eval fixtures.
 *
 * Two sources:
 *  1. SEEDED — synthetic-but-realistic documents defined in code (text certs,
 *     affidavit, a generated supplier workbook, a generated deck). These give a
 *     working baseline immediately and never depend on binary files in the repo.
 *  2. DISCOVERED — real files dropped into `__tests__/eval/fixtures/` alongside a
 *     `<name>.expected.json` sidecar. Drop a real scanned certificate + its
 *     expected values and it joins the scorecard automatically.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, basename } from 'node:path';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type { EvalFixture } from './harness.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(here, 'fixtures');

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain',
};

function textFixture(name: string, lines: string[], expected: EvalFixture['expected']): EvalFixture {
  return { name, input: { kind: 'text', raw_text: lines.join('\n') }, expected };
}

/** Build an .xlsx buffer from a header + rows so we can test the workbook path. */
function makeWorkbook(sheetName: string, aoa: Array<Array<string | number>>): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Build a minimal valid .pptx buffer with one text run per paragraph. */
async function makeDeck(slides: string[][]): Promise<Buffer> {
  const zip = new JSZip();
  slides.forEach((paras, i) => {
    const body = paras
      .map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`)
      .join('');
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p">${body}</p:sld>`);
  });
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** Discover real files + their expected sidecars from the fixtures dir. */
function discoverFixtures(): EvalFixture[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  const found: EvalFixture[] = [];
  for (const entry of readdirSync(FIXTURES_DIR)) {
    const ext = extname(entry).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) continue; // skip the .expected.json sidecars and anything unsupported
    const stem = basename(entry, ext);
    const sidecar = join(FIXTURES_DIR, `${stem}.expected.json`);
    if (!existsSync(sidecar)) continue; // a doc without expectations can't be scored
    const buffer = readFileSync(join(FIXTURES_DIR, entry));
    const expected = JSON.parse(readFileSync(sidecar, 'utf8')) as EvalFixture['expected'];
    found.push({
      name: `real:${entry}`,
      input: { kind: 'upload', file: { buffer, originalname: entry, mimetype: mime, size: buffer.length } },
      expected,
    });
  }
  return found;
}

export async function loadFixtures(): Promise<EvalFixture[]> {
  const seeded: EvalFixture[] = [
    textFixture(
      'digital_bbee_certificate',
      [
        'B-BBEE CERTIFICATE',
        'Measured Entity Name: Real World Supplier (Pty) Ltd',
        'Registration No: 2019/111222/07',
        'B-BBEE Status Level: Level Four',
        'Black Ownership: 56.5%',
        'Expiry Date: 30 June 2027',
      ],
      {
        '@document_type': 'B-BBEE Certificate',
        '@status': 'passed',
        supplier_name: 'Real World Supplier (Pty) Ltd',
        bee_level: 4,
        black_ownership: 56.5,
        expiry_date: '2027-06-30',
      },
    ),
    textFixture(
      'sworn_affidavit_eme',
      [
        'B-BBEE SWORN AFFIDAVIT',
        'Enterprise Name: Kasi Logistics CC',
        'Annual Total Revenue: R7.5m',
        'Black Ownership: 100%',
        'B-BBEE Status Level: Level One',
        'Deponent Name: Naledi Maseko',
        'Signed Date: 12 May 2026',
      ],
      {
        '@status': 'passed',
        bee_level: 1,
        black_ownership: 100,
      },
    ),
    {
      name: 'supplier_workbook',
      input: {
        kind: 'upload',
        file: {
          buffer: makeWorkbook('Suppliers', [
            ['Supplier Name', 'Spend', 'BEE Level', 'Black Ownership'],
            ['ABC Traders (Pty) Ltd', 100000, 2, 51],
            ['XYZ Holdings', 50000, 4, 30],
          ]),
          originalname: 'supplier_schedule.xlsx',
          mimetype: MIME_BY_EXT['.xlsx'],
          size: 0,
        },
      },
      // Loose target: at least one supplier row should be recovered. Records the
      // current behaviour as baseline; improvements move it up.
      expected: { '@supplier_rows': (n: unknown) => typeof n === 'number' && n >= 1 },
    },
    {
      name: 'summary_deck',
      input: {
        kind: 'upload',
        file: {
          buffer: await makeDeck([['B-BBEE Summary', 'Level Two Contributor'], ['Black Ownership: 51%']]),
          originalname: 'summary.pptx',
          mimetype: MIME_BY_EXT['.pptx'],
          size: 0,
        },
      },
      // The deck must at least flow through the pipeline and yield a status.
      expected: { '@status': (s: unknown) => typeof s === 'string' && s.length > 0 },
    },
  ];

  return [...seeded, ...discoverFixtures()];
}
