/**
 * A company profile is the pack's evidence for the sector: it says what the
 * business does. The skill asked for an industry "only when the profile states
 * a sector", so a profile describing a trucking business in prose returned no
 * industry at all, and nothing could be set beside the sector chosen for the
 * scorecard. The industry is now named with one plain name from a closed list,
 * and is still never a B-BBEE sector code.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSkills } from '../../src/services/skills.js';

const parserRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('company profile skill: the industry', () => {
  const skill = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') }).skillFor('company_profile')!;
  const industry = skill.fields.find((field) => field.name === 'industry_sector')!;

  it('names the industry with one plain name from a closed list', () => {
    expect(industry.description).toMatch(/ONE plain industry name/);
    for (const name of ['Transport', 'Construction', 'Property', 'Tourism', 'ICT', 'Agriculture', 'Mining']) {
      expect(industry.description).toContain(name);
    }
  });

  it('still never asks for a B-BBEE sector code', () => {
    expect(industry.description).toMatch(/never a B-BBEE sector code/);
  });

  it('is read from what the profile says the business does, not only from a "Sector" label', () => {
    expect(industry.labels).toEqual(expect.arrayContaining(['Primary function']));
    expect(industry.description).not.toMatch(/Only a sector the profile itself states/);
  });

  it('its worked example names the industry its prose describes', () => {
    expect(skill.sections.example).toMatch(/"industry_sector": "Construction"/);
  });
});
