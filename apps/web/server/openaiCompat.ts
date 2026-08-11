/**
 * Chat completions that survive a model which refuses tuning parameters.
 *
 * WHY THIS EXISTS
 *
 * An Azure deployment name is an arbitrary label, not a model version. The
 * production deployment is called "gpt-4o" but is backed by a newer model that
 * rejects any temperature other than the default:
 *
 *   400 invalid_request_error — "Unsupported value: 'temperature' does not
 *   support 0 with this model. Only the default (1) value is supported."
 *
 * Every AI call in the web server set a temperature, so every one of them
 * returned 400 and fell through to its "AI not available" path. The Excel
 * import reported "Azure OpenAI / OpenAI not configured or AI call failed"
 * while being perfectly well configured — the request was simply invalid.
 *
 * WHY A RETRY RATHER THAN DELETING THE PARAMETER
 *
 * Deleting it would fix today's deployment and quietly lose determinism the
 * next time the deployment points at a model that honours temperature 0 — and
 * nobody would notice, because the symptom is subtle drift rather than an
 * error. So the first call keeps the parameter, and only a model that
 * explicitly rejects it makes us drop it. The answer is remembered for the
 * process, so the cost is one wasted request per pod, not one per call.
 */
import type OpenAI from 'openai';

/** Parameters we will strip, in the order the API complains about them. */
const TUNING_PARAMS = ['temperature', 'top_p', 'frequency_penalty', 'presence_penalty'] as const;
type TuningParam = (typeof TUNING_PARAMS)[number];

/** Parameters this deployment has already rejected. Per process, per param. */
const unsupported = new Set<TuningParam>();

/**
 * Does this error say a specific parameter is unsupported?
 *
 * Matched on the structured fields the API returns rather than the message
 * text, so a reworded message does not silently turn this back into a hard
 * failure. The message is only a fallback.
 */
export function unsupportedParam(err: unknown): TuningParam | null {
  const e = err as { status?: number; code?: string; param?: string; message?: string } | null;
  if (!e) return null;
  if (e.status !== 400) return null;

  const named = TUNING_PARAMS.find((p) => p === e.param);
  if (named && (e.code === 'unsupported_value' || e.code === 'unsupported_parameter')) return named;

  const message = String(e.message ?? '');
  if (!/unsupported|not support/i.test(message)) return null;
  return TUNING_PARAMS.find((p) => message.includes(`'${p}'`)) ?? null;
}

function without<T extends Record<string, unknown>>(params: T, drop: Iterable<TuningParam>): T {
  const copy = { ...params };
  for (const key of drop) delete copy[key];
  return copy;
}

type ChatParams = Parameters<OpenAI['chat']['completions']['create']>[0];

/**
 * `client.chat.completions.create`, minus the parameters this deployment will
 * not accept. Any other error is rethrown untouched — an auth failure or a
 * rate limit must still look like what it is.
 */
export async function createChatCompletion(
  client: OpenAI,
  params: ChatParams,
): Promise<Awaited<ReturnType<OpenAI['chat']['completions']['create']>>> {
  let attempt = without(params as Record<string, unknown>, unsupported) as ChatParams;

  for (;;) {
    try {
      return await client.chat.completions.create(attempt);
    } catch (err) {
      const param = unsupportedParam(err);
      // Only retry when we learn something new; otherwise we would loop on a
      // model that rejects a parameter we have already removed.
      if (!param || unsupported.has(param)) throw err;
      unsupported.add(param);
      attempt = without(attempt as Record<string, unknown>, [param]) as ChatParams;
    }
  }
}

/** Test seam — forget what we learned about this deployment. */
export function resetUnsupportedParams(): void {
  unsupported.clear();
}
