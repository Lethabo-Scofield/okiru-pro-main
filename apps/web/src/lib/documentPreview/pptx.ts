/**
 * PowerPoint (.pptx) → the preview's document model: one section per slide,
 * holding the slide's title, its text as paragraphs or bullets, and its
 * tables. The parser's pptxToMarkdown (okiru-ai-parser markdownConversion.ts)
 * reads the same `ppt/slides/slideN.xml` parts the same way; this keeps the
 * title and table structure the preview can show. Pictures and charts are
 * not drawn.
 */
import { BlockBudget, MAX_SLIDES, MAX_TABLE_ROWS } from "./limits";
import type { Block, Inline, ListItem, RichDoc } from "./types";

function kids(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name);
}

function descendants(el: Element, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS("*", name));
}

function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  for (const a of Array.from(el.attributes)) if (a.localName === name) return a.value;
  return null;
}

function slideNumber(name: string): number {
  const m = /slide(\d+)\.xml$/i.exec(name);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** One <a:p>: its runs, with bold and italic kept. */
function paragraphInline(p: Element): Inline[] {
  const out: Inline[] = [];
  for (const node of Array.from(p.children)) {
    if (node.localName === "r" || node.localName === "fld") {
      const pr = kids(node, "rPr")[0];
      const text = kids(node, "t").map((t) => t.textContent ?? "").join("");
      if (!text) continue;
      out.push({
        text,
        ...(attr(pr, "b") === "1" ? { bold: true } : {}),
        ...(attr(pr, "i") === "1" ? { italic: true } : {}),
      });
    } else if (node.localName === "br") out.push({ br: true });
  }
  return out;
}

function isTitleShape(sp: Element): boolean {
  const ph = descendants(sp, "ph")[0];
  const type = attr(ph, "type");
  return type === "title" || type === "ctrTitle";
}

function shapeBlocks(sp: Element, budget: BlockBudget): Block[] {
  const body = kids(sp, "txBody")[0];
  if (!body) return [];
  const paragraphs = kids(body, "p")
    .map((p) => {
      const pPr = kids(p, "pPr")[0];
      const bulleted = pPr ? kids(pPr, "buChar").length > 0 || kids(pPr, "buAutoNum").length > 0 : false;
      const noBullet = pPr ? kids(pPr, "buNone").length > 0 : false;
      return { content: paragraphInline(p), depth: Number(attr(pPr, "lvl") ?? 0), bulleted, noBullet };
    })
    .filter((p) => p.content.length);
  if (!paragraphs.length) return [];

  if (isTitleShape(sp)) {
    if (!budget.take()) return [];
    return [{ type: "heading", level: 3, content: paragraphs.flatMap((p, i) => (i ? [{ text: " " }, ...p.content] : p.content)) }];
  }

  // Body text on a slide is bullets unless it says otherwise.
  const listy = paragraphs.length > 1 && paragraphs.some((p) => !p.noBullet);
  if (listy) {
    if (!budget.take()) return [];
    const items: ListItem[] = paragraphs.map((p) => ({ content: p.content, depth: Math.min(p.depth, 6) }));
    return [{ type: "list", ordered: false, items }];
  }
  const out: Block[] = [];
  for (const p of paragraphs) if (budget.take()) out.push({ type: "paragraph", content: p.content });
  return out;
}

function tableBlock(tbl: Element, budget: BlockBudget): Block | null {
  const rows: string[][] = [];
  let hidden = 0;
  for (const tr of kids(tbl, "tr")) {
    if (rows.length >= MAX_TABLE_ROWS) {
      hidden += 1;
      continue;
    }
    rows.push(
      kids(tr, "tc").map((tc) =>
        descendants(tc, "p")
          .map((p) => paragraphInline(p).map((n) => ("br" in n ? "\n" : n.text)).join(""))
          .filter(Boolean)
          .join("\n"),
      ),
    );
  }
  if (!rows.length || !budget.take()) return null;
  return { type: "table", rows, header: true, ...(hidden ? { hiddenRows: hidden } : {}) };
}

/** Shapes, groups and table frames in the order they sit on the slide. */
function treeBlocks(tree: Element, budget: BlockBudget, out: Block[]) {
  for (const node of Array.from(tree.children)) {
    if (budget.full) return;
    if (node.localName === "sp") {
      const blocks = shapeBlocks(node, budget);
      // The title goes first, wherever it sits in the shape tree.
      if (blocks[0]?.type === "heading") out.unshift(...blocks);
      else out.push(...blocks);
    } else if (node.localName === "grpSp") treeBlocks(node, budget, out);
    else if (node.localName === "graphicFrame") {
      const tbl = descendants(node, "tbl")[0];
      const block = tbl ? tableBlock(tbl, budget) : null;
      if (block) out.push(block);
    }
  }
}

export async function pptxToDoc(bytes: ArrayBuffer | Uint8Array): Promise<RichDoc> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (!names.length && !zip.file("ppt/presentation.xml")) throw new Error("Not a PowerPoint file");

  const budget = new BlockBudget();
  const blocks: Block[] = [];
  const shown = names.slice(0, MAX_SLIDES);
  for (let i = 0; i < shown.length && !budget.full; i += 1) {
    const xml = await zip.file(shown[i])!.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const tree = doc.getElementsByTagNameNS("*", "spTree")[0];
    const slide: Block[] = [];
    if (tree) treeBlocks(tree, budget, slide);
    blocks.push({ type: "section", label: `Slide ${i + 1}`, blocks: slide });
  }
  return { blocks, truncated: budget.truncated || names.length > shown.length };
}
