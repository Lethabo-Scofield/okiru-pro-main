/**
 * CAPITAL EXPENDITURE FROM A FIXED-ASSET NOTE THAT PRINTS NO ADDITIONS LINE.
 *
 * Small entities' statements often print the fixed-asset note as cost,
 * accumulated depreciation and carrying value per class, for this year and
 * last, with no movement lines at all. When the total cost is the same at both
 * year ends and the statements nowhere mention additions, disposals or a
 * purchase of assets, nothing was bought: the capital expenditure is nil. The
 * model is told to copy printed values only, so it rightly returns nothing;
 * this reads the note in code instead, and only in that one clear case.
 *
 * Conservative by construction:
 *  - the note's total row must check out as cost - accumulated depreciation =
 *    carrying value for BOTH years, so the columns are known, not guessed;
 *  - any additions, disposals, acquisitions, purchase of assets or
 *    revaluation anywhere in the document means the figure is the model's to
 *    read as printed, and nothing is derived here;
 *  - a cost that moved without a movement line is reported, never turned
 *    into a figure (it could be a revaluation, a transfer or a misprint).
 *
 * Pure: no I/O. caseExtraction.addFixedAssetCapex places the value, labelled
 * derived, on the statements that asked for capital_expenditure.
 */
import { amountOf } from './skillDerivations.js';

export type FixedAssetCapex =
  | { value: 0; basis: string }
  | { value: null; note: string };

const NOTE_TITLE = /fixed\s+assets|property,?\s+plant\s+(?:and|&)\s+equipment/i;
const MOVEMENT = /\badditions?\b|\bdisposals?\b|\bacquisitions?\s+of\s+(?:property|plant|fixed|equipment|assets|vehicles)|\bpurchases?\s+of\s+(?:property|plant|fixed|equipment|assets|vehicles)|\brevaluation\b|\bassets?\s+acquired\b/i;

interface Cell { header: boolean; text: string }

function cellText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function htmlRows(table: string): Cell[][] {
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => ({ header: cell[1].toLowerCase() === 'h', text: cellText(cell[2]) })));
}

/**
 * Every table in the text with where it starts: HTML tables (Document
 * Intelligence's own output) and markdown pipe tables (the extracted
 * markdown the readers see), whose first row is the header.
 */
function tablesIn(text: string): Array<{ at: number; rows: Cell[][] }> {
  const out: Array<{ at: number; rows: Cell[][] }> = [];
  for (const match of text.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    out.push({ at: match.index ?? 0, rows: htmlRows(match[1]) });
  }
  for (const match of text.matchAll(/(?:^|\n)((?:[ \t]*\|[^\n]*\|[ \t]*(?:\n|$))+)/g)) {
    const lines = match[1].split('\n').map((line) => line.trim()).filter(Boolean);
    const separator = lines.findIndex((line) => /^\|(\s*:?-{3,}:?\s*\|)+$/.test(line));
    if (separator !== 1) continue;
    const cells = (line: string) => line.slice(1, -1).split('|').map((cell) => cell.trim());
    out.push({
      at: (match.index ?? 0) + (match[0].startsWith('\n') ? 1 : 0),
      rows: [
        cells(lines[0]).map((text) => ({ header: true, text })),
        ...lines.slice(2).map((line) => cells(line).map((text) => ({ header: false, text }))),
      ],
    });
  }
  return out;
}

/** A printed figure, where a dash is nil. Null for anything that is not a figure. */
function figure(text: string): number | null {
  if (/^[-–—]$/.test(text.trim())) return 0;
  return amountOf(text);
}

function rand(n: number): string {
  return `R${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

/**
 * The note's total cost at the two year ends, read off its total row, with the
 * two years in the order the header prints them. Null when no table in the
 * text is such a note.
 */
function noteTotals(text: string): { current: number; prior: number; currentYear: number; priorYear: number } | null {
  for (const { at, rows } of tablesIn(text)) {
    const before = text.slice(Math.max(0, at - 300), at);
    const headerText = rows.filter((r) => r.every((c) => c.header)).flat().map((c) => c.text).join(' ');
    if (!NOTE_TITLE.test(headerText) && !NOTE_TITLE.test(before.split(/\n\s*\n/).slice(-3).join(' '))) continue;
    if (!/\bcost\b/i.test(headerText)) continue;
    const years = [...headerText.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
    const distinct = [...new Set(years)];
    if (distinct.length !== 2) continue;

    const dataRows = rows.filter((r) => r.some((c) => !c.header));
    for (let i = dataRows.length - 1; i >= 0; i -= 1) {
      const [first, ...rest] = dataRows[i];
      if (!first || (first.text && !/^total/i.test(first.text))) continue;
      const figures = rest.filter((c) => c.text !== '').map((c) => figure(c.text));
      if (figures.length !== 6 || figures.some((f) => f === null)) continue;
      const [c1, a1, v1, c2, a2, v2] = figures as number[];
      // Cost less accumulated depreciation is the carrying value, both years.
      if (Math.abs(c1 - a1 - v1) > 1 || Math.abs(c2 - a2 - v2) > 1) continue;
      const [y1, y2] = distinct;
      return y1 > y2
        ? { current: c1, prior: c2, currentYear: y1, priorYear: y2 }
        : { current: c2, prior: c1, currentYear: y2, priorYear: y1 };
    }
  }
  return null;
}

export function fixedAssetCapex(text: string | null | undefined): FixedAssetCapex | null {
  if (!text) return null;
  const totals = noteTotals(text);
  if (!totals) return null;
  if (MOVEMENT.test(text)) return null;
  if (Math.abs(totals.current - totals.prior) <= 1) {
    return {
      value: 0,
      basis: `derived: the fixed-asset note prints the same total cost at ${totals.priorYear} and ${totals.currentYear} year end (${rand(totals.current)}), `
        + 'and the statements print no additions, disposals or purchases of assets',
    };
  }
  return {
    value: null,
    note: `The fixed-asset note's total cost moved from ${rand(totals.prior)} to ${rand(totals.current)}, but the statements print no additions or disposals line, `
      + 'so capital expenditure is not derived. Check the note.',
  };
}
