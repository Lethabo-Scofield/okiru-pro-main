/**
 * Canonical per-pillar sub-element rows for Super Admin / API display.
 * Sourced from docs/SECTOR_TRUTH_LEDGER.md (2026-05-21 audit).
 */

export interface PillarSubElement {
  criteria: string;
  points: number;
  target: string;
  formula: string;
  isBonus?: boolean;
}

export type SectorPillarMap = Record<string, PillarSubElement[]>;

function pct(n: number, decimals = 0): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

const PROP = 'min(actual / target, 1) × max_points';
const NPAT = (rate: string, pts: number) =>
  `Σ(qualifying spend × benefit factor) / (${rate} of NPAT) × ${pts} pts`;

/** Ledger-aligned sub-elements keyed by `SECTOR:ScorecardType`. */
export const SECTOR_PILLAR_SUB_ELEMENTS: Record<string, SectorPillarMap> = {
  'RCOGP:Generic': {
    ownership: [
      { criteria: 'Voting rights — Black', points: 4, target: '25% + 1 vote', formula: PROP },
      { criteria: 'Voting rights — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Economic interest — Black', points: 4, target: '25%', formula: 'graduated × time' },
      { criteria: 'Economic interest — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Economic interest — Designated groups / ownership schemes', points: 3, target: '3%', formula: PROP },
      { criteria: 'Economic interest — Black new entrants', points: 2, target: '2%', formula: 'Full points if qualifying new entrant', isBonus: true },
      { criteria: 'Net Value (realisation)', points: 8, target: '100%', formula: 'Year-graduated net value (Annex §4)' },
    ],
    managementControl: [
      { criteria: 'Black board members (voting rights)', points: 2, target: '50%', formula: PROP },
      { criteria: 'Black women board members (voting rights)', points: 1, target: '25%', formula: PROP },
      { criteria: 'Black executive directors', points: 2, target: '50%', formula: PROP },
      { criteria: 'Black female executive directors', points: 1, target: '25%', formula: PROP },
      { criteria: 'Black other executive management', points: 2, target: '60%', formula: PROP },
      { criteria: 'Black female other executive management', points: 1, target: '30%', formula: PROP },
      { criteria: 'Black senior management', points: 2, target: 'EAP-based', formula: PROP },
      { criteria: 'Black female senior management', points: 1, target: 'EAP-based', formula: PROP },
      { criteria: 'Black middle management', points: 2, target: 'EAP-based', formula: PROP },
      { criteria: 'Black female middle management', points: 1, target: 'EAP-based', formula: PROP },
      { criteria: 'Black junior management', points: 1, target: 'EAP-based (~88%)', formula: PROP },
      { criteria: 'Black female junior management', points: 1, target: 'EAP-based (~44%)', formula: PROP },
      { criteria: 'Black employees with disabilities', points: 2, target: '2%', formula: PROP },
    ],
    skillsDevelopment: [
      { criteria: 'Learning programmes for Black people (% of leviable)', points: 6, target: '3.5%', formula: PROP },
      { criteria: 'Bursaries — Black', points: 4, target: '2.5%', formula: PROP },
      { criteria: 'Learning programmes for disabled Black people', points: 4, target: '0.3%', formula: PROP },
      { criteria: 'Black people in B/C/D programmes (headcount)', points: 6, target: '5% of headcount', formula: PROP },
      { criteria: 'Absorption after B/C/D programmes', points: 5, target: '100% absorbed', formula: 'min(absorbed / learners, 1) × max_points', isBonus: true },
    ],
    preferentialProcurement: [
      { criteria: 'All empowering suppliers (BEE L1–L8 by recognition)', points: 5, target: '80% of TMPS', formula: 'Σ(spend × recognition%) / TMPS / target × max_points' },
      { criteria: 'QSE suppliers', points: 3, target: '15%', formula: PROP },
      { criteria: 'EME suppliers', points: 4, target: '15%', formula: PROP },
      { criteria: '≥51% Black-owned (BO51)', points: 11, target: '50%', formula: PROP },
      { criteria: '≥30% Black women owned (BWO30)', points: 4, target: '12%', formula: PROP },
      { criteria: 'Designated group suppliers (bonus, 51% Black owned)', points: 2, target: '2%', formula: PROP, isBonus: true },
    ],
    supplierDevelopment: [
      { criteria: 'SD contributions as % of (2% NPAT)', points: 10, target: '2% NPAT', formula: NPAT('2%', 10) },
    ],
    enterpriseDevelopment: [
      { criteria: 'ED contributions as % of (1% NPAT)', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) },
      { criteria: 'Graduation bonus (≥1 SD → ED)', points: 1, target: 'yes/no', formula: '+1 pt if ≥1 SD beneficiary graduated', isBonus: true },
      { criteria: 'Jobs created bonus (≥1 perm job)', points: 1, target: 'yes/no', formula: '+1 pt if ≥1 permanent job created', isBonus: true },
    ],
    socioEconomicDevelopment: [
      { criteria: 'SED contributions as % of (1% NPAT)', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) },
    ],
  },

  'RCOGP:QSE': {
    ownership: [
      { criteria: 'Voting rights — Black', points: 5, target: '25%', formula: PROP },
      { criteria: 'Voting rights — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Economic interest — Black', points: 5, target: '25%', formula: PROP },
      { criteria: 'Economic interest — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Net Value', points: 8, target: '100%', formula: 'Year-graduated net value' },
      { criteria: 'Black new entrants', points: 3, target: '2%', formula: PROP, isBonus: true },
    ],
    managementControl: [
      { criteria: 'Black board members', points: 3, target: '50%', formula: PROP },
      { criteria: 'Black women board members', points: 2, target: '25%', formula: PROP },
      { criteria: 'Black executive directors', points: 2, target: '50%', formula: PROP },
      { criteria: 'Black female executive directors', points: 1, target: '25%', formula: PROP },
      { criteria: 'Black other executive management', points: 3, target: '60%', formula: PROP },
      { criteria: 'Black female other executive management', points: 2, target: '30%', formula: PROP },
      { criteria: 'Black employees with disabilities', points: 2, target: '2%', formula: PROP },
    ],
    skillsDevelopment: [
      { criteria: 'Learning programmes for Black people', points: 15, target: '3% leviable', formula: PROP },
      { criteria: 'Bursaries — Black', points: 7, target: '1% black female', formula: PROP },
      { criteria: 'Learning programmes for disabled Black people', points: 3, target: '0.15%', formula: PROP },
      { criteria: 'Absorption', points: 5, target: '1% absorption', formula: PROP, isBonus: true },
    ],
    preferentialProcurement: [
      { criteria: 'All empowering suppliers', points: 5, target: '80%', formula: PROP },
      { criteria: 'QSE suppliers', points: 3, target: '15%', formula: PROP },
      { criteria: 'EME suppliers', points: 4, target: '15%', formula: PROP },
      { criteria: '≥51% Black-owned', points: 5, target: '50%', formula: PROP },
      { criteria: '≥30% Black women owned', points: 4, target: '12%', formula: PROP },
    ],
    supplierDevelopment: [{ criteria: 'SD contributions', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) }],
    enterpriseDevelopment: [
      { criteria: 'ED contributions', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) },
      { criteria: 'Graduation bonus', points: 1, target: 'yes/no', formula: '+1 pt if graduated', isBonus: true },
      { criteria: 'Jobs created bonus', points: 1, target: 'yes/no', formula: '+1 pt if job created', isBonus: true },
    ],
    socioEconomicDevelopment: [{ criteria: 'SED contributions', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) }],
  },

  'ICT:Generic': {
    ownership: [
      { criteria: 'Voting rights — Black', points: 5, target: '30%', formula: PROP },
      { criteria: 'Voting rights — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Economic interest — Black', points: 5, target: '25%', formula: PROP },
      { criteria: 'Economic interest — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Net Value', points: 8, target: '100%', formula: 'Year-graduated net value' },
      { criteria: 'Black new entrants', points: 3, target: '2%', formula: PROP, isBonus: true },
    ],
    managementControl: [
      { criteria: 'Black board members', points: 3, target: '50%', formula: PROP },
      { criteria: 'Black women board members', points: 2, target: '25%', formula: PROP },
      { criteria: 'Black executive directors', points: 2, target: '50%', formula: PROP },
      { criteria: 'Black female executive directors', points: 1, target: '25%', formula: PROP },
      { criteria: 'Black other executive management', points: 3, target: '60%', formula: PROP },
      { criteria: 'Black female other executive management', points: 2, target: '30%', formula: PROP },
      { criteria: 'Black senior management', points: 2, target: 'EAP-based', formula: PROP },
      { criteria: 'Black female senior management', points: 1, target: 'EAP-based', formula: PROP },
      { criteria: 'Black middle management', points: 2, target: 'EAP-based', formula: PROP },
      { criteria: 'Black female middle management', points: 1, target: 'EAP-based', formula: PROP },
      { criteria: 'Black junior management', points: 1, target: 'EAP-based', formula: PROP },
      { criteria: 'Black female junior management', points: 1, target: 'EAP-based', formula: PROP },
      { criteria: 'Black employees with disabilities', points: 2, target: '2%', formula: PROP },
    ],
    skillsDevelopment: [
      { criteria: 'Learning programmes for Black people', points: 6, target: '3% leviable', formula: PROP },
      { criteria: 'Bursaries — Black', points: 4, target: '1%', formula: PROP },
      { criteria: 'Learning programmes for disabled Black people', points: 4, target: '0.15%', formula: PROP },
      { criteria: 'Black people in B/C/D programmes', points: 6, target: '5% headcount', formula: PROP },
      { criteria: 'Absorption', points: 5, target: '2.5%', formula: PROP, isBonus: true },
    ],
    preferentialProcurement: [
      { criteria: 'All empowering suppliers', points: 5, target: '80%', formula: PROP },
      { criteria: 'QSE suppliers', points: 3, target: '15%', formula: PROP },
      { criteria: 'EME suppliers', points: 4, target: '15%', formula: PROP },
      { criteria: '≥51% Black-owned', points: 9, target: '50%', formula: PROP },
      { criteria: '≥30% Black women owned', points: 4, target: '12%', formula: PROP },
      { criteria: 'Designated group suppliers', points: 2, target: '2%', formula: PROP, isBonus: true },
    ],
    supplierDevelopment: [{ criteria: 'SD contributions', points: 10, target: '2% NPAT', formula: NPAT('2%', 10) }],
    enterpriseDevelopment: [
      { criteria: 'ED contributions', points: 15, target: '1% NPAT', formula: NPAT('1%', 15) },
      { criteria: 'Graduation bonus', points: 1, target: 'yes/no', formula: '+1 pt', isBonus: true },
      { criteria: 'Jobs ≤10 employees bonus', points: 1, target: 'yes/no', formula: '+1 pt', isBonus: true },
      { criteria: 'Jobs >11 employees bonus', points: 1, target: 'yes/no', formula: '+1 pt', isBonus: true },
    ],
    socioEconomicDevelopment: [{ criteria: 'SED / ICT initiatives', points: 12, target: '1% NPAT', formula: NPAT('1%', 12) }],
  },

  'ICT:QSE': {
    ownership: [
      { criteria: 'Voting rights — Black', points: 5, target: '25%', formula: PROP },
      { criteria: 'Voting rights — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Economic interest — Black', points: 5, target: '25%', formula: PROP },
      { criteria: 'Economic interest — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Net Value', points: 8, target: '100%', formula: 'Year-graduated net value' },
      { criteria: 'Black new entrants', points: 3, target: '2%', formula: PROP, isBonus: true },
    ],
    managementControl: [
      { criteria: 'Black board members', points: 3, target: '50%', formula: PROP },
      { criteria: 'Black women board members', points: 2, target: '25%', formula: PROP },
      { criteria: 'Black executive directors', points: 3, target: '50%', formula: PROP },
      { criteria: 'Black female executive directors', points: 3, target: '25%', formula: PROP },
      { criteria: 'Black other executive management', points: 2, target: '60%', formula: PROP },
      { criteria: 'Black female other executive management', points: 2, target: '30%', formula: PROP },
    ],
    skillsDevelopment: [
      { criteria: 'Learning programmes for Black people', points: 15, target: '3% leviable', formula: PROP },
      { criteria: 'Bursaries — Black', points: 7, target: '1%', formula: PROP },
      { criteria: 'Disabled learning programmes', points: 3, target: '0.15%', formula: PROP },
      { criteria: 'Absorption', points: 5, target: '1%', formula: PROP, isBonus: true },
    ],
    preferentialProcurement: [
      { criteria: 'All empowering suppliers', points: 5, target: '80%', formula: PROP },
      { criteria: 'QSE suppliers', points: 3, target: '15%', formula: PROP },
      { criteria: 'EME suppliers', points: 4, target: '15%', formula: PROP },
      { criteria: '≥51% Black-owned', points: 5, target: '50%', formula: PROP },
      { criteria: '≥30% Black women owned', points: 4, target: '12%', formula: PROP },
    ],
    supplierDevelopment: [{ criteria: 'SD contributions', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) }],
    enterpriseDevelopment: [
      { criteria: 'ED contributions', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) },
      { criteria: 'Graduation bonus', points: 1, target: 'yes/no', formula: '+1 pt', isBonus: true },
      { criteria: 'Jobs created bonus', points: 2, target: 'yes/no', formula: '+2 pts', isBonus: true },
    ],
    socioEconomicDevelopment: [{ criteria: 'SED contributions', points: 12, target: '1% NPAT', formula: NPAT('1%', 12) }],
  },

  'FSC:Generic': {
    ownership: [
      { criteria: 'Voting rights — Black', points: 4, target: '25%', formula: PROP },
      { criteria: 'Voting rights — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Economic interest — Black', points: 4, target: '25%', formula: PROP },
      { criteria: 'Economic interest — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Net Value', points: 8, target: '100%', formula: 'Year-graduated net value' },
      { criteria: 'Black new entrants', points: 2, target: '2%', formula: PROP, isBonus: true },
      { criteria: 'Designated groups / schemes', points: 3, target: '3%', formula: PROP },
    ],
    managementControl: [
      // FS200: board black voting = 1 point (audit 2026-07-26 item 9).
      { criteria: 'Black board members', points: 1, target: '50%', formula: PROP },
      { criteria: 'Black women board members', points: 1, target: '25%', formula: PROP },
      { criteria: 'Black executive directors', points: 2, target: '50%', formula: PROP },
      { criteria: 'Black female executive directors', points: 1, target: '25%', formula: PROP },
      { criteria: 'Black other executive management', points: 10, target: '75%', formula: PROP },
      { criteria: 'Black female other executive management', points: 4, target: '38%', formula: PROP },
      { criteria: 'Black employees with disabilities', points: 1, target: '2%', formula: PROP },
    ],
    skillsDevelopment: [
      { criteria: 'SD — executive level', points: 2, target: 'banded', formula: PROP },
      { criteria: 'SD — senior management', points: 2, target: 'banded', formula: PROP },
      { criteria: 'SD — middle management', points: 3, target: 'banded', formula: PROP },
      { criteria: 'SD — junior management', points: 4, target: 'banded', formula: PROP },
      { criteria: 'SD — employees', points: 4, target: 'banded', formula: PROP },
      { criteria: 'SD — disabled', points: 1, target: 'banded', formula: PROP },
      { criteria: 'Bursaries', points: 4, target: 'banded', formula: PROP },
      { criteria: 'Absorption / other', points: 3, target: 'banded', formula: PROP },
    ],
    preferentialProcurement: [
      { criteria: 'All empowering suppliers', points: 5, target: '80%', formula: PROP },
      { criteria: 'QSE suppliers', points: 3, target: '15%', formula: PROP },
      { criteria: 'EME suppliers', points: 2, target: '15%', formula: PROP },
      { criteria: '≥51% Black-owned', points: 7, target: '50%', formula: PROP },
      { criteria: '≥30% Black women owned', points: 3, target: '12%', formula: PROP },
      { criteria: 'Designated group row 1', points: 2, target: '2%', formula: PROP },
      { criteria: 'Designated group row 2', points: 2, target: '2%', formula: PROP, isBonus: true },
    ],
    supplierDevelopment: [{ criteria: 'SD contributions', points: 10, target: '2% NPAT', formula: NPAT('2%', 10) }],
    enterpriseDevelopment: [
      { criteria: 'ED contributions', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) },
      { criteria: 'Graduation bonus', points: 1, target: 'yes/no', formula: '+1 pt', isBonus: true },
      { criteria: 'ED bonus rows', points: 3, target: 'yes/no', formula: '+3 pts combined bonus', isBonus: true },
    ],
    socioEconomicDevelopment: [
      { criteria: 'SED', points: 3, target: '1% NPAT', formula: NPAT('1%', 3) },
      { criteria: 'Consumer Education', points: 2, target: 'qualifying', formula: PROP },
      { criteria: 'SED bonus', points: 3, target: 'qualifying', formula: PROP, isBonus: true },
    ],
  },

  'AGRI:Generic': {
    ownership: [
      { criteria: 'Voting rights — Black', points: 5, target: '25%', formula: PROP },
      { criteria: 'Voting rights — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Economic interest — Black', points: 5, target: '25%', formula: PROP },
      { criteria: 'Economic interest — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Net Value', points: 8, target: '100%', formula: 'Year-graduated net value' },
      { criteria: 'Black new entrants / designated groups', points: 3, target: '2%', formula: PROP, isBonus: true },
    ],
    managementControl: [
      { criteria: 'Black board members', points: 2, /* GG 41306 (audit item 11) */ target: '50%', formula: PROP },
      { criteria: 'Black women board members', points: 1, target: '25%', formula: PROP },
      { criteria: 'Black executive directors', points: 2, target: '50%', formula: PROP },
      { criteria: 'Black female executive directors', points: 1, target: '25%', formula: PROP },
      { criteria: 'Black other executive management', points: 2, target: '60%', formula: PROP },
      { criteria: 'Black female other executive management', points: 1, target: '30%', formula: PROP },
      { criteria: 'EAP-banded staff + disabled', points: 10, target: 'EAP-based', formula: PROP },
    ],
    skillsDevelopment: [
      { criteria: 'Learning programmes for Black people', points: 8, target: '3% leviable', formula: PROP },
      { criteria: 'Bursaries — Black', points: 4, target: '1%', formula: PROP },
      { criteria: 'Disabled learning programmes', points: 4, target: '0.15%', formula: PROP },
      { criteria: 'Learnerships / B/C/D', points: 4, target: '5% headcount', formula: PROP },
      { criteria: 'Absorption', points: 5, target: '2.5%', formula: PROP, isBonus: true },
    ],
    preferentialProcurement: [
      { criteria: 'All empowering suppliers', points: 5, target: '80%', formula: PROP },
      { criteria: 'QSE suppliers', points: 3, target: '15%', formula: PROP },
      { criteria: 'EME suppliers', points: 4, target: '15%', formula: PROP },
      { criteria: '≥51% Black-owned', points: 9, target: '50%', formula: PROP },
      { criteria: '≥30% Black women owned', points: 4, target: '12%', formula: PROP },
      { criteria: 'Designated group suppliers', points: 2, target: '2%', formula: PROP, isBonus: true },
    ],
    supplierDevelopment: [{ criteria: 'SD contributions', points: 10, target: '2% NPAT', formula: NPAT('2%', 10) }],
    enterpriseDevelopment: [
      { criteria: 'ED contributions', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) },
      { criteria: 'Graduation bonus', points: 1, target: 'yes/no', formula: '+1 pt', isBonus: true },
      { criteria: 'Jobs created bonus', points: 1, target: 'yes/no', formula: '+1 pt', isBonus: true },
    ],
    socioEconomicDevelopment: [{ criteria: 'Agriculture community development', points: 15, target: '1% NPAT', formula: NPAT('1%', 15) }],
  },

  'TRANSPORT:Generic': {
    ownership: [
      { criteria: 'Voting rights — Black people', points: 3, target: '25% + 1 vote', formula: PROP },
      { criteria: 'Voting rights — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Economic interest — Black', points: 4, target: '25%', formula: PROP },
      { criteria: 'Economic interest — Black women', points: 2, target: '10%', formula: PROP },
      { criteria: 'Economic interest — designated / ESOP / BBOS / co-ops', points: 1, target: '2.5%', formula: PROP },
      { criteria: 'Net Value', points: 7, target: '60%', formula: 'Year-graduated net value' },
      { criteria: 'Ownership Fulfilment', points: 1, target: 'yes', formula: 'Full points if fulfilled' },
      { criteria: 'Bonus — Black New Entrants', points: 2, target: '10%', formula: PROP, isBonus: true },
      { criteria: 'Bonus — ESOP / BBOS / co-ops', points: 2, target: '10%', formula: PROP, isBonus: true },
    ],
    managementControl: [
      { criteria: 'Black board (voting rights)', points: 1.5, target: '50%', formula: PROP },
      { criteria: 'Black women board (voting rights)', points: 1.5, target: '25%', formula: PROP },
      { criteria: 'Black executive directors', points: 1, target: '50%', formula: PROP },
      { criteria: 'Black women executive directors', points: 1, target: '25%', formula: PROP },
      { criteria: 'Black senior top management', points: 1.5, target: '40%', formula: PROP },
      { criteria: 'Black women senior top management', points: 1.5, target: '20%', formula: PROP },
      { criteria: 'Black other top management', points: 1, target: '40%', formula: PROP },
      { criteria: 'Black women other top management', points: 1, target: '20%', formula: PROP },
      { criteria: 'Bonus — Black independent non-exec board', points: 1, target: '40%', formula: PROP, isBonus: true },
    ],
    employmentEquity: [
      { criteria: 'Black senior management', points: 2.5, target: '43%', formula: PROP },
      { criteria: 'Black women senior management', points: 2.5, target: '22%', formula: PROP },
      { criteria: 'Black middle management', points: 1.5, target: '63%', formula: PROP },
      { criteria: 'Black women middle management', points: 1.5, target: '32%', formula: PROP },
      { criteria: 'Black junior management', points: 1.5, target: '68%', formula: PROP },
      { criteria: 'Black women junior management', points: 1.5, target: '34%', formula: PROP },
      { criteria: 'Black women semi/unskilled', points: 2, target: '15%', formula: PROP },
      { criteria: 'Black people with disabilities', points: 1, target: '2%', formula: PROP },
      { criteria: 'Black women with disabilities', points: 1, target: '1%', formula: PROP },
      { criteria: 'Bonus — meet/exceed EAP targets', points: 3, target: 'yes', formula: 'Full points if EAP met/exceeded', isBonus: true },
    ],
    skillsDevelopment: [
      { criteria: 'SD spend on Black employees (% leviable)', points: 3, target: '3%', formula: PROP },
      { criteria: 'SD spend on Black women employees (% leviable)', points: 3, target: '1.5%', formula: PROP },
      { criteria: 'SD spend on Black disabled employees', points: 1.5, target: '0.3%', formula: PROP },
      { criteria: 'SD spend on Black women disabled employees', points: 1.5, target: '0.15%', formula: PROP },
      { criteria: 'Black employees in B/C/D programmes (% headcount)', points: 3, target: '5%', formula: PROP },
      { criteria: 'Black women employees in B/C/D programmes', points: 3, target: '2.5%', formula: PROP },
    ],
    preferentialProcurement: [
      { criteria: 'B-BBEE compliant suppliers (% TMPS)', points: 12, target: '50%', formula: PROP },
      { criteria: 'EME + QSE suppliers', points: 3, target: '10%', formula: PROP },
      { criteria: '50% Black-owned suppliers', points: 3, target: '9%', formula: PROP },
      { criteria: '30% Black women-owned suppliers', points: 2, target: '6%', formula: PROP },
    ],
    supplierDevelopment: [
      {
        criteria: 'Supplier development initiatives (% NPAT) — toolkit labels "Enterprise Development"',
        points: 15,
        target: '3% NPAT',
        formula: NPAT('3%', 15),
      },
    ],
    socioEconomicDevelopment: [
      { criteria: 'Social development programmes (% NPAT)', points: 5, target: '1% NPAT', formula: NPAT('1%', 5) },
    ],
  },

  'TRANSPORT:QSE': {
    ownership: [
      { criteria: 'Voting rights — Black', points: 6, target: '25% + 1 vote', formula: PROP },
      { criteria: 'Economic interest — Black', points: 9, target: '25%', formula: PROP },
      { criteria: 'Ownership fulfilment', points: 1, target: 'yes', formula: 'Full points if fulfilled' },
      { criteria: 'Net Value', points: 9, target: '60%', formula: 'Year-graduated net value' },
      { criteria: 'Bonus — Black women', points: 2, target: '10%', formula: PROP, isBonus: true },
      { criteria: 'Bonus — Black ESOP/BBOS/co-ops', points: 1, target: '10%', formula: PROP, isBonus: true },
    ],
    managementControl: [
      { criteria: 'Black representation at top management', points: 25, target: '50.1%', formula: PROP },
      { criteria: 'Bonus — Black women at top management', points: 2, target: '25%', formula: PROP, isBonus: true },
    ],
    employmentEquity: [
      { criteria: 'Black employees as % of all management', points: 7.5, target: '40%', formula: PROP },
      { criteria: 'Black women as % of all management', points: 7.5, target: '20%', formula: PROP },
      { criteria: 'Black employees as % of total employees', points: 5, target: '60%', formula: PROP },
      { criteria: 'Black women as % of total employees', points: 5, target: '30%', formula: PROP },
      { criteria: 'Bonus — meet/exceed EAP per category', points: 2, target: 'yes', formula: 'Full points if EAP met', isBonus: true },
    ],
    skillsDevelopment: [
      { criteria: 'SD on Black employees (% leviable)', points: 12.5, target: '2%', formula: PROP },
      { criteria: 'SD on Black women employees (% leviable)', points: 12.5, target: '1%', formula: PROP },
    ],
    preferentialProcurement: [
      { criteria: 'Procurement spend from B-BBEE suppliers', points: 25, target: '40% TMPS', formula: PROP },
    ],
    enterpriseDevelopment: [{ criteria: 'Qualifying contributions (% NPAT)', points: 25, target: '2% NPAT', formula: NPAT('2%', 25) }],
    socioEconomicDevelopment: [{ criteria: 'Qualifying contributions (% NPAT)', points: 25, target: '1% NPAT', formula: NPAT('1%', 25) }],
  },
};

export function sectorSubElementKey(sectorCode: string, scorecardType: string): string {
  return `${sectorCode.toUpperCase()}:${scorecardType}`;
}

export function getSectorPillarSubElements(
  sectorCode: string,
  scorecardType: string,
  pillarKey: string,
): PillarSubElement[] {
  const map = SECTOR_PILLAR_SUB_ELEMENTS[sectorSubElementKey(sectorCode, scorecardType)];
  return map?.[pillarKey] ?? [];
}

export function getAllSectorPillarSubElements(
  sectorCode: string,
  scorecardType: string,
): SectorPillarMap {
  return SECTOR_PILLAR_SUB_ELEMENTS[sectorSubElementKey(sectorCode, scorecardType)] ?? {};
}

/** Ledger grand totals per sector (for integrity tests). */
export const LEDGER_GRAND_TOTALS: Record<string, number> = {
  'RCOGP:Generic': 120,
  'RCOGP:QSE': 108,
  'ICT:Generic': 140,
  'ICT:QSE': 116,
  // Gazette values (audit 2026-07-26, docs/calculator-audit-2026-07-26.md):
  // FSC Others MC is 20 per FS200 (item 9) → 119; AgriBEE MC is 19 per
  // GG 41306 (item 11) → 128; FSC QSFI (GG 41287 §8.2) = 100.
  'FSC:Generic': 119,
  'FSC:QSE': 100,
  'AGRI:Generic': 128,
  'TRANSPORT:Generic': 108,
  // Any four of the seven elements × 25. Was 107, carried over from a
  // "82 compulsory + one elective" reading that the sector code does not state
  // and whose cited source (docs/SECTOR_TRUTH_LEDGER.md) is not in the repo.
  // Corrected against certificate 13609 (Thandanani Transport, 30 Jan 2026),
  // which scores 102 → Level 1 — impossible on a 107 denominator with EE forced
  // in. See __tests__/transportQseScorecard.test.ts.
  'TRANSPORT:QSE': 100,
  'CONSTRUCTION:QSE': 110,
  'CONSTRUCTION:Contractor': 123,
  'CONSTRUCTION:BEP': 123,
};
