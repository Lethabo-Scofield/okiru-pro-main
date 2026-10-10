/**
 * SIDE-BY-SIDE CAPTIONED COLUMNS ON A DIGITAL PDF PAGE.
 *
 * Some forms print two blocks next to each other under their own captions:
 *
 *     POSTAL ADDRESS            ADDRESS OF REGISTERED OFFICE
 *     PO BOX 100                12 MAIN ROAD EAST
 *     SOMETOWN                  WESTVILLE
 *     4000                      3630
 *
 * Reading-order text (reconstructPdfLines) joins each visual line left to
 * right — "PO BOX 100 12 MAIN ROAD EAST" — which is right for prose and a
 * table row but scrambles the two blocks: a reader can no longer tell where
 * the postal address ends and the registered office begins, and a word at the
 * seam ("EAST") is easily lost. The positions pdfjs gives say it plainly: each
 * block's lines start at its caption's x.
 *
 * This reads such blocks from the positioned items: a line of two or more
 * captions (words, no figures), then the lines right under it whose every item
 * starts where a caption starts, until the spacing or the alignment breaks.
 * Each caption keeps its own lines, as printed. Nothing here changes the
 * document's text; the columns travel beside it (input metadata
 * `pdf_columns`) for the readers that need them (columnReadings.ts).
 *
 * Pure, no imports: it is part of how a file becomes an extraction input.
 */

export interface PdfTextItemLike {
  str: string;
  x: number;
  y: number;
}

export interface CaptionedColumn {
  page: number;
  caption: string;
  /** The block's lines under the caption, top to bottom, as printed. */
  lines: string[];
}

/** Items within this many points vertically share a line (as reconstructPdfLines). */
const Y_TOLERANCE = 2.5;
/** A body item belongs to a caption's column when it starts this close to the caption's x. */
const X_TOLERANCE = 6;
/** Captions on one line must stand at least this far apart. */
const MIN_COLUMN_GAP = 40;
/** The first body line sits at most this far under its captions. */
const MAX_FIRST_GAP = 24;
/** Bounds on what travels in the input's metadata. */
const MAX_COLUMNS = 60;
const MAX_LINES = 20;

interface Line {
  y: number;
  items: PdfTextItemLike[];
}

function linesOf(items: PdfTextItemLike[]): Line[] {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= Y_TOLERANCE) last.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** A caption: words only (no figures), short, at least three letters. */
function isCaption(text: string): boolean {
  const t = text.trim();
  return (t.match(/[a-z]/gi)?.length ?? 0) >= 3 && !/\d/.test(t) && t.length <= 60 && t.split(/\s+/).length <= 8;
}

/** Upper case, or not: captions printed side by side share one style. */
function letterCase(text: string): 'upper' | 'mixed' {
  const letters = text.replace(/[^a-z]/gi, '');
  return letters === letters.toUpperCase() ? 'upper' : 'mixed';
}

/**
 * The captions on a line: two or more, set apart, in one style, with at most
 * a row label of the other style at the left margin ("Addresses   POSTAL
 * ADDRESS   ADDRESS OF REGISTERED OFFICE"). A label and its value on one line
 * ("Enterprise Name   ACME TRADING") are not captions: they differ in style,
 * or the value carries figures. Null when the line is not a caption line.
 */
function captionsOf(line: Line): PdfTextItemLike[] | null {
  if (line.items.length < 2 || !line.items.every((i) => isCaption(i.str))) return null;
  for (const style of ['upper', 'mixed'] as const) {
    const captions = line.items.filter((i) => letterCase(i.str) === style);
    if (captions.length < 2) continue;
    const others = line.items.filter((i) => letterCase(i.str) !== style);
    if (others.length > 1 || others.some((o) => o.x >= captions[0].x)) continue;
    if (captions.every((item, k) => k === 0 || item.x - captions[k - 1].x >= MIN_COLUMN_GAP)) return captions;
  }
  return null;
}

/** The captioned column blocks on one page, each caption with the lines printed under it (columns with fewer than two lines are left out). */
export function captionedColumns(items: PdfTextItemLike[], page: number): CaptionedColumn[] {
  const lines = linesOf(items);
  const out: CaptionedColumn[] = [];
  let i = 0;
  while (i < lines.length) {
    const head = lines[i];
    const captions = captionsOf(head);
    if (!captions) {
      i += 1;
      continue;
    }
    const columns = captions.map((item) => ({ x: item.x, caption: item.str.trim(), lines: [] as string[] }));
    let previousY = head.y;
    let previousGap: number | null = null;
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const line = lines[j];
      const gap = previousY - line.y;
      if (previousGap === null ? gap > MAX_FIRST_GAP : gap > previousGap * 1.5 + 0.5) break;
      const placed = line.items.map((item) => columns.find((c) => Math.abs(c.x - item.x) <= X_TOLERANCE));
      if (placed.some((c) => !c)) break;
      line.items.forEach((item, k) => placed[k]!.lines.push(item.str.trim()));
      previousGap = gap;
      previousY = line.y;
    }
    // A block of captions over at least two columns of lines; anything else
    // (a heading line, a label and its one value) is not one.
    const filled = columns.filter((c) => c.lines.length >= 2);
    if (filled.length >= 2) {
      for (const c of filled) out.push({ page, caption: c.caption, lines: c.lines.slice(0, MAX_LINES) });
    }
    i = j > i + 1 ? j : i + 1;
  }
  return out;
}

/** Every page's captioned columns, bounded for the input's metadata. */
export function pdfCaptionedColumns(pages: PdfTextItemLike[][]): CaptionedColumn[] {
  return pages.flatMap((items, index) => captionedColumns(items, index + 1)).slice(0, MAX_COLUMNS);
}
