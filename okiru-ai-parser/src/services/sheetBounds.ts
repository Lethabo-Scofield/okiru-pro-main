/**
 * A spreadsheet's declared size is a claim, not a fact.
 *
 * (Same guard as apps/web/src/lib/sheetBounds.ts — the parser is its own
 * package, so it carries its own copy. Keep the two in step.)
 *
 * Every sheet in an .xlsx carries a `<dimension>` — "this sheet spans
 * A1:XFD1048576" — and SheetJS hands it over verbatim as `!ref`. Everything
 * that turns a sheet into rows (`sheet_to_json`, our own cell walkers) loops
 * over that rectangle. Nothing in the format obliges the claim to be honest: a
 * 2 KB file can declare all seventeen billion cells of a sheet while holding
 * one, and the server reading it then spends hours, or all its memory,
 * building empty rows — inside an import request, for every tenant at once.
 *
 * It is not only an attack. Okiru's own B-BBEE Toolkit templates declare
 * `B1:AQ1048576` on a sheet holding 570 values (whole-column formatting does
 * that), so honest files make the same claim, just less ambitiously.
 *
 * So the claim is checked against the cells actually present, right after the
 * file is opened and before anything reads rows. A sheet whose claim is modest
 * is left exactly as it is. One claiming more than any real sheet holds is cut
 * to the cells it has; if even those are spread wider than a real sheet, it
 * keeps the block nearly all of them sit in. The workbook as a whole has a
 * budget too, so a hundred modest claims cannot add up to one enormous one.
 *
 * Measured on 87 real workbooks (client packs and our own templates): the
 * densest real sheet held 1.34 million cells — a year of driver debriefs. The
 * limits sit well above that.
 */
import * as XLSX from 'xlsx';

/** Most cells one sheet may span. The densest real sheet measured held 1.34 million. */
export const SHEET_AREA_CAP = 5_000_000;
/** Most cells all of a workbook's sheets may span together. */
export const WORKBOOK_AREA_CAP = 10_000_000;

export interface SheetBoundsNote {
  sheet: string;
  /** The range the file claimed. */
  declared: string;
  /** The range that is read now; null when the sheet is not read at all. */
  kept: string | null;
  /** Cells the sheet holds outside what is read. Zero when nothing was lost. */
  droppedCells: number;
}

type Extent = XLSX.Range;

const areaOf = (x: Extent) => (x.e.r - x.s.r + 1) * (x.e.c - x.s.c + 1);

function declaredExtent(sheet: XLSX.WorkSheet): Extent | null {
  const ref = sheet["!ref"];
  if (typeof ref !== "string" || !ref) return null;
  const x = XLSX.utils.decode_range(ref);
  const valid =
    [x.s.r, x.s.c, x.e.r, x.e.c].every((n) => Number.isInteger(n) && n >= 0) &&
    x.e.r >= x.s.r &&
    x.e.c >= x.s.c;
  return valid ? x : null;
}

/** Row and column of every cell the sheet actually holds — O(cells), never O(claim). */
function cellsOf(sheet: XLSX.WorkSheet): { rows: Int32Array; cols: Int32Array } {
  const keys = Object.keys(sheet);
  const rows = new Int32Array(keys.length);
  const cols = new Int32Array(keys.length);
  let n = 0;
  for (const key of keys) {
    if (key.charCodeAt(0) === 33) continue; // "!ref", "!merges", "!cols" — metadata
    const { r, c } = XLSX.utils.decode_cell(key);
    if (!(r >= 0 && c >= 0)) continue;
    rows[n] = r;
    cols[n] = c;
    n++;
  }
  return { rows: rows.subarray(0, n), cols: cols.subarray(0, n) };
}

/**
 * The extent the cells occupy. It starts no later than the sheet's own start,
 * so a reader that counts from the sheet's first row still finds row 1 where
 * it was.
 */
function contentExtent(rows: Int32Array, cols: Int32Array, start: XLSX.CellAddress | undefined): Extent | null {
  if (rows.length === 0) return null;
  let minR = Infinity;
  let minC = Infinity;
  let maxR = 0;
  let maxC = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] < minR) minR = rows[i];
    if (rows[i] > maxR) maxR = rows[i];
    if (cols[i] < minC) minC = cols[i];
    if (cols[i] > maxC) maxC = cols[i];
  }
  return {
    s: { r: Math.min(start?.r ?? minR, minR), c: Math.min(start?.c ?? minC, minC) },
    e: { r: maxR, c: maxC },
  };
}

/**
 * Cells spread wider than any real sheet: keep the block where 99.9% of them
 * sit, and if even that is too big, its first rows up to the cap.
 */
function coreExtent(rows: Int32Array, cols: Int32Array, start: XLSX.CellAddress, cap: number): Extent {
  const quantile = (values: Int32Array) => {
    const sorted = Int32Array.from(values).sort();
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.999) - 1)];
  };
  let endR = Math.max(start.r, quantile(rows));
  const endC = Math.max(start.c, quantile(cols));
  const width = endC - start.c + 1;
  if ((endR - start.r + 1) * width > cap) endR = start.r + Math.max(1, Math.floor(cap / width)) - 1;
  return { s: start, e: { r: endR, c: endC } };
}

function countOutside(rows: Int32Array, cols: Int32Array, x: Extent | null): number {
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    if (!x || rows[i] < x.s.r || rows[i] > x.e.r || cols[i] < x.s.c || cols[i] > x.e.c) n++;
  }
  return n;
}

/**
 * Cut one sheet's claim down to its cells. Returns the extent now read (null:
 * none), or undefined when the sheet was left exactly as it was.
 */
function boundSheet(
  sheet: XLSX.WorkSheet,
  cap: number,
  force: boolean,
): { kept: Extent | null; dropped: number } | undefined {
  // No claim at all: every reader skips a sheet without `!ref`, so there is
  // nothing to bound — and filling one in would only ever add rows.
  if (sheet['!ref'] == null) return undefined;
  const declared = declaredExtent(sheet);
  // An honest-sized claim stays exactly as it is. An UNREADABLE one does not:
  // "A0:XFD9999999" fails decoding here, yet a reader would still walk it.
  if (!force && declared && areaOf(declared) <= cap) return undefined;

  const { rows, cols } = cellsOf(sheet);
  const content = contentExtent(rows, cols, declared?.s);
  if (!content) {
    delete sheet["!ref"];
    return { kept: null, dropped: 0 };
  }
  const kept = areaOf(content) <= cap ? content : coreExtent(rows, cols, content.s, cap);
  sheet["!ref"] = XLSX.utils.encode_range(kept);
  return { kept, dropped: countOutside(rows, cols, kept) };
}

/**
 * Check every sheet's claimed size against what it holds, in place, before
 * anything reads rows. Call it straight after `XLSX.read`.
 *
 * Returns a note per sheet it changed. `droppedCells > 0` is the only case in
 * which a value is not read, and is worth telling the person about; cutting an
 * empty claim down loses nothing.
 */
export function boundWorkbookSheets(
  book: XLSX.WorkBook,
  caps: { sheet: number; workbook: number } = { sheet: SHEET_AREA_CAP, workbook: WORKBOOK_AREA_CAP },
): SheetBoundsNote[] {
  const notes = new Map<string, SheetBoundsNote>();
  const record = (name: string, declared: string, out: { kept: Extent | null; dropped: number }) => {
    notes.set(name, {
      sheet: name,
      declared: notes.get(name)?.declared ?? declared,
      kept: out.kept ? XLSX.utils.encode_range(out.kept) : null,
      droppedCells: out.dropped,
    });
  };
  const sheets = book.SheetNames.map((name) => ({ name, sheet: book.Sheets[name] })).filter(
    (s): s is { name: string; sheet: XLSX.WorkSheet } => Boolean(s.sheet),
  );
  const total = () =>
    sheets.reduce((sum, { sheet }) => {
      const x = declaredExtent(sheet);
      return sum + (x ? areaOf(x) : 0);
    }, 0);

  for (const { name, sheet } of sheets) {
    const declared = String(sheet["!ref"] ?? "");
    const out = boundSheet(sheet, caps.sheet, false);
    if (out) record(name, declared, out);
  }

  if (total() > caps.workbook) {
    // Many modest claims add up: hold every sheet to the cells it has.
    for (const { name, sheet } of sheets) {
      const declared = String(sheet["!ref"] ?? "");
      const out = boundSheet(sheet, caps.sheet, true);
      if (out && String(sheet["!ref"] ?? "") !== declared) record(name, declared, out);
    }
  }

  if (total() > caps.workbook) {
    // The cells themselves exceed the budget: read sheets in order until it is spent.
    let left = caps.workbook;
    for (const { name, sheet } of sheets) {
      const x = declaredExtent(sheet);
      if (!x) continue;
      if (areaOf(x) <= left) {
        left -= areaOf(x);
        continue;
      }
      const declared = String(sheet["!ref"]);
      const { rows, cols } = cellsOf(sheet);
      const fit = Math.floor(left / (x.e.c - x.s.c + 1));
      if (fit >= 1) {
        const kept: Extent = { s: x.s, e: { r: x.s.r + fit - 1, c: x.e.c } };
        sheet["!ref"] = XLSX.utils.encode_range(kept);
        left -= areaOf(kept);
        record(name, declared, { kept, dropped: countOutside(rows, cols, kept) });
      } else {
        delete sheet["!ref"];
        record(name, declared, { kept: null, dropped: rows.length });
      }
    }
  }

  return Array.from(notes.values());
}

/** The notes that mean a value was not read, worded for the person who uploaded the file. */
export function sheetBoundsLosses(notes: readonly SheetBoundsNote[]): string[] {
  return notes
    .filter((n) => n.droppedCells > 0)
    .map((n) =>
      n.kept
        ? `Sheet ${n.sheet}: only ${n.kept} was read. The file declares ${n.declared}, far beyond any real sheet, and ${n.droppedCells} cell(s) outside that block were left out.`
        : `Sheet ${n.sheet} was not read: the workbook declares more cells than any real workbook holds (${n.droppedCells} cell(s) left out).`,
    );
}
