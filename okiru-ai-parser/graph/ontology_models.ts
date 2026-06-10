import type { ParserDataType } from '../schemas/document_types.js';

export interface PillarNode {
  name: string;
  code: string;
  graph_version: string;
}

export interface DocumentTypeNode {
  name: string;
  description: string;
  aliases: string[];
  required: boolean;
  pillar_code: string;
  graph_version: string;
}

export interface ExtractionFieldNode {
  name: string;
  data_type: ParserDataType;
  required: boolean;
  description: string;
  calculator_key?: string;
  graph_version: string;
}

export interface ValidationRuleNode {
  name: string;
  rule_type: string;
  severity: 'warning' | 'error';
  logic: string;
  failure_message: string;
  graph_version: string;
}

export interface PatternNode {
  name: string;
  pattern_type: 'regex' | 'semantic' | 'label';
  examples: string[];
  regex?: string;
  semantic_hint?: string;
  graph_version: string;
}

export interface CalculatorRequirementNode {
  key: string;
  expected_type: string;
  destination: string;
  workbook_field: string;
  manual_flow_mapping: string;
  graph_version: string;
}

export interface FieldKnowledge {
  field: ExtractionFieldNode;
  rules: ValidationRuleNode[];
  patterns: PatternNode[];
  calculator_requirements: CalculatorRequirementNode[];
}

export interface DocumentKnowledge {
  document: DocumentTypeNode;
  fields: FieldKnowledge[];
}

export interface OntologyRecord {
  pillar: PillarNode;
  document: DocumentTypeNode;
  fields: FieldKnowledge[];
}

export interface OntologyRepository {
  upsertOntology(records: OntologyRecord[]): Promise<{ nodes: number; relationships: number }>;
  getDocumentKnowledge(documentType: string): Promise<DocumentKnowledge | null>;
  listDocumentTypes(): Promise<DocumentTypeNode[]>;
  close?(): Promise<void>;
}
