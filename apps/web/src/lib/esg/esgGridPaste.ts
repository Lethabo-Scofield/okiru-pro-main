/** Fixed-shape grid paste — preserves empty cells at anchor. */
export function applyPasteToCells(
  values: Record<string, string | number | boolean | null>,
  cellRefs: string[][],
  matrix: string[][],
  anchor: { row: number; col: number },
): Record<string, string | number | boolean | null> {
  const next = { ...values };
  for (let r = 0; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    for (let c = 0; c < line.length; c++) {
      const ref = cellRefs[anchor.row + r]?.[anchor.col + c];
      if (!ref) continue;
      const raw = line[c] ?? "";
      const trimmed = raw.trim();
      if (trimmed === "") {
        next[ref] = "";
      } else {
        const n = Number(trimmed.replace(/[^\d.-]/g, ""));
        next[ref] = Number.isFinite(n) && /^-?\d/.test(trimmed) ? n : trimmed;
      }
    }
  }
  return next;
}

export function sumRow(values: (string | number | null | undefined)[]): number {
  return values.reduce((acc, v) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}
