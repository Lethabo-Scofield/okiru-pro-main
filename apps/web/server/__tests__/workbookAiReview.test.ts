/**
 * POST /api/workbook/:companyId/ai-review over the REAL route stack, with a
 * stub model. Pins the contract the browser relies on:
 *
 *  - the prompt is built from the stored workbook, never from the request body;
 *  - one model call per review, none when nothing is left open;
 *  - only fills the workbook backs come back — an invented figure is dropped
 *    and becomes a question;
 *  - the route writes nothing.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { PillarAccess } from "../pillarAccess";

// The access each request resolves to. null = no overlay (the memory-store
// default every other test here runs under).
const accessFor = vi.hoisted(() => ({ current: null as PillarAccess | null }));
vi.mock("../pillarAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../pillarAccess")>();
  return { ...actual, resolveWorkbookPillarAccess: vi.fn(async () => accessFor.current) };
});

import { registerWorkbookRoutes } from "../workbookRoutes";
import { setWorkbookReviewModelForTests } from "../workbookAiReview";
import { createClient } from "../clientsMemoryStore";
import { META_CONFLICTS_KEY } from "../../src/lib/extractionMetaKeys";

let server: http.Server;
let port = 0;

const USER = { id: "1", organizationId: null as string | null };
const COMPANY = "C-AI-REVIEW";
const EMPTY = "C-AI-REVIEW-EMPTY";
const FIN = "C-AI-REVIEW-FIN";

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use((req, _res, next) => {
    (req as any).session = { userId: USER.id, destroy: (cb?: () => void) => cb?.() };
    next();
  });
  registerWorkbookRoutes(app);
  for (const id of [COMPANY, EMPTY, FIN]) {
    createClient({ clientId: id, id, name: "Review Test Co", createdByUserId: USER.id, organizationId: null } as never);
  }
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  setWorkbookReviewModelForTests(null);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  setWorkbookReviewModelForTests(null);
  accessFor.current = null;
});

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* reported through text */
  }
  return { status: res.status, json, text };
}

/** A stub client: records what it was sent, answers with `reply`. */
function stubModel(reply: (userMessage: string) => unknown) {
  const create = vi.fn(async (params: { messages: Array<{ role: string; content: string }> }) => {
    const user = params.messages.find((m) => m.role === "user")?.content ?? "";
    return { choices: [{ message: { content: JSON.stringify(reply(user)) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
  });
  setWorkbookReviewModelForTests(() => ({ client: { chat: { completions: { create } } } as never, model: "stub" }));
  return create;
}

/** The T-id the grounding gave a cell, read back from the prompt. */
function targetId(prompt: string, needle: string): string {
  const line = prompt.split("\n").find((l) => /^T\d+ \|/.test(l) && l.includes(needle));
  if (!line) throw new Error(`no open cell matching ${needle}`);
  return line.split(" |")[0];
}
function contextId(prompt: string, needle: string): string {
  const line = prompt.split("\n").find((l) => /^C\d+ \|/.test(l) && l.includes(needle));
  if (!line) throw new Error(`no context cell matching ${needle}`);
  return line.split(" |")[0];
}

describe("POST /api/workbook/:companyId/ai-review", () => {
  it("grounds on the stored workbook, makes one call, and returns only fills the workbook backs", async () => {
    const put = await call("PUT", `/api/workbook/${COMPANY}/section/sed`, {
      rows: [
        { _id: "d1", beneficiaryName: "Riverside Learners Trust", descriptionOfSpend: "Bursary for two learners", amount: 20000, _sourceFiles: ["sed-schedule.xlsx"] },
      ],
    });
    expect(put.status).toBe(200);

    const create = stubModel((prompt) => ({
      fills: [
        {
          target: targetId(prompt, "Contribution Type"),
          value: "Grant Contribution",
          kind: "derived",
          rule: "classify",
          evidence: [contextId(prompt, "Bursary for two learners")],
          quote: "Bursary",
          reasoning: "A bursary is a grant to the learners.",
        },
        // Invented: 80% appears nowhere in the workbook.
        { target: targetId(prompt, "% Benefiting Black"), value: "80", kind: "read", reasoning: "Most learners are black." },
      ],
      questions: [],
    }));

    // Whatever the browser claims about content is ignored.
    const res = await call("POST", `/api/workbook/${COMPANY}/ai-review`, { sections: { sed: { rows: [{ _id: "x", beneficiaryName: "INJECTED" }] } } });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    const prompt = create.mock.calls[0][0].messages.find((m: { role: string }) => m.role === "user")!.content;
    expect(prompt).toContain("Riverside Learners Trust");
    expect(prompt).not.toContain("INJECTED");

    expect(res.json.modelCalls).toBe(1);
    expect(res.json.proposals).toHaveLength(1);
    expect(res.json.proposals[0]).toMatchObject({ section: "sed", rowId: "d1", column: "contributionType", value: "Grant Contribution", kind: "derived", origin: "model" });
    expect(res.json.rejected).toBe(1);
    expect(res.json.questions.some((q: { column: string }) => q.column === "percentBenefitingBlack")).toBe(true);

    // The review writes nothing.
    const after = await call("GET", `/api/workbook/${COMPANY}`);
    expect(after.json.sections.sed.rows[0].contributionType).toBeUndefined();
  });

  it("makes no call when nothing is left open", async () => {
    const create = stubModel(() => ({ fills: [], questions: [] }));
    const res = await call("POST", `/api/workbook/${EMPTY}/ai-review`, {});
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ proposals: [], modelCalls: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it("makes no paid call for a viewer, who could save none of the fills", async () => {
    const create = stubModel(() => ({ fills: [], questions: [] }));
    accessFor.current = { mode: "readOnly" };
    const res = await call("POST", `/api/workbook/${COMPANY}/ai-review`, {});
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("opens only the cells a pillar-scoped member can save", async () => {
    // Revenue the documents disagree on: an open cell on the financials, which
    // a pillar-scoped member may read but only a full member may save.
    const put = await call("PUT", `/api/workbook/${FIN}/section/financial-information`, {
      rows: [],
      meta: {
        [META_CONFLICTS_KEY]: [
          { column: "revenue", candidates: [{ value: 5_000_000, sources: ["afs.pdf"] }, { value: 4_800_000, sources: ["accounts.xlsx"] }] },
        ],
      },
    });
    expect(put.status).toBe(200);

    const create = stubModel(() => ({ fills: [], questions: [] }));
    const full = await call("POST", `/api/workbook/${FIN}/ai-review`, {});
    expect(full.json.considered).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);

    accessFor.current = { mode: "scoped", scopes: ["skills"] };
    const scoped = await call("POST", `/api/workbook/${FIN}/ai-review`, {});
    expect(scoped.status).toBe(200);
    expect(scoped.json).toMatchObject({ proposals: [], considered: 0, modelCalls: 0 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("says so when no model is configured", async () => {
    setWorkbookReviewModelForTests(() => null);
    const res = await call("POST", `/api/workbook/${COMPANY}/ai-review`, {});
    expect(res.status).toBe(503);
  });
});
