import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { SBTI_TARGET_YEAR } from "../esgConfig/consumer-goods";

export type NetZeroMilestone = {
  tier: string;
  year: number;
  requirement: string;
  gapTco2e: number;
  onTrack: boolean;
};

export type NetZeroRoadmapResult = {
  baselineTco2e: number;
  currentTco2e: number;
  gapTco2e: number;
  targetYear: number;
  milestones: NetZeroMilestone[];
};

const MILESTONE_DEFS: Omit<NetZeroMilestone, "gapTco2e" | "onTrack">[] = [
  { tier: "Pre-Recognised", year: 2025, requirement: "SBTi commitment letter" },
  { tier: "Recognised", year: 2028, requirement: "−50% Scope 1+2 from baseline" },
  { tier: "Leadership", year: 2035, requirement: "−90% S1+2 + 30% S3 + offsets" },
  { tier: "Net-Zero", year: 2050, requirement: "Net-zero S1+2+3" },
];

export function computeNetZeroRoadmap(workbook: EsgWorkbookData): NetZeroRoadmapResult {
  const baseline = readEsgCell(workbook, "e-data", "B90") ?? 0;
  const current = readEsgCell(workbook, "e-data", "F90") ?? 0;
  const targetYear = readEsgCell(workbook, "assumptions", "B107") ?? SBTI_TARGET_YEAR;
  const gap = Math.max(0, current - baseline);

  const milestones = MILESTONE_DEFS.map((m) => ({
    ...m,
    gapTco2e: gap,
    onTrack: baseline > 0 ? current <= baseline : false,
  }));

  return {
    baselineTco2e: baseline,
    currentTco2e: current,
    gapTco2e: gap,
    targetYear,
    milestones,
  };
}
