/**
 * AQL Graph Traversal Queries
 *
 * Pre-built AQL queries for common B-BBEE graph operations:
 * - Full scorecard provenance trace
 * - What-if impact analysis
 * - Cross-pillar dependency mapping
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../collections.js';

/**
 * Trace from a pillar score cell back through all its inputs,
 * returning the complete calculation chain.
 */
export async function traceScoreProvenance(
  graphKey: string,
  pillarCode: string,
): Promise<Array<{ address: string; formula: string | null; value: unknown; depth: number; tag: unknown }>> {
  const db = getArangoDB();
  const cursor = await db.query(aql`
    LET pillarCells = (
      FOR c IN ${db.collection(COLLECTIONS.cells)}
        FILTER c.graphId == ${graphKey}
        FILTER c.semanticTag.pillar == ${pillarCode}
        FILTER c.semanticTag.role IN ["pillar_total", "score"]
        RETURN c
    )
    FOR startCell IN pillarCells
      FOR v, e, p IN 0..20 INBOUND startCell ${db.collection(EDGE_COLLECTIONS.cellDependency)}
        FILTER v.graphId == ${graphKey}
        RETURN DISTINCT {
          address: v.address,
          formula: v.formula,
          value: v.value,
          depth: LENGTH(p.edges),
          tag: v.semanticTag
        }
  `);
  return cursor.all();
}

/**
 * Find all cross-pillar dependencies: cells in one pillar that
 * depend on cells in a different pillar (e.g. NPAT feeding ESD/SED targets).
 */
export async function findCrossPillarDependencies(
  graphKey: string,
): Promise<Array<{ fromPillar: string; toPillar: string; fromAddress: string; toAddress: string }>> {
  const db = getArangoDB();
  const cursor = await db.query(aql`
    FOR e IN ${db.collection(EDGE_COLLECTIONS.cellDependency)}
      FILTER e.graphId == ${graphKey}
      LET fromCell = DOCUMENT(e._from)
      LET toCell = DOCUMENT(e._to)
      FILTER fromCell.semanticTag != null AND toCell.semanticTag != null
      FILTER fromCell.semanticTag.pillar != null AND toCell.semanticTag.pillar != null
      FILTER fromCell.semanticTag.pillar != toCell.semanticTag.pillar
      RETURN {
        fromPillar: fromCell.semanticTag.pillar,
        toPillar: toCell.semanticTag.pillar,
        fromAddress: fromCell.address,
        toAddress: toCell.address
      }
  `);
  return cursor.all();
}

/**
 * What-if analysis: given a cell to change, find all scorecard-tagged
 * cells that would be affected.
 */
export async function whatIfImpact(
  graphKey: string,
  cellAddress: string,
  maxDepth = 15,
): Promise<Array<{ address: string; pillar: string | null; role: string | null; depth: number }>> {
  const db = getArangoDB();
  const cellKey = `${graphKey}_${cellAddress.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const cursor = await db.query(aql`
    LET startNode = DOCUMENT(${`${COLLECTIONS.cells}/${cellKey}`})
    FOR v, e, p IN 1..${maxDepth} OUTBOUND startNode ${db.collection(EDGE_COLLECTIONS.cellDependency)}
      FILTER v.graphId == ${graphKey}
      FILTER v.semanticTag != null
      RETURN DISTINCT {
        address: v.address,
        pillar: v.semanticTag.pillar,
        role: v.semanticTag.role,
        depth: LENGTH(p.edges)
      }
  `);
  return cursor.all();
}

/**
 * Get scorecard summary: for each pillar, count tagged cells,
 * formulas, and inputs.
 */
export async function getScorecardGraphSummary(
  graphKey: string,
): Promise<Array<{ pillar: string; totalCells: number; formulas: number; inputs: number }>> {
  const db = getArangoDB();
  const cursor = await db.query(aql`
    FOR c IN ${db.collection(COLLECTIONS.cells)}
      FILTER c.graphId == ${graphKey}
      FILTER c.semanticTag != null AND c.semanticTag.pillar != null
      COLLECT pillar = c.semanticTag.pillar INTO grouped
      RETURN {
        pillar: pillar,
        totalCells: LENGTH(grouped),
        formulas: LENGTH(FOR g IN grouped FILTER g.c.formula != null RETURN 1),
        inputs: LENGTH(FOR g IN grouped FILTER g.c.formula == null RETURN 1)
      }
  `);
  return cursor.all();
}
