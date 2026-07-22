/**
 * Split a long document so all of it is read, instead of the first 60,000
 * characters being read and the rest silently scored as absent.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS: `content.slice(0, MAX_DOCUMENT_CHARS)`
 * is indistinguishable, downstream, from "the document did not contain that
 * field". A 300-page evidence pack was read to roughly page 12 and everything
 * after it was reported as missing — the same silent-zero failure this whole
 * re-architecture exists to end, sitting inside the paid product.
 *
 * DESIGN
 *  - Split on STRUCTURE first (markdown headings, page markers), because a
 *    value and its label must not land in different chunks. `Expiry Date:` in
 *    one chunk and `14 March 2027` in the next is worse than either alone.
 *  - OVERLAP consecutive chunks so a boundary cannot sever a label from its
 *    value. The cost is re-reading a little text; the alternative is losing it.
 *  - Chunking is reported, never silent: the caller learns how many chunks a
 *    document became.
 *  - A document that fits is ONE chunk, byte-identical to the input. The common
 *    case pays nothing.
 */

/** Chunk size in characters. Comfortably inside any current context window. */
const DEFAULT_CHUNK_CHARS = Number(process.env.AI_EXTRACTION_CHUNK_CHARS ?? 40_000);

/**
 * How much of the previous chunk to repeat at the start of the next. Sized to
 * carry a table header plus several rows, since the field/value pairs that
 * straddle a boundary are usually inside a table.
 */
const DEFAULT_OVERLAP_CHARS = Number(process.env.AI_EXTRACTION_CHUNK_OVERLAP ?? 2_000);

/**
 * Hard ceiling on chunks per document, so a pathological upload cannot fan out
 * without limit. Exceeding it is REPORTED (see `truncated`), never silent.
 */
const MAX_CHUNKS = Number(process.env.AI_EXTRACTION_MAX_CHUNKS ?? 40);

export interface DocumentChunk {
  /** 0-based position in the document. */
  index: number;
  text: string;
  /** Character offset in the original, for provenance. */
  startOffset: number;
}

export interface ChunkedDocument {
  chunks: DocumentChunk[];
  /** True when the document exceeded MAX_CHUNKS and was cut short. */
  truncated: boolean;
  /** Total characters in the source, so callers can report what was seen. */
  totalChars: number;
}

/**
 * Structural boundaries, strongest first. A split at a heading keeps a section
 * whole; a split mid-sentence does not.
 */
const BOUNDARY_PATTERNS = [
  /\n(?=#{1,3} )/g,      // markdown headings
  /\n(?=## Page \d+)/g,  // our PDF page markers
  /\n\n+/g,              // paragraph breaks
  /\n/g,                 // any line break
];

/**
 * Find the best place to cut at or before `limit`, preferring structure.
 * Returns `limit` when no boundary is usable — a hard cut with overlap still
 * beats losing the remainder.
 */
function findSplitPoint(text: string, limit: number): number {
  if (text.length <= limit) return text.length;

  // Only consider boundaries in the last third of the window, so a chunk stays
  // reasonably full rather than splitting at the first heading it sees.
  const earliest = Math.floor(limit * 0.66);

  for (const pattern of BOUNDARY_PATTERNS) {
    let best = -1;
    pattern.lastIndex = 0;
    for (const match of text.slice(0, limit).matchAll(pattern)) {
      const at = (match.index ?? 0) + 1;
      if (at >= earliest && at <= limit) best = at;
    }
    if (best > 0) return best;
  }
  return limit;
}

/**
 * Split a document into overlapping, structure-aligned chunks.
 * A document within the chunk size returns exactly one chunk.
 */
export function chunkDocument(
  text: string,
  options: { chunkChars?: number; overlapChars?: number; maxChunks?: number } = {},
): ChunkedDocument {
  const chunkChars = options.chunkChars ?? DEFAULT_CHUNK_CHARS;
  const overlapChars = Math.min(options.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(chunkChars / 2));
  const maxChunks = options.maxChunks ?? MAX_CHUNKS;
  const totalChars = text.length;

  if (totalChars <= chunkChars) {
    return {
      chunks: totalChars > 0 ? [{ index: 0, text, startOffset: 0 }] : [],
      truncated: false,
      totalChars,
    };
  }

  const chunks: DocumentChunk[] = [];
  let cursor = 0;

  while (cursor < totalChars && chunks.length < maxChunks) {
    const remaining = text.slice(cursor);
    const splitAt = findSplitPoint(remaining, chunkChars);
    const slice = remaining.slice(0, splitAt);

    chunks.push({ index: chunks.length, text: slice, startOffset: cursor });

    if (cursor + splitAt >= totalChars) break;
    // Step forward by the chunk MINUS the overlap, so the next chunk repeats
    // the tail of this one and a label cannot be severed from its value.
    const advance = Math.max(1, splitAt - overlapChars);
    cursor += advance;
  }

  return {
    chunks,
    truncated: cursor < totalChars && chunks.length >= maxChunks,
    totalChars,
  };
}

/**
 * Merge per-chunk extraction results into one.
 *
 * FIRST NON-EMPTY WINS. Chunks overlap, so the same field is often found twice;
 * the earlier occurrence is kept because documents state their headline facts
 * before their annexures. A later chunk can only FILL a field, never overwrite
 * one — so a value in an appendix cannot quietly replace the one on the cover.
 */
export function mergeChunkResults<T extends Record<string, unknown>>(
  results: T[],
): { merged: T; fieldsFoundPerChunk: number[] } {
  const merged = {} as T;
  const fieldsFoundPerChunk: number[] = [];

  for (const result of results) {
    let found = 0;
    for (const [key, value] of Object.entries(result)) {
      if (value === null || value === undefined || value === '') continue;
      found += 1;
      if (merged[key as keyof T] === undefined) {
        merged[key as keyof T] = value as T[keyof T];
      }
    }
    fieldsFoundPerChunk.push(found);
  }

  return { merged, fieldsFoundPerChunk };
}
