/**
 * Graph Repository
 *
 * Stores and queries formula dependency graphs in ArangoDB.
 * Provides graph traversal operations for tracing calculation
 * provenance and running what-if analysis.
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../collections.js';
import type { FormulaGraph, CellNode } from '../../pipeline/formulaGraphBuilder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredFormulaGraph {
  _key?: string;
  scorecardType: string;
  sectorCode: string;
  version: string;
  sourceFile: string;
  nodeCount: number;
  edgeCount: number;
  formulaCount: number;
  inputCount: number;
  sheets: string[];
  defaultSheet: string | null;
  hasCycles: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class GraphRepository {
  private get db() { return getArangoDB(); }

  async storeFormulaGraph(
    graph: FormulaGraph,
    scorecardType: string,
    sectorCode: string,
    sourceFile: string,
  ): Promise<string> {
    const graphDoc: StoredFormulaGraph = {
      scorecardType,
      sectorCode,
      version: new Date().toISOString(),
      sourceFile,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      formulaCount: graph.outputs.length,
      inputCount: graph.inputs.length,
      sheets: graph.sheets,
      defaultSheet: graph.defaultSheet,
      hasCycles: graph.metadata.hasCycles,
      createdAt: new Date().toISOString(),
    };

    const graphCol = this.db.collection(COLLECTIONS.formulaGraphs);
    const graphResult = await graphCol.save(graphDoc);
    const graphKey = graphResult._key;

    const cellCol = this.db.collection(COLLECTIONS.cells);
    const edgeCol = this.db.collection(EDGE_COLLECTIONS.cellDependency);

    const BATCH_SIZE = 500;
    const cellEntries = Object.values(graph.cells);
    for (let i = 0; i < cellEntries.length; i += BATCH_SIZE) {
      const batch = cellEntries.slice(i, i + BATCH_SIZE);
      const docs = batch.map(cell => ({
        _key: `${graphKey}_${cell.address.replace(/[^a-zA-Z0-9]/g, '_')}`,
        graphId: graphKey,
        address: cell.address,
        sheet: cell.sheet,
        column: cell.column,
        row: cell.row,
        formula: cell.formula,
        value: cell.value,
        dependsOn: cell.dependsOn,
        semanticTag: cell.semanticTag,
      }));
      await cellCol.saveAll(docs, { overwriteMode: 'replace' });
    }

    for (let i = 0; i < graph.edges.length; i += BATCH_SIZE) {
      const batch = graph.edges.slice(i, i + BATCH_SIZE);
      const edgeDocs = batch.map(e => ({
        _from: `${COLLECTIONS.cells}/${graphKey}_${e.from.replace(/[^a-zA-Z0-9]/g, '_')}`,
        _to: `${COLLECTIONS.cells}/${graphKey}_${e.to.replace(/[^a-zA-Z0-9]/g, '_')}`,
        graphId: graphKey,
      }));
      await edgeCol.saveAll(edgeDocs, { overwriteMode: 'replace' });
    }

    return graphKey;
  }

  async getFormulaGraph(key: string): Promise<StoredFormulaGraph | null> {
    try {
      const col = this.db.collection(COLLECTIONS.formulaGraphs);
      return await col.document(key);
    } catch {
      return null;
    }
  }

  async listFormulaGraphs(): Promise<StoredFormulaGraph[]> {
    const cursor = await this.db.query(aql`
      FOR g IN ${this.db.collection(COLLECTIONS.formulaGraphs)}
        SORT g.createdAt DESC
        RETURN g
    `);
    return cursor.all();
  }

  async getGraphCells(graphKey: string): Promise<CellNode[]> {
    const cursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.cells)}
        FILTER c.graphId == ${graphKey}
        RETURN c
    `);
    return cursor.all();
  }

  /**
   * Trace the full dependency chain backward from a target cell,
   * returning all ancestors up to the given depth.
   */
  async traceDependencies(graphKey: string, cellAddress: string, maxDepth = 10): Promise<{
    path: Array<{ address: string; formula: string | null; value: unknown; depth: number }>;
    totalAncestors: number;
  }> {
    const cellKey = `${graphKey}_${cellAddress.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const cursor = await this.db.query(aql`
      LET startNode = DOCUMENT(${`${COLLECTIONS.cells}/${cellKey}`})
      LET traversal = (
        FOR v, e, p IN 1..${maxDepth} INBOUND startNode ${this.db.collection(EDGE_COLLECTIONS.cellDependency)}
          FILTER v.graphId == ${graphKey}
          RETURN DISTINCT {
            address: v.address,
            formula: v.formula,
            value: v.value,
            depth: LENGTH(p.edges)
          }
      )
      RETURN { path: traversal, totalAncestors: LENGTH(traversal) }
    `);
    const result = await cursor.next();
    return result || { path: [], totalAncestors: 0 };
  }

  /**
   * Find all cells that depend on a given cell (forward traversal).
   * Used for what-if analysis: "If I change X, what scores change?"
   */
  async traceDependents(graphKey: string, cellAddress: string, maxDepth = 10): Promise<{
    dependents: Array<{ address: string; formula: string | null; semanticTag: unknown; depth: number }>;
    totalDependents: number;
  }> {
    const cellKey = `${graphKey}_${cellAddress.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const cursor = await this.db.query(aql`
      LET startNode = DOCUMENT(${`${COLLECTIONS.cells}/${cellKey}`})
      LET traversal = (
        FOR v, e, p IN 1..${maxDepth} OUTBOUND startNode ${this.db.collection(EDGE_COLLECTIONS.cellDependency)}
          FILTER v.graphId == ${graphKey}
          RETURN DISTINCT {
            address: v.address,
            formula: v.formula,
            semanticTag: v.semanticTag,
            depth: LENGTH(p.edges)
          }
      )
      RETURN { dependents: traversal, totalDependents: LENGTH(traversal) }
    `);
    const result = await cursor.next();
    return result || { dependents: [], totalDependents: 0 };
  }

  /**
   * Get all cells with a specific semantic tag type within a graph.
   */
  async getCellsBySemanticRole(graphKey: string, role: string): Promise<CellNode[]> {
    const cursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.cells)}
        FILTER c.graphId == ${graphKey}
        FILTER c.semanticTag != null
        FILTER c.semanticTag.role == ${role}
        RETURN c
    `);
    return cursor.all();
  }

  /**
   * Get cells tagged for a specific pillar.
   */
  async getCellsByPillar(graphKey: string, pillar: string): Promise<CellNode[]> {
    const cursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.cells)}
        FILTER c.graphId == ${graphKey}
        FILTER c.semanticTag != null
        FILTER c.semanticTag.pillar == ${pillar}
        RETURN c
    `);
    return cursor.all();
  }

  /**
   * Delete a formula graph and all associated cells and edges.
   * Also removes any linked scorecard, pillars, indicators, and compliance targets.
   */
  async deleteFormulaGraph(graphKey: string): Promise<{
    graphDeleted: boolean;
    cellsDeleted: number;
    edgesDeleted: number;
    scorecardDeleted: boolean;
    pillarsDeleted: number;
    indicatorsDeleted: number;
    targetsDeleted: number;
  }> {
    const db = this.db;

    // 1. Find linked scorecard via sourceFile
    const graphDoc = await this.getFormulaGraph(graphKey);
    let scorecardDeleted = false;
    let pillarsDeleted = 0;
    let indicatorsDeleted = 0;
    let targetsDeleted = 0;

    if (graphDoc?.sourceFile) {
      const scCursor = await db.query(aql`
        FOR sc IN ${db.collection(COLLECTIONS.scorecards)}
          FILTER sc.sourceFile == ${graphDoc.sourceFile}
          RETURN sc._key
      `);
      const scorecardKeys: string[] = await scCursor.all();

      for (const scKey of scorecardKeys) {
        // Find pillars
        const pillarCursor = await db.query(aql`
          FOR p IN ${db.collection(COLLECTIONS.pillars)}
            FILTER p.scorecardId == ${scKey}
            RETURN p._key
        `);
        const pillarKeys: string[] = await pillarCursor.all();

        for (const pKey of pillarKeys) {
          // Find indicators
          const indCursor = await db.query(aql`
            FOR i IN ${db.collection(COLLECTIONS.indicators)}
              FILTER i.pillarId == ${pKey}
              RETURN i._key
          `);
          const indicatorKeys: string[] = await indCursor.all();

          for (const iKey of indicatorKeys) {
            // Delete compliance targets
            const tCursor = await db.query(aql`
              FOR t IN ${db.collection(COLLECTIONS.complianceTargets)}
                FILTER t.indicatorId == ${iKey}
                REMOVE t IN ${db.collection(COLLECTIONS.complianceTargets)}
                RETURN 1
            `);
            targetsDeleted += (await tCursor.all()).length;

            // Delete indicator
            await db.collection(COLLECTIONS.indicators).remove(iKey).catch(() => {});
            indicatorsDeleted++;
          }

          // Delete pillar_of edges
          await db.query(aql`
            FOR e IN ${db.collection(EDGE_COLLECTIONS.pillarOf)}
              FILTER e._from == ${`${COLLECTIONS.pillars}/${pKey}`}
              REMOVE e IN ${db.collection(EDGE_COLLECTIONS.pillarOf)}
          `).catch(() => {});

          // Delete indicator_of edges
          await db.query(aql`
            FOR e IN ${db.collection(EDGE_COLLECTIONS.indicatorOf)}
              FILTER STARTS_WITH(e._from, ${`${COLLECTIONS.indicators}/`})
              AND e._to == ${`${COLLECTIONS.pillars}/${pKey}`}
              REMOVE e IN ${db.collection(EDGE_COLLECTIONS.indicatorOf)}
          `).catch(() => {});

          await db.collection(COLLECTIONS.pillars).remove(pKey).catch(() => {});
          pillarsDeleted++;
        }

        await db.collection(COLLECTIONS.scorecards).remove(scKey).catch(() => {});
        scorecardDeleted = true;
      }
    }

    // 2. Delete all cell_dependency edges for this graph
    const edgeCursor = await db.query(aql`
      FOR e IN ${db.collection(EDGE_COLLECTIONS.cellDependency)}
        FILTER e.graphId == ${graphKey}
        REMOVE e IN ${db.collection(EDGE_COLLECTIONS.cellDependency)}
        RETURN 1
    `);
    const edgesDeleted = (await edgeCursor.all()).length;

    // 3. Delete all cells for this graph
    const cellCursor = await db.query(aql`
      FOR c IN ${db.collection(COLLECTIONS.cells)}
        FILTER c.graphId == ${graphKey}
        REMOVE c IN ${db.collection(COLLECTIONS.cells)}
        RETURN 1
    `);
    const cellsDeleted = (await cellCursor.all()).length;

    // 4. Delete the graph document itself
    let graphDeleted = false;
    try {
      await db.collection(COLLECTIONS.formulaGraphs).remove(graphKey);
      graphDeleted = true;
    } catch { /* already gone */ }

    return { graphDeleted, cellsDeleted, edgesDeleted, scorecardDeleted, pillarsDeleted, indicatorsDeleted, targetsDeleted };
  }
}
