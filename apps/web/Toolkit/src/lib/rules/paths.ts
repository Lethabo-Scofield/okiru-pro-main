/**
 * Safe path addressing for rule overrides.
 *
 * A path is a dotted chain of keys. A segment may carry ONE array selector,
 * `name[field=value]`, which picks the single array element whose `field` equals
 * `value` (e.g. `benefitFactors[contributionType=guarantees].sdFactor`).
 *
 * The resolver only ever follows keys that already exist, never creates a key or
 * an array element, and refuses prototype-polluting segments. An override that
 * cannot be resolved is an error, not a silent no-op.
 */

export type PathSegment = { key: string; selector?: { field: string; value: string } };

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SEGMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z0-9_.\-]+)\])?$/;

export class RulePathError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${message}: "${path}"`);
    this.name = 'RulePathError';
  }
}

export function parsePath(path: string): PathSegment[] {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200) {
    throw new RulePathError(String(path), 'Invalid rule path');
  }
  // Split on dots that are not inside a [...] selector (selector values may hold dots).
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of path) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === '.' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  if (depth !== 0) throw new RulePathError(path, 'Unbalanced selector in rule path');

  return parts.map((part) => {
    const m = SEGMENT_RE.exec(part);
    if (!m) throw new RulePathError(path, 'Malformed rule path segment');
    const [, key, field, value] = m;
    if (FORBIDDEN_KEYS.has(key) || (field && FORBIDDEN_KEYS.has(field))) {
      throw new RulePathError(path, 'Forbidden key in rule path');
    }
    return field ? { key, selector: { field, value } } : { key };
  });
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Walks to the container of the last segment. Returns null if any hop is missing. */
function locate(root: unknown, segments: PathSegment[]): { holder: Record<string, unknown>; key: string } | null {
  let node: unknown = root;
  for (let i = 0; i < segments.length; i++) {
    const { key, selector } = segments[i];
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return null;
    const obj = node as Record<string, unknown>;
    if (!hasOwn(obj, key)) return null;
    const last = i === segments.length - 1;
    if (selector) {
      const arr = obj[key];
      if (!Array.isArray(arr)) return null;
      const matches = arr.filter(
        (el) => el !== null && typeof el === 'object' && hasOwn(el as object, selector.field)
          && String((el as Record<string, unknown>)[selector.field]) === selector.value,
      );
      if (matches.length !== 1) return null; // missing or ambiguous
      if (last) return null; // a selector must be followed by a field
      node = matches[0];
    } else if (last) {
      return { holder: obj, key };
    } else {
      node = obj[key];
    }
  }
  return null;
}

/** Reads the value at `path`, or `undefined` if the path does not resolve. */
export function getAtPath(root: unknown, path: string): unknown {
  const loc = locate(root, parsePath(path));
  return loc ? loc.holder[loc.key] : undefined;
}

export function pathResolves(root: unknown, path: string): boolean {
  const loc = locate(root, parsePath(path));
  return loc !== null;
}

/**
 * Replaces the value at an EXISTING leaf. Throws if the path does not resolve, if the
 * leaf is not a primitive, or if the new value's type differs from the current one.
 */
export function setAtPath(root: unknown, path: string, value: number | string | boolean): void {
  const loc = locate(root, parsePath(path));
  if (!loc) throw new RulePathError(path, 'Rule path does not resolve');
  const current = loc.holder[loc.key];
  if (current === null || typeof current === 'object') {
    throw new RulePathError(path, 'Rule path does not address a primitive value');
  }
  if (typeof current !== typeof value) {
    throw new RulePathError(path, `Type mismatch (expected ${typeof current}, got ${typeof value})`);
  }
  loc.holder[loc.key] = value;
}

export function isSafeKey(key: string): boolean {
  return KEY_RE.test(key) && !FORBIDDEN_KEYS.has(key);
}
