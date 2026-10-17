/**
 * Plain-English arithmetic notes for a scorecard line, e.g.
 *   "R137.3m ÷ R199.8m = 68.7% ÷ 80% × 5 = 4.29"
 * so a verifier can redo the line on a calculator without opening the code.
 */

/** R137.3m / R522.9k / R950 — short enough to sit beside a score. */
export function formatRand(value: number): string {
  if (!Number.isFinite(value)) return 'R0';
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v >= 1e9) return `${sign}R${(v / 1e9).toFixed(2)}bn`;
  if (v >= 1e7) return `${sign}R${(v / 1e6).toFixed(1)}m`;
  if (v >= 1e6) return `${sign}R${(v / 1e6).toFixed(2)}m`;
  if (v >= 1e3) return `${sign}R${(v / 1e3).toFixed(1)}k`;
  return `${sign}R${v.toFixed(0)}`;
}

/** 0.687 → "68.7%"; 0.0202 → "2.02%"; 0.02 → "2%". */
export function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return '0%';
  const p = fraction * 100;
  const decimals = Math.abs(p) < 10 ? 2 : 1;
  return `${Number(p.toFixed(decimals))}%`;
}

function formatPoints(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * "R137.3m ÷ R199.8m = 68.7% ÷ 80% × 5 = 4.29" — or, over target,
 * "… = 6.10, capped at 5" — or the reason there is nothing to divide by.
 */
export function ratioLineNote(args: {
  spend: number;
  denominator: number;
  denominatorLabel?: string;
  target: number;
  maxPoints: number;
}): string {
  const { spend, denominator, denominatorLabel, target, maxPoints } = args;
  if (!(denominator > 0) || !(target > 0)) {
    return `${formatRand(spend)} counted, but there is no ${denominatorLabel ?? 'denominator'} to measure it against, so the line scores 0.`;
  }
  const share = spend / denominator;
  const raw = (share / target) * maxPoints;
  const scored = Math.min(Math.max(raw, 0), maxPoints);
  const label = denominatorLabel ? ` (${denominatorLabel})` : '';
  const head = `${formatRand(spend)} ÷ ${formatRand(denominator)}${label} = ${formatPct(share)} ÷ ${formatPct(target)} × ${maxPoints} = ${formatPoints(raw)}`;
  return raw > maxPoints ? `${head}, capped at ${maxPoints}` : head;
}
