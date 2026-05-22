/**
 * Creates docs/Lake Trading Test.xlsx — BEE Information Gathering format
 * matching lakeTradingWorkbookFixture / lakeTradingDemo ground truth (~63.56 pts).
 *
 * Usage: node scripts/createLakeTradingExcel.js
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../apps/web/package.json'));
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../docs/Lake Trading Test.xlsx');

const REVENUE = 274_953_097;
const NPAT = 33_862_998;
const LEVIABLE = 2_069_572;
const PAYROLL = LEVIABLE / 0.8;
const TMPS = 133_730_345.99;

function sheetFromRows(rows) {
  return XLSX.utils.aoa_to_sheet(rows);
}

const wb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(
  wb,
  sheetFromRows([
    ['BEE Information Gathering File'],
    ['Measured Entity Name:', 'Silver Lake Trading 447 (Pty) Ltd'],
    ['Trading Name:', 'Silver Lake Trading'],
    ['Applicable Code:', 'Revised Codes of Good Practice'],
    ['Industry Sector:', 'Retail / RCOGP'],
    ['Scorecard Type:', 'Generic'],
    ['Financial Year End:', '2026-02-28'],
    ['Registration Number:', '2015/123456/07'],
    ['VAT Number:', '4320123456'],
  ]),
  'Instructions',
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromRows([
    ['Financial Information'],
    ['Total Revenue', REVENUE],
    ['Net Profit After Tax (NPAT)', NPAT],
    ['Total Payroll / Leviable Amount', PAYROLL],
    ['Leviable Amount', LEVIABLE],
    ['Total Measured Procurement Spend (TMPS)', TMPS],
  ]),
  'Finance',
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromRows([
    ['Ownership'],
    ['Shareholder Name', 'ID Number', 'Race', 'Gender', 'Voting Rights %', 'Economic Interest %', 'Shareholding %', 'Black Ownership %', 'Black Women Ownership %', 'New Entrant'],
    ['Lake Family Trust', 'IT2015/001', '', '', 100, 100, 100, 100, 50, 'Yes'],
  ]),
  'Ownership',
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromRows([
    ['Management Control'],
    ['Name and Surname', 'ID Number', 'Race', 'Gender', 'Position / Occupational Level', 'Voting Rights %'],
    ['Director A', '', 'African', 'Female', 'Non-executive Director', 50],
    ['Director B', '', 'White', 'Male', 'Non-executive Director', 50],
    ['Exec A', '', 'African', 'Male', 'Executive Director', 0],
    ['Exec B', '', 'African', 'Female', 'Executive Director', 0],
    ['OEM A', '', 'White', 'Male', 'Other Executive Manager', 0],
    ['Sen A', '', 'African', 'Male', 'Senior Manager', 0],
    ['Sen B', '', 'White', 'Female', 'Senior Manager', 0],
    ['Mid A', '', 'African', 'Female', 'Middle Manager', 0],
    ['Mid B', '', 'Indian', 'Male', 'Middle Manager', 0],
    ['Jun A', '', 'African', 'Male', 'Junior Manager', 0],
    ['Jun B', '', 'African', 'Female', 'Junior Manager', 0],
    ['Jun C', '', 'White', 'Male', 'Junior Manager', 0],
  ]),
  'Management Control',
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromRows([
    ['Employment Equity'],
    ['Name and Surname', 'ID Number', 'Race', 'Gender', 'Job Title'],
    ['Director A', '', 'African', 'Female', 'Non-executive Director'],
    ['Director B', '', 'White', 'Male', 'Non-executive Director'],
    ['Exec A', '', 'African', 'Male', 'Executive Director'],
    ['Exec B', '', 'African', 'Female', 'Executive Director'],
    ['OEM A', '', 'White', 'Male', 'Other Executive Manager'],
    ['Sen A', '', 'African', 'Male', 'Senior Manager'],
    ['Sen B', '', 'White', 'Female', 'Senior Manager'],
    ['Mid A', '', 'African', 'Female', 'Middle Manager'],
    ['Mid B', '', 'Indian', 'Male', 'Middle Manager'],
    ['Jun A', '', 'African', 'Male', 'Junior Manager'],
    ['Jun B', '', 'African', 'Female', 'Junior Manager'],
    ['Jun C', '', 'White', 'Male', 'Junior Manager'],
  ]),
  'Employment Equity',
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromRows([
    ['Skills Development'],
    ['Note: Lake Trading has zero skills spend in ground truth.'],
  ]),
  'Skills Development',
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromRows([
    ['Procurement'],
    ['Supplier Name', 'Current Size', 'BBBEE Level', 'Empowering Supplier', 'Black Ownership %', 'Spend'],
    ['EME supplier (bulk TMPS)', 'EME', 1, 'Yes', 100, 133_696_348.45],
    ['QSE supplier', 'QSE', 4, 'Yes', 100, 2_233_217.89],
  ]),
  'Procurement',
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromRows([
    ['Enterprise Development'],
    ['Beneficiary', 'Current Size', 'Black Ownership %', 'Description', 'Contribution Type', 'ESD Category', 'Amount', 'Date'],
    ['SD beneficiary (EME)', 'EME', 100, 'Direct cost - supplier development', 'Other Monetary', 'Supplier Development', 250_000, '2025-09-01'],
    ['ED beneficiary (EME)', 'EME', 100, 'Direct cost - enterprise development', 'Other Monetary', 'Enterprise Development', 160_000, '2025-09-01'],
  ]),
  'Enterprise Development',
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromRows([
    ['Socio-Economic Development'],
    ['Beneficiary', 'Description', 'Contribution Type', '% Benefiting Black', 'Amount', 'Date'],
    ['Operation Smile South Africa', 'Grant', 'Grant Contribution', 100, 27_500, '2025-06-01'],
  ]),
  'Socio-Economic Development',
);

mkdirSync(dirname(outPath), { recursive: true });
XLSX.writeFile(wb, outPath);
console.log(`Created ${outPath}`);
