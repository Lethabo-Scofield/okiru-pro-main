/**
 * Plain text (a .txt note, an e-mail's text part) → paragraphs. Blank lines
 * separate paragraphs, single line breaks are kept, and a block of "> " lines
 * (a quoted reply) becomes a quote.
 */
import { BlockBudget } from "./limits";
import type { Block, Inline, RichDoc } from "./types";

export function plainToBlocks(text: string, budget: BlockBudget = new BlockBudget()): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    if (!budget.take()) break;
    const quoted = lines.every((l) => /^\s*>/.test(l));
    const content: Inline[] = [];
    lines.forEach((line, i) => {
      if (i) content.push({ br: true });
      content.push({ text: quoted ? line.replace(/^\s*>+\s?/, "") : line.replace(/\s+$/, "") });
    });
    blocks.push(quoted ? { type: "quote", content } : { type: "paragraph", content });
  }
  return blocks;
}

export function plainToDoc(text: string, opts: { truncated?: boolean } = {}): RichDoc {
  const budget = new BlockBudget();
  const blocks = plainToBlocks(text, budget);
  return { blocks, truncated: Boolean(opts.truncated) || budget.truncated };
}
