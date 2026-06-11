import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Feedback #6 asked to confirm there is no stray "Data Date" field. This guards
 * against one being (re)introduced into the Ownership / Skills pillars or the
 * Toolkit type model.
 */
function readSource(relativeToThisFile: string): string {
  return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), 'utf8');
}

const FILES = {
  ownership: '../../pages/pillars/Ownership.tsx',
  skills: '../../pages/pillars/SkillsDevelopment.tsx',
  types: '../types.ts',
};

describe('"Data Date" field is absent (feedback #6)', () => {
  for (const [name, rel] of Object.entries(FILES)) {
    it(`${name} has no "Data Date" label or dataDate identifier`, () => {
      const src = readSource(rel);
      expect(/data\s*date/i.test(src)).toBe(false);
      expect(/dataDate/.test(src)).toBe(false);
    });
  }
});
