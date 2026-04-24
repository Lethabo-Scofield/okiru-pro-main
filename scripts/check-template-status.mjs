/**
 * Check Template Status
 * 
 * Shows which templates are ingested, compiled, and have entity mappings.
 * Use this to verify the system is ready for production.
 */

const API_URL = process.env.API_URL || 'http://localhost:5001';

async function checkTemplates() {
  console.log('Template Status Check');
  console.log('='.repeat(80));
  
  // Get all templates from ArangoDB
  try {
    const res = await fetch(`${API_URL}/api/templates`);
    if (!res.ok) {
      console.error('Failed to fetch templates:', res.status);
      return;
    }
    
    const templates = await res.json();
    console.log(`\nFound ${templates.length} template(s) in ArangoDB:\n`);
    
    for (const template of templates) {
      const hasComputeModel = !!template.computeModelId;
      const isCompiled = template.computeModelId && template.linkedAt;
      
      console.log(`📊 ${template.sourceFile || 'Unknown'}`);
      console.log(`   Graph Key: ${template._key}`);
      console.log(`   Created: ${new Date(template.createdAt).toLocaleString()}`);
      console.log(`   Cells: ${template.cellCount || 'N/A'}`);
      console.log(`   Compute Model: ${hasComputeModel ? '✅ ' + template.computeModelId : '❌ Not compiled'}`);
      console.log(`   Linked At: ${template.linkedAt ? new Date(template.linkedAt).toLocaleString() : 'N/A'}`);
      
      // Check entity mapping
      try {
        // Extract sector/type from source file or metadata
        let sector = 'RCOGP'; // Default
        let type = 'Generic';
        
        if (template.sourceFile?.includes('ICT')) sector = 'ICT';
        else if (template.sourceFile?.includes('AGRI')) sector = 'AGRI';
        else if (template.sourceFile?.includes('FSC')) sector = 'FSC';
        
        if (template.sourceFile?.includes('QSE')) type = 'QSE';
        
        const mappingRes = await fetch(`${API_URL}/api/entity-mappings/${sector}/${type}`);
        if (mappingRes.ok) {
          const mapping = await mappingRes.json();
          console.log(`   Entity Mapping: ✅ ${mapping.mapping?.mappings?.length || 0} entities mapped`);
          console.log(`   Coverage: ${mapping.mapping?.coverage?.coveragePercent?.toFixed(1) || 0}%`);
        } else {
          console.log(`   Entity Mapping: ❌ Not built`);
        }
      } catch (e) {
        console.log(`   Entity Mapping: ❌ Error checking`);
      }
      
      console.log('');
    }
    
    // Summary
    const compiledCount = templates.filter(t => t.computeModelId).length;
    console.log('='.repeat(80));
    console.log(`Summary: ${compiledCount}/${templates.length} templates compiled for Computation Engine`);
    
    if (compiledCount < templates.length) {
      console.log('\n⚠️  Some templates need compilation.');
      console.log('   Run: node scripts/production-setup.mjs');
    } else {
      console.log('\n✅ All templates are ready!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkTemplates();
