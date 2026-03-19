/**
 * Template Ingester
 *
 * Ingests B-BBEE toolkit Excel templates into ArangoDB as the
 * "ground truth" knowledge base. Each toolkit becomes:
 * - A scorecard template (with level thresholds)
 * - Pillars (with max points and sub-minimum rules)
 * - Indicators (with compliance targets per sector)
 * - A formula dependency graph
 *
 * Supports all 6 toolkit types:
 *   1. RCOGP Generic
 *   2. ICT Generic
 *   3. ICT QSE
 *   4. RCOGP QSE
 *   5. FSC Generic
 *   6. Agri Generic
 */

import * as fs from 'fs';
import { buildFormulaGraph, extractScorecardSubgraph } from '../../pipeline/formulaGraphBuilder.js';
import { ScorecardRepository, GraphRepository } from '../repositories/index.js';
import type { ScorecardTemplate, Pillar, Indicator, ComplianceTarget } from '../repositories/index.js';

// ---------------------------------------------------------------------------
// Scorecard definitions (the B-BBEE domain knowledge)
// ---------------------------------------------------------------------------

const LEVEL_THRESHOLDS = [
  { level: 1, minPoints: 100, recognition: 135 },
  { level: 2, minPoints: 95, recognition: 125 },
  { level: 3, minPoints: 90, recognition: 110 },
  { level: 4, minPoints: 80, recognition: 100 },
  { level: 5, minPoints: 75, recognition: 80 },
  { level: 6, minPoints: 70, recognition: 60 },
  { level: 7, minPoints: 55, recognition: 50 },
  { level: 8, minPoints: 40, recognition: 10 },
];

interface PillarDef {
  name: string;
  code: string;
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;
  displayOrder: number;
  indicators: IndicatorDef[];
}

interface IndicatorDef {
  name: string;
  code: string;
  maxPoints: number;
  description: string;
  targets: Array<{
    targetValue: number;
    targetUnit: ComplianceTarget['targetUnit'];
    targetBase: string;
    weighting: number;
  }>;
}

const RCOGP_GENERIC_PILLARS: PillarDef[] = [
  {
    name: 'Ownership',
    code: 'ownership',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 1,
    indicators: [
      { name: 'Voting Rights (Black)', code: 'own_voting_black', maxPoints: 4, description: 'Exercisable voting rights in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 4 }] },
      { name: 'Voting Rights (Black Women)', code: 'own_voting_bw', maxPoints: 2, description: 'Exercisable voting rights in the hands of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 2 }] },
      { name: 'Economic Interest (Black)', code: 'own_ei_black', maxPoints: 8, description: 'Economic interest of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 8 }] },
      { name: 'Economic Interest (Black Women)', code: 'own_ei_bw', maxPoints: 2, description: 'Economic interest of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 2 }] },
      { name: 'Net Value', code: 'own_net_value', maxPoints: 8, description: 'Net value of ownership in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'net_value', weighting: 8 }] },
      { name: 'New Entrants', code: 'own_new_entrants', maxPoints: 1, description: 'New entrants to ownership by black people', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 1 }] },
    ],
  },
  {
    name: 'Management Control',
    code: 'managementControl',
    maxPoints: 8,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 2,
    indicators: [
      { name: 'Board Participation (Black)', code: 'mc_board_black', maxPoints: 1, description: 'Black board members as % of all board members', targets: [{ targetValue: 0.50, targetUnit: 'percentage', targetBase: 'board_count', weighting: 1 }] },
      { name: 'Board Participation (Black Women)', code: 'mc_board_bw', maxPoints: 1, description: 'Black women board members', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'board_count', weighting: 1 }] },
      { name: 'Executive Management (Black)', code: 'mc_exec_black', maxPoints: 2, description: 'Black executive management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 2 }] },
      { name: 'Executive Management (Black Women)', code: 'mc_exec_bw', maxPoints: 2, description: 'Black women executive management', targets: [{ targetValue: 0.30, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 2 }] },
      { name: 'Independent Non-Executive Directors', code: 'mc_ined', maxPoints: 2, description: 'Independent non-executive directors', targets: [{ targetValue: 0.40, targetUnit: 'percentage', targetBase: 'board_count', weighting: 2 }] },
    ],
  },
  {
    name: 'Employment Equity',
    code: 'employmentEquity',
    maxPoints: 11,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 3,
    indicators: [
      { name: 'Senior Management (Black)', code: 'ee_senior', maxPoints: 5, description: 'Black people in senior management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'senior_count', weighting: 5 }] },
      { name: 'Middle Management (Black)', code: 'ee_middle', maxPoints: 4, description: 'Black people in middle management', targets: [{ targetValue: 0.75, targetUnit: 'percentage', targetBase: 'middle_count', weighting: 4 }] },
      { name: 'Junior Management (Black)', code: 'ee_junior', maxPoints: 4, description: 'Black people in junior management', targets: [{ targetValue: 0.88, targetUnit: 'percentage', targetBase: 'junior_count', weighting: 4 }] },
      { name: 'Disabled Employees', code: 'ee_disabled', maxPoints: 2, description: 'Employees with disabilities', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'total_employees', weighting: 2 }] },
    ],
  },
  {
    name: 'Skills Development',
    code: 'skillsDevelopment',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 4,
    indicators: [
      { name: 'Skills Development Spend (Black)', code: 'sd_spend_black', maxPoints: 20, description: 'Training spend on black employees', targets: [{ targetValue: 0.035, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 20 }] },
      { name: 'Bursaries', code: 'sd_bursaries', maxPoints: 5, description: 'Bursaries for black students', targets: [{ targetValue: 0.025, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 5 }] },
    ],
  },
  {
    name: 'Preferential Procurement',
    code: 'preferentialProcurement',
    maxPoints: 27,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 5,
    indicators: [
      { name: 'All Suppliers', code: 'pp_all', maxPoints: 5, description: 'B-BBEE compliant procurement from all suppliers', targets: [{ targetValue: 0.80, targetUnit: 'percentage', targetBase: 'tmps', weighting: 5 }] },
      { name: 'QSE Suppliers', code: 'pp_qse', maxPoints: 3, description: 'Procurement from qualifying small enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 3 }] },
      { name: 'EME Suppliers', code: 'pp_eme', maxPoints: 4, description: 'Procurement from exempted micro enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
      { name: '51% BO Suppliers', code: 'pp_51bo', maxPoints: 10, description: 'Procurement from 51% black owned suppliers', targets: [{ targetValue: 0.40, targetUnit: 'percentage', targetBase: 'tmps', weighting: 10 }] },
      { name: '30% BWO Suppliers', code: 'pp_30bwo', maxPoints: 5, description: 'Procurement from 30% black women owned suppliers', targets: [{ targetValue: 0.12, targetUnit: 'percentage', targetBase: 'tmps', weighting: 5 }] },
    ],
  },
  {
    name: 'Enterprise & Supplier Development',
    code: 'enterpriseSupplierDevelopment',
    maxPoints: 15,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 6,
    indicators: [
      { name: 'Supplier Development', code: 'esd_sd', maxPoints: 10, description: 'Annual contributions to supplier development', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'npat', weighting: 10 }] },
      { name: 'Enterprise Development', code: 'esd_ed', maxPoints: 5, description: 'Annual contributions to enterprise development', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
  {
    name: 'Socio-Economic Development',
    code: 'socioEconomicDevelopment',
    maxPoints: 5,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 7,
    indicators: [
      { name: 'SED Contributions', code: 'sed_spend', maxPoints: 5, description: 'Socio-economic development contributions', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
];

// ---------------------------------------------------------------------------
// ICT Generic Scorecard
// ---------------------------------------------------------------------------

const ICT_GENERIC_PILLARS: PillarDef[] = [
  {
    name: 'Ownership',
    code: 'ownership',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 1,
    indicators: [
      { name: 'Voting Rights (Black)', code: 'own_voting_black', maxPoints: 4, description: 'Exercisable voting rights in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 4 }] },
      { name: 'Voting Rights (Black Women)', code: 'own_voting_bw', maxPoints: 2, description: 'Exercisable voting rights in the hands of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 2 }] },
      { name: 'Economic Interest (Black)', code: 'own_ei_black', maxPoints: 8, description: 'Economic interest of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 8 }] },
      { name: 'Economic Interest (Black Women)', code: 'own_ei_bw', maxPoints: 2, description: 'Economic interest of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 2 }] },
      { name: 'Net Value', code: 'own_net_value', maxPoints: 8, description: 'Net value of ownership in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'net_value', weighting: 8 }] },
      { name: 'New Entrants', code: 'own_new_entrants', maxPoints: 1, description: 'New entrants to ownership by black people', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 1 }] },
    ],
  },
  {
    name: 'Management Control',
    code: 'managementControl',
    maxPoints: 8,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 2,
    indicators: [
      { name: 'Board Participation (Black)', code: 'mc_board_black', maxPoints: 2, description: 'Black board members as % of all board members', targets: [{ targetValue: 0.50, targetUnit: 'percentage', targetBase: 'board_count', weighting: 2 }] },
      { name: 'Board Participation (Black Women)', code: 'mc_board_bw', maxPoints: 1, description: 'Black women board members', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'board_count', weighting: 1 }] },
      { name: 'Executive Management (Black)', code: 'mc_exec_black', maxPoints: 3, description: 'Black executive management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 3 }] },
      { name: 'Executive Management (Black Women)', code: 'mc_exec_bw', maxPoints: 2, description: 'Black women executive management', targets: [{ targetValue: 0.30, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 2 }] },
    ],
  },
  {
    name: 'Employment Equity',
    code: 'employmentEquity',
    maxPoints: 15,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 3,
    indicators: [
      { name: 'Senior Management (Black)', code: 'ee_senior', maxPoints: 6, description: 'Black people in senior management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'senior_count', weighting: 6 }] },
      { name: 'Middle Management (Black)', code: 'ee_middle', maxPoints: 5, description: 'Black people in middle management', targets: [{ targetValue: 0.75, targetUnit: 'percentage', targetBase: 'middle_count', weighting: 5 }] },
      { name: 'Junior Management (Black)', code: 'ee_junior', maxPoints: 2, description: 'Black people in junior management', targets: [{ targetValue: 0.88, targetUnit: 'percentage', targetBase: 'junior_count', weighting: 2 }] },
      { name: 'Disabled Employees', code: 'ee_disabled', maxPoints: 2, description: 'Employees with disabilities', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'total_employees', weighting: 2 }] },
    ],
  },
  {
    name: 'Skills Development',
    code: 'skillsDevelopment',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 4,
    indicators: [
      { name: 'Skills Development Spend (Black)', code: 'sd_spend_black', maxPoints: 20, description: 'Training spend on black employees', targets: [{ targetValue: 0.035, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 20 }] },
      { name: 'Bursaries', code: 'sd_bursaries', maxPoints: 5, description: 'Bursaries for black students', targets: [{ targetValue: 0.025, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 5 }] },
    ],
  },
  {
    name: 'Preferential Procurement',
    code: 'preferentialProcurement',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 5,
    indicators: [
      { name: 'All Suppliers', code: 'pp_all', maxPoints: 5, description: 'B-BBEE compliant procurement from all suppliers', targets: [{ targetValue: 0.80, targetUnit: 'percentage', targetBase: 'tmps', weighting: 5 }] },
      { name: 'QSE Suppliers', code: 'pp_qse', maxPoints: 3, description: 'Procurement from qualifying small enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 3 }] },
      { name: 'EME Suppliers', code: 'pp_eme', maxPoints: 4, description: 'Procurement from exempted micro enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
      { name: '51% BO Suppliers', code: 'pp_51bo', maxPoints: 9, description: 'Procurement from 51% black owned suppliers', targets: [{ targetValue: 0.40, targetUnit: 'percentage', targetBase: 'tmps', weighting: 9 }] },
      { name: '30% BWO Suppliers', code: 'pp_30bwo', maxPoints: 4, description: 'Procurement from 30% black women owned suppliers', targets: [{ targetValue: 0.12, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
    ],
  },
  {
    name: 'Enterprise & Supplier Development',
    code: 'enterpriseSupplierDevelopment',
    maxPoints: 15,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 6,
    indicators: [
      { name: 'Supplier Development', code: 'esd_sd', maxPoints: 10, description: 'Annual contributions to supplier development', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'npat', weighting: 10 }] },
      { name: 'Enterprise Development', code: 'esd_ed', maxPoints: 5, description: 'Annual contributions to enterprise development', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
  {
    name: 'Socio-Economic Development',
    code: 'socioEconomicDevelopment',
    maxPoints: 5,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 7,
    indicators: [
      { name: 'SED Contributions', code: 'sed_spend', maxPoints: 5, description: 'Socio-economic development contributions', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
];

// ---------------------------------------------------------------------------
// FSC Generic Scorecard
// ---------------------------------------------------------------------------

const FSC_GENERIC_PILLARS: PillarDef[] = [
  {
    name: 'Ownership',
    code: 'ownership',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 1,
    indicators: [
      { name: 'Voting Rights (Black)', code: 'own_voting_black', maxPoints: 4, description: 'Exercisable voting rights in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 4 }] },
      { name: 'Voting Rights (Black Women)', code: 'own_voting_bw', maxPoints: 2, description: 'Exercisable voting rights in the hands of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 2 }] },
      { name: 'Economic Interest (Black)', code: 'own_ei_black', maxPoints: 8, description: 'Economic interest of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 8 }] },
      { name: 'Economic Interest (Black Women)', code: 'own_ei_bw', maxPoints: 2, description: 'Economic interest of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 2 }] },
      { name: 'Net Value', code: 'own_net_value', maxPoints: 8, description: 'Net value of ownership in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'net_value', weighting: 8 }] },
      { name: 'New Entrants', code: 'own_new_entrants', maxPoints: 1, description: 'New entrants to ownership by black people', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 1 }] },
    ],
  },
  {
    name: 'Management Control',
    code: 'managementControl',
    maxPoints: 8,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 2,
    indicators: [
      { name: 'Board Participation (Black)', code: 'mc_board_black', maxPoints: 2, description: 'Black board members as % of all board members', targets: [{ targetValue: 0.50, targetUnit: 'percentage', targetBase: 'board_count', weighting: 2 }] },
      { name: 'Board Participation (Black Women)', code: 'mc_board_bw', maxPoints: 1, description: 'Black women board members', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'board_count', weighting: 1 }] },
      { name: 'Executive Management (Black)', code: 'mc_exec_black', maxPoints: 3, description: 'Black executive management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 3 }] },
      { name: 'Executive Management (Black Women)', code: 'mc_exec_bw', maxPoints: 2, description: 'Black women executive management', targets: [{ targetValue: 0.30, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 2 }] },
    ],
  },
  {
    name: 'Employment Equity',
    code: 'employmentEquity',
    maxPoints: 12,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 3,
    indicators: [
      { name: 'Senior Management (Black)', code: 'ee_senior', maxPoints: 5, description: 'Black people in senior management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'senior_count', weighting: 5 }] },
      { name: 'Middle Management (Black)', code: 'ee_middle', maxPoints: 4, description: 'Black people in middle management', targets: [{ targetValue: 0.75, targetUnit: 'percentage', targetBase: 'middle_count', weighting: 4 }] },
      { name: 'Junior Management (Black)', code: 'ee_junior', maxPoints: 2, description: 'Black people in junior management', targets: [{ targetValue: 0.88, targetUnit: 'percentage', targetBase: 'junior_count', weighting: 2 }] },
      { name: 'Disabled Employees', code: 'ee_disabled', maxPoints: 1, description: 'Employees with disabilities', targets: [{ targetValue: 0.03, targetUnit: 'percentage', targetBase: 'total_employees', weighting: 1 }] },
    ],
  },
  {
    name: 'Skills Development',
    code: 'skillsDevelopment',
    maxPoints: 20,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 4,
    indicators: [
      { name: 'Skills Development Spend (Black)', code: 'sd_spend_black', maxPoints: 15, description: 'Training spend on black employees', targets: [{ targetValue: 0.035, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 15 }] },
      { name: 'Bursaries', code: 'sd_bursaries', maxPoints: 5, description: 'Bursaries for black students', targets: [{ targetValue: 0.025, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 5 }] },
    ],
  },
  {
    name: 'Preferential Procurement',
    code: 'preferentialProcurement',
    maxPoints: 20,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 5,
    indicators: [
      { name: 'All Suppliers', code: 'pp_all', maxPoints: 5, description: 'B-BBEE compliant procurement from all suppliers', targets: [{ targetValue: 0.80, targetUnit: 'percentage', targetBase: 'tmps', weighting: 5 }] },
      { name: 'QSE Suppliers', code: 'pp_qse', maxPoints: 3, description: 'Procurement from qualifying small enterprises', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'tmps', weighting: 3 }] },
      { name: 'EME Suppliers', code: 'pp_eme', maxPoints: 3, description: 'Procurement from exempted micro enterprises', targets: [{ targetValue: 0.12, targetUnit: 'percentage', targetBase: 'tmps', weighting: 3 }] },
      { name: '51% BO Suppliers', code: 'pp_51bo', maxPoints: 5, description: 'Procurement from 51% black owned suppliers', targets: [{ targetValue: 0.30, targetUnit: 'percentage', targetBase: 'tmps', weighting: 5 }] },
      { name: '30% BWO Suppliers', code: 'pp_30bwo', maxPoints: 4, description: 'Procurement from 30% black women owned suppliers', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
    ],
  },
  {
    name: 'Enterprise & Supplier Development',
    code: 'enterpriseSupplierDevelopment',
    maxPoints: 15,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 6,
    indicators: [
      { name: 'Supplier Development', code: 'esd_sd', maxPoints: 10, description: 'Annual contributions to supplier development', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'npat', weighting: 10 }] },
      { name: 'Enterprise Development', code: 'esd_ed', maxPoints: 5, description: 'Annual contributions to enterprise development', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
  {
    name: 'Socio-Economic Development',
    code: 'socioEconomicDevelopment',
    maxPoints: 5,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 7,
    indicators: [
      { name: 'SED Contributions', code: 'sed_spend', maxPoints: 5, description: 'Socio-economic development contributions', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Agri Generic Scorecard
// ---------------------------------------------------------------------------

const AGRI_GENERIC_PILLARS: PillarDef[] = [
  {
    name: 'Ownership',
    code: 'ownership',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 1,
    indicators: [
      { name: 'Voting Rights (Black)', code: 'own_voting_black', maxPoints: 4, description: 'Exercisable voting rights in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 4 }] },
      { name: 'Voting Rights (Black Women)', code: 'own_voting_bw', maxPoints: 2, description: 'Exercisable voting rights in the hands of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 2 }] },
      { name: 'Economic Interest (Black)', code: 'own_ei_black', maxPoints: 8, description: 'Economic interest of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 8 }] },
      { name: 'Economic Interest (Black Women)', code: 'own_ei_bw', maxPoints: 2, description: 'Economic interest of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 2 }] },
      { name: 'Net Value', code: 'own_net_value', maxPoints: 8, description: 'Net value of ownership in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'net_value', weighting: 8 }] },
      { name: 'New Entrants', code: 'own_new_entrants', maxPoints: 1, description: 'New entrants to ownership by black people', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 1 }] },
    ],
  },
  {
    name: 'Management Control',
    code: 'managementControl',
    maxPoints: 8,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 2,
    indicators: [
      { name: 'Board Participation (Black)', code: 'mc_board_black', maxPoints: 1, description: 'Black board members as % of all board members', targets: [{ targetValue: 0.50, targetUnit: 'percentage', targetBase: 'board_count', weighting: 1 }] },
      { name: 'Board Participation (Black Women)', code: 'mc_board_bw', maxPoints: 1, description: 'Black women board members', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'board_count', weighting: 1 }] },
      { name: 'Executive Management (Black)', code: 'mc_exec_black', maxPoints: 2, description: 'Black executive management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 2 }] },
      { name: 'Executive Management (Black Women)', code: 'mc_exec_bw', maxPoints: 2, description: 'Black women executive management', targets: [{ targetValue: 0.30, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 2 }] },
      { name: 'Independent Non-Executive Directors', code: 'mc_ined', maxPoints: 2, description: 'Independent non-executive directors', targets: [{ targetValue: 0.40, targetUnit: 'percentage', targetBase: 'board_count', weighting: 2 }] },
    ],
  },
  {
    name: 'Employment Equity',
    code: 'employmentEquity',
    maxPoints: 11,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 3,
    indicators: [
      { name: 'Senior Management (Black)', code: 'ee_senior', maxPoints: 5, description: 'Black people in senior management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'senior_count', weighting: 5 }] },
      { name: 'Middle Management (Black)', code: 'ee_middle', maxPoints: 4, description: 'Black people in middle management', targets: [{ targetValue: 0.75, targetUnit: 'percentage', targetBase: 'middle_count', weighting: 4 }] },
      { name: 'Junior Management (Black)', code: 'ee_junior', maxPoints: 4, description: 'Black people in junior management', targets: [{ targetValue: 0.88, targetUnit: 'percentage', targetBase: 'junior_count', weighting: 4 }] },
      { name: 'Disabled Employees', code: 'ee_disabled', maxPoints: 2, description: 'Employees with disabilities', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'total_employees', weighting: 2 }] },
    ],
  },
  {
    name: 'Skills Development',
    code: 'skillsDevelopment',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 4,
    indicators: [
      { name: 'Skills Development Spend (Black)', code: 'sd_spend_black', maxPoints: 20, description: 'Training spend on black employees', targets: [{ targetValue: 0.035, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 20 }] },
      { name: 'Bursaries', code: 'sd_bursaries', maxPoints: 5, description: 'Bursaries for black students', targets: [{ targetValue: 0.025, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 5 }] },
    ],
  },
  {
    name: 'Preferential Procurement',
    code: 'preferentialProcurement',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 5,
    indicators: [
      { name: 'All Suppliers', code: 'pp_all', maxPoints: 5, description: 'B-BBEE compliant procurement from all suppliers', targets: [{ targetValue: 0.80, targetUnit: 'percentage', targetBase: 'tmps', weighting: 5 }] },
      { name: 'QSE Suppliers', code: 'pp_qse', maxPoints: 3, description: 'Procurement from qualifying small enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 3 }] },
      { name: 'EME Suppliers', code: 'pp_eme', maxPoints: 4, description: 'Procurement from exempted micro enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
      { name: '51% BO Suppliers', code: 'pp_51bo', maxPoints: 9, description: 'Procurement from 51% black owned suppliers', targets: [{ targetValue: 0.40, targetUnit: 'percentage', targetBase: 'tmps', weighting: 9 }] },
      { name: '30% BWO Suppliers', code: 'pp_30bwo', maxPoints: 4, description: 'Procurement from 30% black women owned suppliers', targets: [{ targetValue: 0.12, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
    ],
  },
  {
    name: 'Enterprise & Supplier Development',
    code: 'enterpriseSupplierDevelopment',
    maxPoints: 15,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 6,
    indicators: [
      { name: 'Supplier Development', code: 'esd_sd', maxPoints: 10, description: 'Annual contributions to supplier development', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'npat', weighting: 10 }] },
      { name: 'Enterprise Development', code: 'esd_ed', maxPoints: 5, description: 'Annual contributions to enterprise development', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
  {
    name: 'Socio-Economic Development',
    code: 'socioEconomicDevelopment',
    maxPoints: 5,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 7,
    indicators: [
      { name: 'SED Contributions', code: 'sed_spend', maxPoints: 5, description: 'Socio-economic development contributions', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
];

// ---------------------------------------------------------------------------
// RCOGP QSE Scorecard (MC + EE combined into a single pillar)
// ---------------------------------------------------------------------------

const RCOGP_QSE_PILLARS: PillarDef[] = [
  {
    name: 'Ownership',
    code: 'ownership',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 1,
    indicators: [
      { name: 'Voting Rights (Black)', code: 'own_voting_black', maxPoints: 4, description: 'Exercisable voting rights in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 4 }] },
      { name: 'Voting Rights (Black Women)', code: 'own_voting_bw', maxPoints: 2, description: 'Exercisable voting rights in the hands of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 2 }] },
      { name: 'Economic Interest (Black)', code: 'own_ei_black', maxPoints: 8, description: 'Economic interest of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 8 }] },
      { name: 'Economic Interest (Black Women)', code: 'own_ei_bw', maxPoints: 2, description: 'Economic interest of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 2 }] },
      { name: 'Net Value', code: 'own_net_value', maxPoints: 8, description: 'Net value of ownership in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'net_value', weighting: 8 }] },
      { name: 'New Entrants', code: 'own_new_entrants', maxPoints: 1, description: 'New entrants to ownership by black people', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 1 }] },
    ],
  },
  {
    name: 'Management Control & Employment Equity',
    code: 'managementControl',
    maxPoints: 19,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 2,
    indicators: [
      { name: 'Board Participation (Black)', code: 'mc_board_black', maxPoints: 3, description: 'Black board members as % of all board members', targets: [{ targetValue: 0.50, targetUnit: 'percentage', targetBase: 'board_count', weighting: 3 }] },
      { name: 'Board Participation (Black Women)', code: 'mc_board_bw', maxPoints: 2, description: 'Black women board members', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'board_count', weighting: 2 }] },
      { name: 'Executive Management (Black)', code: 'mc_exec_black', maxPoints: 4, description: 'Black executive management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 4 }] },
      { name: 'Executive Management (Black Women)', code: 'mc_exec_bw', maxPoints: 4, description: 'Black women executive management', targets: [{ targetValue: 0.30, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 4 }] },
      { name: 'Independent Non-Executive Directors', code: 'mc_ined', maxPoints: 4, description: 'Independent non-executive directors', targets: [{ targetValue: 0.40, targetUnit: 'percentage', targetBase: 'board_count', weighting: 4 }] },
      { name: 'Senior Management (Black)', code: 'ee_senior', maxPoints: 0, description: 'Black people in senior management (rolled into MC)', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'senior_count', weighting: 0 }] },
      { name: 'Middle Management (Black)', code: 'ee_middle', maxPoints: 0, description: 'Black people in middle management (rolled into MC)', targets: [{ targetValue: 0.75, targetUnit: 'percentage', targetBase: 'middle_count', weighting: 0 }] },
      { name: 'Junior Management (Black)', code: 'ee_junior', maxPoints: 0, description: 'Black people in junior management (rolled into MC)', targets: [{ targetValue: 0.88, targetUnit: 'percentage', targetBase: 'junior_count', weighting: 0 }] },
      { name: 'Disabled Employees', code: 'ee_disabled', maxPoints: 2, description: 'Employees with disabilities', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'total_employees', weighting: 2 }] },
    ],
  },
  {
    name: 'Employment Equity',
    code: 'employmentEquity',
    maxPoints: 0,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 3,
    indicators: [],
  },
  {
    name: 'Skills Development',
    code: 'skillsDevelopment',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 4,
    indicators: [
      { name: 'Skills Development Spend (Black)', code: 'sd_spend_black', maxPoints: 20, description: 'Training spend on black employees', targets: [{ targetValue: 0.035, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 20 }] },
      { name: 'Bursaries', code: 'sd_bursaries', maxPoints: 5, description: 'Bursaries for black students', targets: [{ targetValue: 0.025, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 5 }] },
    ],
  },
  {
    name: 'Preferential Procurement',
    code: 'preferentialProcurement',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 5,
    indicators: [
      { name: 'All Suppliers', code: 'pp_all', maxPoints: 5, description: 'B-BBEE compliant procurement from all suppliers', targets: [{ targetValue: 0.80, targetUnit: 'percentage', targetBase: 'tmps', weighting: 5 }] },
      { name: 'QSE Suppliers', code: 'pp_qse', maxPoints: 3, description: 'Procurement from qualifying small enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 3 }] },
      { name: 'EME Suppliers', code: 'pp_eme', maxPoints: 4, description: 'Procurement from exempted micro enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
      { name: '51% BO Suppliers', code: 'pp_51bo', maxPoints: 9, description: 'Procurement from 51% black owned suppliers', targets: [{ targetValue: 0.40, targetUnit: 'percentage', targetBase: 'tmps', weighting: 9 }] },
      { name: '30% BWO Suppliers', code: 'pp_30bwo', maxPoints: 4, description: 'Procurement from 30% black women owned suppliers', targets: [{ targetValue: 0.12, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
    ],
  },
  {
    name: 'Enterprise & Supplier Development',
    code: 'enterpriseSupplierDevelopment',
    maxPoints: 25,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 6,
    indicators: [
      { name: 'Supplier Development', code: 'esd_sd', maxPoints: 15, description: 'Annual contributions to supplier development', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'npat', weighting: 15 }] },
      { name: 'Enterprise Development', code: 'esd_ed', maxPoints: 10, description: 'Annual contributions to enterprise development', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 10 }] },
    ],
  },
  {
    name: 'Socio-Economic Development',
    code: 'socioEconomicDevelopment',
    maxPoints: 5,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 7,
    indicators: [
      { name: 'SED Contributions', code: 'sed_spend', maxPoints: 5, description: 'Socio-economic development contributions', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
];

// ---------------------------------------------------------------------------
// ICT QSE Scorecard (same combined MC+EE structure as RCOGP QSE, ICT targets)
// ---------------------------------------------------------------------------

const ICT_QSE_PILLARS: PillarDef[] = [
  {
    name: 'Ownership',
    code: 'ownership',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 1,
    indicators: [
      { name: 'Voting Rights (Black)', code: 'own_voting_black', maxPoints: 4, description: 'Exercisable voting rights in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 4 }] },
      { name: 'Voting Rights (Black Women)', code: 'own_voting_bw', maxPoints: 2, description: 'Exercisable voting rights in the hands of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'total_voting_rights', weighting: 2 }] },
      { name: 'Economic Interest (Black)', code: 'own_ei_black', maxPoints: 8, description: 'Economic interest of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 8 }] },
      { name: 'Economic Interest (Black Women)', code: 'own_ei_bw', maxPoints: 2, description: 'Economic interest of black women', targets: [{ targetValue: 0.10, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 2 }] },
      { name: 'Net Value', code: 'own_net_value', maxPoints: 8, description: 'Net value of ownership in the hands of black people', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'net_value', weighting: 8 }] },
      { name: 'New Entrants', code: 'own_new_entrants', maxPoints: 1, description: 'New entrants to ownership by black people', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'economic_interest', weighting: 1 }] },
    ],
  },
  {
    name: 'Management Control & Employment Equity',
    code: 'managementControl',
    maxPoints: 19,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 2,
    indicators: [
      { name: 'Board Participation (Black)', code: 'mc_board_black', maxPoints: 3, description: 'Black board members as % of all board members', targets: [{ targetValue: 0.50, targetUnit: 'percentage', targetBase: 'board_count', weighting: 3 }] },
      { name: 'Board Participation (Black Women)', code: 'mc_board_bw', maxPoints: 2, description: 'Black women board members', targets: [{ targetValue: 0.25, targetUnit: 'percentage', targetBase: 'board_count', weighting: 2 }] },
      { name: 'Executive Management (Black)', code: 'mc_exec_black', maxPoints: 4, description: 'Black executive management', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 4 }] },
      { name: 'Executive Management (Black Women)', code: 'mc_exec_bw', maxPoints: 4, description: 'Black women executive management', targets: [{ targetValue: 0.30, targetUnit: 'percentage', targetBase: 'exec_count', weighting: 4 }] },
      { name: 'Independent Non-Executive Directors', code: 'mc_ined', maxPoints: 4, description: 'Independent non-executive directors', targets: [{ targetValue: 0.40, targetUnit: 'percentage', targetBase: 'board_count', weighting: 4 }] },
      { name: 'Senior Management (Black)', code: 'ee_senior', maxPoints: 0, description: 'Black people in senior management (rolled into MC)', targets: [{ targetValue: 0.60, targetUnit: 'percentage', targetBase: 'senior_count', weighting: 0 }] },
      { name: 'Middle Management (Black)', code: 'ee_middle', maxPoints: 0, description: 'Black people in middle management (rolled into MC)', targets: [{ targetValue: 0.75, targetUnit: 'percentage', targetBase: 'middle_count', weighting: 0 }] },
      { name: 'Junior Management (Black)', code: 'ee_junior', maxPoints: 0, description: 'Black people in junior management (rolled into MC)', targets: [{ targetValue: 0.88, targetUnit: 'percentage', targetBase: 'junior_count', weighting: 0 }] },
      { name: 'Disabled Employees', code: 'ee_disabled', maxPoints: 2, description: 'Employees with disabilities', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'total_employees', weighting: 2 }] },
    ],
  },
  {
    name: 'Employment Equity',
    code: 'employmentEquity',
    maxPoints: 0,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 3,
    indicators: [],
  },
  {
    name: 'Skills Development',
    code: 'skillsDevelopment',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 4,
    indicators: [
      { name: 'Skills Development Spend (Black)', code: 'sd_spend_black', maxPoints: 20, description: 'Training spend on black employees', targets: [{ targetValue: 0.035, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 20 }] },
      { name: 'Bursaries', code: 'sd_bursaries', maxPoints: 5, description: 'Bursaries for black students', targets: [{ targetValue: 0.025, targetUnit: 'percentage', targetBase: 'leviable_amount', weighting: 5 }] },
    ],
  },
  {
    name: 'Preferential Procurement',
    code: 'preferentialProcurement',
    maxPoints: 25,
    hasSubMinimum: true,
    subMinimumThreshold: 0.4,
    displayOrder: 5,
    indicators: [
      { name: 'All Suppliers', code: 'pp_all', maxPoints: 5, description: 'B-BBEE compliant procurement from all suppliers', targets: [{ targetValue: 0.80, targetUnit: 'percentage', targetBase: 'tmps', weighting: 5 }] },
      { name: 'QSE Suppliers', code: 'pp_qse', maxPoints: 3, description: 'Procurement from qualifying small enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 3 }] },
      { name: 'EME Suppliers', code: 'pp_eme', maxPoints: 4, description: 'Procurement from exempted micro enterprises', targets: [{ targetValue: 0.15, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
      { name: '51% BO Suppliers', code: 'pp_51bo', maxPoints: 9, description: 'Procurement from 51% black owned suppliers', targets: [{ targetValue: 0.40, targetUnit: 'percentage', targetBase: 'tmps', weighting: 9 }] },
      { name: '30% BWO Suppliers', code: 'pp_30bwo', maxPoints: 4, description: 'Procurement from 30% black women owned suppliers', targets: [{ targetValue: 0.12, targetUnit: 'percentage', targetBase: 'tmps', weighting: 4 }] },
    ],
  },
  {
    name: 'Enterprise & Supplier Development',
    code: 'enterpriseSupplierDevelopment',
    maxPoints: 25,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 6,
    indicators: [
      { name: 'Supplier Development', code: 'esd_sd', maxPoints: 15, description: 'Annual contributions to supplier development', targets: [{ targetValue: 0.02, targetUnit: 'percentage', targetBase: 'npat', weighting: 15 }] },
      { name: 'Enterprise Development', code: 'esd_ed', maxPoints: 10, description: 'Annual contributions to enterprise development', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 10 }] },
    ],
  },
  {
    name: 'Socio-Economic Development',
    code: 'socioEconomicDevelopment',
    maxPoints: 5,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 7,
    indicators: [
      { name: 'SED Contributions', code: 'sed_spend', maxPoints: 5, description: 'Socio-economic development contributions', targets: [{ targetValue: 0.01, targetUnit: 'percentage', targetBase: 'npat', weighting: 5 }] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sector / Scorecard-type lookup map
// ---------------------------------------------------------------------------

const SECTOR_PILLAR_DEFS: Record<string, PillarDef[]> = {
  'RCOGP_Generic': RCOGP_GENERIC_PILLARS,
  'ICT_Generic': ICT_GENERIC_PILLARS,
  'FSC_Generic': FSC_GENERIC_PILLARS,
  'AGRI_Generic': AGRI_GENERIC_PILLARS,
  'RCOGP_QSE': RCOGP_QSE_PILLARS,
  'ICT_QSE': ICT_QSE_PILLARS,
};

// ---------------------------------------------------------------------------
// Ingestion logic
// ---------------------------------------------------------------------------

export interface IngestionResult {
  scorecardKey: string;
  graphKey: string | null;
  pillarCount: number;
  indicatorCount: number;
  targetCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
  errors: string[];
}

export async function ingestToolkitTemplate(
  filePath: string,
  sectorCode: string,
  scorecardType: 'Generic' | 'QSE' | 'EME',
  pillarDefs?: PillarDef[],
): Promise<IngestionResult> {
  if (!pillarDefs) {
    pillarDefs = SECTOR_PILLAR_DEFS[`${sectorCode}_${scorecardType}`] ?? RCOGP_GENERIC_PILLARS;
  }
  const errors: string[] = [];
  const scorecardRepo = new ScorecardRepository();
  const graphRepo = new GraphRepository();

  const fileName = filePath.split(/[\\/]/).pop() || filePath;

  const template: ScorecardTemplate = {
    name: `${sectorCode} ${scorecardType} Scorecard`,
    sectorCode,
    scorecardType,
    version: '1.0',
    totalMaxPoints: pillarDefs.reduce((sum, p) => sum + p.maxPoints, 0),
    levelThresholds: LEVEL_THRESHOLDS,
    createdAt: new Date().toISOString(),
    sourceFile: fileName,
  };

  const scorecard = await scorecardRepo.createScorecard(template);
  const scorecardKey = scorecard._key!;

  let indicatorCount = 0;
  let targetCount = 0;

  for (const pDef of pillarDefs) {
    const pillar: Pillar = {
      scorecardId: scorecardKey,
      name: pDef.name,
      code: pDef.code,
      maxPoints: pDef.maxPoints,
      hasSubMinimum: pDef.hasSubMinimum,
      subMinimumThreshold: pDef.subMinimumThreshold,
      displayOrder: pDef.displayOrder,
    };

    const savedPillar = await scorecardRepo.createPillar(pillar);

    for (const iDef of pDef.indicators) {
      const indicator: Indicator = {
        pillarId: savedPillar._key!,
        name: iDef.name,
        code: iDef.code,
        maxPoints: iDef.maxPoints,
        description: iDef.description,
      };

      const savedIndicator = await scorecardRepo.createIndicator(indicator);
      indicatorCount++;

      for (const tDef of iDef.targets) {
        const ct: ComplianceTarget = {
          indicatorId: savedIndicator._key!,
          sectorCode,
          targetValue: tDef.targetValue,
          targetUnit: tDef.targetUnit,
          targetBase: tDef.targetBase,
          weighting: tDef.weighting,
        };
        await scorecardRepo.createComplianceTarget(ct);
        targetCount++;
      }
    }
  }

  let graphKey: string | null = null;
  let graphNodeCount = 0;
  let graphEdgeCount = 0;

  if (fs.existsSync(filePath)) {
    try {
      const buffer = fs.readFileSync(filePath);
      const fullGraph = buildFormulaGraph(buffer, fileName);
      const subGraph = extractScorecardSubgraph(fullGraph);

      graphKey = await graphRepo.storeFormulaGraph(
        subGraph.nodes.length > 0 ? subGraph : fullGraph,
        scorecardType,
        sectorCode,
        fileName,
      );

      graphNodeCount = (subGraph.nodes.length > 0 ? subGraph : fullGraph).nodes.length;
      graphEdgeCount = (subGraph.nodes.length > 0 ? subGraph : fullGraph).edges.length;
    } catch (err: unknown) {
      errors.push(`Graph extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    errors.push(`File not found: ${filePath}`);
  }

  return {
    scorecardKey,
    graphKey,
    pillarCount: pillarDefs.length,
    indicatorCount,
    targetCount,
    graphNodeCount,
    graphEdgeCount,
    errors,
  };
}

export interface BulkIngestionResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{ file: string; sectorCode: string; type: string; result: IngestionResult }>;
}

/**
 * Ingest all known toolkit templates from a base directory.
 */
export async function ingestAllToolkits(basePath: string): Promise<BulkIngestionResult> {
  const TOOLKITS = [
    { subPath: 'BBBEE Toolkits/1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx', sector: 'RCOGP', type: 'Generic' as const },
    { subPath: 'BBBEE Toolkits/2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx', sector: 'ICT', type: 'Generic' as const },
    { subPath: 'BBBEE Toolkits/3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx', sector: 'ICT', type: 'QSE' as const },
    { subPath: 'BBBEE Toolkits/4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx', sector: 'RCOGP', type: 'QSE' as const },
    { subPath: 'BBBEE Toolkits/5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx', sector: 'FSC', type: 'Generic' as const },
    { subPath: 'BBBEE Toolkits/6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx', sector: 'AGRI', type: 'Generic' as const },
  ];

  const results: BulkIngestionResult['results'] = [];
  let successful = 0;
  let failed = 0;

  for (const tk of TOOLKITS) {
    const fullPath = `${basePath}/${tk.subPath}`.replace(/\//g, '\\');
    try {
      const sectorPillarDefs = SECTOR_PILLAR_DEFS[`${tk.sector}_${tk.type}`] ?? RCOGP_GENERIC_PILLARS;
      const result = await ingestToolkitTemplate(fullPath, tk.sector, tk.type, sectorPillarDefs);
      results.push({ file: tk.subPath, sectorCode: tk.sector, type: tk.type, result });
      if (result.errors.length === 0) successful++;
      else failed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        file: tk.subPath,
        sectorCode: tk.sector,
        type: tk.type,
        result: {
          scorecardKey: '',
          graphKey: null,
          pillarCount: 0,
          indicatorCount: 0,
          targetCount: 0,
          graphNodeCount: 0,
          graphEdgeCount: 0,
          errors: [msg],
        },
      });
      failed++;
    }
  }

  return { total: TOOLKITS.length, successful, failed, results };
}

export {
  RCOGP_GENERIC_PILLARS,
  ICT_GENERIC_PILLARS,
  FSC_GENERIC_PILLARS,
  AGRI_GENERIC_PILLARS,
  RCOGP_QSE_PILLARS,
  ICT_QSE_PILLARS,
  SECTOR_PILLAR_DEFS,
};
