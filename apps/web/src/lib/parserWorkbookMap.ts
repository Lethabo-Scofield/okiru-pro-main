/**
 * okiru-ai-parser case output → workbook sections.
 *
 * The document-upload start option must score through the SAME path as manual
 * entry and Excel import: workbook sections → /api/workbook/:id/import →
 * submit → projectWorkbookToClient → the Toolkit calculators. This mapper is
 * the normalisation step: it converts the parser's extracted values
 * (supplier_rows + the case calculator_payload) into the exact grid rows /
 * meta the workbook sections use (column keys from
 * components/workbook/sections.ts — PROCUREMENT_COLUMNS, OWNERSHIP_COLUMNS,
 * SED_COLUMNS).
 *
 * No fabrication: values that cannot be represented without inventing detail
 * the documents don't carry (e.g. skills spend without per-learner rows,
 * management % without per-employee demographics) are NOT written into the
 * workbook — they are surfaced in the coverage report with the extracted
 * value so the user can place them deliberately.
 */

export interface ParserCaseLike {
  status?: string;
  calculator_payload?: Record<string, unknown>;
  /**
   * Total Measured Procurement Spend read as a LABELLED total from a spend
   * schedule / AFS (never summed). The deterministic case result computes this
   * ("first document that stated an explicit total wins"); it is the trustworthy
   * TMPS and must beat any model that "computed" TMPS by summing the wrong column.
   */
  measured_procurement_spend?: number | null;
  supplier_rows?: Array<{
    supplier_name?: string;
    spend_amount?: number | string | null;
    bee_level?: number | string | null;
    black_ownership?: number | string | null;
    status?: string;
    source_file?: string;
  }>;
  documents_detected?: Array<{
    filename?: string;
    document_type?: string;
    status?: string;
    overall_confidence?: number;
    validation?: {
      warnings?: string[];
      errors?: string[];
      /** Field keys the parser expected for this document type but could not read. */
      missing_fields?: string[];
    };
  }>;
  fields_extracted?: Record<string, Record<string, { normalized_value?: unknown; raw_value?: unknown; confidence?: number }>>;
  missing_required_documents?: string[];
  /** Per-document review reasons (missing fields / validation errors) for docs the parser flagged. */
  documents_needing_review?: Array<{
    filename?: string;
    document_type?: string;
    status?: string;
    reasons?: string[];
  }>;
}

export interface WorkbookSectionPatch {
  rows?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
}

export interface ParserWorkbookCoverageItem {
  pillar: string;
  status: 'mapped' | 'needs-detail' | 'no-document';
  detail: string;
  /** Extracted value we could not place automatically (shown to the user). */
  extractedValue?: string;
}

export interface ParserWorkbookMapResult {
  sections: Record<string, WorkbookSectionPatch>;
  coverage: ParserWorkbookCoverageItem[];
  /** Count of workbook rows written (for the preview summary). */
  mappedRowCount: number;
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

/** Per-document field lookup: first non-empty normalized value for a field across docs of the given types. */
function fieldFromDocs(
  parserCase: ParserCaseLike,
  docTypes: string[],
  fieldName: string,
  matchSupplier?: string,
): unknown {
  const docs = parserCase.documents_detected ?? [];
  const byFile = parserCase.fields_extracted ?? {};
  for (const doc of docs) {
    if (!docTypes.includes(doc.document_type ?? '')) continue;
    const fields = byFile[doc.filename ?? ''] ?? {};
    if (matchSupplier) {
      const name = str(fields.supplier_name?.normalized_value ?? fields.supplier_name?.raw_value);
      if (name && name.toLowerCase() !== matchSupplier.toLowerCase()) continue;
    }
    const v = fields[fieldName]?.normalized_value ?? fields[fieldName]?.raw_value;
    if (v != null && v !== '') return v;
  }
  return undefined;
}

/**
 * Map a parser case to workbook section patches + a coverage report.
 */
export function mapParserCaseToWorkbookSections(parserCase: ParserCaseLike): ParserWorkbookMapResult {
  const sections: Record<string, WorkbookSectionPatch> = {};
  const coverage: ParserWorkbookCoverageItem[] = [];
  const payload = parserCase.calculator_payload ?? {};
  let mappedRowCount = 0;

  // ---- Preferential Procurement: supplier spend schedule rows + per-supplier
  //      B-BBEE evidence (certificates / affidavits). Column keys =
  //      PROCUREMENT_COLUMNS. TMPS is derived downstream from supplier spend
  //      when not supplied (projectWorkbookToClient fallback), so suppliers
  //      alone produce a real PP score.
  const supplierRows = (parserCase.supplier_rows ?? []).filter((r) => str(r.supplier_name));
  const procurementRows: Array<Record<string, unknown>> = supplierRows.map((r) => {
    const name = str(r.supplier_name);
    const row: Record<string, unknown> = { supplierName: name };
    const spend = num(r.spend_amount);
    if (spend !== undefined) row.spend = spend;
    const level = num(r.bee_level);
    if (level !== undefined) row.bbbeeLevel = level;
    const black = num(r.black_ownership);
    if (black !== undefined) row.currentBlackOwnership = black;
    // Enrich from a matching certificate / affidavit (expiry date).
    const expiry = fieldFromDocs(parserCase, ['B-BBEE Certificate', 'B-BBEE Sworn Affidavit'], 'expiry_date', name)
      ?? fieldFromDocs(parserCase, ['B-BBEE Certificate', 'B-BBEE Sworn Affidavit'], 'signed_date', name);
    if (expiry != null) row.certificateExpiryDate = str(expiry);
    return row;
  });

  // Certificates / affidavits naming suppliers that are NOT on the spend
  // schedule: add evidence-only rows (no spend → they don't score until spend
  // is captured, but the user sees them and can fill spend in the workbook).
  const knownNames = new Set(procurementRows.map((r) => str(r.supplierName).toLowerCase()));
  for (const doc of parserCase.documents_detected ?? []) {
    if (!['B-BBEE Certificate', 'B-BBEE Sworn Affidavit'].includes(doc.document_type ?? '')) continue;
    if (doc.status === 'failed') continue;
    const fields = (parserCase.fields_extracted ?? {})[doc.filename ?? ''] ?? {};
    const name = str(fields.supplier_name?.normalized_value ?? fields.supplier_name?.raw_value);
    if (!name || knownNames.has(name.toLowerCase())) continue;
    knownNames.add(name.toLowerCase());
    const row: Record<string, unknown> = { supplierName: name };
    const level = num(fields.bee_level?.normalized_value);
    if (level !== undefined) row.bbbeeLevel = level;
    const black = num(fields.black_ownership?.normalized_value);
    if (black !== undefined) row.currentBlackOwnership = black;
    const expiry = fields.expiry_date?.normalized_value ?? fields.signed_date?.normalized_value;
    if (expiry != null) row.certificateExpiryDate = str(expiry);
    procurementRows.push(row);
  }

  if (procurementRows.length > 0) {
    sections.procurement = { rows: procurementRows };
    mappedRowCount += procurementRows.length;
    coverage.push({
      pillar: 'Preferential Procurement',
      status: 'mapped',
      detail: `${procurementRows.length} supplier${procurementRows.length !== 1 ? 's' : ''} mapped from the spend schedule and B-BBEE evidence.`,
    });
  } else {
    coverage.push({
      pillar: 'Preferential Procurement',
      status: 'no-document',
      detail: 'Upload a Supplier Spend Schedule plus each supplier\'s B-BBEE certificate or affidavit.',
    });
  }

  // TMPS — the procurement DENOMINATOR — as a labelled total read verbatim, never
  // summed. Procurement scores as recognised-spend / TMPS, so a TMPS inflated by
  // a model summing the wrong column silently starves the pillar. This value
  // lands in financial-information.meta and, because the legacy sections win the
  // merge over the AI-entity sections, it overrides the model's computed TMPS.
  const tmps = typeof parserCase.measured_procurement_spend === 'number' && parserCase.measured_procurement_spend > 0
    ? parserCase.measured_procurement_spend
    : undefined;
  if (tmps !== undefined) {
    sections['financial-information'] = {
      ...(sections['financial-information'] ?? {}),
      meta: { ...(sections['financial-information']?.meta ?? {}), tmps },
    };
  }

  // ---- Ownership: an Ownership Confirmation document asserts the measured
  //      entity's aggregate black shareholding. Encode it exactly as asserted:
  //      one row covering 100% of equity whose black % equal the confirmed
  //      aggregates (the same encoding used for trusts / aggregate holders).
  const ownBlack = num(payload['ownership.black_ownership']);
  const ownBlackWomen = num(payload['ownership.black_women_ownership']);
  const ownEntity = str(payload['ownership.entity_name']);
  if (ownBlack !== undefined) {
    const row: Record<string, unknown> = {
      shareholderName: `${ownEntity || 'Measured entity'} — aggregate black shareholding (per Ownership Confirmation)`,
      ownershipType: 'shareholder',
      shareholding: 100,
      votingRights: ownBlack,
      economicInterest: ownBlack,
      blackOwnership: ownBlack,
    };
    if (ownBlackWomen !== undefined) row.blackWomenOwnership = ownBlackWomen;
    sections.ownership = { rows: [row] };
    mappedRowCount += 1;
    coverage.push({
      pillar: 'Ownership',
      status: 'mapped',
      detail: `Aggregate black shareholding ${ownBlack}%${ownBlackWomen !== undefined ? ` (black women ${ownBlackWomen}%)` : ''} from the Ownership Confirmation. Replace with per-shareholder rows for Net Value / New Entrant points.`,
    });
  } else {
    coverage.push({
      pillar: 'Ownership',
      status: 'no-document',
      detail: 'Upload an Ownership Confirmation (or enter shareholders in the workbook).',
    });
  }

  // ---- SED: a contribution confirmation → one SED row (SED_COLUMNS keys).
  const sedAmount = num(payload['sed.contribution']);
  const sedBeneficiary = str(payload['sed.beneficiary_name']);
  if (sedAmount !== undefined && sedBeneficiary) {
    sections.sed = {
      rows: [{
        beneficiaryName: sedBeneficiary,
        descriptionOfSpend: 'SED contribution (per SED Contribution Confirmation)',
        amount: sedAmount,
      }],
    };
    mappedRowCount += 1;
    coverage.push({
      pillar: 'Socio-Economic Development',
      status: 'mapped',
      detail: `Contribution of R${sedAmount.toLocaleString()} to ${sedBeneficiary}. Add % black beneficiaries in the workbook if not 100%.`,
    });
  } else {
    coverage.push({
      pillar: 'Socio-Economic Development',
      status: 'no-document',
      detail: 'Upload SED contribution confirmations (or enter them in the workbook).',
    });
  }

  // ---- Values we deliberately do NOT auto-place (would require inventing
  //      per-person detail the documents don't carry). Surfaced with the
  //      extracted value so the user can capture them correctly.
  const skillsTotal = num(payload['skills.total_spend']);
  const skillsBlack = num(payload['skills.black_spend']);
  if (skillsTotal !== undefined || skillsBlack !== undefined) {
    coverage.push({
      pillar: 'Skills Development',
      status: 'needs-detail',
      detail: 'Skills spend extracted, but scoring needs per-learner training rows (demographics + category). Enter the programmes in the workbook.',
      extractedValue: [
        skillsTotal !== undefined ? `total R${skillsTotal.toLocaleString()}` : null,
        skillsBlack !== undefined ? `black spend R${skillsBlack.toLocaleString()}` : null,
      ].filter(Boolean).join(', '),
    });
  } else {
    coverage.push({
      pillar: 'Skills Development',
      status: 'no-document',
      detail: 'Upload the Workplace Skills Plan / training records (or enter programmes in the workbook).',
    });
  }

  const mcBlack = num(payload['management.black_representation']);
  const mcBlackWomen = num(payload['management.black_women_representation']);
  if (mcBlack !== undefined || mcBlackWomen !== undefined) {
    coverage.push({
      pillar: 'Management Control',
      status: 'needs-detail',
      detail: 'Representation percentages extracted, but scoring needs the employee register (race / gender / level per person). Enter employees in the workbook.',
      extractedValue: [
        mcBlack !== undefined ? `black ${mcBlack}%` : null,
        mcBlackWomen !== undefined ? `black women ${mcBlackWomen}%` : null,
      ].filter(Boolean).join(', '),
    });
  } else {
    coverage.push({
      pillar: 'Management Control',
      status: 'no-document',
      detail: 'Upload the Employment Equity Report (or enter the employee register in the workbook).',
    });
  }

  // Financials are not a parser document type yet — they gate ESD/SED/Skills
  // targets, so always flag them.
  coverage.push({
    pillar: 'Financials',
    status: 'no-document',
    detail: 'Enter revenue, NPAT and payroll in the workbook — targets for ESD, SED and Skills are percentages of these.',
  });

  return { sections, coverage, mappedRowCount };
}
