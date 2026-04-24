/**
 * Test scorecard calculation with extracted entities
 */

const API_URL = 'http://localhost:5001';

// Sample extracted entities that would come from document extraction
const sampleEntities = {
  // Financial inputs
  'Total Revenue': 10000000,
  'NPAT': 2500000,
  'Leviable Amount': 100000,
  'TMPS': 5000000,
  
  // Ownership
  'Black Ownership Percentage': 0.51,
  'Black Female Ownership Percentage': 0.20,
  'Black Youth Ownership Percentage': 0.10,
  
  // Management Control
  'Black Board Representation': 0.60,
  'Black Female Board Representation': 0.30,
  'Black Executive Representation': 0.50,
  
  // Skills Development
  'Skills Training Spend': 150000,
  'Learners Employed': 5,
  'Bursary Value': 50000,
  
  // Procurement
  'Supplier TMPS': 3000000,
  'Empowered Supplier TMPS': 1500000,
  'Black Owned TMPS': 1000000,
  'Black Woman Owned TMPS': 500000,
  'Black Youth Owned TMPS': 200000,
  
  // ESD & SED
  'ESD Contribution': 50000,
  'SED Contribution': 25000,
  
  // YES Initiative
  'YES Participants': 3,
};

async function testApplyAndCalculate(sectorCode, scorecardType, graphKey) {
  console.log(`\nTesting ${sectorCode}/${scorecardType} (graphKey: ${graphKey})...`);
  
  try {
    // Step 1: Apply entities to get cell overrides
    const applyResponse = await fetch(`${API_URL}/api/entity-mappings/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sectorCode,
        scorecardType,
        entities: sampleEntities,
      }),
    });

    if (!applyResponse.ok) {
      const error = await applyResponse.text();
      console.error(`  APPLY ERROR: ${applyResponse.status} - ${error}`);
      return null;
    }

    const applyResult = await applyResponse.json();
    console.log(`  Cell Overrides: ${applyResult.overrideCount}`);
    console.log(`  Can Calculate: ${applyResult.canCalculate}`);
    
    if (applyResult.overrideCount === 0) {
      console.log('  ⚠️ No cell overrides generated - entities may not be mapped');
      return null;
    }

    // Show sample overrides
    console.log('  Sample overrides:');
    const entries = Object.entries(applyResult.cellOverrides).slice(0, 5);
    for (const [cell, value] of entries) {
      console.log(`    - ${cell}: ${value}`);
    }

    // Step 2: Calculate the scorecard with overrides
    // The correct endpoint is POST /api/templates/:graphKey/evaluate
    const calcResponse = await fetch(`${API_URL}/api/templates/${graphKey}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overrides: applyResult.cellOverrides,
      }),
    });

    if (!calcResponse.ok) {
      const error = await calcResponse.text();
      console.error(`  CALC ERROR: ${calcResponse.status} - ${error.substring(0, 200)}`);
      return null;
    }

    const calcResult = await calcResponse.json();
    
    console.log(`  Scorecard Calculation:`);
    console.log(`    Total Score: ${calcResult.totalScore ?? 'N/A'}/${calcResult.maxPossible ?? 'N/A'}`);
    console.log(`    Achieved Level: ${calcResult.achievedLevel ?? 'N/A'}`);
    console.log(`    Recognition: ${calcResult.recognition ?? 'N/A'}`);
    console.log(`    Discounted: ${calcResult.isDiscounted ? 'YES' : 'No'}`);
    
    if (calcResult.pillars) {
      console.log('  Pillar Scores:');
      for (const [pillar, data] of Object.entries(calcResult.pillars)) {
        const score = data?.score ?? data?.achieved ?? 'N/A';
        const max = data?.target ?? data?.maximum ?? 'N/A';
        console.log(`    - ${pillar}: ${score}/${max}`);
      }
    }
    
    return calcResult;
  } catch (error) {
    console.error(`  ERROR: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('Testing Scorecard Calculation with Sample Entities');
  console.log('='.repeat(70));
  console.log('\nSample Entities:', Object.keys(sampleEntities).slice(0, 10).join(', ') + '...');
  
  const testCases = [
    { sectorCode: 'RCOGP', scorecardType: 'Generic', graphKey: '118024' },
    { sectorCode: 'RCOGP', scorecardType: 'QSE', graphKey: '126134' },
    { sectorCode: 'ICT', scorecardType: 'Generic', graphKey: '144996' },
    { sectorCode: 'ICT', scorecardType: 'QSE', graphKey: '153301' },
    { sectorCode: 'AGRI', scorecardType: 'Generic', graphKey: '137295' },
    { sectorCode: 'FSC', scorecardType: 'Generic', graphKey: '157148' },
  ];

  let successCount = 0;
  for (const testCase of testCases) {
    const result = await testApplyAndCalculate(testCase.sectorCode, testCase.scorecardType, testCase.graphKey);
    if (result && result.totalScore !== undefined) successCount++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`Test Complete: ${successCount}/${testCases.length} scorecards calculated successfully`);
  console.log('='.repeat(70));
  
  if (successCount > 0) {
    console.log('\n✅ The scorecard calculation system is working!');
    console.log('\nNext Steps:');
    console.log('1. Upload a document via the web app at http://localhost:5000');
    console.log('2. Extract entities from the document');
    console.log('3. Navigate to /scorecard-summary to see the final scorecard');
  } else {
    console.log('\n⚠️ Scorecard calculation failed. Check if computation engine is running.');
  }
}

main();
