/**
 * Record and replay model calls, so an evaluation run costs nothing the second
 * time it is made.
 *
 * Scoring a parser change against a real evidence pack means running the whole
 * pipeline over it — dozens of model calls. Paying for those on every change
 * would make the score a thing people stop checking. A cassette sits between
 * the pipeline and the model: a call whose exact prompt has been seen before is
 * answered from disk; a new one goes to the model once and is kept.
 *
 * The key is the method and the full prompt text, so a code change that alters
 * what the model is asked misses the cassette and is paid for — exactly the
 * calls whose answers could have changed. Everything else replays verbatim,
 * which also makes two evaluation runs comparable: the same prompt gets the
 * same answer, rather than whatever the model says this time.
 *
 * A call that FAILED in the recorded run (a 429 storm past its retries, a
 * dropped connection) is kept too, as its error. The pipeline takes a
 * different path when a call fails — a sweep is skipped, a field is left
 * missing — so a replay that treated it as a miss would not be the recorded
 * run. Replay throws the recorded error; auto asks again, so the next paid run
 * can fill it in.
 *
 * Evaluation tooling only. Production never wraps its model in this.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractionModel } from './aiExtraction.js';
import { agentReasoningEffort, type AgentCallOptions, type AgentMessage, type AgentTool, type AgentTurn } from './agentModel.js';

/**
 * replay: answer only from disk; a miss is an error (the cassette is stale).
 * record: always ask the model and overwrite what is kept.
 * auto:   answer from disk when possible, ask the model and keep the answer when
 *         not (a call that failed last time is asked again).
 */
export type CassetteMode = 'replay' | 'record' | 'auto';

export interface CassetteStats {
  hits: number;
  recorded: number;
  /** Calls with nothing on disk to answer them (replay), or no model to ask. */
  misses: number;
  /** Calls that failed in this run and were kept as failures. */
  failed: number;
  /** Replay: calls answered with the failure the recorded run got. */
  replayedFailures: number;
}

type Method = 'complete' | 'completeHard' | 'completeReview';

interface Kept {
  method: Method | 'completeAgent';
  response?: string;
  /** completeAgent: the assistant turn (message with tool_calls, usage). */
  turn?: AgentTurn;
  error?: string;
}

/**
 * The key for one agent turn: the WHOLE transcript — system prompt, every
 * assistant message with its tool calls, every tool result, every page image —
 * plus the tool definitions and call options. A turn is only the same turn when
 * everything the model saw is the same, so a changed tool result (a reader fix
 * that alters a page's text) misses and is asked again, while an unchanged run
 * replays turn for turn.
 */
export function agentCassetteKey(messages: AgentMessage[], tools: AgentTool[], options: AgentCallOptions = {}): string {
  // What the request carries, not how it is carried: the abort signal is not
  // part of a turn; the reasoning effort IS, even when the model applies it
  // from PARSER_AGENT_REASONING_EFFORT rather than from the options.
  const { signal: _signal, ...sent } = options;
  const keyed = { ...sent, effort: sent.effort ?? agentReasoningEffort() };
  // A page image is keyed by the request that asked for it (the page number
  // is in the message text), not by its bytes: another renderer build draws
  // the same page in different bytes, and every later turn would miss.
  const stable = messages.map((message) => (message.role === 'user' && Array.isArray(message.content)
    ? { ...message, content: message.content.map((part) => (part.type === 'image_url' ? { type: 'image_url', image_url: { url: 'page-image', detail: part.image_url.detail } } : part)) }
    : message));
  return createHash('sha256').update(JSON.stringify(['completeAgent', stable, tools, keyed])).digest('hex');
}

export function withCassette(
  inner: ExtractionModel | null,
  dir: string,
  mode: CassetteMode = 'auto',
): ExtractionModel & { stats: CassetteStats } {
  mkdirSync(dir, { recursive: true });
  const stats: CassetteStats = { hits: 0, recorded: 0, misses: 0, failed: 0, replayedFailures: 0 };

  const call = (method: Method) => async (system: string, user: string): Promise<string> => {
    const key = createHash('sha256').update(JSON.stringify([method, system, user])).digest('hex');
    const file = join(dir, `${key}.json`);
    const kept = mode !== 'record' && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Kept : null;
    if (kept && typeof kept.response === 'string') {
      stats.hits += 1;
      return kept.response;
    }
    if (kept && mode === 'replay') {
      stats.replayedFailures += 1;
      throw new Error(kept.error ?? `Recorded ${method} call failed`);
    }
    if (mode === 'replay' || !inner) {
      stats.misses += 1;
      throw new Error(`Model cassette has no answer for this ${method} call (mode ${mode})`);
    }
    // An absent tier falls back exactly as the pipeline's own callers do.
    const ask = method === 'complete'
      ? inner.complete.bind(inner)
      : (inner[method]?.bind(inner) ?? inner.complete.bind(inner));
    let response: string;
    try {
      response = await ask(system, user);
    } catch (err) {
      writeFileSync(file, JSON.stringify({ method, error: (err as Error).message } satisfies Kept));
      stats.failed += 1;
      throw err;
    }
    writeFileSync(file, JSON.stringify({ method, response } satisfies Kept));
    stats.recorded += 1;
    return response;
  };

  // completeAgent: one tool-calling turn, keyed by the full transcript. Always
  // offered — a replay has no inner model and must still answer from disk.
  const completeWithTools = async (
    messages: AgentMessage[],
    tools: AgentTool[],
    options: AgentCallOptions = {},
  ): Promise<AgentTurn> => {
    const key = agentCassetteKey(messages, tools, options);
    const file = join(dir, `${key}.json`);
    const kept = mode !== 'record' && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Kept : null;
    if (kept && kept.turn) {
      stats.hits += 1;
      return kept.turn;
    }
    if (kept && mode === 'replay') {
      stats.replayedFailures += 1;
      throw new Error(kept.error ?? 'Recorded completeAgent call failed');
    }
    if (mode === 'replay' || !inner?.completeWithTools) {
      stats.misses += 1;
      throw new Error(`Model cassette has no answer for this completeAgent call (mode ${mode})`);
    }
    let turn: AgentTurn;
    try {
      turn = await inner.completeWithTools(messages, tools, options);
    } catch (err) {
      writeFileSync(file, JSON.stringify({ method: 'completeAgent', error: (err as Error).message } satisfies Kept));
      stats.failed += 1;
      throw err;
    }
    writeFileSync(file, JSON.stringify({ method: 'completeAgent', turn } satisfies Kept));
    stats.recorded += 1;
    return turn;
  };

  return {
    name: `cassette(${inner?.name ?? 'none'})`,
    complete: call('complete'),
    completeHard: call('completeHard'),
    completeReview: call('completeReview'),
    completeWithTools,
    stats,
  };
}
