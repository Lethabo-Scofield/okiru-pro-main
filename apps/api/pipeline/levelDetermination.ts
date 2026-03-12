export function determineBeeLevel(totalPoints: number): { level: number; label: string; recognition: number } {
  if (totalPoints >= 100) return { level: 1, label: 'LEVEL 1', recognition: 135 };
  if (totalPoints >= 95) return { level: 2, label: 'LEVEL 2', recognition: 125 };
  if (totalPoints >= 90) return { level: 3, label: 'LEVEL 3', recognition: 110 };
  if (totalPoints >= 80) return { level: 4, label: 'LEVEL 4', recognition: 100 };
  if (totalPoints >= 75) return { level: 5, label: 'LEVEL 5', recognition: 80 };
  if (totalPoints >= 70) return { level: 6, label: 'LEVEL 6', recognition: 60 };
  if (totalPoints >= 55) return { level: 7, label: 'LEVEL 7', recognition: 50 };
  if (totalPoints >= 40) return { level: 8, label: 'LEVEL 8', recognition: 10 };
  return { level: 9, label: 'Non-Compliant', recognition: 0 };
}

export const LEVEL_POINTS_THRESHOLDS = [100, 95, 90, 80, 75, 70, 55, 40] as const;
