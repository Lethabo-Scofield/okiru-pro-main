/**
 * Which files the parser can open, said in ONE place.
 *
 * There used to be three lists: the B-BBEE picker's `accept` (no .ppt, .tif or
 * .webp), the checklist pickers' (no .ppt) and the ESG filter (all sixteen). A
 * picker that greys a file out is a silent refusal, and three lists meant the
 * same document was readable from one button and refused by the next.
 *
 * So the pickers no longer filter at all: any file can be chosen, and what the
 * parser cannot open is set aside AFTER the pick, by name, with a sentence
 * saying why. This list mirrors SUPPORTED_UPLOAD_EXTENSIONS in the parser
 * (okiru-ai-parser/src/services/fileExtraction.ts). When the parser learns to
 * read another kind of file, add it here and every upload in both products
 * accepts it.
 */
export const READABLE_EXTENSIONS: readonly string[] = [
  ".pdf", ".docx", ".doc", ".xlsx", ".xlsm", ".xls", ".pptx", ".ppt",
  ".csv", ".txt", ".eml", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp",
];

const READABLE = new Set(READABLE_EXTENSIONS);

/** The plain-English list the drop zone shows. */
export const READABLE_SUMMARY = "Any document: PDF, Word, Excel, PowerPoint, scans, photos, CSV, text or a saved e-mail.";

/** The base name of a picked path ("folder/sub/file.pdf" → "file.pdf"). */
export function baseName(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}

/** ".pdf" for "Report.PDF"; "" for a name with no extension. */
export function extensionOf(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

/**
 * Operating-system bookkeeping a folder picker sweeps up. Never a document,
 * never worth listing back at the user.
 */
export function isSystemFile(name: string): boolean {
  const base = baseName(name);
  return base === "Thumbs.db" || base === "desktop.ini" || /^\.(ds_store)$/i.test(base) || (base.startsWith(".") && !base.startsWith("._"));
}

/**
 * Office lock files (~$Book.xlsx, made while the file is open in Excel) and
 * macOS resource forks (._name). They look like documents and are not.
 */
export function isTemporaryFile(name: string): boolean {
  const base = baseName(name);
  return /^~\$/.test(base) || /^\._/.test(base);
}

export function isReadableFile(file: { name: string; size: number }): boolean {
  return READABLE.has(extensionOf(file.name)) && file.size > 0;
}

export interface SortedFiles<T extends { name: string; size: number }> {
  /** Files the parser can open. */
  usable: T[];
  /** Office lock files and resource forks, by name. */
  temporary: string[];
  /** Real files the parser cannot open (or empty ones), by name. */
  unreadable: string[];
}

/** Split a pick into what can be read, what is a temporary file, and what cannot be opened. */
export function sortPickedFiles<T extends { name: string; size: number }>(incoming: readonly T[]): SortedFiles<T> {
  const out: SortedFiles<T> = { usable: [], temporary: [], unreadable: [] };
  for (const file of incoming) {
    if (isSystemFile(file.name)) continue;
    if (isTemporaryFile(file.name)) out.temporary.push(baseName(file.name));
    else if (isReadableFile(file)) out.usable.push(file);
    else out.unreadable.push(baseName(file.name));
  }
  return out;
}

/** "We can't open these 2 files (.dwg, .mp4). If one is evidence, save it as a PDF and add it." */
export function unreadableSentence(names: readonly string[]): string {
  const n = names.length;
  const kinds = Array.from(new Set(names.map((name) => extensionOf(name) || "no extension")));
  const empty = names.length > 0 && kinds.every((kind) => READABLE.has(kind));
  if (empty) {
    return `${n === 1 ? "This file is" : `These ${n} files are`} empty, so there is nothing to read.`;
  }
  return `We can't open ${n === 1 ? "this file" : `these ${n} files`} (${kinds.slice(0, 4).join(", ")}${kinds.length > 4 ? "…" : ""}). If one is evidence, save it as a PDF and add it.`;
}

/** One neutral line for skipped Office lock files. */
export function temporarySentence(names: readonly string[]): string {
  const n = names.length;
  return `Skipped ${n} temporary Office file${n === 1 ? "" : "s"} (${names.slice(0, 2).join(", ")}${n > 2 ? "…" : ""}). Close the workbook in Excel and add the real file.`;
}
