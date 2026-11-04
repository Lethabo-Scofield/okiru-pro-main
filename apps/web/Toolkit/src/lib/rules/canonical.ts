/** Deterministic JSON (sorted keys) and SHA-256 - identical in the browser and in Node 20+. */

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const child = (v as Record<string, unknown>)[k];
      if (child !== undefined) out[k] = sortDeep(child);
    }
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) {
    throw new Error('Cannot canonicalize a non-finite number');
  }
  return v;
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto is not available; cannot hash rules');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashOf(value: unknown): Promise<string> {
  return sha256Hex(canonicalize(value));
}
