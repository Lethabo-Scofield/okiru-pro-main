/**
 * Test scorecard calculation directly via API proxy
 * 
 * This tests if the API can reach the Computation Engine through its proxy.
 */

const API_URL = 'http://localhost:5001';

// Sample extracted entities
const sampleEntities = {
  'NPAT': 2500000,
  'TMPS': 5000000,
  'Black Ownership Percentage': 0.51,
  'Skills Training Spend': 150000,
};

async function testCalculation() {
  console.log('Testing Scorecard Calculation via API Proxy');
  console.log('='.repeat(60));
  
  // Step 1: Apply entities to get cell overrides
  console.log('\n1. Applying entities to get cell overrides...');
  
  try {
    const applyRes = await fetch(`${API_URL}/api/entity-mappings/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sectorCode: 'RCOGP',
        scorecardType: 'Generic',
        entities: sampleEntities,
      }),
    });

    if (!applyRes.ok) {
      console.error('Apply failed:', applyRes.status, await applyRes.text());
      return;
    }

    const applyResult = await applyRes.json();
    console.log(`   ✅ Cell Overrides: ${applyResult.overrideCount}`);
    console.log(`   Can Calculate: ${applyResult.canCalculate}`);
    
    if (applyResult.overrideCount === 0) {
      console.log('   ⚠️ No overrides generated');
      return;
    }
    
    // Show sample overrides
    console.log('   Sample overrides:');
    Object.entries(applyResult.cellOverrides).slice(0, 3).forEach(([cell, value]) => {
      console.log(`     - ${cell}: ${value}`);
    });

    // Step 2: Get latest graph key for RCOGP/Generic
    console.log('\n2. Finding template...');
    const templatesRes = await fetch(`${API_URL}/api/templates`);
    const templates = await templatesRes.json();
    
    const rcoqpGeneric = templates.find(t => 
      t.sourceFile?.includes('RCOGP') && 
      !t.sourceFile?.includes('QSE') &&
      t.sectorCode === 'RCOGP'
    );
    
    if (!rcoqpGeneric) {
      console.log('   ❌ RCOGP Generic template not found');
      return;
    }
    
    console.log(`   ✅ Found: ${rcoqpGeneric._key}`);
    console.log(`   Compute Model: ${rcoqpGeneric.computeModelId || 'Not compiled'}`);
    
    if (!rcoqpGeneric.computeModelId) {
      console.log('\n   ⚠️ Template not compiled for Computation Engine');
      console.log('   Attempting evaluation anyway...');
    }

    // Step 3: Calculate
    console.log('\n3. Calculating scorecard...');
    const calcRes = await fetch(`${API_URL}/api/templates/${rcoqpGeneric._key}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: applyResult.cellOverrides }),
    });

    if (!calcRes.ok) {
      const error = await calcRes.text();
      console.error(`   ❌ Calculation failed: ${calcRes.status}`);
      console.error(`   Error: ${error.substring(0, 200)}`);
      
      if (error.includes('computation model')) {
        console.log('\n   💡 Template needs to be compiled for Computation Engine');
        console.log('      The API cannot connect to the Python Computation Engine');
      }
      return;
    }

    const result = await calcRes.json();
    console.log(`   ✅ Calculation successful!`);
    console.log(`   Total Score: ${result.totalScore ?? 'N/A'}/${result.maxPossible ?? 'N/A'}`);
    console.log(`   Achieved Level: ${result.achievedLevel ?? 'N/A'}`);
    console.log(`   Recognition: ${result.recognition ?? 'N/A'}`);
    
    if (result.pillars) {
      console.log('\n   Pillar Scores:');
      Object.entries(result.pillars).forEach(([pillar, data]) => {
        const score = data?.score ?? data?.achieved ?? 'N/A';
        const max = data?.target ?? data?.maximum ?? 'N/A';
        console.log(`     - ${pillar}: ${score}/${max}`);
      });
    }
    
    console.log('\n✅ Scorecard calculation is working!');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCalculation();
