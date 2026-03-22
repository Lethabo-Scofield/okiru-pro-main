/**
 * Three-Path Scorecard Comparison
 *
 * Compares three calculation approaches on a single toolkit file:
 *
 *   Path A: TypeScript calculators (sectorCalculators.ts) with extracted data
 *   Path B: Computation Engine graph evaluation with cell overrides
 *   Path C: Toolkit's embedded scorecard values (ground truth from Excel)
 *
 * Path B must match Path C exactly. Path A should be close but may diverge.
 *
 * Prerequisites:
 *   1. ArangoDB and Computation Engine running
 *   2. The toolkit must already be compiled via compileAllToolkits.ts
 *
 * Usage:
 *   npx tsx __tests__/accuracy/threePathComparison.ts <toolkit-path> [model-version-id]
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseExcelBuffer, buildPipelineResult } from '../../pipeline/index.js';
import { getComputeClient } from '../../pipeline/computeClient.js';

const PILLAR_KEYS = [
  'ownership', 'managementControl', 'employmentEquity',
  'skillsDevelopment', 'preferentialProcurement',
  'enterpriseSupplierDevelopment', 'socioEconomicDevelopment',
];

interface PathResult {
  label: string;
  pillars: Record<string, number>;
  totalPoints: number;
  beeLevel: string;
  available: boolean;
  error?: string;
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

async function runComparison(filePath: string, modelVersionId?: string) {
  const fileName = path.basename(filePath);
  console.log(`\nThree-Path Comparison: ${fileName}`);
  console.log('='.repeat(70));

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
  console.log(`File: ${sizeMB} MB`);

  // --- Path A: TypeScript calculators ---
  console.log('\n--- Path A: TypeScript Calculators ---');
  const tA0 = Date.now();
  const parsed = parseExcelBuffer(buffer, fileName);
  const result = buildPipelineResult(parsed, fileName);
  const tA = Date.now() - tA0;

  const pathA: PathResult = {
    label: 'TypeScript Calculators',
    pillars: {},
    totalPoints: result.scorecard.pillars.totalPoints,
    beeLevel: result.scorecard.beeLevel,
    available: true,
  };
  for (const key of PILLAR_KEYS) {
    pathA.pillars[key] = (result.scorecard.pillars as Record<string, number>)[key] || 0;
  }
  console.log(`  Total: ${pathA.totalPoints} pts, Level: ${pathA.beeLevel} (${tA}ms)`);

  // --- Path C: Toolkit ground truth (embedded scorecard values) ---
  console.log('\n--- Path C: Toolkit Ground Truth ---');
  const toolkitScores = parsed.scorecardValues || {};
  const pathC: PathResult = {
    label: 'Toolkit Ground Truth',
    pillars: {},
    totalPoints: toolkitScores.totalPoints || 0,
    beeLevel: 'N/A',
    available: Object.keys(toolkitScores).length > 0,
  };
  for (const key of PILLAR_KEYS) {
    pathC.pillars[key] = toolkitScores[key] ?? -1;
  }
  if (pathC.available) {
    console.log(`  Total: ${pathC.totalPoints || 'N/A'} pts`);
    for (const key of PILLAR_KEYS) {
      const v = pathC.pillars[key];
      console.log(`    ${key}: ${v >= 0 ? v : 'N/A'}`);
    }
  } else {
    console.log('  No embedded scorecard values found in toolkit');
  }

  // --- Path B: Computation Engine graph evaluation ---
  console.log('\n--- Path B: Computation Engine ---');
  const client = getComputeClient();
  let pathB: PathResult = {
    label: 'Computation Engine',
    pillars: {},
    totalPoints: 0,
    beeLevel: 'N/A',
    available: false,
  };

  const engineAvailable = await client.isAvailable();
  if (!engineAvailable) {
    console.log('  Computation Engine not available -- SKIPPED');
    pathB.error = 'Engine not available';
  } else if (!modelVersionId) {
    console.log('  No model version ID provided -- SKIPPED');
    console.log('  Run compileAllToolkits.ts first to get a version ID');
    pathB.error = 'No model version ID';
  } else {
    try {
      const tB0 = Date.now();
      const evalResult = await client.evaluateModel(modelVersionId, {});
      const tB = Date.now() - tB0;
      pathB.available = true;

      console.log(`  Evaluation: ${evalResult.stats.evaluated} cells computed, ${evalResult.stats.overridden} overrides (${tB}ms)`);

      const scoreResults = evalResult.results;
      const scoreKeys = Object.keys(scoreResults);
      console.log(`  Total result cells: ${scoreKeys.length}`);

      const scorecardCells = scoreKeys.filter(k =>
        /scorecard|summary|score|result/i.test(k.split('!')[0] || '')
      );
      if (scorecardCells.length > 0) {
        console.log(`  Scorecard-related cells: ${scorecardCells.length}`);
        for (const cell of scorecardCells.slice(0, 20)) {
          console.log(`    ${cell} = ${scoreResults[cell]}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERROR: ${msg}`);
      pathB.error = msg;
    }
  }

  // --- Comparison Table ---
  console.log('\n' + '='.repeat(70));
  console.log('  COMPARISON');
  console.log('='.repeat(70));
  console.log(`  ${'Pillar'.padEnd(35)} ${'Path A (TS)'.padStart(12)} ${'Path B (Engine)'.padStart(15)} ${'Path C (Truth)'.padStart(15)} ${'A-C Dev'.padStart(8)}`);
  console.log('-'.repeat(70));

  let allMatch = true;
  for (const key of PILLAR_KEYS) {
    const a = pathA.pillars[key] ?? 0;
    const b = pathB.available ? (pathB.pillars[key] ?? 'N/A') : 'N/A';
    const c = pathC.pillars[key] >= 0 ? pathC.pillars[key] : 'N/A';
    const dev = typeof c === 'number' ? r2(Math.abs(a - c)) : 'N/A';
    if (typeof dev === 'number' && dev > 0.5) allMatch = false;
    console.log(`  ${key.padEnd(35)} ${String(r2(a)).padStart(12)} ${String(b).padStart(15)} ${String(c).padStart(15)} ${String(dev).padStart(8)}`);
  }

  console.log('-'.repeat(70));
  console.log(`  ${'TOTAL'.padEnd(35)} ${String(r2(pathA.totalPoints)).padStart(12)} ${pathB.available ? String(r2(pathB.totalPoints)).padStart(15) : 'N/A'.padStart(15)} ${pathC.totalPoints ? String(r2(pathC.totalPoints)).padStart(15) : 'N/A'.padStart(15)}`);
  console.log(`  ${'LEVEL'.padEnd(35)} ${pathA.beeLevel.padStart(12)} ${pathB.beeLevel.padStart(15)} ${pathC.beeLevel.padStart(15)}`);
  console.log('='.repeat(70));

  if (allMatch) {
    console.log('\n  RESULT: Path A matches Path C within tolerance');
  } else {
    console.log('\n  RESULT: DEVIATIONS DETECTED between Path A and Path C');
  }

  if (!pathB.available) {
    console.log('  Path B (Computation Engine) was not tested -- run with model version ID');
  }
}

const isMainModule = process.argv[1]?.replace(/\\/g, '/').includes('threePathComparison');

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: npx tsx __tests__/accuracy/threePathComparison.ts <toolkit-path> [model-version-id]');
    process.exit(0);
  }

  runComparison(args[0], args[1]).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { runComparison };
