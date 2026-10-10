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
  options: { attempts?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  if (!run.signed && !run.legacy) throw new Error(`The parser did not sign its result for ${filename}`);
  const body = JSON.stringify({
    ...(run.legacy ?? {}),
    ...(run.signed ? { attestation: { payload: run.signed.payload, signature: run.signed.signature } } : {}),
  });
  // A signed record files once however often it is sent (the library answers
  // a repeat with the run it already holds), so a save that met a dropped
  // connection or a pod being replaced mid-deploy is simply sent again. A paid
  // read whose library save failed that way left the documents page showing
  // an older reading than the company built from it. An unsigned body is not
  // safe to repeat, so it gets one try.
  const attempts = run.signed ? Math.max(1, options.attempts ?? RUN_SAVE_ATTEMPTS) : 1;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(`/api/parser-documents/${encodeURIComponent(documentId)}/runs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (error) {
      if (attempt < attempts) {
        await wait(retryDelayMs(attempt));
        continue;
      }
      throw new Error(`Could not reach the document library to save ${filename}${error instanceof Error && error.message ? ` (${error.message})` : ""}`);
    }
    if (res.ok) return;
    if (attempt < attempts && TRANSIENT_STATUS.has(res.status)) {
      await wait(retryDelayMs(attempt));
      continue;
    }
    const reply = await res.json().catch(() => ({}));
    throw new Error(reply?.message ?? `Could not save parser result for ${filename}`);
  }
}

/** How many times a signed run is sent before the save is reported as failed. */
export const RUN_SAVE_ATTEMPTS = 4;

/** Answers that say "not now" rather than "no": overloaded, restarting, or a gateway between pods. */
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** 1s, 3s, 9s — long enough to outlast a pod being replaced. */
function retryDelayMs(attempt: number): number {
  return 1000 * 3 ** (attempt - 1);
}

/** File one signed run against the library document it was read from. */
export async function postSignedRun(documentId: string, run: SignedParserRun): Promise<void> {
  await postParserRun(documentId, run.filename, { signed: run });
}
