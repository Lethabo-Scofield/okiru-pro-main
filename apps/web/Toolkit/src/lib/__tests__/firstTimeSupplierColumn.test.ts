/**
 * The workbook shows the procurement "First-time Supplier?" column on exactly
 * the scorecards whose score reads it — the 1.2 recognition rule
 * 'black_owned_small_supplier_or_first_time', or FSC's toolkit scorer, which
 * applies that rule itself. A sector that starts or stops reading the answer
 * must show or hide the column with it.
 */
import { describe, expect, it } from 'vitest';
import { getSection, scorecardReadsFirstTimeSupplier } from '@/components/workbook/sections';
import type { CalculatorConfig } from '../../../../shared/schema';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '../sectors/rcogp-generic';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '../sectors/rcogp-qse';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '../sectors/ict-generic';
import { ICT_QSE_CALCULATOR_CONFIG } from '../sectors/ict-qse';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '../sectors/agri-generic';
import { FSC_GENERIC_CALCULATOR_CONFIG } from '../sectors/fsc-generic';
import { FSC_QSE_CALCULATOR_CONFIG } from '../sectors/fsc-qse';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from '../sectors/transport-generic';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '../sectors/transport-qse';

const readsFirstTime = (cfg: CalculatorConfig) =>
  cfg.procurement?.enhancedRecognitionRule === 'black_owned_small_supplier_or_first_time' || cfg.fscToolkit !== undefined;

const shows = (sector: string, card: string) =>
  getSection('procurement', sector, card)!.columns!.some((c) => c.key === 'firstTimeSupplier');

describe('"First-time Supplier?" is asked wherever the score reads it, and nowhere else', () => {
  it.each([
    ['RCOGP', 'Generic', RCOGP_GENERIC_CALCULATOR_CONFIG],
    ['RCOGP', 'QSE', RCOGP_QSE_CALCULATOR_CONFIG],
    ['ICT', 'Generic', ICT_GENERIC_CALCULATOR_CONFIG],
    ['ICT', 'QSE', ICT_QSE_CALCULATOR_CONFIG],
    ['AGRI', 'Generic', AGRI_GENERIC_CALCULATOR_CONFIG],
    ['FSC', 'Generic', FSC_GENERIC_CALCULATOR_CONFIG],
    ['FSC', 'QSE', FSC_QSE_CALCULATOR_CONFIG],
    ['TRANSPORT', 'Generic', TRANSPORT_GENERIC_CALCULATOR_CONFIG],
    ['TRANSPORT', 'QSE', TRANSPORT_QSE_CALCULATOR_CONFIG],
  ] as const)('%s %s', (sector, card, cfg) => {
    expect(scorecardReadsFirstTimeSupplier(sector, card)).toBe(readsFirstTime(cfg));
    expect(shows(sector, card)).toBe(readsFirstTime(cfg));
  });

  it('the importer (no sector) always recognises the column', () => {
    expect(getSection('procurement')!.columns!.some((c) => c.key === 'firstTimeSupplier')).toBe(true);
  });
});
