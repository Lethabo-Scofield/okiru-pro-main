/**
 * A small, STRICT reader for the YAML front-matter of a skill file.
 *
 * The parser image carries no YAML library, and adding one for a dozen
 * hand-written headers would change the lockfile the Docker build installs
 * frozen. So this reads the subset the skill files actually use and refuses
 * everything else loudly — a header that half-parses is how a skill silently
 * loses its field list.
 *
 * Supported:
 *   - block mappings            `key: value` / `key:` + indented block
 *   - block sequences           `- value` / `- key: value` (a mapping item)
 *   - flow sequences / mappings `[a, "b, c"]` / `{ is: "...", isNot: [x] }`,
 *     which may run over several lines until their brackets balance
 *   - scalars                   "double" (JSON escapes), 'single' ('' escape),
 *                               plain; true/false, null/~, integers, decimals
 *   - comments                  `# ...` at line start or after whitespace
 *
 * Not supported (rejected, never guessed): tabs for indentation, anchors and
 * aliases, tags, block scalars (`|`, `>`), multi-document streams, complex keys.
 */

export type FrontMatterValue =
  | string
  | number
  | boolean
  | null
  | FrontMatterValue[]
  | { [key: string]: FrontMatterValue };

export class FrontMatterError extends Error {
  constructor(message: string, readonly source: string, readonly line?: number) {
    super(`${source}${line !== undefined ? `:${line}` : ''}: ${message}`);
    this.name = 'FrontMatterError';
  }
}

interface Line {
  indent: number;
  text: string;
  /** 1-based line number inside the front-matter, for error messages. */
  number: number;
}

const KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Remove a trailing comment that is outside any quoted string. */
function stripComment(raw: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (ch === quote) {
        // '' inside a single-quoted string is an escaped quote, not the end.
        if (quote === "'" && raw[i + 1] === "'") { i++; continue; }
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(raw[i - 1]))) return raw.slice(0, i);
  }
  return raw;
}

/** Bracket depth of a fragment, ignoring brackets inside quotes. */
function bracketDepth(text: string): number {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (ch === quote) {
        if (quote === "'" && text[i + 1] === "'") { i++; continue; }
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
  }
  return depth;
}

function resolvePlain(text: string, source: string, line: number): FrontMatterValue {
  const value = text.trim();
  if (value === '') return null;
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (/^[&*!|>%@`]/.test(value)) {
    throw new FrontMatterError(`unsupported YAML syntax "${value.slice(0, 20)}" — quote the value`, source, line);
  }
  return value;
}

/** Cursor-based reader for one inline (flow or scalar) value. */
class InlineReader {
  private pos = 0;

  constructor(private readonly text: string, private readonly source: string, private readonly line: number) {}

  private fail(message: string): never {
    throw new FrontMatterError(`${message} in "${this.text.slice(0, 80)}"`, this.source, this.line);
  }

  private skipSpace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
  }

  readTop(): FrontMatterValue {
    this.skipSpace();
    const ch = this.text[this.pos];
    let value: FrontMatterValue;
    if (ch === '[' || ch === '{' || ch === '"' || ch === "'") {
      value = this.readValue(false);
      this.skipSpace();
      if (this.pos < this.text.length) this.fail('unexpected text after value');
    } else {
      value = resolvePlain(this.text.slice(this.pos), this.source, this.line);
      this.pos = this.text.length;
    }
    return value;
  }

  private readValue(inFlow: boolean): FrontMatterValue {
    this.skipSpace();
    const ch = this.text[this.pos];
    if (ch === '[') return this.readSequence();
    if (ch === '{') return this.readMapping();
    if (ch === '"') return this.readDouble();
    if (ch === "'") return this.readSingle();
    if (!inFlow) return this.fail('expected a value');
    const start = this.pos;
    while (this.pos < this.text.length && !/[,\]}]/.test(this.text[this.pos])) this.pos++;
    return resolvePlain(this.text.slice(start, this.pos), this.source, this.line);
  }

  private readDouble(): string {
    const start = this.pos;
    this.pos++;
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === '\\') { this.pos += 2; continue; }
      if (ch === '"') {
        this.pos++;
        try {
          return JSON.parse(this.text.slice(start, this.pos)) as string;
        } catch {
          return this.fail('invalid escape in double-quoted string');
        }
      }
      this.pos++;
    }
    return this.fail('unterminated double-quoted string');
  }

  private readSingle(): string {
    this.pos++;
    let out = '';
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === "'") {
        if (this.text[this.pos + 1] === "'") { out += "'"; this.pos += 2; continue; }
        this.pos++;
        return out;
      }
      out += ch;
      this.pos++;
    }
    return this.fail('unterminated single-quoted string');
  }

  private readSequence(): FrontMatterValue[] {
    this.pos++; // [
    const items: FrontMatterValue[] = [];
    this.skipSpace();
    if (this.text[this.pos] === ']') { this.pos++; return items; }
    for (;;) {
      items.push(this.readValue(true));
      this.skipSpace();
      const ch = this.text[this.pos];
      if (ch === ',') {
        this.pos++;
        this.skipSpace();
        // A trailing comma before the closing bracket is tolerated.
        if (this.text[this.pos] === ']') { this.pos++; return items; }
        continue;
      }
      if (ch === ']') { this.pos++; return items; }
      return this.fail('expected "," or "]"');
    }
  }

  private readKey(): string {
    this.skipSpace();
    const ch = this.text[this.pos];
    if (ch === '"') return this.readDouble();
    if (ch === "'") return this.readSingle();
    const start = this.pos;
    while (this.pos < this.text.length && this.text[this.pos] !== ':' && !/[,}\s]/.test(this.text[this.pos])) this.pos++;
    const key = this.text.slice(start, this.pos);
    if (!KEY.test(key)) this.fail(`invalid key "${key}"`);
    return key;
  }

  private readMapping(): { [key: string]: FrontMatterValue } {
    this.pos++; // {
    const out: { [key: string]: FrontMatterValue } = {};
    this.skipSpace();
    if (this.text[this.pos] === '}') { this.pos++; return out; }
    for (;;) {
      const key = this.readKey();
      this.skipSpace();
      if (this.text[this.pos] !== ':') this.fail(`expected ":" after "${key}"`);
      this.pos++;
      if (key in out) this.fail(`duplicate key "${key}"`);
      out[key] = this.readValue(true);
      this.skipSpace();
      const ch = this.text[this.pos];
      if (ch === ',') {
        this.pos++;
        this.skipSpace();
        if (this.text[this.pos] === '}') { this.pos++; return out; }
        continue;
      }
      if (ch === '}') { this.pos++; return out; }
      return this.fail('expected "," or "}"');
    }
  }
}

function parseInline(text: string, source: string, line: number): FrontMatterValue {
  return new InlineReader(text, source, line).readTop();
}

/** Split `key: rest` — the key is a plain identifier, never quoted. */
function splitKey(text: string): { key: string; rest: string } | null {
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:(?:\s+(.*)|\s*)$/);
  if (!match) return null;
  return { key: match[1], rest: (match[2] ?? '').trim() };
}

class BlockParser {
  private lines: Line[] = [];

  constructor(text: string, private readonly source: string) {
    const raw = text.split(/\r?\n/);
    for (let i = 0; i < raw.length; i++) {
      const original = raw[i];
      if (/^\s*\t/.test(original)) {
        throw new FrontMatterError('tabs are not allowed for indentation', source, i + 1);
      }
      const stripped = stripComment(original).replace(/\s+$/, '');
      if (stripped.trim() === '') continue;
      const indent = stripped.length - stripped.trimStart().length;
      let textValue = stripped.trimStart();
      // A flow collection may continue over several lines until it balances.
      if (bracketDepth(textValue) > 0) {
        let j = i;
        while (bracketDepth(textValue) > 0) {
          j++;
          if (j >= raw.length) throw new FrontMatterError('unbalanced brackets', source, i + 1);
          textValue += ` ${stripComment(raw[j]).trim()}`;
        }
        this.lines.push({ indent, text: textValue, number: i + 1 });
        i = j;
        continue;
      }
      this.lines.push({ indent, text: textValue, number: i + 1 });
    }
  }

  parse(): { [key: string]: FrontMatterValue } {
    if (this.lines.length === 0) return {};
    if (this.lines[0].indent !== 0) {
      throw new FrontMatterError('front-matter must start at column 0', this.source, this.lines[0].number);
    }
    const [value, next] = this.parseBlock(0, 0);
    if (next < this.lines.length) {
      throw new FrontMatterError('unexpected indentation', this.source, this.lines[next].number);
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new FrontMatterError('front-matter must be a mapping', this.source, this.lines[0].number);
    }
    return value;
  }

  private isSequenceItem(line: Line): boolean {
    return line.text === '-' || line.text.startsWith('- ');
  }

  private parseBlock(index: number, indent: number): [FrontMatterValue, number] {
    const line = this.lines[index];
    return this.isSequenceItem(line) ? this.parseSequence(index, indent) : this.parseMapping(index, indent);
  }

  private parseMapping(index: number, indent: number): [{ [key: string]: FrontMatterValue }, number] {
    const out: { [key: string]: FrontMatterValue } = {};
    let i = index;
    while (i < this.lines.length) {
      const line = this.lines[i];
      if (line.indent < indent) break;
      if (line.indent > indent) throw new FrontMatterError('unexpected indentation', this.source, line.number);
      if (this.isSequenceItem(line)) break;
      const split = splitKey(line.text);
      if (!split) throw new FrontMatterError(`expected "key: value", got "${line.text.slice(0, 60)}"`, this.source, line.number);
      if (split.key in out) throw new FrontMatterError(`duplicate key "${split.key}"`, this.source, line.number);
      i++;
      if (split.rest !== '') {
        out[split.key] = parseInline(split.rest, this.source, line.number);
        continue;
      }
      const next = this.lines[i];
      if (next && next.indent > indent) {
        const [value, after] = this.parseBlock(i, next.indent);
        out[split.key] = value;
        i = after;
      } else if (next && next.indent === indent && this.isSequenceItem(next)) {
        // `key:` followed by `- item` at the same column is valid YAML.
        const [value, after] = this.parseSequence(i, indent);
        out[split.key] = value;
        i = after;
      } else {
        out[split.key] = null;
      }
    }
    return [out, i];
  }

  private parseSequence(index: number, indent: number): [FrontMatterValue[], number] {
    const items: FrontMatterValue[] = [];
    let i = index;
    while (i < this.lines.length) {
      const line = this.lines[i];
      if (line.indent < indent) break;
      if (line.indent > indent) throw new FrontMatterError('unexpected indentation', this.source, line.number);
      if (!this.isSequenceItem(line)) break;
      const content = line.text === '-' ? '' : line.text.slice(2);
      const contentIndent = indent + (line.text.length - content.length);
      const trimmed = content.trim();
      if (trimmed === '') {
        const next = this.lines[i + 1];
        if (next && next.indent > indent) {
          const [value, after] = this.parseBlock(i + 1, next.indent);
          items.push(value);
          i = after;
        } else {
          items.push(null);
          i++;
        }
        continue;
      }
      const startsFlowOrQuoted = /^[[{"']/.test(trimmed);
      if (!startsFlowOrQuoted && splitKey(trimmed)) {
        // `- key: value` opens a mapping whose later keys sit at the column
        // the first key started at.
        this.lines[i] = { indent: contentIndent, text: trimmed, number: line.number };
        const [value, after] = this.parseMapping(i, contentIndent);
        items.push(value);
        i = after;
        continue;
      }
      if (trimmed.startsWith('- ')) {
        throw new FrontMatterError('nested inline sequences are not supported — use a flow list', this.source, line.number);
      }
      items.push(parseInline(trimmed, this.source, line.number));
      i++;
    }
    return [items, i];
  }
}

/** Parse front-matter YAML text (without its `---` fences) into a mapping. */
export function parseFrontMatterYaml(text: string, source = 'front-matter'): { [key: string]: FrontMatterValue } {
  return new BlockParser(text, source).parse();
}

/**
 * Split a markdown file into its front-matter text and body.
 * The file must OPEN with a `---` line and close the header with another.
 */
export function splitFrontMatter(fileText: string, source: string): { header: string; body: string } {
  const text = fileText.replace(/^﻿/, '');
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new FrontMatterError('file must start with a "---" front-matter block closed by "---"', source);
  return { header: match[1], body: match[2] };
}
