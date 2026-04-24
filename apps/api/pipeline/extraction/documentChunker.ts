/**
 * Hierarchical document chunker for PDFs and long text.
 *
 * Ports the hierarchical chunking system from the Python audit-ai codebase.
 * Produces structured segments for retrieval with section paths, location types,
 * and page classification.
 */

export interface DocumentChunk {
  chunkId: string;
  documentId: string;
  pageId: string;
  text: string;
  sectionPath: string[]; // hierarchical path, e.g. ["3. Financial Statements", "3.1 Income Statement"]
  locationType: 'header' | 'body' | 'footer' | 'table' | 'toc';
  pageType: 'cover' | 'toc' | 'content' | 'appendix' | 'unknown';
  charStart: number;
  charEnd: number;
  metadata: {
    wordCount: number;
    hasNumbers: boolean;
    hasCurrency: boolean;
    sectionLevel: number;
  };
}

export interface ChunkerConfig {
  maxChunkSize: number; // default 1000 chars
  overlapSize: number; // default 200 chars
  minChunkSize: number; // default 100 chars
  preserveSentences: boolean; // default true
}

export interface SectionHeading {
  text: string;
  level: number;
  charOffset: number;
}

const DEFAULT_CONFIG: Required<ChunkerConfig> = {
  maxChunkSize: 1000,
  overlapSize: 200,
  minChunkSize: 100,
  preserveSentences: true,
};

// Abbreviations that should not trigger sentence splits
const ABBREVIATIONS = new Set([
  'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'vs', 'inc', 'ltd', 'co', 'no',
  'fig', 'approx', 'est', 'etc', 'al', 'e.g', 'i.e', 'cf', 'ca', 'vol', 'pp',
]);

/**
 * Detect page type from text and page index.
 */
export function detectPageType(text: string, pageIndex: number): DocumentChunk['pageType'] {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Page 0 or 1 with short text: cover
  if ((pageIndex === 0 || pageIndex === 1) && trimmed.length < 500) {
    return 'cover';
  }

  // Contains many "..." or page numbers in sequence: toc
  const dotsCount = (trimmed.match(/\.{2,}/g) || []).length;
  const pageNumSequence = trimmed.match(/\b\d+\s*\|\s*\d+\b/g); // e.g. "1 | 15"
  if (dotsCount >= 3 || (pageNumSequence && pageNumSequence.length >= 2)) {
    return 'toc';
  }

  // Contains "appendix" or "annexure"
  if (/\bappendix\b|\bannexure\b/.test(lower)) {
    return 'appendix';
  }

  return 'content';
}

/**
 * Detect location type of a text segment.
 */
export function detectLocationType(text: string): DocumentChunk['locationType'] {
  const trimmed = text.trim();
  if (!trimmed) return 'body';

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());

  // First line: heading patterns
  const firstLine = lines[0]?.trim() ?? '';
  if (firstLine) {
    // All caps line (short)
    if (firstLine === firstLine.toUpperCase() && firstLine.length < 80 && firstLine.length > 2) {
      return 'header';
    }
    // Numbered heading: "1. ", "1.1 ", "1.1.1 "
    if (/^\d+(\.\d+)*\.?\s+/.test(firstLine)) {
      return 'header';
    }
    // Short bold-like (short line, maybe with emphasis)
    if (firstLine.length < 60 && lines.length <= 1) {
      return 'header';
    }
  }

  // Table-like: multiple tabs, pipe chars, consistent column alignment
  const tabCount = (trimmed.match(/\t/g) || []).length;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  const hasMultipleColumns = lines.some((line) => {
    const parts = line.split(/[\t|]/).filter(Boolean);
    return parts.length >= 3;
  });
  if (tabCount >= 3 || (pipeCount >= 2 && hasMultipleColumns)) {
    return 'table';
  }

  return 'body';
}

/**
 * Detect section headings in text and return them sorted by char offset.
 */
export function detectSectionHeadings(text: string): SectionHeading[] {
  const results: SectionHeading[] = [];
  const lines = text.split(/\r?\n/);
  let charOffset = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const lineStart = charOffset;
    charOffset += line.length + 1; // +1 for newline

    if (!trimmed) continue;

    let level = 0;
    let match: RegExpMatchArray | null = null;

    // Numbered: "1. ", "1.1 ", "1.1.1 ", "1)", "1.1)"
    if ((match = trimmed.match(/^(\d+(?:\.\d+)*)\.?\s*(.+)/))) {
      const numPart = match[1];
      const depth = (numPart.match(/\./g) || []).length + 1;
      level = depth;
      results.push({ text: trimmed, level, charOffset: lineStart });
      continue;
    }

    // ALL-CAPS line (heading)
    if (trimmed === trimmed.toUpperCase() && trimmed.length >= 3 && trimmed.length < 120) {
      level = 1;
      results.push({ text: trimmed, level, charOffset: lineStart });
      continue;
    }

    // Line ending with colon (often a heading)
    if (trimmed.endsWith(':') && trimmed.length < 100) {
      level = 1;
      results.push({ text: trimmed.slice(0, -1), level, charOffset: lineStart });
    }
  }

  return results.sort((a, b) => a.charOffset - b.charOffset);
}

/**
 * Split text into sentences, avoiding splits on abbreviations and decimals.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text.trim()) return [];

  // Replace sentence-ending punctuation with a sentinel, then split
  const sentences: string[] = [];
  const matches = [...text.matchAll(/([.!?])\s+/g)];

  let lastEnd = 0;
  for (const m of matches) {
    const punctIdx = m.index! + m[1].length;
    const afterSpace = m.index! + m[0].length;
    const beforePunct = text.slice(Math.max(0, punctIdx - 15), punctIdx);

    // Skip if looks like abbreviation (e.g. "Dr.", "Fig.")
    const wordBefore = beforePunct.match(/(\S+)\s*$/);
    if (wordBefore) {
      const w = wordBefore[1];
      const word = w.toLowerCase().replace(/[.!?]$/, '');
      if (ABBREVIATIONS.has(word)) continue;
      // Decimal: number followed by period (e.g. "3.14" or "3.")
      if (/\d\.\d/.test(w) || /^\d+\.$/.test(w)) continue;
    }

    const sentence = text.slice(lastEnd, afterSpace).trim();
    if (sentence) sentences.push(sentence);
    lastEnd = afterSpace;
  }

  const remainder = text.slice(lastEnd).trim();
  if (remainder) sentences.push(remainder);

  return sentences;
}

/**
 * Count words in text (simple whitespace split).
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Check if text contains numeric values.
 */
function hasNumbers(text: string): boolean {
  return /\d/.test(text);
}

/**
 * Check if text contains currency patterns.
 */
function hasCurrency(text: string): boolean {
  return /[R$£€]\s*\d|USD|ZAR|EUR|GBP|\d+\s*(?:million|billion|thousand)/i.test(text);
}

/**
 * Build section path hierarchy for a given character offset.
 */
function buildSectionPathAtOffset(
  headings: SectionHeading[],
  charOffset: number
): { path: string[]; level: number } {
  const applicable = headings.filter((h) => h.charOffset <= charOffset);
  if (applicable.length === 0) return { path: [], level: 0 };

  const path: string[] = [];
  let lastLevel = 0;
  const stack: SectionHeading[] = [];

  for (const h of applicable) {
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    stack.push(h);
  }

  for (const h of stack) {
    path.push(h.text);
    lastLevel = h.level;
  }

  return { path, level: lastLevel };
}

/**
 * DocumentChunker - hierarchical chunking for documents.
 */
export class DocumentChunker {
  private config: Required<ChunkerConfig>;

  constructor(config?: Partial<ChunkerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Chunk a single page's text.
   */
  chunkText(text: string, documentId: string, pageId: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const { maxChunkSize, overlapSize, minChunkSize, preserveSentences } = this.config;

    const headings = detectSectionHeadings(text);
    const pageType = detectPageType(text, 0); // page index unknown in single-page mode

    if (!text.trim()) {
      return chunks;
    }

    let segments: string[];
    if (preserveSentences) {
      const sentences = splitIntoSentences(text);
      segments = [];
      let buf = '';
      for (const s of sentences) {
        if (buf.length + s.length + 1 <= maxChunkSize) {
          buf = buf ? buf + ' ' + s : s;
        } else {
          if (buf) segments.push(buf);
          buf = s.length <= maxChunkSize ? s : s; // oversize sentence as single segment
        }
      }
      if (buf) segments.push(buf);
    } else {
      const words = text.split(/\s+/).filter(Boolean);
      segments = [];
      let start = 0;
      const step = Math.max(1, Math.floor((maxChunkSize - overlapSize) / 5));
      while (start < words.length) {
        let len = 0;
        let end = start;
        while (end < words.length && len + (end > start ? 1 : 0) + words[end].length <= maxChunkSize) {
          len += (end > start ? 1 : 0) + words[end].length;
          end++;
        }
        if (end === start) end++;
        const chunk = words.slice(start, end).join(' ');
        if (chunk) segments.push(chunk);
        start += Math.max(1, step);
      }
    }

    // Apply overlap between chunks; merge small segments
    const overlapped: { text: string; charStart: number; charEnd: number }[] = [];
    let globalPos = 0;

    for (let i = 0; i < segments.length; i++) {
      let seg = segments[i];
      let charStart = text.indexOf(seg, globalPos);
      if (charStart < 0) charStart = globalPos;
      let charEnd = charStart + seg.length;
      globalPos = charEnd;

      // Merge small segment with previous
      if (
        seg.length < minChunkSize &&
        overlapped.length > 0 &&
        overlapped[overlapped.length - 1].text.length + seg.length <= maxChunkSize * 1.5
      ) {
        const prev = overlapped.pop()!;
        const combined = prev.text + ' ' + seg;
        overlapped.push({
          text: combined,
          charStart: prev.charStart,
          charEnd,
        });
        continue;
      }

      if (i > 0 && overlapSize > 0 && segments[i - 1]) {
        const prev = segments[i - 1];
        const overlapStart = Math.max(0, prev.length - overlapSize);
        const overlapText = prev.slice(overlapStart);
        seg = overlapText + ' ' + seg;
        charStart = Math.max(0, charStart - overlapText.length);
      }
      overlapped.push({ text: seg, charStart, charEnd });
    }

    for (let i = 0; i < overlapped.length; i++) {
      const { text: chunkText, charStart, charEnd } = overlapped[i];

      const { path, level } = buildSectionPathAtOffset(headings, charStart);
      const locationType = detectLocationType(chunkText);

      const chunk: DocumentChunk = {
        chunkId: `${documentId}_${pageId}_chunk_${String(i).padStart(4, '0')}`,
        documentId,
        pageId,
        text: chunkText,
        sectionPath: path,
        locationType: locationType as DocumentChunk['locationType'],
        pageType,
        charStart,
        charEnd,
        metadata: {
          wordCount: countWords(chunkText),
          hasNumbers: hasNumbers(chunkText),
          hasCurrency: hasCurrency(chunkText),
          sectionLevel: level,
        },
      };
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Chunk multiple pages, maintaining section path across pages.
   */
  chunkPages(
    pages: Array<{ pageId: string; text: string }>,
    documentId: string
  ): DocumentChunk[] {
    const allChunks: DocumentChunk[] = [];
    let globalSectionPath: string[] = [];
    let chunkIndex = 0;

    for (let p = 0; p < pages.length; p++) {
      const { pageId, text } = pages[p];
      const pageChunks = this.chunkText(text, documentId, pageId);
      const headings = detectSectionHeadings(text);
      const pageType = detectPageType(text, p);

      for (const c of pageChunks) {
        // Update section path from headings when available
        const lastHeading = headings
          .filter((h) => h.charOffset <= c.charStart)
          .pop();
        if (lastHeading) {
          globalSectionPath = [...c.sectionPath];
        }

        allChunks.push({
          ...c,
          chunkId: `${documentId}_${pageId}_chunk_${String(chunkIndex).padStart(4, '0')}`,
          pageType,
          sectionPath: c.sectionPath.length > 0 ? c.sectionPath : globalSectionPath,
        });
        chunkIndex++;
      }

      if (headings.length > 0) {
        globalSectionPath = headings.map((h) => h.text);
      }
    }

    return allChunks;
  }

  /**
   * Chunk a full document by splitting on page breaks.
   */
  chunkDocument(documentId: string, fullText: string): DocumentChunk[] {
    const pageBreaks = /\f|---PAGE---/;
    const pages = fullText.split(pageBreaks).map((text, i) => ({
      pageId: `page_${String(i + 1).padStart(3, '0')}`,
      text,
    }));
    return this.chunkPages(pages, documentId);
  }

  /**
   * Get statistics for a chunk array.
   */
  getStats(chunks: DocumentChunk[]): {
    totalChunks: number;
    avgChunkSize: number;
    sectionCount: number;
    pageTypes: Record<string, number>;
  } {
    if (chunks.length === 0) {
      return { totalChunks: 0, avgChunkSize: 0, sectionCount: 0, pageTypes: {} };
    }

    const totalChars = chunks.reduce((acc, c) => acc + c.text.length, 0);
    const sectionPaths = new Set(chunks.map((c) => c.sectionPath.join(' > ')).filter(Boolean));
    const pageTypes: Record<string, number> = {};

    for (const c of chunks) {
      pageTypes[c.pageType] = (pageTypes[c.pageType] || 0) + 1;
    }

    return {
      totalChunks: chunks.length,
      avgChunkSize: Math.round(totalChars / chunks.length),
      sectionCount: sectionPaths.size,
      pageTypes,
    };
  }
}
