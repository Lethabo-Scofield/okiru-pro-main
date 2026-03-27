/**
 * Production Setup Script
 * 
 * Run this ONCE when deploying to a new environment.
 * It ingests all templates and builds entity mappings.
 * 
 * Usage: node scripts/production-setup.mjs
 */

import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TOOLKITS_PATH = process.env.TOOLKITS_PATH || 'C:\\Users\\Administrator\\Downloads\\BBBEE Toolkit-20260318T172641Z-1-001\\BBBEE Toolkit\\BBBEE Toolkits';

const TEMPLATES = [
  { sector: 'RCOGP', type: 'Generic', file: '1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx' },
  { sector: 'RCOGP', type: 'QSE', file: '4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx' },
  { sector: 'ICT', type: 'Generic', file: '2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx' },
  { sector: 'ICT', type: 'QSE', file: '3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx' },
  { sector: 'AGRI', type: 'Generic', file: '6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx' },
  { sector: 'FSC', type: 'Generic', file: '5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx' },
];

async function checkServices() {
  console.log('Checking services...\n');
  
  // Check API
  try {
    const res = await fetch(`${API_URL}/health`);
    if (res.ok) {
      const health = await res.json();
      console.log('✅ API Server: Running');
      console.log(`   ArangoDB: ${health.arangodb?.ok ? 'Connected' : 'Not connected'}`);
      console.log(`   MongoDB: ${health.mongodb?.ok ? 'Connected' : 'Not connected'}`);
    } else {
      console.log('❌ API Server: Not responding correctly');
      return false;
    }
  } catch (error) {
    console.log('❌ API Server: Not running');
    console.log('   Start with: cd apps/api && pnpm dev');
    return false;
  }
  
  return true;
}

async function ingestTemplate(template) {
  const filePath = path.join(TOOLKITS_PATH, template.file);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return null;
  }
  
  console.log(`\n📄 ${template.sector}/${template.type}`);
  console.log(`   File: ${template.file}`);
  
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
      console.error(`   ❌ Failed: ${res.status} - ${error.substring(0, 100)}`);
      return null;
    }
    
    const result = await res.json();
    console.log(`   ✅ Ingested in ${duration}s`);
    console.log(`   Graph Key: ${result.graphKey}`);
    console.log(`   Compute Model: ${result.computeModelId || 'Not compiled (Computation Engine may be down)'}`);
    
    return result;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function buildEntityMapping(sector, type, graphKey) {
  console.log(`   🔗 Building entity mapping...`);
  
  try {
    const res = await fetch(`${API_URL}/api/entity-mappings/build/${sector}/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graphKey }),
    });
    
    if (!res.ok) {
      const error = await res.text();
      console.error(`      ❌ Failed: ${res.status} - ${error.substring(0, 100)}`);
      return null;
    }
    
    const result = await res.json();
    console.log(`      ✅ Mapped ${result.mapping?.mappingCount || 0} entities`);
    console.log(`      Coverage: ${result.mapping?.coverage?.coveragePercent?.toFixed(1) || 0}%`);
    
    return result;
  } catch (error) {
    console.error(`      ❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('B-BBEE Platform - Production Setup');
  console.log('='.repeat(70));
  
  // Check services
  const servicesOk = await checkServices();
  if (!servicesOk) {
    console.log('\n⚠️ Please start all services before running setup.');
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('Step 1: Ingesting Templates');
  console.log('='.repeat(70));
  
  const ingestedTemplates = [];
  
  for (const template of TEMPLATES) {
    const result = await ingestTemplate(template);
    if (result) {
      ingestedTemplates.push({
        ...template,
        graphKey: result.graphKey,
        computeModelId: result.computeModelId,
      });
    }
    
    // Small delay between ingests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('Step 2: Building Entity Mappings');
  console.log('='.repeat(70));
  
  for (const template of ingestedTemplates) {
    await buildEntityMapping(template.sector, template.type, template.graphKey);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('Setup Complete!');
  console.log('='.repeat(70));
  console.log(`\nIngested: ${ingestedTemplates.length}/${TEMPLATES.length} templates`);
  
  const compiledCount = ingestedTemplates.filter(t => t.computeModelId).length;
  console.log(`Compiled: ${compiledCount}/${TEMPLATES.length} for Computation Engine`);
  
  if (compiledCount < TEMPLATES.length) {
    console.log('\n⚠️  Some templates were not compiled for the Computation Engine.');
    console.log('   Ensure the Computation Engine is running and re-run setup.');
  }
  
  console.log('\n✅ Platform is ready for use!');
  console.log('\nNext steps:');
  console.log('  1. Access web app: http://localhost:5000');
  console.log('  2. Upload a document for B-BBEE verification');
  console.log('  3. View scorecard at: http://localhost:5000/scorecard-summary');
  
  // Save setup results
  const setupResults = {
    timestamp: new Date().toISOString(),
    templates: ingestedTemplates,
  };
  fs.writeFileSync('setup-results.json', JSON.stringify(setupResults, null, 2));
  console.log('\nSetup results saved to: setup-results.json');
}

main();
