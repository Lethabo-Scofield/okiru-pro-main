/**
 * Re-ingest Templates Script
 * 
 * Downloads stored toolkit files from ArangoDB and re-ingests them
 * with the fixed formulaGraphBuilder cell tagging.
 * 
 * Run from apps/api directory: npx tsx scripts/reingest-templates.mjs
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectArango, getArangoDB } from '../arango/connection.js';
import { ingestToolkitFromBuffer } from '../arango/ingestion/templateIngester.js';
import { COLLECTIONS } from '../arango/collections.js';
import { aql } from 'arangojs';

// Initialize connection
await connectArango();
const db = getArangoDB();

async function getStoredToolkitFiles() {
  try {
    const cursor = await db.query(aql`
      FOR f IN ${db.collection(COLLECTIONS.toolkitFiles)}
        RETURN {
          key: f._key,
          name: f.name,
          sectorCode: f.sectorCode,
          scorecardType: f.scorecardType,
          data: f.data
        }
    `);
    return await cursor.all();
  } catch (error) {
    console.error('Error fetching toolkit files:', error);
    return [];
  }
}

async function deleteExistingGraph(sourceFile) {
  try {
    // Find and delete existing formula graphs for this file
    const cursor = await db.query(aql`
      FOR g IN ${db.collection(COLLECTIONS.formulaGraphs)}
        FILTER g.sourceFile == ${sourceFile}
        RETURN g._key
    `);
    const keys = await cursor.all();
    
    for (const key of keys) {
      try {
        await db.collection(COLLECTIONS.formulaGraphs).remove(key);
        console.log(`  Deleted old graph: ${key}`);
      } catch (e) {
        console.warn(`  Could not delete graph ${key}:`, e.message);
      }
    }
    
    return keys.length;
  } catch (error) {
    console.warn('Error deleting existing graphs:', error);
    return 0;
  }
}

async function reingestTemplate(file) {
  console.log(`\nProcessing: ${file.name}`);
  console.log(`  Sector: ${file.sectorCode}, Type: ${file.scorecardType}`);
  
  try {
    // Delete old graphs first
    const deleted = await deleteExistingGraph(file.name);
    console.log(`  Deleted ${deleted} old graph(s)`);
    
    // Decode base64 data
    const buffer = Buffer.from(file.data, 'base64');
    console.log(`  File size: ${(buffer.length / 1024).toFixed(1)} KB`);
    
    // Re-ingest with fixed code
    console.log(`  Re-ingesting...`);
    const result = await ingestToolkitFromBuffer(
      buffer,
      file.name,
      file.sectorCode,
      file.scorecardType
    );
    
    console.log(`  ✓ Success!`);
    console.log(`    Graph Key: ${result.graphKey}`);
    console.log(`    Scorecard Key: ${result.scorecardKey}`);
    console.log(`    Pillars: ${result.pillarCount}`);
    console.log(`    Indicators: ${result.indicatorCount}`);
    console.log(`    Graph Nodes: ${result.graphNodeCount}`);
    console.log(`    Targets: ${result.targetCount}`);
    
    return { success: true, result };
  } catch (error) {
    console.error(`  ✗ Failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('B-BBEE Toolkit Re-ingestion Script');
  console.log('='.repeat(60));
  console.log('This will download stored templates from ArangoDB');
  console.log('and re-ingest them with fixed cell tagging.');
  console.log('');
  
  // Fetch stored files
  console.log('Fetching stored toolkit files from ArangoDB...');
  const files = await getStoredToolkitFiles();
  
  if (files.length === 0) {
    console.log('\nNo stored toolkit files found in ArangoDB.');
    console.log('Use POST /api/templates/store-files to upload them first.');
    process.exit(1);
  }
  
  console.log(`Found ${files.length} stored file(s):`);
  files.forEach(f => console.log(`  - ${f.name} (${f.sectorCode}/${f.scorecardType})`));
  
  // Confirm
  console.log('\nProceed with re-ingestion? (yes/no): ');
  
  // Auto-confirm for now
  console.log('Auto-confirming...\n');
  
  const results = [];
  for (const file of files) {
    const result = await reingestTemplate(file);
    results.push({ file: file.name, ...result });
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Re-ingestion Summary');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`Total: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log('\nFailed files:');
    failed.forEach(f => console.log(`  - ${f.file}: ${f.error}`));
  }
  
  console.log('\nDone!');
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
