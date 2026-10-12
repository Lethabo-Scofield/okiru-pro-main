/**
 * HTML (an e-mail body, a saved web page) → the preview's document model.
 *
 * This is the sanitiser. The markup is parsed with DOMParser into an inert
 * document — scripts in it never run, its images never load — and then walked
 * against an allow-list. Only text, structure (headings, paragraphs, lists,
 * tables, quotes, code) and emphasis come out. Every attribute is dropped
 * except a link's href, and that only when it is http(s) or mailto. Scripts,
 * styles, frames, forms, SVG and event handlers have nowhere to go: the output
 * is data, drawn by React as text. A picture becomes a "[Picture]" note, and a
 * remote one is never fetched (no tracking pixels, no leaking that the
 * document was opened).
 */
import { BlockBudget, MAX_TABLE_ROWS } from "./limits";
import { safeHref } from "./safeHref";
import type { Block, Inline, InlineText, ListItem, RichDoc } from "./types";

type Style = Omit<InlineText, "text">;

/** Elements whose content is never shown. */
const DROP = new Set([
  "script", "style", "noscript", "template", "iframe", "frame", "frameset", "object", "embed", "applet",
  "head", "title", "meta", "link", "base", "svg", "math", "canvas", "audio", "video", "source", "track",
  "form", "input", "button", "select", "option", "textarea", "dialog", "map", "area", "portal",
]);

/** Elements that start a new paragraph. */
const BLOCKISH = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside", "nav", "address", "center",
  "figure", "figcaption", "dl", "dt", "dd", "fieldset", "details", "summary", "body", "html",
]);

const HEADINGS: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

class Builder {
  blocks: Block[] = [];
  private inline: Inline[] = [];
  readonly budget = new BlockBudget();

  text(raw: string, style: Style) {
    const text = raw.replace(/[\s ]+/g, " ");
    if (!text) return;
    const last = this.inline[this.inline.length - 1];
    // Collapse the space between two runs, and drop it at a paragraph's start.
    if (text === " " && (!last || ("br" in last) || (last as InlineText).text.endsWith(" "))) return;
    this.inline.push({ text, ...style });
  }

  br() {
    this.inline.push({ br: true });
  }

  /** The inline content gathered so far, trimmed, and reset. */
  takeInline(): Inline[] {
    const content = this.inline;
    this.inline = [];
    while (content.length && "br" in content[content.length - 1]) content.pop();
    const first = content[0] as InlineText | undefined;
    if (first && !("br" in first)) first.text = first.text.replace(/^\s+/, "");
    const last = content[content.length - 1] as InlineText | undefined;
    if (last && !("br" in last)) last.text = last.text.replace(/\s+$/, "");
    return content.filter((n) => "br" in n || n.text);
  }

  flush() {
    const content = this.takeInline();
    if (content.length) this.push({ type: "paragraph", content });
  }

  push(block: Block) {
    if (this.budget.take()) this.blocks.push(block);
  }
}

function cellText(el: Element): string {
  // innerText is not available on an inert document; textContent with the
  // block breaks put back is close enough for a table cell.
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) parts.push(node.nodeValue ?? "");
    else if (node.nodeType === 1) {
      const tag = (node as Element).localName;
      if (DROP.has(tag)) return;
      if (tag === "br") parts.push("\n");
      if (tag === "img") parts.push("[Picture]");
      node.childNodes.forEach(walk);
      if (tag === "p" || tag === "div" || tag === "li") parts.push("\n");
    }
  };
  walk(el);
  return parts
    .join("")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function tableRows(table: Element): { rows: string[][]; header: boolean; hidden: number } {
  const rows: string[][] = [];
  let header = false;
  let hidden = 0;
  const trs = Array.from(table.querySelectorAll("tr")).filter((tr) => tr.closest("table") === table);
  trs.forEach((tr, index) => {
    const cells = Array.from(tr.children).filter((c) => c.localName === "td" || c.localName === "th");
    if (!cells.length) return;
    if (index === 0 && cells.every((c) => c.localName === "th")) header = true;
    if (rows.length >= MAX_TABLE_ROWS) {
      hidden += 1;
      return;
    }
    rows.push(cells.map(cellText));
  });
  return { rows, header, hidden };
}

/** An e-mail laid out with tables: a "table" of one column is really paragraphs. */
function isLayoutTable(rows: string[][]): boolean {
  return rows.every((r) => r.filter(Boolean).length <= 1);
}

function walk(node: Node, b: Builder, style: Style, listItems: ListItem[] | null, depth: number) {
  if (b.budget.full) return;
  if (node.nodeType === 3) {
    b.text(node.nodeValue ?? "", style);
    return;
  }
  if (node.nodeType !== 1) return; // comments, processing instructions
  const el = node as Element;
  const tag = el.localName;
  if (DROP.has(tag)) return;
  const children = () => el.childNodes.forEach((child) => walk(child, b, style, listItems, depth));

  if (tag === "br") return b.br();
  if (tag === "img") {
    const src = el.getAttribute("src") ?? "";
    const alt = (el.getAttribute("alt") ?? "").trim();
    // Never fetched. Tracking pixels (1×1, no alt) are left out altogether.
    if (!alt && /^(https?:)?\/\//i.test(src)) return;
    b.text(alt ? ` [Picture: ${alt}] ` : " [Picture] ", { ...style, italic: true });
    return;
  }
  if (tag === "hr") {
    b.flush();
    b.push({ type: "rule" });
    return;
  }
  if (HEADINGS[tag]) {
    b.flush();
    children();
    const content = b.takeInline();
    if (content.length) b.push({ type: "heading", level: HEADINGS[tag], content });
    return;
  }
  if (tag === "pre") {
    b.flush();
    b.push({ type: "code", text: (el.textContent ?? "").replace(/\n$/, "") });
    return;
  }
  if (tag === "blockquote") {
    b.flush();
    children();
    const content = b.takeInline();
    if (content.length) b.push({ type: "quote", content });
    return;
  }
  if (tag === "table") {
    b.flush();
    const { rows, header, hidden } = tableRows(el);
    if (!rows.length) return;
    if (isLayoutTable(rows)) {
      // Walk the cells as ordinary content.
      el.querySelectorAll("td, th").forEach((cell) => {
        if (cell.closest("table") !== el) return;
        cell.childNodes.forEach((child) => walk(child, b, style, null, depth));
        b.flush();
      });
      return;
    }
    b.push({ type: "table", rows, header, ...(hidden ? { hiddenRows: hidden } : {}) });
    return;
  }
  if (tag === "ul" || tag === "ol") {
    const nested = listItems !== null;
    if (!nested) b.flush();
    const items: ListItem[] = nested ? listItems : [];
    el.childNodes.forEach((child) => {
      if (child.nodeType === 1 && (child as Element).localName === "li") {
        walk(child, b, style, items, nested ? depth + 1 : 0);
      } else walk(child, b, style, items, depth);
    });
    if (!nested && items.length) b.push({ type: "list", ordered: tag === "ol", items });
    return;
  }
  if (tag === "li") {
    // Text before a nested list belongs to this item; the nested list adds its own.
    const slot: ListItem = { content: [], depth };
    listItems?.push(slot);
    el.childNodes.forEach((child) => {
      const isList = child.nodeType === 1 && ["ul", "ol"].includes((child as Element).localName);
      if (isList) {
        slot.content.push(...b.takeInline());
        walk(child, b, style, listItems, depth);
      } else walk(child, b, style, listItems, depth);
    });
    slot.content.push(...b.takeInline());
    return;
  }

  const next: Style = { ...style };
  if (tag === "b" || tag === "strong") next.bold = true;
  else if (tag === "i" || tag === "em" || tag === "cite") next.italic = true;
  else if (tag === "u" || tag === "ins") next.underline = true;
  else if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  else if (tag === "code" || tag === "tt" || tag === "kbd" || tag === "samp") next.code = true;
  else if (tag === "a") {
    const href = safeHref(el.getAttribute("href"));
    if (href) next.href = href;
  }

  if (BLOCKISH.has(tag) && listItems === null) {
    b.flush();
    el.childNodes.forEach((child) => walk(child, b, next, listItems, depth));
    b.flush();
    return;
  }
  el.childNodes.forEach((child) => walk(child, b, next, listItems, depth));
}

export function htmlToDoc(html: string, opts: { truncated?: boolean } = {}): RichDoc {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const b = new Builder();
  walk(doc.body ?? doc.documentElement, b, {}, null, 0);
  b.flush();
  return { blocks: b.blocks, truncated: Boolean(opts.truncated) || b.budget.truncated };
}
