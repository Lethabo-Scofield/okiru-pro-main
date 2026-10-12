/**
 * Turn any uploaded file into something the preview can show.
 *
 * PDFs, pictures and spreadsheets have their own viewers in DocumentPreview.
 * Everything else that holds words — Word (.docx and old .doc), PowerPoint,
 * Markdown, e-mail, web pages, CSV and plain text — is converted here, in the
 * browser, into the RichDoc model that RichDocument draws. Whatever cannot be
 * converted is reported as such, and the preview offers the download instead.
 */
import { csvToDoc } from "./csv";
import { docxToDoc } from "./docx";
import { emlToDoc } from "./eml";
import { htmlToDoc } from "./html";
import { legacyDocToDoc } from "./legacyDoc";
import { MAX_CONVERT_BYTES, MAX_TEXT_BYTES } from "./limits";
import { markdownToDoc } from "./markdown";
import { plainToDoc } from "./plain";
import { pptxToDoc } from "./pptx";
import type { RichDoc } from "./types";

export type { RichDoc } from "./types";

export type PreviewKind =
  | "pdf"
  | "image"
  | "spreadsheet"
  | "csv"
  | "text"
  | "code"
  | "markdown"
  | "word"
  | "legacy-word"
  | "slides"
  | "email"
  | "html"
  | "other";

const BY_EXTENSION: Array<[RegExp, PreviewKind]> = [
  [/\.pdf$/i, "pdf"],
  [/\.(png|jpe?g|gif|webp|bmp|avif|ico|svg|tiff?)$/i, "image"],
  [/\.(xlsx|xlsm|xlsb|xls|ods)$/i, "spreadsheet"],
  [/\.(csv|tsv)$/i, "csv"],
  [/\.(md|markdown|mdown|mkd)$/i, "markdown"],
  [/\.(docx|docm|dotx)$/i, "word"],
  [/\.(doc|dot)$/i, "legacy-word"],
  [/\.(pptx|pptm|ppsx)$/i, "slides"],
  [/\.eml$/i, "email"],
  [/\.(html?|xhtml)$/i, "html"],
  [/\.(txt|text)$/i, "text"],
  [/\.(json|xml|log|ya?ml|ini|cfg|conf)$/i, "code"],
];

const BY_TYPE: Array<[RegExp, PreviewKind]> = [
  [/^application\/pdf$/i, "pdf"],
  [/^image\//i, "image"],
  [/spreadsheetml|ms-excel/i, "spreadsheet"],
  [/^text\/(csv|tab-separated-values)/i, "csv"],
  [/^text\/markdown/i, "markdown"],
  [/wordprocessingml/i, "word"],
  [/^application\/msword$/i, "legacy-word"],
  [/presentationml/i, "slides"],
  [/^message\/rfc822/i, "email"],
  [/^text\/html/i, "html"],
  [/^(application\/(json|xml))/i, "code"],
  [/^text\//i, "text"],
];

/** What kind of preview a file gets, by its name (and its type, when the name has no extension). */
export function previewKind(name: string, mimeType?: string | null): PreviewKind {
  for (const [re, kind] of BY_EXTENSION) if (re.test(name)) return kind;
  if (mimeType) for (const [re, kind] of BY_TYPE) if (re.test(mimeType)) return kind;
  return "other";
}

/** The kinds converted into a RichDoc (the rest have viewers of their own, or none). */
export function isRichKind(kind: PreviewKind): boolean {
  return ["csv", "text", "code", "markdown", "word", "legacy-word", "slides", "email", "html"].includes(kind);
}

/** A file too large to convert in the browser. */
export class TooLargeToPreview extends Error {
  constructor() {
    super("This file is too large to preview here");
  }
}

/** Blob bytes, with a fallback for environments without Blob.arrayBuffer. */
export function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Text, honouring a UTF-8 or UTF-16 byte-order mark. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const text = new TextDecoder("utf-8").decode(bytes);
  // Not UTF-8 at all (an old Windows export): read it as Windows-1252 instead.
  const bad = (text.match(/�/g) ?? []).length;
  if (bad > 0 && bad > text.length / 200) {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return text;
    }
  }
  return text.replace(/^﻿/, "");
}

function prettyCode(text: string, name: string): string {
  if (/\.json$/i.test(name) && text.length < 200_000) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

/** Convert a file of a rich kind. Throws when the file can't be read as that kind. */
export async function convertDocument(blob: Blob, kind: PreviewKind, name = ""): Promise<RichDoc> {
  const textLike = kind === "csv" || kind === "text" || kind === "code" || kind === "markdown" || kind === "html";
  if (textLike) {
    const cut = blob.size > MAX_TEXT_BYTES;
    const text = decodeText(await readBytes(cut ? blob.slice(0, MAX_TEXT_BYTES) : blob));
    const opts = { truncated: cut };
    if (kind === "csv") return csvToDoc(text, { ...opts, tabs: /\.tsv$/i.test(name) });
    if (kind === "markdown") return markdownToDoc(text, opts);
    if (kind === "html") return htmlToDoc(text, opts);
    if (kind === "code") return { blocks: [{ type: "code", text: prettyCode(text, name) }], truncated: cut };
    return plainToDoc(text, opts);
  }

  if (blob.size > MAX_CONVERT_BYTES) throw new TooLargeToPreview();
  const bytes = await readBytes(blob);
  if (kind === "word") return docxToDoc(bytes);
  if (kind === "legacy-word") {
    // Some ".doc" files are really .docx, RTF or HTML saved under the old name.
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return docxToDoc(bytes);
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 64)).trimStart().toLowerCase();
    if (head.startsWith("<html") || head.startsWith("<!doctype html")) return htmlToDoc(decodeText(bytes));
    return legacyDocToDoc(bytes);
  }
  if (kind === "slides") return pptxToDoc(bytes);
  if (kind === "email") return emlToDoc(bytes);
  throw new Error(`No converter for ${kind}`);
}
