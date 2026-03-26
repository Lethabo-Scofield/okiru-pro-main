/**
 * Check existing entity mappings
 */

const API_URL = 'http://localhost:5001';

const mappings = [
  { sectorCode: 'RCOGP', scorecardType: 'Generic' },
  { sectorCode: 'RCOGP', scorecardType: 'QSE' },
  { sectorCode: 'ICT', scorecardType: 'Generic' },
  { sectorCode: 'ICT', scorecardType: 'QSE' },
  { sectorCode: 'AGRI', scorecardType: 'Generic' },
  { sectorCode: 'FSC', scorecardType: 'Generic' },
];

async function checkMapping(sectorCode, scorecardType) {
  try {
    const response = await fetch(`${API_URL}/api/entity-mappings/${sectorCode}/${scorecardType}`);

    if (!response.ok) {
      console.log(`${sectorCode}/${scorecardType}: NOT FOUND (status ${response.status})`);
      return null;
    }

    const result = await response.json();
    const mapping = result.mapping;
    
    console.log(`\n${sectorCode}/${scorecardType}:`);
    console.log(`  Graph Key: ${mapping.graphKey}`);
    console.log(`  Scorecard Key: ${mapping.scorecardKey}`);
    console.log(`  Mappings: ${mapping.mappings?.length || 0}`);
    console.log(`  Coverage: ${mapping.coverage?.coveragePercent?.toFixed(1) || 0}%`);
    console.log(`  Mapped: ${mapping.coverage?.mappedEntities || 0} / ${(mapping.coverage?.mappedEntities || 0) + (mapping.coverage?.unmappedEntities?.length || 0)}`);
    
    if (mapping.mappings?.length > 0) {
      console.log('  Sample mappings:');
      mapping.mappings.slice(0, 5).forEach(m => {
        console.log(`    - ${m.entityName} → ${m.cellAddresses?.slice(0, 3).join(', ')} (${m.matchReason}, ${m.confidence?.toFixed(2)})`);
      });
    }
    
    return mapping;
  } catch (error) {
    console.error(`${sectorCode}/${scorecardType}: ERROR - ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Checking Entity Mappings');
  console.log('=' .repeat(60));
  
  let totalMappings = 0;
  let totalCoverage = 0;
  let foundCount = 0;
  
  for (const m of mappings) {
    const mapping = await checkMapping(m.sectorCode, m.scorecardType);
    if (mapping) {
      foundCount++;
      totalMappings += mapping.mappings?.length || 0;
      totalCoverage += mapping.coverage?.coveragePercent || 0;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary: ${foundCount}/${mappings.length} mappings found`);
  if (foundCount > 0) {
    console.log(`Total entity-to-cell mappings: ${totalMappings}`);
    console.log(`Average coverage: ${(totalCoverage / foundCount).toFixed(1)}%`);
  }
}

main();
