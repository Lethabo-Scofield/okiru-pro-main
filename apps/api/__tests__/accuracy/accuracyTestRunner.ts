/**
 * Accuracy Test Runner
 *
 * Compares pipeline-calculated B-BBEE scores against the original
 * toolkit's embedded scorecard values.
 *
 * Usage:
 *   npx tsx __tests__/accuracy/accuracyTestRunner.ts [path-to-toolkit.xlsx]
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseExcelBuffer, buildPipelineResult } from '../../pipeline/index.js';
import { buildFormulaGraph } from '../../pipeline/formulaGraphBuilder.js';
import { validateAll } from '../../pipeline/extraction/index.js';
import { detectSectorFromName } from '../../pipeline/sectorConfig.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PillarTestResult {
  pillar: string;
  code: string;
  maxPoints: number;
  calculated: number;
  toolkitReference: number | null;
  deviation: number | null;
  passed: boolean;
  threshold: number;
  details: string;
}

interface AccuracyReport {
  file: string;
  timestamp: string;
  clientName: string;
  sector: string;
  overallPassed: boolean;
  totalCalculated: number;
  totalToolkit: number | null;
  beeLevel: string;
  recognition: number;
  pillarResults: PillarTestResult[];
  validationIssues: number;
  extractionStats: {
    sheetsFound: number;
    sheetsMatched: number;
    shareholders: number;
    employees: number;
    suppliers: number;
    trainings: number;
    esdContributions: number;
    sedContributions: number;
  };
  graphStats: {
    totalCells: number;
    formulaCells: number;
    inputCells: number;
    edges: number;
    processedSheets: number;
    skippedSheets: number;
  } | null;
  timings: { parseMs: number; pipelineMs: number; graphMs: number; totalMs: number };
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PILLAR_NAMES: Record<string, string> = {
  ownership: 'Ownership',
  managementControl: 'Management Control',
  employmentEquity: 'Employment Equity',
  skillsDevelopment: 'Skills Development',
  preferentialProcurement: 'Preferential Procurement',
  enterpriseSupplierDevelopment: 'Enterprise & Supplier Dev',
  socioEconomicDevelopment: 'Socio-Economic Development',
};

function getPillarDefs(sector: string) {
  const cfg = detectSectorFromName(sector);
  const pc = cfg.pillarConfigs;
  return Object.entries(PILLAR_NAMES).map(([code, name]) => ({
    code,
    name,
    maxPts: pc[code as keyof typeof pc]?.maxPoints ?? 0,
  }));
}

const DEVIATION_THRESHOLD = 0.5;

function emptyReport(fileName: string, errors: string[]): AccuracyReport {
  return {
    file: fileName, timestamp: new Date().toISOString(), clientName: 'N/A', sector: 'N/A',
    overallPassed: false, totalCalculated: 0, totalToolkit: null, beeLevel: 'N/A', recognition: 0,
    pillarResults: [], validationIssues: 0,
    extractionStats: { sheetsFound: 0, sheetsMatched: 0, shareholders: 0, employees: 0, suppliers: 0, trainings: 0, esdContributions: 0, sedContributions: 0 },
    graphStats: null,
    timings: { parseMs: 0, pipelineMs: 0, graphMs: 0, totalMs: 0 },
    errors,
  };
}

// ---------------------------------------------------------------------------
// Core test
// ---------------------------------------------------------------------------

export function runAccuracyTest(filePath: string): AccuracyReport {
  const errors: string[] = [];
  const fileName = path.basename(filePath);
  const t0 = Date.now();

  if (!fs.existsSync(filePath)) return emptyReport(fileName, [`File not found: ${filePath}`]);

  const buffer = fs.readFileSync(filePath);
  const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
  console.log(`    File size: ${fileSizeMB} MB`);

  // --- Parse ---------------------------------------------------------------
  const tParse0 = Date.now();
  const parseResult = parseExcelBuffer(buffer, fileName);
  const parseMs = Date.now() - tParse0;
  console.log(`    Parse: ${parseMs}ms (${parseResult.sheetsFound.length} sheets, ${parseResult.stats.entitiesExtracted} entities)`);

  // --- Pipeline ------------------------------------------------------------
  const tPipe0 = Date.now();
  const pipelineResult = buildPipelineResult(parseResult, fileName);
  const pipelineMs = Date.now() - tPipe0;
  console.log(`    Pipeline: ${pipelineMs}ms`);

  // --- Graph extraction (optimised – only calc sheets, sparse iteration) ---
  let graphStats: AccuracyReport['graphStats'] = null;
  const tGraph0 = Date.now();
  try {
    const graph = buildFormulaGraph(buffer, fileName, {
      maxTotalCells: 150_000,
      maxCellsPerSheet: 30_000,
      skipCycleDetection: true,
    });
    graphStats = {
      totalCells: graph.metadata.totalCells,
      formulaCells: graph.metadata.formulaCells,
      inputCells: graph.metadata.inputCells,
      edges: graph.metadata.edgeCount,
      processedSheets: graph.processedSheets.length,
      skippedSheets: graph.skippedSheets.length,
    };
    console.log(`    Graph: ${Date.now() - tGraph0}ms (${graph.metadata.totalCells} cells, ${graph.processedSheets.length}/${graph.sheets.length} sheets processed)`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Graph extraction: ${msg}`);
    console.log(`    Graph: SKIPPED (${msg})`);
  }
  const graphMs = Date.now() - tGraph0;

  // --- Validation ----------------------------------------------------------
  const validation = validateAll({
    shareholders: parseResult.shareholders.map(s => ({ name: s.name, blackOwnership: s.blackOwnership, blackWomenOwnership: s.blackWomenOwnership, shares: s.shares })),
    financials: { revenue: parseResult.client.revenue, npat: parseResult.client.npat, leviableAmount: parseResult.client.leviableAmount, tmps: parseResult.client.tmps, payroll: parseResult.client.payroll },
    employees: parseResult.employees.map(e => ({ race: e.race, gender: e.gender, designation: e.designation })),
    suppliers: parseResult.suppliers.map(s => ({ beeLevel: s.beeLevel, spend: s.spend, blackOwnership: s.blackOwnership })),
  });

  // --- Compare pillars -----------------------------------------------------
  const toolkitScores = parseResult.scorecardValues || {};
  const pillars = pipelineResult.scorecard.pillars as Record<string, number>;
  const sectorPillarDefs = getPillarDefs(pipelineResult.client.industrySector || '');

  const pillarResults: PillarTestResult[] = sectorPillarDefs.map(pDef => {
    const calculated = pillars[pDef.code] || 0;
    const reference = toolkitScores[pDef.code] ?? null;
    const deviation = reference !== null ? Math.abs(calculated - reference) : null;
    const passed = reference === null || deviation! <= DEVIATION_THRESHOLD;

    let details: string;
    if (reference === null) details = 'No toolkit reference value';
    else if (passed) details = `OK: calc ${calculated.toFixed(2)} vs ref ${reference.toFixed(2)} (dev ${deviation!.toFixed(3)})`;
    else details = `MISMATCH: calc ${calculated.toFixed(2)} vs ref ${reference.toFixed(2)} (dev ${deviation!.toFixed(3)})`;

    return { pillar: pDef.name, code: pDef.code, maxPoints: pDef.maxPts, calculated, toolkitReference: reference, deviation, passed, threshold: DEVIATION_THRESHOLD, details };
  });

  const totalCalc = pipelineResult.scorecard.pillars.totalPoints;
  const totalToolkit = toolkitScores.totalPoints ?? null;
  const overallPassed = pillarResults.every(r => r.passed) && (totalToolkit === null || Math.abs(totalCalc - totalToolkit) <= 1.0);
  const totalMs = Date.now() - t0;

  return {
    file: fileName, timestamp: new Date().toISOString(),
    clientName: pipelineResult.client.name, sector: pipelineResult.client.industrySector,
    overallPassed, totalCalculated: totalCalc, totalToolkit, beeLevel: pipelineResult.scorecard.beeLevel,
    recognition: pipelineResult.scorecard.recognitionLevelPercent,
    pillarResults, validationIssues: validation.issues.length,
    extractionStats: {
      sheetsFound: pipelineResult.sheetsFound.length, sheetsMatched: pipelineResult.sheetsMatched.length,
      shareholders: pipelineResult.ownership.shareholders.length, employees: pipelineResult.managementControl.employeesCount,
      suppliers: pipelineResult.preferentialProcurement.suppliersCount, trainings: pipelineResult.skillsDevelopment.trainingProgramsCount,
      esdContributions: pipelineResult.enterpriseSupplierDevelopment.esdList.length, sedContributions: pipelineResult.socioEconomicDevelopment.sedList.length,
    },
    graphStats,
    timings: { parseMs, pipelineMs, graphMs, totalMs },
    errors,
  };
}

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------

export function runBatchAccuracyTest(basePath: string): {
  summary: { total: number; passed: number; failed: number; noReference: number };
  reports: AccuracyReport[];
} {
  const TOOLKIT_FILES = [
    'BBBEE Toolkits/1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx',
    'BBBEE Toolkits/1. RCOGP (Generic)/Lake Trading  Toolkit (RCOGP).xlsx',
    'BBBEE Toolkits/2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx',
    'BBBEE Toolkits/3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx',
    'BBBEE Toolkits/4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx',
    'BBBEE Toolkits/5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx',
    'BBBEE Toolkits/6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx',
  ];

  const reports: AccuracyReport[] = [];
  let passed = 0, failed = 0, noReference = 0;

  for (const relPath of TOOLKIT_FILES) {
    const fullPath = path.join(basePath, relPath);
    if (!fs.existsSync(fullPath)) { console.log(`  SKIP: ${relPath} (not found)`); continue; }

    console.log(`\n  Testing: ${path.basename(relPath)}`);
    const report = runAccuracyTest(fullPath);
    reports.push(report);

    const hasRef = report.pillarResults.some(r => r.toolkitReference !== null);
    if (!hasRef) { noReference++; console.log(`    => No reference data (template only)`); }
    else if (report.overallPassed) { passed++; console.log(`    => PASSED (${report.totalCalculated.toFixed(1)} pts, ${report.beeLevel})`); }
    else {
      failed++;
      const fails = report.pillarResults.filter(r => !r.passed && r.toolkitReference !== null);
      console.log(`    => FAILED: ${fails.map(f => `${f.pillar}: calc ${f.calculated.toFixed(1)} vs ref ${f.toolkitReference!.toFixed(1)}`).join('; ')}`);
    }
  }

  return { summary: { total: reports.length, passed, failed, noReference }, reports };
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export function formatReport(report: AccuracyReport): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`  B-BBEE ACCURACY TEST REPORT`);
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`  File:       ${report.file}`);
  lines.push(`  Client:     ${report.clientName}`);
  lines.push(`  Sector:     ${report.sector}`);
  lines.push(`  Status:     ${report.overallPassed ? 'PASSED' : 'FAILED'}`);
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`  BEE Level:  ${report.beeLevel} (${report.recognition}% recognition)`);
  lines.push(`  Total:      ${report.totalCalculated.toFixed(2)} pts (toolkit: ${report.totalToolkit?.toFixed(2) ?? 'N/A'})`);
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('  PILLAR BREAKDOWN:');

  for (const pr of report.pillarResults) {
    const status = pr.toolkitReference === null ? '  --' : (pr.passed ? '  OK' : 'FAIL');
    const ref = pr.toolkitReference !== null ? pr.toolkitReference.toFixed(2) : '  N/A';
    const dev = pr.deviation !== null ? pr.deviation.toFixed(3) : '  N/A';
    lines.push(`  [${status}] ${pr.pillar.padEnd(30)} Calc: ${pr.calculated.toFixed(2).padStart(6)}/${pr.maxPoints}  Ref: ${ref.padStart(6)}  Dev: ${dev.padStart(6)}`);
  }

  lines.push('');
  lines.push('  EXTRACTION:');
  lines.push(`    Sheets: ${report.extractionStats.sheetsMatched}/${report.extractionStats.sheetsFound} matched  |  Shareholders: ${report.extractionStats.shareholders}  |  Employees: ${report.extractionStats.employees}`);
  lines.push(`    Suppliers: ${report.extractionStats.suppliers}  |  Trainings: ${report.extractionStats.trainings}  |  ESD: ${report.extractionStats.esdContributions}  |  SED: ${report.extractionStats.sedContributions}`);
  lines.push(`    Validation issues: ${report.validationIssues}`);

  if (report.graphStats) {
    lines.push('  GRAPH:');
    lines.push(`    ${report.graphStats.totalCells} cells (${report.graphStats.formulaCells} formulas)  |  ${report.graphStats.edges} edges  |  ${report.graphStats.processedSheets} sheets processed, ${report.graphStats.skippedSheets} skipped`);
  }

  lines.push('  TIMING:');
  lines.push(`    Parse: ${report.timings.parseMs}ms  |  Pipeline: ${report.timings.pipelineMs}ms  |  Graph: ${report.timings.graphMs}ms  |  Total: ${report.timings.totalMs}ms`);

  if (report.errors.length > 0) {
    lines.push('  ERRORS:');
    for (const err of report.errors) lines.push(`    - ${err}`);
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1]?.replace(/\\/g, '/').includes('accuracyTestRunner');

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: npx tsx __tests__/accuracy/accuracyTestRunner.ts <file-or-directory>');
    process.exit(0);
  }

  const target = args[0];
  const stat = fs.statSync(target);

  if (stat.isFile()) {
    console.log(`\nAccuracy test: ${target}\n`);
    const report = runAccuracyTest(target);
    console.log('\n' + formatReport(report));
  } else if (stat.isDirectory()) {
    console.log(`\nBatch accuracy tests: ${target}`);
    const batch = runBatchAccuracyTest(target);
    console.log('\n' + '='.repeat(65));
    console.log(`  SUMMARY: ${batch.summary.total} files  |  Passed: ${batch.summary.passed}  |  Failed: ${batch.summary.failed}  |  No Ref: ${batch.summary.noReference}`);
    console.log('='.repeat(65));
    for (const r of batch.reports) console.log('\n' + formatReport(r));
  }
}
