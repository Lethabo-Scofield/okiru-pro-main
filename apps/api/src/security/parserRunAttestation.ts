/**
 * The verifying half of signed parser runs.
 *
 * A parser run reaches the document library through the browser, so the
 * library cannot take the browser's word for what the parser read. The parser
 * signs each run it produces (okiru-ai-parser/src/services/runAttestation.ts):
 * an HMAC over the exact JSON text, keyed from PARSER_INTERNAL_SECRET. This
 * checks that signature, the record's lifetime and its shape; the route then
 * checks the record was read from the bytes the document holds.
 *
 * Both halves pin the same known-answer vector in their tests, so the scheme
 * cannot change on one side only.
 */
import crypto from 'crypto';
import { z } from 'zod';

/** Must equal ATTESTATION_CONTEXT in the parser's runAttestation.ts. */
const ATTESTATION_CONTEXT = 'okiru/parser-run-attestation/v1';

/** Clock drift tolerated between the parser pod and this one. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const PARSER_STATUSES = ['passed', 'review_required', 'failed'] as const;

/**
 * One value the model or the agent read — the AI block of a run. Must match
 * RunAiValue in the parser's runAttestation.ts. It is inside the signed text,
 * so nothing here is the browser's say; the shape check is for what the
 * library will store and show.
 */
export const runAiValueSchema = z.object({
  /** The correction key; the library's field-key alphabet. */
  key: z.string().min(1).max(120).regex(/^[A-Za-z0-9_. -]+$/),
  field: z.string().min(1).max(200),
  value: z.unknown(),
  // 'derived': worked out by the parser from printed figures (sums, SDL x 100),
  // never printed itself — shown apart from what was read.
  layer: z.enum(['rule', 'ai', 'agent', 'derived']),
  confidence: z.number().min(0).max(1).nullable(),
  documentId: z.string().max(200),
  documentName: z.string().max(500),
  element: z.string().max(100).nullable(),
  sourceFile: z.string().max(1000),
  page: z.number().int().nullable(),
  cell: z.string().max(100).nullable(),
  quote: z.string().max(5000).nullable(),
  grounded: z.boolean().nullable(),
  rowCount: z.number().int().nonnegative().optional(),
});

export type RunAiValue = z.infer<typeof runAiValueSchema>;

const claimsSchema = z.object({
  typ: z.literal('okiru.parser-run'),
  v: z.literal(1),
  iat: z.number().int(),
  exp: z.number().int(),
  domain: z.enum(['bbbee', 'esg']),
  caseId: z.string().max(500).nullable(),
  quoteId: z.string().max(500).nullable(),
  filename: z.string().max(1000),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  reviewReasons: z.array(z.string()).max(2000),
  parserOutput: z.record(z.unknown()).refine(
    (output) => (PARSER_STATUSES as readonly unknown[]).includes(output.status),
    { message: 'Parser status must be passed, review_required, or failed' },
  ),
  /** The model and agent layers of the read. Absent on a run with no model read. */
  aiValues: z.array(runAiValueSchema).max(5000).optional()
    .refine(
      (values) => !values || new Set(values.map((value) => value.key)).size === values.length,
      { message: 'Each AI value needs its own key' },
    ),
});

export type ParserRunClaims = z.infer<typeof claimsSchema>;

/** What the browser hands over: the parser's signed text, unopened. */
export const signedParserRunSchema = z.object({
  payload: z.string().min(2).max(64 * 1024 * 1024),
  signature: z.string().min(1).max(200),
});

export type SignedParserRun = z.infer<typeof signedParserRunSchema>;

export type ParserRunVerdict =
  | { ok: true; claims: ParserRunClaims }
  | { ok: false; status: number; code: string; message: string };

export function runAttestationKey(secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(ATTESTATION_CONTEXT).digest();
}

export function signRunPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', runAttestationKey(secret)).update(payload, 'utf8').digest('base64url');
}

function signaturesMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Accept the record only if the parser signed exactly this text, it is still
 * within its lifetime, and it has the shape of a run. The secret is read per
 * call, so a missing one refuses every run rather than accepting any.
 */
export function verifyParserRun(
  signed: SignedParserRun,
  options: { secret?: string; now?: number } = {},
): ParserRunVerdict {
  const secret = options.secret ?? process.env.PARSER_INTERNAL_SECRET ?? '';
  if (!secret) {
    return {
      ok: false,
      status: 503,
      code: 'RUN_ATTESTATION_UNCONFIGURED',
      message: 'Parser results cannot be saved right now: this server cannot check that they came from the parser.',
    };
  }
  if (!signaturesMatch(signed.signature, signRunPayload(signed.payload, secret))) {
    return {
      ok: false,
      status: 403,
      code: 'RUN_SIGNATURE_INVALID',
      message: 'This parser result was not issued by the parser, so it cannot be saved.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(signed.payload);
  } catch {
    parsed = null;
  }
  const claims = claimsSchema.safeParse(parsed);
  if (!claims.success) {
    return {
      ok: false,
      status: 422,
      code: 'RUN_ATTESTATION_MALFORMED',
      message: claims.error.issues[0]?.message ?? 'This parser result is not a parser run.',
    };
  }

  const now = options.now ?? Date.now();
  if (claims.data.exp < now || claims.data.iat > now + CLOCK_SKEW_MS) {
    return {
      ok: false,
      status: 422,
      code: 'RUN_ATTESTATION_EXPIRED',
      message: 'This parser result is too old to save. Read the document again.',
    };
  }
  return { ok: true, claims: claims.data };
}
