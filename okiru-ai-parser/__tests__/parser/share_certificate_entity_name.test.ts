/**
 * A share certificate names the company whose shares it certifies.
 *
 * While share certificates classified as the generic "Ownership Confirmation",
 * that type's entity_name field read the company name. Classifying by content
 * moved them to the matrix's own share-certificate type, whose fields describe
 * the holding (certificate number, holder, class, shares) and not the company,
 * so the company name stopped being read. The ownership-record types now borrow
 * entity_name — pattern included — from the canonical ownership type, in both
 * ontologies: the bundled one and the one built from the matrix workbook.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { ParserService } from '../../parser/parser_service.js';
import { classifyDocument } from '../../parser/classify_document.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { buildOntologyRecordsFromWorkbook, DEFAULT_ONTOLOGY_MATRIX_PATH } from '../../graph/ontology_loader.js';
import type { DocumentTypeAdjudicator } from '../../parser/type_adjudicator.js';

const SHARE_CERTIFICATE_TYPE = 'Share certificates / security certificates held by each BEE participant';

const CERTIFICATE = {
  file_id: 'doc_share_cert',
  filename: 'certificate.pdf',
  mime_type: 'application/pdf',
  raw_text: [
    'SHARE CERTIFICATE',
    'Authorised Shares: 1000',
    'Certificate Number: | Class: | Number of Shares:',
    'AC001 | Ordinary Shares | 100',
    'Company Name: Acme Trading (Pty) Ltd',
    '(Incorporated in the Republic of South Africa)',
    'This is to certify that J Mokoena is the registered holder of 100 ordinary shares.',
  ].join('\n'),
  tables: [],
  metadata: {},
};

/** A reader that settles the type as a share certificate, as the real one did. */
const readsAsShareCertificate: DocumentTypeAdjudicator = async (_input, candidates) => {
  const pick = candidates.find((c) => c.name === SHARE_CERTIFICATE_TYPE);
  return pick ? { documentType: pick.name, confidence: 0.95, reason: 'a share certificate' } : null;
};

async function workbookRepository(): Promise<InMemoryOntologyRepository> {
  const repository = new InMemoryOntologyRepository();
  await repository.upsertOntology(buildOntologyRecordsFromWorkbook(join(__dirname, '..', '..', DEFAULT_ONTOLOGY_MATRIX_PATH)));
  return repository;
}

describe('the share-certificate type reads the company name', () => {
  it('in the bundled ontology', async () => {
    const knowledge = await new InMemoryOntologyRepository().getDocumentKnowledge(SHARE_CERTIFICATE_TYPE);
    expect(knowledge?.fields.map((f) => f.field.name)).toContain('entity_name');
  });

  it('in the ontology built from the matrix workbook (what the route and the pack eval use)', async () => {
    const repository = await workbookRepository();
    const service = new ParserService(repository, { adjudicator: readsAsShareCertificate });
    const result = await service.resolve(CERTIFICATE);

    expect(result.document_type).toBe(SHARE_CERTIFICATE_TYPE);
    expect(result.extracted_fields.entity_name?.raw_value).toBe('Acme Trading (Pty) Ltd');
  });

  it('borrows the field as a reading, not as evidence of the type (classification is unchanged)', async () => {
    // The bundled ontology: its matrix types declare no required field, so every
    // field they carry would otherwise count as evidence.
    const classification = await classifyDocument(CERTIFICATE, new InMemoryOntologyRepository());
    const certificate = classification.ranked?.find((c) => c.document_type === SHARE_CERTIFICATE_TYPE);
    expect(certificate).toBeDefined();
    expect(certificate?.matched_evidence).not.toContain('entity_name');
  });

  it('borrows the field without making it required (the certificate is not failed for lacking it)', async () => {
    const knowledge = await (await workbookRepository()).getDocumentKnowledge(SHARE_CERTIFICATE_TYPE);
    const entity = knowledge?.fields.find((f) => f.field.name === 'entity_name');
    expect(entity?.field.required).toBe(false);
    expect(entity?.rules.some((rule) => rule.rule_type === 'required')).toBe(false);
  });
});
