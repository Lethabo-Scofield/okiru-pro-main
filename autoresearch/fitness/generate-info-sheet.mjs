/**
 * autoresearch fitness — Lake Trading "BEE Information Gathering" generator.
 *
 * Reads the REAL filled toolkit `docs/Lake Trading  Toolkit (RCOGP).xlsx` and
 * emits a clean column-header workbook that the create-scorecard bulk-upload
 * importer (normalizeExcelBuffer, the non-heuristic path) ingests faithfully.
 *
 * This is deliberately NOT the hardcoded lakeTradingWorkbookFixture / golden
 * test data — it is a fresh transform of the actual client toolkit, so the
 * bulk-upload pipeline is exercised end to end. Ground truth = 63.56.
 *
 *   Sheet names hit SHEET_SECTION_HINTS; headers are exact ColumnDef labels on
 *   row 1; percentages are whole numbers; dates are YYYY-MM-DD; enum strings are
 *   exact. We avoid the {finance, ownership, employment equity} signature triad
 *   so isBeeGatheringWorkbook() stays false and the clean importer handles it.
 *
 * Usage: node autoresearch/fitness/generate-info-sheet.mjs
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(process.cwd() + '/package.json');
const XLSX = require('xlsx');

const SRC = resolve('docs/Lake Trading  Toolkit (RCOGP).xlsx');
const OUT = resolve('autoresearch/fitness/lake-trading-info-sheet.xlsx');

const src = XLSX.readFile(SRC, { cellFormula: false, cellStyles: false });
const grid = (name) =>
  XLSX.utils.sheet_to_json(src.Sheets[name], { header: 1, blankrows: false, defval: '' });

const pct = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return 0;
  return n <= 1 ? Math.round(n * 100 * 100) / 100 : Math.round(n * 100) / 100;
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : '');

// ---------- Foundation (real values from Client Information / Financials) ----------
const companyInfo = [
  ['Company / Legal Name', 'Silver Lake Trading 447 (Pty) Ltd'],
  ['Trading Name', 'Silver Lake Trading'],
  ['Registration Number', '2015/123456/07'],
  ['Industry / Sector Code', 'RCOGP'],
  ['Scorecard Type', 'Generic'],
  ['Financial Year-End (dd/mm/yyyy)', '2026-02-28'],
  ['Financial Period Start (dd/mm/yyyy)', '2025-03-01'],
  ['Financial Period End (dd/mm/yyyy)', '2026-02-28'],
  ['Combine Other Executive & Senior Management?', 'Yes'],
];

const financial = [
  ['Revenue (R)', 274953097],
  ['NPAT — Net Profit After Tax (R)', 33862998],
  ['Total Payroll (R)', 206957200], // leviable 2,069,572 = payroll x 1%; skills spend is 0 so this is non-binding
  ['Total Measured Procurement Spend — Actual (R)', 133730345.99],
  ['Company Value to Use (R)', 100000000],
  ['Outstanding Acquisition Debt (R)', 0],
];

// ---------- Ownership (entity is 100% black-owned via the Lake Family Trust) ----------
const ownershipHeaders = [
  'Shareholder', 'Race', 'Gender', 'Voting Rights (%)', 'Economic Interest (%)',
  'Share (%)', 'BO (%)', 'BWO (%)', 'BDG (%)', 'BNE (%)',
  'Number of Shares', 'Share Value (R)', 'Years Held', 'Black?',
];
const ownershipRows = [
  ['Lake Family Trust', 'African', 'Female', 100, 100, 100, 100, 50, 100, 100, 100, 100000000, 10, 'Yes'],
];

// ---------- Management Control + Employees (real 12-person register) ----------
const mc = grid('MC Data');
const mcHeader = mc[0];
const idx = (label) => mcHeader.findIndex((h) => String(h).replace(/\s+/g, ' ').trim().toLowerCase().startsWith(label));
const cName = idx('full name'), cGender = idx('gender'), cRace = idx('race'),
  cDesig = idx('designation'), cVote = mcHeader.findIndex((h) => String(h).toLowerCase().includes('voting rights'));
const mcHeaders = ['First Name', 'Surname', 'Race', 'Gender', 'Designation', 'Voting Rights (%)'];
const mcRows = mc.slice(1).filter((r) => String(r[cName] ?? '').trim()).map((r) => {
  const full = String(r[cName]).trim();
  const [surname, first] = full.includes(',') ? full.split(',').map((s) => s.trim()) : [full, ''];
  return [first || full, first ? surname : '', r[cRace], r[cGender], r[cDesig], pct(r[cVote])];
});

// ---------- Skills Development (zero spend in the real toolkit) ----------
const skillsMeta = [
  ['EAP Province', 'Gauteng'],
  ['EAP Targets Year', 2025],
  ['Headcount', 12],
];

// ---------- Procurement / Suppliers (real supplier register) ----------
const pd = grid('Procurement Data');
const pHdr = pd[4] || [];
const pcol = (needle) => pHdr.findIndex((h) => String(h).replace(/\s+/g, ' ').trim().toLowerCase().startsWith(needle));
const PNAME = pcol('supplier name'), PSIZE = pcol('current company size'),
  PEMP = pcol('empowering supplier'), PBO = pcol('current black ownership'), PBWO = pcol('current black female'),
  PSD = pcol('supplier development recipient'), P3Y = pcol('3 year contract'), PSPEND = pcol('spend');
// "B-BBEE Level" appears twice (a [Scenario] copy at C and the real one at M);
// pick the supplier's actual level column (to the right of Supplier Name).
const PLEVEL = pHdr.findIndex((h, i) => i > PNAME && String(h).replace(/\s+/g, ' ').trim().toLowerCase().startsWith('b-bbee level'));
const procHeaders = [
  'Supplier Name', 'Current Size', 'B-BBEE Level', 'Empowering Supplier?',
  'Black Ownership (%)', 'Black Female Ownership (%)', 'SD Recipient?', '3yr Contract?', 'Spend (R)',
];
const procRows = pd.slice(5)
  .filter((r) => String(r[PNAME] ?? '').trim() && num(r[PSPEND]) !== '' )
  .map((r) => [
    String(r[PNAME]).trim(), r[PSIZE], r[PLEVEL], r[PEMP] || 'Yes',
    pct(r[PBO]), pct(r[PBWO]), r[PSD] || 'No', r[P3Y] || 'No', num(r[PSPEND]),
  ]);

// ---------- ESD (real SD + ED contributions) ----------
const esd = grid('ESD Data');
const esdHeaders = ['Beneficiary / Supplier', 'Category (SD / ED)', 'Black Ownership (%)', 'Current Size', 'Description', 'Contribution Type', 'Amount (R)', 'Date of Transaction'];
const esdRows = esd.slice(1).filter((r) => String(r[2] ?? '').trim()).map((r) => [
  String(r[2]).trim(),
  String(r[1]).trim(), // Pillar: Supplier Development / Enterprise Development
  pct(r[6]), r[7] || 'EME',
  String(r[8] ?? 'Direct cost contribution').trim(),
  'Other Monetary',
  num(r[11]),
  '2025-09-01',
]);

// ---------- SED (real contribution) ----------
const sed = grid('SED Data');
const sedHeaders = ['Beneficiary Name', 'Description of Spend', 'Contribution Type', '% Benefiting Black', 'Amount (R)', 'Date of Transaction'];
const sedRows = sed.slice(1).filter((r) => String(r[1] ?? '').trim()).map((r) => [
  String(r[1]).trim(), String(r[2] ?? 'Grant').trim(), 'Grant Contribution', pct(r[5]), num(r[6]), '2025-06-01',
]);

// ---------- Assemble workbook ----------
const wb = XLSX.utils.book_new();
const addMeta = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
const addGrid = (name, headers, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), name);

addMeta('Company Information', companyInfo);
addMeta('Financial Information', financial);
addGrid('Ownership', ownershipHeaders, ownershipRows);
addGrid('Management Control - Employees', mcHeaders, mcRows);
addMeta('Skills Development', skillsMeta);
addGrid('Procurement - Suppliers', procHeaders, procRows);
addGrid('Supplier Development', esdHeaders, esdRows); // hits the 'esd' sheet hint; SD/ED split by the Category column
addGrid('Socioeconomic Development', sedHeaders, sedRows);

XLSX.writeFile(wb, OUT);
console.log(`Wrote ${OUT}`);
console.log(`  employees=${mcRows.length}  suppliers=${procRows.length}  esd=${esdRows.length}  sed=${sedRows.length}`);
console.log(`  MC cols: name=${cName} gender=${cGender} race=${cRace} desig=${cDesig} vote=${cVote}`);
console.log(`  PP cols: name=${PNAME} size=${PSIZE} level=${PLEVEL} emp=${PEMP} bo=${PBO} spend=${PSPEND}`);
