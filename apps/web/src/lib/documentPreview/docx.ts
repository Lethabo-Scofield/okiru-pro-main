/**
 * Word (.docx) → the preview's document model, in the browser.
 *
 * A .docx is a zip of XML parts. jszip (already used by the app) unpacks it and
 * DOMParser reads `word/document.xml`: paragraphs, headings (by style), bullet
 * and numbered lists (by numbering), tables, bold/italic/underline, line breaks
 * and hyperlinks. The parser reads Word files with mammoth on the server; this
 * is the same reading done locally, so the preview needs no server round-trip
 * and works on a file that has not been read yet.
 *
 * Pictures show as "[Picture]". Headers, footers, comments and tracked
 * deletions are left out; tracked insertions are shown.
 */
import { BlockBudget, MAX_TABLE_ROWS } from "./limits";
import { safeHref } from "./safeHref";
import type { Block, Inline, InlineText, ListItem, RichDoc } from "./types";

type Style = Omit<InlineText, "text">;

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function kids(el: Element, name?: string): Element[] {
  return Array.from(el.children).filter((c) => !name || c.localName === name);
}

function kid(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  return Array.from(el.children).find((c) => c.localName === name) ?? null;
}

/** An attribute by its local name, whatever namespace prefix the writer used. */
function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  for (const a of Array.from(el.attributes)) if (a.localName === name) return a.value;
  return null;
}

function val(el: Element | null): string | null {
  return attr(el, "val");
}

function all(doc: Document, name: string): Element[] {
  return Array.from(doc.getElementsByTagNameNS("*", name));
}

/** <w:b/> is on; <w:b w:val="0"/> or "false" is off. */
function on(el: Element | null): boolean {
  if (!el) return false;
  const v = val(el);
  return v === null || !/^(0|false|off|none)$/i.test(v);
}

interface Context {
  /** styleId → heading level. */
  headingStyles: Map<string, 1 | 2 | 3 | 4 | 5 | 6>;
  /** "numId:ilvl" → is it numbered (not bullets)? */
  numbered: Map<string, boolean>;
  /** relationship id → link target. */
  links: Map<string, string>;
  budget: BlockBudget;
}

function readHeadingStyles(stylesXml: string | null): Map<string, 1 | 2 | 3 | 4 | 5 | 6> {
  const out = new Map<string, 1 | 2 | 3 | 4 | 5 | 6>();
  if (!stylesXml) return out;
  const doc = parseXml(stylesXml);
  for (const style of all(doc, "style")) {
    const id = attr(style, "styleId");
    if (!id) continue;
    const name = val(kid(style, "name")) ?? id;
    const outline = val(kid(kid(style, "pPr"), "outlineLvl"));
    const m = /^(?:heading|kop|titre|überschrift|rubrik)\s*(\d)$/i.exec(name.trim());
    let level: number | null = m ? Number(m[1]) : null;
    if (level === null && /^title$/i.test(name)) level = 1;
    if (level === null && /^subtitle$/i.test(name)) level = 2;
    if (level === null && outline !== null && Number(outline) < 6) level = Number(outline) + 1;
    if (level !== null && level >= 1 && level <= 6) out.set(id, level as 1);
  }
  return out;
}

function readNumbering(numberingXml: string | null): Map<string, boolean> {
  const out = new Map<string, boolean>();
  if (!numberingXml) return out;
  const doc = parseXml(numberingXml);
  const abstract = new Map<string, Map<string, boolean>>();
  for (const a of all(doc, "abstractNum")) {
    const levels = new Map<string, boolean>();
    for (const lvl of kids(a, "lvl")) {
      const fmt = val(kid(lvl, "numFmt")) ?? "bullet";
      levels.set(attr(lvl, "ilvl") ?? "0", !/^(bullet|none)$/i.test(fmt));
    }
    abstract.set(attr(a, "abstractNumId") ?? "", levels);
  }
  for (const num of all(doc, "num")) {
    const levels = abstract.get(val(kid(num, "abstractNumId")) ?? "");
    if (!levels) continue;
    levels.forEach((numbered, ilvl) => out.set(`${attr(num, "numId")}:${ilvl}`, numbered));
  }
  return out;
}

function readLinks(relsXml: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!relsXml) return out;
  const doc = parseXml(relsXml);
  for (const rel of all(doc, "Relationship")) {
    if (!/hyperlink$/i.test(rel.getAttribute("Type") ?? "")) continue;
    const href = safeHref(rel.getAttribute("Target"));
    if (href) out.set(rel.getAttribute("Id") ?? "", href);
  }
  return out;
}

function runStyle(run: Element, base: Style): Style {
  const pr = kid(run, "rPr");
  if (!pr) return base;
  const style: Style = { ...base };
  if (on(kid(pr, "b"))) style.bold = true;
  if (on(kid(pr, "i"))) style.italic = true;
  if (on(kid(pr, "strike")) || on(kid(pr, "dstrike"))) style.strike = true;
  const u = kid(pr, "u");
  if (u && val(u) !== "none") style.underline = true;
  return style;
}

/** The inline content of a paragraph (or any run container). */
function inlineOf(container: Element, ctx: Context, base: Style, out: Inline[] = []): Inline[] {
  for (const node of Array.from(container.children)) {
    switch (node.localName) {
      case "r": {
        const style = runStyle(node, base);
        for (const part of Array.from(node.children)) {
          const name = part.localName;
          if (name === "t") out.push({ text: part.textContent ?? "", ...style });
          else if (name === "tab") out.push({ text: "\t", ...style });
          else if (name === "br" || name === "cr") {
            if (attr(part, "type") !== "page") out.push({ br: true });
          } else if (name === "noBreakHyphen") out.push({ text: "-", ...style });
          else if (name === "sym") out.push({ text: "•", ...style });
          else if (name === "drawing" || name === "pict" || name === "object") out.push({ text: "[Picture]", italic: true });
        }
        break;
      }
      case "hyperlink": {
        const href = ctx.links.get(attr(node, "id") ?? "");
        inlineOf(node, ctx, href ? { ...base, href } : base, out);
        break;
      }
      case "ins":
      case "smartTag":
      case "fldSimple":
      case "customXml":
      case "sdt":
        inlineOf(node.localName === "sdt" ? kid(node, "sdtContent") ?? node : node, ctx, base, out);
        break;
      default:
        // del (tracked deletions), bookmarks, proofing marks, comments: not shown.
        break;
    }
  }
  return out;
}

function trimInline(content: Inline[]): Inline[] {
  const out = content.filter((n) => "br" in n || n.text);
  while (out.length && "br" in out[out.length - 1]) out.pop();
  return out;
}

function paragraphText(p: Element, ctx: Context): string {
  return inlineOf(p, ctx, {})
    .map((n) => ("br" in n ? "\n" : n.text))
    .join("");
}

function tableOf(tbl: Element, ctx: Context): Block | null {
  const rows: string[][] = [];
  let hidden = 0;
  for (const tr of kids(tbl, "tr")) {
    if (rows.length >= MAX_TABLE_ROWS) {
      hidden += 1;
      continue;
    }
    const cells: string[] = [];
    for (const tc of kids(tr, "tc")) {
      const span = Number(val(kid(kid(tc, "tcPr"), "gridSpan")) ?? 1);
      const text = cellParagraphs(tc, ctx).join("\n").trim();
      cells.push(text);
      for (let s = 1; s < span && s < 20; s += 1) cells.push("");
    }
    rows.push(cells);
  }
  if (!rows.length) return null;
  return { type: "table", rows, header: false, ...(hidden ? { hiddenRows: hidden } : {}) };
}

function cellParagraphs(container: Element, ctx: Context): string[] {
  const out: string[] = [];
  for (const node of Array.from(container.children)) {
    if (node.localName === "p") out.push(paragraphText(node, ctx));
    else if (node.localName === "tbl") {
      // A table inside a cell: flatten it into lines.
      for (const tr of kids(node, "tr")) out.push(kids(tr, "tc").map((tc) => cellParagraphs(tc, ctx).join(" ")).join(" | "));
    } else if (node.localName === "sdt") out.push(...cellParagraphs(kid(node, "sdtContent") ?? node, ctx));
  }
  return out;
}

function bodyBlocks(body: Element, ctx: Context, blocks: Block[]) {
  let list: { ordered: boolean; items: ListItem[] } | null = null;
  const closeList = () => {
    if (list && ctx.budget.take()) blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    list = null;
  };
  const push = (block: Block) => {
    closeList();
    if (ctx.budget.take()) blocks.push(block);
  };

  for (const node of Array.from(body.children)) {
    if (ctx.budget.full) break;
    if (node.localName === "sdt") {
      closeList();
      bodyBlocks(kid(node, "sdtContent") ?? node, ctx, blocks);
      continue;
    }
    if (node.localName === "tbl") {
      const table = tableOf(node, ctx);
      if (table) push(table);
      continue;
    }
    if (node.localName !== "p") continue;

    const pPr = kid(node, "pPr");
    const content = trimInline(inlineOf(node, ctx, {}));
    const styleId = val(kid(pPr, "pStyle"));
    const outline = val(kid(pPr, "outlineLvl"));
    const numPr = kid(pPr, "numPr");
    const level = (styleId && ctx.headingStyles.get(styleId)) || (outline !== null && Number(outline) < 6 ? ((Number(outline) + 1) as 1) : null);

    if (numPr && !level) {
      if (!content.length) continue;
      const numId = val(kid(numPr, "numId")) ?? "0";
      const ilvl = Number(val(kid(numPr, "ilvl")) ?? 0);
      if (numId === "0") {
        push({ type: "paragraph", content });
        continue;
      }
      const ordered = ctx.numbered.get(`${numId}:${ilvl}`) ?? false;
      const current = list as { ordered: boolean; items: ListItem[] } | null;
      if (current && (ilvl > 0 || current.ordered === ordered)) {
        current.items.push({ content, depth: Math.min(ilvl, 6) });
      } else {
        closeList();
        list = { ordered, items: [{ content, depth: Math.min(ilvl, 6) }] };
      }
      continue;
    }
    if (!content.length) {
      closeList();
      continue;
    }
    if (level) push({ type: "heading", level, content });
    else push({ type: "paragraph", content });
  }
  closeList();
}

export async function docxToDoc(bytes: ArrayBuffer | Uint8Array): Promise<RichDoc> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const part = (name: string) => zip.file(name)?.async("string") ?? Promise.resolve(null);
  const [documentXml, stylesXml, numberingXml, relsXml] = await Promise.all([
    part("word/document.xml"),
    part("word/styles.xml"),
    part("word/numbering.xml"),
    part("word/_rels/document.xml.rels"),
  ]);
  if (!documentXml) throw new Error("Not a Word document");

  const ctx: Context = {
    headingStyles: readHeadingStyles(stylesXml),
    numbered: readNumbering(numberingXml),
    links: readLinks(relsXml),
    budget: new BlockBudget(),
  };
  const doc = parseXml(documentXml);
  const body = all(doc, "body")[0];
  if (!body) throw new Error("Not a Word document");
  const blocks: Block[] = [];
  bodyBlocks(body, ctx, blocks);
  return { blocks, truncated: ctx.budget.truncated };
}
