/**
 * SLS Coverage Check
 *
 * Validates Scorecard Logic Spec (SLS) markdown files under docs/domain/sectors/.
 * Future: compare parsed sections against CalculatorConfig / sectorConfig.ts.
 *
 * Usage:
 *   pnpm exec tsx scripts/sls-coverage-check.ts
 *   pnpm exec tsx scripts/sls-coverage-check.ts --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SECTORS_DIR = path.join(REPO_ROOT, 'docs', 'domain', 'sectors');

const SKIP_FILES = new Set(['sls-template.md', 'README.md']);

/** Required top-level sections — any alias in a group satisfies the requirement. */
const REQUIRED_SECTION_ALIASES: readonly (readonly string[])[] = [
  ['header', 'document metadata'],
  ['sector context', 'visual conventions', 'global inputs'],
  ['pillar inventory', 'pillar max', 'pillar structure', 'pillar summary'],
  ['industry norms', 'industry norm'],
  ['discounting', 'level determination', 'recognition'],
  ['open questions'],
];

/** Body-text fallbacks when headings use numbered sections (e.g. "## 3. Global inputs"). */
const BODY_SECTION_FALLBACKS: readonly { aliases: readonly string[]; needles: readonly string[] }[] = [
  { aliases: ['industry norms', 'industry norm'], needles: ['industry norm', 'industry norms sheet', 'applicable industry norms'] },
];

/** Per-pillar content markers (any alias satisfies). */
const PILLAR_CONTENT_MARKERS: readonly (readonly string[])[] = [
  ['inputs table', '**inputs:**', 'inputs:'],
  ['targets table', 'target', 'max pts', 'indicator'],
  ['formula block', '**formula:**', 'formula:', 'formula graph'],
  ['bonus', 'bonus', 'penalty'],
  ['cross-pillar dependencies', 'cross-pillar', 'formula graph', 'global inputs'],
];

/** At least one pillar section must exist (Ownership is the canonical first pillar). */
const MIN_PILLAR_SECTIONS = ['ownership', 'management control', 'skills development'] as const;

interface FileResult {
  file: string;
  ok: boolean;
  missing: string[];
  warnings: string[];
}

function listSlsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSlsFiles(full));
    } else if (entry.isFile() && entry.name === 'sls.md') {
      out.push(full);
    }
  }
  return out;
}

function normalizeHeadings(content: string): string[] {
  return content
    .split(/\r?\n/)
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#+\s+/, '').trim().toLowerCase());
}

function sectionPresent(headings: string[], needle: string): boolean {
  return headings.some((h) => h.includes(needle));
}

function validateSlsFile(filePath: string, strict: boolean): FileResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const headings = normalizeHeadings(content);
  const missing: string[] = [];
  const warnings: string[] = [];

  const bodyLower = content.toLowerCase();

  for (const aliases of REQUIRED_SECTION_ALIASES) {
    const inHeading = aliases.some((a) => sectionPresent(headings, a));
    const fallback = BODY_SECTION_FALLBACKS.find((f) =>
      f.aliases.some((a) => aliases.includes(a)),
    );
    const inBody = fallback?.needles.some((n) => bodyLower.includes(n)) ?? false;
    if (!inHeading && !inBody) {
      missing.push(`Missing section (one of: ${aliases.join(', ')})`);
    }
  }

  const pillarHits = MIN_PILLAR_SECTIONS.filter((p) => sectionPresent(headings, p));
  if (pillarHits.length === 0) {
    missing.push('No pillar sections found (expected at least Ownership / MC / Skills headings)');
  }

  for (const markers of PILLAR_CONTENT_MARKERS) {
    if (!markers.some((m) => bodyLower.includes(m))) {
      warnings.push(`Pillar content marker not found (one of: ${markers.join(', ')})`);
    }
  }

  if (strict && warnings.length > 0) {
    for (const w of warnings) {
      missing.push(w);
    }
  }

  const rel = path.relative(REPO_ROOT, filePath);
  return { file: rel, ok: missing.length === 0, missing, warnings };
}

function expectedSectorPaths(): string[] {
  return [
    'docs/domain/sectors/rcogp/generic',
    'docs/domain/sectors/rcogp/qse',
    'docs/domain/sectors/ict/generic',
    'docs/domain/sectors/ict/qse',
    'docs/domain/sectors/agri/generic',
    'docs/domain/sectors/fsc/generic',
  ];
}

function main(): void {
  const strict = process.argv.includes('--strict');
  console.log('SLS Coverage Check');
  console.log('='.repeat(60));
  console.log(`Sectors root: ${path.relative(REPO_ROOT, SECTORS_DIR)}`);
  console.log(`Mode: ${strict ? 'strict' : 'default'}\n`);

  let exitCode = 0;

  for (const rel of expectedSectorPaths()) {
    const full = path.join(REPO_ROOT, rel);
    const exists = fs.existsSync(full);
    const marker = exists ? '✓' : '✗';
    console.log(`${marker} ${rel}`);
    if (!exists) {
      exitCode = 1;
    }
  }

  console.log('\nSLS documents (excluding template/README):');
  const slsFiles = listSlsFiles(SECTORS_DIR).filter(
    (f) => path.basename(f) !== 'sls-template.md' && !f.endsWith(`${path.sep}README.md`),
  );

  if (slsFiles.length === 0) {
    console.log('  (none yet — copy sls-template.md to <sector>/<size>/sls.md)\n');
    console.log('Template: docs/domain/sectors/sls-template.md');
    console.log('\nResult: folder structure OK; awaiting SLS authoring.');
    process.exit(exitCode);
  }

  const results: FileResult[] = slsFiles.map((f) => validateSlsFile(f, strict));

  for (const r of results) {
    console.log(`\n${r.file}`);
    if (r.ok) {
      console.log('  Status: PASS');
    } else {
      console.log('  Status: FAIL');
      exitCode = 1;
      for (const m of r.missing) console.log(`  - ${m}`);
    }
    for (const w of r.warnings) console.log(`  ! ${w}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('\n' + '='.repeat(60));
  console.log(`SLS files: ${results.length} | Passed: ${passed} | Failed: ${results.length - passed}`);
  console.log('Future: wire CalculatorConfig comparison in this script.\n');

  process.exit(exitCode);
}

main();
