import { describe, expect, it } from 'vitest';
import { FrontMatterError, parseFrontMatterYaml, splitFrontMatter } from '../../src/services/skillFrontMatter.js';

describe('skill front-matter YAML subset', () => {
  it('reads scalars, flow lists and flow mappings', () => {
    const parsed = parseFrontMatterYaml([
      'id: share_register',
      'version: 2',
      'hard: true',
      'ratio: 0.5',
      'missing: null',
      'tilde: ~',
      'appliesTo: [a_b, "c, d", \'it\'\'s\']',
      'classify: { is: "A register: of holders", isNot: [x, y], empty: [] }',
    ].join('\n'));
    expect(parsed).toEqual({
      id: 'share_register',
      version: 2,
      hard: true,
      ratio: 0.5,
      missing: null,
      tilde: null,
      appliesTo: ['a_b', 'c, d', "it's"],
      classify: { is: 'A register: of holders', isNot: ['x', 'y'], empty: [] },
    });
  });

  it('reads block sequences of mappings, nested blocks and same-column dashes', () => {
    const parsed = parseFrontMatterYaml([
      'appliesTo:',
      '- one',
      '- two',
      'classify:',
      '  is: "thing"',
      '  isNot:',
      '    - "other thing"',
      'fields:',
      '  - name: holder_name   # trailing comment',
      '    type: text',
      '    labels: ["Holder", "Name # not a comment"]',
      '  - { name: number_of_shares, type: count, rowLevel: true }',
    ].join('\n'));
    expect(parsed).toEqual({
      appliesTo: ['one', 'two'],
      classify: { is: 'thing', isNot: ['other thing'] },
      fields: [
        { name: 'holder_name', type: 'text', labels: ['Holder', 'Name # not a comment'] },
        { name: 'number_of_shares', type: 'count', rowLevel: true },
      ],
    });
  });

  it('joins a flow collection that runs over several lines', () => {
    const parsed = parseFrontMatterYaml([
      'labels: ["a",',
      '  "b",',
      '  "c"]',
      'next: 1',
    ].join('\n'));
    expect(parsed).toEqual({ labels: ['a', 'b', 'c'], next: 1 });
  });

  it('decodes double-quoted escapes', () => {
    expect(parseFrontMatterYaml('a: "line\\nnext \\"q\\""')).toEqual({ a: 'line\nnext "q"' });
  });

  it.each([
    ['tabs', 'a:\n\tb: 1'],
    ['duplicate keys', 'a: 1\na: 2'],
    ['unbalanced brackets', 'a: [1, 2'],
    ['anchors', 'a: &x 1'],
    ['block scalars', 'a: |'],
    ['bad indentation', 'a: 1\n   b: 2'],
    ['text after a flow value', 'a: [1] extra'],
    ['a non-mapping line', 'just text'],
  ])('rejects %s loudly', (_label, text) => {
    expect(() => parseFrontMatterYaml(text, 'test.md')).toThrow(FrontMatterError);
  });

  it('splits the header from the body and requires the fences', () => {
    const { header, body } = splitFrontMatter('---\nid: x\n---\n## Traps\ntext\n', 'x.md');
    expect(header).toBe('id: x');
    expect(body).toBe('## Traps\ntext\n');
    expect(() => splitFrontMatter('id: x\n## Traps', 'x.md')).toThrow(FrontMatterError);
  });
});
