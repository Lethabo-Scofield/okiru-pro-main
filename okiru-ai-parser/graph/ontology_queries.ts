import type { DocumentKnowledge, DocumentTypeNode, OntologyRepository } from './ontology_models.js';

export class InMemoryOntologyRepository implements OntologyRepository {
  private knowledge = new Map<string, DocumentKnowledge>();

  constructor(seed: DocumentKnowledge[] = defaultDocumentKnowledge()) {
    for (const doc of seed) {
      this.knowledge.set(doc.document.name.toLowerCase(), doc);
      for (const alias of doc.document.aliases) {
        this.knowledge.set(alias.toLowerCase(), doc);
      }
    }
  }

  async upsertOntology(records: import('./ontology_models.js').OntologyRecord[]): Promise<{ nodes: number; relationships: number }> {
    for (const record of records) {
      this.knowledge.set(record.document.name.toLowerCase(), {
        document: record.document,
        fields: record.fields,
      });
      for (const alias of record.document.aliases) {
        this.knowledge.set(alias.toLowerCase(), {
          document: record.document,
          fields: record.fields,
        });
      }
    }
    return {
      nodes: records.reduce((sum, r) => sum + 2 + r.fields.length * 4, 0),
      relationships: records.reduce((sum, r) => sum + 1 + r.fields.length * 4, 0),
    };
  }

  async getDocumentKnowledge(documentType: string): Promise<DocumentKnowledge | null> {
    return this.knowledge.get(documentType.toLowerCase()) ?? null;
  }

  async listDocumentTypes(): Promise<DocumentTypeNode[]> {
    const seen = new Set<string>();
    return Array.from(this.knowledge.values())
      .filter((item) => {
        if (seen.has(item.document.name)) return false;
        seen.add(item.document.name);
        return true;
      })
      .map((item) => item.document);
  }
}

export function defaultDocumentKnowledge(): DocumentKnowledge[] {
  const graph_version = 'v1';
  return [
    {
      document: {
        name: 'B-BBEE Certificate',
        description: 'Supplier B-BBEE status level certificate or affidavit evidence.',
        // Includes the FORMAL titles a SANAS-accredited agency actually prints
        // on the certificate. The short forms below are how people refer to it;
        // the long forms are how the document names itself.
        aliases: [
          'BEE Certificate',
          'BBBEE Certificate',
          'B-BBEE Certificate',
          'Supplier B-BBEE Certificate',
          'B-BBEE Status Level Verification Certificate',
          'BEE Status Level Verification Certificate',
          'Status Level Verification Certificate',
          'Verification Certificate',
        ],
        required: true,
        pillar_code: 'ESD',
        graph_version,
      },
      fields: [
        {
          field: {
            name: 'supplier_name',
            data_type: 'string',
            required: true,
            description: 'Legal or trading name shown on the certificate.',
            calculator_key: 'supplier.name',
            graph_version,
          },
          rules: [
            { name: 'required_supplier_name', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Supplier name not found', graph_version },
          ],
          patterns: [
            { name: 'Enterprise Name', pattern_type: 'regex', examples: ['Enterprise Name: ABC Suppliers Pty Ltd'], regex: '(?:Enterprise|Entity|Measured Entity|Supplier|Company)\\s*Name\\s*[:\\-]?\\s*([^\\n\\r]+)', semantic_hint: 'supplier legal name', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.name', expected_type: 'string', destination: 'manual_workbook', workbook_field: 'supplier.name', manual_flow_mapping: 'procurement.supplier.name', graph_version },
          ],
        },
        {
          field: {
            name: 'bee_level',
            data_type: 'bee_level',
            required: true,
            description: 'B-BBEE status level, 1 through 8.',
            calculator_key: 'supplier.bee_level',
            graph_version,
          },
          rules: [
            { name: 'bee_level_range_check', rule_type: 'range', severity: 'error', logic: 'bee_level:1:8', failure_message: 'B-BBEE level must be between 1 and 8', graph_version },
          ],
          patterns: [
            { name: 'B-BBEE Status Level', pattern_type: 'regex', examples: ['B-BBEE Status Level: Level Two'], regex: '(?:B[-\\s]?BBEE\\s*(?:Status\\s*)?Level|BEE\\s*Level)\\s*[:\\-]?\\s*(Level\\s*)?([A-Za-z0-9]+)', semantic_hint: 'bee level', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.bee_level', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'supplier.beeLevel', manual_flow_mapping: 'procurement.supplier.beeLevel', graph_version },
          ],
        },
        {
          field: {
            name: 'black_ownership',
            data_type: 'percentage',
            required: false,
            description: 'Black ownership percentage from supplier evidence.',
            calculator_key: 'supplier.black_ownership',
            graph_version,
          },
          rules: [
            { name: 'black_ownership_percentage_range', rule_type: 'range', severity: 'error', logic: 'percentage:0:100', failure_message: 'Black ownership percentage must be between 0 and 100', graph_version },
          ],
          patterns: [
            { name: 'Black Ownership', pattern_type: 'regex', examples: ['Black Ownership: 51%'], regex: 'Black\\s+Ownership(?:\\s+Percentage)?\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?\\s*%)', semantic_hint: 'black ownership percentage', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.black_ownership', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'supplier.blackOwnership', manual_flow_mapping: 'procurement.supplier.blackOwnership', graph_version },
          ],
        },
        {
          field: {
            name: 'expiry_date',
            data_type: 'date',
            required: true,
            description: 'Certificate expiry date.',
            calculator_key: 'supplier.certificate_expiry',
            graph_version,
          },
          rules: [
            { name: 'required_expiry_date', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Expiry date not found', graph_version },
            { name: 'certificate_not_expired', rule_type: 'date', severity: 'error', logic: 'not_expired', failure_message: 'Certificate is expired', graph_version },
          ],
          patterns: [
            { name: 'Expiry Date', pattern_type: 'regex', examples: ['Expiry Date: 01 Feb 2027'], regex: '(?:Expiry|Expiration|Valid\\s+Until|Valid\\s+To)(?:\\s*Date)?\\s*[:\\-]?\\s*([0-9]{1,2}\\s+[A-Za-z]{3,9}\\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\\/\\-][0-9]{1,2}[\\/\\-][0-9]{4})', semantic_hint: 'certificate expiry date', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.certificate_expiry', expected_type: 'date', destination: 'manual_workbook', workbook_field: 'supplier.expiryDate', manual_flow_mapping: 'procurement.supplier.expiryDate', graph_version },
          ],
        },
      ],
    },
    {
      document: {
        name: 'B-BBEE Sworn Affidavit',
        description: 'Supplier sworn affidavit for EME/QSE B-BBEE evidence.',
        aliases: ['B-BBEE Affidavit', 'BEE Affidavit', 'B-BBEE Sworn Affidavit', 'Sworn Affidavit'],
        required: true,
        pillar_code: 'ESD',
        graph_version,
      },
      fields: [
        {
          field: {
            name: 'supplier_name',
            data_type: 'string',
            required: true,
            description: 'Legal or trading name shown on the affidavit.',
            calculator_key: 'supplier.name',
            graph_version,
          },
          rules: [
            { name: 'required_supplier_name', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Supplier name not found', graph_version },
          ],
          patterns: [
            { name: 'Enterprise Name', pattern_type: 'regex', examples: ['Enterprise Name: ABC Suppliers Pty Ltd'], regex: '(?:Enterprise|Entity|Measured Entity|Supplier|Company)\\s*Name\\s*[:\\-]?\\s*([^\\n\\r]+)', semantic_hint: 'supplier legal name', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.name', expected_type: 'string', destination: 'manual_workbook', workbook_field: 'supplier.name', manual_flow_mapping: 'procurement.supplier.name', graph_version },
          ],
        },
        {
          field: {
            name: 'bee_level',
            data_type: 'bee_level',
            required: true,
            description: 'B-BBEE status level, 1 through 8.',
            calculator_key: 'supplier.bee_level',
            graph_version,
          },
          rules: [
            { name: 'bee_level_range_check', rule_type: 'range', severity: 'error', logic: 'bee_level:1:8', failure_message: 'B-BBEE level must be between 1 and 8', graph_version },
          ],
          patterns: [
            { name: 'B-BBEE Status Level', pattern_type: 'regex', examples: ['B-BBEE Status Level: Level Two'], regex: '(?:B[-\\s]?BBEE\\s*(?:Status\\s*)?Level|BEE\\s*Level)\\s*[:\\-]?\\s*(Level\\s*)?([A-Za-z0-9]+)', semantic_hint: 'bee level', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.bee_level', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'supplier.beeLevel', manual_flow_mapping: 'procurement.supplier.beeLevel', graph_version },
          ],
        },
        {
          field: {
            name: 'black_ownership',
            data_type: 'percentage',
            required: true,
            description: 'Black ownership percentage from supplier affidavit.',
            calculator_key: 'supplier.black_ownership',
            graph_version,
          },
          rules: [
            { name: 'black_ownership_percentage_range', rule_type: 'range', severity: 'error', logic: 'percentage:0:100', failure_message: 'Black ownership percentage must be between 0 and 100', graph_version },
          ],
          patterns: [
            { name: 'Black Ownership', pattern_type: 'regex', examples: ['Black Ownership: 51%'], regex: 'Black\\s+Ownership(?:\\s+Percentage)?\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?\\s*%)', semantic_hint: 'black ownership percentage', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.black_ownership', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'supplier.blackOwnership', manual_flow_mapping: 'procurement.supplier.blackOwnership', graph_version },
          ],
        },
        {
          field: {
            name: 'signed_date',
            data_type: 'date',
            required: true,
            description: 'Affidavit signed date.',
            calculator_key: 'supplier.affidavit_signed_date',
            graph_version,
          },
          rules: [
            { name: 'required_signed_date', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Signed date not found', graph_version },
          ],
          patterns: [
            { name: 'Signed Date', pattern_type: 'regex', examples: ['Signed Date: 15 Jan 2026'], regex: '(?:Signed|Signature)\\s*Date\\s*[:\\-]?\\s*([0-9]{1,2}\\s+[A-Za-z]{3,9}\\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\\/\\-][0-9]{1,2}[\\/\\-][0-9]{4})', semantic_hint: 'affidavit signed date', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.affidavit_signed_date', expected_type: 'date', destination: 'manual_workbook', workbook_field: 'supplier.affidavitSignedDate', manual_flow_mapping: 'procurement.supplier.affidavitSignedDate', graph_version },
          ],
        },
      ],
    },
    {
      document: {
        name: 'Supplier Spend Schedule',
        description: 'Supplier spend schedule listing suppliers, invoice dates, amounts, B-BBEE levels, and ownership.',
        aliases: ['Full supplier schedule', 'Supplier Spend Schedule', 'Supplier Name Invoice Number', 'Supplier Name,Invoice Number'],
        required: true,
        pillar_code: 'ESD',
        graph_version,
      },
      fields: [
        {
          field: {
            name: 'supplier_name',
            data_type: 'string',
            required: true,
            description: 'Supplier name in the spend schedule.',
            calculator_key: 'supplier.name',
            graph_version,
          },
          rules: [
            { name: 'required_supplier_name', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Supplier name not found', graph_version },
          ],
          patterns: [
            { name: 'Supplier Name', pattern_type: 'regex', examples: ['Supplier Name: ABC Suppliers Pty Ltd'], regex: 'Supplier\\s*Name\\s*[:\\-]?\\s*([^\\n\\r,;]+)', semantic_hint: 'supplier name', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.name', expected_type: 'string', destination: 'manual_workbook', workbook_field: 'supplier.name', manual_flow_mapping: 'procurement.supplier.name', graph_version },
          ],
        },
        {
          field: {
            name: 'spend_amount',
            data_type: 'money',
            required: true,
            description: 'Supplier spend amount excluding VAT.',
            calculator_key: 'supplier.spend',
            graph_version,
          },
          rules: [
            { name: 'required_spend_amount', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Supplier spend amount not found', graph_version },
          ],
          patterns: [
            { name: 'Amount Excl VAT', pattern_type: 'regex', examples: ['Amount Excl VAT: R 1250000'], regex: 'Amount\\s*Excl\\s*VAT\\s*[:\\-]?\\s*(R\\s?[0-9][0-9,\\s]*(?:\\.[0-9]+)?\\s?(?:m|million|k|thousand)?)', semantic_hint: 'supplier spend amount', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.spend', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'supplier.spend', manual_flow_mapping: 'procurement.supplier.spend', graph_version },
          ],
        },
        {
          field: {
            name: 'bee_level',
            data_type: 'bee_level',
            required: true,
            description: 'Supplier B-BBEE level.',
            calculator_key: 'supplier.bee_level',
            graph_version,
          },
          rules: [
            { name: 'bee_level_range_check', rule_type: 'range', severity: 'error', logic: 'bee_level:1:8', failure_message: 'B-BBEE level must be between 1 and 8', graph_version },
          ],
          patterns: [
            { name: 'B-BBEE Level', pattern_type: 'regex', examples: ['B-BBEE Level: Level Two'], regex: 'B[-\\s]?BBEE\\s*Level\\s*[:\\-]?\\s*(Level\\s*)?([A-Za-z0-9]+)', semantic_hint: 'supplier bee level', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.bee_level', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'supplier.beeLevel', manual_flow_mapping: 'procurement.supplier.beeLevel', graph_version },
          ],
        },
        {
          field: {
            name: 'black_ownership',
            data_type: 'percentage',
            required: false,
            description: 'Supplier black ownership percentage.',
            calculator_key: 'supplier.black_ownership',
            graph_version,
          },
          rules: [
            { name: 'black_ownership_percentage_range', rule_type: 'range', severity: 'error', logic: 'percentage:0:100', failure_message: 'Black ownership percentage must be between 0 and 100', graph_version },
          ],
          patterns: [
            { name: 'Black Ownership', pattern_type: 'regex', examples: ['Black Ownership: 51%'], regex: 'Black\\s+Ownership(?:\\s+Percentage)?\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?\\s*%)', semantic_hint: 'supplier black ownership', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.black_ownership', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'supplier.blackOwnership', manual_flow_mapping: 'procurement.supplier.blackOwnership', graph_version },
          ],
        },
      ],
    },
    {
      document: {
        name: 'Ownership Confirmation',
        description: 'Ownership evidence: share certificate, share register, or ownership confirmation letter.',
        aliases: ['Share Certificate', 'Share Register', 'Ownership Confirmation', 'Ownership Statement', 'Shareholding Certificate'],
        required: true,
        pillar_code: 'OWN',
        graph_version,
      },
      fields: [
        {
          field: { name: 'entity_name', data_type: 'string', required: true, description: 'Measured entity name.', calculator_key: 'ownership.entity_name', graph_version },
          rules: [{ name: 'required_entity_name', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Entity name not found', graph_version }],
          patterns: [{ name: 'Entity Name', pattern_type: 'regex', examples: ['Measured Entity: ABC Pty Ltd'], regex: '(?:Measured\\s+Entity|Entity|Enterprise|Company)\\s*Name\\s*[:\\-]?\\s*([^\\n\\r]+)', semantic_hint: 'entity name', graph_version }],
          calculator_requirements: [{ key: 'ownership.entity_name', expected_type: 'string', destination: 'manual_workbook', workbook_field: 'ownership.entityName', manual_flow_mapping: 'ownership entity name', graph_version }],
        },
        {
          field: { name: 'black_ownership', data_type: 'percentage', required: true, description: 'Black ownership / voting rights percentage.', calculator_key: 'ownership.black_ownership', graph_version },
          rules: [
            { name: 'required_ownership_black', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Black ownership not found', graph_version },
            { name: 'ownership_black_range', rule_type: 'range', severity: 'error', logic: 'percentage:0:100', failure_message: 'Black ownership percentage must be between 0 and 100', graph_version },
          ],
          patterns: [{ name: 'Black Ownership', pattern_type: 'regex', examples: ['Black Ownership: 51%'], regex: 'Black\\s+(?:Ownership|Voting\\s+Rights|Shareholding)(?:\\s+Percentage)?\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?\\s*%)', semantic_hint: 'black ownership percentage', graph_version }],
          calculator_requirements: [{ key: 'ownership.black_ownership', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'ownership.blackOwnership', manual_flow_mapping: 'ownership black ownership', graph_version }],
        },
        {
          field: { name: 'black_women_ownership', data_type: 'percentage', required: false, description: 'Black women ownership percentage.', calculator_key: 'ownership.black_women_ownership', graph_version },
          rules: [{ name: 'ownership_black_women_range', rule_type: 'range', severity: 'error', logic: 'percentage:0:100', failure_message: 'Black women ownership percentage must be between 0 and 100', graph_version }],
          patterns: [{ name: 'Black Women Ownership', pattern_type: 'regex', examples: ['Black Women Ownership: 30%'], regex: 'Black\\s+(?:Women|Woman|Female)\\s+(?:Ownership|Shareholding)(?:\\s+Percentage)?\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?\\s*%)', semantic_hint: 'black women ownership percentage', graph_version }],
          calculator_requirements: [{ key: 'ownership.black_women_ownership', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'ownership.blackWomenOwnership', manual_flow_mapping: 'ownership black women ownership', graph_version }],
        },
      ],
    },
    {
      document: {
        name: 'Employment Equity Report',
        description: 'Management control / employment equity evidence: EE report or board & management representation summary.',
        aliases: ['Employment Equity Report', 'EE Report', 'EEA2', 'Management Control Report', 'Board Representation'],
        required: true,
        pillar_code: 'MAC',
        graph_version,
      },
      fields: [
        {
          field: { name: 'black_representation', data_type: 'percentage', required: true, description: 'Black representation percentage at the measured level.', calculator_key: 'management.black_representation', graph_version },
          rules: [
            { name: 'required_black_representation', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Black representation not found', graph_version },
            { name: 'black_representation_range', rule_type: 'range', severity: 'error', logic: 'percentage:0:100', failure_message: 'Black representation percentage must be between 0 and 100', graph_version },
          ],
          patterns: [{ name: 'Black Representation', pattern_type: 'regex', examples: ['Black Representation: 45%'], regex: 'Black\\s+(?:Representation|Management|Board\\s+Representation|Employees)(?:\\s+Percentage)?\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?\\s*%)', semantic_hint: 'black representation percentage', graph_version }],
          calculator_requirements: [{ key: 'management.black_representation', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'management.blackRepresentation', manual_flow_mapping: 'management black representation', graph_version }],
        },
        {
          field: { name: 'black_women_representation', data_type: 'percentage', required: false, description: 'Black women representation percentage.', calculator_key: 'management.black_women_representation', graph_version },
          rules: [{ name: 'black_women_representation_range', rule_type: 'range', severity: 'error', logic: 'percentage:0:100', failure_message: 'Black women representation percentage must be between 0 and 100', graph_version }],
          patterns: [{ name: 'Black Women Representation', pattern_type: 'regex', examples: ['Black Women Representation: 25%'], regex: 'Black\\s+(?:Women|Woman|Female)\\s+(?:Representation|Management)(?:\\s+Percentage)?\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?\\s*%)', semantic_hint: 'black women representation percentage', graph_version }],
          calculator_requirements: [{ key: 'management.black_women_representation', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'management.blackWomenRepresentation', manual_flow_mapping: 'management black women representation', graph_version }],
        },
      ],
    },
    {
      document: {
        name: 'Workplace Skills Plan',
        description: 'Skills development evidence: Workplace Skills Plan (WSP), Annual Training Report (ATR), or training spend summary.',
        aliases: ['Workplace Skills Plan', 'WSP', 'Annual Training Report', 'ATR', 'Skills Development Report', 'Training Spend Summary'],
        required: true,
        pillar_code: 'SKL',
        graph_version,
      },
      fields: [
        {
          field: { name: 'skills_spend', data_type: 'money', required: true, description: 'Total skills development spend.', calculator_key: 'skills.total_spend', graph_version },
          rules: [{ name: 'required_skills_spend', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'Skills development spend not found', graph_version }],
          patterns: [{ name: 'Skills Spend', pattern_type: 'regex', examples: ['Skills Development Spend: R 500000'], regex: '(?:Total\\s+)?(?:Skills\\s+Development|Training)\\s+Spend\\s*[:\\-]?\\s*(R\\s?[0-9][0-9,\\s]*(?:\\.[0-9]+)?\\s?(?:m|million|k|thousand)?)', semantic_hint: 'skills development spend', graph_version }],
          calculator_requirements: [{ key: 'skills.total_spend', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'skills.totalSpend', manual_flow_mapping: 'skills total spend', graph_version }],
        },
        {
          field: { name: 'black_skills_spend', data_type: 'money', required: false, description: 'Skills development spend on black employees.', calculator_key: 'skills.black_spend', graph_version },
          rules: [],
          patterns: [{ name: 'Black Skills Spend', pattern_type: 'regex', examples: ['Black Training Spend: R 350000'], regex: 'Black\\s+(?:Skills\\s+Development|Training)\\s+Spend\\s*[:\\-]?\\s*(R\\s?[0-9][0-9,\\s]*(?:\\.[0-9]+)?\\s?(?:m|million|k|thousand)?)', semantic_hint: 'black skills development spend', graph_version }],
          calculator_requirements: [{ key: 'skills.black_spend', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'skills.blackSpend', manual_flow_mapping: 'skills black spend', graph_version }],
        },
      ],
    },
    {
      document: {
        name: 'SED Contribution Confirmation',
        description: 'Socio-economic development evidence: SED contribution letter or proof of payment.',
        aliases: ['SED Contribution Confirmation', 'Socio-Economic Development Contribution', 'SED Letter', 'SED Proof of Payment', 'CSI Contribution'],
        required: true,
        pillar_code: 'SED',
        graph_version,
      },
      fields: [
        {
          field: { name: 'sed_contribution', data_type: 'money', required: true, description: 'SED contribution amount.', calculator_key: 'sed.contribution', graph_version },
          rules: [{ name: 'required_sed_contribution', rule_type: 'required', severity: 'error', logic: 'required', failure_message: 'SED contribution amount not found', graph_version }],
          patterns: [{ name: 'SED Contribution', pattern_type: 'regex', examples: ['SED Contribution: R 120000'], regex: '(?:SED|Socio[-\\s]?Economic\\s+Development|CSI)\\s+(?:Contribution|Spend|Amount)\\s*[:\\-]?\\s*(R\\s?[0-9][0-9,\\s]*(?:\\.[0-9]+)?\\s?(?:m|million|k|thousand)?)', semantic_hint: 'sed contribution amount', graph_version }],
          calculator_requirements: [{ key: 'sed.contribution', expected_type: 'number', destination: 'manual_workbook', workbook_field: 'sed.contribution', manual_flow_mapping: 'sed contribution', graph_version }],
        },
        {
          field: { name: 'beneficiary_name', data_type: 'string', required: false, description: 'SED beneficiary name.', calculator_key: 'sed.beneficiary_name', graph_version },
          rules: [],
          patterns: [{ name: 'Beneficiary Name', pattern_type: 'regex', examples: ['Beneficiary: Rural Schools Trust'], regex: '(?:Beneficiary|Recipient)\\s*(?:Name)?\\s*[:\\-]?\\s*([^\\n\\r,;]+)', semantic_hint: 'sed beneficiary name', graph_version }],
          calculator_requirements: [{ key: 'sed.beneficiary_name', expected_type: 'string', destination: 'manual_workbook', workbook_field: 'sed.beneficiaryName', manual_flow_mapping: 'sed beneficiary name', graph_version }],
        },
      ],
    },
  ];
}
