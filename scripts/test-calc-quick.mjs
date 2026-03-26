/**
 * Quick test of scorecard calculation
 */

const API_URL = 'http://localhost:5001';

const sampleEntities = {
  'NPAT': 2500000,
  'TMPS': 5000000,
  'Black Ownership Percentage': 0.51,
  'Skills Training Spend': 150000,
};

async function testCalc() {
  console.log('Testing scorecard calculation...\n');
  
  try {
    // Apply entities
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
    console.log('Cell Overrides:', applyResult.overrideCount);
    console.log('Can Calculate:', applyResult.canCalculate);
    
    if (applyResult.overrideCount === 0) {
      console.log('No overrides generated');
      return;
    }

    // Evaluate
    const evalRes = await fetch(`${API_URL}/api/templates/118024/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: applyResult.cellOverrides }),
    });

    if (!evalRes.ok) {
      console.error('Eval failed:', evalRes.status, await evalRes.text());
      return;
    }

    const result = await evalRes.json();
    console.log('\nScorecard Results:');
    console.log('  Total Score:', result.totalScore, '/', result.maxPossible);
    console.log('  Achieved Level:', result.achievedLevel);
    console.log('  Recognition:', result.recognition);
    
    if (result.pillars) {
      console.log('\n  Pillar Scores:');
      for (const [pillar, data] of Object.entries(result.pillars)) {
        const score = data?.score ?? data?.achieved ?? 'N/A';
        const max = data?.target ?? data?.maximum ?? 'N/A';
        console.log(`    - ${pillar}: ${score}/${max}`);
      }
    }
    
    console.log('\n✅ Scorecard calculation working!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCalc();
