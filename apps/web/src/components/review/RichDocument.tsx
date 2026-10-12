/**
 * Draws a converted document (lib/documentPreview) as readable text: a Word
 * file, a Markdown note, an e-mail, slides, a web page, a CSV or a text file.
 *
 * Everything here is React text. There is no dangerouslySetInnerHTML and no
 * <img>: a link is drawn only with an href the converter already checked
 * (http, https or mailto), and it opens in a new tab with no referrer.
 *
 * The typography is set for reading, not scanning: a comfortable measure,
 * 1.6 line height, real headings, quiet tables. Dark theme tokens only.
 */
import { Fragment, type ReactNode } from "react";
import { Paperclip } from "lucide-react";
import type { Block, Inline, ListItem, RichDoc } from "@/lib/documentPreview/types";
import { isLineBreak } from "@/lib/documentPreview/types";

function renderInline(content: Inline[]): ReactNode {
  return content.map((node, i) => {
    if (isLineBreak(node)) return <br key={i} />;
    let el: ReactNode = node.text;
    if (node.code) el = <code className="rounded bg-white/[0.07] px-1 py-px font-mono text-[0.88em] text-white/90">{el}</code>;
    if (node.bold) el = <strong className="font-semibold text-white">{el}</strong>;
    if (node.italic) el = <em>{el}</em>;
    if (node.underline) el = <span className="underline underline-offset-2">{el}</span>;
    if (node.strike) el = <s>{el}</s>;
    if (node.href) {
      el = (
        <a
          href={node.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          referrerPolicy="no-referrer"
          className="text-white underline decoration-white/30 underline-offset-2 hover:decoration-white"
        >
          {el}
        </a>
      );
    }
    return <Fragment key={i}>{el}</Fragment>;
  });
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-6 mb-3 text-[19px] leading-7 font-semibold text-white first:mt-0",
  2: "mt-6 mb-2.5 text-[16.5px] leading-6 font-semibold text-white first:mt-0",
  3: "mt-5 mb-2 text-[14.5px] leading-6 font-semibold text-white first:mt-0",
  4: "mt-4 mb-1.5 text-[13.5px] leading-6 font-semibold text-white first:mt-0",
  5: "mt-4 mb-1.5 text-[13px] leading-6 font-semibold text-white/90 first:mt-0",
  6: "mt-4 mb-1.5 text-[12.5px] leading-6 font-semibold uppercase tracking-wide text-white/80 first:mt-0",
};

/** A flat list with depths → nested <ul>/<ol>, so screen readers hear the structure. */
function renderList(items: ListItem[], ordered: boolean, depth = 0, start = 0): { node: ReactNode; next: number } {
  const Tag = ordered ? "ol" : "ul";
  const children: ReactNode[] = [];
  let i = start;
  while (i < items.length && items[i].depth >= depth) {
    const item = items[i];
    if (item.depth > depth) {
      // A nested list without a parent item at this depth: hang it on the last item.
      const nested = renderList(items, ordered, depth + 1, i);
      children.push(<li key={`n${i}`} className="list-none">{nested.node}</li>);
      i = nested.next;
      continue;
    }
    i += 1;
    let nested: ReactNode = null;
    if (i < items.length && items[i].depth > depth) {
      const inner = renderList(items, ordered, depth + 1, i);
      nested = inner.node;
      i = inner.next;
    }
    children.push(
      <li key={i} className="pl-1">
        {renderInline(item.content)}
        {nested}
      </li>,
    );
  }
  const node = (
    <Tag className={`${ordered ? "list-decimal" : "list-disc"} ${depth ? "mt-1 mb-0" : "mb-3"} space-y-1 pl-5 marker:text-white/40`}>
      {children}
    </Tag>
  );
  return { node, next: i };
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${Math.min(6, block.level + 1)}` as "h2";
      return (
        <Tag key={key} className={HEADING_CLASS[block.level]}>
          {renderInline(block.content)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="mb-3 whitespace-pre-wrap break-words">
          {renderInline(block.content)}
        </p>
      );
    case "list":
      return <Fragment key={key}>{renderList(block.items, block.ordered).node}</Fragment>;
    case "quote":
      return (
        <blockquote key={key} className="mb-3 whitespace-pre-wrap border-l-2 border-white/15 pl-3 italic">
          {renderInline(block.content)}
        </blockquote>
      );
    case "code":
      return (
        <pre key={key} className="mb-3 overflow-x-auto rounded-lg bg-white/[0.04] p-3 font-mono text-[11.5px] leading-5 text-white/85">
          {block.text}
        </pre>
      );
    case "rule":
      return <hr key={key} className="my-5 border-0 border-t border-[color:var(--rule)]" />;
    case "table": {
      const [head, ...body] = block.header ? block.rows : [null, ...block.rows];
      const width = Math.max(0, ...block.rows.map((r) => r.length));
      const pad = (row: string[]) => [...row, ...Array(Math.max(0, width - row.length)).fill("")];
      return (
        <div key={key} className="mb-4 overflow-x-auto rounded-lg border border-[color:var(--rule)]" data-testid="rich-table">
          <table className="w-full border-collapse text-left text-[12px] leading-5">
            {head && (
              <thead className="bg-white/[0.04]">
                <tr>
                  {pad(head).map((cell, c) => (
                    <th key={c} scope="col" className="whitespace-pre-wrap border-b border-[color:var(--rule)] px-2.5 py-1.5 align-bottom font-semibold text-white">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="border-b border-white/[0.05] last:border-b-0">
                  {pad(row ?? []).map((cell, c) => (
                    <td key={c} className="max-w-[28rem] whitespace-pre-wrap break-words px-2.5 py-1.5 align-top text-white/75">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.hiddenRows ? (
            <p className="border-t border-[color:var(--rule)] px-2.5 py-1.5 text-[11px] text-[color:var(--body)]">
              {block.hiddenRows.toLocaleString("en-ZA")} more rows in the file.
            </p>
          ) : null}
        </div>
      );
    }
    case "section":
      return (
        <section key={key} className="mb-4 rounded-xl border border-[color:var(--rule)] bg-white/[0.02] px-4 py-3" data-testid="rich-section">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--body)]">{block.label}</p>
          {block.blocks.length ? (
            block.blocks.map(renderBlock)
          ) : (
            <p className="text-[12px] italic text-[color:var(--body)]">No text on this slide.</p>
          )}
        </section>
      );
  }
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RichDocument({ doc, fullFileAction }: { doc: RichDoc; fullFileAction?: ReactNode }) {
  const empty = !doc.blocks.length && !doc.meta?.length && !doc.title;
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-testid="rich-document">
      <article className="mx-auto max-w-[72ch] px-5 py-5 text-[13.5px] leading-[1.65] text-white/80 sm:px-7">
        {doc.title && <h2 className="mb-3 text-[17px] font-semibold leading-6 text-white">{doc.title}</h2>}
        {doc.meta && doc.meta.length > 0 && (
          <dl className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-[color:var(--rule)] pb-3 text-[12.5px]" data-testid="rich-meta">
            {doc.meta.map((m) => (
              <Fragment key={m.label}>
                <dt className="font-medium text-white/70">{m.label}</dt>
                <dd className="min-w-0 break-words">{m.value}</dd>
              </Fragment>
            ))}
          </dl>
        )}
        {doc.attachments && doc.attachments.length > 0 && (
          <div className="mb-4 rounded-lg border border-[color:var(--rule)] px-3 py-2" data-testid="rich-attachments">
            <p className="mb-1 text-[11.5px] font-semibold text-white/80">
              {doc.attachments.length === 1 ? "1 attachment" : `${doc.attachments.length} attachments`}
            </p>
            <ul className="space-y-0.5 text-[12px]">
              {doc.attachments.map((a, i) => (
                <li key={i} className="flex min-w-0 items-center gap-1.5">
                  <Paperclip className="h-3 w-3 shrink-0 text-white/40" aria-hidden />
                  <span className="min-w-0 truncate text-white/90">{a.name}</span>
                  {a.size != null && <span className="shrink-0 text-[11px]">· {formatSize(a.size)}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {doc.blocks.map(renderBlock)}
        {empty && <p className="italic">This document has no text to show.</p>}
        {doc.truncated && (
          <p className="mt-4 border-t border-[color:var(--rule)] pt-3 text-[12px]" data-testid="rich-truncated">
            Showing the start of this document. {fullFileAction ?? "Download for the full file."}
          </p>
        )}
      </article>
    </div>
  );
}

export default RichDocument;
