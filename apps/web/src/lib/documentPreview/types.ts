/**
 * The shape every readable document is turned into before it is shown.
 *
 * Word, Markdown, e-mail, PowerPoint and web pages are all converted into this
 * small model, and one React renderer (components/review/RichDocument.tsx)
 * draws it. Nothing in it is HTML: text is plain text, a link is a checked
 * URL, a picture is a placeholder. That is what keeps an uploaded document from
 * running code or calling out to the internet when it is previewed. The
 * renderer never uses dangerouslySetInnerHTML, so there is no markup to escape.
 */

export interface InlineText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  /** Only http(s) and mailto links survive (see safeHref). */
  href?: string;
}

export interface LineBreak {
  br: true;
}

export type Inline = InlineText | LineBreak;

export interface ListItem {
  content: Inline[];
  /** 0 for a top-level item, 1 for an item nested under it, and so on. */
  depth: number;
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | {
      type: "table";
      /** Plain-text cells. The first row is a header when `header` is true. */
      rows: string[][];
      header: boolean;
      /** Rows left out to keep the preview fast. */
      hiddenRows?: number;
    }
  | { type: "code"; text: string }
  | { type: "quote"; content: Inline[] }
  | { type: "rule" }
  /** A slide, or any titled group of blocks. */
  | { type: "section"; label: string; blocks: Block[] };

export interface Attachment {
  name: string;
  type: string;
  /** Decoded size in bytes, when it can be worked out. */
  size: number | null;
}

/** A converted document, ready to draw. */
export interface RichDoc {
  blocks: Block[];
  /** Part of the document was left out to keep the preview fast. */
  truncated: boolean;
  /** Labelled facts shown above the body: an e-mail's From, To and Date. */
  meta?: Array<{ label: string; value: string }>;
  /** An e-mail's subject, shown as its title. */
  title?: string;
  attachments?: Attachment[];
}

export function isLineBreak(node: Inline): node is LineBreak {
  return (node as LineBreak).br === true;
}

/** The plain text of a run of inline content. */
export function inlineText(content: Inline[]): string {
  return content.map((n) => (isLineBreak(n) ? "\n" : n.text)).join("");
}
