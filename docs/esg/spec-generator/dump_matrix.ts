import { ESG_DOCUMENT_MATRIX } from 'C:/Users/Administrator/Documents/GitHub/okiru-pro-main/okiru-ai-parser/schemas/esg_document_matrix.ts';
import { ESG_CALCULATOR_KEY_ALLOWLIST } from 'C:/Users/Administrator/Documents/GitHub/okiru-pro-main/okiru-ai-parser/schemas/esg_calculator_allowlist.ts';
import * as fs from 'fs';
const out = process.argv[2];
fs.writeFileSync(out + '/esg_matrix.json', JSON.stringify(ESG_DOCUMENT_MATRIX, null, 1));
fs.writeFileSync(out + '/esg_allowlist.json', JSON.stringify(ESG_CALCULATOR_KEY_ALLOWLIST, null, 1));
console.log('docs', ESG_DOCUMENT_MATRIX.length, 'keys', ESG_CALCULATOR_KEY_ALLOWLIST.length);
for (const d of ESG_DOCUMENT_MATRIX) console.log(d.element, '|', d.name, '|', d.expectedFields.length, 'fields');
