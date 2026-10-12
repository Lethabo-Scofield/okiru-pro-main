/**
 * An e-mail (.eml) → the preview's document model: From, To, Cc and Date as
 * labelled facts, the Subject as the title, the body, and a list of the
 * attachments (name, type, size).
 *
 * The body is the HTML part when there is one — through the sanitiser in
 * html.ts, so no script runs and no remote image loads — and the plain-text
 * part otherwise. Attachments are listed, never opened.
 */
import { htmlToDoc } from "./html";
import { BlockBudget } from "./limits";
import { plainToBlocks } from "./plain";
import type { Attachment, Block, RichDoc } from "./types";

interface Part {
  headers: Map<string, string>;
  /** The raw body, one character per byte. */
  body: string;
}

/** Bytes → a string with one char per byte, so MIME offsets stay byte offsets. */
function binaryString(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return out;
}

function toBytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

function decodeText(bytes: Uint8Array, charset: string | undefined): string {
  const label = (charset || "utf-8").trim().replace(/^"|"$/g, "").toLowerCase();
  try {
    return new TextDecoder(label === "us-ascii" ? "utf-8" : label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function splitHeaders(raw: string): Part {
  const match = /\r?\n\r?\n/.exec(raw);
  const head = match ? raw.slice(0, match.index) : raw;
  const body = match ? raw.slice(match.index + match[0].length) : "";
  const headers = new Map<string, string>();
  // Unfold: a line starting with space or tab continues the header above.
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (!headers.has(name)) headers.set(name, line.slice(colon + 1).trim());
  }
  return { headers, body };
}

/** `text/html; charset="utf-8"` → { value: "text/html", params: { charset: "utf-8" } } */
function headerParams(value: string | undefined): { value: string; params: Record<string, string> } {
  if (!value) return { value: "", params: {} };
  const [first, ...rest] = value.split(";");
  const params: Record<string, string> = {};
  const continued: Record<string, string[]> = {};
  for (const piece of rest) {
    const eq = piece.indexOf("=");
    if (eq < 0) continue;
    let key = piece.slice(0, eq).trim().toLowerCase();
    let v = piece.slice(eq + 1).trim().replace(/^"|"$/g, "");
    // RFC 2231: filename*=utf-8''name%20here, or split as filename*0*=…
    const cont = /^(.+?)\*(\d+)\*?$/.exec(key);
    if (cont) {
      (continued[cont[1]] ??= [])[Number(cont[2])] = v;
      continue;
    }
    if (key.endsWith("*")) {
      key = key.slice(0, -1);
      v = decode2231(v);
    }
    params[key] = v;
  }
  for (const [key, pieces] of Object.entries(continued)) params[key] ??= decode2231(pieces.join(""));
  return { value: first.trim().toLowerCase(), params };
}

function decode2231(v: string): string {
  const m = /^([^']*)'[^']*'(.*)$/.exec(v);
  if (!m) return v;
  try {
    const bytes = toBytes(m[2].replace(/%([0-9a-f]{2})/gi, (_x, h) => String.fromCharCode(parseInt(h, 16))));
    return decodeText(bytes, m[1] || "utf-8");
  } catch {
    return m[2];
  }
}

/** RFC 2047 encoded words: =?utf-8?B?…?= and =?iso-8859-1?Q?…?= */
export function decodeHeader(value: string): string {
  return value
    .replace(/(=\?[^?]+\?[bq]\?[^?]*\?=)\s+(?==\?[^?]+\?[bq]\?)/gi, "$1")
    .replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_m, charset: string, enc: string, text: string) => {
      try {
        const binary = enc.toLowerCase() === "b"
          ? atob(text.replace(/\s+/g, ""))
          : text.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_x, h) => String.fromCharCode(parseInt(h, 16)));
        return decodeText(toBytes(binary), charset.replace(/\*.*$/, ""));
      } catch {
        return text;
      }
    });
}

function decodeTransfer(body: string, encoding: string | undefined): string {
  const enc = (encoding ?? "").trim().toLowerCase();
  if (enc === "base64") {
    try {
      return atob(body.replace(/[^A-Za-z0-9+/=]/g, ""));
    } catch {
      return "";
    }
  }
  if (enc === "quoted-printable") {
    return body.replace(/=\r?\n/g, "").replace(/=([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)));
  }
  return body;
}

/** The size an attachment will have once decoded, without decoding it. */
function decodedSize(body: string, encoding: string | undefined): number {
  const enc = (encoding ?? "").trim().toLowerCase();
  if (enc === "base64") {
    const clean = body.replace(/[^A-Za-z0-9+/=]/g, "");
    return Math.max(0, Math.floor((clean.length * 3) / 4) - (clean.match(/=+$/)?.[0].length ?? 0));
  }
  return body.length;
}

interface Collected {
  html: string | null;
  plain: string | null;
  attachments: Attachment[];
}

const MAX_PARTS = 200;

function collect(part: Part, out: Collected, depth = 0, count = { n: 0 }) {
  if (depth > 8 || count.n++ > MAX_PARTS) return;
  const type = headerParams(part.headers.get("content-type") || "text/plain");
  const disposition = headerParams(part.headers.get("content-disposition"));
  const encoding = part.headers.get("content-transfer-encoding");
  const filename = decodeHeader(disposition.params.filename || type.params.name || "");

  if (type.value.startsWith("multipart/")) {
    const boundary = type.params.boundary;
    if (!boundary) return;
    const marker = `--${boundary}`;
    const pieces = part.body.split(marker);
    // pieces[0] is the preamble; a piece starting with "--" is the closing boundary.
    for (const piece of pieces.slice(1)) {
      if (piece.startsWith("--")) break;
      collect(splitHeaders(piece.replace(/^[ \t]*\r?\n/, "")), out, depth + 1, count);
    }
    return;
  }

  const isAttachment = disposition.value === "attachment" || (Boolean(filename) && !type.value.startsWith("text/"));
  if (!isAttachment && type.value === "text/html" && out.html === null) {
    out.html = decodeText(toBytes(decodeTransfer(part.body, encoding)), type.params.charset);
    return;
  }
  if (!isAttachment && (type.value === "text/plain" || type.value === "") && out.plain === null) {
    out.plain = decodeText(toBytes(decodeTransfer(part.body, encoding)), type.params.charset);
    return;
  }
  if (type.value === "message/rfc822" && !filename) {
    const subject = splitHeaders(part.body).headers.get("subject");
    out.attachments.push({ name: subject ? `${decodeHeader(subject)}.eml` : "Forwarded message.eml", type: "message/rfc822", size: part.body.length });
    return;
  }
  if (filename || isAttachment || type.value.startsWith("image/") || type.value.startsWith("application/")) {
    out.attachments.push({
      name: filename || "Unnamed attachment",
      type: type.value || "application/octet-stream",
      size: decodedSize(part.body, encoding),
    });
  }
}

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

export function emlToDoc(bytes: Uint8Array): RichDoc {
  const root = splitHeaders(binaryString(bytes));
  const header = (name: string) => {
    const v = root.headers.get(name);
    return v ? decodeHeader(v) : "";
  };

  const collected: Collected = { html: null, plain: null, attachments: [] };
  collect(root, collected);

  const meta: Array<{ label: string; value: string }> = [];
  for (const [label, name] of [["From", "from"], ["To", "to"], ["Cc", "cc"], ["Date", "date"]] as const) {
    const v = header(name);
    if (v) meta.push({ label, value: name === "date" ? formatDate(v) : v });
  }

  let blocks: Block[];
  let truncated = false;
  if (collected.html !== null && collected.html.trim()) {
    const doc = htmlToDoc(collected.html);
    blocks = doc.blocks;
    truncated = doc.truncated;
  } else {
    const budget = new BlockBudget();
    blocks = plainToBlocks(collected.plain ?? "", budget);
    truncated = budget.truncated;
  }

  return {
    title: header("subject") || "(no subject)",
    meta,
    blocks,
    truncated,
    attachments: collected.attachments,
  };
}
