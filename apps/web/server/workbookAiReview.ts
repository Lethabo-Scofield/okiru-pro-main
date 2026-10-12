/**
 * The server half of the workbook's AI review: one model call over the cells
 * the rules could not settle, and the checks that decide which of its answers
 * the user is shown.
 *
 * The grounding is built HERE, from the workbook the request was just
 * authorised against (and only the sections the caller may read). The browser
 * sends nothing about workbook content, so nothing it claims can reach the
 * prompt. The reply is verified against the same workbook by
 * `verifyAiReviewReply` before anything goes back: a value the workbook cannot
 * support becomes a question, never a fill.
 *
 * Nothing is written. The browser applies the fills the user accepts through
 * the ordinary section save, so the pillar write gate and the save path are
 * the same as for a typed value.
 *
 * COST: one chat completion per click of "Work out the rest", capped at
 * MAX_REVIEW_TARGETS open cells. The rules (free, in the browser) run first
 * and take every cell they can.
 */
import type { Response } from "express";
import OpenAI, { AzureOpenAI } from "openai";
import { createLogger } from "./logger";
import { createChatCompletion } from "./openaiCompat";
import {
  buildAiReviewGrounding,
  buildAiReviewMessages,
  parseAiReviewReply,
  verifyAiReviewReply,
} from "../src/lib/aiReviewModel";
import type { WorkbookSectionsInput } from "../src/components/workbook/workbookValidation";

const logger = createLogger("WorkbookAiReview");

/** The part of an OpenAI client the review uses — a stub in tests. */
export type ReviewModelClient = Pick<OpenAI, "chat">;
export type ReviewModel = { client: ReviewModelClient; model: string };

let override: (() => ReviewModel | null) | null = null;

/** Test seam: replace the model (a stub — tests never call a paid model). */
export function setWorkbookReviewModelForTests(factory: (() => ReviewModel | null) | null): void {
  override = factory;
}

/** Same client precedence as every other AI surface: the Azure fast deployment, then OpenAI. */
function getReviewModel(): ReviewModel | null {
  if (override) return override();
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_FAST_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT;
  if (endpoint && apiKey && deployment) {
    return {
      client: new AzureOpenAI({
        endpoint,
        apiKey,
        deployment,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
      }),
      model: deployment,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  return null;
}

/** Answer one review request for an authorised workbook's readable sections. */
export async function respondWithAiReview(
  sections: WorkbookSectionsInput,
  res: Response,
  options: { canWrite?: (section: string) => boolean } = {},
): Promise<void> {
  // Only cells the caller can save are open cells: a pillar-scoped member's
  // review never pays for fills in another pillar's section.
  const grounding = buildAiReviewGrounding(sections, undefined, { canWrite: options.canWrite });
  if (grounding.targets.length === 0) {
    // Nothing the rules left open — no call, no cost.
    res.json({ proposals: [], questions: [], considered: 0, rejected: 0, truncated: 0, modelCalls: 0 });
    return;
  }

  const ai = getReviewModel();
  if (!ai) {
    res.status(503).json({ error: "The AI review is not configured on this server." });
    return;
  }

  try {
    const completion = await createChatCompletion(ai.client as OpenAI, {
      model: ai.model,
      temperature: 0,
      // Reasoning-family deployments spend their thinking from this budget too.
      max_tokens: 6000,
      messages: buildAiReviewMessages(grounding),
    });
    const reply =
      (completion as { choices?: Array<{ message?: { content?: string | null } }> }).choices?.[0]?.message?.content ?? "";
    const verified = verifyAiReviewReply(sections, grounding, parseAiReviewReply(reply));
    const usage = (completion as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
    logger.info("AI review", {
      targets: grounding.targets.length,
      proposed: verified.proposals.length,
      rejected: verified.rejected,
      questions: verified.questions.length,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
    });
    res.json({
      proposals: verified.proposals,
      questions: verified.questions,
      considered: grounding.targets.length,
      rejected: verified.rejected,
      truncated: grounding.truncated,
      modelCalls: 1,
    });
  } catch (err) {
    logger.error("AI review call failed", err);
    res.status(502).json({ error: "The AI review is unavailable right now." });
  }
}
