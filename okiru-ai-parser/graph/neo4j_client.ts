import { createLogger } from '../src/logger.js';
import type { DocumentKnowledge, DocumentTypeNode, OntologyRecord, OntologyRepository } from './ontology_models.js';

const logger = createLogger('Neo4jParserGraph');

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

function getNeo4jConfigFromEnv(): Neo4jConfig | null {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;
  if (!uri || !username || !password) return null;
  return { uri, username, password, database: process.env.NEO4J_DATABASE || undefined };
}

export class MissingNeo4jConfigError extends Error {
  constructor() {
    super('Neo4j parser graph is not configured. Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, and optionally NEO4J_DATABASE.');
  }
}

export class Neo4jOntologyRepository implements OntologyRepository {
  private driverPromise: Promise<any>;
  private database?: string;

  constructor(config = getNeo4jConfigFromEnv()) {
    if (!config) throw new MissingNeo4jConfigError();
    this.database = config.database;
    this.driverPromise = this.createDriver(config);
  }

  private async createDriver(config: Neo4jConfig): Promise<any> {
    const moduleName = 'neo4j-driver';
    const neo4j = await import(moduleName);
    return neo4j.default.driver(config.uri, neo4j.default.auth.basic(config.username, config.password));
  }

  private async run<T>(query: string, params: Record<string, unknown>, map: (records: any[]) => T): Promise<T> {
    const driver = await this.driverPromise;
    const session = driver.session(this.database ? { database: this.database } : undefined);
    try {
      const result = await session.run(query, params);
      return map(result.records);
    } finally {
      await session.close();
    }
  }

  async upsertOntology(records: OntologyRecord[]): Promise<{ nodes: number; relationships: number }> {
    const query = `
      UNWIND $records AS record
      MERGE (p:Pillar {code: record.pillar.code, graph_version: record.pillar.graph_version})
        SET p.name = record.pillar.name
      MERGE (d:DocumentType {name: record.document.name, graph_version: record.document.graph_version})
        SET d.description = record.document.description,
            d.aliases = record.document.aliases,
            d.required = record.document.required,
            d.pillar_code = record.document.pillar_code
      MERGE (p)-[:REQUIRES_DOCUMENT]->(d)
      WITH record, d
      UNWIND record.fields AS fk
      MERGE (f:ExtractionField {name: fk.field.name, graph_version: fk.field.graph_version})
        SET f.data_type = fk.field.data_type,
            f.required = fk.field.required,
            f.description = fk.field.description,
            f.calculator_key = fk.field.calculator_key
      MERGE (d)-[:EXPECTS_FIELD]->(f)
      FOREACH (rule IN fk.rules |
        MERGE (r:ValidationRule {name: rule.name, graph_version: rule.graph_version})
          SET r.rule_type = rule.rule_type,
              r.severity = rule.severity,
              r.logic = rule.logic,
              r.failure_message = rule.failure_message
        MERGE (f)-[:VALIDATED_BY]->(r)
      )
      FOREACH (pattern IN fk.patterns |
        MERGE (pat:Pattern {name: pattern.name, graph_version: pattern.graph_version})
          SET pat.pattern_type = pattern.pattern_type,
              pat.examples = pattern.examples,
              pat.regex = pattern.regex,
              pat.semantic_hint = pattern.semantic_hint
        MERGE (f)-[:MATCHED_BY]->(pat)
      )
      FOREACH (calc IN fk.calculator_requirements |
        MERGE (c:CalculatorRequirement {key: calc.key, graph_version: calc.graph_version})
          SET c.expected_type = calc.expected_type,
              c.destination = calc.destination,
              c.workbook_field = calc.workbook_field,
              c.manual_flow_mapping = calc.manual_flow_mapping
        MERGE (f)-[:MAPS_TO]->(c)
        MERGE (d)-[:SUPPORTS_CALCULATION]->(c)
      )
    `;
    await this.run(query, { records }, () => null);
    const nodes = records.reduce((sum, r) => sum + 2 + r.fields.length * 4, 0);
    const relationships = records.reduce((sum, r) => sum + 1 + r.fields.length * 4, 0);
    logger.info('Parser ontology upserted', { documentTypes: records.length, nodes, relationships });
    return { nodes, relationships };
  }

  async getDocumentKnowledge(documentType: string): Promise<DocumentKnowledge | null> {
    const query = `
      MATCH (d:DocumentType)-[:EXPECTS_FIELD]->(f:ExtractionField)
      WHERE toLower(d.name) = toLower($documentType)
      OPTIONAL MATCH (f)-[:VALIDATED_BY]->(r:ValidationRule)
      OPTIONAL MATCH (f)-[:MATCHED_BY]->(p:Pattern)
      OPTIONAL MATCH (f)-[:MAPS_TO]->(c:CalculatorRequirement)
      RETURN d, f, collect(DISTINCT r) AS rules, collect(DISTINCT p) AS patterns, collect(DISTINCT c) AS calculator_requirements
    `;
    return this.run(query, { documentType }, (records) => {
      if (records.length === 0) return null;
      const document = records[0].get('d').properties as DocumentTypeNode;
      return {
        document,
        fields: records.map((record) => ({
          field: record.get('f').properties,
          rules: record.get('rules').filter(Boolean).map((node: any) => node.properties),
          patterns: record.get('patterns').filter(Boolean).map((node: any) => node.properties),
          calculator_requirements: record.get('calculator_requirements').filter(Boolean).map((node: any) => node.properties),
        })),
      };
    });
  }

  async listDocumentTypes(): Promise<DocumentTypeNode[]> {
    return this.run(
      'MATCH (d:DocumentType) RETURN d ORDER BY d.name',
      {},
      (records) => records.map((record) => record.get('d').properties as DocumentTypeNode),
    );
  }

  async close(): Promise<void> {
    const driver = await this.driverPromise;
    await driver.close();
  }
}

export function createNeo4jOntologyRepository(): Neo4jOntologyRepository {
  return new Neo4jOntologyRepository();
}
