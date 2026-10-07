/**
 * A supplier's certificate can never fill the client's own ownership.
 *
 * `black_ownership_percentage` / `black_women_ownership_percentage` (and the
 * short `black_ownership` / `black_women_ownership`) mean the MEASURED ENTITY's
 * ownership: the calculator mapping sends them to ownership.*, and the web
 * field bridge maps them UNSCOPED into the ownership grid. A supplier's
 * certificate states the SUPPLIER's ownership, so the certificate skill — which
 * applies only to supplier certificates (the canonical "B-BBEE Certificate" and
 * the per-sampled-supplier ESD spec) — asks for the supplier names instead.
 *
 * All values here are invented.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSkills, resetSkillsCache } from '../../src/services/skills.js';
import { agentTargetFor } from '../../src/services/agentExtraction.js';
import { fieldElementIndex, mapEntitiesToCalculator } from '../../src/services/entityCalculatorMapping.js';
import { resolveCaseEntities } from '../../src/services/entityResolution.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';
import { findDocumentById } from '../../schemas/verification_document_matrix.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const parserRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(parserRoot, '..');

const SUPPLIER_SPEC = 'esd__valid_b_bbee_verification_certificate_per_sampled_supplier';
const CERT_TARGETS = ['B-BBEE Certificate', SUPPLIER_SPEC, 'bbbee_verification_certificate'];

/**
 * The names that land in the measured entity's own ownership figures, read from
 * the two places that route them so the list cannot drift from the code.
 */
function measuredEntityOwnershipFields(): Set<string> {
  const names = new Set<string>();
  const mapping = readFileSync(path.join(parserRoot, 'src/services/entityCalculatorMapping.ts'), 'utf8');
  for (const m of mapping.matchAll(/field: '([a-z0-9_]+)', calculatorKey: 'ownership\.black(?:_women)?_ownership'/g)) names.add(m[1]);
  const bridgeFile = path.join(repoRoot, 'apps/web/src/lib/parserFieldBridge.ts');
  if (existsSync(bridgeFile)) {
    const bridge = readFileSync(bridgeFile, 'utf8');
    for (const m of bridge.matchAll(/^\s+([a-z][a-z0-9_]*): \{ section: "ownership", column: "black(?:Women)?Ownership"/gm)) names.add(m[1]);
  }
  return names;
}

describe('supplier certificate ownership stays the supplier\'s', () => {
  beforeEach(() => resetSkillsCache());

  it('the measured-entity ownership names are found where the code routes them', () => {
    const names = measuredEntityOwnershipFields();
    expect(names.has('black_ownership_percentage')).toBe(true);
    expect(names.has('black_women_ownership_percentage')).toBe(true);
    expect(names.has('supplier_black_ownership_percentage')).toBe(false);
  });

  it('the certificate skill asks a supplier certificate for the supplier ownership names', () => {
    const owned = measuredEntityOwnershipFields();
    for (const id of CERT_TARGETS) {
      const target = agentTargetFor(id);
      expect(target, id).not.toBeNull();
      const names = target!.fields.map((f) => f.name);
      expect(names, id).toContain('supplier_black_ownership_percentage');
      expect(names, id).toContain('supplier_black_women_ownership_percentage');
      for (const name of names) expect(owned.has(name), `${id} asks for "${name}"`).toBe(false);
    }
  });

  it('no skill for a third party\'s document (supplier, beneficiary) asks for the measured entity\'s ownership', () => {
    const owned = measuredEntityOwnershipFields();
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    for (const skill of registry.skills) {
      if (skill.element !== 'ESD' && skill.element !== 'SED') continue;
      for (const target of [skill.id, ...skill.appliesTo]) {
        const fields = agentTargetFor(target)?.fields.map((f) => f.name) ?? skill.fields.map((f) => f.name);
        for (const name of fields) expect(owned.has(name), `${skill.id} via ${target} asks for "${name}"`).toBe(false);
      }
    }
  });

  it('an agent-read supplier certificate reaches the supplier keys, never ownership.*', () => {
    expect(findDocumentById(SUPPLIER_SPEC)?.element).toBe('ESD');
    const extraction: DocumentExtraction = {
      documentId: SUPPLIER_SPEC,
      documentName: 'Valid B-BBEE verification certificate per sampled supplier',
      sourceFile: 'supplier-cert.pdf',
      values: [
        { field: 'supplier_black_ownership_percentage', value: '51.00%', sourceFile: 'supplier-cert.pdf', sourceDocumentId: SUPPLIER_SPEC },
        { field: 'supplier_black_women_ownership_percentage', value: '30.20%', sourceFile: 'supplier-cert.pdf', sourceDocumentId: SUPPLIER_SPEC },
      ],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
    };
    const result = mapEntitiesToCalculator(resolveCaseEntities([extraction]), fieldElementIndex([extraction]));
    expect(result.payload['supplier.black_ownership']).toBe(51);
    expect(result.payload['supplier.black_women_ownership']).toBeCloseTo(30.2);
    expect(result.payload['ownership.black_ownership']).toBeUndefined();
    expect(result.payload['ownership.black_women_ownership']).toBeUndefined();
  });
});
