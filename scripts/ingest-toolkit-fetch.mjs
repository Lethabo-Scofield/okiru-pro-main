/**
 * Toolkit Ingestion Script using native fetch
 *
 * Ingests B-BBEE toolkit Excel files using Node.js native fetch API.
 * Usage: node scripts/ingest-toolkit-fetch.mjs <sector> <type>
 * Example: node scripts/ingest-toolkit-fetch.mjs AGRI Generic
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TOOLKITS_PATH = process.env.TOOLKITS_PATH || 'C:\\Users\\Administrator\\Downloads\\BBBEE Toolkit-20260318T172641Z-1-001\\BBBEE Toolkit\\BBBEE Toolkits';

const TOOLKITS = {
  'RCOGP:Generic': '1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx',
  'ICT:Generic': '2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx',
  'ICT:QSE': '3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx',
  'RCOGP:QSE': '4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx',
  'FSC:Generic': '5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx',
  'AGRI:Generic': '6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx',
};

async function main() {
  const sector = process.argv[2] || 'AGRI';
  const type = process.argv[3] || 'Generic';
  const key = `${sector}:${type}`;

  console.log('========================================');
  console.log('B-BBEE Toolkit Ingestion (Native Fetch)');
  console.log('========================================\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`Sector: ${sector}, Type: ${type}`);
  console.log('');

  const subPath = TOOLKITS[key];
  if (!subPath) {
    console.error(`Unknown toolkit: ${key}`);
    console.log('\nAvailable toolkits:');
    for (const k of Object.keys(TOOLKITS)) {
      console.log(`  - ${k.replace(':', ' ')}`);
    }
    process.exit(1);
  }

  const filePath = path.join(TOOLKITS_PATH, subPath);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const stats = fs.statSync(filePath);
  console.log(`File: ${subPath}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log('');

  // Step 1: Check API health
  console.log('Step 1: Checking API health...');
  try {
    const healthRes = await fetch(`${API_URL}/health`);
    const health = await healthRes.json();
    if (health.arangodb?.ok) {
      console.log(`  ✓ API is running`);
      console.log(`  ✓ ArangoDB: connected (v${health.arangodb.version})`);
    } else {
      console.log('  ✗ ArangoDB: not connected');
      process.exit(1);
    }
  } catch (error) {
    console.error(`  ✗ Cannot connect to API: ${error.message}`);
    console.log('\nPlease ensure the API server is running:');
    console.log('  cd apps/api && pnpm dev');
    process.exit(1);
  }

  // Step 2: Read file and create form data
  console.log('\nStep 2: Preparing upload...');
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const formData = new FormData();
  formData.append('file', blob, path.basename(subPath));
  formData.append('sectorCode', sector);
  formData.append('scorecardType', type);

  console.log('  ✓ Form data prepared');

  // Step 3: Upload
  console.log('\nStep 3: Uploading to API...');
  console.log('  (This may take several minutes for large files)');
  const startTime = Date.now();

  try {
    const response = await fetch(`${API_URL}/api/templates/ingest`, {
      method: 'POST',
      body: formData,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (response.ok) {
      const result = await response.json();
      console.log(`\n✓ Ingestion complete in ${duration}s!\n`);
      console.log('Results:');
      console.log(`  Scorecard Key: ${result.scorecardKey}`);
      console.log(`  Graph Key: ${result.graphKey}`);
      console.log(`  Pillars: ${result.pillars}`);
      console.log(`  Indicators: ${result.indicators}`);
      console.log(`  Targets: ${result.targets}`);
      console.log(`  Graph Nodes: ${result.graphNodes}`);
      console.log(`  Graph Edges: ${result.graphEdges}`);

      if (result.errors?.length > 0) {
        console.log(`\n  ⚠ Warnings: ${result.errors.join(', ')}`);
      }

      console.log('\nNext steps:');
      console.log(`  1. View cells: GET ${API_URL}/api/templates/${result.graphKey}/cells`);
      console.log(`  2. View graph: GET ${API_URL}/api/templates/${result.graphKey}/graph`);
      console.log(`  3. Compare with Lake Trading: POST ${API_URL}/api/templates/${result.graphKey}/compare`);
    } else {
      const error = await response.text();
      console.error(`\n✗ Ingestion failed: ${response.status}`);
      console.error(error);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n✗ Upload failed: ${error.message}`);
    process.exit(1);
  }
}

main();
