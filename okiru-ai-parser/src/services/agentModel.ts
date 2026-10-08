/**
 * The tool-calling conversation shape the agent-loop extractor speaks.
 *
 * Kept apart from aiExtraction.ts so the single-prompt extraction model stays
 * exactly as it was: `ExtractionModel.completeWithTools` is optional, and only
 * the agent loop (agentExtraction.ts) and the cassette (modelCassette.ts) use
 * these types.
 *
 * The shapes are the chat-completions wire format, so a transcript can be sent
 * as-is and the assistant message the model returned can be passed back
 * VERBATIM (tool_calls included) — the API rejects a tool result whose
 * tool_call_id does not answer a call in the message before it.
 */
import { fetchAzureWithRetry } from './azureRetry.js';

export type AgentContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface AgentToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AgentAssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: AgentToolCall[];
}

export type AgentMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | AgentContentPart[] }
  | AgentAssistantMessage
  | { role: 'tool'; tool_call_id: string; content: string };

export interface AgentTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AgentUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** One model turn: the assistant message, and what it cost when the API said. */
export interface AgentTurn {
  message: AgentAssistantMessage;
  usage?: AgentUsage;
  finish_reason?: string;
}

/** One named tool the model must call this turn (the agent's forced final submit). */
export interface AgentNamedToolChoice {
  type: 'function';
  function: { name: string };
}

export interface AgentCallOptions {
  /**
   * 'required' on every agent turn: with 'auto' the deployment sometimes
   * announces an action as prose and stops, which would end a run without a
   * submit. The loop only ends through its submit tool. A named tool forces
   * that one call (the last turn of a run that has not submitted).
   */
  toolChoice?: 'required' | 'auto' | AgentNamedToolChoice;
  /** Reasoning effort; 'off' omits the parameter. */
  effort?: string;
  /** Output ceiling for one turn (reasoning tokens included). */
  maxCompletionTokens?: number;
  /**
   * Cancels the request and any 429 retries still waiting (a run that timed
   * out, or a client that went away). Never part of a cassette key.
   */
  signal?: AbortSignal;
}

/** The reasoning effort agent turns run at: PARSER_AGENT_REASONING_EFFORT, default low. */
export function agentReasoningEffort(env: NodeJS.ProcessEnv = process.env): string {
  return env.PARSER_AGENT_REASONING_EFFORT?.trim() || 'low';
}

/**
 * Build the Azure chat-completions tool call. Same endpoint, deployment and
 * 429-aware retry as the single-prompt calls; no `response_format` (the answer
 * arrives through a tool) and no `temperature` (the deployment rejects it).
 */
export function azureCompleteWithTools(
  url: string,
  apiKey: string,
  defaultEffort: string,
): (messages: AgentMessage[], tools: AgentTool[], options?: AgentCallOptions) => Promise<AgentTurn> {
  return async (messages, tools, options = {}) => {
    const effort = options.effort ?? defaultEffort;
    const response = await fetchAzureWithRetry(url, {
      method: 'POST',
      ...(options.signal ? { signal: options.signal } : {}),
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        messages,
        tools,
        tool_choice: options.toolChoice ?? 'required',
        ...(options.maxCompletionTokens ? { max_completion_tokens: options.maxCompletionTokens } : {}),
        ...(effort && effort !== 'off' ? { reasoning_effort: effort } : {}),
      }),
    });
    if (!response.ok) {
      // The status only: the response body can echo the request (document
      // text) and this message travels further than the server log.
      throw new Error(`Azure agent turn failed: ${response.status}`);
    }
    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: AgentToolCall[] }; finish_reason?: string }>;
      usage?: AgentUsage;
    };
    const choice = body.choices?.[0];
    const message: AgentAssistantMessage = {
      role: 'assistant',
      content: choice?.message?.content ?? null,
      ...(choice?.message?.tool_calls && choice.message.tool_calls.length > 0
        ? { tool_calls: choice.message.tool_calls }
        : {}),
    };
    return {
      message,
      ...(body.usage ? { usage: body.usage } : {}),
      ...(choice?.finish_reason ? { finish_reason: choice.finish_reason } : {}),
    };
  };
}
