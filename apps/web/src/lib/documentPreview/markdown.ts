/**
 * Markdown → the preview's document model.
 *
 * Covers what notes and exported reports actually use: headings, paragraphs,
 * bullet and numbered lists (nested), tables, code, quotes, rules, bold,
 * italic, strike-through, inline code and links. Raw HTML inside the Markdown
 * is NOT rendered: it stays visible as the text it is. Pictures become a
 * "[Image: …]" note, so a note can't load a remote image.
 */
import { BlockBudget, MAX_TABLE_ROWS } from "./limits";
import { safeHref } from "./safeHref";
import type { Block, Inline, InlineText, ListItem, RichDoc } from "./types";

type Style = Omit<InlineText, "text">;

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|~<>]/;

/**
 * Inline parsing must stay near-linear: it runs on the main thread, on up to
 * MAX_TEXT_BYTES of text that may be one long line. Three things keep it so:
 *  - regexes look at a bounded window from the cursor, never `src.slice(i)`;
 *  - a closer search remembers its last answer (a later opener asks from
 *    further on, so the answer holds until the cursor passes it);
 *  - emphasis nests at most MAX_INLINE_DEPTH deep, and a line longer than
 *    MAX_INLINE_CHARS is shown as plain text past that point.
 */
export const MAX_INLINE_CHARS = 20_000;
const MAX_INLINE_DEPTH = 6;
/** A link, image or autolink longer than this is read as text. */
const MAX_LINK_CHARS = 2_048;

const IMAGE = /^!\[([^\]]*)\]\(([^)]*)\)/;
const LINK = /^\[((?:[^[\]]|\[[^\]]*\])+)\]\(\s*<?([^)\s>]*)>?(?:\s+["'][^"']*["'])?\s*\)/;
const AUTOLINK = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/i;

const EMPHASIS: Array<[string, Style]> = [
  ["**", { bold: true }],
  ["__", { bold: true }],
  ["~~", { strike: true }],
  ["*", { italic: true }],
  ["_", { italic: true }],
];

/** Is this a run of `marker` that can open emphasis at `i`? */
function canOpen(src: string, i: number, marker: string): boolean {
  const after = src[i + marker.length];
  if (!after || /\s/.test(after)) return false;
  // snake_case_words are not emphasis.
  if (marker[0] === "_" && i > 0 && /[A-Za-z0-9]/.test(src[i - 1])) return false;
  return true;
}

/** Is the `marker` at `j` a closer? Depends on `j` alone, not on where the search began. */
function closesAt(src: string, j: number, marker: string): boolean {
  const before = src[j - 1];
  const after = src[j + marker.length];
  const closes = before && !/\s/.test(before) && !(marker[0] === "_" && after && /[A-Za-z0-9]/.test(after));
  // "**" must not be read as two "*" closers.
  const sameRun = marker.length === 1 && (src[j + 1] === marker || src[j - 1] === marker);
  return Boolean(closes) && !sameRun;
}

/**
 * The first closer at or after `from`, remembering the answer: within one
 * string, a query from anywhere between the last start and the closer it found
 * has that same answer, so each stretch of the string is scanned once.
 */
function closerFinder(src: string) {
  const memo = new Map<string, { from: number; at: number }>();
  return (from: number, marker: string): number => {
    const last = memo.get(marker);
    if (last && from >= last.from && (last.at === -1 || from <= last.at)) return last.at;
    let j = src.indexOf(marker, from);
    while (j !== -1 && !closesAt(src, j, marker)) j = src.indexOf(marker, j + 1);
    memo.set(marker, { from, at: j });
    return j;
  };
}

export function parseInline(src: string, style: Style = {}, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ text: buf, ...style });
    buf = "";
  };
  // Past this point the line is plain text: still all there, never parsed.
  let tail = "";
  if (src.length > MAX_INLINE_CHARS) {
    tail = src.slice(MAX_INLINE_CHARS);
    src = src.slice(0, MAX_INLINE_CHARS);
  }
  const findClose = closerFinder(src);
  /** Code spans with no closer, by run: a later search from further on fails too. */
  const noCodeClose = new Map<string, number>();
  const windowAt = (i: number) => src.slice(i, i + MAX_LINK_CHARS);

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (ch === "\\" && i + 1 < src.length && ESCAPABLE.test(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      let n = 1;
      while (src[i + n] === "`") n += 1;
      const run = "`".repeat(n);
      const failedFrom = noCodeClose.get(run);
      const end = failedFrom !== undefined && i + n >= failedFrom ? -1 : src.indexOf(run, i + n);
      if (end > i) {
        flush();
        out.push({ ...style, text: src.slice(i + n, end).trim() || src.slice(i + n, end), code: true });
        i = end + n;
        continue;
      }
      if (failedFrom === undefined) noCodeClose.set(run, i + n);
      buf += run;
      i += n;
      continue;
    }
    if (ch === "!" && src[i + 1] === "[") {
      const m = IMAGE.exec(windowAt(i));
      if (m) {
        flush();
        out.push({ ...style, text: m[1] ? `[Image: ${m[1]}]` : "[Image]", italic: true });
        i += m[0].length;
        continue;
      }
    }
    if (ch === "[") {
      const m = LINK.exec(windowAt(i));
      if (m) {
        flush();
        const href = safeHref(m[2]);
        const inner = depth < MAX_INLINE_DEPTH ? parseInline(m[1], style, depth + 1) : [{ ...style, text: m[1] }];
        out.push(...(href ? inner.map((node) => ("br" in node ? node : { ...node, href })) : inner));
        i += m[0].length;
        continue;
      }
    }
    if (ch === "<") {
      const m = AUTOLINK.exec(windowAt(i));
      if (m) {
        flush();
        const href = safeHref(m[1]);
        out.push({ ...style, text: m[1], ...(href ? { href } : {}) });
        i += m[0].length;
        continue;
      }
    }
    let matched = false;
    if (depth < MAX_INLINE_DEPTH && (ch === "*" || ch === "_" || ch === "~")) {
      for (const [marker, extra] of EMPHASIS) {
        if (!src.startsWith(marker, i) || !canOpen(src, i, marker)) continue;
        const close = findClose(i + marker.length + 1, marker);
        if (close === -1) continue;
        flush();
        out.push(...parseInline(src.slice(i + marker.length, close), { ...style, ...extra }, depth + 1));
        i = close + marker.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    buf += ch;
    i += 1;
  }
  buf += tail;
  flush();
  return out;
}

/** A paragraph's lines → inline content, keeping hard line breaks. */
function paragraphInline(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((line, idx) => {
    const hard = /( {2,}|\\)$/.test(line);
    const text = line.replace(/( {2,}|\\)$/, "").trim();
    out.push(...parseInline(text));
    if (idx < lines.length - 1) out.push(hard ? { br: true } : { text: " " });
  });
  return out;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const ATX = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === "\\" && row[i + 1] === "|") {
      cell += "|";
      i += 1;
    } else if (row[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else cell += row[i];
  }
  cells.push(cell.trim());
  return cells;
}

/** Strip the inline markers from a table cell; cells are drawn as plain text. */
function cellText(cell: string): string {
  return parseInline(cell)
    .map((n) => ("br" in n ? "\n" : n.text))
    .join("");
}

export function markdownToDoc(source: string, opts: { truncated?: boolean } = {}): RichDoc {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const budget = new BlockBudget();
  let i = 0;

  const push = (block: Block) => {
    if (budget.take()) blocks.push(block);
  };

  while (i < lines.length && !budget.full) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const close = new RegExp(`^\\s{0,3}${fence[1][0] === "`" ? "`" : "~"}{${fence[1].length},}\\s*$`);
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i += 1;
      push({ type: "code", text: body.join("\n") });
      continue;
    }

    const atx = ATX.exec(line);
    if (atx) {
      push({ type: "heading", level: atx[1].length as 1, content: parseInline(atx[2]) });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      push({ type: "rule" });
      i += 1;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const rows: string[][] = [splitRow(line).map(cellText)];
      i += 2;
      let hidden = 0;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        if (rows.length <= MAX_TABLE_ROWS) rows.push(splitRow(lines[i]).map(cellText));
        else hidden += 1;
        i += 1;
      }
      push({ type: "table", rows, header: true, ...(hidden ? { hiddenRows: hidden } : {}) });
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim() && /^\s{0,3}>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i += 1;
      }
      push({ type: "quote", content: paragraphInline(body) });
      continue;
    }

    const first = LIST.exec(line);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const items: ListItem[] = [];
      const baseIndent = first[1].replace(/\t/g, "    ").length;
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (m) {
          const indent = m[1].replace(/\t/g, "    ").length;
          if (indent <= baseIndent && /\d/.test(m[2]) !== ordered) break;
          const task = /^\[([ xX])\]\s+(.*)$/.exec(m[3]);
          const text = task ? `${task[1] === " " ? "☐" : "☑"} ${task[2]}` : m[3];
          items.push({ content: parseInline(text), depth: Math.max(0, Math.floor((indent - baseIndent) / 2)) });
          i += 1;
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
          // A wrapped line of the item above.
          const last = items[items.length - 1];
          last.content.push({ text: " " }, ...parseInline(lines[i].trim()));
          i += 1;
        } else if (!lines[i].trim() && i + 1 < lines.length && LIST.test(lines[i + 1])) {
          i += 1; // a loose list: blank lines between items
        } else break;
      }
      push({ type: "list", ordered, items });
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      const next = lines[i];
      if (para.length && (ATX.test(next) || FENCE.test(next) || /^\s{0,3}>/.test(next) || LIST.test(next))) break;
      if (para.length && /^\s{0,3}(=+|-+)\s*$/.test(next)) {
        // Setext heading: the paragraph above the underline is the heading.
        push({ type: "heading", level: next.trim()[0] === "=" ? 1 : 2, content: paragraphInline(para) });
        para.length = 0;
        i += 1;
        break;
      }
      if (para.length && RULE.test(next)) break;
      para.push(next);
      i += 1;
    }
    if (para.length) push({ type: "paragraph", content: paragraphInline(para) });
  }

  return { blocks, truncated: Boolean(opts.truncated) || budget.truncated || i < lines.length };
}
