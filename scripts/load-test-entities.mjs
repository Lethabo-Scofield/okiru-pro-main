/**
 * Load Lake Trading CSV entities for end-to-end testing
 *
 * This script parses the lake-trading.csv file and converts it to
 * a structured entity map that can be used for testing the
 * entity-to-cell mapping and scorecard calculation pipeline.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Lake Trading CSV
const CSV_PATH = path.join(__dirname, '..', 'plans', 'test-sheets', 'lake-trading.csv');
const OUTPUT_PATH = path.join(__dirname, '..', 'plans', 'test-sheets', 'lake-trading-entities.json');

/**
 * Parse currency value from string like "R 120 000 000.00"
 */
function parseCurrency(value) {
  if (!value || typeof value !== 'string') return null;
  // Remove currency symbol, spaces, and commas
  const cleaned = value.replace(/[R\s,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse percentage value from string like "51%"
 */
function parsePercentage(value) {
  if (!value || typeof value !== 'string') return null;
  // Remove % sign and any spaces
  const cleaned = value.replace(/[%\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse numeric value
 */
function parseNumber(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Parse date value from string like "2024-02-28"
 */
function parseDate(value) {
  if (!value || typeof value !== 'string') return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}

/**
 * Detect field type from entity name and value
 */
function detectFieldType(entityName, value) {
  const name = entityName.toLowerCase();
  const val = String(value).toLowerCase();

  // Percentage detection
  if (name.includes('percentage') || name.includes('%') || val.includes('%')) {
    return 'percentage';
  }

  // Currency detection
  if (val.startsWith('r ') || name.includes('revenue') || name.includes('spend') ||
      name.includes('amount') || name.includes('cost') || name.includes('payroll') ||
      name.includes('npat') || name.includes('value')) {
    return 'currency';
  }

  // Date detection
  if (name.includes('date') || name.includes('year')) {
    return 'date';
  }

  // Count/Number detection
  if (name.includes('total') || name.includes('count') || name.includes('number')) {
    return 'count';
  }

  // Text/String default
  return 'string';
}

/**
 * Parse value based on detected field type
 */
function parseValue(entityName, value) {
  const fieldType = detectFieldType(entityName, value);

  switch (fieldType) {
    case 'currency':
      return parseCurrency(value);
    case 'percentage':
      return parsePercentage(value);
    case 'date':
      return parseDate(value);
    case 'count':
      return parseNumber(value);
    default:
      return value;
  }
}

/**
 * Map entity names to standardized entity manifest names
 */
function normalizeEntityName(entityName) {
  const mappings = {
    'TotalRevenue': 'Total Revenue',
    'NPAT': 'Net Profit After Tax',
    'LeviableAmount': 'Leviable Amount',
    'TMPS': 'Total Measured Procurement Spend',
    'FinancialYearEnd': 'Financial Year End',
    'CompanyName': 'Company Name',
    'Sector': 'Sector',
    'ScorecardType': 'Scorecard Type',
    'Black Ownership Percentage': 'Black Ownership Percentage',
    'Black Women Ownership Percentage': 'Black Women Ownership Percentage',
    'Black Economic Interest': 'Black Economic Interest',
    'Black Women Economic Interest': 'Black Women Economic Interest',
    'Shareholder Name': 'Shareholder Name',
    'Shareholding Percentage': 'Shareholding Percentage',
    'Share Value': 'Share Value',
    'Black Board Members': 'Black Board Members Percentage',
    'Black Women Board Members': 'Black Women Board Members Percentage',
    'Black Executive Directors': 'Black Executive Directors Percentage',
    'Black Women Executive': 'Black Women Executive Percentage',
    'Skills Development Spend': 'Skills Development Expenditure',
    'Training Programme Name': 'Training Programme Name',
    'Training Cost': 'Training Cost',
    'Learner Name': 'Learner Name',
    'Learner Employment Status': 'Learner Employment Status',
    'Learner Race Status': 'Learner Race Status',
    'Supplier Name': 'Supplier Name',
    'Supplier BEE Level': 'Supplier BEE Level',
    'Supplier Black Ownership': 'Supplier Black Ownership Percentage',
    'Supplier Spend': 'Supplier Spend',
    'Preferential Procurement Spend': 'Total Preferential Procurement Spend',
    'ESD Beneficiary': 'ESD Beneficiary Name',
    'ESD Contribution Type': 'ESD Contribution Type',
    'ESD Amount': 'ESD Contribution Amount',
    'ESD Category': 'ESD Category',
    'SED Beneficiary': 'SED Beneficiary Name',
    'SED Contribution Type': 'SED Contribution Type',
    'SED Amount': 'SED Contribution Amount',
  };

  return mappings[entityName] || entityName;
}

/**
 * Load and parse the Lake Trading CSV
 */
export function loadLakeTradingEntities() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Lake Trading CSV not found at: ${CSV_PATH}`);
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n');

  // Skip header
  const entities = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parsing (handles basic cases without quotes)
    const parts = line.split(',');
    if (parts.length < 3) continue;

    const entityLabel = parts[0].trim();
    const extractedValue = parts[1].trim();
    const sourceSheet = parts[2].trim();

    const normalizedName = normalizeEntityName(entityLabel);
    const parsedValue = parseValue(entityLabel, extractedValue);
    const fieldType = detectFieldType(entityLabel, extractedValue);

    entities.push({
      originalName: entityLabel,
      name: normalizedName,
      value: parsedValue,
      rawValue: extractedValue,
      fieldType,
      sourceSheet,
      pillarCode: inferPillarFromSheet(sourceSheet),
    });
  }

  return entities;
}

/**
 * Infer pillar code from source sheet name
 */
function inferPillarFromSheet(sheetName) {
  const sheet = sheetName.toLowerCase();
  if (sheet.includes('general')) return 'general';
  if (sheet.includes('ownership')) return 'ownership';
  if (sheet.includes('management')) return 'managementControl';
  if (sheet.includes('skills')) return 'skillsDevelopment';
  if (sheet.includes('procurement')) return 'preferentialProcurement';
  if (sheet.includes('esd') || sheet.includes('enterprise')) return 'enterpriseSupplierDevelopment';
  if (sheet.includes('sed') || sheet.includes('socio')) return 'socioEconomicDevelopment';
  if (sheet.includes('yes')) return 'yesInitiative';
  return 'unknown';
}

/**
 * Convert entities to entity map format for API
 */
export function convertToEntityMap(entities) {
  const entityMap = {};
  for (const entity of entities) {
    entityMap[entity.name] = entity.value;
  }
  return entityMap;
}

/**
 * Main function - load and save entities
 */
function main() {
  console.log('[load-test-entities] Loading Lake Trading entities...');

  try {
    const entities = loadLakeTradingEntities();
    console.log(`[load-test-entities] Loaded ${entities.length} entities`);

    // Show summary
    const byPillar = {};
    for (const entity of entities) {
      byPillar[entity.pillarCode] = (byPillar[entity.pillarCode] || 0) + 1;
    }

    console.log('[load-test-entities] Entities by pillar:');
    for (const [pillar, count] of Object.entries(byPillar)) {
      console.log(`  - ${pillar}: ${count}`);
    }

    // Convert to entity map
    const entityMap = convertToEntityMap(entities);

    // Save to JSON
    const output = {
      entities,
      entityMap,
      metadata: {
        source: 'lake-trading.csv',
        totalEntities: entities.length,
        generatedAt: new Date().toISOString(),
      },
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`[load-test-entities] Saved to: ${OUTPUT_PATH}`);

    // Show sample entities
    console.log('\n[load-test-entities] Sample entities:');
    for (const entity of entities.slice(0, 5)) {
      console.log(`  - ${entity.name}: ${entity.value} (${entity.fieldType})`);
    }

    return output;
  } catch (error) {
    console.error('[load-test-entities] Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url.startsWith('file://') && process.argv[1] && process.argv[1].includes('load-test-entities');
if (isMainModule) {
  main();
}

export default { loadLakeTradingEntities, convertToEntityMap };
