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

/** Is this a run of `marker` that can open emphasis at `i`? */
function canOpen(src: string, i: number, marker: string): boolean {
  const after = src[i + marker.length];
  if (!after || /\s/.test(after)) return false;
  // snake_case_words are not emphasis.
  if (marker[0] === "_" && i > 0 && /[A-Za-z0-9]/.test(src[i - 1])) return false;
  return true;
}

function findClose(src: string, from: number, marker: string): number {
  let j = src.indexOf(marker, from);
  while (j !== -1) {
    const before = src[j - 1];
    const after = src[j + marker.length];
    const closes = before && !/\s/.test(before) && !(marker[0] === "_" && after && /[A-Za-z0-9]/.test(after));
    // "**" must not be read as two "*" closers.
    const sameRun = marker.length === 1 && (src[j + 1] === marker || src[j - 1] === marker);
    if (closes && !sameRun) return j;
    j = src.indexOf(marker, j + 1);
  }
  return -1;
}

export function parseInline(src: string, style: Style = {}): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ text: buf, ...style });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);

    if (ch === "\\" && i + 1 < src.length && ESCAPABLE.test(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const run = /^`+/.exec(rest)![0];
      const end = src.indexOf(run, i + run.length);
      if (end > i) {
        flush();
        out.push({ ...style, text: src.slice(i + run.length, end).trim() || src.slice(i + run.length, end), code: true });
        i = end + run.length;
        continue;
      }
    }
    if (ch === "!" && src[i + 1] === "[") {
      const m = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(rest);
      if (m) {
        flush();
        out.push({ ...style, text: m[1] ? `[Image: ${m[1]}]` : "[Image]", italic: true });
        i += m[0].length;
        continue;
      }
    }
    if (ch === "[") {
      const m = /^\[((?:[^[\]]|\[[^\]]*\])+)\]\(\s*<?([^)\s>]*)>?(?:\s+["'][^"']*["'])?\s*\)/.exec(rest);
      if (m) {
        flush();
        const href = safeHref(m[2]);
        const inner = parseInline(m[1], style);
        out.push(...(href ? inner.map((n) => ("br" in n ? n : { ...n, href })) : inner));
        i += m[0].length;
        continue;
      }
    }
    if (ch === "<") {
      const m = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/i.exec(rest);
      if (m) {
        flush();
        const href = safeHref(m[1]);
        out.push({ ...style, text: m[1], ...(href ? { href } : {}) });
        i += m[0].length;
        continue;
      }
    }
    let matched = false;
    for (const [marker, extra] of [
      ["**", { bold: true }],
      ["__", { bold: true }],
      ["~~", { strike: true }],
      ["*", { italic: true }],
      ["_", { italic: true }],
    ] as Array<[string, Style]>) {
      if (!rest.startsWith(marker) || !canOpen(src, i, marker)) continue;
      const close = findClose(src, i + marker.length + 1, marker);
      if (close === -1) continue;
      flush();
      out.push(...parseInline(src.slice(i + marker.length, close), { ...style, ...extra }));
      i = close + marker.length;
      matched = true;
      break;
    }
    if (matched) continue;
    buf += ch;
    i += 1;
  }
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
