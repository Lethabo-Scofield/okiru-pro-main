import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRand(value: number): string {
  if (!Number.isFinite(value)) return 'R0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `R${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `R${sign}${(abs / 1_000).toFixed(0)}K`;
  return `R${sign}${abs.toFixed(0)}`;
}

export function formatPercentage(value: number, decimals: number = 1): string {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(decimals)}%`;
}
