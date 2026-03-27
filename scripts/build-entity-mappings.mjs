/**
 * Script to build entity mappings for all templates
 */

const API_URL = 'http://localhost:5001';

const mappings = [
  { sectorCode: 'RCOGP', scorecardType: 'Generic', graphKey: '118024' },
  { sectorCode: 'RCOGP', scorecardType: 'QSE', graphKey: '126134' },
  { sectorCode: 'ICT', scorecardType: 'Generic', graphKey: '144996' },
  { sectorCode: 'ICT', scorecardType: 'QSE', graphKey: '153301' },
  { sectorCode: 'AGRI', scorecardType: 'Generic', graphKey: '137295' },
  { sectorCode: 'FSC', scorecardType: 'Generic', graphKey: '157148' },
];

async function buildMapping(sectorCode, scorecardType, graphKey) {
  console.log(`\nBuilding entity mapping for ${sectorCode}/${scorecardType} (graphKey: ${graphKey})...`);
  
  try {
    const response = await fetch(`${API_URL}/api/entity-mappings/build/${sectorCode}/${scorecardType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ graphKey }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`  ERROR: ${response.status} - ${error}`);
      return false;
    }

    const result = await response.json();
    console.log(`  SUCCESS: Built ${result.mappings?.length || 0} entity mappings`);
    console.log(`  ID: ${result.id}`);
    console.log(`  Updated: ${new Date(result.updatedAt).toLocaleString()}`);
    return true;
  } catch (error) {
    console.error(`  ERROR: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('Building Entity Mappings for All Templates');
  console.log('=' .repeat(50));
  
  let successCount = 0;
  
  for (const mapping of mappings) {
    const success = await buildMapping(mapping.sectorCode, mapping.scorecardType, mapping.graphKey);
    if (success) successCount++;
    
    // Wait a bit between requests to not overload the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Completed: ${successCount}/${mappings.length} mappings built successfully`);
  
  if (successCount === mappings.length) {
    console.log('\nAll entity mappings rebuilt successfully!');
    console.log('\nNext step: Test entity extraction with the following command:');
    console.log('  1. Upload a document via the web app');
    console.log('  2. Or test with: node scripts/test-extraction.mjs <documentId> <sectorCode> <scorecardType>');
  } else {
    console.log('\nSome mappings failed. Check the errors above.');
  }
}

main();
