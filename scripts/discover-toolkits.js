/**
 * Toolkit Discovery Script
 *
 * Discovers and validates all 6 B-BBEE toolkit Excel files.
 * No dependencies required - just lists the files and shows their structure.
 *
 * Run: node scripts/discover-toolkits.js
 */

const fs = require('fs');
const path = require('path');

const TOOLKITS_PATH = path.resolve(__dirname, '../docs/BBBEE Toolkits');

const TOOLKITS = [
  { subPath: '1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx', sector: 'RCOGP', type: 'Generic' },
  { subPath: '2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx', sector: 'ICT', type: 'Generic' },
  { subPath: '3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx', sector: 'ICT', type: 'QSE' },
  { subPath: '4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx', sector: 'RCOGP', type: 'QSE' },
  { subPath: '5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx', sector: 'FSC', type: 'Generic' },
  { subPath: '6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx', sector: 'AGRI', type: 'Generic' },
];

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function main() {
  console.log('========================================');
  console.log('B-BBEE Toolkit Discovery');
  console.log('========================================\n');

  console.log(`Toolkits Path: ${TOOLKITS_PATH}\n`);

  // Check if directory exists
  if (!fs.existsSync(TOOLKITS_PATH)) {
    console.error('✗ Toolkits directory not found!');
    console.error(`  Expected: ${TOOLKITS_PATH}`);
    process.exit(1);
  }

  console.log('Found 6 toolkit templates:\n');

  let found = 0;
  let missing = 0;

  for (const tk of TOOLKITS) {
    const fullPath = path.join(TOOLKITS_PATH, tk.subPath);
    const exists = fs.existsSync(fullPath);

    if (exists) {
      const stats = fs.statSync(fullPath);
      found++;
      console.log(`  ✓ ${tk.subPath}`);
      console.log(`    Sector: ${tk.sector}, Type: ${tk.type}`);
      console.log(`    Size: ${formatBytes(stats.size)}`);
      console.log(`    Modified: ${stats.mtime.toISOString().split('T')[0]}`);
    } else {
      missing++;
      console.log(`  ✗ ${tk.subPath}`);
      console.log(`    Sector: ${tk.sector}, Type: ${tk.type}`);
      console.log(`    Status: FILE NOT FOUND`);
    }
    console.log('');
  }

  console.log('='.repeat(40));
  console.log(`Summary: ${found} found, ${missing} missing`);
  console.log('='.repeat(40));

  if (missing > 0) {
    console.log('\n⚠ Some toolkits are missing. Check the paths above.');
    process.exit(1);
  } else {
    console.log('\n✓ All 6 toolkit templates are present and ready for ingestion!');
    console.log('\nNext steps:');
    console.log('  1. Set up ArangoDB (local or cloud):');
    console.log('     - Local: Install ArangoDB or use Docker');
    console.log('     - Cloud: Sign up at https://cloud.arangodb.com/ (free tier)');
    console.log('     - See docs/ARANGODB_CLOUD_SETUP.md for details');
    console.log('');
    console.log('  2. Update apps/api/.env with ArangoDB credentials');
    console.log('');
    console.log('  3. Start API server:');
    console.log('     cd apps/api && npm run dev');
    console.log('');
    console.log('  4. Run toolkit ingestion:');
    console.log('     node scripts/ingest-toolkits.js');
    console.log('');
    console.log('  5. Validate with Lake Trading:');
    console.log('     POST /api/templates/{graphId}/compare');
  }
}

main();
