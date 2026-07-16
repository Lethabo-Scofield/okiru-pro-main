/**
 * Token prediction — the engine the price derives from, so the rules are
 * asserted rather than trusted. Key invariants:
 *  - digital text is EXACT (no band); scans are ESTIMATED (banded)
 *  - the quote prices the band's UPPER bound, so we never charge above quote
 *  - quoting never OCRs (an image must not be read, only estimated)
 *  - size drives tokens: more rows => more tokens
 */
import { describe, it, expect } from 'vitest';
import {
  predictTokensForFile,
  azureCostFor,
  countTokens,
} from '../../src/services/tokenPrediction.js';

const file = (name: string, mimetype: string, content: string | Buffer) => {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return { originalname: name, mimetype, buffer, size: buffer.length };
};

describe('countTokens', () => {
  it('counts with a real encoding, not a char heuristic', () => {
    expect(countTokens('')).toBe(0);
    expect(countTokens('B-BBEE Certificate')).toBeGreaterThan(0);
    // A longer string must cost strictly more tokens.
    expect(countTokens('Acme Supplies (Pty) Ltd, Level 2, 51% black ownership'))
      .toBeGreaterThan(countTokens('Acme'));
  });
});

describe('predictTokensForFile — digital text is exact', () => {
  it('CSV: exact tokens, no band, rows counted', async () => {
    const csv = 'Supplier Name,Spend Amount,BEE Level\nAcme Supplies,1200000,2\nThebe Logistics,800000,1\n';
    const p = await predictTokensForFile(file('spend.csv', 'text/csv', csv));
    expect(p.kind).toBe('csv');
    expect(p.basis).toBe('exact-text');
    expect(p.band).toBeNull();
    expect(p.requiresOcr).toBe(false);
    expect(p.inputTokens).toBeGreaterThan(0);
    expect(p.rows).toBe(2);
  });

  it('size drives tokens — more rows cost strictly more', async () => {
    const head = 'Supplier Name,Spend Amount,BEE Level\n';
    const small = head + 'Acme,1,2\n';
    const large = head + Array.from({ length: 200 }, (_, i) => `Supplier ${i},${i * 1000},2`).join('\n');
    const a = await predictTokensForFile(file('s.csv', 'text/csv', small));
    const b = await predictTokensForFile(file('l.csv', 'text/csv', large));
    expect(b.inputTokens).toBeGreaterThan(a.inputTokens);
    expect(b.rows!).toBeGreaterThan(a.rows!);
  });

  it('plain text: exact', async () => {
    const p = await predictTokensForFile(file('a.txt', 'text/plain', 'B-BBEE CERTIFICATE\nLevel 2\nBlack ownership: 51%'));
    expect(p.basis).toBe('exact-text');
    expect(p.band).toBeNull();
    expect(p.inputTokens).toBeGreaterThan(0);
  });
});

describe('predictTokensForFile — scans are estimated, never read', () => {
  it('image: estimated + banded + flagged for OCR, and NOT OCR-ed to quote', async () => {
    // A byte blob that is not a real image. If quoting tried to OCR it, this
    // would throw or hang — it must not. Quoting is structure-only.
    const p = await predictTokensForFile(file('scan.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47])));
    expect(p.kind).toBe('image');
    expect(p.requiresOcr).toBe(true);
    expect(p.basis).toBe('estimated-scan');
    expect(p.band).not.toBeNull();
    expect(p.band!.lowerTokens).toBeLessThan(p.inputTokens);
    expect(p.band!.upperTokens).toBeGreaterThan(p.inputTokens);
    expect(p.reasons.join(' ')).toMatch(/estimated|OCR/i);
  });
});

describe('azureCostFor', () => {
  it('prices the UPPER bound for a banded scan so we never charge above quote', async () => {
    const p = await predictTokensForFile(file('scan.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47])));
    const cost = azureCostFor(p);
    expect(cost.isUpperBound).toBe(true);
    // Cost must reflect the band's top, not the midpoint.
    const midCost = azureCostFor({ ...p, band: null });
    expect(cost.inputCents).toBeGreaterThan(midCost.inputCents);
  });

  it('charges OCR per page only for scans; digital pays no OCR', async () => {
    const digital = await predictTokensForFile(file('a.txt', 'text/plain', 'Level 2 certificate for Acme'));
    const scan = await predictTokensForFile(file('s.png', 'image/png', Buffer.from([0x89])));
    expect(azureCostFor(digital).ocrCents).toBe(0);
    expect(azureCostFor(scan).ocrCents).toBeGreaterThan(0);
  });

  it('a scan costs more than the same-size digital doc (effort is priced)', async () => {
    const digital = await predictTokensForFile(file('a.txt', 'text/plain', 'x '.repeat(300)));
    const scan = await predictTokensForFile(file('s.png', 'image/png', Buffer.from([0x89])));
    expect(azureCostFor(scan).totalCents).toBeGreaterThan(azureCostFor(digital).totalCents);
  });

  it('margin multiplier is applied on top of the Azure cost', async () => {
    const p = await predictTokensForFile(file('a.txt', 'text/plain', 'Acme Level 2'));
    const cost = azureCostFor(p);
    expect(cost.totalCents).toBeCloseTo(cost.azureCents * cost.marginMultiplier, 2);
    expect(cost.azureCents).toBeCloseTo(cost.inputCents + cost.outputCents + cost.ocrCents, 2);
  });
});
