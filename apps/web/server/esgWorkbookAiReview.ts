/**
 * The server half of the ESG workbook's AI review.
 *
 * The grounding is built HERE, from the workbook the request was just
 * authorised against, its provenance record, and the stored readings of the
 * documents filed under the company in the library. The browser sends nothing
 * about workbook content, so nothing it claims can reach the prompt.
 *
 * Order of work, cheapest first:
 *   1. the free rules over the filed documents (`buildEsgLibraryRuleFills`):
 *      bills whose site and month are certain, company-wide sums, the group
 *      statement check, bills that span two months;
 *   2. ONE model call over what is left, capped at MAX_ESG_REVIEW_TARGETS
 *      open cells — none at all when nothing is left;
 *   3. every model answer re-checked by `verifyEsgAiReviewReply`: a value the
 *      workbook and documents cannot support becomes a question, never a fill.
 *
 * Nothing is written. The browser applies the fills the user accepts through
 * the ordinary section save.
 */
import type { Request, Response } from "express";
import OpenAI, { AzureOpenAI } from "openai";
import { createLogger } from "./logger";
import { createChatCompletion } from "./openaiCompat";
import {
  buildEsgAiReviewGrounding,
  buildEsgAiReviewMessages,
  buildEsgLibraryRuleFills,
  esgLibraryDocumentFromRun,
  parseEsgAiReviewReply,
  verifyEsgAiReviewReply,
  type EsgLibraryDocument,
} from "../src/lib/esg/esgAiReviewModel";
import type { EsgWorkbookLike } from "../src/lib/esg/esgAiReviewFill";

const logger = createLogger("EsgWorkbookAiReview");

/** The part of an OpenAI client the review uses — a stub in tests. */
export type EsgReviewModelClient = Pick<OpenAI, "chat">;
export type EsgReviewModel = { client: EsgReviewModelClient; model: string };

let modelOverride: (() => EsgReviewModel | null) | null = null;
let libraryOverride: ((companyId: string) => Promise<EsgLibraryDocument[]>) | null = null;

/** Test seam: replace the model (a stub — tests never call a paid model). */
export function setEsgReviewModelForTests(factory: (() => EsgReviewModel | null) | null): void {
  modelOverride = factory;
}

/** Test seam: replace the library read. */
export function setEsgReviewLibraryForTests(reader: ((companyId: string) => Promise<EsgLibraryDocument[]>) | null): void {
  libraryOverride = reader;
}

/** Same client precedence as every other AI surface: the Azure fast deployment, then OpenAI. */
function getReviewModel(): EsgReviewModel | null {
  if (modelOverride) return modelOverride();
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
    return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), model: process.env.OPENAI_MODEL || "gpt-4o-mini" };
  }
  return null;
}

/** The library lives on apps/api; the caller's own session reads it, so its scoping applies. */
const API_BASE = process.env.API_SERVER_URL || "http://127.0.0.1:3000";
const MAX_LIBRARY_DOCUMENTS = 25;
const LIBRARY_TIMEOUT_MS = 15_000;

async function getJson(path: string, cookie: string | undefined, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(new URL(path, API_BASE), {
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
    signal,
  });
  if (!res.ok) throw new Error(`library ${res.status}`);
  return res.json();
}

/**
 * The documents filed under the company, each as its latest stored reading.
 * A library that cannot be reached gives no documents, not an error: the
 * review still works from the workbook and its provenance.
 */
export async function loadEsgReviewLibrary(req: Request, companyId: string): Promise<EsgLibraryDocument[]> {
  if (libraryOverride) return libraryOverride(companyId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIBRARY_TIMEOUT_MS);
  try {
    const cookie = typeof req.headers.cookie === "string" ? req.headers.cookie : undefined;
    const list = (await getJson(
      `/api/parser-documents?entityId=${encodeURIComponent(companyId)}&limit=${MAX_LIBRARY_DOCUMENTS}`,
      cookie,
      controller.signal,
    )) as { documents?: Array<{ id?: string; filename?: string; documentType?: string | null; latestRunId?: string | null }> };
    const docs = (list.documents ?? []).filter((d) => d.id && d.filename && d.latestRunId);
    const out: EsgLibraryDocument[] = [];
    for (const d of docs) {
      try {
        const detail = (await getJson(`/api/parser-documents/${encodeURIComponent(d.id!)}`, cookie, controller.signal)) as {
          latestRun?: { parserOutput?: unknown } | null;
        };
        if (!detail.latestRun?.parserOutput) continue;
        out.push(esgLibraryDocumentFromRun({ id: d.id!, filename: d.filename!, documentType: d.documentType ?? null }, detail.latestRun.parserOutput));
      } catch (err) {
        logger.warn("A library document could not be read for the ESG review", { reason: (err as Error).message });
      }
    }
    return out;
  } catch (err) {
    logger.warn("The library could not be read for the ESG review", { reason: (err as Error).message });
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Answer one review request for an authorised ESG workbook. */
export async function respondWithEsgAiReview(
  workbook: EsgWorkbookLike,
  library: EsgLibraryDocument[],
  res: Response,
  options: { companyName?: string } = {},
): Promise<void> {
  const rules = buildEsgLibraryRuleFills(workbook, library);
  const exclude = new Set<string>([
    ...rules.proposals.map((p) => p.key),
    ...rules.questions.map((q) => q.key).filter((k): k is string => Boolean(k)),
  ]);
  const grounding = buildEsgAiReviewGrounding(workbook, library, {
    companyName: options.companyName,
    exclude,
    unresolved: rules.unresolved,
  });
  const notes = [...rules.notes];
  if (library.length === 0) {
    notes.push("No documents are filed under this company in the library, so there was nothing to read the rest from.");
  }

  const base = {
    documents: library.length,
    notes,
    truncated: grounding.truncated,
  };

  if (grounding.targets.length === 0) {
    // Nothing the rules left open — no call, no cost.
    res.json({ ...base, proposals: rules.proposals, questions: rules.questions, considered: 0, rejected: 0, modelCalls: 0 });
    return;
  }

  const ai = getReviewModel();
  if (!ai) {
    // The free rules still stand.
    res.status(rules.proposals.length + rules.questions.length > 0 ? 200 : 503).json({
      ...base,
      proposals: rules.proposals,
      questions: rules.questions,
      considered: 0,
      rejected: 0,
      modelCalls: 0,
      error: "The AI review is not configured on this server.",
    });
    return;
  }

  try {
    const completion = await createChatCompletion(ai.client as OpenAI, {
      model: ai.model,
      temperature: 0,
      // Reasoning-family deployments spend their thinking from this budget too.
      max_tokens: 6000,
      messages: buildEsgAiReviewMessages(grounding),
    });
    const reply =
      (completion as { choices?: Array<{ message?: { content?: string | null } }> }).choices?.[0]?.message?.content ?? "";
    const verified = verifyEsgAiReviewReply(workbook, grounding, parseEsgAiReviewReply(reply));
    const usage = (completion as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
    logger.info("ESG AI review", {
      documents: library.length,
      targets: grounding.targets.length,
      ruleFills: rules.proposals.length,
      proposed: verified.proposals.length,
      rejected: verified.rejected,
      questions: verified.questions.length,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
    });
    const taken = new Set(rules.proposals.map((p) => p.key));
    res.json({
      ...base,
      proposals: [...rules.proposals, ...verified.proposals.filter((p) => !taken.has(p.key))],
      questions: [...rules.questions, ...verified.questions],
      considered: grounding.targets.length,
      rejected: verified.rejected,
      modelCalls: 1,
    });
  } catch (err) {
    logger.error("ESG AI review call failed", err);
    res.status(502).json({ ...base, proposals: rules.proposals, questions: rules.questions, error: "The AI review is unavailable right now." });
  }
}
