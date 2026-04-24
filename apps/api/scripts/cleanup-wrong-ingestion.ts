/**
 * Cleanup Script: Remove Wrongly-Ingested Templates
 *
 * Connects directly to ArangoDB and removes any formula graphs (and their
 * associated scorecards, pillars, indicators, targets, cells, and edges)
 * that were ingested from client files instead of blank templates.
 *
 * Usage:
 *   npx tsx scripts/cleanup-wrong-ingestion.ts [--dry-run]
 *
 * Safe to run multiple times (idempotent).
 */

import { Database } from 'arangojs';

const ARANGO_URL = process.env.ARANGO_URL || 'http://127.0.0.1:8529';
const ARANGO_DB = process.env.ARANGO_DB || 'bbbee_db';
const ARANGO_USER = process.env.ARANGO_USER || 'root';
const ARANGO_PASSWORD = process.env.ARANGO_PASSWORD || 'Okiru123!';

const DRY_RUN = process.argv.includes('--dry-run');

// These source files are CLIENT assessments that were accidentally ingested as templates.
// They must be removed from the formula_graphs collection.
const KNOWN_CLIENT_FILES = [
  'Lake Trading Toolkit (RCOGP)(1).xlsx',
  'Lake Trading  Toolkit (RCOGP).xlsx',
];

// These are the VALID blank template source files — never remove these.
const VALID_TEMPLATES = [
  'rcogp.xlsx',
  'ict_generic.xlsx',
  'ict_qse.xlsx',
  'rcogp_qse.xlsx',
  'agri.xlsx',
  'fsc.xlsx',
];

async function main() {
  console.log(`\n=== Okiru BBBEE: Wrong-Ingestion Cleanup ===`);
  console.log(`  ArangoDB: ${ARANGO_URL}/${ARANGO_DB}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will delete)'}`);
  console.log('');

  const systemDb = new Database({ url: ARANGO_URL, auth: { username: ARANGO_USER, password: ARANGO_PASSWORD } });
  const db = systemDb.database(ARANGO_DB);

  // 1. Find all formula_graphs whose sourceFile is a known client file
  const findCursor = await db.query(`
    FOR g IN formula_graphs
      FILTER g.sourceFile IN @clientFiles
      RETURN { key: g._key, sourceFile: g.sourceFile, sectorCode: g.sectorCode, scorecardType: g.scorecardType, nodeCount: g.nodeCount, createdAt: g.createdAt }
  `, { clientFiles: KNOWN_CLIENT_FILES });

  const wrongGraphs = await findCursor.all();

  if (wrongGraphs.length === 0) {
    console.log('✅ No wrongly-ingested graphs found. Database is clean.');
    return;
  }

  console.log(`Found ${wrongGraphs.length} wrongly-ingested graph(s):\n`);
  for (const g of wrongGraphs) {
    console.log(`  - Key: ${g.key} | ${g.sectorCode} ${g.scorecardType} | Source: ${g.sourceFile} | Nodes: ${g.nodeCount} | Created: ${g.createdAt}`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN: No changes made. Run without --dry-run to delete.');
    return;
  }

  for (const g of wrongGraphs) {
    console.log(`\n  Deleting graph: ${g.key} (${g.sourceFile})`);

    // Find and delete linked scorecard + its pillars/indicators/targets
    const scCursor = await db.query(
      `FOR sc IN scorecards FILTER sc.sourceFile == @sf RETURN sc._key`,
      { sf: g.sourceFile }
    );
    const scorecardKeys: string[] = await scCursor.all();
    let pillarsDeleted = 0, indicatorsDeleted = 0, targetsDeleted = 0;

    for (const scKey of scorecardKeys) {
      const pillarCursor = await db.query(
        `FOR p IN pillars FILTER p.scorecardId == @sk RETURN p._key`,
        { sk: scKey }
      );
      const pillarKeys: string[] = await pillarCursor.all();

      for (const pKey of pillarKeys) {
        const indCursor = await db.query(
          `FOR i IN indicators FILTER i.pillarId == @pk RETURN i._key`,
          { pk: pKey }
        );
        const indicatorKeys: string[] = await indCursor.all();

        for (const iKey of indicatorKeys) {
          await db.query(`FOR t IN compliance_targets FILTER t.indicatorId == @ik REMOVE t IN compliance_targets`, { ik: iKey }).catch(() => {});
          targetsDeleted++;
          await db.collection('indicators').remove(iKey).catch(() => {});
          indicatorsDeleted++;
        }

        await db.query(`FOR e IN pillar_of FILTER e._from == @pf REMOVE e IN pillar_of`, { pf: `pillars/${pKey}` }).catch(() => {});
        await db.query(`FOR e IN indicator_of FILTER e._to == @pt REMOVE e IN indicator_of`, { pt: `pillars/${pKey}` }).catch(() => {});
        await db.collection('pillars').remove(pKey).catch(() => {});
        pillarsDeleted++;
      }

      await db.collection('scorecards').remove(scKey).catch(() => {});
    }

    console.log(`    → Scorecards deleted: ${scorecardKeys.length} | Pillars: ${pillarsDeleted} | Indicators: ${indicatorsDeleted} | Targets: ${targetsDeleted}`);

    // Delete cell_dependency edges
    const edgeCursor = await db.query(
      `FOR e IN cell_dependency FILTER e.graphId == @gk REMOVE e IN cell_dependency RETURN 1`,
      { gk: g.key }
    );
    const edgesDeleted = (await edgeCursor.all()).length;
    console.log(`    → Cell dependency edges deleted: ${edgesDeleted}`);

    // Delete cells
    const cellCursor = await db.query(
      `FOR c IN cells FILTER c.graphId == @gk REMOVE c IN cells RETURN 1`,
      { gk: g.key }
    );
    const cellsDeleted = (await cellCursor.all()).length;
    console.log(`    → Cells deleted: ${cellsDeleted}`);

    // Delete the graph document
    await db.collection('formula_graphs').remove(g.key).catch(() => {});
    console.log(`    → Graph document deleted: ${g.key}`);
  }

  console.log('\n✅ Cleanup complete.\n');

  // Verify remaining valid templates
  const remaining = await db.query(`
    FOR g IN formula_graphs
      RETURN { key: g._key, sourceFile: g.sourceFile, sectorCode: g.sectorCode, scorecardType: g.scorecardType, nodeCount: g.nodeCount }
  `);
  const graphs = await remaining.all();
  console.log(`Remaining templates (${graphs.length}):`);
  for (const g of graphs) {
    const isValid = VALID_TEMPLATES.includes(g.sourceFile);
    console.log(`  ${isValid ? '✅' : '⚠️ '} ${g.key} | ${g.sectorCode} ${g.scorecardType} | ${g.sourceFile} | ${g.nodeCount} nodes`);
  }
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
