/**
 * Strict allowlist of calculator keys the parser is permitted to emit.
 *
 * The safety contract requires that ontology data — especially fields the
 * Excel matrix loader derives for non-canonical document types — can never
 * inject an arbitrary calculator path. Only keys defined here may appear in a
 * `calculator_payload`, and each emitted value must match the expected runtime
 * type. Anything else is dropped and recorded as a rejected key.
 */

export type CalculatorValueType = 'string' | 'number' | 'iso_date';

export interface CalculatorKeySpec {
  key: string;
  type: CalculatorValueType;
  description: string;
}

export const CALCULATOR_KEY_ALLOWLIST: readonly CalculatorKeySpec[] = [
  { key: 'supplier.name', type: 'string', description: 'Supplier legal/trading name' },
  { key: 'supplier.bee_level', type: 'number', description: 'Supplier B-BBEE status level (1-8)' },
  { key: 'supplier.black_ownership', type: 'number', description: 'Supplier black ownership percentage (0-100)' },
  { key: 'supplier.certificate_expiry', type: 'iso_date', description: 'Certificate expiry date (ISO yyyy-mm-dd)' },
  { key: 'supplier.affidavit_signed_date', type: 'iso_date', description: 'Affidavit signed date (ISO yyyy-mm-dd)' },
  { key: 'supplier.spend', type: 'number', description: 'Supplier spend amount excluding VAT' },
] as const;

const ALLOWLIST_BY_KEY = new Map<string, CalculatorKeySpec>(
  CALCULATOR_KEY_ALLOWLIST.map((spec) => [spec.key, spec]),
);

export function isAllowedCalculatorKey(key: string): boolean {
  return ALLOWLIST_BY_KEY.has(key);
}

export function calculatorKeySpec(key: string): CalculatorKeySpec | undefined {
  return ALLOWLIST_BY_KEY.get(key);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns true only when `value` is a concrete, non-empty value of the exact
 * runtime type the calculator key expects. Rejects null/undefined/NaN, wrong
 * types, and malformed ISO dates.
 */
export function calculatorValueMatchesType(type: CalculatorValueType, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'iso_date':
      return typeof value === 'string' && ISO_DATE_RE.test(value) && !Number.isNaN(new Date(value).getTime());
    default:
      return false;
  }
}

export interface CalculatorAllowlistResult {
  accepted: boolean;
  reason?: 'unknown_key' | 'type_mismatch' | 'empty_value';
}

/** Decides whether a single (key, value) pair may enter the calculator payload. */
export function admitCalculatorEntry(key: string, value: unknown): CalculatorAllowlistResult {
  const spec = ALLOWLIST_BY_KEY.get(key);
  if (!spec) return { accepted: false, reason: 'unknown_key' };
  if (value == null) return { accepted: false, reason: 'empty_value' };
  if (!calculatorValueMatchesType(spec.type, value)) return { accepted: false, reason: 'type_mismatch' };
  return { accepted: true };
}
