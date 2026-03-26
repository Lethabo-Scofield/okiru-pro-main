/**
 * Quick Compile - Link existing ArangoDB templates to Computation Engine
 * 
 * This skips re-ingestion and just compiles existing templates.
 * Much faster than full re-ingestion.
 */

import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:5001';
const COMPUTE_URL = 'http://127.0.0.1:8000';
const TOOLKITS_PATH = 'C:\\Users\\Administrator\\Downloads\\BBBEE Toolkit-20260318T172641Z-1-001\\BBBEE Toolkit\\BBBEE Toolkits';

// Use the latest template versions from ArangoDB
const TEMPLATES_TO_COMPILE = [
  { graphKey: '173610', sector: 'RCOGP', type: 'Generic', file: '1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx' },
  { graphKey: '126134', sector: 'RCOGP', type: 'QSE', file: '4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx' },
  { graphKey: '144996', sector: 'ICT', type: 'Generic', file: '2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx' },
  { graphKey: '153301', sector: 'ICT', type: 'QSE', file: '3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx' },
  { graphKey: '137295', sector: 'AGRI', type: 'Generic', file: '6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx' },
  { graphKey: '157148', sector: 'FSC', type: 'Generic', file: '5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx' },
];

async function compileDirect(template) {
  const filePath = path.join(TOOLKITS_PATH, template.file);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return null;
  }
  
  console.log(`\n📄 ${template.sector}/${template.type} (graphKey: ${template.graphKey})`);
  
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(template.file);
    const boundary = `----FormBoundary${Date.now()}`;
    
    // Build multipart form data
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
        graphKey: template.graphKey,
      })
    });
    
    console.log(`  ⏳ Uploading ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB to Computation Engine...`);
    const startTime = Date.now();
    
    // Try direct upload to Computation Engine
    const res = await fetch(`${COMPUTE_URL}/admin/models/upload?${params.toString()}`, {
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
      console.error(`  ❌ Failed: ${res.status} - ${error.substring(0, 150)}`);
      return null;
    }
    
    const result = await res.json();
    console.log(`  ✅ Compiled in ${duration}s`);
    console.log(`  Model ID: ${result.version_id}`);
    console.log(`  Cells: ${result.cell_count} (${result.formula_count} formulas)`);
    
    // Link to ArangoDB
    await linkToArangoDB(template.graphKey, result.version_id);
    
    return result;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

async function linkToArangoDB(graphKey, computeModelId) {
  console.log(`  🔗 Linking to ArangoDB graph ${graphKey}...`);
  
  try {
    // Use templates endpoint to update the graph with computeModelId
    const res = await fetch(`${API_URL}/api/templates/${graphKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computeModelId }),
    });
    
    if (res.ok) {
      console.log(`  ✅ Linked successfully`);
      return true;
    } else if (res.status === 404) {
      // PATCH might not exist, try getting template first
      console.log(`  ⚠️ Link endpoint not available`);
      return false;
    } else {
      console.log(`  ⚠️ Link returned ${res.status}`);
      return false;
    }
  } catch (error) {
    console.log(`  ⚠️ Link failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('Quick Compile - Link Existing Templates to Computation Engine');
  console.log('='.repeat(70));
  console.log('\n⚡ This compiles templates WITHOUT re-ingesting to ArangoDB');
  console.log('   (Much faster than full re-ingestion)\n');
  
  // Check Computation Engine
  try {
    const res = await fetch(`${COMPUTE_URL}/admin/models/list`, { headers: { 'X-Admin': 'true' } });
    if (res.ok) {
      const models = await res.json();
      console.log(`✅ Computation Engine running (${models.length} models already compiled)\n`);
    } else {
      console.log('❌ Computation Engine not responding\n');
      return;
    }
  } catch (error) {
    console.log('❌ Cannot connect to Computation Engine:', error.message);
    console.log('\nMake sure it\'s running:');
    console.log('  cd apps/Computation-Engine && py -3 run_server.py');
    return;
  }
  
  let successCount = 0;
  const results = [];
  
  for (const template of TEMPLATES_TO_COMPILE) {
    const result = await compileDirect(template);
    if (result) {
      successCount++;
      results.push({
        ...template,
        modelId: result.version_id,
      });
    }
    
    // Small delay between compilations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`Complete: ${successCount}/${TEMPLATES_TO_COMPILE.length} templates compiled`);
  console.log('='.repeat(70));
  
  if (successCount > 0) {
    console.log('\n✅ Templates are ready for calculation!');
    console.log('\nNext: Test with sample calculation');
    console.log(`  node scripts/test-calc-quick.mjs`);
    
    // Save results
    fs.writeFileSync('compiled-models.json', JSON.stringify(results, null, 2));
    console.log('\nCompiled model IDs saved to: compiled-models.json');
  } else {
    console.log('\n⚠️ No templates compiled successfully.');
    console.log('   Check Computation Engine logs for errors.');
  }
}

main();
