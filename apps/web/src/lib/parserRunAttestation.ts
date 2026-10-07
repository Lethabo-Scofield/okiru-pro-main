/**
 * Signed parser runs — the browser's whole part in archiving what the parser
 * read is to carry them, unopened.
 *
 * The parser returns `run_attestations` beside its case result: one record per
 * uploaded file, signed so the document library can tell it came from the
 * parser and was read from that file's bytes. Each record carries both layers
 * of the read — the rule layer and every value the AI model and the agent
 * read, with its citation — so the library shows the whole read, not the few
 * percent the rules found. The library refuses anything else, so there is
 * nothing here to build, merge or "fix up": any change to the text would void
 * the signature.
 */

export interface SignedParserRun {
  /** The uploaded file the record was read from. */
  filename: string;
  /** The record, as the exact text the parser signed. */
  payload: string;
  signature: string;
}

/**
 * The run as the library accepted it before runs were signed. Sent BESIDE the
 * signed record only so an api that predates signing keeps filing runs while
 * a deploy is part-way through; an api that verifies signatures ignores it
 * and stores the signed text alone. Never carries AI values — those exist only
 * inside the signature.
 */
export interface LegacyRunBody {
  parserOutput: Record<string, unknown>;
  caseId?: string | null;
  reviewReasons?: string[];
}

/**
 * The signed record for each uploaded file, by name. Null when the result
 * carries none — a parser that cannot sign — so the caller can say the results
 * were not archived rather than quietly filing nothing.
 */
export function signedRunsByFile(result: unknown): Map<string, SignedParserRun> | null {
  const list = (result as { run_attestations?: unknown } | null)?.run_attestations;
  if (!Array.isArray(list)) return null;
  const out = new Map<string, SignedParserRun>();
  for (const item of list) {
    const run = item as Partial<SignedParserRun> | null;
    if (typeof run?.filename === "string" && typeof run.payload === "string" && typeof run.signature === "string") {
      if (!out.has(run.filename)) out.set(run.filename, run as SignedParserRun);
    }
  }
  return out;
}

/**
 * The case without its signed records. They are filed once, straight away, and
 * are a second copy of every document's output — kept in state or the session
 * snapshot they would only cost memory and storage quota.
 */
export function withoutSignedRuns<T>(result: T): T {
  if (!result || typeof result !== "object" || !("run_attestations" in result)) return result;
  const { run_attestations: _filed, ...rest } = result as T & { run_attestations?: unknown };
  return rest as T;
}

/**
 * File one run against the library document it was read from: the parser's
 * signed record, plus the legacy body when there is one (see LegacyRunBody).
 * With neither there is nothing the library could accept, and that is said.
 */
export async function postParserRun(
  documentId: string,
  filename: string,
  run: { signed?: SignedParserRun | null; legacy?: LegacyRunBody | null },
): Promise<void> {
  if (!run.signed && !run.legacy) throw new Error(`The parser did not sign its result for ${filename}`);
  const body = {
    ...(run.legacy ?? {}),
    ...(run.signed ? { attestation: { payload: run.signed.payload, signature: run.signed.signature } } : {}),
  };
  const res = await fetch(`/api/parser-documents/${encodeURIComponent(documentId)}/runs`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const reply = await res.json().catch(() => ({}));
    throw new Error(reply?.message ?? `Could not save parser result for ${filename}`);
  }
}

/** File one signed run against the library document it was read from. */
export async function postSignedRun(documentId: string, run: SignedParserRun): Promise<void> {
  await postParserRun(documentId, run.filename, { signed: run });
}
