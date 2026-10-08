/**
 * PER-DOCUMENT-TYPE SKILLS — what an expert knows about reading one kind of
 * evidence, kept as data beside the matrix rather than buried in prompts.
 *
 * The matrix (schemas/verification_document_matrix.generated.ts) tells the
 * model WHAT an auditor wants from a document. It does not say where those
 * values sit on a real South African payroll, AFS or CIPC printout, which
 * wordings mean the same thing, or which tempting number is the wrong one. Most
 * of the values the parser missed or got wrong on a real evidence pack were
 * missed for exactly those reasons: a level written in words, a registration
 * number printed with spaced slashes, a tax-loss figure read as procurement
 * spend, a column heading read as a shareholder.
 *
 * A skill is one markdown file per document type,
 * `skills/<domain>/<skill-id>.md`:
 *
 *   ---
 *   id: share_register
 *   appliesTo: [ownership__securities_share_register]   # matrix ids / canonical names
 *   element: OWNERSHIP
 *   version: 1
 *   hard: true                     # feeds the agent-loop gate (Step 3)
 *   classify: { is: "...", isNot: [...], filenameHints: [...], contentSignals: [...] }
 *   rowsField: holdings_table      # array the rowLevel fields are returned under
 *   fields:
 *     - { name: shareholder_name, type: text, required: true, rowLevel: true, labels: [...], description: "..." }
 *   newFields: [...]               # field names no parser/mapping code speaks yet
 *   dropFields: [...]              # spec keys this skill deliberately does not ask for
 *   newType: { name, aliases, narrows? }  # only for a type the matrix does not have yet
 *   ---
 *   ## What it is / is not
 *   ## Where values sit
 *   ## Traps
 *   ## Worked example
 *
 * Files starting with `_` are domain-wide (`_global.md`): traps that apply to
 * every document, with no front-matter `appliesTo` or fields.
 *
 * DOMAINS. `skills/bbbee` names B-BBEE matrix ids or the canonical B-BBEE types
 * in `appliesTo`. `skills/esg` names ESG matrix ids
 * (schemas/esg_document_matrix.ts) and nothing else: ESG has no canonical
 * types, so a document the ESG matrix has no spec for (a client's own monthly
 * data dashboard) is a `newType` there too. ESG field names are the ESG
 * matrix's, its grid rows' (extractionDomain ESG_GRIDS, e.g. `energy_site_rows`)
 * and the code readers' (`esg_monthly_rows`), or declared in `newFields`.
 *
 * THE OUTPUT CONTRACT every skill teaches (and every worked example shows):
 * ONE flat JSON object per document, keyed by the field names — document-level
 * fields as keys, row-level fields as an array of objects under `rowsField` —
 * plus `exceptions`. Values are copied AS PRINTED (a spaced registration
 * number, a level in words, a date as written); code normalises them later.
 * The model never computes a figure: sums, counts, x100 and "inside the
 * measurement period" are done in code (skillDerivations.ts) and labelled
 * derived there.
 *
 * NEW DOCUMENT TYPES. A type the matrix and the canonical ontology do not have
 * is declared by the one skill that reads it, in `newType` — never by naming
 * an invented id in `appliesTo` (which still fails loudly). Its name and
 * aliases must not repeat any existing type's name, id or alias, unless the
 * new type is a narrower kind of an existing umbrella type and says so in
 * `narrows` (a beneficial interest register narrows the canonical "Ownership
 * Confirmation", which lists it among its aliases). `registry.newTypes` is the
 * list the Step 2.8 supplement registers as document types.
 *
 * LOUD BY DESIGN. Loading throws on anything malformed — an unknown spec id in
 * `appliesTo`, two skills claiming the same spec, a missing section, a field
 * type outside the vocabulary — because a skill that silently fails to apply is
 * indistinguishable from a model that read the document badly.
 *
 * Everything here is pure apart from reading the directory once per domain.
 * Wiring the skills into prompts (aiExtraction promptFor, the adjudicator menu,
 * the Pass A menu, ontology toFields, the extraction cache key) is deliberately
 * NOT done here.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';
import { ESG_DOCUMENT_MATRIX } from '../../schemas/esg_document_matrix.js';
import { baseDocumentKnowledge } from '../../graph/ontology_queries.js';
import type { ExtractionDomain } from './extractionDomain.js';
import {
  FrontMatterError,
  parseFrontMatterYaml,
  splitFrontMatter,
  type FrontMatterValue,
} from './skillFrontMatter.js';

/**
 * The value vocabulary a skill field can declare. `number` is a measured
 * quantity with a unit (kWh, litres, kg, kL, km, hours) — the ESG documents'
 * staple; `count` is a whole number of things; `money` is Rand.
 */
export const SKILL_FIELD_TYPES = [
  'text', 'date', 'money', 'percent', 'count', 'number', 'regno', 'idno', 'bool', 'level',
] as const;
export type SkillFieldType = (typeof SKILL_FIELD_TYPES)[number];

export interface SkillField {
  name: string;
  type: SkillFieldType;
  required: boolean;
  /** True when the value is a column of a row inside `rowsField`. */
  rowLevel: boolean;
  /** Wordings the document uses for this value ("Basic Salary", "BASIC"). */
  labels: string[];
  description: string;
}

export interface SkillClassify {
  /** One sentence: what this document is. */
  is: string;
  /** Document types it is commonly confused with, and is not. */
  isNot: string[];
  filenameHints: string[];
  contentSignals: string[];
}

export interface SkillSections {
  whatItIs: string;
  where: string;
  traps: string;
  example: string;
}

export interface SkillNewType {
  name: string;
  aliases: string[];
  /**
   * The existing umbrella type this one is a narrower kind of, when its name or
   * aliases repeat that type's aliases. Null for a type nothing covers yet.
   */
  narrows: string | null;
}

/** A new document type as the 2.8 supplement registers it. */
export interface RegisteredNewType extends SkillNewType {
  skillId: string;
  element: string;
}

export interface Skill {
  id: string;
  domain: ExtractionDomain;
  appliesTo: string[];
  element: string;
  version: number;
  hard: boolean;
  classify: SkillClassify;
  /** Array field the rowLevel fields are returned under, when there are any. */
  rowsField: string | null;
  fields: SkillField[];
  /** Field names introduced by this skill that no existing code speaks yet. */
  newFields: string[];
  /** Spec expectedFields this skill deliberately does not ask the model for. */
  dropFields: string[];
  /** A type the matrix does not have yet (Step 2.8 supplement), when declared. */
  newType: SkillNewType | null;
  sections: SkillSections;
  /** sha256 of the file (line endings normalised) — the cache salt for anything it shapes. */
  hash: string;
  file: string;
}

export interface GlobalSkill {
  id: string;
  domain: ExtractionDomain;
  version: number;
  traps: string;
  where: string | null;
  hash: string;
  file: string;
}

export interface SkillRegistry {
  domain: ExtractionDomain;
  dir: string;
  skills: Skill[];
  global: GlobalSkill | null;
  /** sha256 over every file hash, in file order — one salt for the whole set. */
  hash: string;
  /** Every newType a skill declares, for registration as a document type (Step 2.8). */
  newTypes: RegisteredNewType[];
  /**
   * Lookup by skill id, applied spec id, spec name, canonical name, new-type
   * name or alias — then, when none of those match, by an existing type's own
   * alias ("BEE Certificate", "Share Register"). An alias resolves only when it
   * is unambiguous: every matrix type carrying it (or, when no matrix type
   * does, every canonical type carrying it) is read by the same skill. A wrong
   * skill is worse than none.
   */
  skillFor(specIdOrName: string): Skill | null;
}

export class SkillLoadError extends Error {
  constructor(message: string, readonly file?: string) {
    super(file ? `${file}: ${message}` : message);
    this.name = 'SkillLoadError';
  }
}

const REQUIRED_SECTIONS: Array<{ key: keyof SkillSections; heading: string }> = [
  { key: 'whatItIs', heading: 'What it is / is not' },
  { key: 'where', heading: 'Where values sit' },
  { key: 'traps', heading: 'Traps' },
  { key: 'example', heading: 'Worked example' },
];

const FIELD_NAME = /^[a-z][a-z0-9_]*$/;
const SKILL_ID = /^_?[a-z][a-z0-9_]*$/;

// ─── Known document ids per domain ──────────────────────────────────────────

interface AliasCarriers {
  /** Matrix ids whose name or aliases normalise to this alias. */
  matrix: Set<string>;
  /** Canonical type names whose name or aliases normalise to it. */
  canonical: Set<string>;
}

interface DomainCatalogue {
  /** Lowercased id or name → the canonical spelling. */
  known: Map<string, string>;
  /** Matrix id → its name, for name-based lookup. */
  nameById: Map<string, string>;
  /** Every existing document name and id, lowercased — a newType must not reuse one. */
  taken: Set<string>;
  /** Normalised alias (names included) → the existing types that carry it. */
  aliasCarriers: Map<string, AliasCarriers>;
  elements: Set<string>;
}

/**
 * The form two spellings of one document name share: case, punctuation and a
 * trailing plural "s" do not tell types apart ("Share certificates" is
 * "Share Certificate"; "Register of Beneficial Interests" is "Register of
 * beneficial interest").
 */
export function normaliseTypeLabel(label: string): string {
  return String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .join(' ');
}

function catalogueFor(domain: ExtractionDomain): DomainCatalogue {
  const known = new Map<string, string>();
  const nameById = new Map<string, string>();
  const taken = new Set<string>();
  const aliasCarriers = new Map<string, AliasCarriers>();
  const carry = (label: string, kind: keyof AliasCarriers, target: string) => {
    const key = normaliseTypeLabel(label);
    if (!key) return;
    const entry = aliasCarriers.get(key) ?? { matrix: new Set<string>(), canonical: new Set<string>() };
    entry[kind].add(target);
    aliasCarriers.set(key, entry);
  };
  const elements = new Set<string>(['FINANCIALS', 'OTHER']);
  const matrix = domain === 'esg' ? ESG_DOCUMENT_MATRIX : VERIFICATION_DOCUMENT_MATRIX;
  for (const doc of matrix) {
    known.set(doc.id.toLowerCase(), doc.id);
    nameById.set(doc.id, doc.name);
    taken.add(doc.id.toLowerCase());
    taken.add(doc.name.toLowerCase());
    elements.add(doc.element);
    for (const label of [doc.name, ...(doc.aliases ?? [])]) carry(label, 'matrix', doc.id);
  }
  if (domain === 'bbbee') {
    // The hand-authored canonical types (B-BBEE Certificate, Ownership
    // Confirmation, ...) are addressed by NAME: they have no matrix id.
    const matrixNames = new Set(VERIFICATION_DOCUMENT_MATRIX.map((doc) => doc.name.toLowerCase()));
    for (const knowledge of baseDocumentKnowledge()) {
      const name = knowledge.document.name;
      if (matrixNames.has(name.toLowerCase())) continue;
      known.set(name.toLowerCase(), name);
      taken.add(name.toLowerCase());
      for (const label of [name, ...knowledge.document.aliases]) carry(label, 'canonical', name);
    }
  }
  return { known, nameById, taken, aliasCarriers, elements };
}

/** Every id/name a skill's `appliesTo` may legitimately name, for tests and tooling. */
export function knownSkillTargets(domain: ExtractionDomain): string[] {
  return [...catalogueFor(domain).known.values()];
}

// ─── Front-matter validation ────────────────────────────────────────────────

type Mapping = { [key: string]: FrontMatterValue };

function isMapping(value: FrontMatterValue | undefined): value is Mapping {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function stringOf(value: FrontMatterValue | undefined, what: string, file: string, optional = false): string {
  if ((value === undefined || value === null) && optional) return '';
  if (typeof value !== 'string' || value.trim() === '') throw new SkillLoadError(`${what} must be a non-empty string`, file);
  return value.trim();
}

function stringList(value: FrontMatterValue | undefined, what: string, file: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new SkillLoadError(`${what} must be a list`, file);
  return value.map((item, i) => {
    if (typeof item !== 'string' || item.trim() === '') throw new SkillLoadError(`${what}[${i}] must be a non-empty string`, file);
    return item.trim();
  });
}

function boolOf(value: FrontMatterValue | undefined, what: string, file: string, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new SkillLoadError(`${what} must be true or false`, file);
  return value;
}

const ALLOWED_KEYS = new Set([
  'id', 'appliesTo', 'element', 'version', 'hard', 'classify', 'rowsField',
  'fields', 'newFields', 'dropFields', 'newType',
]);
const FIELD_KEYS = new Set(['name', 'type', 'required', 'rowLevel', 'labels', 'description']);
const CLASSIFY_KEYS = new Set(['is', 'isNot', 'filenameHints', 'contentSignals']);

function rejectUnknownKeys(mapping: Mapping, allowed: Set<string>, what: string, file: string): void {
  for (const key of Object.keys(mapping)) {
    if (!allowed.has(key)) throw new SkillLoadError(`unknown ${what} key "${key}"`, file);
  }
}

function parseField(raw: FrontMatterValue, index: number, file: string): SkillField {
  if (!isMapping(raw)) throw new SkillLoadError(`fields[${index}] must be a mapping`, file);
  rejectUnknownKeys(raw, FIELD_KEYS, `fields[${index}]`, file);
  const name = stringOf(raw.name, `fields[${index}].name`, file);
  if (!FIELD_NAME.test(name)) throw new SkillLoadError(`field name "${name}" must be snake_case`, file);
  const type = stringOf(raw.type, `fields[${index}].type`, file);
  if (!(SKILL_FIELD_TYPES as readonly string[]).includes(type)) {
    throw new SkillLoadError(`field "${name}" has type "${type}"; allowed: ${SKILL_FIELD_TYPES.join(', ')}`, file);
  }
  return {
    name,
    type: type as SkillFieldType,
    required: boolOf(raw.required, `field "${name}".required`, file, false),
    rowLevel: boolOf(raw.rowLevel, `field "${name}".rowLevel`, file, false),
    labels: stringList(raw.labels, `field "${name}".labels`, file),
    description: stringOf(raw.description, `field "${name}".description`, file),
  };
}

/** Split the body into `## Heading` sections, keyed by the heading text. */
function bodySections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (current !== null) sections.set(current, buffer.join('\n').trim());
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      flush();
      current = heading[1];
      buffer = [];
      continue;
    }
    if (current !== null) buffer.push(line);
  }
  flush();
  return sections;
}

/**
 * Line endings are normalised first: a Windows checkout (CRLF) and the Linux
 * image (LF) must salt caches identically for the same skill.
 */
function sha256(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

function parseSkillFile(
  domain: ExtractionDomain,
  file: string,
  content: string,
  catalogue: DomainCatalogue,
): Skill {
  let header: string;
  let body: string;
  let meta: Mapping;
  try {
    ({ header, body } = splitFrontMatter(content, file));
    meta = parseFrontMatterYaml(header, file);
  } catch (err) {
    if (err instanceof FrontMatterError) throw new SkillLoadError(err.message);
    throw err;
  }
  rejectUnknownKeys(meta, ALLOWED_KEYS, 'front-matter', file);

  const id = stringOf(meta.id, 'id', file);
  const expectedId = path.basename(file, '.md');
  if (id !== expectedId) throw new SkillLoadError(`id "${id}" must match the file name "${expectedId}"`, file);
  if (!SKILL_ID.test(id) || id.startsWith('_')) throw new SkillLoadError(`id "${id}" must be snake_case`, file);

  const appliesTo = stringList(meta.appliesTo, 'appliesTo', file).map((target) => {
    const canonical = catalogue.known.get(target.toLowerCase());
    if (!canonical) {
      throw new SkillLoadError(`appliesTo names "${target}", which is neither a ${domain} matrix id nor a canonical document type`, file);
    }
    if (canonical !== target) throw new SkillLoadError(`appliesTo "${target}" must be spelled "${canonical}"`, file);
    return canonical;
  });

  let newType: Skill['newType'] = null;
  if (meta.newType !== undefined && meta.newType !== null) {
    if (!isMapping(meta.newType)) throw new SkillLoadError('newType must be a mapping', file);
    rejectUnknownKeys(meta.newType, new Set(['name', 'aliases', 'narrows']), 'newType', file);
    let narrows: string | null = null;
    if (meta.newType.narrows !== undefined && meta.newType.narrows !== null) {
      const target = stringOf(meta.newType.narrows, 'newType.narrows', file);
      narrows = catalogue.known.get(target.toLowerCase()) ?? null;
      if (!narrows) throw new SkillLoadError(`newType.narrows names "${target}", which is not an existing ${domain} type`, file);
      if (narrows !== target) throw new SkillLoadError(`newType.narrows "${target}" must be spelled "${narrows}"`, file);
    }
    newType = {
      name: stringOf(meta.newType.name, 'newType.name', file),
      aliases: stringList(meta.newType.aliases, 'newType.aliases', file),
      narrows,
    };
    for (const label of [newType.name, ...newType.aliases]) {
      if (catalogue.taken.has(label.toLowerCase())) {
        throw new SkillLoadError(`newType "${label}" already exists — name it in appliesTo instead`, file);
      }
      // An existing type's ALIAS is that type too: declaring it again would
      // make two types for one document. Only a declared narrowing of the
      // umbrella type that carries the alias may take it over.
      const carriers = catalogue.aliasCarriers.get(normaliseTypeLabel(label));
      if (carriers) {
        const owners = [...carriers.matrix, ...carriers.canonical];
        if (owners.some((owner) => owner !== narrows)) {
          throw new SkillLoadError(
            `newType "${label}" is already an alias of ${owners.join(', ')} — name it in appliesTo, or declare newType.narrows when this type is a narrower kind of it`,
            file,
          );
        }
      }
    }
  }
  if (appliesTo.length === 0 && !newType) {
    throw new SkillLoadError('a skill must name at least one spec in appliesTo, or declare a newType', file);
  }

  const element = stringOf(meta.element, 'element', file);
  if (!catalogue.elements.has(element)) {
    throw new SkillLoadError(`element "${element}" is not one of ${[...catalogue.elements].join(', ')}`, file);
  }

  const version = meta.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SkillLoadError('version must be a positive integer', file);
  }

  if (!isMapping(meta.classify)) throw new SkillLoadError('classify must be a mapping', file);
  rejectUnknownKeys(meta.classify, CLASSIFY_KEYS, 'classify', file);
  const classify: SkillClassify = {
    is: stringOf(meta.classify.is, 'classify.is', file),
    isNot: stringList(meta.classify.isNot, 'classify.isNot', file),
    filenameHints: stringList(meta.classify.filenameHints, 'classify.filenameHints', file),
    contentSignals: stringList(meta.classify.contentSignals, 'classify.contentSignals', file),
  };

  if (!Array.isArray(meta.fields) || meta.fields.length === 0) throw new SkillLoadError('fields must be a non-empty list', file);
  const fields = meta.fields.map((raw, i) => parseField(raw, i, file));
  // A name may appear once per level. The same name at BOTH levels is how an
  // ESG grid reads a figure that is a row column and the document's total
  // (extractionDomain ESG_GRIDS, suppressRowScalars false: a waste report's
  // waste_total_kg per stream and for the site) — the same quantity, so the
  // same type.
  const seen = new Set<string>();
  const declared = new Map<string, SkillField>();
  for (const field of fields) {
    const slot = `${field.rowLevel ? 'row' : 'document'}:${field.name}`;
    if (declared.has(slot)) throw new SkillLoadError(`field "${field.name}" is declared twice`, file);
    const other = declared.get(`${field.rowLevel ? 'document' : 'row'}:${field.name}`);
    if (other && other.type !== field.type) {
      throw new SkillLoadError(`field "${field.name}" is a ${other.type} at one level and a ${field.type} at the other`, file);
    }
    declared.set(slot, field);
    seen.add(field.name);
  }

  const rowsField = meta.rowsField === undefined || meta.rowsField === null ? null : stringOf(meta.rowsField, 'rowsField', file);
  if (rowsField && !FIELD_NAME.test(rowsField)) throw new SkillLoadError(`rowsField "${rowsField}" must be snake_case`, file);
  const hasRowFields = fields.some((field) => field.rowLevel);
  if (hasRowFields && !rowsField) throw new SkillLoadError('rowLevel fields need a rowsField to be returned under', file);
  if (rowsField && !hasRowFields) throw new SkillLoadError('rowsField is set but no field is rowLevel', file);

  const newFields = stringList(meta.newFields, 'newFields', file);
  for (const name of newFields) {
    if (!seen.has(name) && name !== rowsField) {
      throw new SkillLoadError(`newFields lists "${name}", which is not a field of this skill`, file);
    }
  }
  const dropFields = stringList(meta.dropFields, 'dropFields', file);
  for (const name of dropFields) {
    if (seen.has(name)) throw new SkillLoadError(`"${name}" is both a field and in dropFields`, file);
  }

  const parsedSections = bodySections(body);
  const sections = {} as SkillSections;
  for (const { key, heading } of REQUIRED_SECTIONS) {
    const text = parsedSections.get(heading);
    if (!text) throw new SkillLoadError(`missing or empty section "## ${heading}"`, file);
    sections[key] = text;
  }

  return {
    id,
    domain,
    appliesTo,
    element,
    version,
    hard: boolOf(meta.hard, 'hard', file, false),
    classify,
    rowsField,
    fields,
    newFields,
    dropFields,
    newType,
    sections,
    hash: sha256(content),
    file,
  };
}

function parseGlobalFile(domain: ExtractionDomain, file: string, content: string): GlobalSkill {
  let meta: Mapping;
  let body: string;
  try {
    const split = splitFrontMatter(content, file);
    body = split.body;
    meta = parseFrontMatterYaml(split.header, file);
  } catch (err) {
    if (err instanceof FrontMatterError) throw new SkillLoadError(err.message);
    throw err;
  }
  rejectUnknownKeys(meta, new Set(['id', 'version']), 'global front-matter', file);
  const id = stringOf(meta.id, 'id', file);
  if (id !== path.basename(file, '.md')) throw new SkillLoadError(`id "${id}" must match the file name`, file);
  const version = meta.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SkillLoadError('version must be a positive integer', file);
  }
  const sections = bodySections(body);
  const traps = sections.get('Traps');
  if (!traps) throw new SkillLoadError('missing or empty section "## Traps"', file);
  return {
    id,
    domain,
    version,
    traps,
    where: sections.get('Where values sit') || null,
    hash: sha256(content),
    file,
  };
}

// ─── Loading ────────────────────────────────────────────────────────────────

/**
 * Where the skills live. `PARSER_SKILLS_DIR` wins; otherwise `skills/` under
 * the working directory (the runtime image's WORKDIR is /app and copies
 * `skills/` there), then next to the package for tests and `tsx` runs.
 */
export function defaultSkillsRoot(): string {
  if (process.env.PARSER_SKILLS_DIR) return path.resolve(process.env.PARSER_SKILLS_DIR);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'skills'),
    path.resolve(here, '../../skills'), // src/services → package root
    path.resolve(here, '../../../skills'), // dist/src/services → package root
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

/** Build a registry from in-memory files — the loader's pure core, and the test seam. */
export function buildSkillRegistry(
  domain: ExtractionDomain,
  files: Array<{ file: string; content: string }>,
  dir = '(memory)',
): SkillRegistry {
  const catalogue = catalogueFor(domain);
  const ordered = [...files].sort((a, b) => path.basename(a.file).localeCompare(path.basename(b.file)));
  const skills: Skill[] = [];
  let global: GlobalSkill | null = null;

  for (const { file, content } of ordered) {
    if (path.basename(file).startsWith('_')) {
      if (global) throw new SkillLoadError(`only one global skill per domain (already have ${global.file})`, file);
      global = parseGlobalFile(domain, file, content);
      continue;
    }
    skills.push(parseSkillFile(domain, file, content, catalogue));
  }

  // One spec, one skill: two skills claiming the same document would make the
  // prompt depend on file order.
  const index = new Map<string, Skill>();
  const byTarget = new Map<string, Skill>();
  const claim = (key: string, skill: Skill) => {
    const lower = key.toLowerCase();
    const owner = index.get(lower);
    if (owner && owner !== skill) {
      throw new SkillLoadError(`"${key}" is claimed by both ${owner.id} and ${skill.id}`, skill.file);
    }
    index.set(lower, skill);
  };
  for (const skill of skills) {
    claim(skill.id, skill);
    for (const target of skill.appliesTo) {
      claim(target, skill);
      byTarget.set(target, skill);
      const name = catalogue.nameById.get(target);
      if (name) claim(name, skill);
    }
    if (skill.newType) {
      for (const label of [skill.newType.name, ...skill.newType.aliases]) claim(label, skill);
    }
  }

  // The same claims, spelled loosely ("Share certificates" for "Share
  // Certificate"). A loose spelling two skills share resolves to neither.
  const loose = new Map<string, Skill | null>();
  for (const [key, skill] of index) {
    const norm = normaliseTypeLabel(key);
    if (!norm) continue;
    const seen = loose.get(norm);
    loose.set(norm, seen === undefined || seen === skill ? skill : null);
  }

  /** The one skill reading every carrier, or null when any carrier has another (or none). */
  const soleSkill = (targets: Set<string>): Skill | null => {
    let found: Skill | null = null;
    for (const target of targets) {
      const skill = byTarget.get(target) ?? null;
      if (!skill || (found && found !== skill)) return null;
      found = skill;
    }
    return found;
  };

  const skillFor = (specIdOrName: string): Skill | null => {
    const key = String(specIdOrName ?? '').trim();
    if (!key) return null;
    const exact = index.get(key.toLowerCase());
    if (exact) return exact;
    const norm = normaliseTypeLabel(key);
    if (loose.has(norm)) return loose.get(norm) ?? null;
    // An existing type's own alias. The matrix's specific types decide before
    // the canonical umbrella types: "Share Register" is the securities
    // register's alias and also one of "Ownership Confirmation"'s.
    const carriers = catalogue.aliasCarriers.get(norm);
    if (!carriers) return null;
    if (carriers.matrix.size > 0) return soleSkill(carriers.matrix);
    return soleSkill(carriers.canonical);
  };

  const newTypes: RegisteredNewType[] = skills
    .filter((skill) => skill.newType)
    .map((skill) => ({ ...(skill.newType as SkillNewType), skillId: skill.id, element: skill.element }));

  const hash = sha256([...(global ? [global.hash] : []), ...skills.map((skill) => skill.hash)].join('\n'));
  return {
    domain,
    dir,
    skills,
    global,
    hash,
    newTypes,
    skillFor,
  };
}

const registries = new Map<string, SkillRegistry>();

/**
 * Load a domain's skills, once per process.
 *
 * Throws `SkillLoadError` when the domain directory is missing (a runtime image
 * built without `skills/` must fail at startup, not quietly lose every skill),
 * unless `optional` is set — for a domain that has no skills yet.
 */
export function loadSkills(
  domain: ExtractionDomain = 'bbbee',
  options: { root?: string; optional?: boolean } = {},
): SkillRegistry {
  const root = options.root ?? defaultSkillsRoot();
  const dir = path.join(root, domain);
  const cacheKey = `${domain}|${dir}`;
  const cached = registries.get(cacheKey);
  if (cached) return cached;

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    if (options.optional) {
      const empty = buildSkillRegistry(domain, [], dir);
      registries.set(cacheKey, empty);
      return empty;
    }
    throw new SkillLoadError(`skills directory not found: ${dir} (set PARSER_SKILLS_DIR or copy skills/ into the image)`);
  }

  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .map((name) => {
      const file = path.join(dir, name);
      return { file, content: readFileSync(file, 'utf8') };
    });
  const registry = buildSkillRegistry(domain, files, dir);
  registries.set(cacheKey, registry);
  return registry;
}

/** Forget loaded registries (tests that point PARSER_SKILLS_DIR elsewhere). */
export function resetSkillsCache(): void {
  registries.clear();
}

/** The skill for a spec id or document-type name in the default location. */
export function skillFor(specIdOrName: string, domain: ExtractionDomain = 'bbbee'): Skill | null {
  return loadSkills(domain, { optional: domain !== 'bbbee' }).skillFor(specIdOrName);
}

/**
 * The kill switch: PARSER_SKILLS=off (or false) runs every prompt, menu and
 * ontology type exactly as it was before skills were wired in.
 */
export function skillsEnabled(): boolean {
  const flag = String(process.env.PARSER_SKILLS ?? '').trim().toLowerCase();
  return flag !== 'off' && flag !== 'false' && flag !== '0';
}

/**
 * Which domains must have a skills directory. B-BBEE ships skills, so a
 * missing directory is a broken image; ESG (and any later domain) is optional
 * until its first skill lands, and plugs in with no code change when it does.
 */
export function skillsRequired(domain: ExtractionDomain): boolean {
  return domain === 'bbbee';
}

/**
 * The registry the pipeline uses for a domain, or null when skills are switched
 * off. A domain whose skills are optional and absent returns an empty registry
 * (skillFor always null), so nothing about its prompts changes.
 */
export function activeSkills(domain: ExtractionDomain): SkillRegistry | null {
  if (!skillsEnabled()) return null;
  return loadSkills(domain, { optional: !skillsRequired(domain) });
}

/**
 * Load every domain's skills once at server start, so a malformed skill (or an
 * image built without skills/) fails the boot instead of a client's upload.
 */
export function loadSkillsAtBoot(domains: ExtractionDomain[] = ['bbbee', 'esg']): Array<{ domain: ExtractionDomain; skills: number; hash: string }> {
  if (!skillsEnabled()) return [];
  return domains.map((domain) => {
    const registry = activeSkills(domain)!;
    return { domain, skills: registry.skills.length, hash: registry.hash.slice(0, 12) };
  });
}

// ─── Prompt rendering (pure) ────────────────────────────────────────────────

export interface SkillPromptSections {
  /** "SKILL: <id> v<version>" — a stable heading for the prompt block. */
  title: string;
  whatItIs: string;
  where: string;
  traps: string;
  example: string;
  /** The typed field list, one line per field. */
  fieldLines: string;
  /** Field names, document-level first, rows under `rowsField`. */
  keys: { document: string[]; rowsField: string | null; row: string[] };
  /** Everything above as one block, ready to append to a user prompt. */
  text: string;
}

const TYPE_HINT: Record<SkillFieldType, string> = {
  text: 'text as printed',
  date: 'date as printed',
  money: 'amount as printed, sign and brackets kept',
  percent: 'percentage as printed',
  count: 'whole number as printed',
  number: 'quantity as printed, in the unit the document prints; never converted',
  regno: 'registration number as printed',
  idno: 'ID / passport number as printed',
  bool: 'true / false, only when the document shows it',
  level: 'B-BBEE level as printed (digits or words)',
};

function fieldLine(field: SkillField): string {
  const flags = [field.type, field.required ? 'required' : 'optional'];
  const labels = field.labels.length > 0 ? ` Printed as: ${field.labels.map((l) => `"${l}"`).join(', ')}.` : '';
  return `- ${field.name} (${flags.join(', ')}; ${TYPE_HINT[field.type]}): ${field.description}${labels}`;
}

/**
 * The parts of a skill a prompt needs, rendered as plain text. Pure: the same
 * skill always renders the same text, so it can sit inside a cache key.
 */
export function skillPromptSections(skill: Skill, global: GlobalSkill | null = null): SkillPromptSections {
  const documentFields = skill.fields.filter((field) => !field.rowLevel);
  const rowFields = skill.fields.filter((field) => field.rowLevel);
  const fieldLines = [
    ...documentFields.map(fieldLine),
    ...(skill.rowsField && rowFields.length > 0
      ? [`- ${skill.rowsField}: an array with ONE object per row, each with these keys:`,
        ...rowFields.map((field) => `  ${fieldLine(field)}`)]
      : []),
  ].join('\n');

  const title = `SKILL: ${skill.id} v${skill.version}`;
  const traps = global ? `${skill.sections.traps}\n\nAlways:\n${global.traps}` : skill.sections.traps;
  // The global "Where values sit" (reading tables, label/value pairs, amounts,
  // dates) applies to every document; without it those rules never reach a prompt.
  const where = global?.where ? `${skill.sections.where}\n\nIn every document:\n${global.where}` : skill.sections.where;
  const text = [
    title,
    `\nWHAT THIS DOCUMENT IS:\n${skill.classify.is}`,
    `\nWHERE THE VALUES SIT:\n${where}`,
    `\nTRAPS:\n${traps}`,
    `\nFIELDS TO RETURN (JSON keys; null when the document does not state it):\n${fieldLines}`,
    `\nWORKED EXAMPLE (invented values, for shape only — never copy them):\n${skill.sections.example}`,
  ].join('\n');

  return {
    title,
    whatItIs: skill.sections.whatItIs,
    where,
    traps,
    example: skill.sections.example,
    fieldLines,
    keys: {
      document: documentFields.map((field) => field.name),
      rowsField: skill.rowsField,
      row: rowFields.map((field) => field.name),
    },
    text,
  };
}

/**
 * The JSON keys to ask for when a spec has a skill: the skill's document-level
 * fields and rows field first, then whatever the spec still expects that the
 * skill neither covers nor drops. A union rather than a replacement, so the
 * auditor's own keys are never lost by adding a skill.
 */
export function expectedKeysWithSkill(skill: Skill, specExpectedFields: readonly string[]): string[] {
  const keys: string[] = [];
  const add = (name: string) => { if (!keys.includes(name)) keys.push(name); };
  for (const field of skill.fields) if (!field.rowLevel) add(field.name);
  if (skill.rowsField) add(skill.rowsField);
  const rowNames = new Set(skill.fields.filter((field) => field.rowLevel).map((field) => field.name));
  const dropped = new Set(skill.dropFields);
  for (const name of specExpectedFields) {
    if (dropped.has(name) || rowNames.has(name) || name === 'exceptions') continue;
    add(name);
  }
  return keys;
}

/**
 * The typed field lines for some of a skill's fields (the sweep's "what each
 * missing field is"), required ones first, in the skill's order otherwise.
 */
export function skillFieldNotes(skill: Skill, names: readonly string[]): string {
  const wanted = new Set(names);
  const fields = skill.fields.filter((field) => wanted.has(field.name) && !field.rowLevel);
  return [...fields.filter((f) => f.required), ...fields.filter((f) => !f.required)].map(fieldLine).join('\n');
}

/** Field names in sweep order: the skill's required fields first, then the rest as given. */
export function requiredFirst(skill: Skill | null, names: readonly string[]): string[] {
  if (!skill) return [...names];
  const required = new Set(skill.fields.filter((field) => field.required).map((field) => field.name));
  return [...names.filter((name) => required.has(name)), ...names.filter((name) => !required.has(name))];
}

/** One menu line for classification prompts (adjudicator / Pass A). */
export function skillMenuLines(skill: Skill): string {
  const lines = [`   Is: ${skill.classify.is}`];
  if (skill.classify.isNot.length > 0) lines.push(`   Is NOT: ${skill.classify.isNot.join('; ')}`);
  if (skill.classify.contentSignals.length > 0) lines.push(`   Look for: ${skill.classify.contentSignals.map((s) => `"${s}"`).join(', ')}`);
  return lines.join('\n');
}
