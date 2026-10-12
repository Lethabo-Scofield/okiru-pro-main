/**
 * How much of a document the preview draws. The preview is for checking a
 * value against its source, not for reading a 400-page manual, so it stops
 * early and says "Download for the full file" instead of freezing the page.
 */

/** Text-like files (txt, md, csv, html, json): only this much is read. */
export const MAX_TEXT_BYTES = 512 * 1024;

/** Word, PowerPoint and e-mail files larger than this are not converted at all. */
export const MAX_CONVERT_BYTES = 30 * 1024 * 1024;

/** Paragraphs, headings, tables and the like, across the whole document. */
export const MAX_BLOCKS = 800;

/** Rows of any one table (Word, e-mail or web page). */
export const MAX_TABLE_ROWS = 200;

/** Rows and columns of a CSV file. */
export const MAX_CSV_ROWS = 500;
export const MAX_CSV_COLS = 40;

/** Slides of a presentation. */
export const MAX_SLIDES = 80;

/**
 * Counts blocks as a converter emits them, so a converter can stop walking a
 * huge document as soon as the preview has enough.
 */
export class BlockBudget {
  private used = 0;
  truncated = false;

  constructor(private readonly max: number = MAX_BLOCKS) {}

  /** True while there is room for another block. Records the cut when there is not. */
  take(): boolean {
    if (this.used >= this.max) {
      this.truncated = true;
      return false;
    }
    this.used += 1;
    return true;
  }

  get full(): boolean {
    return this.used >= this.max;
  }
}
