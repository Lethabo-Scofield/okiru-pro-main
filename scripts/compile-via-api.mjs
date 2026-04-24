/**
 * Compile templates via API proxy to Computation Engine
 */

const API_URL = 'http://localhost:5001';
const TOOLKITS_PATH = 'C:\\Users\\Administrator\\Downloads\\BBBEE Toolkit-20260318T172641Z-1-001\\BBBEE Toolkit\\BBBEE Toolkits';

import fs from 'fs';
import path from 'path';

const templates = [
  { key: '118024', sector: 'RCOGP', type: 'Generic', file: '1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx' },
];

async function compileTemplate(template) {
  console.log(`\nCompiling ${template.sector}/${template.type}...`);
  
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
    
    console.log(`  Uploading ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB...`);
    const startTime = Date.now();
    
    const res = await fetch(`${API_URL}/api/templates/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
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
    console.log(`  Graph Key: ${result.graphKey}`);
    console.log(`  Compute Model ID: ${result.computeModelId || 'N/A'}`);
    
    return result;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Compiling Templates via API');
  console.log('=' .repeat(60));
  
  const result = await compileTemplate(templates[0]);
  
  if (result && result.computeModelId) {
    console.log('\n✅ Template compiled successfully!');
    console.log('\nTest scorecard calculation:');
    console.log(`  node -e "fetch('${API_URL}/api/templates/${result.graphKey}/evaluate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({overrides: {'Financials!Financials!C3': 5000000}}) }).then(r => r.json()).then(console.log)"`);
  } else {
    console.log('\n⚠️ Compilation may have failed. Check error messages above.');
  }
}

main();
