/**
 * Single Toolkit Ingestion Script
 *
 * Ingests one B-BBEE toolkit Excel file at a time.
 * Usage: node scripts/ingest-single.js <sector> <type>
 * Example: node scripts/ingest-single.js RCOGP Generic
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:5000';
const TOOLKITS_PATH = path.resolve(__dirname, '../docs/BBBEE Toolkits');

const TOOLKITS = {
  'RCOGP:Generic': '1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx',
  'ICT:Generic': '2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx',
  'ICT:QSE': '3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx',
  'RCOGP:QSE': '4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx',
  'FSC:Generic': '5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx',
  'AGRI:Generic': '6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx',
};

function makeRequest(path, method, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 300000, // 5 minute timeout
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function main() {
  const sector = process.argv[2] || 'RCOGP';
  const type = process.argv[3] || 'Generic';
  const key = `${sector}:${type}`;

  console.log('========================================');
  console.log('Single Toolkit Ingestion');
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
  console.log(`Path: ${filePath}`);
  console.log('');

  // Step 1: Check API health
  console.log('Step 1: Checking API health...');
  try {
    const health = await makeRequest('/health');
    if (health.status === 200) {
      console.log('  ✓ API is running');
      if (health.data.arangodb?.ok) {
        console.log(`  ✓ ArangoDB: connected (v${health.data.arangodb.version})`);
      } else {
        console.log('  ✗ ArangoDB: not connected');
        process.exit(1);
      }
    } else {
      console.error(`  ✗ API health check failed: ${health.status}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`  ✗ Cannot connect to API: ${error.message}`);
    console.log('\nPlease ensure the API server is running:');
    console.log('  cd apps/api && pnpm dev');
    process.exit(1);
  }

  // Step 2: Read file
  console.log('\nStep 2: Reading file...');
  const startTime = Date.now();
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');
  console.log(`  ✓ File read (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
  console.log(`  ✓ Base64 encoded: ${(base64Data.length / 1024 / 1024).toFixed(2)} MB`);

  // Step 3: Ingest
  console.log('\nStep 3: Sending to API for ingestion...');
  console.log('  (This may take several minutes for large files)');
  const ingestStart = Date.now();

  try {
    const result = await makeRequest('/api/templates/ingest', 'POST', {
      file: base64Data,
      filename: path.basename(subPath),
      sectorCode: sector,
      scorecardType: type,
    });

    const duration = ((Date.now() - ingestStart) / 1000).toFixed(1);

    if (result.status === 200 && result.data.success) {
      console.log(`\n✓ Ingestion complete in ${duration}s!\n`);
      console.log('Results:');
      console.log(`  Scorecard Key: ${result.data.scorecardKey}`);
      console.log(`  Graph Key: ${result.data.graphKey}`);
      console.log(`  Pillars: ${result.data.pillars}`);
      console.log(`  Indicators: ${result.data.indicators}`);
      console.log(`  Targets: ${result.data.targets}`);
      console.log(`  Graph Nodes: ${result.data.graphNodes}`);
      console.log(`  Graph Edges: ${result.data.graphEdges}`);

      if (result.data.errors && result.data.errors.length > 0) {
        console.log(`\n  ⚠ Warnings: ${result.data.errors.join(', ')}`);
      }

      console.log('\nNext steps:');
      console.log(`  1. View cells: GET ${API_URL}/api/templates/${result.data.graphKey}/cells`);
      console.log(`  2. View graph: GET ${API_URL}/api/templates/${result.data.graphKey}/graph`);
      console.log(`  3. Compare with Lake Trading: POST ${API_URL}/api/templates/${result.data.graphKey}/compare`);
    } else {
      console.error(`\n✗ Ingestion failed: ${result.status}`);
      console.error(result.data);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n✗ Ingestion request failed: ${error.message}`);
    process.exit(1);
  }
}

main();
