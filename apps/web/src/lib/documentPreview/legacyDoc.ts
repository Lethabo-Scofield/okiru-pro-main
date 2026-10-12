/**
 * Old Word files (.doc, Word 97–2003) → their text, as paragraphs.
 *
 * A .doc is an OLE compound file. The SheetJS build the app already ships for
 * spreadsheets includes a compound-file reader (XLSX.CFB), which opens the
 * `WordDocument` stream and the table stream. The text is found through the
 * piece table (the CLX): each piece says where a run of characters lives and
 * whether it is stored as 8-bit or UTF-16 text. Formatting is not recovered —
 * the preview shows the words, paragraph by paragraph, with table rows joined
 * by " | ". A file this cannot read (encrypted, or a Word 6 file) falls back
 * to "Preview not available".
 */
import { BlockBudget } from "./limits";
import type { Block, RichDoc } from "./types";

/** Windows-1252 bytes 0x80–0x9F, which Word's 8-bit pieces use. */
const CP1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";

function u16(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8);
}

function u32(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000;
}

function asBytes(content: unknown): Uint8Array | null {
  if (!content) return null;
  // A Buffer, a Uint8Array from another realm, or a plain array of bytes.
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  const list = content as ArrayLike<number>;
  if (typeof list.length === "number") return Uint8Array.from(list);
  return null;
}

/** The raw text of a Word 97+ document, or null when it can't be found. */
export function wordDocumentText(word: Uint8Array, table0: Uint8Array | null, table1: Uint8Array | null): string | null {
  if (word.length < 0x1aa || u16(word, 0) !== 0xa5ec) return null;
  const flags = u16(word, 0x0a);
  if (flags & 0x0100) throw new Error("This Word file is password-protected");
  const table = flags & 0x0200 ? table1 : table0;
  if (!table) return null;
  const fcClx = u32(word, 0x01a2);
  const lcbClx = u32(word, 0x01a6);
  if (!lcbClx || fcClx + lcbClx > table.length) return null;

  // Skip the Prc entries (formatting), then read the Pcdt (the piece table).
  let at = fcClx;
  const end = fcClx + lcbClx;
  while (at < end && table[at] === 0x01) at += 3 + u16(table, at + 1);
  if (table[at] !== 0x02) return null;
  const lcb = u32(table, at + 1);
  const plc = at + 5;
  const n = Math.floor((lcb - 4) / 12);
  if (n <= 0 || plc + lcb > table.length) return null;

  let text = "";
  for (let i = 0; i < n; i += 1) {
    const cpStart = u32(table, plc + i * 4);
    const cpEnd = u32(table, plc + (i + 1) * 4);
    const count = Math.max(0, cpEnd - cpStart);
    const pcd = plc + (n + 1) * 4 + i * 8;
    const fcRaw = u32(table, pcd + 2);
    const compressed = (fcRaw & 0x40000000) !== 0;
    const fc = fcRaw & 0x3fffffff;
    if (compressed) {
      const start = fc / 2;
      for (let k = 0; k < count && start + k < word.length; k += 1) {
        const c = word[start + k];
        text += c >= 0x80 && c <= 0x9f ? CP1252_HIGH[c - 0x80] : String.fromCharCode(c);
      }
    } else {
      for (let k = 0; k < count && fc + k * 2 + 1 < word.length; k += 1) text += String.fromCharCode(u16(word, fc + k * 2));
    }
    if (text.length > 2_000_000) break;
  }
  // The main body comes first; footnotes, headers and text boxes follow it.
  const ccpText = u32(word, 0x4c);
  return ccpText > 0 && ccpText < text.length ? text.slice(0, ccpText) : text;
}

/** Word's control characters → plain paragraphs. Field codes are dropped, their results kept. */
export function cleanWordText(raw: string): string[] {
  let out = "";
  let fieldDepth = 0;
  const showing: boolean[] = [];
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code === 0x13) {
      fieldDepth += 1;
      showing.push(false); // the field code (e.g. HYPERLINK "…") is hidden
      continue;
    }
    if (code === 0x14) {
      if (showing.length) showing[showing.length - 1] = true; // the field's result is shown
      continue;
    }
    if (code === 0x15) {
      fieldDepth = Math.max(0, fieldDepth - 1);
      showing.pop();
      continue;
    }
    if (fieldDepth && !showing[showing.length - 1]) continue;
    if (code === 0x0d || code === 0x0c) out += "\n";
    else if (code === 0x07) out += " | ";
    else if (code === 0x0b) out += "\n";
    else if (code === 0x09) out += "\t";
    else if (code === 0x1e) out += "-";
    else if (code === 0x1f || code < 0x20 || code === 0xfffd) continue;
    else out += ch;
  }
  return out
    .split("\n")
    .map((line) => line.replace(/( \| )+$/, "").replace(/\s+$/, ""))
    .filter((line) => line.trim());
}

export async function legacyDocToDoc(bytes: Uint8Array): Promise<RichDoc> {
  const XLSX = await import("xlsx");
  const CFB = (XLSX as unknown as { CFB: { read: (d: Uint8Array, o: { type: string }) => unknown; find: (c: unknown, p: string) => { content?: unknown } | null } }).CFB;
  const container = CFB.read(bytes, { type: "array" });
  const stream = (name: string) => asBytes(CFB.find(container, name)?.content);
  const word = stream("WordDocument");
  if (!word) throw new Error("Not a Word document");
  const raw = wordDocumentText(word, stream("0Table"), stream("1Table"));
  if (raw === null) throw new Error("Could not find the text of this Word document");

  const budget = new BlockBudget();
  const blocks: Block[] = [];
  for (const line of cleanWordText(raw)) {
    if (!budget.take()) break;
    blocks.push({ type: "paragraph", content: [{ text: line }] });
  }
  return { blocks, truncated: budget.truncated };
}
