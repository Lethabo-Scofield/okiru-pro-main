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
 *
 * Fields extracted per supplier (all that calcProcurement consumes): name,
 * spend, bee_level, black_ownership, black_women_ownership, enterprise_type.
 * Total Measured Procurement Spend (TMPS), the procurement denominator, is a
 * document-level total extracted separately when explicitly stated.
 */

export type EnterpriseType = 'eme' | 'qse' | 'generic';

export interface SupplierRow {
  supplier_name: string | null;
  spend_amount: number | null;
  bee_level: number | null;
  black_ownership: number | null;
  black_women_ownership: number | null;
  enterprise_type: EnterpriseType | null;
  calculator_fields: Record<string, unknown>;
  status: 'passed' | 'review_required';
  issues: string[];
}

const NAME_KEYS = ['supplier name', 'supplier', 'name', 'entity', 'company', 'beneficiary'];
const SPEND_KEYS = ['amount excl vat', 'amount', 'spend', 'value', 'total', 'procurement spend', 'measured spend'];
const LEVEL_KEYS = ['b-bbee level', 'bbbee level', 'bee level', 'level', 'status level'];
const OWNERSHIP_KEYS = ['black ownership', 'black owned', 'ownership', 'black %'];
const BWO_KEYS = ['black women ownership', 'black woman ownership', 'black female ownership', 'black women owned', 'bwo', 'black women %'];
const TYPE_KEYS = ['enterprise type', 'entity type', 'eme qse', 'eme/qse', 'size', 'category', 'supplier type'];

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

/** Returns a canonical enterprise type, or undefined when nothing is stated,
 *  or the sentinel 'unknown' when a value is present but not recognised. */
function normalizeEnterpriseType(raw: unknown): EnterpriseType | 'unknown' | undefined {
  if (raw == null || String(raw).trim() === '') return undefined;
  const v = String(raw).toLowerCase();
  if (/\beme\b|exempt(?:ed)?\s+micro/.test(v)) return 'eme';
  if (/\bqse\b|qualifying\s+small/.test(v)) return 'qse';
  if (/\bgeneric\b|large\s+enterprise|\blarge\b/.test(v)) return 'generic';
  return 'unknown';
}

function buildRow(
  rawName: unknown,
  rawSpend: unknown,
  rawLevel: unknown,
  rawOwnership: unknown,
  rawBWO: unknown,
  rawType: unknown,
): SupplierRow | null {
  const supplier_name = rawName != null && String(rawName).trim() ? String(rawName).trim() : null;
  const spend_amount = rawSpend != null ? normalizeMoney(rawSpend) : null;
  const bee_level = rawLevel != null ? normalizeBeeLevel(rawLevel) : null;
  const black_ownership = rawOwnership != null ? normalizePercentage(rawOwnership) : null;
  const black_women_ownership = rawBWO != null ? normalizePercentage(rawBWO) : null;
  const typeResult = normalizeEnterpriseType(rawType);

  // A row with no name and no spend is not a supplier row (header/blank line).
  if (!supplier_name && spend_amount == null) return null;

  const issues: string[] = [];
  if (!supplier_name) issues.push('supplier name missing');
  if (spend_amount == null) issues.push('spend amount missing or unparseable');
  const beeInvalid = bee_level != null && (!Number.isInteger(bee_level) || bee_level < 1 || bee_level > 8);
  if (beeInvalid) issues.push('B-BBEE level out of range');
  const boInvalid = black_ownership != null && (black_ownership < 0 || black_ownership > 100);
  if (boInvalid) issues.push('black ownership out of range');
  const bwoInvalid = black_women_ownership != null && (black_women_ownership < 0 || black_women_ownership > 100);
  if (bwoInvalid) issues.push('black women ownership out of range');
  // A stated-but-unrecognised enterprise type is a real ambiguity → review.
  if (typeResult === 'unknown') issues.push('enterprise type not recognised');

  // Missing enterprise type defaults to 'generic' — a conservative choice that
  // never inflates QSE/EME sub-targets (it only ever understates), so it does
  // not force review, but it is surfaced as a gap for the mapping layer.
  const enterprise_type: EnterpriseType | null = typeResult === 'unknown' ? null
    : typeResult ?? 'generic';

  const candidate: Record<string, unknown> = {
    'supplier.name': supplier_name,
    'supplier.spend': spend_amount,
    'supplier.bee_level': beeInvalid ? null : bee_level,
    'supplier.black_ownership': boInvalid ? null : black_ownership,
    'supplier.black_women_ownership': bwoInvalid ? null : black_women_ownership,
    'supplier.enterprise_type': typeResult === 'unknown' ? null : enterprise_type,
  };
  const calculator_fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (admitCalculatorEntry(key, value).accepted) calculator_fields[key] = value;
  }

  const status: SupplierRow['status'] = issues.length === 0 ? 'passed' : 'review_required';

  return {
    supplier_name,
    spend_amount,
    bee_level,
    black_ownership,
    black_women_ownership,
    enterprise_type,
    calculator_fields,
    status,
    issues,
  };
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
        pickColumn(record, BWO_KEYS),
        pickColumn(record, TYPE_KEYS),
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
// Black women ownership must be matched before black ownership so the "women"
// label wins over the substring "black ownership".
const TEXT_BWO_KEYS = ['black women ownership', 'black woman ownership', 'black female ownership'];
const TEXT_TYPE_KEYS = ['enterprise type', 'entity type', 'supplier type', 'size'];
const SUPPLIER_ANCHOR = /supplier(?:\s*name)?\s*[:\-]/i;

function extractFromText(text: string): SupplierRow[] {
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
      valueForLabel(block, TEXT_BWO_KEYS),
      valueForLabel(block, TEXT_TYPE_KEYS),
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

/**
 * Extracts the Total Measured Procurement Spend (TMPS) — the procurement
 * denominator — ONLY when explicitly stated as a labelled total. It is never
 * derived by summing supplier rows: statutory TMPS has inclusions/exclusions
 * that a supplier list does not capture, so guessing it would be unsafe.
 */
export function extractMeasuredProcurementSpend(input: { raw_text?: string }): number | null {
  const text = input.raw_text ?? '';
  const re = /(?:Total\s+Measured\s+Procurement\s+Spend|TMPS|Total\s+Procurement\s+Spend|Total\s+Measured\s+Spend)\s*[:\-]?\s*(R\s?[0-9][0-9,\s]*(?:\.[0-9]+)?\s?(?:m|million|k|thousand|bn|billion)?)/i;
  const m = re.exec(text);
  if (!m?.[1]) return null;
  const value = normalizeMoney(m[1]);
  return typeof value === 'number' && value > 0 ? value : null;
}
