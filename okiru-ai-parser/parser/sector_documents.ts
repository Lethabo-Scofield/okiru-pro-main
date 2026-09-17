/**
 * Sector-aware required-document catalog.
 *
 * The B-BBEE scorecard elements — and therefore the evidence a SANAS
 * verification agency expects — differ by sector code and by entity size. A
 * Generic large enterprise, a Construction Contractor, an FSC bank and an EME
 * are asked for different documents. This module is the single source of truth
 * for "which documents does THIS entity need to upload", grounded in:
 *   - the Amended Generic Codes of Good Practice (2013)
 *   - the Construction Sector Code (Contractor / Built Environment Professional)
 *   - the Financial Sector Code (Banks / Long-Term / Short-Term Insurers:
 *     adds Access to Financial Services, Consumer Education, Empowerment Financing)
 *   - the Transport Sector Code (sub-sector operating licences)
 *   - the B-BBEE Verification Manual evidence requirements
 *
 * `autoExtract` marks the document types the parser actually reads today (the 7
 * canonical types → workbook values → score). The rest are evidence-only: the
 * verifier needs them and the user still uploads/captures them, but the parser
 * does not yet pull structured values from them. The checklist tells the user
 * the truth about which is which — it never fabricates a score from a document
 * the engine cannot read.
 */
import type { RequiredDocumentGroup } from './case_parser_service.js';

export type SectorCode = 'Generic' | 'ICT' | 'AGRI' | 'TRANSPORT' | 'CONSTRUCTION' | 'FSC' | 'MAC';
export type EntitySize = 'Generic' | 'QSE' | 'EME';
export type ConstructionSubSector = 'Contractor' | 'BEP';
export type FscSubSector = 'Banks' | 'LTI' | 'STI';

export interface SectorDocumentQuery {
  sector?: string;
  size?: string;
  subSector?: string;
}

// ---------------------------------------------------------------------------
// Building blocks — the parser-readable (autoExtract) evidence common to the
// five-pillar scorecards. Types must match the ontology document_type names.
// ---------------------------------------------------------------------------

const OWNERSHIP_EVIDENCE: RequiredDocumentGroup = {
  key: 'ownership_evidence',
  label: 'Ownership Confirmation / share register',
  types: ['Ownership Confirmation'],
  pillar: 'OWN',
  required: true,
  autoExtract: true,
  note: 'CIPC (CoR14.3), share register, share certificates and IDs of black shareholders; a signed ownership confirmation lets us read the aggregate black holding.',
};

const MANAGEMENT_CONTROL_EVIDENCE: RequiredDocumentGroup = {
  key: 'management_control',
  label: 'Employment Equity Report (EEA2 / EE)',
  types: ['Employment Equity Report'],
  pillar: 'MAC',
  required: true,
  autoExtract: true,
  note: 'The EE report / employee register by race, gender and occupational level evidences board and management representation.',
};

const SKILLS_EVIDENCE: RequiredDocumentGroup = {
  key: 'skills_development',
  label: 'Workplace Skills Plan & Annual Training Report',
  types: ['Workplace Skills Plan'],
  pillar: 'SKL',
  required: true,
  autoExtract: true,
  note: 'WSP/ATR submitted to the SETA, plus learner agreements and training invoices, evidence skills spend by demographic.',
};

const SUPPLIER_BBEE_EVIDENCE: RequiredDocumentGroup = {
  key: 'supplier_bbee_evidence',
  label: 'Supplier B-BBEE Certificates or Affidavits',
  types: ['B-BBEE Certificate', 'B-BBEE Sworn Affidavit'],
  pillar: 'ESD',
  required: true,
  autoExtract: true,
  note: "Each material supplier's B-BBEE certificate or sworn affidavit fixes their recognition level for procurement.",
};

const SUPPLIER_SPEND_SCHEDULE: RequiredDocumentGroup = {
  key: 'supplier_spend_schedule',
  label: 'Supplier Spend Schedule (TMPS)',
  types: ['Supplier Spend Schedule'],
  pillar: 'ESD',
  required: true,
  autoExtract: true,
  note: 'Total Measured Procurement Spend by supplier, reconciled to the AFS, drives the procurement score.',
};

const SED_EVIDENCE: RequiredDocumentGroup = {
  key: 'sed_contributions',
  label: 'SED Contribution Confirmations',
  types: ['SED Contribution Confirmation'],
  pillar: 'SED',
  required: false,
  autoExtract: true,
  note: 'Beneficiary confirmation letters / proof of payment for socio-economic development contributions.',
};

const FINANCIALS: RequiredDocumentGroup = {
  key: 'financials_afs',
  label: 'Annual Financial Statements',
  types: ['Annual Financial Statements'],
  pillar: 'FIN',
  required: true,
  autoExtract: false,
  note: 'Audited/reviewed AFS — revenue, NPAT and payroll set the ESD, SED and Skills targets. Capture these in the workbook.',
};

/** The five-pillar generic base (order matters for the checklist). */
const GENERIC_BASE: RequiredDocumentGroup[] = [
  OWNERSHIP_EVIDENCE,
  MANAGEMENT_CONTROL_EVIDENCE,
  SKILLS_EVIDENCE,
  SUPPLIER_SPEND_SCHEDULE,
  SUPPLIER_BBEE_EVIDENCE,
  SED_EVIDENCE,
  FINANCIALS,
];

// ---------------------------------------------------------------------------
// Sector add-ons (evidence-only — no extractor yet, flagged honestly).
// ---------------------------------------------------------------------------

const CIDB_REGISTRATION: RequiredDocumentGroup = {
  key: 'cidb_registration',
  label: 'CIDB Registration & Grading Certificate',
  types: ['CIDB Registration Certificate'],
  pillar: 'SECTOR',
  required: true,
  autoExtract: false,
  note: 'Construction Sector Code — the CIDB contractor grading designation determines the applicable scorecard.',
};

const BEP_PROFESSIONAL_REGISTRATION: RequiredDocumentGroup = {
  key: 'bep_professional_registration',
  label: 'Professional Registration (ECSA / SACPCMP / SACAP / SACQSP)',
  types: ['Professional Registration Certificate'],
  pillar: 'SECTOR',
  required: true,
  autoExtract: false,
  note: 'Built Environment Professionals register with a statutory council; the certificate evidences BEP status.',
};

const FSC_ACCESS_TO_FINANCIAL_SERVICES: RequiredDocumentGroup = {
  key: 'fsc_access_financial_services',
  label: 'Access to Financial Services data',
  types: ['Access to Financial Services Report'],
  pillar: 'SECTOR',
  required: true,
  autoExtract: false,
  note: 'FSC element — product access / take-up by LSM band and geography. Capture the AFS indicators in the workbook.',
};

const FSC_CONSUMER_EDUCATION: RequiredDocumentGroup = {
  key: 'fsc_consumer_education',
  label: 'Consumer Education proof of spend',
  types: ['Consumer Education Report'],
  pillar: 'SECTOR',
  required: true,
  autoExtract: false,
  note: 'FSC element — evidence of consumer financial-education spend and delivery.',
};

const FSC_EMPOWERMENT_FINANCING: RequiredDocumentGroup = {
  key: 'fsc_empowerment_financing',
  label: 'Empowerment Financing / Targeted Investment schedules',
  types: ['Empowerment Financing Schedule'],
  pillar: 'SECTOR',
  required: true,
  autoExtract: false,
  note: 'FSC element — B-BBEE transaction financing, targeted investments and agricultural/affordable-housing lines.',
};

const TRANSPORT_OPERATING_LICENCE: RequiredDocumentGroup = {
  key: 'transport_operating_licence',
  label: 'Operating Licence / Permit (sub-sector)',
  types: ['Operating Licence'],
  pillar: 'SECTOR',
  required: false,
  autoExtract: false,
  note: 'Transport Sector Code — the relevant operating licence/permit for the sub-sector (road freight, bus, rail, etc.).',
};

// EME: a single sworn affidavit (or CIPC certificate) is the whole scorecard.
const EME_AFFIDAVIT: RequiredDocumentGroup = {
  key: 'eme_affidavit',
  label: 'B-BBEE Sworn Affidavit or CIPC EME Certificate',
  types: ['B-BBEE Sworn Affidavit', 'B-BBEE Certificate'],
  pillar: 'OWN',
  required: true,
  autoExtract: true,
  note: 'An EME (turnover < R10m) is scored on a sworn affidavit confirming turnover and black ownership — no full scorecard required.',
};

function normSector(s?: string): SectorCode {
  const v = (s ?? '').trim().toUpperCase();
  if (v === 'CONSTRUCTION') return 'CONSTRUCTION';
  if (v === 'FSC' || v.startsWith('FINANC')) return 'FSC';
  if (v === 'TRANSPORT') return 'TRANSPORT';
  if (v === 'ICT') return 'ICT';
  if (v === 'AGRI' || v.startsWith('AGRI')) return 'AGRI';
  return 'Generic';
}

function normSize(s?: string): EntitySize {
  const v = (s ?? '').trim().toUpperCase();
  if (v === 'EME') return 'EME';
  if (v === 'QSE') return 'QSE';
  return 'Generic';
}

/**
 * The required-document groups for a given sector + size + sub-sector.
 *
 * With no query (back-compat for the case parser default), returns the two
 * procurement groups the legacy flow enforced. With a sector, returns the
 * sector-appropriate checklist.
 */
export function getRequiredDocumentGroups(query: SectorDocumentQuery = {}): RequiredDocumentGroup[] {
  const hasQuery = Boolean(query.sector || query.size || query.subSector);
  if (!hasQuery) {
    // Legacy default — preserves existing case-parser behaviour / tests.
    return [SUPPLIER_BBEE_EVIDENCE, SUPPLIER_SPEND_SCHEDULE];
  }

  const sector = normSector(query.sector);
  const size = normSize(query.size);

  // EME short-circuits every sector: one affidavit is the scorecard.
  if (size === 'EME') return [EME_AFFIDAVIT];

  const groups = [...GENERIC_BASE];

  if (sector === 'CONSTRUCTION') {
    const sub = (query.subSector ?? '').trim().toUpperCase();
    groups.push(CIDB_REGISTRATION);
    if (sub === 'BEP') groups.push(BEP_PROFESSIONAL_REGISTRATION);
  } else if (sector === 'FSC') {
    groups.push(FSC_ACCESS_TO_FINANCIAL_SERVICES, FSC_CONSUMER_EDUCATION, FSC_EMPOWERMENT_FINANCING);
  } else if (sector === 'TRANSPORT') {
    groups.push(TRANSPORT_OPERATING_LICENCE);
  }
  // ICT and AGRI use the generic five-pillar evidence set (their sector codes
  // reshape targets/weightings, not the underlying evidence classes).

  return groups;
}

/** All sectors the catalog understands, for the UI selector. */
export const SECTOR_OPTIONS: Array<{
  code: SectorCode;
  label: string;
  subSectors?: Array<{ value: string; label: string }>;
  /**
   * The scorecard runs, but some part of it was applied by analogy rather than
   * transcribed from the gazette. The UI must say so wherever the sector is
   * chosen — a level nobody flagged is a level someone will certify.
   */
  provisional?: boolean;
  /** What specifically is unconfirmed. Shown to the user verbatim. */
  provisionalNote?: string;
}> = [
  { code: 'Generic', label: 'Generic (all industries)' },
  {
    code: 'CONSTRUCTION',
    label: 'Construction',
    subSectors: [
      { value: 'Contractor', label: 'Contractor' },
      { value: 'BEP', label: 'Built Environment Professional' },
    ],
  },
  {
    code: 'FSC',
    label: 'Financial Sector (FSC)',
    subSectors: [
      { value: 'Banks', label: 'Banks' },
      { value: 'LTI', label: 'Long-Term Insurers' },
      { value: 'STI', label: 'Short-Term Insurers' },
    ],
  },
  { code: 'TRANSPORT', label: 'Transport' },
  { code: 'ICT', label: 'ICT' },
  { code: 'AGRI', label: 'AgriBEE' },
  {
    // MAC_GENERIC / MAC_QSE are implemented and score, but the gazette extract
    // they were built from (GG 39887, via Zoleka Mnanzana 2026-08-13) gives
    // indicator weightings and targets ONLY. The level ladder, the priority
    // elements and the 40% sub-minimums were applied by analogy with the
    // Amended Codes. That is a defensible reading and it is still an
    // assumption, so the sector is offered and labelled rather than withheld or
    // passed off as verified.
    code: 'MAC',
    label: 'Marketing, Advertising and Communication (MAC)',
    provisional: true,
    provisionalNote:
      'Provisional — element weightings and targets are from the gazette, but the '
      + 'level ladder and sub-minimums are applied by analogy with the Amended Codes '
      + 'and are not yet confirmed. Treat the score as indicative, not as a level to certify.',
  },
];
