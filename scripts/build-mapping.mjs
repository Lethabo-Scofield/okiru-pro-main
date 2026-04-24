/**
 * Build Entity-to-Cell Mapping Script
 *
 * Builds the mapping between extracted entities and Excel cells for a template.
 * Usage: node scripts/build-mapping.mjs <sector> <type> <graphKey>
 * Example: node scripts/build-mapping.mjs RCOGP Generic 51320
 */

import 'dotenv/config';
import { buildEntityCellMapping, getEntityCellMapping } from '../apps/api/arango/entityCellMapping.js';
import { buildManifestForSector } from '../apps/api/pipeline/extraction/entityManifest.js';
import { connectArango } from '../apps/api/arango/connection.js';

const sector = process.argv[2] || 'RCOGP';
const type = process.argv[3] || 'Generic';
const graphKey = process.argv[4] || '51320';

console.log('========================================');
console.log('Build Entity-to-Cell Mapping');
console.log('========================================\n');
console.log(`Sector: ${sector}`);
console.log(`Type: ${type}`);
console.log(`Graph Key: ${graphKey}\n`);

try {
  // Connect to ArangoDB
  console.log('Connecting to ArangoDB...');
  await connectArango();
  console.log('  ✓ Connected\n');

  // Check if mapping already exists
  console.log('Checking for existing mapping...');
  const existing = await getEntityCellMapping(sector, type);
  if (existing) {
    console.log(`  ✓ Found existing mapping (${existing.mappings.length} entities)`);
    console.log(`  Created: ${existing.createdAt}`);
  }

  // Build manifest
  console.log('\nBuilding entity manifest...');
  const manifest = buildManifestForSector(sector, type);
  console.log(`  ✓ ${manifest.requiredEntities.length} required entities`);

  // Build mapping
  console.log('\nBuilding entity-to-cell mapping...');
  console.log('  (Analyzing semantic tags in formula graph...)');
  const startTime = Date.now();

  const mapping = await buildEntityCellMapping(
    graphKey,
    sector,
    type,
    manifest.requiredEntities,
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✓ Mapping complete in ${duration}s!\n`);
  console.log('Coverage:');
  console.log(`  Total Entities: ${mapping.coverage.totalEntities}`);
  console.log(`  Mapped: ${mapping.coverage.mappedEntities}`);
  console.log(`  Unmapped: ${mapping.coverage.unmappedEntities.length}`);
  console.log(`  Coverage: ${mapping.coverage.coveragePercent}%`);

  console.log('\nTop 10 Mappings (highest confidence):');
  const topMappings = mapping.mappings
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);

  for (const m of topMappings) {
    console.log(`  ${m.entityName}`);
    console.log(`    -> ${m.cellAddresses.join(', ')}`);
    console.log(`    confidence: ${(m.confidence * 100).toFixed(0)}% (${m.matchReason})`);
  }

  if (mapping.coverage.unmappedEntities.length > 0) {
    console.log('\n⚠ Unmapped Entities (need manual mapping):');
    for (const entity of mapping.coverage.unmappedEntities.slice(0, 10)) {
      console.log(`  - ${entity}`);
    }
    if (mapping.coverage.unmappedEntities.length > 10) {
      console.log(`  ... and ${mapping.coverage.unmappedEntities.length - 10} more`);
    }
  }

  console.log('\nNext steps:');
  console.log(`  1. View full mapping: GET /api/entity-mappings/${sector}/${type}`);
  console.log(`  2. Apply entities: POST /api/entity-mappings/apply`);
  console.log(`  3. Validate Lake Trading: POST /api/templates/${graphKey}/compare`);

} catch (error) {
  console.error(`\n✗ Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
