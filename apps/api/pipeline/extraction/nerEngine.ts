/**
 * Pure regex/rule-based Named Entity Recognition for audit documents.
 * Port of audit-ai NER system - no ML, no LLM.
 *
 * Extracts: ORG, MONEY, DATE, PERCENT, FISCAL_YEAR, FINANCIAL_NUMBER,
 * BEE_LEVEL, RACE_GROUP, GENDER, DESIGNATION
 */

const ENTITY_TYPE_ARRAY = [
  'ORG',
  'MONEY',
  'DATE',
  'PERCENT',
  'FISCAL_YEAR',
  'FINANCIAL_NUMBER',
  'BEE_LEVEL',
  'RACE_GROUP',
  'GENDER',
  'DESIGNATION',
] as const;

export type EntityType = (typeof ENTITY_TYPE_ARRAY)[number];

export const AUDIT_ENTITY_TYPES = new Set<EntityType>(ENTITY_TYPE_ARRAY);

export interface PageEntity {
  entityId: string;
  entityType: string;
  originalText: string;
  normalizedValue: string;
  pageId: string;
  documentId: string;
  spanStart: number;
  spanEnd: number;
}

export interface PageEntitiesResult {
  pageId: string;
  documentId: string;
  entities: PageEntity[];
  extractionTimestamp: string;
}

/** Pattern set: maps entity type names to regex arrays */
export type PatternSet = Record<string, RegExp[]>;

/** Create a pattern set from a record of entity type to regex arrays */
export function createPatternSet(patterns: Record<string, RegExp[]>): PatternSet {
  return { ...patterns };
}

/** Default B-BBEE audit entity patterns (full set including BEE-specific types) */
export const DEFAULT_BBBEE_PATTERNS: PatternSet = {
  MONEY: [
    /R\s?\d{1,3}(?:[, ]\d{3})*(?:\.\d{1,2})?/g,
    /ZAR\s?\d{1,3}(?:[, ]\d{3})*(?:\.\d{1,2})?/gi,
    /\d{1,3}(?:[, ]\d{3})*(?:\.\d{1,2})?\s*(?:rand|zar)/gi,
  ],
  PERCENT: [/\d+(?:\.\d+)?\s*%/g],
  DATE: [
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g,
    /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/gi,
  ],
  FISCAL_YEAR: [/FY\s?\d{4}/gi, /\d{4}\s+financial\s+year/gi],
  FINANCIAL_NUMBER: [/R?\d{1,3}(?:,\d{3})+(?:\.\d+)?/g],
  BEE_LEVEL: [
    /\b(?:level|lvl)\s*[1-8]\b/gi,
    /\bB-?BBEE\s+level\s+[1-8]\b/gi,
    /\b(?:non[- ]?compliant|NC)\b/gi,
  ],
  RACE_GROUP: [/\b(?:African|Coloured|Indian|White|Black)\b/g],
  GENDER: [/\b(?:Male|Female|M|F)\b/g],
  DESIGNATION: [
    /\b(?:Board|Executive|Senior|Middle|Junior|Director|CEO|CFO|COO|CTO|Managing Director)\b/gi,
  ],
  ORG: [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Pty|Ltd|Holdings|Group|Inc|CC|Trust|NPC|Limited)\b/g,
  ],
};

/** Financial-only patterns (no B-BBEE-specific types) */
export const DEFAULT_FINANCIAL_PATTERNS: PatternSet = {
  MONEY: [
    /R\s?\d{1,3}(?:[, ]\d{3})*(?:\.\d{1,2})?/g,
    /ZAR\s?\d{1,3}(?:[, ]\d{3})*(?:\.\d{1,2})?/gi,
    /\d{1,3}(?:[, ]\d{3})*(?:\.\d{1,2})?\s*(?:rand|zar)/gi,
  ],
  PERCENT: [/\d+(?:\.\d+)?\s*%/g],
  DATE: [
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g,
    /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/gi,
  ],
  ORG: [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Pty|Ltd|Holdings|Group|Inc|CC|Trust|NPC|Limited)\b/g,
  ],
  FINANCIAL_NUMBER: [/R?\d{1,3}(?:,\d{3})+(?:\.\d+)?/g],
};

/** Minimum character length per entity type */
export const MIN_ENTITY_LENGTH: Record<string, number> = {
  ORG: 3,
  MONEY: 2,
  DATE: 4,
  PERCENT: 2,
  FINANCIAL_NUMBER: 2,
  BEE_LEVEL: 5,
  RACE_GROUP: 3,
  GENDER: 1,
  DESIGNATION: 3,
  FISCAL_YEAR: 4,
};

/** Noise filter patterns - skip matches unless type is numeric */
const NOISE_PATTERNS: RegExp[] = [
  /^\d+$/,
  /^[\d\s,]+$/,
  /^[•\-–—\s]+/,
];

/** Common words that make ORG ambiguous */
const COMMON_ORG_WORDS = new Set(['the', 'and', 'for', 'new', 'old', 'big', 'small']);

/** Currency indicators for MONEY ambiguity check */
const CURRENCY_INDICATORS = ['R', '$', '€', '£', 'ZAR', 'USD', 'EUR', 'GBP', 'rand', 'dollar'];

/**
 * Find all matches for a regex (handles global flag).
 * Returns array of { match, start, end }.
 */
function findAllMatches(text: string, regex: RegExp): Array<{ match: string; start: number; end: number }> {
  const results: Array<{ match: string; start: number; end: number }> = [];
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const re = new RegExp(regex.source, flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({
      match: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return results;
}

/**
 * Normalize an entity value based on its type.
 */
export function normalizeEntityValue(entityType: string, text: string): string {
  const t = text.trim();

  if (entityType === 'MONEY' || entityType === 'FINANCIAL_NUMBER') {
    const numbers = t.match(/[\d,]+(?:\.\d+)?/);
    if (numbers) {
      return numbers[0].replace(/,/g, '');
    }
    return t;
  }

  if (entityType === 'DATE') {
    const m = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m) {
      const [, day, month, year] = m;
      return `${year}-${String(parseInt(month, 10)).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
    }
    const monthMatch = t.match(
      /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\s+(\d{1,2}),?\s+(\d{4})/i
    );
    if (monthMatch) {
      const months: Record<string, string> = {
        jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
        apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
        aug: '08', august: '08', sep: '09', september: '09', oct: '10', october: '10',
        nov: '11', november: '11', dec: '12', december: '12',
      };
      const monthWord = monthMatch[0].split(/\s/)[0].toLowerCase();
      const monthNum = months[monthWord] || '01';
      const day = String(parseInt(monthMatch[1], 10)).padStart(2, '0');
      const year = monthMatch[2];
      return `${year}-${monthNum}-${day}`;
    }
    return t;
  }

  if (entityType === 'PERCENT') {
    const numbers = t.match(/[\d.]+/);
    if (numbers) return numbers[0];
    return t;
  }

  if (entityType === 'ORG') {
    const stripped = t.replace(/\s+(?:Inc\.?|Ltd\.?|Limited|Corp\.?|Corporation|LLC|PLC)$/i, '').trim();
    return stripped.toUpperCase();
  }

  if (entityType === 'BEE_LEVEL') {
    const level = t.match(/\b(?:level|lvl)\s*([1-8])\b/i) || t.match(/B-?BBEE\s+level\s+([1-8])/i);
    if (level) return level[1];
    if (/non[- ]?compliant|NC/i.test(t)) return '0';
    return t;
  }

  if (entityType === 'RACE_GROUP') {
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  if (entityType === 'GENDER') {
    const lower = t.toLowerCase();
    if (lower === 'm' || lower === 'male') return 'Male';
    if (lower === 'f' || lower === 'female') return 'Female';
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  if (entityType === 'FISCAL_YEAR') {
    const fy = t.match(/FY\s?(\d{4})/i) || t.match(/(\d{4})\s+financial\s+year/i);
    if (fy) return fy[1];
    return t;
  }

  return t;
}

/**
 * Check if an entity is ambiguous and should be filtered (unless includeAmbiguous).
 */
export function isAmbiguousEntity(text: string, entityType: string, _context: string): boolean {
  const t = text.trim();

  if (entityType === 'DATE') {
    if (!/\d{4}/.test(t)) return true;
  }

  if (entityType === 'MONEY') {
    const hasCurrency = CURRENCY_INDICATORS.some(
      (curr) => new RegExp(`(?<!\\w)${curr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'i').test(t)
    );
    if (!hasCurrency && t.length < 5) return true;
  }

  if (entityType === 'ORG') {
    if (t.length < 3) return true;
    if (COMMON_ORG_WORDS.has(t.toLowerCase())) return true;
  }

  return false;
}

/**
 * Check if text passes noise filter for the given entity type.
 */
function passesNoiseFilter(text: string, entityType: string): boolean {
  const numericTypes = ['MONEY', 'PERCENT', 'FINANCIAL_NUMBER'];
  if (numericTypes.includes(entityType)) return true;

  for (const p of NOISE_PATTERNS) {
    if (p.test(text.trim())) return false;
  }
  return true;
}

/**
 * Extract entities from a single page with exact character spans.
 * @param patternSet - Optional pattern set. If not provided, uses DEFAULT_BBBEE_PATTERNS.
 */
export function extractPageEntities(
  pageText: string,
  pageId: string,
  documentId: string,
  entityTypes?: Set<string>,
  includeAmbiguous?: boolean,
  patternSet?: PatternSet
): PageEntitiesResult {
  const patterns = patternSet ?? DEFAULT_BBBEE_PATTERNS;
  const typesToExtract = entityTypes ?? new Set(Object.keys(patterns));
  const entities: PageEntity[] = [];
  const seenSpans = new Set<string>();
  const typeIndices: Record<string, number> = {};

  for (const entityType of Object.keys(patterns)) {
    if (!typesToExtract.has(entityType)) continue;

    const typePatterns = patterns[entityType];
    const minLen = MIN_ENTITY_LENGTH[entityType] ?? 2;

    for (const regex of typePatterns) {
      const matches = findAllMatches(pageText, regex);
      for (const { match, start, end } of matches) {
        const trimmed = match.trim();
        if (trimmed.length < minLen) continue;
        if (!passesNoiseFilter(trimmed, entityType)) continue;

        const spanKey = `${start},${end}`;
        if (seenSpans.has(spanKey)) continue;

        const contextStart = Math.max(0, start - 50);
        const contextEnd = Math.min(pageText.length, end + 50);
        const context = pageText.slice(contextStart, contextEnd);

        if (!includeAmbiguous && isAmbiguousEntity(trimmed, entityType, context)) continue;

        seenSpans.add(spanKey);
        typeIndices[entityType] = (typeIndices[entityType] ?? 0) + 1;
        const index = typeIndices[entityType];
        const entityId = `${pageId}_ent_${entityType}_${String(index).padStart(4, '0')}`;

        entities.push({
          entityId,
          entityType,
          originalText: trimmed,
          normalizedValue: normalizeEntityValue(entityType, trimmed),
          pageId,
          documentId,
          spanStart: start,
          spanEnd: end,
        });
      }
    }
  }

  return {
    pageId,
    documentId,
    entities,
    extractionTimestamp: new Date().toISOString(),
  };
}

/**
 * Extract entities from multiple pages.
 * @param patternSet - Optional pattern set. If not provided, uses DEFAULT_BBBEE_PATTERNS.
 */
export function extractDocumentEntities(
  pages: Array<{ pageId: string; documentId: string; text: string }>,
  entityTypes?: Set<string>,
  includeAmbiguous?: boolean,
  patternSet?: PatternSet
): PageEntitiesResult[] {
  return pages.map((p) =>
    extractPageEntities(p.text, p.pageId, p.documentId, entityTypes, includeAmbiguous, patternSet)
  );
}

/**
 * Generate a summary of entities across all page results.
 */
export function getEntitySummary(
  results: PageEntitiesResult[]
): {
  totalEntities: number;
  byType: Record<string, number>;
  uniqueValues: Record<string, string[]>;
  pagesProcessed: number;
} {
  const allEntities: PageEntity[] = [];
  for (const r of results) {
    allEntities.push(...r.entities);
  }

  const byType: Record<string, number> = {};
  const uniqueValues: Record<string, Set<string>> = {};

  for (const e of allEntities) {
    byType[e.entityType] = (byType[e.entityType] ?? 0) + 1;
    if (!uniqueValues[e.entityType]) uniqueValues[e.entityType] = new Set();
    uniqueValues[e.entityType].add(e.normalizedValue);
  }

  const uniqueValuesArray: Record<string, string[]> = {};
  for (const k of Object.keys(uniqueValues)) {
    uniqueValuesArray[k] = Array.from(uniqueValues[k]).sort().slice(0, 20);
  }

  return {
    totalEntities: allEntities.length,
    byType,
    uniqueValues: uniqueValuesArray,
    pagesProcessed: results.length,
  };
}
