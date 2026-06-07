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
        aliases: ['BEE Certificate', 'BBBEE Certificate', 'B-BBEE Affidavit', 'BEE Affidavit'],
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
            { name: 'B-BBEE Status Level', pattern_type: 'regex', examples: ['B-BBEE Status Level: Level Two'], regex: 'B[-\\s]?BBEE\\s*(?:Status\\s*)?Level\\s*[:\\-]?\\s*(Level\\s*)?([A-Za-z0-9]+)', semantic_hint: 'bee level', graph_version },
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
            { name: 'Black Ownership', pattern_type: 'regex', examples: ['Black Ownership: 51%'], regex: 'Black\\s+Ownership\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?\\s*%)', semantic_hint: 'black ownership percentage', graph_version },
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
            { name: 'Expiry Date', pattern_type: 'regex', examples: ['Expiry Date: 01 Feb 2027'], regex: '(?:Expiry|Expiration|Valid\\s+Until)\\s*Date?\\s*[:\\-]?\\s*([0-9]{1,2}\\s+[A-Za-z]{3,9}\\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\\/\\-][0-9]{1,2}[\\/\\-][0-9]{4})', semantic_hint: 'certificate expiry date', graph_version },
          ],
          calculator_requirements: [
            { key: 'supplier.certificate_expiry', expected_type: 'date', destination: 'manual_workbook', workbook_field: 'supplier.expiryDate', manual_flow_mapping: 'procurement.supplier.expiryDate', graph_version },
          ],
        },
      ],
    },
  ];
}
