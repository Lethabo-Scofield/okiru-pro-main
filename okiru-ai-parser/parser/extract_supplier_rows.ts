import { admitCalculatorEntry } from '../schemas/calculator_allowlist.js';
import { normalizeBeeLevel, normalizeMoney, normalizePercentage } from './normalize.js';

/**
 * Row-wise extraction for Supplier Spend Schedules.
 *
 * A schedule lists many suppliers; the single-value field extractor can only
 * read one. This module turns a schedule (structured tables when available, or
 * repeated text blocks otherwise) into a list of per-supplier calculator
 * inputs. Every row is validated and passed through the calculator allowlist,
 * so a bad row is flagged for review without poisoning the others.
 */

export interface SupplierRow {
  supplier_name: string | null;
  spend_amount: number | null;
  bee_level: number | null;
  black_ownership: number | null;
  calculator_fields: Record<string, unknown>;
  status: 'passed' | 'review_required';
  issues: string[];
}

const NAME_KEYS = ['supplier name', 'supplier', 'name', 'entity', 'company', 'beneficiary'];
const SPEND_KEYS = ['amount excl vat', 'amount', 'spend', 'value', 'total', 'procurement spend', 'measured spend'];
const LEVEL_KEYS = ['b-bbee level', 'bbbee level', 'bee level', 'level', 'status level'];
const OWNERSHIP_KEYS = ['black ownership', 'black owned', 'ownership', 'black %'];

function normKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
}

function pickColumn(row: Record<string, unknown>, keys: string[]): unknown {
  const entries = Object.entries(row).map(([k, v]) => [normKey(k), v] as const);
  for (const key of keys) {
    const hit = entries.find(([k]) => k === key);
    if (hit) return hit[1];
  }
  // Fall back to a contains-match (e.g. "supplier name (pty)" contains "supplier name").
  for (const key of keys) {
    const hit = entries.find(([k]) => k.includes(key));
    if (hit) return hit[1];
  }
  return undefined;
}

function buildRow(rawName: unknown, rawSpend: unknown, rawLevel: unknown, rawOwnership: unknown): SupplierRow | null {
  const supplier_name = rawName != null && String(rawName).trim() ? String(rawName).trim() : null;
  const spend_amount = rawSpend != null ? normalizeMoney(rawSpend) : null;
  const bee_level = rawLevel != null ? normalizeBeeLevel(rawLevel) : null;
  const black_ownership = rawOwnership != null ? normalizePercentage(rawOwnership) : null;

  // A row with no name and no spend is not a supplier row (header/blank line).
  if (!supplier_name && spend_amount == null) return null;

  const issues: string[] = [];
  if (!supplier_name) issues.push('supplier name missing');
  if (spend_amount == null) issues.push('spend amount missing or unparseable');
  if (bee_level != null && (!Number.isInteger(bee_level) || bee_level < 1 || bee_level > 8)) {
    issues.push('B-BBEE level out of range');
  }
  if (black_ownership != null && (black_ownership < 0 || black_ownership > 100)) {
    issues.push('black ownership out of range');
  }

  // Only admit fields that individually pass validation into the calculator.
  const candidate: Record<string, unknown> = {
    'supplier.name': supplier_name,
    'supplier.spend': spend_amount,
    'supplier.bee_level': issues.includes('B-BBEE level out of range') ? null : bee_level,
    'supplier.black_ownership': issues.includes('black ownership out of range') ? null : black_ownership,
  };
  const calculator_fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (admitCalculatorEntry(key, value).accepted) calculator_fields[key] = value;
  }

  // A row is safe only when the required identity + spend are present and valid.
  const status: SupplierRow['status'] = issues.length === 0 ? 'passed' : 'review_required';

  return { supplier_name, spend_amount, bee_level, black_ownership, calculator_fields, status, issues };
}

function extractFromTables(tables: unknown[]): SupplierRow[] {
  const rows: SupplierRow[] = [];
  for (const table of tables) {
    const tableRows = (table as { rows?: unknown[] })?.rows;
    if (!Array.isArray(tableRows)) continue;
    for (const raw of tableRows) {
      if (!raw || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      const row = buildRow(
        pickColumn(record, NAME_KEYS),
        pickColumn(record, SPEND_KEYS),
        pickColumn(record, LEVEL_KEYS),
        pickColumn(record, OWNERSHIP_KEYS),
      );
      if (row) rows.push(row);
    }
  }
  return rows;
}

function valueForLabel(block: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\s*[:\\-]?\\s*([^\\n\\r]+)`, 'i');
    const m = re.exec(block);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

// Text name labels are stricter than table columns: a bare "Supplier" without
// a colon (as in the heading "Supplier Spend Schedule") must not be treated as
// a supplier name. Require the labelled "supplier name" / "name" form.
const TEXT_NAME_KEYS = ['supplier name', 'entity name', 'company name', 'beneficiary', 'name'];
const SUPPLIER_ANCHOR = /supplier(?:\s*name)?\s*[:\-]/i;

function extractFromText(text: string): SupplierRow[] {
  // Split into per-supplier blocks on the labelled supplier anchor (requires a
  // colon/dash), which the schedule heading does not have.
  const blocks = text
    .split(/(?=supplier(?:\s*name)?\s*[:\-])/gi)
    .map((b) => b.trim())
    .filter((b) => SUPPLIER_ANCHOR.test(b));
  const rows: SupplierRow[] = [];
  for (const block of blocks) {
    const row = buildRow(
      valueForLabel(block, TEXT_NAME_KEYS),
      valueForLabel(block, SPEND_KEYS),
      valueForLabel(block, LEVEL_KEYS),
      valueForLabel(block, OWNERSHIP_KEYS),
    );
    if (row) rows.push(row);
  }
  return rows;
}

export function extractSupplierRows(input: { raw_text?: string; tables?: unknown[] }): SupplierRow[] {
  const fromTables = Array.isArray(input.tables) && input.tables.length > 0
    ? extractFromTables(input.tables)
    : [];
  if (fromTables.length > 0) return fromTables;
  return input.raw_text ? extractFromText(input.raw_text) : [];
}
