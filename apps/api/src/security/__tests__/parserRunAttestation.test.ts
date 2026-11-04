import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { signRunPayload, verifyParserRun } from '../parserRunAttestation.js';

const SECRET = 'test-parser-internal-secret';
const NOW = Date.parse('2026-10-06T12:00:00Z');

function claims(over: Record<string, unknown> = {}) {
  return {
    typ: 'okiru.parser-run',
    v: 1,
    iat: NOW - 1000,
    exp: NOW + 60_000,
    domain: 'bbbee',
    caseId: 'case-1',
    quoteId: 'q-1',
    filename: 'certificate.pdf',
    contentSha256: crypto.createHash('sha256').update('certificate bytes').digest('hex'),
    reviewReasons: [],
    parserOutput: { status: 'review_required', document_type: 'B-BBEE Certificate', extracted_fields: {} },
    ...over,
  };
}

function signed(body: unknown, secret = SECRET) {
  const payload = JSON.stringify(body);
  return { payload, signature: signRunPayload(payload, secret) };
}

describe('signRunPayload', () => {
  it('matches the known-answer vector the parser signs with', () => {
    // Pinned in okiru-ai-parser/__tests__/parser/run_attestation.test.ts too:
    // a scheme change on one side only fails a test, not every upload.
    expect(signRunPayload('{"typ":"okiru.parser-run","v":1}', 'okiru-known-answer-secret'))
      .toBe('EG0GVBbF-Qe8I8WTNF7TwhOkOviGmD1AdRQ_Nb7DQq4');
  });
});

describe('verifyParserRun', () => {
  it('accepts exactly what the parser signed', () => {
    const verdict = verifyParserRun(signed(claims()), { secret: SECRET, now: NOW });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.claims.parserOutput.status).toBe('review_required');
  });

  it('refuses a record edited after signing — a review turned into a pass', () => {
    const genuine = signed(claims());
    const edited = JSON.parse(genuine.payload);
    edited.parserOutput.status = 'passed';
    const verdict = verifyParserRun({ payload: JSON.stringify(edited), signature: genuine.signature }, { secret: SECRET, now: NOW });
    expect(verdict).toMatchObject({ ok: false, status: 403, code: 'RUN_SIGNATURE_INVALID' });
  });

  it('refuses a made-up signature', () => {
    const verdict = verifyParserRun({ payload: JSON.stringify(claims()), signature: 'forged' }, { secret: SECRET, now: NOW });
    expect(verdict).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a record signed under another secret', () => {
    const verdict = verifyParserRun(signed(claims(), 'some-other-secret'), { secret: SECRET, now: NOW });
    expect(verdict).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a signature made with the raw shared secret rather than the derived run key', () => {
    // The same secret authenticates other internal calls; a MAC made with it
    // directly is not a parser run.
    const payload = JSON.stringify(claims());
    const raw = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
    expect(verifyParserRun({ payload, signature: raw }, { secret: SECRET, now: NOW })).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses an expired record, and one dated in the future', () => {
    expect(verifyParserRun(signed(claims({ exp: NOW - 1 })), { secret: SECRET, now: NOW }))
      .toMatchObject({ ok: false, status: 422, code: 'RUN_ATTESTATION_EXPIRED' });
    expect(verifyParserRun(signed(claims({ iat: NOW + 60 * 60 * 1000 })), { secret: SECRET, now: NOW }))
      .toMatchObject({ ok: false, status: 422, code: 'RUN_ATTESTATION_EXPIRED' });
  });

  it('refuses a signed record that is not a run', () => {
    expect(verifyParserRun(signed({ typ: 'something-else' }), { secret: SECRET, now: NOW }))
      .toMatchObject({ ok: false, status: 422, code: 'RUN_ATTESTATION_MALFORMED' });
    expect(verifyParserRun(signed(claims({ parserOutput: { status: 'approved' } })), { secret: SECRET, now: NOW }))
      .toMatchObject({ ok: false, status: 422, message: 'Parser status must be passed, review_required, or failed' });
  });

  it('accepts a value the parser worked out (derived) beside the ones it read, and refuses an unknown layer', () => {
    const value = (over: Record<string, unknown>) => ({
      key: 'ai.emp201.derived_sdl_total', field: 'derived_sdl_total', value: '12 345.00', layer: 'derived',
      confidence: null, documentId: 'doc-1', documentName: 'returns.pdf', element: null,
      sourceFile: 'returns.pdf', page: null, cell: null, quote: null, grounded: null, ...over,
    });
    const ok = verifyParserRun(signed(claims({ aiValues: [value({}), value({ key: 'ai.emp201.sdl', field: 'sdl', layer: 'ai' })] })), { secret: SECRET, now: NOW });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.claims.aiValues?.map((v) => v.layer)).toEqual(['derived', 'ai']);
    expect(verifyParserRun(signed(claims({ aiValues: [value({ layer: 'guessed' })] })), { secret: SECRET, now: NOW }))
      .toMatchObject({ ok: false, status: 422 });
  });

  it('refuses everything when this server has no secret, rather than accepting anything', () => {
    expect(verifyParserRun(signed(claims()), { secret: '', now: NOW }))
      .toMatchObject({ ok: false, status: 503, code: 'RUN_ATTESTATION_UNCONFIGURED' });
  });
});
