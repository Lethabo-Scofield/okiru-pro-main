/**
 * Compile templates directly to Computation Engine
 */

import fs from 'fs';
import path from 'path';

const COMPUTE_URL = 'http://127.0.0.1:8000';
const TOOLKITS_PATH = 'C:\\Users\\Administrator\\Downloads\\BBBEE Toolkit-20260318T172641Z-1-001\\BBBEE Toolkit\\BBBEE Toolkits';

const templates = [
  { key: '118024', sector: 'RCOGP', type: 'Generic', file: '1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx' },
  { key: '126134', sector: 'RCOGP', type: 'QSE', file: '4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx' },
  { key: '144996', sector: 'ICT', type: 'Generic', file: '2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx' },
  { key: '153301', sector: 'ICT', type: 'QSE', file: '3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx' },
  { key: '137295', sector: 'AGRI', type: 'Generic', file: '6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx' },
  { key: '157148', sector: 'FSC', type: 'Generic', file: '5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx' },
];

async function uploadToComputationEngine(template) {
  console.log(`\nUploading ${template.sector}/${template.type}...`);
  
  const filePath = path.join(TOOLKITS_PATH, template.file);
  
  if (!fs.existsSync(filePath)) {
    console.error(`  File not found: ${filePath}`);
    return null;
  }
  
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(template.file);
    const boundary = `----FormBoundary${Date.now()}`;
    
    let bodyPrefix = `--${boundary}\r\n`;
    bodyPrefix += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    bodyPrefix += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
    
    const prefix = Buffer.from(bodyPrefix, 'utf-8');
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const fullBody = Buffer.concat([prefix, fileBuffer, suffix]);
    
    const params = new URLSearchParams({ 
      name: fileName,
      metadata: JSON.stringify({
        sectorCode: template.sector,
        scorecardType: template.type,
        graphKey: template.key,
      })
    });
    
    const url = `${COMPUTE_URL}/admin/models/upload?${params.toString()}`;
    
    console.log(`  Uploading ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB...`);
    const startTime = Date.now();
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Admin': 'true',
      },
      body: fullBody,
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (!res.ok) {
      const error = await res.text();
      console.error(`  ❌ Failed: ${res.status} - ${error.substring(0, 200)}`);
      return null;
    }
    
    const result = await res.json();
    console.log(`  ✅ Compiled in ${duration}s`);
    console.log(`  Model ID: ${result.version_id}`);
    console.log(`  Cells: ${result.cell_count} (${result.formula_count} formulas, ${result.input_count} inputs)`);
    
    return result;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

async function linkToArangoDB(graphKey, computeModelId) {
  console.log(`  Linking to ArangoDB graph ${graphKey}...`);
  
  try {
    const res = await fetch(`http://localhost:5001/api/templates/${graphKey}/link-compute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computeModelId }),
    });
    
    if (res.ok) {
      console.log(`  ✅ Linked successfully`);
      return true;
    } else {
      console.log(`  ⚠️ Link endpoint not available (non-critical)`);
      return false;
    }
  } catch (error) {
    console.log(`  ⚠️ Link failed: ${error.message} (non-critical)`);
    return false;
  }
}

async function main() {
  console.log('Compiling Templates to Computation Engine');
  console.log('=' .repeat(60));
  
  // Check if Computation Engine is running
  try {
    const res = await fetch(`${COMPUTE_URL}/admin/models/list`);
    if (res.ok) {
      const models = await res.json();
      console.log(`\n✅ Computation Engine is running (${models.length} models already compiled)`);
    } else {
      console.log('\n❌ Computation Engine not responding');
      process.exit(1);
    }
  } catch (error) {
    console.log('\n❌ Cannot connect to Computation Engine:', error.message);
    process.exit(1);
  }
  
  let successCount = 0;
  
  for (const template of templates) {
    const result = await uploadToComputationEngine(template);
    if (result) {
      await linkToArangoDB(template.key, result.version_id);
      successCount++;
    }
    
    // Wait between uploads
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Completed: ${successCount}/${templates.length} templates compiled`);
  
  if (successCount > 0) {
    console.log('\n✅ Templates are ready for scorecard calculation!');
    console.log('\nTest with:');
    console.log('  node scripts/test-calc-quick.mjs');
  }
}

main();
