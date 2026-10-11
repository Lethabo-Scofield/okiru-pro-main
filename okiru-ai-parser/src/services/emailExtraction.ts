/**
 * An e-mail saved as a file (.eml, RFC 5322 with MIME parts) as readable text.
 *
 * A client's data-request thread is evidence like any letter: who asked whom
 * for what, by when, what was promised and what was attached. Saved from
 * Outlook it is a MIME tree (multipart/mixed > related > alternative) with
 * base64 or quoted-printable bodies, encoded headers and inline signature
 * images. Read here without any dependency:
 *
 *  - the message's own headers (From, To, Cc, Date, Subject), encoded words
 *    decoded;
 *  - the plain-text body when there is one, else the HTML body as markdown;
 *    the replies quoted inside it are the thread, so they are kept;
 *  - the attachments by name and type only. Their content is not read here
 *    (an attached document is evidence to upload on its own), and inline
 *    images (signature logos) are not listed.
 *
 * Pure apart from the HTML conversion; never throws on a malformed part — a
 * part it cannot decode is left out, and the rest is read.
 */
import { htmlToMarkdown } from './markdownConversion.js';

interface MimePart {
  headers: Map<string, string>;
  body: string;
}

/** Unfold continuation lines and split the header block from the body. */
function splitPart(raw: string): MimePart {
  const text = raw.replace(/\r\n/g, '\n');
  const end = text.search(/\n\n/);
  const head = end >= 0 ? text.slice(0, end) : text;
  const body = end >= 0 ? text.slice(end + 2) : '';
  const headers = new Map<string, string>();
  for (const line of head.replace(/\n[ \t]+/g, ' ').split('\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    // The first occurrence wins: a forwarded header block never overrides the message's own.
    if (!headers.has(name)) headers.set(name, line.slice(colon + 1).trim());
  }
  return { headers, body };
}

/** A header parameter: `boundary="..."`, `charset=utf-8`, `filename="a.pdf"`. */
function headerParam(value: string | undefined, name: string): string | null {
  if (!value) return null;
  const match = new RegExp(`(?:^|;)\\s*${name}\\*?=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(value);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function bytesAsText(bytes: Buffer, charset: string | null): string {
  const cs = (charset ?? 'utf-8').toLowerCase();
  if (/^(?:iso-8859-1|latin1|windows-1252|cp1252|us-ascii|ascii)$/.test(cs)) return bytes.toString('latin1');
  if (/^utf-?16/.test(cs)) return bytes.toString('utf16le');
  return bytes.toString('utf8');
}

function decodeQuotedPrintable(text: string): Buffer {
  const soft = text.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    const ch = soft[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(ch, 'utf8'));
    }
  }
  return Buffer.from(bytes);
}

function decodeBody(part: MimePart): string {
  const encoding = (part.headers.get('content-transfer-encoding') ?? '').toLowerCase().trim();
  const charset = headerParam(part.headers.get('content-type'), 'charset');
  if (encoding === 'base64') return bytesAsText(Buffer.from(part.body.replace(/\s+/g, ''), 'base64'), charset);
  if (encoding === 'quoted-printable') return bytesAsText(decodeQuotedPrintable(part.body), charset);
  return part.body;
}

/** RFC 2047 encoded words in a header: "=?utf-8?B?...?=", "=?iso-8859-1?Q?...?=". */
export function decodeHeaderWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_whole, charset: string, kind: string, data: string) => {
      try {
        const bytes = kind.toUpperCase() === 'B'
          ? Buffer.from(data, 'base64')
          : decodeQuotedPrintable(data.replace(/_/g, ' '));
        return bytesAsText(bytes, charset);
      } catch {
        return data;
      }
    });
}

interface Walked {
  plain: string[];
  html: string[];
  attachments: Array<{ name: string; type: string }>;
  /** E-mails attached to this one (a forwarded message), read in turn. */
  messages: MimePart[];
}

function walk(part: MimePart, out: Walked, depth = 0): void {
  if (depth > 12) return;
  const type = (part.headers.get('content-type') ?? 'text/plain').toLowerCase();
  const mediaType = type.split(';')[0].trim();
  if (mediaType === 'message/rfc822') {
    // An attached e-mail is part of the thread: read after this one.
    try {
      out.messages.push(splitPart(decodeBody(part)));
    } catch {
      // Unreadable: left out.
    }
    return;
  }
  if (mediaType.startsWith('multipart/')) {
    const boundary = headerParam(part.headers.get('content-type'), 'boundary');
    if (!boundary) return;
    const pieces = part.body.replace(/\r\n/g, '\n').split(`--${boundary}`);
    // pieces[0] is the preamble; a piece starting "--" is the closing delimiter.
    for (const piece of pieces.slice(1)) {
      if (piece.startsWith('--')) break;
      walk(splitPart(piece.replace(/^\n/, '')), out, depth + 1);
    }
    return;
  }
  const disposition = (part.headers.get('content-disposition') ?? '').toLowerCase();
  const name = headerParam(part.headers.get('content-disposition'), 'filename')
    ?? headerParam(part.headers.get('content-type'), 'name');
  if (disposition.startsWith('attachment') || (name && !disposition.startsWith('inline') && !mediaType.startsWith('text/'))) {
    out.attachments.push({ name: decodeHeaderWords(name ?? '(unnamed)'), type: mediaType });
    return;
  }
  if (disposition.startsWith('inline') && !mediaType.startsWith('text/')) return; // a signature logo
  try {
    if (mediaType === 'text/plain') out.plain.push(decodeBody(part));
    else if (mediaType === 'text/html') out.html.push(decodeBody(part));
  } catch {
    // An undecodable part is left out; the rest of the message is read.
  }
}

const SHOWN_HEADERS: Array<[string, string]> = [
  ['from', 'From'], ['to', 'To'], ['cc', 'Cc'], ['date', 'Date'], ['subject', 'Subject'],
];

/** One message's header lines, body and attachments; its attached e-mails follow it. */
function readMessage(message: MimePart, heading: string, depth = 0): Array<{ heading: string; head: string; body: string }> {
  // Headers are ASCII by the RFC (the file is read byte for byte); encoded words carry anything else.
  const header = (key: string) => decodeHeaderWords(Buffer.from(message.headers.get(key)!, 'latin1').toString('utf8'));
  const headerLines = SHOWN_HEADERS
    .filter(([key]) => message.headers.has(key))
    .map(([key, label]) => `${label}: ${header(key)}`);
  const walked: Walked = { plain: [], html: [], attachments: [], messages: [] };
  walk(message, walked);
  const plain = walked.plain.map((text) => text.replace(/\r\n/g, '\n').trim()).filter(Boolean).join('\n\n');
  const body = plain || walked.html.map((html) => htmlToMarkdown(html)).join('\n\n').trim();
  const attachments = [
    ...walked.attachments.map((a) => `${a.name} (${a.type})`),
    ...walked.messages.map((m) => `${m.headers.has('subject') ? decodeHeaderWords(Buffer.from(m.headers.get('subject')!, 'latin1').toString('utf8')) : 'an e-mail'} (attached e-mail)`),
  ];
  const head = [
    ...headerLines,
    ...(attachments.length > 0 ? [`Attachments: ${attachments.join('; ')}`] : []),
  ].join('\n');
  const attached = depth >= 4 ? [] : walked.messages.flatMap((m) => readMessage(m, 'Attached e-mail', depth + 1));
  return [{ heading, head, body }, ...attached];
}

/** The e-mail as markdown and as plain text (the same content, the body's own shape). */
export async function extractEmailText(buffer: Buffer): Promise<{ text: string; markdown: string }> {
  const messages = readMessage(splitPart(buffer.toString('latin1')), 'E-mail');
  const markdown = messages
    .map((m) => [`## ${m.heading}\n\n${m.head}`, m.body].filter((s) => s.trim()).join('\n\n'))
    .join('\n\n');
  const text = messages.map((m) => [m.head, m.body].filter((s) => s.trim()).join('\n\n')).join('\n\n');
  return { text, markdown };
}
