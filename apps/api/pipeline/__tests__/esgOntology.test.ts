import { describe, expect, it } from 'vitest';
import {
  ESG_ONTOLOGY,
  calculateActivityEmissions,
  findEsgTopics,
  getEsgFramework,
  getEsgMetric,
} from '../esgOntology.js';

describe('ESG workshop ontology', () => {
  it('models all three ESG pillars and linked topics', () => {
    expect(Object.keys(ESG_ONTOLOGY.pillars)).toEqual(['environmental', 'social', 'governance']);
    expect(ESG_ONTOLOGY.topics.every((topic) => topic.source.slides.length > 0)).toBe(true);
    expect(ESG_ONTOLOGY.relationships.some((edge) => edge.from === 'environmental' && edge.to === 'climate_emissions')).toBe(true);
  });

  it('distinguishes financial, impact, and double materiality', () => {
    expect(ESG_ONTOLOGY.materiality.financial.perspective).toBe('outside-in');
    expect(ESG_ONTOLOGY.materiality.impact.perspective).toBe('inside-out');
    expect(ESG_ONTOLOGY.materiality.double.frameworks).toContain('CSRD_ESRS');
  });

  it('represents framework interoperability and time-sensitive scope', () => {
    expect(getEsgFramework('ISSB_S2')?.relatedFrameworks).toContain('TCFD');
    expect(getEsgFramework('CSRD_ESRS')?.source.timeSensitive).toBe(true);
  });

  it('finds topics deterministically without an LLM', () => {
    expect(findEsgTopics('How do we measure carbon and GHG emissions?')[0]?.id).toBe('climate_emissions');
    expect(findEsgTopics('supplier labour due diligence').map((topic) => topic.id)).toContain('human_rights');
    expect(findEsgTopics('quantum propulsion')).toEqual([]);
  });

  it('links metrics to evidence and calculates activity emissions', () => {
    expect(getEsgMetric('scope_1_emissions')?.evidence).toContain('Fuel invoices');
    expect(calculateActivityEmissions(50_000, 2.68)).toBe(134);
    expect(() => calculateActivityEmissions(-1, 2.68)).toThrow(/non-negative/);
  });
});
