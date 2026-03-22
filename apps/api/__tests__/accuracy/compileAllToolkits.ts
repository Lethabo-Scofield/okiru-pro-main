/**
 * Compile All Toolkits via Computation Engine
 *
 * Uploads each of the 6 B-BBEE toolkit templates to the Computation Engine
 * for formula compilation and stores the sector-to-model mapping.
 *
 * Prerequisites:
 *   1. ArangoDB running (docker compose up -d in apps/Computation-Engine)
 *   2. Computation Engine running (python run_server.py in apps/Computation-Engine)
 *
 * Usage:
 *   npx tsx __tests__/accuracy/compileAllToolkits.ts <toolkit-base-path>
 */

import * as fs from 'fs';
import * as path from 'path';
import { getComputeClient } from '../../pipeline/computeClient.js';

interface ToolkitDef {
  relativePath: string;
  sectorCode: string;
  scorecardType: string;
  name: string;
}

const TOOLKIT_DEFS: ToolkitDef[] = [
  {
    relativePath: 'BBBEE Toolkits/1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx',
    sectorCode: 'RCOGP',
    scorecardType: 'Generic',
    name: 'RCOGP Generic Template',
  },
  {
    relativePath: 'BBBEE Toolkits/1. RCOGP (Generic)/Lake Trading  Toolkit (RCOGP).xlsx',
    sectorCode: 'RCOGP',
    scorecardType: 'Generic_LakeTrading',
    name: 'Lake Trading (RCOGP)',
  },
  {
    relativePath: 'BBBEE Toolkits/2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx',
    sectorCode: 'ICT',
    scorecardType: 'Generic',
    name: 'ICT Generic Template',
  },
  {
    relativePath: 'BBBEE Toolkits/3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx',
    sectorCode: 'ICT',
    scorecardType: 'QSE',
    name: 'ICT QSE Template',
  },
  {
    relativePath: 'BBBEE Toolkits/4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx',
    sectorCode: 'RCOGP',
    scorecardType: 'QSE',
    name: 'RCOGP QSE Template',
  },
  {
    relativePath: 'BBBEE Toolkits/5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx',
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    name: 'FSC Generic Template',
  },
  {
    relativePath: 'BBBEE Toolkits/6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx',
    sectorCode: 'AGRI',
    scorecardType: 'Generic',
    name: 'Agri Generic Template',
  },
];

async function compileAllToolkits(basePath: string) {
  const client = getComputeClient();

  console.log('Checking Computation Engine availability...');
  const available = await client.isAvailable();
  if (!available) {
    console.error('Computation Engine is not available at', (client as any).config?.baseUrl || 'http://127.0.0.1:8000');
    console.error('Make sure ArangoDB and the Computation Engine are running:');
    console.error('  cd apps/Computation-Engine && docker compose up -d');
    console.error('  cd apps/Computation-Engine && python run_server.py');
    process.exit(1);
  }
  console.log('Computation Engine is available.\n');

  const results: Array<{
    name: string;
    sectorCode: string;
    scorecardType: string;
    status: 'compiled' | 'skipped' | 'failed';
    versionId?: string;
    cells?: number;
    formulas?: number;
    error?: string;
    timeMs: number;
  }> = [];

  for (const def of TOOLKIT_DEFS) {
    const fullPath = path.join(basePath, def.relativePath);
    const t0 = Date.now();

    if (!fs.existsSync(fullPath)) {
      console.log(`SKIP: ${def.name} (${def.relativePath} not found)`);
      results.push({ name: def.name, sectorCode: def.sectorCode, scorecardType: def.scorecardType, status: 'skipped', timeMs: 0 });
      continue;
    }

    const sizeMB = (fs.statSync(fullPath).size / (1024 * 1024)).toFixed(1);
    console.log(`Compiling: ${def.name} (${sizeMB} MB) ...`);

    try {
      const model = await client.compileToolkit(fullPath, def.name);
      const elapsed = Date.now() - t0;

      if (model.status === 'active' || model.status === 'processing') {
        console.log(`  => OK: version=${model.version_id}, cells=${model.cell_count}, formulas=${model.formula_count} (${elapsed}ms)`);
        results.push({
          name: def.name,
          sectorCode: def.sectorCode,
          scorecardType: def.scorecardType,
          status: 'compiled',
          versionId: model.version_id,
          cells: model.cell_count,
          formulas: model.formula_count,
          timeMs: elapsed,
        });
      } else {
        console.log(`  => FAILED: status=${model.status}, error=${model.error}`);
        results.push({
          name: def.name,
          sectorCode: def.sectorCode,
          scorecardType: def.scorecardType,
          status: 'failed',
          error: model.error || `Unexpected status: ${model.status}`,
          timeMs: elapsed,
        });
      }
    } catch (err: unknown) {
      const elapsed = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  => ERROR: ${msg} (${elapsed}ms)`);
      results.push({
        name: def.name,
        sectorCode: def.sectorCode,
        scorecardType: def.scorecardType,
        status: 'failed',
        error: msg,
        timeMs: elapsed,
      });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  COMPILATION SUMMARY');
  console.log('='.repeat(70));
  const compiled = results.filter(r => r.status === 'compiled');
  const skipped = results.filter(r => r.status === 'skipped');
  const failed = results.filter(r => r.status === 'failed');
  console.log(`  Compiled: ${compiled.length}  |  Skipped: ${skipped.length}  |  Failed: ${failed.length}`);
  console.log();

  for (const r of results) {
    const icon = r.status === 'compiled' ? 'OK' : r.status === 'skipped' ? 'SKIP' : 'FAIL';
    const detail = r.status === 'compiled'
      ? `cells=${r.cells}, formulas=${r.formulas}, version=${r.versionId}`
      : r.status === 'skipped'
        ? 'file not found'
        : r.error || 'unknown error';
    console.log(`  [${icon}] ${r.name.padEnd(30)} ${r.sectorCode}/${r.scorecardType}  ${detail}  (${r.timeMs}ms)`);
  }

  console.log('='.repeat(70));

  return results;
}

const isMainModule = process.argv[1]?.replace(/\\/g, '/').includes('compileAllToolkits');

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: npx tsx __tests__/accuracy/compileAllToolkits.ts <toolkit-base-path>');
    console.log('Example: npx tsx __tests__/accuracy/compileAllToolkits.ts "C:/path/to/BBBEE Toolkit"');
    process.exit(0);
  }

  compileAllToolkits(args[0]).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { compileAllToolkits, TOOLKIT_DEFS };
