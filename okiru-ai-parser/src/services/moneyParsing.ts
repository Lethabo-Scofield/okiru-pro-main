/**
 * One reading of a money/number cell for the whole parser.
 *
 * Three services grew their own identical copy of this ("R 1 030 806.68",
 * "(4 157 140)" = negative, comma/space thousands); a fourth copy would
 * eventually drift on some edge and two extractors would read the same cell
 * differently. Financial-statement bracket-negatives and rand formatting are
 * the domain rules; everything else is Number().
 */
export function parseMoney(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const negative = /^\(.*\)$/.test(value.trim());
  const cleaned = value.replace(/[()]/g, '').replace(/[R$€£\s,%]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}
