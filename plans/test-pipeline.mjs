import fs from 'fs';
import path from 'path';

// Import our newly rewritten modules
import { buildPipelineResult } from '../apps/web/lib/pipeline/buildResult.js';

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const data = {};
  
  // Skip header, parse rows
  for (let i = 1; i < lines.length; i++) {
    // Basic CSV parse assuming no complex quotes for now
    const parts = lines[i].split(',');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts[1].trim();
      if (key && val) {
        data[key] = val;
      }
    }
  }
  return data;
}

const testSheets = [
  'lake-trading.csv',
  'level4-borderline.csv',
  'low-compliance.csv',
  'high-compliance-level1.csv'
];

console.log('--- SCORECARD CALCULATION ENGINE TEST ---\n');

for (const sheet of testSheets) {
  const filepath = path.resolve('plans/test-sheets', sheet);
  if (!fs.existsSync(filepath)) continue;
  
  const extractedData = parseCSV(filepath);
  
  const parseResult = {
    client: {
      name: sheet.replace('.csv', ''),
      industrySector: 'Generic',
      applicableScorecard: 'Generic'
    },
    extractedData: extractedData,
    confidenceScores: {}
  };
  
  const result = buildPipelineResult(parseResult, sheet);
  
  console.log(`=========================================`);
  console.log(`TEST: ${sheet}`);
  console.log(`=========================================`);
  console.log(`FINAL LEVEL: ${result.scorecard.beeLevel} (${result.totalScore} pts)`);
  console.log(`Sub-Minimums Met: ${result.scorecard.subMinimumsMet ? 'Yes' : 'No' - Discounted: ${result.scorecard.isDiscounted}}`);
  
  console.log('\nPILLARS:');
  for (const pillar of result.pillars) {
    console.log(`  ${pillar.pillar.padEnd(35)}: ${pillar.weightedScore.toFixed(2).padStart(5)} / ${pillar.maxScore}`);
  }
  console.log('\n');
}
