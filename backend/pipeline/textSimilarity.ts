function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function stringSimilarity(a: string, b: string): number {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1.0;
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(la, lb) / maxLen;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

export function bm25Score(query: string, document: string, k1 = 1.5, b = 0.75): number {
  const queryTokens = tokenize(query);
  const docTokens = tokenize(document);
  if (queryTokens.length === 0 || docTokens.length === 0) return 0;

  const avgDocLen = docTokens.length;
  const docLen = docTokens.length;

  const termFreq: Record<string, number> = {};
  for (const token of docTokens) {
    termFreq[token] = (termFreq[token] || 0) + 1;
  }

  let score = 0;
  for (const qToken of queryTokens) {
    let bestTf = 0;
    for (const [dToken, freq] of Object.entries(termFreq)) {
      if (dToken === qToken) {
        bestTf = Math.max(bestTf, freq);
      } else if (stringSimilarity(qToken, dToken) > 0.75) {
        bestTf = Math.max(bestTf, freq * 0.8);
      }
    }
    if (bestTf > 0) {
      const idf = Math.log(1 + 1);
      const tfNorm = (bestTf * (k1 + 1)) / (bestTf + k1 * (1 - b + b * (docLen / avgDocLen)));
      score += idf * tfNorm;
    }
  }

  return score;
}

export interface FieldMatch {
  field: string;
  matchedHeader: string;
  columnIndex: number;
  confidence: number;
}

export function matchHeaders(
  headers: string[],
  expectedFields: { name: string; aliases: string[] }[]
): FieldMatch[] {
  const matches: FieldMatch[] = [];

  for (const field of expectedFields) {
    let bestMatch = { header: '', colIndex: -1, score: 0 };

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (!header || typeof header !== 'string') continue;
      const cleanHeader = header.trim();

      if (cleanHeader.toLowerCase() === field.name.toLowerCase()) {
        bestMatch = { header: cleanHeader, colIndex: i, score: 1.0 };
        break;
      }

      for (const alias of [field.name, ...field.aliases]) {
        const simScore = stringSimilarity(cleanHeader, alias);
        const bm25 = bm25Score(alias, cleanHeader);
        const containsBonus = cleanHeader.toLowerCase().includes(alias.toLowerCase().split(' ')[0]) ? 0.2 : 0;
        const combined = simScore * 0.5 + Math.min(bm25 / 3, 0.4) + containsBonus;

        if (combined > bestMatch.score) {
          bestMatch = { header: cleanHeader, colIndex: i, score: combined };
        }
      }
    }

    if (bestMatch.score > 0.35) {
      matches.push({
        field: field.name,
        matchedHeader: bestMatch.header,
        columnIndex: bestMatch.colIndex,
        confidence: Math.min(1, bestMatch.score)
      });
    }
  }

  return matches;
}

function normalizeSheetName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\d+[\.\)\-\s]+/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const KEYWORD_MAP: Record<string, string[]> = {
  client: ['client', 'company', 'entity', 'cover', 'information', 'info', 'details', 'instructions', 'instruction', 'measured'],
  financials: ['financial', 'finance', 'income', 'revenue', 'profit', 'loss', 'turnover', 'imports', 'import'],
  ownership: ['ownership', 'own', 'shareholder', 'share', 'voting', 'equity', 'shareholding'],
  management: ['management', 'control', 'mc', 'employment', 'equity', 'employee', 'staff', 'personnel', 'hr', 'human'],
  skills: ['skill', 'training', 'learnership', 'bursary', 'sdp', 'development'],
  procurement: ['procurement', 'pp', 'supplier', 'vendor', 'supply', 'preferential', 'spend'],
  esd: ['esd', 'enterprise', 'supplier development', 'ed', 'sd'],
  sed: ['sed', 'socio', 'social', 'csi', 'corporate social'],
  yes: ['yes', 'youth', 'employment service'],
  scorecard: ['scorecard', 'score', 'result', 'dashboard', 'summary', 'bbbee', 'b-bbee', 'level'],
  industry: ['industry', 'norm', 'sector', 'code'],
  eap: ['eap', 'economically active', 'demographic', 'population'],
};

const EXACT_ABBREVIATIONS: Record<string, string> = {
  'mc': 'management',
  'pp': 'procurement',
  'esd': 'esd',
  'sed': 'sed',
  'ed': 'esd',
  'sd': 'esd',
  'sdp': 'skills',
  'ee': 'management',
  'hr': 'management',
  'csi': 'sed',
  'yes': 'yes',
  'eap': 'eap',
  'own': 'ownership',
  'fin': 'financials',
  'instructions': 'client',
  'instruction': 'client',
  'imports': 'financials',
  'import': 'financials',
};

export function matchSheetName(
  sheetName: string,
  patterns: { key: string; names: string[] }[]
): { key: string; confidence: number } | null {
  const normalized = normalizeSheetName(sheetName);
  const tokens = normalized.split(/\s+/).filter(t => t.length > 0);

  if (tokens.length === 1 && EXACT_ABBREVIATIONS[tokens[0]]) {
    return { key: EXACT_ABBREVIATIONS[tokens[0]], confidence: 0.9 };
  }

  let best: { key: string; confidence: number } | null = null;

  for (const pattern of patterns) {
    for (const name of pattern.names) {
      if (normalized === name) {
        return { key: pattern.key, confidence: 1.0 };
      }
    }

    const keywords = KEYWORD_MAP[pattern.key] || [];
    let keywordHits = 0;
    let primaryHit = false;
    for (const token of tokens) {
      for (const kw of keywords) {
        if (token === kw || (token.length > 2 && kw.startsWith(token)) || (kw.length > 2 && token.startsWith(kw))) {
          keywordHits++;
          if (kw === keywords[0] || kw === keywords[1]) primaryHit = true;
          break;
        }
      }
    }

    if (keywordHits > 0) {
      const keywordScore = primaryHit ? 0.7 + (keywordHits - 1) * 0.1 : 0.4 + keywordHits * 0.1;
      const score = Math.min(1, keywordScore);
      if (!best || score > best.confidence) {
        best = { key: pattern.key, confidence: score };
      }
    }

    for (const name of pattern.names) {
      const sim = stringSimilarity(normalized, name);
      const bm25 = bm25Score(name, normalized);
      const fuzzyScore = sim * 0.6 + Math.min(bm25 / 3, 0.4);

      if (fuzzyScore > 0.4 && (!best || fuzzyScore > best.confidence)) {
        best = { key: pattern.key, confidence: Math.min(1, fuzzyScore) };
      }
    }
  }

  if (!best) {
    for (const token of tokens) {
      if (EXACT_ABBREVIATIONS[token]) {
        return { key: EXACT_ABBREVIATIONS[token], confidence: 0.7 };
      }
    }
  }

  return best;
}
