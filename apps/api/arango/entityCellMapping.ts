/**
 * Entity-to-Cell Mapping System
 *
 * Maps extracted entity names (from entityManifest) to specific cell addresses
 * in the formula graphs via semantic tags.
 *
 * This enables:
 *   1. Automated population of scorecard cells from extracted entities
 *   2. Validation that extracted entities cover all required inputs
 *   3. What-if analysis: "If I change entity X, what scores change?"
 */

import { aql } from 'arangojs';
import { getArangoDB } from './connection.js';
import { COLLECTIONS } from './collections.js';
import { GraphRepository } from './repositories/graphRepository.js';
import type { EntityRequirement } from '../pipeline/extraction/entityManifest.js';

export interface CellMatch {
  address: string;
  confidence: number;
  reason: string;
  fuzzyScore?: number;
  isPrimary: boolean;
}

export interface EntityCellMapping {
  entityName: string;
  pillarCode: string;
  fieldType: string;
  cellAddresses: string[];  // e.g., ['Skills!D12', 'Management!E5']
  cellMatches: CellMatch[]; // Detailed per-cell confidence tracking
  confidence: number;     // 0-1 based on semantic tag match quality (best match)
  matchReason: string;      // e.g., "semanticTag.role=input && pillar=skills"
  allCandidates?: CellMatch[]; // All potential matches for disambiguation
}

export interface ScorecardMapping {
  sectorCode: string;
  scorecardType: string;
  graphKey: string;
  scorecardKey: string;
  mappings: EntityCellMapping[];
  coverage: {
    totalEntities: number;
    mappedEntities: number;
    unmappedEntities: string[];
    coveragePercent: number;
  };
  createdAt: string;
}

/**
 * Build entity-to-cell mapping for a specific scorecard template.
 *
 * Strategy:
 *   1. Get all cells with semantic tags from the formula graph
 *   2. Match entity names to cells via semantic tag analysis
 *   3. Store mapping for runtime use
 */
export async function buildEntityCellMapping(
  graphKey: string,
  sectorCode: string,
  scorecardType: string,
  requiredEntities: EntityRequirement[],
): Promise<ScorecardMapping> {
  const db = getArangoDB();
  const graphRepo = new GraphRepository();

  // Get all cells with semantic tags
  const cells = await graphRepo.getCellsBySemanticRole(graphKey, 'input');
  const cellsWithTags = cells.filter(c => c.semanticTag != null);

  const mappings: EntityCellMapping[] = [];
  const unmappedEntities: string[] = [];

  for (const entity of requiredEntities) {
    const matchingCells = findMatchingCells(entity, cellsWithTags);

    if (matchingCells.length > 0) {
      const bestMatch = matchingCells[0]; // Highest confidence

      // Build detailed cell matches
      const cellMatches: CellMatch[] = matchingCells.map((match, index) => ({
        address: `${match.sheet}!${match.address}`,
        confidence: match.confidence,
        reason: match.reason,
        fuzzyScore: match.reason.includes('fuzzy') ? match.confidence : undefined,
        isPrimary: index === 0, // First match is primary
      }));

      // All candidates (for disambiguation)
      const allCandidates = cellMatches.map(cm => ({ ...cm }));

      mappings.push({
        entityName: entity.name,
        pillarCode: entity.pillarCode,
        fieldType: entity.fieldType,
        cellAddresses: matchingCells.map(c => `${c.sheet}!${c.address}`),
        cellMatches,
        confidence: bestMatch.confidence,
        matchReason: bestMatch.reason,
        allCandidates,
      });
    } else {
      unmappedEntities.push(entity.name);
    }
  }

  // Get scorecard key
  const scorecardCursor = await db.query(aql`
    FOR g IN ${db.collection(COLLECTIONS.formulaGraphs)}
      FILTER g._key == ${graphKey}
      RETURN g.scorecardKey
  `);
  const scorecardRows = await scorecardCursor.all();
  const scorecardKey = scorecardRows[0] || '';

  const coveragePercent = Math.round(
    ((requiredEntities.length - unmappedEntities.length) / requiredEntities.length) * 100
  );

  const mapping: ScorecardMapping = {
    sectorCode,
    scorecardType,
    graphKey,
    scorecardKey,
    mappings,
    coverage: {
      totalEntities: requiredEntities.length,
      mappedEntities: mappings.length,
      unmappedEntities,
      coveragePercent,
    },
    createdAt: new Date().toISOString(),
  };

  // Store in ArangoDB
  await storeMapping(mapping);

  return mapping;
}

interface MatchResult {
  cell: { sheet: string; address: string; semanticTag: Record<string, unknown> };
  sheet: string;
  address: string;
  confidence: number;
  reason: string;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1) between two strings using Levenshtein distance
 */
function fuzzySimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - distance / maxLength;
}

/**
 * Check if a string contains all words from another string (word order independent)
 */
function containsAllWords(haystack: string, needle: string): boolean {
  const haystackWords = haystack.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const needleWords = needle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (needleWords.length === 0) return false;
  return needleWords.every(word => haystackWords.some(hw => hw.includes(word) || word.includes(hw)));
}

/**
 * Calculate fuzzy match score between entity name/aliases and cell description
 * Returns score 0-1 and match type
 */
function fuzzyMatchScore(entity: EntityRequirement, cellDescription: string): { score: number; matchType: string } {
  const desc = cellDescription.toLowerCase();
  const entityName = entity.name.toLowerCase();
  const aliases = entity.aliases.map(a => a.toLowerCase());

  // Exact match (substring)
  if (desc.includes(entityName)) {
    return { score: 1.0, matchType: 'exact-name' };
  }

  // Check aliases for exact match
  for (const alias of aliases) {
    if (desc.includes(alias)) {
      return { score: 0.95, matchType: 'exact-alias' };
    }
  }

  // Word-level containment (all words present, order independent)
  if (containsAllWords(desc, entityName)) {
    return { score: 0.9, matchType: 'word-match-name' };
  }

  for (const alias of aliases) {
    if (containsAllWords(desc, alias)) {
      return { score: 0.85, matchType: 'word-match-alias' };
    }
  }

  // Fuzzy similarity for entity name
  const nameSim = fuzzySimilarity(entityName, desc);
  if (nameSim >= 0.8) {
    return { score: 0.7 + nameSim * 0.2, matchType: 'fuzzy-name' };
  }

  // Fuzzy similarity for aliases
  let bestAliasScore = 0;
  for (const alias of aliases) {
    const aliasSim = fuzzySimilarity(alias, desc);
    if (aliasSim > bestAliasScore) {
      bestAliasScore = aliasSim;
    }
  }
  if (bestAliasScore >= 0.8) {
    return { score: 0.65 + bestAliasScore * 0.2, matchType: 'fuzzy-alias' };
  }

  // Abbreviation matching (e.g., "NPAT" -> "Net Profit After Tax")
  const entityWords = entityName.split(/\s+/);
  const descChars = desc.replace(/[^a-z]/g, '');
  for (const word of entityWords) {
    if (word.length >= 2 && descChars.includes(word.charAt(0))) {
      // Check if first letters of consecutive words match abbreviation
      const firstLetters = entityWords.map(w => w.charAt(0)).join('');
      if (descChars.includes(firstLetters)) {
        return { score: 0.6, matchType: 'abbreviation' };
      }
    }
  }

  return { score: 0, matchType: 'no-match' };
}

/**
 * Find cells that match an entity requirement based on semantic tags.
 */
function findMatchingCells(
  entity: EntityRequirement,
  cells: Array<{ sheet: string; address: string; semanticTag: Record<string, unknown> }>,
): MatchResult[] {
  const matches: MatchResult[] = [];

  for (const cell of cells) {
    const tag = cell.semanticTag;
    let confidence = 0;
    const reasons: string[] = [];

    // Match by pillar code
    if (tag.pillar && tag.pillar === entity.pillarCode) {
      confidence += 0.3;
      reasons.push(`pillar=${entity.pillarCode}`);
    }

    // Fuzzy match by entity name/aliases against cell description
    const tagDesc = String(tag.description || '').toLowerCase();
    const entityNameLower = entity.name.toLowerCase();

    // Use new fuzzy matching algorithm
    const fuzzyResult = fuzzyMatchScore(entity, tagDesc);
    if (fuzzyResult.score > 0) {
      confidence += fuzzyResult.score * 0.5; // Up to 0.5 for name match
      reasons.push(`${fuzzyResult.matchType}`);
    } else {
      // Legacy substring matching for aliases as fallback
      const aliasesLower = entity.aliases.map(a => a.toLowerCase());
      for (const alias of aliasesLower) {
        if (tagDesc.includes(alias)) {
          confidence += 0.3;
          reasons.push(`alias-substring:${alias}`);
          break;
        }
      }
    }

    // Match by field type indicators in sheet name
    const sheetLower = cell.sheet.toLowerCase();
    if (entity.fieldType === 'currency' && /revenue|spend|payroll|cost|amount/i.test(sheetLower)) {
      confidence += 0.15;
      reasons.push('currency-sheet');
    }
    if (entity.fieldType === 'percentage' && /percent|ratio|rate/i.test(sheetLower)) {
      confidence += 0.15;
      reasons.push('percentage-sheet');
    }
    if (entity.fieldType === 'count' && /employees|headcount|number/i.test(sheetLower)) {
      confidence += 0.15;
      reasons.push('count-sheet');
    }

    // Bonus for cells in expected zones
    for (const zone of entity.zones) {
      if (sheetLower.includes(zone.toLowerCase())) {
        confidence += 0.1;
        reasons.push(`zone:${zone}`);
        break;
      }
    }

    if (confidence > 0.5) {
      matches.push({
        cell,
        sheet: cell.sheet,
        address: cell.address,
        confidence: Math.min(confidence, 1.0),
        reason: reasons.join(' + '),
      });
    }
  }

  // Sort by confidence descending
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Store the entity-cell mapping in ArangoDB.
 */
async function storeMapping(mapping: ScorecardMapping): Promise<void> {
  const db = getArangoDB();
  const collection = db.collection(COLLECTIONS.entityCellMappings);

  const doc = {
    _key: `${mapping.sectorCode}_${mapping.scorecardType}`,
    ...mapping,
  };

  try {
    await collection.save(doc, { overwriteMode: 'replace' });
  } catch (err) {
    // Collection might not exist, create it
    if (String(err).includes('collection not found')) {
      await db.createCollection(COLLECTIONS.entityCellMappings);
      await collection.save(doc);
    } else {
      throw err;
    }
  }
}

/**
 * Retrieve stored mapping for a sector/type.
 */
export async function getEntityCellMapping(
  sectorCode: string,
  scorecardType: string,
): Promise<ScorecardMapping | null> {
  const db = getArangoDB();
  const collection = db.collection(COLLECTIONS.entityCellMappings);

  try {
    const doc = await collection.document(`${sectorCode}_${scorecardType}`, { graceful: true });
    return doc as ScorecardMapping || null;
  } catch {
    return null;
  }
}

/**
 * Build mappings for all 6 scorecard templates.
 */
export async function buildAllMappings(
  requiredEntities: EntityRequirement[],
): Promise<Array<{ sectorCode: string; scorecardType: string; mapping: ScorecardMapping }>> {
  const db = getArangoDB();

  // Get all formula graphs
  const cursor = await db.query(aql`
    FOR g IN ${db.collection(COLLECTIONS.formulaGraphs)}
      RETURN { _key: g._key, sectorCode: g.sectorCode, scorecardType: g.scorecardType }
  `);
  const graphs = await cursor.all();

  const results: Array<{ sectorCode: string; scorecardType: string; mapping: ScorecardMapping }> = [];

  for (const graph of graphs) {
    if (!graph.sectorCode || !graph.scorecardType) continue;

    const mapping = await buildEntityCellMapping(
      graph._key,
      graph.sectorCode,
      graph.scorecardType,
      requiredEntities,
    );

    results.push({
      sectorCode: graph.sectorCode,
      scorecardType: graph.scorecardType,
      mapping,
    });
  }

  return results;
}

/**
 * Apply extracted entity values to a scorecard graph.
 *
 * Returns the cell overrides that would populate the scorecard.
 */
export function applyEntitiesToScorecard(
  mapping: ScorecardMapping,
  extractedEntities: Record<string, number | string>,
): Record<string, number | string> {
  const overrides: Record<string, number | string> = {};

  for (const entityMapping of mapping.mappings) {
    const value = extractedEntities[entityMapping.entityName];
    if (value !== undefined && value !== null) {
      for (const cellAddress of entityMapping.cellAddresses) {
        overrides[cellAddress] = value;
      }
    }
  }

  return overrides;
}

/**
 * Validate that all required entities are present in extracted data.
 */
export function validateEntityCoverage(
  mapping: ScorecardMapping,
  extractedEntities: Record<string, number | string>,
): {
  valid: boolean;
  missing: string[];
  present: string[];
  coveragePercent: number;
} {
  const required = mapping.mappings.filter(m => m.confidence > 0.7);
  const missing: string[] = [];
  const present: string[] = [];

  for (const m of required) {
    if (extractedEntities[m.entityName] === undefined) {
      missing.push(m.entityName);
    } else {
      present.push(m.entityName);
    }
  }

  const coveragePercent = required.length > 0
    ? Math.round((present.length / required.length) * 100)
    : 0;

  return {
    valid: missing.length === 0,
    missing,
    present,
    coveragePercent,
  };
}
