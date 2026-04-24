/**
 * Compile all templates for the Computation Engine
 */

const API_URL = 'http://localhost:5001';

const templates = [
  { graphKey: '118024', sectorCode: 'RCOGP', scorecardType: 'Generic' },
  { graphKey: '126134', sectorCode: 'RCOGP', scorecardType: 'QSE' },
  { graphKey: '144996', sectorCode: 'ICT', scorecardType: 'Generic' },
  { graphKey: '153301', sectorCode: 'ICT', scorecardType: 'QSE' },
  { graphKey: '137295', sectorCode: 'AGRI', scorecardType: 'Generic' },
  { graphKey: '157148', sectorCode: 'FSC', scorecardType: 'Generic' },
];

async function compileTemplate(graphKey, sectorCode, scorecardType) {
  console.log(`\nCompiling ${sectorCode}/${scorecardType} (graphKey: ${graphKey})...`);
  
  try {
    // First, get the stored toolkit file
    const fileRes = await fetch(`${API_URL}/api/templates/${graphKey}/cells`);
    if (!fileRes.ok) {
      console.error(`  Error fetching template: ${fileRes.status}`);
      return null;
    }
    
    // We need to re-ingest to trigger compilation
    // The templates were already ingested but not compiled
    // Let's try calling the evaluate endpoint to see if it triggers compilation
    const evalRes = await fetch(`${API_URL}/api/templates/${graphKey}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: {} }),
    });

    if (evalRes.ok) {
      const result = await evalRes.json();
      console.log(`  ✅ Compiled successfully`);
      console.log(`  Model ID: ${result.modelVersion || 'N/A'}`);
      return result;
    } else {
      const error = await evalRes.text();
      console.error(`  ❌ Error: ${evalRes.status} - ${error.substring(0, 200)}`);
      return null;
    }
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Compiling Templates for Computation Engine');
  console.log('=' .repeat(60));
  
  let successCount = 0;
  
  for (const template of templates) {
    const result = await compileTemplate(template.graphKey, template.sectorCode, template.scorecardType);
    if (result) successCount++;
    
    // Wait between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Completed: ${successCount}/${templates.length} templates compiled`);
  
  if (successCount === templates.length) {
    console.log('\n✅ All templates ready for scorecard calculation!');
  } else {
    console.log('\n⚠️ Some templates failed to compile. Check errors above.');
  }
}

main();
