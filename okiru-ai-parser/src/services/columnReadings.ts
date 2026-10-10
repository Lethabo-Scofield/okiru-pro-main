/**
 * A FIELD PRINTED AS ITS OWN CAPTIONED BLOCK, READ FROM THAT BLOCK'S LINES.
 *
 * A CIPC disclosure prints the postal address and the registered office side
 * by side under their captions. In reading order every line holds both
 * ("PO BOX 100 12 MAIN ROAD EAST"), and a read of it can drop a word at the
 * seam: "12 MAIN ROAD WESTVILLE" for "12 MAIN ROAD EAST, WESTVILLE". The
 * block's own lines (pdfColumns.ts) say exactly what is printed under the
 * caption.
 *
 * So, for a text field whose printed label is a captioned block's caption
 * (every word of a label of at least two words in the caption, "Registered
 * Office" in "ADDRESS OF REGISTERED OFFICE"), the block's lines are the value,
 * joined line by line as printed, when:
 *
 *  - exactly one block on the document has that caption (or every such block
 *    says the same), and
 *  - the model's reading is the same words in the same order with some left
 *    out (it read this block and lost part of it). A reading that says
 *    something else (another address, another field's value) is never
 *    replaced: the block may be a different thing under a similar caption.
 *
 * A replaced reading is reported as an exception with both values. Pure.
 */
import type { DocumentExtraction } from './aiExtraction.js';
import type { CaptionedColumn } from './pdfColumns.js';
import type { Skill } from './skills.js';

function words(text: string): string[] {
  return String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Is `part` the same words as `whole`, in order, with some left out? */
function isSubsequence(part: string[], whole: string[]): boolean {
  let at = 0;
  for (const word of whole) if (at < part.length && part[at] === word) at += 1;
  return at === part.length;
}

/** The block a field's label names, when exactly one reading of it exists. */
export function columnFor(labels: string[], columns: CaptionedColumn[]): string | null {
  const readings = new Set<string>();
  for (const label of labels) {
    const want = words(label);
    if (want.length < 2) continue;
    for (const column of columns) {
      const caption = new Set(words(column.caption));
      if (want.every((w) => caption.has(w))) readings.add(column.lines.join(', '));
    }
  }
  return readings.size === 1 ? [...readings][0] : null;
}

/** The captioned columns an input carries (fileExtraction puts them in metadata.pdf_columns). */
export function columnsFromMetadata(metadata: Record<string, unknown> | undefined): CaptionedColumn[] {
  const raw = metadata?.pdf_columns;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is CaptionedColumn => Boolean(c)
    && typeof (c as CaptionedColumn).caption === 'string'
    && Array.isArray((c as CaptionedColumn).lines));
}

/**
 * Re-read every skill-typed text field whose label is a captioned block's
 * caption from that block, when the model's reading is that block with words
 * missing. `columnsOf` returns a source file's captioned columns.
 */
export function applyCaptionedColumns(
  extractions: DocumentExtraction[],
  columnsOf: (sourceFile: string) => CaptionedColumn[],
  skillFor: (documentId: string) => Skill | null,
): void {
  for (const extraction of extractions) {
    if (extraction.error) continue;
    const skill = skillFor(extraction.documentId);
    const columns = columnsOf(extraction.sourceFile);
    if (!skill || columns.length === 0) continue;
    for (const field of skill.fields) {
      if (field.type !== 'text' || field.rowLevel) continue;
      const existing = extraction.values.find((v) => v.field === field.name);
      if (!existing || typeof existing.value !== 'string') continue;
      const printed = columnFor(field.labels, columns);
      if (!printed) continue;
      const read = words(existing.value);
      const block = words(printed);
      if (read.length === 0 || read.join(' ') === block.join(' ') || !isSubsequence(read, block)) continue;
      extraction.exceptions.push(
        `${field.name}: read as "${existing.value}", but the block printed under its caption is "${printed}"; the printed lines are kept.`,
      );
      existing.value = printed;
    }
  }
}
