import * as fs from 'fs';
import * as b from '@/lib/esg/esgParserFieldBridge';
const out = process.argv[2];
const pick: Record<string, unknown> = {};
for (const k of ['ESG_SCALAR_TARGETS','ESG_DERIVED_KEY_HOMES','ESG_GRID_TARGETS','ESG_SAQ_ROW_TARGET','ESG_HEADCOUNT_COLUMN_ORDER','ESG_HS_QUARTERLY_ROWS','ESG_UNIT_NOTES','ESG_MONTHLY_PREFIXES']) pick[k] = (b as any)[k];
fs.writeFileSync(out + '/esg_bridge.json', JSON.stringify(pick, null, 1));
console.log(Object.entries(pick).map(([k,v]) => k + ':' + (v ? Object.keys(v as object).length : 'undefined')).join(' | '));
