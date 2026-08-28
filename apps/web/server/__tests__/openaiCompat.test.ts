/**
 * The retry that keeps AI working when the deployment refuses a parameter.
 *
 * The production deployment is labelled "gpt-4o" but is backed by a model that
 * rejects `temperature`, so every AI call in the web server returned 400 and
 * fell through to its "AI unavailable" path — the Excel import told users the
 * service was not configured when it was configured perfectly well.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatCompletion, resetUnsupportedParams, unsupportedParam } from "../openaiCompat";

/** The shape the OpenAI SDK throws for a rejected parameter. */
function apiError(over: Record<string, unknown> = {}) {
  return Object.assign(new Error("Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported."), {
    status: 400,
    code: "unsupported_value",
    param: "temperature",
    ...over,
  });
}

const clientWith = (create: ReturnType<typeof vi.fn>) =>
  ({ chat: { completions: { create } } }) as never;

beforeEach(() => resetUnsupportedParams());

describe("recognising a rejected parameter", () => {
  it("matches on the structured fields, not the prose", () => {
    expect(unsupportedParam(apiError())).toBe("temperature");
  });

  it("falls back to the message when the code is missing", () => {
    expect(unsupportedParam(apiError({ code: undefined, param: undefined }))).toBe("temperature");
  });

  it("ignores errors that are not about a parameter", () => {
    expect(unsupportedParam(apiError({ status: 429, code: "rate_limit_exceeded", param: undefined, message: "Too many requests" }))).toBeNull();
    expect(unsupportedParam(apiError({ status: 401, code: "invalid_api_key", param: undefined, message: "Unauthorized" }))).toBeNull();
    expect(unsupportedParam(null)).toBeNull();
  });
});

describe("createChatCompletion", () => {
  it("passes the call straight through when the model accepts it", async () => {
    const create = vi.fn().mockResolvedValue({ ok: true });
    await createChatCompletion(clientWith(create), { model: "m", messages: [], temperature: 0 } as never);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toHaveProperty("temperature", 0);
  });

  it("retries without the parameter the model rejected", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(apiError())
      .mockResolvedValueOnce({ ok: true });

    const result = await createChatCompletion(
      clientWith(create),
      { model: "m", messages: [], temperature: 0 } as never,
    );

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).not.toHaveProperty("temperature");
    // Everything else must survive the retry — dropping response_format would
    // turn a JSON contract into prose and break every caller that parses it.
    expect(create.mock.calls[1][0]).toHaveProperty("model", "m");
  });

  it("remembers, so the second call costs nothing extra", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(apiError())
      .mockResolvedValue({ ok: true });
    const client = clientWith(create);

    await createChatCompletion(client, { model: "m", messages: [], temperature: 0 } as never);
    create.mockClear();

    await createChatCompletion(client, { model: "m", messages: [], temperature: 0 } as never);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).not.toHaveProperty("temperature");
  });

  it("rethrows anything that is not a rejected parameter", async () => {
    const create = vi.fn().mockRejectedValue(apiError({ status: 401, code: "invalid_api_key", param: undefined, message: "Unauthorized" }));
    await expect(
      createChatCompletion(clientWith(create), { model: "m", messages: [] } as never),
    ).rejects.toThrow(/Unauthorized/);
    // An auth failure must NOT be retried into looking like a parameter problem.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("gives up rather than looping when the same parameter is rejected twice", async () => {
    // Defensive: if the API kept naming a parameter we had already removed, a
    // naive retry loop would spin forever against a paid endpoint.
    const create = vi.fn().mockRejectedValue(apiError());
    await expect(
      createChatCompletion(clientWith(create), { model: "m", messages: [], temperature: 0 } as never),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("strips several parameters when the model rejects them one at a time", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(apiError())
      .mockRejectedValueOnce(apiError({ param: "top_p", message: "Unsupported value: 'top_p' is not supported with this model." }))
      .mockResolvedValueOnce({ ok: true });

    await createChatCompletion(
      clientWith(create),
      { model: "m", messages: [], temperature: 0, top_p: 0.5 } as never,
    );

    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[2][0]).not.toHaveProperty("temperature");
    expect(create.mock.calls[2][0]).not.toHaveProperty("top_p");
  });

  it("renames max_tokens when the model demands max_completion_tokens — never drops the cap", async () => {
    // The reasoning-family deployments reject max_tokens outright. Removing it
    // (the temperature strategy) would uncap the reply on our bill; the fix is
    // a RENAME, keeping the same limit under the name the model accepts.
    const create = vi.fn()
      .mockRejectedValueOnce(apiError({
        param: "max_tokens",
        code: "unsupported_parameter",
        message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
      }))
      .mockResolvedValueOnce({ ok: true });

    await createChatCompletion(
      clientWith(create),
      { model: "m", messages: [], max_tokens: 700 } as never,
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).not.toHaveProperty("max_tokens");
    expect(create.mock.calls[1][0]).toHaveProperty("max_completion_tokens", 700);
  });

  it("remembers the rename, so later calls translate up front", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(apiError({
        param: "max_tokens",
        code: "unsupported_parameter",
        message: "Use 'max_completion_tokens' instead.",
      }))
      .mockResolvedValue({ ok: true });

    await createChatCompletion(clientWith(create), { model: "m", messages: [], max_tokens: 700 } as never);
    await createChatCompletion(clientWith(create), { model: "m", messages: [], max_tokens: 500 } as never);

    expect(create).toHaveBeenCalledTimes(3); // 1 failed + 1 retry + 1 clean
    expect(create.mock.calls[2][0]).toHaveProperty("max_completion_tokens", 500);
    expect(create.mock.calls[2][0]).not.toHaveProperty("max_tokens");
  });
});
