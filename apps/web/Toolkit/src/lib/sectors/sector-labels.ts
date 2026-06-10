import type { Client } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { fscSubSectorDisplayLabel, normalizeFscSubSector } from './fsc-utils';

const SECTOR_DISPLAY_NAMES: Record<string, string> = {
  RCOGP: 'RCOGP',
  ICT: 'ICT',
  FSC: 'FSC',
  AGRI: 'AgriBEE',
  TOURISM: 'Tourism',
  CONSTRUCTION: 'Construction',
  MINING: 'Mining',
  TRANSPORT: 'Transport',
};

type SectorClient = Pick<Client, 'sectorCode' | 'scorecardType' | 'companySize' | 'fscSubSector'>;
type SectorConfigRef = Pick<CalculatorConfig, 'sectorCode' | 'scorecardType'> | null | undefined;

/** Human-readable label for the active sector scorecard (e.g. "FSC Banks (FS701)", "ICT Generic"). */
export function activeSectorDisplayLabel(
  client: SectorClient,
  calculatorConfig?: SectorConfigRef,
): string {
  const sector = (calculatorConfig?.sectorCode ?? client.sectorCode ?? 'RCOGP').toUpperCase();
  const type = calculatorConfig?.scorecardType ?? client.scorecardType ?? client.companySize ?? 'Generic';

  if (sector === 'FSC') {
    return fscSubSectorDisplayLabel(normalizeFscSubSector(client.fscSubSector));
  }

  const base = SECTOR_DISPLAY_NAMES[sector] ?? sector;
  if (sector === 'RCOGP' && type === 'Generic') {
    return `${base} Generic Codes`;
  }
  return `${base} ${type}`;
}

export interface SubLineSummary {
  count: number;
  basePoints: number;
  bonusPoints: number;
}

export function summarizeSubLines(
  subLines: Array<{ weighting: number; isBonus?: boolean }>,
): SubLineSummary {
  let basePoints = 0;
  let bonusPoints = 0;
  for (const sl of subLines) {
    if (sl.isBonus) bonusPoints += sl.weighting;
    else basePoints += sl.weighting;
  }
  return { count: subLines.length, basePoints, bonusPoints };
}

/** Subtitle for pillar "Detailed Scorecard Breakdown" cards — sector-aware, derived from live sub-lines. */
export function pillarBreakdownSubtitle(
  subLines: Array<{ weighting: number; isBonus?: boolean }>,
  client: SectorClient,
  calculatorConfig?: SectorConfigRef,
  hint?: string,
): string {
  const sectorLabel = activeSectorDisplayLabel(client, calculatorConfig);
  const { count, basePoints, bonusPoints } = summarizeSubLines(subLines);

  const pointsPart =
    bonusPoints > 0
      ? ` (${basePoints.toFixed(0)} base + ${bonusPoints.toFixed(0)} bonus)`
      : basePoints > 0
        ? ` (${basePoints.toFixed(0)} pts)`
        : '';

  const main = `${count} sub-line indicator${count === 1 ? '' : 's'} per ${sectorLabel}${pointsPart}`;
  return hint ? `${main} — ${hint}` : main;
}

/** Procurement / ESD / SED subtitle when sub-line count is not the primary message. */
export function pillarSectorSubtitle(
  client: SectorClient,
  calculatorConfig?: SectorConfigRef,
  maxPoints?: number,
): string {
  const sectorLabel = activeSectorDisplayLabel(client, calculatorConfig);
  if (maxPoints != null && maxPoints > 0) {
    return `Scorecard indicators per ${sectorLabel} (${maxPoints} pts max)`;
  }
  return `Scorecard indicators per ${sectorLabel}`;
}
