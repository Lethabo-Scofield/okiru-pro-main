import { readFile } from 'fs/promises';

// Minimal XLSX parsing using the xlsx package already in node_modules
// But since npm install failed, let's try a different approach - use exceljs or just parse the binary
// Actually, let's check if xlsx is available in any of the workspaces

async function tryReadXlsx() {
  try {
    const XLSX = await import('xlsx');
    
    const files = [
      'c:/Users/Administrator/Downloads/BBBEE Toolkit-20260318T172641Z-1-001/BBBEE Toolkit/BBBEE Toolkits/1. RCOGP (Generic)/Lake Trading  Toolkit (RCOGP).xlsx',
      'c:/Users/Administrator/Downloads/BBBEE Toolkit-20260318T172641Z-1-001/BBBEE Toolkit/BBBEE Toolkits/1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx',
    ];
    
    for (const filePath of files) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`FILE: ${filePath.split('/').pop()}`);
      console.log('='.repeat(80));
      
      const wb = XLSX.readFile(filePath);
      console.log('Sheets:', wb.SheetNames.join(', '));
      
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        if (!ws['!ref']) continue;
        const range = XLSX.utils.decode_range(ws['!ref']);
        console.log(`\n--- ${name} --- (rows: ${range.e.r+1}, cols: ${range.e.c+1})`);
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        // Print all rows with data (up to 80 per sheet)
        let printed = 0;
        for (let i = 0; i < data.length && printed < 80; i++) {
          const row = data[i];
          const filtered = row.filter(c => c !== '' && c !== null && c !== undefined);
          if (filtered.length > 0) {
            const rowStr = row.map((c, j) => c !== '' && c !== null && c !== undefined ? `[${j}]${c}` : '').filter(Boolean).join(' | ');
            console.log(`  R${i+1}: ${rowStr.substring(0, 300)}`);
            printed++;
          }
        }
      }
    }
  } catch (e) {
    console.error('XLSX import failed:', e.message);
    console.log('Trying alternative approach...');
    
    // Try to find xlsx in node_modules
    const { execSync } = await import('child_process');
    try {
      const result = execSync('where /r node_modules xlsx', { cwd: 'c:/Users/Administrator/Documents/GitHub/okiru-pro-main', encoding: 'utf8' });
      console.log('Found xlsx at:', result);
    } catch (e2) {
      console.log('xlsx not found anywhere in node_modules');
    }
  }
}

tryReadXlsx();
