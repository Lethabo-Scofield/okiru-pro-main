export interface BM25SearchResult {
  pageId: string;
  score: number;
  rank: number;
  matchedTerms: string[];
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'and', 'but',
  'or', 'not', 'this', 'that', 'these', 'those', 'it', 'its', 'they',
  'them', 'what', 'how', 'when', 'where', 'who', 'which', 'why',
  'explain', 'summarize', 'describe', 'tell', 'me',
]);

export class BM25Index {
  private pageIds: string[] = [];
  private pageTexts: string[] = [];
  private tokenizedCorpus: string[][] = [];
  private avgDl: number = 0;
  private df: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private N: number = 0;
  private isBuilt: boolean = false;

  // BM25 parameters
  private k1 = 1.5;
  private b = 0.75;

  /**
   * Split text on word boundaries, lowercase, and optionally remove stop words.
   */
  tokenize(text: string, removeStopwords = true): string[] {
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);

    if (!removeStopwords) {
      return tokens;
    }

    return tokens.filter((t) => !STOP_WORDS.has(t));
  }

  /**
   * Add a page to the corpus. Does NOT rebuild until build() is called.
   */
  addPage(pageId: string, text: string): void {
    this.pageIds.push(pageId);
    this.pageTexts.push(text);
    const tokens = this.tokenize(text);
    this.tokenizedCorpus.push(tokens);
    this.isBuilt = false;
  }

  /**
   * Compute document frequencies, IDF values, and average doc length.
   * IDF = ln((N - df + 0.5) / (df + 0.5) + 1)
   */
  build(): void {
    this.N = this.tokenizedCorpus.length;

    if (this.N === 0) {
      this.avgDl = 0;
      this.df.clear();
      this.idf.clear();
      this.isBuilt = true;
      return;
    }

    // Reset document frequency map
    this.df.clear();

    // Count document frequency for each term
    for (const doc of this.tokenizedCorpus) {
      const uniqueTerms = new Set(doc);
      for (const term of uniqueTerms) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
    }

    // Compute IDF for each term: ln((N - df + 0.5) / (df + 0.5) + 1)
    this.idf.clear();
    for (const [term, docFreq] of this.df) {
      const idfValue = Math.log((this.N - docFreq + 0.5) / (docFreq + 0.5) + 1);
      this.idf.set(term, idfValue);
    }

    // Average document length
    const totalLength = this.tokenizedCorpus.reduce((sum, doc) => sum + doc.length, 0);
    this.avgDl = totalLength / this.N;

    this.isBuilt = true;
  }

  /**
   * Score each document against the query using BM25Okapi.
   * score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgDl))
   * Returns sorted by score descending with rank assigned.
   */
  search(query: string, topK = 10): BM25SearchResult[] {
    if (!this.isBuilt) {
      this.build();
    }

    const queryTokens = this.tokenize(query);
    const matchedTerms = [...new Set(queryTokens)];

    if (matchedTerms.length === 0) {
      return [];
    }

    const scores: { pageId: string; score: number }[] = [];

    for (let i = 0; i < this.tokenizedCorpus.length; i++) {
      const doc = this.tokenizedCorpus[i];
      const dl = doc.length;

      let docScore = 0;

      for (const term of matchedTerms) {
        const idf = this.idf.get(term) ?? 0;

        // Term frequency in this document
        let tf = 0;
        for (const t of doc) {
          if (t === term) tf++;
        }

        if (tf === 0) continue;

        const denominator =
          tf + this.k1 * (1 - this.b + (this.b * dl) / this.avgDl);
        docScore += idf * ((tf * (this.k1 + 1)) / denominator);
      }

      scores.push({
        pageId: this.pageIds[i],
        score: docScore,
      });
    }

    const sorted = scores
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return sorted.map((s, idx) => ({
      pageId: s.pageId,
      score: s.score,
      rank: idx + 1,
      matchedTerms,
    }));
  }

  getStats(): {
    documentCount: number;
    vocabularySize: number;
    avgDocLength: number;
    isBuilt: boolean;
  } {
    return {
      documentCount: this.N,
      vocabularySize: this.df.size,
      avgDocLength: this.avgDl,
      isBuilt: this.isBuilt,
    };
  }
}
