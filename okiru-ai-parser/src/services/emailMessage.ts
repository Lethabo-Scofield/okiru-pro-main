/**
 * An e-mail (.eml, message/rfc822) read as a document.
 *
 * A data request and its replies are evidence: they state the reporting
 * period, the deadline, who owns which figures, what was attached. The upload
 * used to refuse the file outright. Now its headers, its plain-text bodies and
 * its attachments' names are read, message by message — the messages a reply
 * quotes beneath it included — and the thread goes on as one text document
 * (classified, and read as an Other document when no listed type fits).
 *
 * Plain RFC 5322 / MIME, no dependency: headers (folded lines, RFC 2047
 * encoded words), multipart bodies, base64 and quoted-printable, charsets the
 * runtime's TextDecoder knows. Attachments are listed by name and size, never
 * read here — a forwarded spreadsheet is its own upload.
 */

export interface EmailAttachment {
  filename: string;
  contentType: string;
  /** Decoded size in bytes. */
  size: number;
}

export interface EmailMessage {
  from?: string;
  to?: string;
  cc?: string;
  date?: string;
  subject?: string;
  body: string;
  attachments: EmailAttachment[];
  /** True for a message found quoted in another's body rather than the file's own. */
  quoted?: boolean;
  /** True for a message attached whole (an e-mail forwarded as an attachment). */
  attached?: boolean;
}

export interface EmailThread {
  subject: string;
  messages: EmailMessage[];
  attachments: EmailAttachment[];
  text: string;
  markdown: string;
}

type Headers = Map<string, string>;

/** Split a raw part into its headers and its body at the first blank line. */
function splitPart(raw: string): { headers: Headers; body: string } {
  const at = raw.search(/\r?\n\r?\n/);
  const head = at < 0 ? raw : raw.slice(0, at);
  const body = at < 0 ? '' : raw.slice(at).replace(/^\r?\n\r?\n/, '');
  const headers: Headers = new Map();
  let current = '';
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && current) {
      headers.set(current, `${headers.get(current) ?? ''} ${line.trim()}`);
      continue;
    }
    const m = /^([!-9;-~]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    current = m[1].toLowerCase();
    // A repeated header (Received) keeps its first value; the ones read here never repeat.
    if (!headers.has(current)) headers.set(current, m[2]);
  }
  return { headers, body };
}

function decodeCharset(bytes: Buffer, charset: string | undefined): string {
  const name = (charset ?? 'utf-8').trim().replace(/^"|"$/g, '').toLowerCase();
  try {
    return new TextDecoder(name === 'us-ascii' ? 'utf-8' : name).decode(bytes);
  } catch {
    return bytes.toString('latin1');
  }
}

function quotedPrintableBytes(text: string): Buffer {
  const joined = text.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    const ch = joined[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      // The file is read byte for byte (latin1), so each character is one byte.
      bytes.push(ch.charCodeAt(0) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** RFC 2047: "=?utf-8?B?...?=" and "=?iso-8859-1?Q?...?=" inside a header. */
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, encoding: string, text: string) => {
      const bytes = encoding.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64')
        : quotedPrintableBytes(text.replace(/_/g, ' '));
      return decodeCharset(bytes, charset);
    });
}

/** A header's parameter: `boundary` of `multipart/mixed; boundary="x"`. */
function parameter(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const m = new RegExp(`(?:^|;)\\s*${name}\\*?=\\s*(?:"([^"]*)"|([^;\\s]*))`, 'i').exec(header);
  const value = m?.[1] ?? m?.[2];
  if (value === undefined) return undefined;
  // RFC 2231 (filename*=utf-8''name%20x.pdf).
  const extended = /^([^']*)'[^']*'(.*)$/.exec(value);
  return extended ? decodeURIComponent(extended[2]) : decodeEncodedWords(value);
}

function bodyBytes(body: string, encoding: string | undefined): Buffer {
  const kind = (encoding ?? '7bit').trim().toLowerCase();
  if (kind === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64');
  if (kind === 'quoted-printable') return quotedPrintableBytes(body);
  return Buffer.from(body, 'latin1');
}

/** HTML → readable text, for a message with no plain-text body. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface Walked {
  plain: string[];
  html: string[];
  attachments: EmailAttachment[];
  /** Messages attached whole (a forwarded .eml inside the e-mail). */
  attachedMessages: EmailMessage[];
}

function walk(raw: string, into: Walked, depth = 0): void {
  if (depth > 8) return;
  const { headers, body } = splitPart(raw);
  const contentType = headers.get('content-type') ?? 'text/plain';
  const type = contentType.split(';')[0].trim().toLowerCase();
  const disposition = headers.get('content-disposition') ?? '';
  const filename = parameter(disposition, 'filename') ?? parameter(contentType, 'name');

  if (type.startsWith('multipart/')) {
    const boundary = parameter(contentType, 'boundary');
    if (!boundary) return;
    const parts = body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`));
    // The preamble before the first boundary and the epilogue after the last are not parts.
    for (const part of parts.slice(1)) if (part.trim()) walk(part, into, depth + 1);
    return;
  }
  if (type === 'message/rfc822') {
    // An e-mail forwarded as an attachment is read like one forwarded inline,
    // after the message that carries it — and named among its attachments.
    const attached = messagesOf(body, depth + 1);
    if (/attachment/i.test(disposition)) {
      into.attachments.push({
        filename: filename ?? attached[0]?.subject ?? 'attached e-mail',
        contentType: type,
        size: Buffer.byteLength(body, 'latin1'),
      });
    }
    into.attachedMessages.push(...attached.map((m) => ({ ...m, attached: true })));
    return;
  }
  // A picture shown inside the message (a signature logo) is not an attachment.
  if (type.startsWith('image/') && !/attachment/i.test(disposition) && (/^\s*inline/i.test(disposition) || headers.has('content-id'))) return;
  const bytes = bodyBytes(body, headers.get('content-transfer-encoding'));
  if (/attachment/i.test(disposition) || (filename && !type.startsWith('text/'))) {
    into.attachments.push({ filename: filename ?? 'attachment', contentType: type, size: bytes.length });
    return;
  }
  if (type === 'text/plain') into.plain.push(decodeCharset(bytes, parameter(contentType, 'charset')));
  else if (type === 'text/html') into.html.push(decodeCharset(bytes, parameter(contentType, 'charset')));
  else if (filename) into.attachments.push({ filename, contentType: type, size: bytes.length });
}

/**
 * The messages a reply quotes beneath it: Outlook's "From: … Sent: …" block,
 * "-----Original Message-----", and "On <date>, <name> wrote:". Each starts a
 * message of its own, with the header lines it states.
 */
function splitQuoted(body: string): Array<{ header: Record<string, string>; body: string }> {
  const lines = body.split(/\r?\n/).map((line) => line.replace(/^>+\s?/, ''));
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^-{2,}\s*(original message|forwarded message)\s*-{2,}$/i.test(line)) starts.push(i);
    else if (/^from:\s*\S/i.test(line) && lines.slice(i + 1, i + 5).some((l) => /^(sent|date):\s*\S/i.test(l.trim()))) {
      if (starts[starts.length - 1] !== i - 1) starts.push(i);
    } else if (/^on .{6,120} wrote:$/i.test(line)) starts.push(i);
  }
  if (starts.length === 0) return [{ header: {}, body: body.trim() }];
  const out: Array<{ header: Record<string, string>; body: string }> = [{ header: {}, body: lines.slice(0, starts[0]).join('\n').trim() }];
  starts.forEach((start, n) => {
    const chunk = lines.slice(start, starts[n + 1] ?? lines.length);
    const header: Record<string, string> = {};
    let at = 0;
    const wrote = /^on (.{6,120}) wrote:$/i.exec(chunk[0]?.trim() ?? '');
    if (wrote) {
      header.from = wrote[1];
      at = 1;
    } else {
      if (/^-{2,}/.test(chunk[0]?.trim() ?? '')) at = 1;
      for (; at < chunk.length; at += 1) {
        const m = /^(from|sent|date|to|cc|subject):\s*(.*)$/i.exec(chunk[at].trim());
        if (!m) break;
        header[m[1].toLowerCase() === 'sent' ? 'date' : m[1].toLowerCase()] = m[2].trim();
      }
    }
    out.push({ header, body: chunk.slice(at).join('\n').trim() });
  });
  return out;
}

function messagesOf(raw: string, depth = 0): EmailMessage[] {
  const { headers } = splitPart(raw);
  const walked: Walked = { plain: [], html: [], attachments: [], attachedMessages: [] };
  walk(raw, walked, depth);
  const text = walked.plain.length > 0 ? walked.plain.join('\n\n') : htmlToText(walked.html.join('\n'));
  const header = (name: string) => {
    const value = headers.get(name);
    return value ? decodeEncodedWords(value).trim() : undefined;
  };
  const [own, ...quoted] = splitQuoted(text);
  return [
    {
      from: header('from'),
      to: header('to'),
      cc: header('cc'),
      date: header('date'),
      subject: header('subject'),
      body: own.body,
      attachments: walked.attachments,
    },
    ...quoted.map((q) => ({ ...q.header, body: q.body, attachments: [], quoted: true })),
    ...walked.attachedMessages,
  ];
}

const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

/** Read an .eml file: its messages, their bodies, its attachments' names — as text and markdown. */
export function readEmailThread(buffer: Buffer): EmailThread {
  const raw = buffer.toString('latin1');
  const messages = messagesOf(raw);
  const subject = messages[0]?.subject ?? '';
  const attachments = messages.flatMap((m) => m.attachments);
  const blocks = messages.map((message, i) => {
    const lines = [
      `## Message ${i + 1}${message.quoted ? ' (quoted in the reply above)' : message.attached ? ' (attached e-mail)' : ''}`,
      message.from ? `From: ${message.from}` : '',
      message.date ? `Date: ${message.date}` : '',
      message.to ? `To: ${message.to}` : '',
      message.cc ? `Cc: ${message.cc}` : '',
      message.subject ? `Subject: ${message.subject}` : '',
      message.attachments.length
        ? `Attachments: ${message.attachments.map((a) => `${a.filename} (${kb(a.size)})`).join('; ')}`
        : '',
      '',
      message.body,
    ];
    return lines.filter((line, n) => line !== '' || n === 7).join('\n');
  });
  const markdown = [`# E-mail thread${subject ? `: ${subject}` : ''}`, '', ...blocks].join('\n\n').trim();
  return { subject, messages, attachments, text: markdown.replace(/^#+\s*/gm, ''), markdown };
}
