import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Drift guard. The markdown converter physically exists in two Docker-isolated
 * services; `apps/api`'s copy is GENERATED from the canonical parser file by
 * scripts/sync-shared-markdown.mjs. If someone edits either the canonical source
 * or the generated copy without re-running the sync, this test fails — so the two
 * can never silently diverge.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CANONICAL = resolve(repoRoot, 'okiru-ai-parser/src/services/markdownConversion.ts');
const GENERATED = resolve(repoRoot, 'apps/api/pipeline/extraction/documentMarkdown.ts');

/** Strip the leading `//` generated-banner lines and the blank line after them. */
function stripBanner(source: string): string {
  const lines = source.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('//')) i += 1;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  return lines.slice(i).join('\n');
}

describe('shared markdown converter sync', () => {
  it('apps/api documentMarkdown.ts matches the canonical parser source', () => {
    const canonical = readFileSync(CANONICAL, 'utf8');
    const generatedBody = stripBanner(readFileSync(GENERATED, 'utf8'));
    expect(generatedBody).toBe(canonical);
  });
});
