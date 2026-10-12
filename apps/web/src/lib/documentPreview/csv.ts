/**
 * CSV / TSV → a table, with quoted fields ("a, b", "say ""hi""") and line
 * breaks inside quotes handled. The delimiter is whichever of comma,
 * semicolon (common in South African Excel exports) or tab the first line
 * uses most.
 */
import { MAX_CSV_COLS, MAX_CSV_ROWS } from "./limits";
import type { RichDoc } from "./types";

export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? undefined : text.search(/\r?\n/));
  const counts = [",", ";", "\t", "|"].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

export function parseCsv(text: string, delimiter = detectDelimiter(text), maxRows = MAX_CSV_ROWS + 1): { rows: string[][]; complete: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const src = text.replace(/^﻿/, "");
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      else field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      if (rows.length >= maxRows) return { rows, complete: i + 1 >= src.length };
    } else field += ch;
    i += 1;
  }
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);
  return { rows, complete: true };
}

export function csvToDoc(text: string, opts: { truncated?: boolean; tabs?: boolean } = {}): RichDoc {
  const { rows, complete } = parseCsv(text, opts.tabs ? "\t" : detectDelimiter(text));
  const shown = rows.slice(0, MAX_CSV_ROWS + 1).map((r) => r.slice(0, MAX_CSV_COLS));
  const tooWide = rows.some((r) => r.length > MAX_CSV_COLS);
  return {
    blocks: shown.length ? [{ type: "table", rows: shown, header: true }] : [],
    truncated: Boolean(opts.truncated) || !complete || rows.length > MAX_CSV_ROWS + 1 || tooWide,
  };
}
